export function installImportWizard(){
  const $=id=>document.getElementById(id),form=$('importForm'),panels=[1,2,3].map(n=>$('importStep'+n));
  let step=1;
  function show(next,focus=true){
    step=next;
    panels.forEach((panel,i)=>panel.hidden=i+1!==step);
    form.querySelectorAll('[data-import-step]').forEach(button=>{
      if(+button.dataset.importStep===step)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');
    });
    $('importPrevious').hidden=step===1;$('importNext').hidden=step===3;$('hybridImport').hidden=step!==3;
    $('importNext').textContent=step===1?'次へ：ファイル選択':'次へ：SVGの仕上がり';
    $('importStepError').hidden=true;
    if(focus){const title=panels[step-1].querySelector('h2');title.focus({preventScroll:true});$('importFields').scrollIntoView({block:'start',behavior:'instant'});}
  }
  function validate(panel){
    for(const input of panel.querySelectorAll('input,select,textarea')){
      if(input.disabled)continue;
      if(input.type==='file'){
        const file=input.files[0],image=input.id==='hybridOriginal';
        input.setCustomValidity(file&&!(image?/\.(png|jpe?g|webp)$/i:/\.psd$/i).test(file.name)?(image?'元絵はPNG・JPG・WebPを選んでください。':'パーツ分けしたPSDファイルを選んでください。'):file?.size>100*1024**2?'ファイルは1つにつき100MB以下にしてください。':'');
      }
      if(!input.checkValidity()){
        show(panels.indexOf(panel)+1);
        for(let parent=input.parentElement;parent&&parent!==panel;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
        $('importStepError').textContent=input.validationMessage;$('importStepError').hidden=false;
        input.reportValidity();return false;
      }
    }
    return true;
  }
  function go(next){if(next===3&&!validate(panels[1]))return;show(next);}
  $('importPrevious').onclick=()=>show(Math.max(1,step-1));
  $('importNext').onclick=()=>go(Math.min(3,step+1));
  form.querySelectorAll('[data-import-step]').forEach(button=>button.onclick=()=>go(+button.dataset.importStep));
  form.addEventListener('submit',event=>{
    if(step!==3){event.preventDefault();event.stopImmediatePropagation();go(step+1);return;}
    for(const panel of [panels[1],panels[2]])if(!validate(panel)){event.preventDefault();event.stopImmediatePropagation();return;}
  },true);
  form.addEventListener('input',event=>{event.target.setCustomValidity?.('');$('importStepError').hidden=true;});
  show(1,false);
  return {show,get step(){return step;}};
}
