'use strict';
// Optional real Electron test. NOT RUN in the Linux build environment for 1.1.
const {_electron}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'p-scan-desktop-')),base=path.resolve(__dirname,'..'),fixtures=path.join(__dirname,'fixtures');
 await fs.mkdir(path.join(root,'input'));
 const app=await _electron.launch({executablePath:require('electron'),args:[...(process.getuid?.()===0?['--no-sandbox']:[]),path.join(base,'app')],env:{...process.env,IMG_SCANNER_TEST_ROOT:path.join(root,'data')},timeout:45000});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.waitForFunction(()=>document.querySelector('#sens').value==='30');
  assert.equal(await page.locator('html').getAttribute('lang'),'zh-Hant');
  for(const k of ['input','good','defect'])await page.locator('#'+k).fill(path.join(root,k));
  await page.locator('aside details').evaluate(el=>el.open=true);await page.locator('#expectedPads').fill('2');
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},path.join(fixtures,'good.png'));
  await page.locator('#test').click();await page.waitForFunction(()=>document.querySelector('#category').textContent==='Good',null,{timeout:180000});
  assert.equal(await page.locator('#zoom').inputValue(),'fit');
  await page.locator('#mode').selectOption('sort');await page.locator('#approved').check();await page.locator('#save').click();
  await page.waitForFunction(()=>!document.querySelector('#start').disabled);await page.locator('#start').click();
  await page.waitForFunction(()=>document.querySelector('#runState').textContent.includes('掃描中'));
  const expected={'good.png':'Good','spot.png':'NG-Defect','both.png':'NG-Defect','ring.png':'Good','no-pad.png':'Review','corrupt.jpg':null};
  for(const file of Object.keys(expected))await fs.writeFile(path.join(root,'input',file),file==='corrupt.jpg'?Buffer.from('broken'):await fs.readFile(path.join(fixtures,file)));
  await app.evaluate(()=>globalThis.__scannerTest.ui.close());
  assert.equal(await app.evaluate(()=>globalThis.__scannerTest.ui.isVisible()),false);
  const deadline=Date.now()+180000;let rows=[];
  while(Date.now()<deadline){rows=await app.evaluate(()=>globalThis.__scannerTest.manager.history.filter(r=>r.mode==='sort'));if(rows.length===6)break;await new Promise(r=>setTimeout(r,400));}
  assert.equal(rows.length,6);
  for(const r of rows){assert.equal(r.category,expected[r.filename],r.filename);if(r.destination)assert.deepEqual(await fs.readFile(r.destination),await fs.readFile(r.source));}
  await app.evaluate(()=>globalThis.__scannerTest.ui.show());await page.locator('#pause').click();await page.waitForFunction(()=>document.querySelector('#runState').textContent.includes('已暫停'));
  assert.deepEqual(errors,[]);await fs.mkdir(path.join(base,'test-results'),{recursive:true});
  await page.screenshot({path:path.join(base,'test-results','desktop.png'),fullPage:true});
  await fs.writeFile(path.join(base,'test-results','desktop.json'),JSON.stringify({platform:process.platform,passed:true,hiddenWindowScanning:true,routes:rows,uiErrors:errors},null,2));
  const exited=new Promise(resolve=>app.process().once('exit',code=>resolve(code)));await page.locator('#quit').click().catch(e=>{if(!/closed/i.test(e.message))throw e;});
  assert.equal(await Promise.race([exited,new Promise((_,reject)=>setTimeout(()=>reject(Error('Quit did not finish')),15000))]),0);
  console.log('Real Electron desktop smoke test passed. Defender was not tested.');
 }finally{await app.close().catch(()=>{});await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
