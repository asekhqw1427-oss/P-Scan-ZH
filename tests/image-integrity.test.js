'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const ctx={window:{scanHost:{onJob(){}}},Uint8Array,DataView,Error};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app/scan.js'),'utf8'),ctx);
for(const name of ['good.png','good.jpg','good.bmp'])test('accept complete and hold truncated '+name,()=>{
  const bytes=fs.readFileSync(path.join(__dirname,'fixtures',name));
  assert.doesNotThrow(()=>ctx.checkCompleteImage(bytes));
  assert.throws(()=>ctx.checkCompleteImage(bytes.subarray(0,bytes.length-16)));
});
test('reject unknown image signature before browser decoding',()=>assert.throws(()=>ctx.checkCompleteImage(Buffer.from('not an image'))));
