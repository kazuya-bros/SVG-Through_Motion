// Keep the original control IDs: saved settings and runtime bindings are shared.
export function installMotionLayout(){
 const $=id=>document.getElementById(id),panel=$('tab-motion');
 const nav=panel.querySelector('[aria-label="動きの調整"]');nav.classList.add('motion-categories');
 const body=$('motion-head'),face=$('motion-iris'),hair=$('motion-hair'),extra=$('motion-extra');
 const clothes=document.createElement('div');clothes.id='motion-clothes';clothes.className='motion-page';clothes.hidden=true;extra.before(clothes);
 const expressionPage=document.createElement('div');expressionPage.id='motion-expressions';expressionPage.className='motion-page';expressionPage.hidden=true;extra.after(expressionPage);
 const reset=$('resetMotion'),actions=document.createElement('div');actions.className='motion-preset-actions';actions.append(reset);panel.prepend(actions,nav);
 const general=panel.querySelector(':scope > .control-card');
 general.querySelector('h3').textContent='体の揺れと呼吸';general.querySelector('.tiny').textContent='体全体の動きと、呼吸の大きさを調整します。';
 const expressions=document.createElement('section');expressions.className='control-card';expressions.innerHTML='<h3>まばたき・口パク</h3>';
 for(const id of ['blink','talking'])expressions.append($(id).closest('label'));
 const faceControls=body.querySelector('.control-card');faceControls.querySelector('h3').textContent='顔の向き';
 face.prepend(expressions,faceControls);
 body.append(general,$('chestMotionControls'),...extra.children);
 extra.append($('earsAccessoryControls'),$('tailMotionControls'));
 $('singleBounce').closest('section').hidden=true;
 nav.replaceChildren();
 for(const [key,label] of [['head','身体'],['iris','顔・瞳'],['hair','髪・腕'],['clothes','服・小物'],['extra','耳・尻尾・翼'],['expressions','表情']]){
  const button=document.createElement('button');button.dataset.motionPage=key;button.textContent=label;nav.append(button);
 }
 return {body,face,hair,clothes,extra};
}
