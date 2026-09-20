"""Experimental RIFE -> common-topology contour fit for the small SVG demo.

The runner is shared with the production offline morph generator. The contour
fitter below remains demo-only. Endpoint geometry stays exact; images are references.
"""
import hashlib
import time
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

MODEL_SHA256='0f9f5d969d5221db40a30cc1c4ca9e66d34a408d8bdf146256121ed0304a25a6'
SKIN=np.array([247,231,221],dtype=np.float64)

def curve(points, count=201):
    p=np.asarray(points,dtype=float).reshape(4,2);u=np.linspace(0,1,count)[:,None]
    return (1-u)**3*p[0]+3*(1-u)**2*u*p[1]+3*(1-u)*u**2*p[2]+u**3*p[3]

def render_demo(points,kind,scale=3):
    """Rasterize the same demo geometry onto skin before RGB interpolation."""
    p=np.asarray(points,dtype=float).reshape(7,2)
    outline=np.concatenate([curve(p[:4]),curve(p[3:])])
    polygon=[tuple(v*scale) for v in outline]
    size=(240*scale,220*scale);im=Image.new('RGB',size,tuple(SKIN.astype(int)))
    mask=Image.new('L',size);ImageDraw.Draw(mask).polygon(polygon,fill=255)
    art=Image.new('RGB',size,'#fffdf8' if kind=='eye' else '#783d4c');draw=ImageDraw.Draw(art)
    def ellipse(box,color):draw.ellipse(tuple(v*scale for v in box),fill=color)
    if kind=='eye':
        ellipse((95,70,151,148),'#cb894b');ellipse((112,82,136,138),'#503c37');ellipse((104,79,120,99),'white')
    else:
        teeth=np.concatenate([np.array([[30,72],[210,72],[210,109]]),curve([[210,109],[150,119],[90,119],[30,109]])])
        draw.polygon([tuple(v*scale) for v in teeth],fill='#fff7ed');ellipse((78,141,172,201),'#d98d97')
    im.paste(art,(0,0),mask)
    ImageDraw.Draw(im).line(polygon,fill='#3e343a' if kind=='eye' else '#59363f',width=(4 if kind=='eye' else 3)*scale,joint='curve')
    return im.resize((240,220),Image.Resampling.LANCZOS)

class RifeRunner:
    def __init__(self,model,with_alpha=False):
        data=model.read_bytes()
        if hashlib.sha256(data).hexdigest()!=MODEL_SHA256:
            raise ValueError('Expected the audited PachiPakuGen Practical-RIFE v4.9.2 ONNX model.')
        import onnxruntime as ort
        options=ort.SessionOptions();options.intra_op_num_threads=4
        self.with_alpha=with_alpha
        if with_alpha:
            from .rife_alpha import with_alpha_output
            data=with_alpha_output(data)
        self.session=ort.InferenceSession(data,sess_options=options,providers=['CPUExecutionProvider'])

    def interpolate(self,start,end,at):
        if start.size!=end.size or not np.isfinite(at) or not 0<=at<=1:raise ValueError('Invalid image dimensions or interpolation position.')
        if start.mode!='RGB' or end.mode!='RGB':raise ValueError('Composite onto the shared background before RIFE; transparent images are not accepted.')
        if at in (0,1):return (start if at==0 else end).copy(),0.
        w,h=start.size;pw=(w+63)//64*64;ph=(h+63)//64*64
        def tensor(image):
            a=np.zeros((1,3,ph,pw),dtype=np.float32)
            a[0,:,:h,:w]=np.asarray(image.convert('RGB'),dtype=np.float32).transpose(2,0,1)/255
            return a
        before=time.perf_counter()
        inputs={'img0':tensor(start),'img1':tensor(end),'timestep':np.array([at],dtype=np.float32)}
        if self.with_alpha:inputs.update(svg_alpha0=np.ones((1,1,ph,pw),dtype=np.float32),svg_alpha1=np.ones((1,1,ph,pw),dtype=np.float32))
        out=self.session.run(['output'],inputs)[0]
        elapsed=time.perf_counter()-before
        rgb=np.clip(out[0,:,:h,:w].transpose(1,2,0)*255,0,255).round().astype(np.uint8)
        return Image.fromarray(rgb),elapsed

    def interpolate_rgba(self,start,end,at):
        if not self.with_alpha or start.mode!='RGBA' or end.mode!='RGBA' or start.size!=end.size or not np.isfinite(at) or not 0<=at<=1:
            raise ValueError('Invalid RGBA interpolation request')
        if at in (0,1):return (start if at==0 else end).copy()
        w,h=start.size;pw=(w+63)//64*64;ph=(h+63)//64*64
        background=np.array([128,255,128],dtype=np.float32)/255
        inputs={'timestep':np.array([at],dtype=np.float32)}
        for i,image in enumerate((start,end)):
            rgba=np.asarray(image,dtype=np.float32)/255;alpha=rgba[:,:,3:4]
            rgb=rgba[:,:,:3]*alpha+background*(1-alpha)
            color=np.zeros((1,3,ph,pw),dtype=np.float32);color[0,:,:h,:w]=rgb.transpose(2,0,1)
            mask=np.zeros((1,1,ph,pw),dtype=np.float32);mask[0,0,:h,:w]=alpha[:,:,0]
            inputs['img'+str(i)]=color;inputs['svg_alpha'+str(i)]=mask
        rgb,alpha=self.session.run(['output','svg_alpha_output'],inputs)
        alpha=np.clip(alpha[0,0,:h,:w],0,1);rgb=rgb[0,:,:h,:w].transpose(1,2,0)
        color=np.clip((rgb-background*(1-alpha[:,:,None]))/np.maximum(alpha[:,:,None],1/255),0,1)
        alpha[alpha<4/255]=0
        rgba=np.concatenate([color,alpha[:,:,None]],axis=2)
        return Image.fromarray(np.round(rgba*255).astype('uint8'),'RGBA')

def fit_demo_contour(image,baseline,stroke):
    """Fit the two vertical handles; keep endpoint-derived x/corner positions.

    Deliberately limited to this flat-background, two-cubic demo. It is not an
    arbitrary character segmentation or vectorization method.
    """
    rgb=np.asarray(image.convert('RGB'),dtype=float)
    mask=np.linalg.norm(rgb-SKIN,axis=2)>22
    labels,count=ndimage.label(mask)
    if not count:raise ValueError('No contour found in the RIFE reference.')
    sizes=np.bincount(labels.ravel());sizes[0]=0;mask=labels==sizes.argmax()
    p=np.array(baseline,dtype=float);top=curve(p[:8]);bottom=curve(p[6:])[::-1]
    xs=np.arange(int(p[0]+(p[6]-p[0])*.12),int(p[6]-(p[6]-p[0])*.12))
    observed_top=[];observed_bottom=[];used=[]
    for x in xs:
        if not 0<=x<mask.shape[1]:continue
        ys=np.flatnonzero(mask[:,x])
        if len(ys)>=2:used.append(x);observed_top.append(ys.min()+stroke/2);observed_bottom.append(ys.max()-stroke/2)
    if len(used)<8:raise ValueError('Insufficient contour coverage; retain the original SVG instead.')
    errors=[]
    for shape,observed,indices in [(top,observed_top,(3,5)),(bottom,observed_bottom,(9,11))]:
        u=np.interp(used,shape[:,0],np.linspace(0,1,len(shape)))
        weight=3*u*(1-u);base=(1-u)**3*p[1]+u**3*p[7]
        observed=np.asarray(observed)
        estimate=float(np.sum(weight*(observed-base))/np.sum(weight**2))
        p[list(indices)]=estimate;errors.extend(abs(base+weight*estimate-observed))
    return p.tolist(),{'boundaryMeanErrorPx':round(float(np.mean(errors)),3),'columns':len(used)}

def generate_track(runner,track,kind):
    start=render_demo(track['frames'][0]['points'],kind);end=render_demo(track['frames'][-1]['points'],kind)
    first=np.asarray(track['frames'][0]['points']);last=np.asarray(track['frames'][-1]['points'])
    frames=[];images=[];metrics=[];previous=first.copy()
    for at in (0,.25,.5,.75,1):
        image,seconds=runner.interpolate(start,end,at);images.append(image)
        baseline=first*(1-at)+last*at
        metric={'at':at,'inferenceSeconds':round(seconds,3)}
        if at in (0,1):points=first.copy() if at==0 else last.copy()
        else:
            raw,fit=fit_demo_contour(image,baseline,4 if kind=='eye' else 3);points=np.array(raw)
            # Avoid the late blink reversal reported on the hand-authored demo.
            # These constraints are explicit postprocessing, not RIFE output.
            for i in (3,5,9,11):points[i]=np.clip(points[i],min(previous[i],last[i]),max(previous[i],last[i]))
            if points[3]>points[9]:points[[3,5]]=points[9]
            metric.update(fit,maxStabilizationPx=round(float(np.max(np.abs(points-np.array(raw)))),3))
        frames.append({'at':at,'points':np.round(points,4).tolist()});metrics.append(metric);previous=points
    return {'version':1,'commands':track['commands'],'frames':frames},images,metrics

def render_head_demo(turn):
    """Illustrative supplied poses, NOT a novel view generated by RIFE."""
    if turn not in (0,1):raise ValueError('Only the two authored endpoint poses are used in this experiment.')
    s=3;im=Image.new('RGB',(240*s,220*s),'#f2f5f9');d=ImageDraw.Draw(im)
    def ellipse(box,fill,outline=None,width=1):d.ellipse(tuple(v*s for v in box),fill=fill,outline=outline,width=width*s)
    def line(points,color,width):d.line([(x*s,y*s) for x,y in points],fill=color,width=width*s,joint='curve')
    # Same character, a frontal and a shallow three-quarter schematic pose.
    ellipse((54,18,186,198),'#514c6d')
    ellipse((100,160,145,220),'#edc4ac')
    ellipse((57,91,80,139),'#f3d6bf','#72596b',2)
    ellipse((165,91,185,138),'#f3d6bf','#72596b',2)
    face=[[70,55],[98,38],[157,38],[172,65],[184+turn*6,102],[170+turn*8,165],[125+turn*12,186],[78+turn*7,170],[59,113],[70,55]]
    d.polygon([(x*s,y*s) for x,y in face],fill='#f7e7dd');line(face,'#72596b',2)
    hair=[[64,74],[73,32],[142,27],[172,44],[178,83],[150+turn*3,66],[142+turn*5,45],[124+turn*6,85],[116+turn*8,55],[93+turn*10,90],[86,60],[64,74]]
    d.polygon([(x*s,y*s) for x,y in hair],fill='#625c80')
    for center,width in [(91+turn*10,16-turn*3),(151+turn*10,16-turn*5)]:
        ellipse((center-width,98,center+width,126),'#fffdf8','#584a62',2)
        ellipse((center-7+turn*2,99,center+7+turn*2,125),'#c18c5b')
        ellipse((center-3+turn*2,104,center+3+turn*2,122),'#4e3b47')
        ellipse((center-5,102,center,108),'white')
        line([(center-width,90),(center,86),(center+width,90)],'#62506a',2)
    nx=124+turn*17;line([(nx,119),(nx+3,136),(nx-4,139)],'#c39587',2)
    smile=curve([[109+turn*13,153],[119+turn*13,160],[130+turn*13,160],[140+turn*13,153]])
    line(smile,'#965d66',2)
    return im.resize((240,220),Image.Resampling.LANCZOS)
