import {platformName} from './core.js';
import {createCaptureReader} from './capture-visible.js';
let captureBusy=false;
export const captureBuild='1.4.18';
export const captureRunning=()=>captureBusy;
const readVisibleTab=createCaptureReader((windowId,options)=>chrome.tabs.captureVisibleTab(windowId,options));
async function verifyActive(tab){const [active]=await chrome.tabs.query({active:true,windowId:tab.windowId});if(active?.id!==tab.id)throw new Error('截图期间切换了标签页，截图已取消。请保持 AI 页面显示后重试。');}
async function evaluate(tabId,method,args=[]){
  const [result]=await chrome.scripting.executeScript({target:{tabId},func:async(method,args)=>{
    try{
      const helper=method==='captureInfo'?globalThis.AISourceCollector:globalThis.AISourceCapture;
      if(typeof helper?.[method]!=='function')throw new Error('页面截图脚本尚未就绪，请刷新 AI 页面后重试。');
      return {ok:true,value:await helper[method](...args)};
    }catch(error){return {ok:false,error:error.message,frameGeometry:error.frameGeometry};}
  },args:[method,args]});
  if(!result?.result?.ok)throw Object.assign(new Error(result?.result?.error||'页面没有返回截图数据，请刷新页面后重试。'),{frameGeometry:result?.result?.frameGeometry});
  return result.result.value;
}
async function crop(dataUrl,rect){
  const image=await createImageBitmap(await (await fetch(dataUrl)).blob());
  try{
    const sx=image.width/rect.viewportWidth,sy=image.height/rect.viewportHeight;
    if(Math.abs(sx-sy)>.02)throw new Error('截图期间窗口尺寸变化，请重新截图。');
    const x=Math.round(rect.x*sx),y=Math.round(rect.y*sy),width=Math.round(rect.width*sx),height=Math.round(rect.height*sy);
    const canvas=new OffscreenCanvas(width,height);canvas.getContext('2d').drawImage(image,x,y,width,height,0,0,width,height);
    const bytes=new Uint8Array(await (await canvas.convertToBlob({type:'image/png'})).arrayBuffer());
    let binary='';for(let start=0;start<bytes.length;start+=32768)binary+=String.fromCharCode(...bytes.subarray(start,start+32768));
    return {png:btoa(binary),width,height};
  }finally{image.close();}
}
export async function captureAnswer(message,api){
  if(captureBusy)throw new Error('已有截图正在进行，请等待完成。');
  captureBusy=true;
  let tab,metadata;
  try{
    [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.url||!tab.url.startsWith('https://')||platformName(tab.url)==='手动导入')throw new Error('请切换到侧栏支持的 AI 平台回答页面，再点击截图。');
    // Test the native API before changing the page. Optional capture permission
    // is requested only by the panel's explicit, disclosed permission button.
    try{await readVisibleTab(tab.windowId,{format:'png'},()=>verifyActive(tab));}catch(error){
      if(/activeTab|permission|all_urls/i.test(error.message))throw Object.assign(new Error('Chrome 尚未授予截图权限。请阅读下方说明，选择“启用截图权限并重试”；不启用仍可导入和导出信源。'),{code:'CAPTURE_PERMISSION_REQUIRED',details:error.message,captureAttempts:error.captureAttempts});
      throw Object.assign(new Error('浏览器截图失败：'+error.message),{details:error.message,captureAttempts:error.captureAttempts});
    }
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['collector.js','answer-capture.js']});
    metadata=await evaluate(tab.id,'begin');
    const frames=[];let offset=0,bytes=0;
    for(let n=0;n<100;n++){
      const active=await chrome.tabs.query({active:true,windowId:tab.windowId});
      if(active[0]?.id!==tab.id)throw new Error('截图期间切换了标签页，截图已取消。请保持 AI 页面显示后重试。');
      const rect=await evaluate(tab.id,'frame',[offset]);
      const current=await chrome.tabs.query({active:true,windowId:tab.windowId});
      if(current[0]?.id!==tab.id)throw new Error('截图期间切换了标签页，截图已取消。');
      const png=await readVisibleTab(tab.windowId,{format:'png'},()=>verifyActive(tab));
      await evaluate(tab.id,'verify',[rect]);
      const cropped=await crop(png,rect);bytes+=cropped.png.length;
      if(bytes>72*1024*1024)throw new Error('回答截图超过本次大小限制，请展开较短的一段回答后截图。');
      frames.push(cropped);offset=rect.next;
      chrome.runtime.sendMessage({type:'CAPTURE_PROGRESS',percent:Math.min(99,Math.round(offset/rect.total*100)),frames:frames.length}).catch(()=>{});
      if(offset>=rect.total-1){
        const finalInfo=await evaluate(tab.id,'snapshot');
        const captureContext={origin:metadata.origin,finalOrigin:finalInfo.origin,questionBeforeCharacters:metadata.question.length,questionAfterCharacters:finalInfo.question.length,answerBeforeCharacters:metadata.answer.length,answerAfterCharacters:finalInfo.answer.length};
        if(finalInfo.origin!==metadata.origin||finalInfo.answer.replace(/\s/g,'')!==metadata.answer.replace(/\s/g,''))throw Object.assign(new Error('回答内容在截图期间发生了变化，请等待回答完成后重试。'),{captureContext});
        if(finalInfo.question.replace(/\s/g,'')!==metadata.question.replace(/\s/g,''))throw Object.assign(new Error('提问内容在截图期间发生了变化，请重新截图。'),{captureContext});
        await evaluate(tab.id,'finish');
        const task=await api('/screenshots','POST',{...metadata,taskId:message.taskId,keyword:message.keyword||metadata.keyword,frames},90000);
        await chrome.storage.local.set({currentTaskId:task.id});return task;
      }
    }
    throw new Error('回答过长，本次未保存不完整截图。请选择较短的回答后重试。');
  }catch(error){
    if(!error.captureContext)error.captureContext={origin:metadata?.origin||tab?.url||'',stage:metadata?'capture':'prepare',frameGeometry:error.frameGeometry};
    throw error;
  }finally{
    if(tab?.id)try{await evaluate(tab.id,'finish');}catch{}
    captureBusy=false;
  }
}
