import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from studio import material_inference as inference, materials as m


class DepthPreparationTest(unittest.TestCase):
    def test_corrected_parts_and_depth_keep_canvas_alignment(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);state=dict(id='a'*32,revision=2,width=64,height=64,layers=[])
            m.add_image(root,state,Image.new('RGBA',(24,32),'pink'),'face','face',20,8)
            face=state['layers'][0]
            m.add_image(root,state,Image.new('RGBA',(8,8),'red'),'repair','static',22,10)
            state['layers'][1].update(parent=face['id'],repair=True)
            m.add_image(root,state,Image.new('RGBA',(40,20),'white'),'hair','front hair',12,4)
            dest=root/'depth';groups,mapping=inference.prepare_depth(root,state,dest)
            self.assertEqual(set(groups),{'face','front hair'})
            self.assertEqual(groups['face'].getpixel((23,11)),(255,0,0,255))
            for tag,value in [('face',140),('front hair',110)]:Image.new('L',(64,64),value).save(dest/(tag+'_depth.png'))
            depth=inference.collect_depth(groups,mapping,dest,state)
            self.assertEqual(depth['signature'],inference.signature(state))
            self.assertAlmostEqual(depth['field']['median'],140/255,places=5)
            self.assertEqual(len(depth['field']['values']),65*65)
            self.assertAlmostEqual(depth['partValues'][face['id']],140/255,places=5)
            face['name']='renamed';face['locked']=True
            self.assertEqual(depth['signature'],inference.signature(state))
            face['x']+=1
            self.assertNotEqual(depth['signature'],inference.signature(state))

    def test_missing_runtime_does_not_trigger_download(self):
        with tempfile.TemporaryDirectory() as temp,patch.object(inference,'runtime_root',return_value=Path(temp)):
            result=inference.status()
            self.assertFalse(result['ready'])
            self.assertIn('未準備',result['message'])


if __name__=='__main__':unittest.main()
