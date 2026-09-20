import unittest
from pydantic import ValidationError
from studio.control import Command
class LayerEditTests(unittest.TestCase):
    def test_stroke_and_inspect(self):
        Command(action='layer_edit',layer_edit={'operation':'inspect'})
        Command(action='layer_edit',layer_edit={'operation':'stroke','expected_revision':'a'*64,'part_id':'p000','mode':'erase','color':'#000000','size':12,'points':[[1,2],[3,4]]})
    def test_missing_revision_invalid_coordinate_and_missing_target(self):
        for c in [dict(operation='merge',part_id='p000',other_id='p001'),dict(operation='pivot',part_id='p000',expected_revision='a'*64,x=float('nan'),y=4),dict(operation='target',expected_revision='a'*64,kind='tail')]:
            with self.assertRaises(ValidationError):Command(action='layer_edit',layer_edit=c)
    def test_both_ears(self):
        Command(action='layer_edit',layer_edit={'operation':'target','expected_revision':'b'*64,'kind':'ear','target':'both'})
        with self.assertRaises(ValidationError):Command(action='layer_edit',layer_edit={'operation':'target','expected_revision':'b'*64,'kind':'wing','target':'both'})
    def test_secondary_motion(self):
        Command(action='layer_edit',layer_edit={'operation':'secondary','expected_revision':'c'*64,'part_id':'p001','secondary':{'enabled':True,'amount':60,'direction':'diag-down','region':{'cx':.5,'cy':.8,'rx':.2,'ry':.1}}})
        for settings in [{'cycles':1.5},{'amount':101},{'region':{'cx':3}},{'enabled':1},{'direction':'sideways'}]:
            with self.assertRaises(ValidationError):Command(action='layer_edit',layer_edit={'operation':'secondary','expected_revision':'c'*64,'part_id':'p001','secondary':settings})
    def test_all_targets(self):
        for kind in ('ear','tail','wing'):
            for target in ('auto','none','p021'):
                Command(action='layer_edit',layer_edit={'operation':'target','expected_revision':'b'*64,'kind':kind,'target':target})
if __name__=='__main__':unittest.main()
