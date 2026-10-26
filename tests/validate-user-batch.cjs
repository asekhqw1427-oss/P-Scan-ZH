'use strict';
// Usage: NODE_PATH=... node tests/validate-user-batch.cjs GOOD_DIR DEFECT_DIR OUTPUT_DIR
const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp');
const E=require('../app/engine'),C=require('../app/core');
const [good,defect,out]=process.argv.slice(2);if(!out)throw Error('Provide GOOD_DIR DEFECT_DIR OUTPUT_DIR');
const config={...C.DEFAULTS,sens:40,area:10,inset:12,pol:'dark',expectedPads:7};
(async()=>{fs.mkdirSync(out,{recursive:true});const rows=[];for(const [dir,label]of [[good,'Good'],[defect,'Defect']])for(const name of fs.readdirSync(dir).filter(n=>label==='Good'?/^(G|GG|GGGG)\.jpg$/.test(n):/^(IO|PR).*\.jpg$/.test(n))){
 const bytes=fs.readFileSync(path.join(dir,name));const {data,info}=await sharp(bytes).resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const result=await E.inspectCombined(data,info.width,info.height,config),decision=C.classify(result,config);
 const row={name,groundTruth:label,sha256:C.sha(bytes),configHash:C.presetHash(config),...decision};rows.push(row);
 fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify({row,result,config,width:info.width,height:info.height},null,2));
 console.log(name,decision.category,decision.counts.spots,decision.counts.review);
 if(label==='Good'){
  let svg='<svg width="'+info.width+'" height="'+info.height+'">';
  for(const [boxes,color]of [[result.boxes,'#ff0033'],[result.uncertainBoxes||[],'#ffbb00']])for(const b of boxes)svg+=`<rect x="${b.x-3}" y="${b.y-3}" width="${b.w+6}" height="${b.h+6}" fill="none" stroke="${color}" stroke-width="2"/><text x="${b.x}" y="${b.y-8}" fill="${color}" font-size="18">${b.id}</text>`;
  svg+='</svg>';await sharp(bytes).resize(info.width,info.height).composite([{input:Buffer.from(svg)}]).png().toFile(path.join(out,name+'.annotated.png'));
 }
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(rows,null,2));})();
