'use strict';
function checkCompleteImage(bytes){
  const a=new Uint8Array(bytes),n=a.length;
  if(n>=8&&a[0]===137&&a[1]===80&&a[2]===78&&a[3]===71){
    const v=new DataView(a.buffer,a.byteOffset,a.byteLength);let p=8,ended=false;
    while(p+12<=n){const size=v.getUint32(p);if(size>n-p-12)break;const type=String.fromCharCode(...a.slice(p+4,p+8));if(type==='IEND'&&size===0){ended=true;break;}p+=size+12;}
    if(!ended)throw Error('PNG 尚未寫入完成（找不到 IEND）；檔案更新後將重新檢測');
  }else if(n>=2&&a[0]===255&&a[1]===216){
    if(n<4||a[n-2]!==255||a[n-1]!==217)throw Error('JPEG 缺少完整的結尾標記；請確認檔案已寫入完成');
  }else if(n>=2&&a[0]===66&&a[1]===77){
    if(n<26||new DataView(a.buffer,a.byteOffset,a.byteLength).getUint32(2,true)>n)throw Error('BMP 尚未寫入完成');
  }else throw Error('無法辨識 PNG／JPEG／BMP 檔頭');
}
function roi(ctx,r,w,h){
  const x=r.cx*w,y=r.cy*h,rx=r.w*w/2,ry=r.h*h/2;ctx.beginPath();
  if(r.shape==='circle')ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);
  else{const t=Math.SQRT2-1;[[-t,-1],[t,-1],[1,-t],[1,t],[t,1],[-t,1],[-1,t],[-1,-t]].forEach(([a,b],i)=>i?ctx.lineTo(x+a*rx,y+b*ry):ctx.moveTo(x+a*rx,y+b*ry));ctx.closePath();}
}
function annotate(canvas,result){
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  ctx.lineWidth=Math.max(1.5,w/650);ctx.font='bold '+Math.max(12,w/65)+'px sans-serif';
  const label=(text,x,y,color)=>{x=Math.max(2,Math.min(w-70,x));y=Math.max(16,Math.min(h-2,y));ctx.fillStyle='rgba(255,255,255,.88)';ctx.fillRect(x-2,y-13,ctx.measureText(text).width+5,17);ctx.fillStyle=color;ctx.fillText(text,x,y);};
  for(let i=0;i<result.regions.length;i++){
    const r=result.regions[i],color=r.partial?'#ba6700':'#08755e';
    roi(ctx,r,w,h);ctx.setLineDash([4,4]);ctx.strokeStyle=r.partial?'#ef9200':'#96bcaf';ctx.stroke();ctx.setLineDash([]);
    if(r.inspection){roi(ctx,r.inspection,w,h);ctx.strokeStyle='#00b98d';ctx.stroke();}
    label('P'+(i+1)+(r.partial?' *':''),(r.cx-r.w/2)*w,(r.cy-r.h/2)*h-3,color);
  }
  for(const r of result.rejectedRegions||[])if(r.needsReview){roi(ctx,r,w,h);ctx.setLineDash([5,4]);ctx.strokeStyle='#e18b00';ctx.stroke();ctx.setLineDash([]);label('複核',(r.cx-r.w/2)*w,(r.cy-r.h/2)*h-3,'#9b5600');}
  for(const b of result.uncertainBoxes||[]){ctx.strokeStyle='#d58500';ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.strokeRect(b.x-2,b.y-2,b.w+4,b.h+4);ctx.setLineDash([]);label(b.id,b.x,b.y-5,'#9b5600');}
  const scope=result.scope;
  if(scope&&(scope.x||scope.y||scope.w!==w||scope.h!==h)){ctx.strokeStyle='#0085dc';ctx.lineWidth=2;ctx.strokeRect(scope.x+.5,scope.y+.5,scope.w-1,scope.h-1);}
  for(const b of result.boxes){ctx.strokeStyle='#e22445';ctx.lineWidth=Math.max(2,w/650);ctx.strokeRect(b.x-2,b.y-2,b.w+4,b.h+4);label(b.id, b.x,b.y-5,'#bd1536');}
}
window.scanHost.onJob(async job=>{
  let url,worker;
  try{
    checkCompleteImage(job.bytes);
    url=URL.createObjectURL(new Blob([job.bytes]));
    const img=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('無法讀取影像；檔案可能尚未寫入完成或格式損壞'));im.src=url;});
    const originalWidth=img.naturalWidth,originalHeight=img.naturalHeight;
    if(originalWidth*originalHeight>60000000)throw Error('影像超過 6,000 萬像素上限');
    if(Math.min(originalWidth,originalHeight)<80)throw Error('影像短邊至少需要 80 像素');
    const scale=Math.min(1,1600/Math.max(originalWidth,originalHeight));
    const width=Math.round(originalWidth*scale),height=Math.round(originalHeight*scale);
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='white';ctx.fillRect(0,0,width,height);ctx.drawImage(img,0,0,width,height);
    const pixels=ctx.getImageData(0,0,width,height).data;
    worker=new Worker('scan-worker.js');
    const result=await new Promise((resolve,reject)=>{
      worker.onmessage=e=>e.data.error?reject(Error(e.data.error)):resolve(e.data.result);
      worker.onerror=e=>reject(Error(e.message));worker.postMessage({pixels,w:width,h:height,options:job.options},[pixels.buffer]);
    });
    annotate(canvas,result);
    window.scanHost.complete({id:job.id,result:{...result,width,height,originalWidth,originalHeight,preview:canvas.toDataURL('image/png')}});
  }catch(error){window.scanHost.complete({id:job.id,error:error.message});}
  finally{if(url)URL.revokeObjectURL(url);if(worker)worker.terminate();}
});
