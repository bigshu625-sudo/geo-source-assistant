import {dedupeSources,platformName} from './core.js';
import {captureAnswer,captureRunning,captureBuild} from './screenshot.js';
import {readChatGptCitations} from './chatgpt-sources.js';
const SERVICE='http://127.0.0.1:18765';
const BUILD='1.4.16';
let ticking=false;
// Keep an explicit toolbar action. Some side-panel paths still lack activeTab;
// the panel offers an optional permission prompt when native capture rejects it.
chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:false}).catch(()=>{});
chrome.action.onClicked.addListener(tab=>{
  chrome.sidePanel.open({windowId:tab.windowId}).catch(error=>chrome.storage.local.set({panelOpenError:error.message}));
});
chrome.alarms.create('queue',{periodInMinutes:0.5});
export async function api(path,method='GET',body,timeout=20000) {
  const {connectionToken=''}=await chrome.storage.local.get('connectionToken');
  const response=await fetch(SERVICE+path,{method,headers:{Authorization:`Bearer ${connectionToken}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(timeout)});
  const value=await response.json();
  if(!response.ok)throw new Error(value.error||`本机服务 HTTP ${response.status}`);
  return value;
}
async function reportBuild(){
  const {connectionToken}=await chrome.storage.local.get('connectionToken');
  if(!connectionToken)return;
  const details={kind:'BACKGROUND_BUILD',build:BUILD,captureBuild,manifestVersion:chrome.runtime.getManifest().version,extensionId:chrome.runtime.id};
  const signature=JSON.stringify(details);
  const {reportedBuild}=await chrome.storage.session.get('reportedBuild');
  if(reportedBuild===signature)return;
  await api('/diagnostics','POST',{version:5,platform:'插件版本',clientError:signature,answerCount:0},2000);
  await chrome.storage.session.set({reportedBuild:signature});
}
reportBuild().catch(()=>{});
async function diagnoseActive(){
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.url||platformName(tab.url)==='手动导入')throw new Error('请先切换到侧栏支持的 AI 平台回答页面。');
  await chrome.scripting.executeScript({target:{tabId:tab.id},files:['collector.js']});
  const result=await chrome.tabs.sendMessage(tab.id,{type:'DIAGNOSE'});
  if(!result?.ok)throw new Error(result?.error||'页面诊断失败');
  return api('/diagnostics','POST',{...result.data,platform:platformName(tab.url)});
}
async function collect(message) {
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.url||!tab.url.startsWith('https://')||platformName(tab.url)==='手动导入')throw new Error('请切换到侧栏支持的 AI 平台回答页面。');
  await chrome.scripting.executeScript({target:{tabId:tab.id},files:['collector.js']});
  const response=await chrome.tabs.sendMessage(tab.id,{type:'COLLECT',scope:message.scope});
  if(!response?.ok)throw new Error(response?.error||'页面没有返回信源');
  const data=response.data;
  data.sources=dedupeSources(data.sources,tab.url);
  if(!data.sources.length)throw new Error(data.warning||'没有找到信源链接。请展开参考资料，或点击另一段回答后再导入。');
  if(data.expected&&data.sources.length<data.expected)data.warning=[data.warning,`页面标注 ${data.expected} 条信源，本次只读取到 ${data.sources.length} 条，请展开列表并核对。`].filter(Boolean).join('\n');
  const task=await api('/tasks','POST',{...data,origin:tab.url,keyword:message.keyword||data.keyword});
  await chrome.storage.local.set({currentTaskId:task.id});
  return task;
}
async function enqueue(task,ids,downloadVideo) {
  const health=await api('/health','GET',undefined,2000);
  if(!health.sourceExtraction)throw new Error('本机服务尚未更新，请重启新版服务后再补采原文。');
  const {queue=[],activeJob=null}=await chrome.storage.local.get(['queue','activeJob']);
  const additions=task.items.filter(i=>ids?ids.includes(i.id):i.selected&&i.status!=='complete').filter(i=>!['processing','extracting'].includes(i.status));
  let queued=0;
  for(const i of additions) {
    if(activeJob?.itemId===i.id||queue.some(q=>q.itemId===i.id))continue;
    queue.push({taskId:task.id,itemId:i.id,url:i.url,type:i.type,downloadVideo:downloadVideo===true&&['video','gallery'].includes(i.type)});
    queued++;
    await api(`/tasks/${task.id}/items/${i.id}`,'PATCH',{status:'pending',warnings:[]});
  }
  await chrome.storage.local.set({queue});
  await tick();
  return {queued};
}
async function finish(job,page) {
  await api(`/tasks/${job.taskId}/items/${job.itemId}/extract`,'POST',{page,downloadVideo:job.downloadVideo===true});
  try{await chrome.tabs.remove(job.tabId);}catch{}
  await chrome.storage.local.set({activeJob:null});
  const {mediaByTab={}}=await chrome.storage.session.get('mediaByTab');
  delete mediaByTab[job.tabId];
  await chrome.storage.session.set({mediaByTab});
}
async function tick() {
  if(ticking)return;
  ticking=true;
  let shouldContinue=false;
  try {
    const {queue=[],activeJob=null}=await chrome.storage.local.get(['queue','activeJob']);
    if(activeJob){
      let tab;
      try{tab=await chrome.tabs.get(activeJob.tabId);}catch{
        await finish(activeJob,{error:'采集标签页已关闭，请重试'});shouldContinue=true;return;
      }
      const elapsed=Date.now()-activeJob.startedAt;
      if(elapsed>65000){await finish(activeJob,{error:'网页加载超时。请打开原网页完成登录或验证，再重试'});shouldContinue=true;return;}
      if(tab.status!=='complete'||elapsed<(activeJob.type==='article'?4000:16000))return;
      let page;
      try{
        await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',files:['extractor.js']});
        const [extracted]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:saveMedia=>extractSourcePage(saveMedia),args:[activeJob.downloadVideo===true]});
        page=extracted.result;
        if(!page)throw new Error('网页未返回内容');
        const {mediaByTab={}}=await chrome.storage.session.get('mediaByTab');
        const captured=mediaByTab[tab.id]||[];
        const merged=new Map(page.media.map(m=>[m.url,m]));
        for(const media of captured){const previous=merged.get(media.url);merged.set(media.url,{...previous,...media,kind:previous?.kind==='audio'||media.kind==='audio'?'audio':'video'});}
        page.media=[...merged.values()].slice(0,40);
      }catch(error){page={error:`无法读取网页：${error.message}`};}
      await finish(activeJob,page);shouldContinue=true;
    }else if(queue.length){
      const next=queue[0];
      // Persist tab and queue together before loading the source URL.
      const tab=await chrome.tabs.create({url:'about:blank',active:false});
      const job={...next,tabId:tab.id,startedAt:Date.now()};
      await chrome.storage.local.set({queue:queue.slice(1),activeJob:job});
      await api(`/tasks/${next.taskId}/items/${next.itemId}`,'PATCH',{status:'extracting'});
      await chrome.tabs.update(tab.id,{url:next.url});
      setTimeout(()=>tick(),next.type==='article'?5500:17000);
    }
  }catch(error){await chrome.storage.local.set({queueError:error.message});}
  finally{ticking=false;if(shouldContinue)setTimeout(()=>tick(),200);}
}
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='queue')tick();});
chrome.tabs.onUpdated.addListener(async(tabId,change)=>{
  if(change.status!=='complete')return;
  const {activeJob}=await chrome.storage.local.get('activeJob');
  if(activeJob?.tabId===tabId&&activeJob.type==='video'&&activeJob.downloadVideo===true){
    setTimeout(async()=>{
      try{await chrome.scripting.executeScript({target:{tabId},world:'MAIN',func:()=>{
        const root=document.querySelector('[data-e2e="video-detail"],main')||document;
        const video=root.querySelector('video');if(video){video.muted=true;video.play().catch(()=>{});}
      }});}catch{}
    },1500);
  }
  tick();
});
chrome.webRequest.onHeadersReceived.addListener(async details=>{
  if(details.tabId<0)return;
  const {activeJob}=await chrome.storage.local.get('activeJob');
  if(!activeJob||activeJob.tabId!==details.tabId||activeJob.downloadVideo!==true)return;
  const contentType=details.responseHeaders?.find(h=>h.name.toLowerCase()==='content-type')?.value||'';
  if(!/^(video|audio)\//i.test(contentType)&&!/douyinvod\.com.*(video|audio)|media-video|media-audio/.test(details.url))return;
  const {mediaByTab={}}=await chrome.storage.session.get('mediaByTab');
  const list=mediaByTab[details.tabId]||[];
  if(!list.some(m=>m.url===details.url)&&list.length<40)list.push({url:details.url,kind:/audio|mp4a/.test(contentType+' '+details.url)?'audio':'video'});
  mediaByTab[details.tabId]=list;
  await chrome.storage.session.set({mediaByTab});
},{urls:['https://*/*','http://*/*']},['responseHeaders']);
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id)return;
  const run=async()=>{
    if(message.type==='BUILD')return {build:BUILD,captureBuild,manifestVersion:chrome.runtime.getManifest().version};
    if(message.type==='CHATGPT_CITATIONS'){
      if(!sender.tab?.id||sender.frameId!==0||platformName(sender.url)!=='ChatGPT')return [];
      const [result]=await chrome.scripting.executeScript({target:{tabId:sender.tab.id},world:'MAIN',func:readChatGptCitations,args:[message.marker]});
      return result?.result||[];
    }
    if(message.type==='DIAGNOSE')return diagnoseActive();
    if(message.type==='CAPTURE'){
      if(message.clientBuild!==BUILD||captureBuild!==BUILD)throw Object.assign(new Error(`截图版本未同步：侧栏 ${message.clientBuild||'旧版'}，后台 ${BUILD}，截图模块 ${captureBuild}。请关闭旧侧栏并重新打开。`),{code:'BUILD_MISMATCH'});
      const health=await api('/health','GET',undefined,2000);
      if(!health.captureScopes?.includes('question-answer'))throw new Error('本机服务尚未更新问答截图功能，请重新启动体系致胜GEO-信源助手服务后再截图。');
      return captureAnswer(message,api);
    }
    if(message.type==='IMPORT')return collect(message);
    if(message.type==='PROCESS'){const task=await api(`/tasks/${message.taskId}`);return enqueue(task,message.ids,message.downloadVideo);}
    if(message.type==='TRASH_TASKS'){
      if(captureRunning())throw new Error('回答截图仍在保存，请完成后再清理。');
      const {queue=[],activeJob=null}=await chrome.storage.local.get(['queue','activeJob']);
      if((activeJob&&message.ids.includes(activeJob.taskId))||queue.some(job=>message.ids.includes(job.taskId)))throw new Error('所选任务仍在下载队列中，请处理完成后再清理。');
      return api('/library/trash','POST',{ids:message.ids});
    }
    if(message.type==='TICK'){await tick();return {ok:true};}
    if(message.type==='API')return api(message.path,message.method,message.body);
    if(message.type==='MANUAL_IMPORT'){
      const sources=dedupeSources(message.urls.map(url=>({url,title:'',recommendation:''})));
      if(!sources.length)throw new Error('请填写有效的 HTTP/HTTPS 链接。');
      const task=message.taskId?await api(`/tasks/${message.taskId}/sources`,'POST',{sources}):await api('/tasks','POST',{keyword:message.keyword||'手动导入',sources,origin:'manual'});
      await chrome.storage.local.set({currentTaskId:task.id});return task;
    }
    throw new Error('未知操作');
  };
  run().then(data=>respond({ok:true,data})).catch(async error=>{
    if(message.type==='CAPTURE'){
      const granted=await chrome.permissions.getAll().catch(()=>({}));
      await api('/diagnostics','POST',{version:5,platform:'截图后台',answerCount:0,clientError:JSON.stringify({message:error.message,code:error.code,chromeError:error.details,captureContext:error.captureContext,build:BUILD,captureBuild,manifestVersion:chrome.runtime.getManifest().version,attempts:error.captureAttempts,permissions:granted.permissions,origins:granted.origins})},2000).catch(()=>{});
    }
    respond({ok:false,error:error.message,code:error.code});
  });
  return true;
});
