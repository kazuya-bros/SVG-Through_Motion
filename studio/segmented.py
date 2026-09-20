"""PSD motion parts, with original-image cutouts retained as explicit alternatives."""
import re
import numpy as np
from PIL import Image
from scipy import ndimage
from .eye_plate import psd_face_artwork


def is_eyewear(name):
    n=name.lower().replace('_','-').strip()
    return bool(re.search(r'(^|[- ])eyewear($|[- ])', n) or n in ('眼鏡', 'メガネ', 'めがね', 'サングラス'))


def is_head_accessory(name):
    n=name.lower().replace('_','-').strip()
    return bool(is_eyewear(name) or re.search(r'(^|[- ])headwear($|[- ])',n) or any(v in n for v in ('頭飾り','獣耳','けもみみ','帽子')))


def accessory_image(image):
    """Discard isolated export specks, retaining the separated accessory's alpha."""
    a=np.array(image.convert('RGBA')).copy();a[a[:,:,3]<12,3]=0
    labels,count=ndimage.label(a[:,:,3]>0)
    if count:
        sizes=np.bincount(labels.ravel());keep=sizes>=max(4,sizes[1:].max()*.002);keep[0]=False
        a[~keep[labels],3]=0
    return Image.fromarray(a)


def motion_image(image):
    """Keep antialiased artwork, discarding disconnected faint PSD export noise."""
    a=np.array(image.convert('RGBA')).copy();a[a[:,:,3]<12,3]=0
    labels,count=ndimage.label(a[:,:,3]>0)
    if count:
        sizes=np.bincount(labels.ravel())
        seed=a[:,:,3]>=max(32,float(a[:,:,3].max())*.25)
        keep=np.zeros(count+1,dtype=bool);keep[np.unique(labels[seed])]=True
        keep &= sizes>=3;keep[0]=False
        a[~keep[labels],3]=0
    return Image.fromarray(a)


def motion_group(name):
    n=name.lower().replace('_','-')
    for key in ('bottomwear','legwear','footwear','neckwear','earwear','wings'):
        if re.fullmatch(key+r'(?:[- ][lr])?',n.strip()):return key
    if re.search(r'(^|[- ])tail($|[- ])|尻尾|しっぽ',n):return 'tail'
    if re.fullmatch(r'ears?[- ]r|右耳',n):return 'human-ear-r'
    if re.fullmatch(r'ears?[- ]l|左耳',n):return 'human-ear-l'
    if 'hair' in n or '髪' in n:
        return 'front' if 'front' in n or '前' in n else 'back'
    if any(v in n for v in ('handwear','arm','腕','袖')):
        if re.search(r'[- ]r$|right|右',n): return 'arm-r'
        if re.search(r'[- ]l$|left|左',n): return 'arm-l'
    return 'core'


def split_motion_layers(plate, leaves, source_options=None, prefer_psd=True):
    h,w=plate.shape[:2]
    leaves=list(leaves)
    face_art=psd_face_artwork(leaves,(w,h)) if prefer_psd else None
    extra_names={'bottomwear':'服の裾（bottomwear）','legwear':'脚・脚の衣装（legwear）','footwear':'靴（footwear）','neckwear':'リボン・ネクタイ（neckwear）','earwear':'イヤリング（earwear）','wings':'翼（wings）'}
    groups=['core','back','arm-r','arm-l','front','human-ear-r','human-ear-l','tail',*extra_names]
    owner=np.zeros((h,w),np.uint8)
    backing={g:Image.new('RGBA',(w,h)) for g in groups}
    neck=Image.new('RGBA',(w,h))
    accessory_names={}
    positions={}
    for position,layer in enumerate(leaves):
        if not layer.is_visible(): continue
        im=layer.composite(force=True)
        if im is None: continue
        if prefer_psd:im=motion_image(im)
        accessory=is_head_accessory(layer.name)
        if accessory:im=accessory_image(im)
        canvas=Image.new('RGBA',(w,h));canvas.alpha_composite(im.convert('RGBA'),(layer.left,layer.top))
        if layer.name.strip().lower() in ('neck','首'):neck.alpha_composite(canvas)
        g=motion_group(layer.name)
        if (g=='tail' or g in extra_names) and not prefer_psd:g='core'
        if accessory:
            if not canvas.getchannel('A').getbbox():continue
            g='accessory-'+str(len(accessory_names));groups.append(g);backing[g]=Image.new('RGBA',(w,h));accessory_names[g]=layer.name
        backing[g].alpha_composite(canvas)
        positions[g]=position
        # Isolated garments retain their PSD alpha. Even their translucent edges
        # must own the source pixels, or those colors get baked into the torso.
        owner[np.array(canvas)[:,:,3]>(0 if accessory or (prefer_psd and g in extra_names) else 127)]=groups.index(g)
    if prefer_psd:
        # A single earwear class may contain both earrings. Give the two sides
        # their own attachment rather than rotating the pair about the face.
        e=np.array(backing['earwear']);core_box=backing['core'].getchannel('A').getbbox()
        middle=(core_box[0]+core_box[2])/2 if core_box else w/2
        yy,xx=np.where(e[:,:,3]>127);left=xx<middle
        if len(xx) and min(left.sum(),(~left).sum())>=max(3,len(xx)*.05) and np.mean(xx[~left])-np.mean(xx[left])>w*.1:
            for side,mask in [('l',np.arange(w)<middle),('r',np.arange(w)>=middle)]:
                key='earwear-'+side;extra_names[key]=('左' if side=='l' else '右')+'のイヤリング（earwear）'
                a=e.copy();a[:,~mask,3]=0;groups.append(key);backing[key]=Image.fromarray(a)
                positions[key]=positions['earwear']
                owner[(owner==groups.index('earwear')) & mask[None,:]]=groups.index(key)
            backing['earwear']=Image.new('RGBA',(w,h))
    solid=plate[:,:,3]>0
    layers={};metadata={};arms={}
    names={'core':'元画像（胴体・顔の下地）','back':'元画像の後ろ髪','front':'元画像の前髪','arm-r':'元画像の右腕・袖','arm-l':'元画像の左腕・袖','tail':'尻尾'}
    names.update(extra_names)
    for g in groups:
        visible=(owner==groups.index(g))&solid
        accessory=g in accessory_names
        psd_motion=g!='core' and backing[g].getchannel('A').getbbox() is not None
        if not visible.any() and not ((accessory or (prefer_psd and psd_motion)) and backing[g].getchannel('A').getbbox()): continue
        # Concealed backing comes from PSD; accessories retain their isolated PSD pixels.
        a=np.array(backing[g]) if g in ('core','back') or accessory else np.zeros_like(plate)
        if not accessory:a[~solid,3]=0
        if prefer_psd and g=='core':
            # Unowned source pixels include the old arm/hair outline and white
            # gaps. They are not torso artwork simply because no PSD owns them.
            visible &= np.array(backing[g])[:,:,3]>127
        if not accessory:a[visible]=plate[visible]
        if accessory:names[g]=('PSDの眼鏡（' if is_eyewear(accessory_names[g]) else 'PSDの頭飾り（')+accessory_names[g]+'）'
        human_ear=g.startswith('human-ear-')
        if human_ear:names[g]='人間の'+('右' if g.endswith('-r') else '左')+'耳'
        if prefer_psd and psd_motion:
            a=np.array(backing[g])
            if g in ('front','back','arm-r','arm-l'):names[g]={'front':'前髪','back':'後ろ髪','arm-r':'右腕・袖','arm-l':'左腕・袖'}[g]
        if source_options is not None and psd_motion:
            cut=np.zeros_like(plate);cut[visible]=plate[visible]
            source_options[names[g]]={'psd':backing[g].copy(),'original':Image.fromarray(cut)}
        if g=='core' and face_art is not None:
            # Face must remain a separate surface: speech must never pull the
            # neck or garment pixels that happen to share the core layer.
            face_mask=np.array(face_art)[:,:,3]>0
            a[face_mask,3]=0
            # Do not dilate this cut into the visible neck. Keep the PSD neck
            # beneath the face where movement can uncover the shared boundary.
            neck_pixels=np.array(neck)
            a[face_mask]=neck_pixels[face_mask]
            names[g]='元画像（胴体・首）'
        layers[g]=(names[g],g.removeprefix('human-') if human_ear else 'tail' if g=='tail' else 'static',Image.fromarray(a))
        metadata[names[g]]={'deformGroup':'core' if accessory or human_ear else g}
        if g in extra_names:
            if g.startswith('earwear'):metadata[names[g]]['deformGroup']='core'
            yy,xx=np.where(a[:,:,3]>127)
            if not len(yy):yy,xx=np.where(a[:,:,3]>0)
            top=yy.min();root=xx[yy<=top+max(2,(yy.max()-top)*.06)]
            metadata[names[g]].update(independentAccessory=True,sourceLayerName=g,
                pivotX=float(np.median(root)),pivotY=float(top),
                secondaryMotion=dict(enabled=False,amount=25,cycles=1,range=50))
            if g=='wings':
                metadata[names[g]].update(pivotX=float((xx.min()+xx.max())/2),pivotY=float(np.median(yy)))
        if g=='tail':
            core=np.array(backing['core'])[:,:,3]>127
            tail=a[:,:,3]>127
            if tail.any() and core.any():
                distance=ndimage.distance_transform_edt(~core)
                yy,xx=np.where(tail & (distance<=distance[tail].min()+2))
                metadata[names[g]].update(pivotX=float(np.median(xx)),pivotY=float(np.median(yy)))
        if prefer_psd and psd_motion:metadata[names[g]]['artworkSource']='psd'
        if accessory:metadata[names[g]].update(independentAccessory=True,sourceLayerName=accessory_names[g])
        if human_ear:metadata[names[g]].update(independentAccessory=True,sourceLayerName=g.replace('human-ear-','ears-'),earMotion=False)
        if g.startswith('arm-'):
            yy,xx=np.where(a[:,:,3]>127 if prefer_psd else visible)
            if not len(yy):yy,xx=np.where(a[:,:,3]>0)
            top=yy.min();shoulder=xx[yy<top+max(4,h*.025)]
            arms[g]={'x':float(np.median(shoulder)), 'y':float(top)}
    # Use ownership in actual sleeve/torso overlaps, not a character-specific
    # ordering. Some PSDs put sleeves over clothing; others tuck them under it.
    arm_groups=[g for g in ('arm-r','arm-l') if g in layers]
    behind=[]
    for g in arm_groups:
        overlap=(np.array(backing[g])[:,:,3]>127)&(np.array(backing['core'])[:,:,3]>127)
        if ((owner==groups.index('core'))&overlap).sum()>((owner==groups.index(g))&overlap).sum():behind.append(g)
    order=['tail','back',*behind,'human-ear-r','human-ear-l','core',*[g for g in arm_groups if g not in behind]] if prefer_psd else ['back','core','arm-r','arm-l','human-ear-r','human-ear-l']
    if prefer_psd:
        # Place each extra surface relative to the torso using actual PSD
        # overlap ownership; a scarf can be tucked under or laid over clothes.
        below=[];above=[]
        for g in sorted(extra_names,key=lambda key:positions.get(key,-1)):
            if g not in layers:continue
            overlap=(np.array(backing[g])[:,:,3]>127)&(np.array(backing['core'])[:,:,3]>127)
            under=((owner==groups.index('core'))&overlap).sum()>((owner==groups.index(g))&overlap).sum()
            (below if under or g=='wings' else above).append(g)
        # Preserve PSD order among garments too (e.g. shorts over legwear).
        at=order.index('core')
        order[at:at+1]=below+['core']+above
    leading=[layers[g] for g in order if g in layers]
    if face_art is not None:
        name='Face（顔の下地）'
        face_index=next((i+1 for i,v in enumerate(leading) if v[0]==names['core']),len(leading))
        leading.insert(face_index,(name,'static',face_art))
        metadata[name]={'deformGroup':'core','faceBase':True,'sourceLayerName':'face'}
    leading.extend(layers[g] for g in accessory_names if g in layers)
    trailing=[layers['front']] if 'front' in layers else []
    return leading,trailing,metadata,arms
