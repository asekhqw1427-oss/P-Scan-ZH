'use strict';
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');
const {EventEmitter} = require('node:events');
const ENGINE_VERSION = 'defect-large-dark-v1.5';
const CATEGORIES = ['Good', 'NG-Defect'];
const DEFAULTS = {
  input: '', good: '', defect: '', mode: 'pilot', startAtLogin: false,
  approved: false, approvedHash: '', expectedPads: 0, stableSeconds: 3,
  sens: 30, area: 10, inset: 10, pol: 'both', maskMarkers: true, padsens: 60, sameSize: true,
  minpad: 3, maxpad: 16, contrast: 14, spots: true, rings: false, largeDark: true,
  roiMode: 'full', roiX: 0, roiY: 0, roiW: 100, roiH: 100
};
const DETECTION_KEYS = ['largeDark','expectedPads','sens','area','inset','pol','padsens','sameSize','minpad','maxpad','contrast','spots','rings','maskMarkers','roiMode','roiX','roiY','roiW','roiH'];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = p => process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p);
const overlaps = (a,b) => { const r=path.relative(canonical(a),canonical(b)); return r==='' || (!r.startsWith('..'+path.sep) && r!=='..' && !path.isAbsolute(r)); };
const signature = s => `${s.size}:${s.mtimeMs}:${s.ctimeMs}`;
const presetHash = c => sha(JSON.stringify([ENGINE_VERSION,...DETECTION_KEYS.map(k=>[k,c[k]])]));
function validateConfig(raw) {
  const c={...DEFAULTS};
  for(const k of Object.keys(c)) if(Object.prototype.hasOwnProperty.call(raw,k)) c[k]=raw[k];
  for(const k of ['input','good','defect']) if(typeof c[k]!=='string') throw Error('資料夾設定無效');
  if(!['pilot','sort'].includes(c.mode)) throw Error('模式無效');
  for(const [k,lo,hi] of [['sens',0,100],['area',1,10000],['inset',0,60],['padsens',0,100],['minpad',1,89],['maxpad',2,90],['contrast',3,100],['roiX',0,99],['roiY',0,99],['roiW',1,100],['roiH',1,100],['expectedPads',0,1000],['stableSeconds',2,60]]) {
    if(typeof c[k]!=='number'||!Number.isFinite(c[k])||c[k]<lo||c[k]>hi) throw Error(`設定超出範圍：${k} (${lo}–${hi})`);
  }
  if(c.minpad>=c.maxpad) throw Error('焊墊最小直徑必須小於最大直徑');
  if(!Number.isInteger(c.area)||!Number.isInteger(c.expectedPads)) throw Error('像素數與焊墊數必須是整數');
  if(!['both','dark','light'].includes(c.pol)) throw Error('斑點類型無效');
  for(const k of ['approved','sameSize','startAtLogin','maskMarkers','largeDark']) if(typeof c[k]!=='boolean') throw Error('設定格式無效：'+k);
  if(!['full','rect'].includes(c.roiMode))throw Error('檢測範圍無效');
  if(c.roiMode==='rect'&&(c.roiX+c.roiW>100||c.roiY+c.roiH>100))throw Error('檢測範圍超出影像邊界（最大 100%）');
  c.spots=true;c.rings=false;
  c.approved=!!c.approved && c.approvedHash===presetHash(c);
  return c;
}
async function validateFolders(c,internal) {
  const keys=['input','good','defect'];
  for(const k of keys) if(!c[k]||!path.isAbsolute(c[k])) throw Error('請設定輸入及兩個輸出資料夾的完整路徑');
  for(let i=0;i<keys.length;i++)for(let j=i+1;j<keys.length;j++) {
    if(overlaps(c[keys[i]],c[keys[j]])||overlaps(c[keys[j]],c[keys[i]])) throw Error('輸入與輸出資料夾必須分開，不可相同或互相包含');
  }
  if(!(await fsp.stat(c.input)).isDirectory())throw Error('輸入路徑不是資料夾');
  for(const k of keys.slice(1))await fsp.mkdir(c[k],{recursive:true});
  const real={...c};for(const k of keys)real[k]=await fsp.realpath(c[k]);
  for(let i=0;i<keys.length;i++)for(let j=i+1;j<keys.length;j++)if(overlaps(real[keys[i]],real[keys[j]])||overlaps(real[keys[j]],real[keys[i]]))throw Error('資料夾連結指向重疊的位置');
  if(internal)for(const k of keys)if(overlaps(internal,real[k])||overlaps(real[k],internal))throw Error('掃描資料夾不可與應用程式資料資料夾重疊');
  for(const k of keys.slice(1)) {
    const p=path.join(real[k],'.imgscanner-access-'+crypto.randomUUID()+'.tmp');
    const h=await fsp.open(p,'wx');await h.close();
    try{await fsp.link(p,p+'.link');}catch(e){throw Error('輸出資料夾不支援安全寫入。請使用可寫入的本機 NTFS 資料夾：'+real[k]);}
    finally{await fsp.unlink(p+'.link').catch(()=>{});await fsp.unlink(p).catch(()=>{});}
  }
  return real;
}
async function atomicJSON(file,value) {
  const tmp=file+'.'+crypto.randomUUID()+'.tmp';
  const h=await fsp.open(tmp,'wx');
  try {await h.writeFile(JSON.stringify(value,null,2),'utf8');await h.sync();}finally{await h.close();}
  try{await fsp.rename(tmp,file);}catch(e){await fsp.unlink(tmp).catch(()=>{});throw e;}
}
function classify(result,c) {
  const regions=result.regions||[], accepted=regions.filter(r=>r.valid===true&&r.geometry?.accept===true);
  const spots=(result.boxes||[]).filter(b=>b.type==='spot'&&b.valid===true&&Number.isInteger(b.pad)&&b.pad>0&&b.pad<=regions.length&&regions[b.pad-1].valid===true&&regions[b.pad-1].geometry?.accept===true);
  const occlusions=(result.boxes||[]).filter(b=>b.type==='occlusion'&&b.valid===true&&b.evidence?.accept===true&&b.evidence.method==='compact-dark-core-v1'&&b.evidence.peerPads>=3&&accepted.filter(r=>!r.partial).length>=3);
  const counts={pads:accepted.length,spots:spots.length+occlusions.length,occlusions:occlusions.length,rings:0,review:(result.uncertainBoxes||[]).length,circle:0,octagon:0,partial:accepted.filter(r=>r.partial).length,inspected:accepted.filter(r=>!r.partial&&r.inspection!==null).length};
  for(const r of accepted)counts[r.shape==='octagon'?'octagon':'circle']++;
  const reasons=[],coverageNotes=[];
  if((result.boxes||[]).some(b=>b.type==='occlusion'&&!occlusions.includes(b)))reasons.push('大型深色污點候選的證據尚未驗證');
  if(occlusions.length)reasons.push('大型深色污點處的焊墊邊界尚未驗證；NG 判定依據為污點證據，並非完整焊墊');
  if(counts.review)reasons.push(counts.review+' 個邊界候選尚無法與焊墊邊緣／標記遮蔽區域區分；請查看預覽中的 T 框');
  if(accepted.length!==regions.length)reasons.push('部分目標形狀尚未驗證為焊墊');
  if((result.boxes||[]).some(b=>b.type==='spot'&&!spots.includes(b)))reasons.push('斑點標記尚無法對應到有效焊墊');
  if(!counts.pads)reasons.push('找不到有效焊墊');
  if(!counts.inspected)reasons.push('沒有成功檢測的焊墊內部區域');
  if(counts.partial)coverageNotes.push(counts.partial+' 個焊墊在檢測範圍邊界被裁切；未檢測其斑點');
  if(c.expectedPads===0)coverageNotes.push('尚未設定參考焊墊數量；目標完整性尚未驗證');
  else if(counts.pads!==c.expectedPads)coverageNotes.push(`焊墊數量不符：預期 ${c.expectedPads}，實際 ${counts.pads}`);
  for(const r of result.coverageIssues||[])if(!reasons.includes(r))reasons.push(r);
  if((result.rejectedRegions||[]).some(r=>r.needsReview))reasons.push('部分焊墊候選的邊界尚無法確定');
  const complete=!reasons.length&&!coverageNotes.length,completeness=complete?'complete':'partial';
  const coverageReason=complete?'檢測範圍內的焊墊數量與邊界符合參考':[...reasons,...coverageNotes].join('; ');
  if(spots.length||occlusions.length)return {category:'NG-Defect',label:complete?'NG-Defect':'NG-Defect - 部分檢測',reason:occlusions.length?'大型深色污點相對於周圍焊墊，通過厚度、尺寸與形狀驗證':'有效焊墊內的斑點達到閾值',counts,completeness,coverageReason,reviewReasons:reasons,coverageNotes};
  if(reasons.length)return {category:'Review',label:'待複核',reason:coverageReason,counts,completeness,coverageReason,reviewReasons:reasons,coverageNotes};
  return {category:'Good',label:complete?'Good':'Good - 部分檢測',reason:'已檢測的焊墊內部未發現缺陷候選'+(complete?'':'；焊墊數量不符／被裁切不會阻止 Good 判定'),counts,completeness,coverageReason,reviewReasons:[],coverageNotes};
}
async function publishExclusive(bytes,destination,expectedHash) {
  // A hard link in the destination filesystem publishes a complete file atomically,
  // and fails with EEXIST rather than replacing another image.
  const tmp=path.join(path.dirname(destination),'.imgscanner-'+crypto.randomUUID()+'.tmp');
  const h=await fsp.open(tmp,'wx');
  try{await h.writeFile(bytes);await h.sync();}finally{await h.close();}
  try{
    await fsp.link(tmp,destination);
    return 'COPIED';
  }catch(e){
    if(e.code==='EEXIST'){
      const s=await fsp.lstat(destination);
      if(!s.isSymbolicLink()&&s.isFile()&&s.size===bytes.length&&sha(await fsp.readFile(destination))===expectedHash)return 'ALREADY_PRESENT';
      const conflict=Error('目的地已有內容不同的同名檔案；舊檔案未被覆寫');conflict.code='CONFLICT';throw conflict;
    }
    throw e;
  }finally{await fsp.unlink(tmp).catch(()=>{});}
}
class Coordinator extends EventEmitter {
  constructor(root,scan,{now=()=>Date.now()}={}) {
    super();this.root=root;this.scan=scan;this.now=now;this.config={...DEFAULTS};this.index=new Map();this.history=[];this.observed=new Map();this.running=false;this.busy=false;this.current='';this.pending=0;this.error='';this.checking=false;this.journal=path.join(root,'history.jsonl');this.validatedHash='';this.controlBusy=false;this.resetting=false;
  }
  async init(){
    await fsp.mkdir(path.join(this.root,'results'),{recursive:true});
    try{this.config=validateConfig(JSON.parse(await fsp.readFile(path.join(this.root,'config.json'),'utf8')));}catch(e){if(e.code!=='ENOENT')throw Error('設定檔損壞。請保留資料以供檢查：'+e.message);}
    try{
      const text=await fsp.readFile(this.journal,'utf8');const lines=text.split('\n');
      // Only the final unterminated record can be incomplete after power loss.
      for(let i=0;i<lines.length;i++)if(lines[i]){
        let row;try{row=JSON.parse(lines[i]);}catch(e){if(i===lines.length-1&&!text.endsWith('\n')){await fsp.truncate(this.journal,Buffer.byteLength(lines.slice(0,i).join('\n')+(i?'\n':'')));break;}throw Error('歷史紀錄損壞；已停止處理以避免重複分類');}
        this.index.set(row.key,row);
        if(row.status!=='PROCESSING')this.history.push(row);
        if(row.mode==='preview'&&row.hasPreview&&row.presetHash)this.validatedHash=row.presetHash;
      }
      this.history=this.history.slice(-300);
    }catch(e){if(e.code!=='ENOENT')throw e;}
    return this;
  }
  snapshot(){return {config:this.config,running:this.running,busy:this.busy,resetting:this.resetting,current:this.current,pending:this.pending,error:this.error,history:this.history.slice(-150).reverse(),validatedHash:this.validatedHash,presetHash:presetHash(this.config),dataPath:this.root};}
  changed(){this.emit('change',this.snapshot());}
  async control(fn){
    if(this.controlBusy)throw Error('應用程式正在執行操作；請等待完成');
    this.controlBusy=true;
    try{return await fn();}finally{this.controlBusy=false;}
  }
  async resetHistory(){return this.control(async()=>{
    if(this.running||this.busy||this.checking)throw Error('重設前請按暫停，並等待檢測完成');
    this.resetting=true;this.changed();
    const tmp=this.journal+'.'+crypto.randomUUID()+'.tmp';
    try{
      // Commit an empty journal atomically. Until rename succeeds, old history stays valid.
      const h=await fsp.open(tmp,'wx');
      try{await h.sync();}finally{await h.close();}
      await fsp.rename(tmp,this.journal);
      this.index.clear();this.history=[];this.observed.clear();
      this.pending=0;this.current='';this.error='';this.validatedHash='';
      // Only internal result files are removed; inputs, outputs and config are untouched.
      try{
        const dir=path.join(this.root,'results');
        for(const entry of await fsp.readdir(dir,{withFileTypes:true})){
          if(entry.isFile()&&/^[a-f0-9-]{36}\.(json|png)$/.test(entry.name))await fsp.unlink(path.join(dir,entry.name));
        }
      }catch(e){this.error='紀錄已重設，但部分預覽檔案無法刪除：'+e.message;}
    }finally{
      await fsp.unlink(tmp).catch(()=>{});this.resetting=false;this.changed();
    }
    return this.snapshot();
  });}
  async saveConfig(raw){return this.control(()=>this._saveConfig(raw));}
  async _saveConfig(raw){
    if(this.running||this.busy)throw Error('變更設定前，請暫停並等待目前影像處理完成');
    let c=validateConfig(raw);c=await validateFolders(c,this.root);
    if(c.approved&&this.validatedHash!==presetHash(c))throw Error('請先以目前參數執行至少一次預覽');
    await atomicJSON(path.join(this.root,'config.json'),c);this.config=c;this.observed.clear();this.changed();return c;
  }
  async start(){return this.control(()=>this._start());}
  async _start(){
    if(this.busy&&!this.running)throw Error('請等待目前影像完成');
    this.config=await validateFolders(validateConfig(this.config),this.root);
    if(this.config.mode==='sort'&&(!this.config.approved||this.config.approvedHash!==presetHash(this.config)))throw Error('啟用自動分類前，請先測試並同意校準');
    this.running=true;this.error='';this.changed();
  }
  pause(){this.running=false;this.changed();}
  key(file,s,c){return sha(JSON.stringify([canonical(file),signature(s),c.mode,c.mode==='pilot'?presetHash(c):'',...[c.good,c.defect].map(canonical)]));}
  async record(row){
    const h=await fsp.open(this.journal,'a');try{await h.writeFile(JSON.stringify(row)+'\n','utf8');await h.sync();}finally{await h.close();}
    this.index.set(row.key,row);if(row.status!=='PROCESSING'){this.history.push(row);this.history=this.history.slice(-300);}this.changed();
  }
  async tick(){
    if(!this.running||this.checking||this.busy||this.controlBusy)return;this.checking=true;
    try{
      const c=this.config,entries=await fsp.readdir(c.input,{withFileTypes:true}),ready=[];const present=new Set();let pending=0;
      for(const entry of entries){
        if(!entry.isFile()||! /\.(png|jpe?g|bmp)$/i.test(entry.name))continue;
        const file=path.join(c.input,entry.name);present.add(file);
        let s;try{s=await fsp.lstat(file);}catch(e){if(e.code==='ENOENT')continue;throw e;}
        if(!s.isFile()||s.isSymbolicLink())continue;
        const key=this.key(file,s,c),old=this.index.get(key);
        if(old&&old.status!=='PROCESSING'&&old.status!=='RETRY')continue;
        if(old?.status==='RETRY'&&old.retryAt>this.now())continue;
        pending++;const sig=signature(s),obs=this.observed.get(file);
        if(!obs||obs.sig!==sig){this.observed.set(file,{sig,since:this.now()});continue;}
        if(this.now()-obs.since>=c.stableSeconds*1000)ready.push({file,s,key});
      }
      for(const file of this.observed.keys())if(!present.has(file))this.observed.delete(file);
      this.pending=pending;this.error='';this.changed();
      ready.sort((a,b)=>a.s.mtimeMs-b.s.mtimeMs||a.file.localeCompare(b.file));
      if(ready.length&&this.running)await this.process(ready[0],{...c});
    }catch(e){this.error=e.message;this.running=false;this.changed();}
    finally{this.checking=false;}
  }
  async process({file,s,key},c,manual=false){
    this.busy=true;this.current=path.basename(file);this.changed();
    const previous=this.index.get(key);
    const row={id:crypto.randomUUID(),key,filename:path.basename(file),source:file,time:new Date().toISOString(),mode:manual?'preview':c.mode,presetHash:presetHash(c),engine:ENGINE_VERSION,settings:Object.fromEntries(DETECTION_KEYS.map(k=>[k,c[k]])),attempt:(previous?.attempt||0)+1,status:'PROCESSING'};
    try{
      await this.record(row);
      if(s.size>30*1024*1024||s.size===0){const e=Error('影像大小必須介於 1 位元組至 30 MB');e.code='BAD_IMAGE';throw e;}
      const real=await fsp.lstat(file);if(!real.isFile()||real.isSymbolicLink()||signature(real)!==signature(s))return;
      const bytes=await fsp.readFile(file);const after=await fsp.stat(file);
      if(signature(after)!==signature(s)||bytes.length!==s.size)return;
      row.sha256=sha(bytes);
      let found;try{found=await this.scan(bytes,c);}catch(e){e.code=e.code||'SCAN_FAILED';throw e;}
      if(signature(await fsp.stat(file))!==signature(s))return;
      Object.assign(row,classify(found,c),{width:found.width,height:found.height,originalWidth:found.originalWidth,originalHeight:found.originalHeight});
      const detail={...row,result:{regions:found.regions,boxes:found.boxes,uncertainBoxes:found.uncertainBoxes||[],rejectedRegions:found.rejectedRegions||[]}};
      await atomicJSON(path.join(this.root,'results',row.id+'.json'),detail);
      if(found.preview){const encoded=found.preview.replace(/^data:image\/png;base64,/,'');await fsp.writeFile(path.join(this.root,'results',row.id+'.png'),Buffer.from(encoded,'base64'),{flag:'wx'});row.hasPreview=true;}
      if(row.category==='Review')row.status='REVIEW';
      else if(manual||c.mode==='pilot')row.status='SIMULATED';
      else{
        const folder=c[row.category==='Good'?'good':'defect'];
        // Revalidate the actual folder after scanning in case a directory junction changed.
        if(canonical(await fsp.realpath(folder))!==canonical(folder))throw Error('輸出資料夾位置已變更');
        row.destination=path.join(folder,row.filename);
        for(const other of [c.good,c.defect])if(canonical(other)!==canonical(folder)){
          let exists=false;try{await fsp.lstat(path.join(other,row.filename));exists=true;}catch(e){if(e.code!=='ENOENT')throw e;}
          if(exists){const conflict=Error('其他分類已有同名檔案。請先複核先前結果');conflict.code='CONFLICT';throw conflict;}
        }
        await this.record({...row,status:'PROCESSING'});
        row.status=await publishExclusive(bytes,row.destination,row.sha256);
      }
      if(manual){this.validatedHash=row.presetHash;}
      await this.record(row);
    }catch(e){
      row.error=e.message;
      if(e.code==='CONFLICT')row.status='CONFLICT';
      else if(['BAD_IMAGE','SCAN_FAILED'].includes(e.code)){row.status='ERROR';row.category=null;row.label='處理失敗';row.reason=e.message;row.completeness='not_run';row.coverageReason='因技術錯誤而未完成檢測';}
      else{row.status=row.attempt<3?'RETRY':'ERROR';row.retryAt=this.now()+30000*row.attempt;}
      try{await this.record(row);}catch(logError){this.running=false;this.error='無法儲存紀錄；已暫停處理：'+logError.message;}
    }finally{this.busy=false;this.current='';this.pending=Math.max(0,this.pending-1);this.changed();}
    return row;
  }
  async preview(file,raw){return this.control(()=>this._preview(file,raw));}
  async _preview(file,raw){
    if(this.busy||this.running)throw Error('測試影像前請先暫停背景掃描');
    const c=validateConfig(raw),s=await fsp.lstat(file);
    if(s.isSymbolicLink()||!s.isFile()||! /\.(png|jpe?g|bmp)$/i.test(file))throw Error('請選擇 PNG、JPG、JPEG 或 BMP 影像');
    return this.process({file,s,key:'preview-'+crypto.randomUUID()},c,true);
  }
  async retryHeld(){return this.control(()=>this._retryHeld());}
  async _retryHeld(){
    if(this.running||this.busy)throw Error('請暫停並等待目前影像完成');
    for(const r of [...this.index.values()])if(['ERROR','CONFLICT','REVIEW','RETRY'].includes(r.status)&&r.mode!=='preview')await this.record({...r,status:'PROCESSING',attempt:0});
    this.observed.clear();this.changed();
  }
  async result(id){
    if(!/^[a-f0-9-]{36}$/.test(id))throw Error('歷史紀錄 ID 無效');
    const detail=JSON.parse(await fsp.readFile(path.join(this.root,'results',id+'.json'),'utf8'));
    let preview=null;try{preview='data:image/png;base64,'+(await fsp.readFile(path.join(this.root,'results',id+'.png'))).toString('base64');}catch(e){if(e.code!=='ENOENT')throw e;}
    return {detail,preview};
  }
}
module.exports={Coordinator,DEFAULTS,CATEGORIES,presetHash,validateConfig,validateFolders,classify,publishExclusive,signature,sha,ENGINE_VERSION};
