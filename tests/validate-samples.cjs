'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const assert=require('node:assert/strict'),sharp=require('sharp');
const E=require('../app/engine'),C=require('../app/core');
const source=path.resolve(process.argv[2]||path.join(__dirname,'../samples'));
const destination=path.resolve(process.argv[3]||path.join(__dirname,'../validation'));
const options={...C.DEFAULTS};
const xml=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
function shape(p,w,h,color,dash=''){
 const x=p.cx*w,y=p.cy*h,rx=p.w*w/2,ry=p.h*h/2;
 if(p.shape==='circle')return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="${dash}"/>`;
 const t=Math.SQRT2-1;return `<polygon points="${[[-t,-1],[t,-1],[1,-t],[1,t],[t,1],[-t,1],[-1,t],[-1,-t]].map(([a,b])=>(x+a*rx)+','+(y+b*ry)).join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="${dash}"/>`;
}
(async()=>{
 fs.mkdirSync(destination,{recursive:true});const rows=[];
 for(const filename of fs.readdirSync(source).filter(n=>/\.(png|jpg|jpeg)$/i.test(n)).sort()){
  const bytes=fs.readFileSync(path.join(source,filename));const {data,info}=await sharp(bytes).resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const begin=Date.now(),result=await E.inspectCombined(data,info.width,info.height,options),decision=C.classify(result,options);
  const file=filename.replace(/\.[^.]+$/,'').replaceAll(' ','_').replace(/[()]/g,'')+'-hasil.png';
  const overlay=[];
  for(const [i,p] of result.regions.entries()){
   overlay.push(shape(p,info.width,info.height,p.partial?'#f29500':'#93bcae','4 4'));
   if(p.inspection)overlay.push(shape(p.inspection,info.width,info.height,'#00b98d'));
  }
  for(const p of result.rejectedRegions)if(p.needsReview)overlay.push(shape(p,info.width,info.height,'#e18b00','4 4'));
  for(const b of result.boxes)overlay.push(`<rect x="${b.x-2}" y="${b.y-2}" width="${b.w+4}" height="${b.h+4}" fill="none" stroke="#ff1240" stroke-width="2"/><text x="${b.x}" y="${Math.max(14,b.y-5)}" font-family="sans-serif" font-size="16" font-weight="bold" fill="#ff1240">${xml(b.id)}</text>`);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}">${overlay.join('')}</svg>`;
  await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).composite([{input:Buffer.from(svg)}]).png().toFile(path.join(destination,file));
  const row={filename,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),ms:Date.now()-begin,width:info.width,height:info.height,...decision,result,overlay:file};
  rows.push(row);console.log(filename,decision.category,decision.counts,'rejected',result.rejectedRegions.length);
  if(/^IO \((17|18|19|20)\)/.test(filename)){
   assert.equal(decision.category,'NG-Defect',filename);
   assert.ok(result.boxes.some(b=>Math.hypot(b.centerX-403,b.centerY-403)<20),'Spot in yellow target on '+filename);
  }
  fs.writeFileSync(path.join(destination,'hasil-sampel.json'),JSON.stringify({engine:C.ENGINE_VERSION,decoder:'Sharp/libvips; execution Node/Linux, not Windows Chromium',options,groundTruth:'No confirmed Good set; yellow boxes used only for localization checks on IO17–20. Counts are candidates, not accuracy metrics.',rows},null,2));
 }
 console.log('All eight samples processed; four target localization assertions passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
