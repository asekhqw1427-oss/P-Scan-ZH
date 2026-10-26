'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const sharp=require('sharp');
const E=require('../app/engine');
const C=require('../app/core');
async function read(name){
 if(name.endsWith('.bmp')){const b=require('bmp-js').decode(require('node:fs').readFileSync(path.join(__dirname,'fixtures',name))),data=Buffer.alloc(b.data.length);for(let i=0;i<data.length;i+=4){data[i]=b.data[i+3];data[i+1]=b.data[i+2];data[i+2]=b.data[i+1];data[i+3]=255;}return {data,info:{width:b.width,height:b.height}};}
 return sharp(path.join(__dirname,'fixtures',name)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
}
async function inspect(name,extra={}){const {data,info}=await read(name),options={...C.DEFAULTS,expectedPads:2,...extra};const result=await E.inspectCombined(data,info.width,info.height,options);return {result,decision:C.classify(result,options),options};}
test('circle and octagon: PNG/JPG/BMP clean interiors pass with verified pad count',async()=>{
 for(const name of ['good.png','good.jpg','good.bmp']){
  const {result,decision}=await inspect(name);assert.equal(decision.category,'Good',name);
  assert.equal(result.regions.length,2);assert.equal(result.boxes.length,0);assert.ok(result.regions.every(p=>p.inspection.w<p.inner.w&&p.inner.w<p.w));
 }
});
test('central dark spot is localized on the octagon, independent of thick ring',async()=>{
 for(const name of ['spot.png','both.png']){
  const {result,decision}=await inspect(name);assert.equal(decision.category,'NG-Defect');assert.equal(result.boxes.length,1);
  const b=result.boxes[0];assert.ok(Math.abs(b.centerX-280)<2&&Math.abs(b.centerY-200)<2);assert.equal(b.shape,'octagon');
 }
});
test('thick rings alone produce no spot or residue category in Defect mode',async()=>{
 for(const [name,expectedPads]of [['ring.png',2],['octagon-ring.png',1]]){
  const {result,decision}=await inspect(name,{expectedPads});assert.equal(decision.category,'Good');assert.equal(result.boxes.length,0);assert.equal(decision.counts.rings,0);
 }
});
test('no pad stays Review; count mismatch alone allows Good',async()=>{
 assert.equal((await inspect('no-pad.png')).decision.category,'Review');
 assert.equal((await inspect('good.png',{expectedPads:0})).decision.category,'Good');
 assert.equal((await inspect('good.png',{expectedPads:3})).decision.category,'Good');
});
test('rectangular scope ignores the defect outside selected area and maps coordinates',async()=>{
 const {result,decision}=await inspect('spot.png',{roiMode:'rect',roiX:10,roiY:30,roiW:40,roiH:40,minpad:20,maxpad:50,expectedPads:1});
 assert.equal(decision.category,'Good');assert.equal(result.regions.length,1);assert.ok(Math.abs(result.regions[0].cx-.3)<.02);assert.equal(result.scope.x,40);assert.equal(result.boxes.length,0);
});
test('partial target prevents Good while a separate full pad can still produce NG',async()=>{
 const partial={roiMode:'rect',roiX:33,roiY:0,roiW:67,roiH:100,minpad:4,maxpad:26,expectedPads:1};
 const {result,decision}=await inspect('spot.png',partial);assert.equal(decision.category,'NG-Defect');
 // The remaining full octagon must keep its original image coordinates.
 assert.ok(result.boxes.some(b=>Math.abs(b.centerX-280)<2));
 assert.equal(E.inside(10,10,100,100,{regions:[{partial:true,cx:.1,cy:.1,w:.2,h:.2,shape:'circle'}]}),false);
});
test('invalid data is a processing failure and tiny scopes require review',async()=>{
 await assert.rejects(E.inspectCombined(new Uint8Array(10),100,100,C.DEFAULTS));
 const {decision}=await inspect('good.png',{roiMode:'rect',roiX:0,roiY:0,roiW:5,roiH:5});assert.equal(decision.category,'Review');
});
test('annotation mask excludes long yellow lines but preserves small yellow defects',()=>{
 const w=100,h=100,data=new Uint8ClampedArray(w*h*4);data.fill(100);
 const put=(x,y)=>{const i=(y*w+x)*4;data[i]=240;data[i+1]=230;data[i+2]=110;data[i+3]=255;};
 for(let x=10;x<70;x++)put(x,10);
 for(let y=50;y<53;y++)for(let x=50;x<53;x++)put(x,y);
 const mask=E.markerMask(data,w,h);assert.equal(mask[10*w+20],1);assert.equal(mask[51*w+51],0);
});

test('clipped dark components stay Review; isolated defect in same image remains NG',()=>{
 const w=100,h=100,data=new Uint8ClampedArray(w*h*4);data.fill(170);
 const r={cx:.5,cy:.5,w:.6,h:.6,shape:'circle',valid:true,partial:false,geometry:{accept:true}};
 const put=(x,y)=>{for(let c=0;c<3;c++)data[(y*w+x)*4+c]=0;};
 for(let y=46;y<=54;y++)for(let x=78;x<=80;x++)put(x,y);
 const options={...C.DEFAULTS,area:5,sens:40,regions:[r]};const edge=E.verifyCandidates(E.detect(data,w,h,options));
 assert.equal(edge.uncertain.length,1);assert.equal(edge.confirmed.length,0);
 assert.equal(C.classify({regions:[r],boxes:[],uncertainBoxes:edge.uncertain},{...C.DEFAULTS,expectedPads:1}).category,'Review');
 for(let y=47;y<=53;y++)for(let x=47;x<=53;x++)put(x,y);
 const mixed=E.verifyCandidates(E.detect(data,w,h,options));assert.equal(mixed.uncertain.length,1);assert.equal(mixed.confirmed.length,1);
 const d=C.classify({regions:[r],boxes:mixed.confirmed.map(b=>({...b,type:'spot',valid:true})),uncertainBoxes:mixed.uncertain},{...C.DEFAULTS,expectedPads:1});
 assert.equal(d.category,'NG-Defect');assert.equal(d.completeness,'partial');assert.equal(d.counts.review,1);
});
test('small isolated near-edge defect is retained',()=>{
 const w=100,h=100,data=new Uint8ClampedArray(w*h*4);data.fill(170);
 const r={cx:.5,cy:.5,w:.6,h:.6,shape:'circle',valid:true,geometry:{accept:true}};
 for(let y=48;y<=52;y++)for(let x=70;x<=74;x++)for(let c=0;c<3;c++)data[(y*w+x)*4+c]=0;
 const v=E.verifyCandidates(E.detect(data,w,h,{...C.DEFAULTS,area:5,sens:40,regions:[r]}));assert.equal(v.confirmed.length,1);assert.equal(v.uncertain.length,0);
});

function obstructionFixture(draw){
 const w=240,h=200,data=new Uint8ClampedArray(w*h*4);for(let i=0;i<w*h;i++){data[4*i]=190;data[4*i+1]=150;data[4*i+2]=120;data[4*i+3]=255;}
 const ink=(x,y)=>{for(let k=0;k<3;k++)data[(y*w+x)*4+k]=5;};draw(ink);
 const regions=[.2,.5,.8].map(cx=>({cx,cy:.8,w:50/w,h:50/h,valid:true,partial:false,geometry:{accept:true},shape:'circle'}));
 return {data,w,h,regions};
}
test('large compact dark obstruction is detected without inventing a valid target pad',()=>{
 const f=obstructionFixture(ink=>{for(let y=25;y<85;y++)for(let x=80;x<140;x++)if(Math.hypot(x-110,y-55)<24)ink(x,y);});
 const b=E.detectOcclusions(f.data,f.w,f.h,C.DEFAULTS,f.regions);assert.equal(b.length,1);assert.equal(b[0].type,'occlusion');assert.equal(b[0].pad,0);assert.ok(Math.abs(b[0].centerX-110)<2&&Math.abs(b[0].centerY-55)<2);
 const d=C.classify({regions:f.regions,boxes:b},C.DEFAULTS);assert.equal(d.category,'NG-Defect');assert.equal(d.counts.occlusions,1);assert.equal(d.completeness,'partial');
});
test('thin tracks, extended thick tracks, image-edge shading and small spots are not large obstructions',()=>{
 const f=obstructionFixture(ink=>{
  for(let y=40;y<44;y++)for(let x=20;x<190;x++)ink(x,y);
  for(let y=90;y<115;y++)for(let x=20;x<205;x++)ink(x,y);
  for(let y=0;y<65;y++)for(let x=210;x<240;x++)ink(x,y);
  for(let y=60;y<65;y++)for(let x=100;x<105;x++)ink(x,y);
 });assert.equal(E.detectOcclusions(f.data,f.w,f.h,C.DEFAULTS,f.regions).length,0);
});
test('large-dark switch, polarity, peer scale and underexposure gate extra detection',()=>{
 const f=obstructionFixture(ink=>{for(let y=25;y<85;y++)for(let x=80;x<140;x++)if(Math.hypot(x-110,y-55)<24)ink(x,y);});
 for(const options of [{...C.DEFAULTS,largeDark:false},{...C.DEFAULTS,pol:'light'}])assert.deepEqual(E.detectOcclusions(f.data,f.w,f.h,options,f.regions),[]);
 assert.deepEqual(E.detectOcclusions(f.data,f.w,f.h,C.DEFAULTS,f.regions.slice(0,2)),[]);
 f.data.fill(20);assert.deepEqual(E.detectOcclusions(f.data,f.w,f.h,C.DEFAULTS,f.regions),[]);
});
