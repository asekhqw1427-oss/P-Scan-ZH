'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const sharp=require('sharp'),E=require('../app/engine'),C=require('../app/core');
const fixtures=path.join(__dirname,'fixtures');
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'p-scan-real-'));let clock=Date.now();
 const decode=async bytes=>{
  const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  return {...await E.inspectCombined(data,info.width,info.height,c),width:info.width,height:info.height,originalWidth:info.width,originalHeight:info.height};
 };
 const c={...C.DEFAULTS,expectedPads:2,input:path.join(root,'Input'),good:path.join(root,'Good'),defect:path.join(root,'NG-Defect'),mode:'sort',approved:true};c.approvedHash=C.presetHash(c);
 await fs.mkdir(c.input);const m=await new C.Coordinator(path.join(root,'data'),decode,{now:()=>clock}).init();m.validatedHash=C.presetHash(c);await m.saveConfig(c);
 const expected={'good.png':'Good','spot.png':'NG-Defect','both.png':'NG-Defect','ring.png':'Good','no-pad.png':'Review','corrupt.jpg':null};
 for(const file of Object.keys(expected))await fs.writeFile(path.join(c.input,file),file==='corrupt.jpg'?Buffer.from('broken image'):await fs.readFile(path.join(fixtures,file)));
 await m.start();await m.tick();assert.equal(m.history.length,0,'must wait for stable input');
 for(let i=0;i<8;i++){clock+=4000;await m.tick();}
 assert.equal(m.history.length,6);const routes=[];
 for(const r of m.history){
  assert.equal(r.category,expected[r.filename],r.filename);
  if(r.category==='Good'||r.category==='NG-Defect'){
   assert.equal(r.status,'COPIED');assert.equal(path.basename(r.destination),r.filename);
   assert.deepEqual(await fs.readFile(r.destination),await fs.readFile(r.source));
  }else{assert.equal(r.status,r.filename==='corrupt.jpg'?'ERROR':'REVIEW');assert.equal(r.destination,undefined);}
  routes.push({file:r.filename,category:r.category,status:r.status});
 }
 m.pause();const resumed=await new C.Coordinator(m.root,async()=>{throw Error('completed image should not rescan');},{now:()=>clock}).init();await resumed.start();await resumed.tick();assert.equal(resumed.history.length,6);resumed.pause();
 const report={runtime:'Node/Linux using Sharp; Electron tray, Windows and Defender not tested',ok:true,unchangedSourceAndOutputBytes:true,originalNamesPreserved:true,restartSkipsCompleted:true,routes};
 await fs.writeFile(path.join(__dirname,'../folder-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 await fs.rm(root,{recursive:true,force:true});
})().catch(e=>{console.error(e);process.exitCode=1;});
