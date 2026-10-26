'use strict';
// P-Scan Defect 1.3: offline pad geometry and interior spot inspection.
function findPads(data,w,h,o){
const scale=Math.min(1,640/Math.max(w,h)),W=Math.round(w*scale),H=Math.round(h*scale),g=new Float32Array(W*H);for(let y=0;y<H;y++)for(let x=0;x<W;x++){let i=(Math.min(h-1,Math.floor(y/scale))*w+Math.min(w-1,Math.floor(x/scale)))*4;g[y*W+x]=.299*data[i]+.587*data[i+1]+.114*data[i+2]}
const sample=(x,y)=>g[Math.max(0,Math.min(H-1,Math.round(y)))*W+Math.max(0,Math.min(W-1,Math.round(x)))];
const lo=Math.max(5,Math.min(W,H)*o.minpad/200),hi=Math.min(Math.min(W,H)*.45,Math.min(W,H)*o.maxpad/200),angles=24,cs=[],sn=[];for(let k=0;k<angles;k++){cs.push(Math.cos(k*2*Math.PI/angles));sn.push(Math.sin(k*2*Math.PI/angles))}
const candidates=[],stride=2,sensitivity=o.padsens??75,cut=o.contrast*(1.35-sensitivity*.008),required=.9-sensitivity*.0006;
function evaluate(x,y,radius,shape){if(x<0||y<0||x>=W||y>=H)return null;let score=0,good=0,seen=0,outerGood=0,innerSum=0,innerSq=0;for(let k=0;k<angles;k++){const u=cs[k],v=sn[k],factor=shape==='circle'?1:Math.min(1/Math.max(Math.abs(u),Math.abs(v)),Math.SQRT2/(Math.abs(u)+Math.abs(v))),r=radius*factor;
if(x+u*r*1.06<1||x+u*r*1.06>=W-1||y+v*r*1.06<1||y+v*r*1.06>=H-1)continue;
let ring=0,inner=0;for(const t of [.96,1,1.04])ring+=sample(x+u*r*t,y+v*r*t)/3;for(const t of [.35,.5,.65])inner+=sample(x+u*r*t,y+v*r*t)/3;const diff=inner-ring;if(sample(x+u*r*1.3,y+v*r*1.3)-ring>cut*.7)outerGood++;seen++;innerSum+=inner;innerSq+=inner*inner;if(diff>=cut){good++;score+=Math.min(diff,90)}}
if(seen<11||outerGood<Math.ceil(seen*.75)||good<Math.ceil(seen*required))return null;
const mean=innerSum/seen,sd=Math.sqrt(Math.max(0,innerSq/seen-mean*mean));if(sd>Math.max(13,score/seen*.45))return null;let core=0;for(let k=0;k<8;k++)core+=sample(x+cs[k*3]*radius*.2,y+sn[k*3]*radius*.2)/8;if(core<mean-30)return null;
return {x,y,r:radius,shape,score:score/seen-sd*.35,partial:x-radius<0||y-radius<0||x+radius>=W||y+radius>=H,coverage:good/seen}}
for(let radius=lo;radius<=hi;radius+=Math.max(1,radius*.06))for(let y=0;y<H;y+=stride)for(let x=0;x<W;x+=stride){let best=null;for(const shape of ['circle','octagon']){const a=evaluate(x,y,radius,shape);if(a&&(!best||a.score>best.score))best=a}if(best)candidates.push(best)}
candidates.sort((a,b)=>b.score-a.score);let kept=[];for(const a of candidates){if(kept.some(b=>Math.hypot(a.x-b.x,a.y-b.y)<Math.max(a.r,b.r)*1.35))continue;kept.push(a)}
// Refine locally to align the boundary before masking the interior.
kept=kept.map(a=>{let best=a;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)for(const dr of [-1,0,1])for(const shape of ['circle','octagon']){const v=evaluate(a.x+dx,a.y+dy,a.r+dr,shape);if(v&&v.score>best.score)best=v}return best});
if(o.sameSize&&kept.length>=4){const reference=kept.filter(a=>!a.partial).sort((a,b)=>b.score-a.score).slice(0,8).map(a=>a.r).sort((a,b)=>a-b);if(reference.length>=3){const median=reference[Math.floor(reference.length/2)];kept=kept.filter(a=>a.r>=median*.72&&a.r<=median*1.4)}}
return kept.map(a=>({cx:a.x/W,cy:a.y/H,w:2*a.r/W,h:2*a.r/H,shape:a.shape,partial:a.partial,coverage:Math.round(a.coverage*100),score:Math.round(a.score)}))}

function inside(x,y,w,h,o){
 return (o.regions||[]).some(p=>{
  if(p.partial||p.valid===false||p.inspection===null)return false;
  const r=p.inspection||p,rx=r.w*w/2,ry=r.h*h/2;
  if(rx<=0||ry<=0)return false;
  const u=Math.abs(x-r.cx*w)/rx,v=Math.abs(y-r.cy*h)/ry;
  return r.shape==='circle'?u*u+v*v<=1:u<=1&&v<=1&&u+v<=Math.SQRT2;
 });
}
function detect(data,w,h,o){const n=w*h,g=new Float32Array(n),valid=new Uint8Array(n),s=new Float64Array((w+1)*(h+1)),cnt=new Uint32Array(s.length);for(let i=0;i<n;i++){g[i]=.299*data[i*4]+.587*data[i*4+1]+.114*data[i*4+2];valid[i]=inside(i%w,(i/w)|0,w,h,o)&&!o.markerMask?.[i]}for(let y=0;y<h;y++){let row=0,num=0;for(let x=0;x<w;x++){const i=y*w+x;row+=g[i]*valid[i];num+=valid[i];s[(y+1)*(w+1)+x+1]=s[y*(w+1)+x+1]+row;cnt[(y+1)*(w+1)+x+1]=cnt[y*(w+1)+x+1]+num}}const residual=new Float32Array(n),mask=new Uint8Array(n),r=12,threshold=5+(100-o.sens)*.65;for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(!valid[y*w+x])continue;let a=Math.max(0,x-r),b=Math.min(w,x+r+1),c=Math.max(0,y-r),d=Math.min(h,y+r+1);const sum=t=>t[d*(w+1)+b]-t[c*(w+1)+b]-t[d*(w+1)+a]+t[c*(w+1)+a],count=sum(cnt);if(count<4)continue;const diff=g[y*w+x]-sum(s)/count;residual[y*w+x]=diff;mask[y*w+x]=o.pol==='dark'?diff< -threshold:o.pol==='light'?diff>threshold:Math.abs(diff)>threshold}const q=new Int32Array(n),out=[];for(let i=0;i<n;i++){if(!mask[i])continue;mask[i]=0;let tail=1,head=0,count=0,boundaryPixels=0,dark=0,light=0,sumx=0,sumy=0,contrast=0,x0=w,y0=h,x1=0,y1=0;q[0]=i;while(head<tail){let p=q[head++],x=p%w,y=(p/w)|0;count++;let boundary=false;for(const [dx,dy]of [[-2,0],[2,0],[0,-2],[0,2],[-1,-1],[1,-1],[-1,1],[1,1]]){const xx=x+dx,yy=y+dy;if(xx<0||xx>=w||yy<0||yy>=h||!valid[yy*w+xx]){boundary=true;break;}}if(boundary)boundaryPixels++;sumx+=x;sumy+=y;contrast+=Math.abs(residual[p]);if(residual[p]<0)dark++;else light++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){let xx=x+dx,yy=y+dy,j=yy*w+xx;if(xx>=0&&xx<w&&yy>=0&&yy<h&&mask[j]){mask[j]=0;q[tail++]=j}}}if(count>=o.area){const centerX=sumx/count,centerY=sumy/count,padIndex=o.regions.findIndex(r=>inside(i%w,(i/w)|0,w,h,{...o,regions:[r]})),pad=o.regions[padIndex],tone=dark/count>=.75?'深色斑點':light/count>=.75?'亮色斑點':'深淺混合斑點',bw=x1-x0+1,bh=y1-y0+1,form=Math.max(bw,bh)/Math.max(1,Math.min(bw,bh))>=3?'長條狀':'集中狀';let location='焊墊區域';if(pad){const dx=(centerX-pad.cx*w)/(pad.w*w/2),dy=(centerY-pad.cy*h)/(pad.h*h/2);location=Math.hypot(dx,dy)<.3?'中心':(dy<-.25?'上方':dy>.25?'下方':'')+(Math.abs(dx)>.25?(Math.abs(dy)>.25?'–':'')+(dx<0?'左側':'右側'):'');if(!location)location='靠近中心'}out.push({id:'D'+String(out.length+1).padStart(2,'0'),x:x0,y:y0,w:bw,h:bh,pixels:count,boundaryPixels,boundaryFraction:boundaryPixels/count,centerX,centerY,pad:padIndex+1,location,tone,form,meanContrast:Math.round(contrast/count),description:tone+'，形狀：'+form+'. '+(tone==='深色斑點'?'亮度低於周圍區域':tone==='亮色斑點'?'亮度高於周圍區域':'包含比周圍更暗及更亮的部分')+'；需由檢測人員目視確認。'})}}return out}

// A component almost entirely clipped by the inspection/masked boundary is
// insufficient evidence for NG. Keep it visible for review; never silently erase it.
function verifyCandidates(boxes){
 const confirmed=[],uncertain=[];
 for(const b of boxes){
  if(b.boundaryFraction>=.8){uncertain.push({...b,valid:false,type:'boundary-review',
   reason:'至少 80% 的候選像素距離檢測邊界或標記遮蔽區域不超過 2 像素',
   description:'靠近邊界的候選：尚無法區分焊墊邊緣或斑點；需要目視複核。'});}
  else confirmed.push(b);
 }
 return {confirmed,uncertain};
}

const quantile=(values,q)=>{
 const a=values.slice().sort((a,b)=>a-b);
 return a.length?a[Math.min(a.length-1,Math.floor((a.length-1)*q))]:0;
};
const shapeFactor=(shape,u,v)=>shape==='circle'?1:shape==='square'?1/Math.max(Math.abs(u),Math.abs(v)):Math.min(1/Math.max(Math.abs(u),Math.abs(v)),Math.SQRT2/(Math.abs(u)+Math.abs(v)));

// Fit the INNER edge of the dark boundary. Searching the band only around the
// candidate radius avoids treating a central spot as the pad boundary.
function refinePad(data,w,h,p,o){
 const cx=p.cx*w,cy=p.cy*h,r=p.w*w/2;
 const at=(x,y)=>{
  x=Math.round(x);y=Math.round(y);
  if(x<0||y<0||x>=w||y>=h)return NaN;
  const i=(y*w+x)*4;return .299*data[i]+.587*data[i+1]+.114*data[i+2];
 };
 const dirs=Array.from({length:64},(_,i)=>[Math.cos(i*Math.PI/32),Math.sin(i*Math.PI/32)]);
 const cores=[];
 for(const [u,v]of dirs)for(const t of [.30,.45,.60]){
  const g=at(cx+u*r*t,cy+v*r*t);if(Number.isFinite(g))cores.push(g);
 }
 const core=quantile(cores,.6),threshold=core-Math.max(o.contrast,core*.22),edges=[];
 let visible=0;
 for(let k=0;k<64;k++){
  const [u,v]=dirs[k];
  if(Number.isFinite(at(cx+u*r*1.1,cy+v*r*1.1)))visible++;
  let start=null,runs=[];
  for(let d=Math.max(2,Math.floor(r*.50));d<=r*1.50;d++){
   const value=at(cx+u*d,cy+v*d);
   if(value<threshold){if(start===null)start=d;}
   else if(start!==null){
    if(d-start>=2&&Number.isFinite(value)&&d>=r*.70&&start<=r*1.25)runs.push({inner:start,outer:d});
    start=null;
   }
  }
  runs.sort((a,b)=>Math.abs((a.inner+a.outer)/2-r)-Math.abs((b.inner+b.outer)/2-r));
  if(runs.length){const a=runs[0];edges.push({k,x:cx+u*a.inner,y:cy+v*a.inner,ox:cx+u*a.outer,oy:cy+v*a.outer});}
 }
 const reject=(reason,extra={})=>({...p,valid:false,needsReview:true,reason,geometry:{accept:false,...extra}});
 if(edges.length<16||edges.length<visible*.62)return reject('焊墊內部邊界可見範圍不足',{edges:edges.length,visible});
 const fits={};
 function fit(shape,x,y){
  const rows=edges.map(e=>{
   const dx=e.x-x,dy=e.y-y,d=Math.hypot(dx,dy),f=shapeFactor(shape,dx/d,dy/d);
   return {edge:e,n:d/f};
  });
  const radius=quantile(rows.map(a=>a.n),.5);
  if(radius<r*.4||radius>r*1.2)return;
  const error=quantile(rows.map(a=>Math.abs(a.n-radius)),.8)/radius;
  if(!fits[shape]||error<fits[shape].error)fits[shape]={shape,x,y,radius,error,rows};
 }
 const extent=Math.max(3,Math.ceil(r*.23));
 for(const shape of ['circle','octagon','square']){
  for(let dx=-extent;dx<=extent;dx+=2)for(let dy=-extent;dy<=extent;dy+=2)fit(shape,cx+dx,cy+dy);
  if(fits[shape]){const b=fits[shape];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)fit(shape,b.x+dx,b.y+dy);}
 }
 let best=[fits.circle,fits.octagon].filter(Boolean).sort((a,b)=>a.error-b.error)[0];
 if(!best)return reject('無法擬合焊墊內部邊界');
 const square=fits.square;
 if(square&&square.error<.065&&square.error+.025<best.error)return {...reject('方形／線路間隙', {squareError:square.error}),needsReview:false};
 const tolerance=Math.max(2,best.radius*.13),sectors=Array.from({length:8},()=>[0,0]);
 for(const a of best.rows){const s=sectors[a.edge.k>>3];s[1]++;if(Math.abs(a.n-best.radius)<=tolerance)s[0]++;}
 const observedSectors=sectors.filter(s=>s[1]>=3),strongSectors=observedSectors.filter(s=>s[0]/s[1]>=.6).length;
 const support=best.rows.filter(a=>Math.abs(a.n-best.radius)<=tolerance).length/edges.length;
 const geometry={accept:best.error<=.14&&support>=.78&&strongSectors>=Math.min(6,observedSectors.length)&&observedSectors.length>=3,fitError:best.error,support,edges:edges.length,visible,strongSectors,shape:best.shape};
 if(!geometry.accept)return reject('焊墊內部邊界不確定',geometry);
 // A small pixel margin protects against blur at the edge. The user's inset is
 // applied to this fitted inner boundary, not to the uncertain outer outline.
 const innerRadius=quantile(best.rows.map(a=>a.n),.25);
 const inspectRadius=Math.max(1,innerRadius*(1-o.inset/100)-1);
 const outerRadius=quantile(edges.map(e=>{
  const dx=e.ox-best.x,dy=e.oy-best.y,d=Math.hypot(dx,dy);
  return d/shapeFactor(best.shape,dx/d,dy/d);
 }),.5);
 const partial=p.partial||best.x-outerRadius<0||best.y-outerRadius<0||best.x+outerRadius>=w||best.y+outerRadius>=h;
 const outline=(radius)=>({cx:best.x/w,cy:best.y/h,w:2*radius/w,h:2*radius/h,shape:best.shape});
 return {...p,...outline(outerRadius),valid:true,partial,geometry,inner:outline(innerRadius),inspection:partial?null:outline(inspectRadius)};
}

// Long, thin, yellow annotation lines (e.g. operator rectangles) are masks,
// not bright defects. Short yellow spots are deliberately not excluded.
function markerMask(data,w,h){
 const yellow=new Uint8Array(w*h),line=new Uint8Array(w*h),mask=new Uint8Array(w*h);
 for(let i=0;i<yellow.length;i++){const r=data[4*i],g=data[4*i+1],b=data[4*i+2];yellow[i]=r>155&&g>145&&b<Math.min(r,g)*.78&&Math.abs(r-g)<70;}
 const minimum=Math.max(12,Math.round(Math.min(w,h)*.015));
 function runs(length,base,step){let start=-1,last=-1;for(let i=0;i<=length;i++){
  if(i<length&&yellow[base+i*step]){if(start<0)start=i;last=i;}
  else if(start>=0&&(i-last>1||i===length)){if(last-start+1>=minimum)for(let j=start;j<=last;j++)line[base+j*step]=1;start=-1;}
 }}
 for(let y=0;y<h;y++)runs(w,y*w,1);for(let x=0;x<w;x++)runs(h,x,w);
 for(let i=0;i<line.length;i++)if(line[i]){const x=i%w,y=Math.floor(i/w);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h)mask[(y+dy)*w+x+dx]=1;}
 return mask;
}

// Independent evidence for a compact, broad dark obstruction. Thin traces,
// extended tracks and image-edge shading do not meet this test. No fake pad is created.
function detectOcclusions(data,w,h,o,regions){
 if(o.largeDark===false||o.pol==='light')return [];
 const peers=regions.filter(p=>p.valid&&p.geometry?.accept&&!p.partial);
 if(peers.length<3)return [];
 const radii=peers.map(p=>Math.min(p.w*w,p.h*h)/2).sort((a,b)=>a-b);
 const R=radii[Math.floor(radii.length/2)];
 if(!Number.isFinite(R)||R<8)return [];
 const n=w*h,g=new Float32Array(n),sample=[];for(let i=0;i<n;i++){g[i]=.299*data[4*i]+.587*data[4*i+1]+.114*data[4*i+2];if(i%97===0)sample.push(g[i]);}sample.sort((a,b)=>a-b);const bg=sample[Math.floor(sample.length*.6)];if(bg<70)return [];const threshold=Math.min(55,bg*.4),d=new Float32Array(n),rad=Math.max(4,R*.30);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let i=y*w+x;if(g[i]>threshold||!x||!y||x===w-1||y===h-1)d[i]=0;else d[i]=Math.min(d[i-1]+1,d[i-w]+1,d[i-w-1]+Math.SQRT2,d[i-w+1]+Math.SQRT2);}
 for(let y=h-2;y>=1;y--)for(let x=w-2;x>=1;x--){let i=y*w+x;if(d[i])d[i]=Math.min(d[i],d[i+1]+1,d[i+w]+1,d[i+w+1]+Math.SQRT2,d[i+w-1]+Math.SQRT2);}
 const seen=new Uint8Array(n),q=new Int32Array(n),out=[];
 for(let i=0;i<n;i++){if(seen[i]||d[i]<rad)continue;let head=0,tail=1,x0=w,y0=h,x1=0,y1=0,peak=0;q[0]=i;seen[i]=1;while(head<tail){let p=q[head++],x=p%w,y=(p/w)|0;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);peak=Math.max(peak,d[p]);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){let xx=x+dx,yy=y+dy,j=yy*w+xx;if(xx>=0&&xx<w&&yy>=0&&yy<h&&!seen[j]&&d[j]>=rad){seen[j]=1;q[tail++]=j;}}}
 const bw=x1-x0+1,bh=y1-y0+1,fill=tail/(bw*bh),margin=Math.ceil(rad*1.5);
 if(Math.min(bw,bh)<2*rad||Math.max(bw,bh)>3*R||Math.max(bw,bh)/Math.min(bw,bh)>2.5||fill<.35||peak<rad*1.5)continue;
 const left=x0-margin,top=y0-margin,right=x1+margin,bottom=y1+margin;
 if(left<R*.5||top<R*.5||right>=w-R*.5||bottom>=h-R*.5)continue;
 let darkPixels=0,total=0,sum=0;
 for(let yy=top;yy<=bottom;yy++)for(let xx=left;xx<=right;xx++){total++;if(g[yy*w+xx]<=threshold){darkPixels++;sum+=g[yy*w+xx];}}
 if(darkPixels/total<.35)continue;
 out.push({type:'occlusion',valid:true,pad:0,shape:'unknown',x:left,y:top,w:right-left+1,h:bottom-top+1,pixels:darkPixels,
  centerX:(left+right)/2,centerY:(top+bottom)/2,location:'污點遮蔽區域',tone:'大型深色污點',form:'緊密狀',meanContrast:Math.round(bg-sum/darkPixels),
  evidence:{accept:true,method:'compact-dark-core-v1',peerPads:peers.length,referenceRadius:R,corePixels:tail,coreFill:fill,corePeak:peak,erosionRadius:rad,threshold},
  description:'相較於周圍焊墊圖案，此深色污點較大且厚實；焊墊邊界可能遭遮蔽，因此此檢測不要求完整焊墊。'});
 }
 return out;
}

function inspectionScope(w,h,o){
 if(o.roiMode!=='rect')return {x:0,y:0,w,h};
 const x=Math.max(0,Math.min(w-1,Math.floor(w*o.roiX/100))),y=Math.max(0,Math.min(h-1,Math.floor(h*o.roiY/100)));
 return {x,y,w:Math.min(w-x,Math.max(1,Math.round(w*o.roiW/100))),h:Math.min(h-y,Math.max(1,Math.round(h*o.roiH/100)))};
}
async function inspectCombined(data,w,h,o){
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||data.length!==w*h*4)throw Error('影像像素資料無效');
 const scope=inspectionScope(w,h,o),cw=scope.w,ch=scope.h;
 if(Math.min(cw,ch)<40)return {regions:[],boxes:[],rejectedRegions:[],scope,coverageIssues:['檢測範圍過小（分析影像短邊至少 40 像素）']};
 let pixels=data;
 if(cw!==w||ch!==h){
  pixels=new Uint8ClampedArray(cw*ch*4);
  for(let y=0;y<ch;y++)pixels.set(data.subarray(((y+scope.y)*w+scope.x)*4,((y+scope.y)*w+scope.x+cw)*4),y*cw*4);
 }
 const candidates=findPads(pixels,cw,ch,o),regions=[],rejectedRegions=[];
 for(const p of candidates){const r=refinePad(pixels,cw,ch,p,o);(r.valid?regions:rejectedRegions).push(r);}
 const markers=o.maskMarkers?markerMask(pixels,cw,ch):null;
 let excludedMarkerPixels=0;if(markers)for(let i=0;i<markers.length;i++)if(markers[i]&&inside(i%cw,Math.floor(i/cw),cw,ch,{regions}))excludedMarkerPixels++;
 const spots=regions.length?detect(pixels,cw,ch,{...o,regions,markerMask:markers}).map((b,i)=>({...b,type:'spot',valid:true,shape:regions[b.pad-1].shape,id:'D'+String(i+1).padStart(2,'0'),x:b.x+scope.x,y:b.y+scope.y,centerX:b.centerX+scope.x,centerY:b.centerY+scope.y})):[];
 const verified=verifyCandidates(spots);
 const occlusions=detectOcclusions(pixels,cw,ch,o,regions).filter(b=>!verified.confirmed.some(s=>s.centerX>=b.x+scope.x&&s.centerX<=b.x+b.w+scope.x&&s.centerY>=b.y+scope.y&&s.centerY<=b.y+b.h+scope.y)).map(b=>({...b,x:b.x+scope.x,y:b.y+scope.y,centerX:b.centerX+scope.x,centerY:b.centerY+scope.y}));
 const confirmed=[...verified.confirmed,...occlusions].map((b,i)=>({...b,id:'D'+String(i+1).padStart(2,'0')}));
 const uncertainBoxes=verified.uncertain.map((b,i)=>({...b,id:'T'+String(i+1).padStart(2,'0')}));
 const mapShape=r=>({...r,cx:(r.cx*cw+scope.x)/w,cy:(r.cy*ch+scope.y)/h,w:r.w*cw/w,h:r.h*ch/h});
 const mapRegion=r=>({...mapShape(r),...(r.inner?{inner:mapShape(r.inner)}:{}),...(r.inspection?{inspection:mapShape(r.inspection)}:{})});
 return {regions:regions.map(mapRegion),boxes:confirmed,uncertainBoxes,rejectedRegions:rejectedRegions.map(mapRegion),scope,excludedMarkerPixels,coverageIssues:excludedMarkerPixels?['黃色標記遮住 '+excludedMarkerPixels+' 個焊墊區域像素；請使用未加標記的影像確認完整性']:[]};
}
if(typeof module!=='undefined')module.exports={inspectCombined,findPads,refinePad,inside,inspectionScope,markerMask,detect,verifyCandidates,detectOcclusions};
