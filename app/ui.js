'use strict';
const $=id=>document.getElementById(id);
const fields=['input','good','defect','mode','startAtLogin','expectedPads','stableSeconds','sens','area','inset','pol','padsens','sameSize','largeDark','maskMarkers','minpad','maxpad','contrast','roiMode','roiX','roiY','roiW','roiH','approved'];
const numeric=new Set(['expectedPads','stableSeconds','sens','area','inset','padsens','minpad','maxpad','contrast','roiX','roiY','roiW','roiH']);
const detection=new Set(['expectedPads','sens','area','inset','pol','padsens','sameSize','largeDark','maskMarkers','minpad','maxpad','contrast','roiMode','roiX','roiY','roiW','roiH']);
const statuses={SIMULATED:'測試／未複製',COPIED:'已複製',ALREADY_PRESENT:'已有相同檔案',REVIEW:'需要人工複核',CONFLICT:'已擱置：檔名衝突',RETRY:'等待重試',ERROR:'處理失敗',PROCESSING:'尚未完成'};
let state,dirty=false,approvedHash='',toastTimer,previewBusy=false,lastPreview=null,resetBusy=false,resultEpoch=0;
function toast(message,error=false){$('toast').textContent=message;$('toast').className=error?'error':'';$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,error?12000:5000);}
async function call(promise){const r=await promise;if(!r.ok)throw Error(r.error);return r.value;}
function readForm(){const c={...state.config,approvedHash};for(const k of fields)c[k]=$(k).type==='checkbox'?$(k).checked:numeric.has(k)?+$(k).value:$(k).value.trim();return c;}
function updateArea(){$('roiFields').hidden=$('roiMode').value!=='rect';$('sensValue').textContent=$('sens').value;}
function fill(c){for(const k of fields)if($(k).type==='checkbox')$(k).checked=c[k];else $(k).value=c[k];approvedHash=c.approvedHash||'';dirty=false;updateArea();}
function changed(event){dirty=true;updateArea();if(detection.has(event.target.id)){$('approved').checked=false;approvedHash='';}refreshControls();}
function refreshControls(){
  if(!state)return;
  const active=state.running||state.busy||state.resetting||resetBusy;
  $('settings').disabled=active;$('save').disabled=active;$('test').disabled=active||previewBusy;
  $('start').disabled=active||dirty;$('pause').disabled=!state.running;
  $('resetHistory').disabled=active||previewBusy;$('csv').disabled=state.resetting||resetBusy;
  $('retry').disabled=active;$('useCount').disabled=active||!lastPreview||!lastPreview.counts?.pads;$('saveState').textContent=dirty?'設定尚未儲存。請先測試並儲存後再開始。':state.config.mode==='sort'?'自動分類模式；參數變更適用於尚未分類的影像。':'測試模式；影像不會複製到結果資料夾。';
}
function render(s){
  state=s;$('runState').textContent=s.running?'● 背景掃描中':s.busy?'● 目前影像完成後暫停':'● 已暫停';
  $('status').className=s.error?'error':'';$('status').textContent=s.error|| (s.busy?'檢測中：'+s.current:s.running?'正在監控輸入資料夾；新影像會在檔案穩定後自動檢測。':'已暫停。可調整參數或選擇影像進行測試。');
  $('pending').textContent=s.pending;
  const latest=[...new Map(s.history.map(r=>[r.key,r]).reverse()).values()];
  $('goodCount').textContent=latest.filter(r=>r.category==='Good'&&!['ERROR','CONFLICT','RETRY'].includes(r.status)).length;
  $('ngCount').textContent=latest.filter(r=>r.category?.startsWith('NG')&&!['ERROR','CONFLICT','RETRY'].includes(r.status)).length;
  $('reviewCount').textContent=latest.filter(r=>!['ERROR','RETRY'].includes(r.status)&&(r.category==='Review'||r.status==='CONFLICT')).length;
  $('errorCount').textContent=latest.filter(r=>['ERROR','RETRY'].includes(r.status)).length;
  for(const id of ['goodCount','ngCount','reviewCount','errorCount'])$(id).title='目前顯示的最新紀錄，包含測試模式結果';
  renderHistory();refreshControls();
}
function renderHistory(){
  const body=$('historyRows');body.replaceChildren();let rows=state.history;
  const filter=$('filter').value;
  if(filter==='Review')rows=rows.filter(r=>!['ERROR','RETRY'].includes(r.status)&&(r.category==='Review'||r.status==='CONFLICT'));
  else if(filter==='Error')rows=rows.filter(r=>['ERROR','RETRY'].includes(r.status));
  else if(filter!=='all')rows=rows.filter(r=>r.category===filter);
  for(const r of rows){
    const tr=document.createElement('tr');
    const first=document.createElement('td');first.textContent=r.filename;const time=document.createElement('small');time.textContent=new Date(r.time).toLocaleString('zh-TW');first.append(time);tr.append(first);
    const cat=document.createElement('td');cat.textContent=r.label||(r.category==='Review'?'待複核':r.category)||'處理失敗';cat.className=r.category==='Good'?'good':r.category==='Review'?'amber':'bad';tr.append(cat);
    const count=document.createElement('td');count.textContent=r.counts?String(r.counts.spots):'—';tr.append(count);
    const cov=document.createElement('td');cov.textContent=r.coverageReason||r.reason||'檢測尚未完成';cov.className=r.completeness==='complete'?'good':'amber';tr.append(cov);
    const status=document.createElement('td');status.textContent=statuses[r.status]||r.status;const note=document.createElement('small');note.textContent=r.error||r.reason||'';status.append(note);tr.append(status);
    if(r.hasPreview){tr.className='clickable';tr.onclick=()=>showResult(r.id);}
    body.append(tr);
  }
  if(!rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.textContent='尚無處理紀錄。';tr.append(td);body.append(tr);}
}
async function showResult(id){
  const epoch=resultEpoch;
  try{
    const {detail:d,preview}=await call(window.scanner.result(id));
    if(epoch!==resultEpoch)return;
    lastPreview=d;refreshControls();$('previewTitle').textContent=d.filename;$('category').textContent=d.label||(d.category==='Review'?'待複核':d.category)||'處理失敗';
    $('coverage').textContent=(d.completeness==='complete'?'完整檢測：':'檢測未完整：')+(d.coverageReason||d.reason);$('coverage').className='coverage '+(d.completeness==='complete'?'good':'amber');
    if(preview){$('zoom').value='fit';applyZoom();$('previewImage').src=preview;$('previewImage').hidden=false;$('empty').hidden=true;}
    $('previewNote').textContent=`${d.reason} · 圓形 ${d.counts.circle} / 八角形 ${d.counts.octagon} · 已檢測焊墊 ${d.counts.inspected??"—"} / 被裁切 ${d.counts.partial||0} · 缺陷候選 ${d.counts.spots} (大型污點 ${d.counts.occlusions||0}) / 待複核候選 ${d.counts.review||0} · 原始影像 ${d.originalWidth}×${d.originalHeight} → 分析 ${d.width}×${d.height}`;
    const displayBoxes=[...d.result.boxes,...(d.result.uncertainBoxes||[])];
    $('detailSummary').textContent=`候選詳情 (${d.result.boxes.length} 個缺陷， ${(d.result.uncertainBoxes||[]).length} 複核)`;
    $('defectRows').replaceChildren();
    for(const b of displayBoxes.slice(0,300)){
      const tr=document.createElement('tr');for(const text of [b.id,b.type==='occlusion'?'遮蔽區域／焊墊尚未驗證':(b.shape==='circle'?'圓形 ':'八角形 ')+b.pad,b.description,b.pixels]){const td=document.createElement('td');td.textContent=text;tr.append(td);}$('defectRows').append(tr);
    }
  }catch(e){toast(e.message,true);}
}
async function action(fn){try{await fn();}catch(e){toast(e.message,true);}}
for(const k of fields)$(k).addEventListener('input',changed);
for(const button of document.querySelectorAll('[data-folder]'))button.onclick=()=>action(async()=>{const p=await call(window.scanner.pickFolder());if(p){$(button.dataset.folder).value=p;changed({target:$(button.dataset.folder)});}});
$('outputRoot').onclick=()=>action(async()=>{const p=await call(window.scanner.pickFolder());if(p){const sep=p.includes('\\')?'\\':'/';for(const [key,name]of [['good','Good'],['defect','NG-Defect']])$(key).value=p.replace(/[\\/]$/,'')+sep+name;changed({target:$('good')});}});
$('save').onclick=()=>action(async()=>{const next=await call(window.scanner.save(readForm()));fill(next.config);render(next);toast('設定已儲存');});
$('test').onclick=()=>action(async()=>{
  previewBusy=true;refreshControls();
  try{const row=await call(window.scanner.preview(readForm()));if(row?.hasPreview){approvedHash=row.presetHash;await showResult(row.id);toast('預覽完成。啟用自動分類前，請檢查標記並確認校準正確。');}else if(row)toast(row.error||row.reason||'無法完成預覽',true);}
  finally{previewBusy=false;refreshControls();}
});
$('approved').addEventListener('change',()=>{if($('approved').checked&&!approvedHash){$('approved').checked=false;toast('同意校準前，請先以目前參數測試影像。',true);}});
$('start').onclick=()=>action(async()=>render(await call(window.scanner.start())));
$('pause').onclick=()=>action(async()=>render(await call(window.scanner.pause())));
$('hide').onclick=()=>action(()=>call(window.scanner.hide()));$('quit').onclick=()=>action(()=>call(window.scanner.quit()));
$('retry').onclick=()=>action(async()=>{await call(window.scanner.retry());toast('待複核、衝突與失敗項目已重新排入佇列；請按開始進行處理。');});
$('resetHistory').onclick=()=>action(async()=>{
  resetBusy=true;refreshControls();
  try{
    const next=await call(window.scanner.resetHistory());if(!next)return;
    resultEpoch++;lastPreview=null;
    $('previewImage').removeAttribute('src');$('previewImage').hidden=true;$('empty').hidden=false;
    $('previewTitle').textContent='分類前請檢查結果';$('category').textContent='等待影像';
    $('coverage').textContent='檢測覆蓋完整性會顯示於此。';$('coverage').className='coverage';
    $('previewNote').textContent='';$('detailSummary').textContent='缺陷候選詳情';$('defectRows').replaceChildren();
    $('details').open=false;$('filter').value='all';render(next);
    toast(next.error||'歷史紀錄已重設。請按開始重新檢測全部影像。',!!next.error);
  }finally{resetBusy=false;refreshControls();}
});
$('csv').onclick=()=>action(async()=>{const p=await call(window.scanner.exportCSV());if(p)toast('CSV 已儲存');});
for(const b of document.querySelectorAll('[data-open]'))b.onclick=()=>action(()=>call(window.scanner.openFolder(b.dataset.open)));
function applyZoom(){const fit=$('zoom').value==='fit';$('previewImage').style.width=fit?'100%':$('zoom').value+'%';$('previewImage').style.height=fit?'100%':'auto';if(fit){document.querySelector('.image-wrap').scrollTop=0;document.querySelector('.image-wrap').scrollLeft=0;}}
$('useCount').onclick=()=>{if(!lastPreview)return;$('expectedPads').value=lastPreview.counts.pads;changed({target:$('expectedPads')});toast('參考數量已設為 '+lastPreview.counts.pads+' 個焊墊。請確認沒有遺漏，再次測試。被裁切焊墊記錄為未檢測，但不會單獨阻止 Good 判定。');};
$('filter').onchange=renderHistory;$('zoom').onchange=applyZoom;
window.scanner.onState(render);
action(async()=>{const s=await call(window.scanner.state());fill(s.config);render(s);});
