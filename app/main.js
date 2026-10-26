'use strict';
const {app,BrowserWindow,Menu,Tray,nativeImage,ipcMain,dialog,shell,session}=require('electron');
const path=require('node:path');const fs=require('node:fs');const fsp=fs.promises;const crypto=require('node:crypto');
const {Coordinator,presetHash}=require('./core');
app.setName('P-Scan-Defect-ID');
app.commandLine.appendSwitch('lang','zh-TW');
const testRoot=!app.isPackaged&&process.env.IMG_SCANNER_TEST_ROOT;
if(testRoot)app.setPath('userData',path.resolve(testRoot));
else app.setPath('userData',path.join(app.getPath('appData'),'P-Scan-Defect-ID'));
const single=testRoot?true:app.requestSingleInstanceLock();
if(!single)app.quit();
let ui,scanWindow,tray,manager,quitting=false,pendingJob=null,timer;
const trustedUI=event=>{if(!ui||event.sender!==ui.webContents||event.senderFrame!==ui.webContents.mainFrame)throw Error('不允許此介面請求');};
function secureWindow(win){
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  win.webContents.on('will-attach-webview',event=>event.preventDefault());
}
async function ensureWorker(){
  if(scanWindow&&!scanWindow.isDestroyed())return;
  scanWindow=new BrowserWindow({show:false,width:400,height:300,webPreferences:{preload:path.join(__dirname,'scan-preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  secureWindow(scanWindow);
  scanWindow.webContents.on('render-process-gone',()=>{if(pendingJob){pendingJob.reject(Error('影像處理程序已停止；請重試'));pendingJob=null;}if(scanWindow&&!scanWindow.isDestroyed())scanWindow.destroy();scanWindow=null;});
  await scanWindow.loadFile(path.join(__dirname,'scan.html'));
}
async function scan(bytes,options){
  await ensureWorker();if(pendingJob)throw Error('掃描器忙碌中');
  const id=crypto.randomUUID();
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{pendingJob=null;if(scanWindow&&!scanWindow.isDestroyed())scanWindow.destroy();scanWindow=null;reject(Error('單張影像掃描超過 180 秒。請縮小焊墊搜尋範圍後重試'));},180000);
    pendingJob={id,resolve:v=>{clearTimeout(timeout);resolve(v);},reject:e=>{clearTimeout(timeout);reject(e);}};
    scanWindow.webContents.send('scan-job',{id,bytes,options});
  });
}
ipcMain.on('scan-complete',(event,payload)=>{
  if(!scanWindow||event.sender!==scanWindow.webContents||!pendingJob||payload.id!==pendingJob.id)return;
  const job=pendingJob;pendingJob=null;payload.error?job.reject(Error(payload.error)):job.resolve(payload.result);
});
function show(){if(ui&&!ui.isDestroyed()){ui.show();ui.focus();}}
function updateTray(){
  if(!tray||!manager)return;
  tray.setToolTip('P-Scan Defect 1.5.1 繁體中文 · '+(manager.running?'掃描中':manager.busy?'目前影像完成後暫停':'已暫停'));
  tray.setContextMenu(Menu.buildFromTemplate([
    {label:'開啟 P-Scan Defect',click:show},
    {label:manager.running?'暫停掃描':'開始／繼續',click:async()=>{try{manager.running?manager.pause():await manager.start();}catch(e){show();dialog.showErrorBox('P-Scan Defect',e.message);}}},
    {type:'separator'},{label:'結束應用程式',click:requestQuit}
  ]));
}
async function requestQuit(){
  if(manager?.busy){const answer=await dialog.showMessageBox(ui,{type:'question',buttons:['繼續處理','停止並結束'],defaultId:0,cancelId:0,message:'目前影像尚未處理完成。若停止，未完成的工作會在下次開啟程式時重新檢測。'});if(answer.response!==1)return;}
  quitting=true;app.quit();
}
function handle(name,fn){ipcMain.handle(name,async(event,...args)=>{trustedUI(event);try{return {ok:true,value:await fn(...args)};}catch(e){return {ok:false,error:e.message};}});}
app.on('second-instance',show);
app.on('window-all-closed',()=>{});
app.on('before-quit',()=>{quitting=true;clearInterval(timer);});
app.whenReady().then(async()=>{
  if(!single)return;
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_details,callback)=>callback({cancel:true}));
  manager=await new Coordinator(app.getPath('userData'),scan).init();
  ui=new BrowserWindow({width:1380,height:930,minWidth:1050,minHeight:730,show:false,backgroundColor:'#eef3f6',title:'P-Scan Defect 1.5.1 繁體中文',icon:path.join(__dirname,'icon.png'),webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  secureWindow(ui);Menu.setApplicationMenu(null);
  ui.on('close',event=>{if(!quitting&&tray){event.preventDefault();ui.hide();}});
  ui.on('closed',()=>{if(!tray&&!quitting){quitting=true;app.quit();}});
  try{tray=new Tray(nativeImage.createFromPath(path.join(__dirname,'icon.png')));tray.on('double-click',show);tray.on('click',show);}catch(e){tray=null;}
  manager.on('change',state=>{if(ui&&!ui.isDestroyed())ui.webContents.send('state-update',state);updateTray();});
  handle('state',()=>manager.snapshot());
  handle('pick-folder',async()=>{const r=await dialog.showOpenDialog(ui,{properties:['openDirectory','createDirectory']});return r.canceled?null:r.filePaths[0];});
  handle('save',async c=>{const saved=await manager.saveConfig(c);if(process.platform==='win32'&&!testRoot)app.setLoginItemSettings({openAtLogin:saved.startAtLogin,path:process.execPath,args:['--background']});return manager.snapshot();});
  handle('start',async()=>{await manager.start();return manager.snapshot();});
  handle('pause',()=>{manager.pause();return manager.snapshot();});
  handle('hide',()=>{if(!tray)throw Error('系統匣無法使用；請使用最小化按鈕');ui.hide();});
  handle('quit',requestQuit);
  handle('preview',async c=>{if(manager.running||manager.busy)throw Error('請先暫停掃描');const r=await dialog.showOpenDialog(ui,{properties:['openFile'],filters:[{name:'影像',extensions:['png','jpg','jpeg','bmp']}]});return r.canceled?null:manager.preview(r.filePaths[0],c);});
  handle('result',id=>manager.result(id));
  handle('retry',()=>manager.retryHeld());
  handle('reset-history',async()=>{
    if(manager.running||manager.busy||manager.checking||manager.controlBusy)throw Error('重設前請按暫停，並等待檢測完成');
    const answer=await dialog.showMessageBox(ui,{type:'warning',buttons:['取消','重設歷史紀錄'],defaultId:0,cancelId:0,noLink:true,
      message:'刪除全部檢測紀錄？',
      detail:'將刪除歷史紀錄、計數、預覽及已檢測檔案標記。此操作無法復原。如有需要，請先匯出 CSV。\n\n原始照片、設定及 Good 和 NG-Defect 資料夾內的檔案會保留。若結果分類改變，請使用新的輸出資料夾，避免與舊結果衝突。\n\n重設後請按開始，重新檢測輸入資料夾中的全部影像。'});
    if(answer.response!==1)return null;
    return manager.resetHistory();
  });
  handle('open-folder',async key=>{const target=key==='data'?manager.root:manager.config[key];if(!['data','input','good','defect'].includes(key)||!target)throw Error('尚未設定資料夾');const error=await shell.openPath(target);if(error)throw Error(error);});
  handle('export-csv',async()=>{
    const r=await dialog.showSaveDialog(ui,{defaultPath:'P-Scan-Defect-檢測紀錄.csv',filters:[{name:'CSV',extensions:['csv']}]});if(r.canceled)return;
    const quote=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
    const lines=[['時間','檔案','模式','狀態','分類','焊墊','已檢測焊墊','被裁切焊墊','斑點','大型深色污點','待複核候選','覆蓋完整性','檢測原因','覆蓋完整性原因','參數 SHA256','來源 SHA256','目的地']];
    const latest=new Map();for(const line of (await fsp.readFile(manager.journal,'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;})).split('\n'))if(line){const row=JSON.parse(line);latest.set(row.key,row);}
    for(const row of latest.values())lines.push([row.time,row.filename,row.mode,row.status,row.category,row.counts?.pads,row.counts?.inspected,row.counts?.partial,row.counts?.spots,row.counts?.occlusions||0,row.counts?.review||0,row.completeness,row.error||row.reason,row.coverageReason,row.presetHash,row.sha256,row.destination]);
    await fsp.writeFile(r.filePath,'\ufeff'+lines.map(a=>a.map(quote).join(',')).join('\r\n'));return r.filePath;
  });
  await ui.loadFile(path.join(__dirname,'index.html'));updateTray();
  if(!process.argv.includes('--background')||!manager.config.startAtLogin||!tray)ui.show();
  if(process.argv.includes('--background')&&manager.config.startAtLogin)try{await manager.start();}catch(e){manager.error=e.message;manager.changed();show();}
  timer=setInterval(()=>manager.tick(),1000);
  if(testRoot)globalThis.__scannerTest={manager,scan,ui};
}).catch(error=>{dialog.showErrorBox('無法開啟 P-Scan Defect',error.message);quitting=true;app.quit();});
