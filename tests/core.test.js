'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {Coordinator,DEFAULTS,presetHash,validateConfig,validateFolders,classify,publishExclusive,sha}=require('../app/core');
const good={regions:[{shape:'circle',partial:false,valid:true,geometry:{accept:true}}],boxes:[],width:200,height:200,originalWidth:200,originalHeight:200};
const scan=async bytes=>{const t=bytes.toString();if(t==='broken')throw Error('decode failed');return {...good,regions:t==='nopad'?[]:good.regions,boxes:['spot','both'].includes(t)?[{type:'spot',pad:1,valid:true}]:[],coverageIssues:t==='uncertain'?['Batas meragukan']:[]};};
async function fixture(mode='sort',scanner=scan){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'imgscan-test-'));let now=10000;
  const c={...DEFAULTS,mode,input:path.join(root,'input'),good:path.join(root,'Good'),defect:path.join(root,'NG-Defect'),expectedPads:1};
  await fs.mkdir(c.input);c.approved=true;c.approvedHash=presetHash(c);
  const m=await new Coordinator(path.join(root,'data'),scanner,{now:()=>now}).init();m.validatedHash=presetHash(c);await m.saveConfig(c);await m.start();
  const tick=async()=>{await m.tick();now+=3100;await m.tick();};
  return {root,c,m,tick,advance:()=>now+=3100,clean:()=>fs.rm(root,{recursive:true,force:true})};
}
test('result separates defect evidence from completeness',()=>{
  const c={...DEFAULTS,expectedPads:1};
  assert.equal(classify(good,c).category,'Good');
  const defect={...good,boxes:[{type:'spot',pad:1,valid:true}]};
  assert.equal(classify(defect,c).category,'NG-Defect');
  const partial={...defect,regions:[...good.regions,{shape:'circle',partial:true,valid:true}]};
  assert.equal(classify(partial,c).category,'NG-Defect');assert.equal(classify(partial,c).completeness,'partial');
  assert.equal(classify(good,DEFAULTS).category,'Good');
  assert.equal(classify({...good,regions:[]},c).category,'Review');
  assert.equal(classify({...good,regions:[{shape:'circle',partial:true}]},c).category,'Review');
  assert.equal(classify(good,{...c,expectedPads:2}).category,'Good');
  assert.equal(classify({...defect,regions:[{valid:false}]},c).category,'Review');
  assert.equal(classify({...good,boxes:[{type:'spot',pad:99,valid:true}]},c).category,'Review');
  assert.equal(classify({...good,boxes:[{type:'ring',pad:1}]},c).category,'Good');
  assert.equal(classify({...good,rejectedRegions:[{needsReview:true}]},c).category,'Review');
});
test('folder polling waits for stability and handles duplicate notifications',async()=>{
  let calls=0;const f=await fixture('sort',async b=>{calls++;return scan(b);});
  try{
    const file=path.join(f.c.input,'original name 中文.png');await fs.writeFile(file,'spot');
    await f.m.tick();assert.equal(calls,0);await fs.writeFile(file,'both');f.advance();await f.m.tick();assert.equal(calls,0);f.advance();await Promise.all([f.m.tick(),f.m.tick(),f.m.tick()]);
    assert.equal(calls,1);assert.equal(await fs.readFile(path.join(f.c.defect,path.basename(file)),'utf8'),'both');assert.equal(await fs.readFile(file,'utf8'),'both');
    await f.tick();assert.equal(calls,1);assert.equal((await fs.readdir(f.c.good)).length,0);
  }finally{await f.clean();}
});
test('restart skips completed image, changed input produces conflict without overwrite',async()=>{
  const f=await fixture();try{
    const file=path.join(f.c.input,'test.png');await fs.writeFile(file,'good');await f.tick();
    let calls=0;const next=await new Coordinator(f.m.root,async b=>{calls++;return scan(b);}).init();await next.start();await next.tick();assert.equal(calls,0);
    await fs.writeFile(file,'different-good');await f.tick();assert.equal(f.m.history.at(-1).status,'CONFLICT');assert.equal(await fs.readFile(path.join(f.c.good,'test.png'),'utf8'),'good');assert.equal(await fs.readFile(file,'utf8'),'different-good');
  }finally{await f.clean();}
});
test('pilot never copies; switching to sorting processes previously simulated image',async()=>{
  const f=await fixture('pilot');try{
    await fs.writeFile(path.join(f.c.input,'one.jpg'),'ring');await f.tick();assert.equal(f.m.history.at(-1).status,'SIMULATED');assert.equal((await fs.readdir(f.c.defect)).length,0);
    f.m.pause();await f.m.saveConfig({...f.m.config,mode:'sort'});await f.m.start();await f.tick();assert.equal(f.m.history.at(-1).status,'COPIED');
  }finally{await f.clean();}
});
test('corrupt, no-pad and uncertainty stay held, temporary files ignored',async()=>{
  const f=await fixture();try{
    for(const [name,bytes]of [['broken.bmp','broken'],['none.png','nopad'],['review.jpg','uncertain'],['copy.png.tmp','spot']])await fs.writeFile(path.join(f.c.input,name),bytes);
    for(let i=0;i<5;i++)await f.tick();
    assert.equal(f.m.history.length,3);assert.equal(f.m.history.find(r=>r.filename==='broken.bmp').status,'ERROR');assert.equal(f.m.history.find(r=>r.filename==='none.png').status,'REVIEW');assert.equal(f.m.history.find(r=>r.filename==='review.jpg').status,'REVIEW');for(const key of ['good','defect'])assert.equal((await fs.readdir(f.c[key])).length,0);
  }finally{await f.clean();}
});
test('source changed during analysis never publishes stale result',async()=>{
  let file;const f=await fixture('sort',async bytes=>{await fs.writeFile(file,'changed');return scan(bytes);});try{
    file=path.join(f.c.input,'moving.png');await fs.writeFile(file,'good');await f.tick();assert.equal((await fs.readdir(f.c.good)).length,0);assert.equal(f.m.busy,false);
  }finally{await f.clean();}
});
test('exclusive publication preserves different contents and recovers identical output',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'imgscan-atomic-'));try{
    const file=path.join(root,'原檔.bmp'),a=Buffer.from('A');assert.equal(await publishExclusive(a,file,sha(a)),'COPIED');assert.equal(await publishExclusive(a,file,sha(a)),'ALREADY_PRESENT');
    await assert.rejects(publishExclusive(Buffer.from('B'),file,sha(Buffer.from('B'))),{code:'CONFLICT'});assert.equal(await fs.readFile(file,'utf8'),'A');assert.deepEqual(await fs.readdir(root),['原檔.bmp']);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('folder overlap rejected, config approval invalidates after parameter changes',async()=>{
  const f=await fixture();try{
    await assert.rejects(validateFolders({...f.c,good:path.join(f.c.input,'Good')},f.m.root),/資料夾/);
    assert.equal(validateConfig({...f.c,sens:f.c.sens+1}).approved,false);
    assert.throws(()=>validateConfig({...f.c,area:NaN}));
    f.m.pause();await f.m.saveConfig({...f.m.config,sens:80});await assert.rejects(f.m.start(),/校準/);
  }finally{await f.clean();}
});
test('truncated final journal record recovered; corruption inside journal fails closed',async()=>{
  const f=await fixture();try{
    await fs.writeFile(path.join(f.c.input,'good.png'),'good');await f.tick();f.m.pause();await fs.appendFile(f.m.journal,'{"partial');
    const m=await new Coordinator(f.m.root,scan).init();assert.equal(m.history.at(-1).status,'COPIED');assert.ok((await fs.readFile(m.journal,'utf8')).endsWith('\n'));
    await fs.appendFile(m.journal,'bad json\n');await assert.rejects(new Coordinator(f.m.root,scan).init(),/損壞/);
  }finally{await f.clean();}
});
test('output error retries then holds, input stays intact',async()=>{
  const f=await fixture();try{
    await fs.writeFile(path.join(f.c.input,'good.png'),'good');await fs.rm(f.c.good,{recursive:true});await f.tick();assert.equal(f.m.history.at(-1).status,'RETRY');assert.equal(await fs.readFile(path.join(f.c.input,'good.png'),'utf8'),'good');
  }finally{await f.clean();}
});
test('filename in another category blocks a second conflicting classification',async()=>{
  const f=await fixture();try{
    const file=path.join(f.c.input,'same-name.png');await fs.writeFile(file,'good');await f.tick();
    await fs.writeFile(file,'spot');await f.tick();assert.equal(f.m.history.at(-1).status,'CONFLICT');
    assert.equal(await fs.readFile(path.join(f.c.good,'same-name.png'),'utf8'),'good');assert.equal((await fs.readdir(f.c.defect)).length,0);
  }finally{await f.clean();}
});

test('ROI bounds, forced defect mode and calibration validation',()=>{
 assert.throws(()=>validateConfig({...DEFAULTS,roiMode:'rect',roiX:60,roiW:50}));
 assert.equal(validateConfig({...DEFAULTS,rings:true,spots:false}).rings,false);
 assert.equal(validateConfig({...DEFAULTS,rings:true,spots:false}).spots,true);
 assert.throws(()=>validateConfig({...DEFAULTS,expectedPads:1.5}));
});
test('rejected and corrupt files can be retried without touching source',async()=>{
 const f=await fixture();try{
  const file=path.join(f.c.input,'bad.png');await fs.writeFile(file,'broken');await f.tick();assert.equal(f.m.history.at(-1).status,'ERROR');
  f.m.pause();await f.m.retryHeld();await f.m.start();await f.tick();assert.equal(f.m.history.at(-1).status,'ERROR');assert.equal(await fs.readFile(file,'utf8'),'broken');
 }finally{await f.clean();}
});
test('pause stops future work and configurations stay locked while busy',async()=>{
 const f=await fixture();try{
  f.m.pause();await fs.writeFile(path.join(f.c.input,'a.png'),'spot');await f.tick();assert.equal(f.m.history.length,0);
  f.m.busy=true;await assert.rejects(f.m.saveConfig(f.m.config),/暫停/);f.m.busy=false;
 }finally{await f.clean();}
});

test('reset persists, removes previews and rescans unchanged file after restart',async()=>{
 let calls=0;const f=await fixture('sort',async b=>{calls++;return {...await scan(b),preview:'data:image/png;base64,YQ=='};});
 try{
  const file=path.join(f.c.input,'again.png');await fs.writeFile(file,'spot');await f.tick();assert.equal(calls,1);f.m.pause();
  const config=await fs.readFile(path.join(f.m.root,'config.json'),'utf8');const old=f.m.history.at(-1).id;
  await f.m.resetHistory();assert.equal(f.m.index.size,0);assert.deepEqual(f.m.history,[]);assert.equal(f.m.pending,0);assert.equal(f.m.observed.size,0);assert.equal(f.m.running,false);
  assert.equal(await fs.readFile(f.m.journal,'utf8'),'');assert.deepEqual(await fs.readdir(path.join(f.m.root,'results')),[]);await assert.rejects(f.m.result(old),{code:'ENOENT'});
  assert.equal(await fs.readFile(path.join(f.m.root,'config.json'),'utf8'),config);assert.equal(await fs.readFile(file,'utf8'),'spot');assert.equal(await fs.readFile(path.join(f.c.defect,'again.png'),'utf8'),'spot');
  let now=10000;const m=await new Coordinator(f.m.root,async b=>{calls++;return scan(b);},{now:()=>now}).init();assert.deepEqual(m.history,[]);
  await m.start();await m.tick();assert.equal(calls,1);now+=3100;await m.tick();assert.equal(calls,2);assert.equal(m.history.at(-1).status,'ALREADY_PRESENT');
  m.pause();await m.resetHistory();await m.resetHistory();assert.deepEqual(m.history,[]);
 }finally{await f.clean();}
});
test('reset blocks active work and concurrent control operations',async()=>{
 const f=await fixture();try{
  await assert.rejects(f.m.resetHistory(),/暫停/);f.m.pause();
  for(const flag of ['busy','checking','controlBusy']){f.m[flag]=true;await assert.rejects(f.m.resetHistory());f.m[flag]=false;}
  const resetting=f.m.resetHistory();await assert.rejects(f.m.start(),/操作/);await assert.rejects(f.m.preview('unused.png',f.c),/操作/);await assert.rejects(f.m.retryHeld(),/操作/);await assert.rejects(f.m.saveConfig(f.c),/操作/);await resetting;
  assert.equal(f.m.resetting,false);assert.equal(f.m.controlBusy,false);
 }finally{await f.clean();}
});
test('failed reset commit preserves history',async()=>{
 const f=await fixture();try{
  await fs.writeFile(path.join(f.c.input,'one.png'),'spot');await f.tick();f.m.pause();const journal=f.m.journal;f.m.journal=path.join(f.m.root,'missing','history.jsonl');
  await assert.rejects(f.m.resetHistory(),{code:'ENOENT'});assert.equal(f.m.history.length,1);assert.equal(f.m.index.size,1);assert.ok((await fs.readFile(journal,'utf8')).includes('COPIED'));assert.equal(f.m.resetting,false);
 }finally{await f.clean();}
});
test('reset retains cross-category conflict protection',async()=>{
 let defect=false;const f=await fixture('sort',async()=>scan(Buffer.from(defect?'spot':'good')));try{
  await fs.writeFile(path.join(f.c.input,'same.png'),'unchanged');await f.tick();f.m.pause();await f.m.resetHistory();defect=true;await f.m.start();await f.tick();
  assert.equal(f.m.history.at(-1).status,'CONFLICT');assert.equal(await fs.readFile(path.join(f.c.good,'same.png'),'utf8'),'unchanged');assert.deepEqual(await fs.readdir(f.c.defect),[]);
 }finally{await f.clean();}
});

test('boundary evidence persists for review and is not copied as Good or NG',async()=>{
 const uncertain={id:'T01',type:'boundary-review',valid:false,pad:1,x:20,y:30,w:5,h:3,pixels:12,boundaryFraction:1};
 const f=await fixture('sort',async()=>({...good,uncertainBoxes:[uncertain]}));try{
  await fs.writeFile(path.join(f.c.input,'edge.png'),'normal');await f.tick();const row=f.m.history.at(-1);
  assert.equal(row.category,'Review');assert.equal(row.counts.spots,0);assert.equal(row.counts.review,1);assert.match(row.coverageReason,/邊界候選/);
  assert.deepEqual((await f.m.result(row.id)).detail.result.uncertainBoxes,[uncertain]);
  assert.deepEqual(await fs.readdir(f.c.good),[]);assert.deepEqual(await fs.readdir(f.c.defect),[]);
 }finally{await f.clean();}
});

test('count mismatch is informational for both fewer and extra pads and unset reference',()=>{
 for(const expectedPads of [0,2,7]){
  const d=classify(good,{...DEFAULTS,expectedPads});assert.equal(d.category,'Good');assert.equal(d.completeness,'partial');assert.equal(d.counts.inspected,1);assert.deepEqual(d.reviewReasons,[]);assert.equal(d.coverageNotes.length,1);
 }
 const d=classify({...good,regions:[...good.regions,...good.regions]},{...DEFAULTS,expectedPads:1});assert.equal(d.category,'Good');assert.match(d.coverageReason,/預期 1，實際 2/);
});
test('partial pads do not block Good when another interior was inspected; zero inspected pads stays Review',()=>{
 const partial={...good.regions[0],partial:true,inspection:null};
 const d=classify({...good,regions:[good.regions[0],partial]},{...DEFAULTS,expectedPads:7});
 assert.equal(d.category,'Good');assert.equal(d.label,'Good - 部分檢測');assert.equal(d.completeness,'partial');assert.equal(d.counts.partial,1);assert.equal(d.counts.inspected,1);assert.equal(d.coverageNotes.length,2);
 assert.equal(classify({...good,regions:[partial]},{...DEFAULTS,expectedPads:7}).category,'Review');
 assert.equal(classify({...good,regions:[]},{...DEFAULTS,expectedPads:7}).category,'Review');
});
test('new count policy does not clear boundary ambiguity or masked/unverified areas',()=>{
 for(const extra of [{uncertainBoxes:[{id:'T01'}]},{coverageIssues:['Penanda menutupi pad']},{rejectedRegions:[{needsReview:true}]}]){
  assert.equal(classify({...good,...extra},{...DEFAULTS,expectedPads:7}).category,'Review');
 }
 const d=classify({...good,boxes:[{type:'spot',pad:1,valid:true}]},{...DEFAULTS,expectedPads:7});assert.equal(d.category,'NG-Defect');
});
test('Good with partial coverage is copied intact and survives restart with coverage notes',async()=>{
 const f=await fixture('sort',async()=>({...good,regions:[good.regions[0],{...good.regions[0],partial:true,inspection:null}]}));try{
  const source=path.join(f.c.input,'partial.png');await fs.writeFile(source,'unchanged');await f.tick();const row=f.m.history.at(-1);
  assert.equal(row.category,'Good');assert.equal(row.status,'COPIED');assert.equal(row.completeness,'partial');assert.equal(row.counts.inspected,1);assert.equal(row.counts.partial,1);
  assert.equal(await fs.readFile(path.join(f.c.good,'partial.png'),'utf8'),'unchanged');assert.equal(await fs.readFile(source,'utf8'),'unchanged');assert.deepEqual(await fs.readdir(f.c.defect),[]);
  f.m.pause();const next=await new Coordinator(f.m.root,scan).init();assert.equal(next.history.at(-1).category,'Good');assert.equal(next.history.at(-1).coverageNotes.length,2);
 }finally{await f.clean();}
});

test('occlusion evidence publishes NG with no fabricated pad assignment',async()=>{
 const box={type:'occlusion',valid:true,pad:0,evidence:{accept:true,method:'compact-dark-core-v1',peerPads:3}};
 const f=await fixture('sort',async()=>({...good,regions:[...good.regions,...good.regions,...good.regions],boxes:[box]}));try{
  await fs.writeFile(path.join(f.c.input,'covered.png'),'original');await f.tick();const row=f.m.history.at(-1);assert.equal(row.category,'NG-Defect');assert.equal(row.counts.spots,1);assert.equal(row.counts.occlusions,1);
  assert.equal(await fs.readFile(path.join(f.c.defect,'covered.png'),'utf8'),'original');assert.equal((await f.m.result(row.id)).detail.result.boxes[0].pad,0);
 }finally{await f.clean();}
});
test('occlusion switch is validated and invalidates calibration approval',()=>{
 const c={...DEFAULTS,approved:true};c.approvedHash=presetHash(c);
 assert.equal(validateConfig(c).approved,true);assert.equal(validateConfig({...c,largeDark:false}).approved,false);
 assert.throws(()=>validateConfig({...c,largeDark:'yes'}));
 const noProof={...good,boxes:[{type:'occlusion',valid:true,pad:0}]};assert.equal(classify(noProof,{...DEFAULTS,expectedPads:1}).category,'Review');
});
