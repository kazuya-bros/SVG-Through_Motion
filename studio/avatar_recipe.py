from typing import Literal
from pydantic import Field, model_validator
from .performance import Strict, Appearance

class Component(Strict):
    kind: Literal['expression','glitch','blocks','ink','dissolve','appear','comms','happy','bounce','blush','sweat','gloom','image','outline','light']
    direction: Literal['up','down','left','right'] = 'up'
    duration: float = Field(4, ge=.5, le=30)
    strength: float = Field(.7, ge=0, le=1)
    speed: float = Field(1, ge=.25, le=4)
    expression_index: int = Field(0, ge=0, le=11)

class Bundle(Strict):
    components: list[Component] = Field(default_factory=list,max_length=10)
    appearance: Appearance = Field(default_factory=Appearance)
    visibility: bool = True
    behavior: Literal['select','timed'] = 'select'

    @model_validator(mode='after')
    def compatible(self):
        kinds=[c.kind for c in self.components]
        if len(kinds)!=len(set(kinds)):raise ValueError('同じ種類の演出は1つにまとめてください')
        if len(set(kinds)&{'ink','dissolve','appear','blocks'})>1:raise ValueError('登場・消滅はどれか1つを選んでください')
        if 'image' in kinds and not self.appearance.emotion_asset_id:raise ValueError('感情画像を選んでください')
        return self
