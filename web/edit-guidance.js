export function usesClosedDonor(project,step){
 const parts=project?.parts||[];
 if(step==='mouth')return parts.some(p=>p.role==='mouth'&&p.closedSource==='psd'&&p.closedSvgText);
 if(step==='eyes')return ['l','r'].every(side=>parts.some(p=>p.role==='lash-'+side&&p.closedSource==='psd'&&p.closedSvgText));
 return false;
}
export function editGuidance(project,step,adjusting=false,opening=false){
 if(step==='parts')return ['レイヤー調整','選択したレイヤー','絵の重なりや透明度を調整します。揺れは「動きをつける」で確認できます。'];
 const eye=step==='eyes',noun=eye?'目':'口';
 return [noun,adjusting?`閉じ${noun}を補正する`:eye?'瞬きを確認':'口の開閉を確認',adjusting?'気になった箇所を画面上で直し、下のスライダーで再確認します。':`作業エリアの下のスライダーを往復して、${eye?'瞬き':'口の開閉'}を見てください。自然なら、そのまま次へ。`];
}
