'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('scanHost',Object.freeze({
  onJob:fn=>ipcRenderer.on('scan-job',(_e,job)=>fn(job)),
  complete:result=>ipcRenderer.send('scan-complete',result)
}));
