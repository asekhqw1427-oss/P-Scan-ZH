'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const call=(name,...args)=>ipcRenderer.invoke(name,...args);
contextBridge.exposeInMainWorld('scanner',Object.freeze({
  state:()=>call('state'),pickFolder:()=>call('pick-folder'),save:c=>call('save',c),
  start:()=>call('start'),pause:()=>call('pause'),preview:c=>call('preview',c),
  result:id=>call('result',id),retry:()=>call('retry'),resetHistory:()=>call('reset-history'),exportCSV:()=>call('export-csv'),
  openFolder:key=>call('open-folder',key),hide:()=>call('hide'),quit:()=>call('quit'),
  onState:fn=>{ipcRenderer.on('state-update',(_e,value)=>fn(value));}
}));
