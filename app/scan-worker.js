'use strict';
importScripts('engine.js');
onmessage=async ({data:{pixels,w,h,options}})=>{
  try{postMessage({result:await inspectCombined(pixels,w,h,options)});}
  catch(error){postMessage({error:error.message});}
};
