// The three face angles use the same saved settings as playback and exports.
export function installHeadCoordination(api){
 const $=id=>document.getElementById(id),card=$('headYaw').closest('section');
 card.id='headCoordinationControls';
 card.querySelector('.tiny').textContent='顔の向きに合わせて、髪・耳・飾りも一緒に動きます。';
 const label=$('headPitch').closest('label');label.firstChild.textContent='上下（Y） ';
 const intro=card.querySelector('.tiny');intro.after($('headYawOffset').closest('label'),label,$('headRollOffset').closest('label'));
 const reset=document.createElement('button');reset.type='button';reset.className='wide';reset.textContent='正面に戻す';reset.id='headAnglesReset';
 $('headRollOffset').closest('label').after(reset,$('headIdle').closest('label'));
 const idle=document.createElement('div');idle.id='headIdleDetails';idle.hidden=true;
 for(const id of ['headYaw','headTilt'])idle.append($(id).closest('label'));
 $('pitchSwayHint').hidden=true;
 const motion=document.createElement('div');motion.id='headUnifiedMotion';
 for(const id of ['pitchSway','headNod','bodyFollow'])motion.append($(id).closest('label'));
 const depth=$('depthControls'),adjust=$('headPivotOptions');
 card.append(idle,motion,$('neckPivotPick'),depth);adjust.hidden=true;
 reset.onclick=()=>{for(const id of ['headYawOffset','headPitch','headRollOffset'])$(id).value=0;$('headYawOffset').dispatchEvent(new Event('input',{bubbles:true}));};
 function refresh(){const p=api.project();card.hidden=!p?.rig;}
 $('headIdle').addEventListener('input',refresh);refresh();return {refresh};
}
