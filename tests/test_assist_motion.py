import unittest
from studio.control import AssistCommand

class AssistMotionTests(unittest.TestCase):
    def test_motion_requires_revision_and_accepts_only_motion_settings(self):
        base=dict(operation='motion',operation_id='one',session_id='a'*8+'-'+'a'*4+'-'+'a'*4+'-'+'a'*4+'-'+'a'*12,revision=0)
        AssistCommand(**base,settings=dict(sway=.3,blink=True,hairMethod='spring',springCycles=2,irisGaze='natural'))
        for pattern in ('twitch','double','alternate','droop'):
            AssistCommand(**base,settings=dict(earPattern=pattern,earCycles=6,ears=30))
        AssistCommand(**base,settings=dict(sway=12,headTilt=8,headNod=6,frontHair=40,backHair=70,armSwing=10,irisX=20,irisScale=10,irisCycles=4,singleBounce=True,bounceHeight=160))
        for settings in ({'irisCycles':1.5},{'bounceCount':2.5},{'irisScale':11},{'earPattern':'unknown'},{'earCycles':1.5},{'earCycles':7}):
            with self.assertRaises(ValueError):AssistCommand(**base,settings=settings)
        for settings in ({'engine':'browser'},{'voice':'x'},{'api_key':'x'},{'background':'white'},{'sway':True},{'sway':'1'},{'springCycles':1.5},{'sway':float('nan')},{}):
            with self.assertRaises(ValueError):AssistCommand(**base,settings=settings)
        with self.assertRaises(ValueError):AssistCommand(**{k:v for k,v in base.items() if k!='revision'},settings={'sway':1})
        with self.assertRaises(ValueError):AssistCommand(operation='start',operation_id='one',settings={'sway':1})
