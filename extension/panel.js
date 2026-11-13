import {safeName,statusLabels,exportFilename,platformName} from './core.js';
const $=id=>document.getElementById(id);
const EXPECTED_BUILD='1.4.16';
let task=null,busy=false,uploadItem=null;
let refreshRevision=0,renderedTaskSignature='',renderedTaskId=null;
let library=null,pendingCleanup=null,previewUrls=[],capturing=false;
let exportFolderPath='',exportMode='chrome';
let browsedFolder=null,folderBrowseRevision=0,savingFolder=false;
const node=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
function notice(message,error=false){$('notice').hidden=!message;$('notice').textContent=message;$('notice').className=error?'error':'';if($('libraryDialog').open)$('libraryStatus').textContent=message;}
async function send(message){
  if(message.type==='CAPTURE'){
    const build=await send({type:'BUILD'});
    if(build.build!==EXPECTED_BUILD||build.captureBuild!==EXPECTED_BUILD||build.manifestVersion!==EXPECTED_BUILD)throw new Error(`截图版本未同步：侧栏 ${EXPECTED_BUILD}，后台 ${build.build||'未知'}，截图模块 ${build.captureBuild||'旧版'}，清单 ${build.manifestVersion||'未知'}。请在扩展管理中刷新原插件，再关闭并重新打开侧栏。`);
    message={...message,clientBuild:EXPECTED_BUILD};
  }
  let timer;const timeout=message.type==='CAPTURE'?240000:25000;
  const response=await Promise.race([chrome.runtime.sendMessage(message),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message.type==='CAPTURE'?'截图未在规定时间内完成，请保持页面显示并重新截图。':'插件操作超过 25 秒未返回，请刷新网页和侧栏后重试。')),timeout);})]).finally(()=>clearTimeout(timer));
  if(!response?.ok)throw Object.assign(new Error(response?.error||'插件后台没有响应'),{code:response?.code});return response.data;
}
const api=(path,method='GET',body)=>send({type:'API',path,method,body});
async function action(fn){if(busy){notice("上一个操作仍在执行，请稍候；可点击页面诊断检查连接。");return;}busy=true;try{await fn();}catch(error){notice(error.message,true);api('/diagnostics','POST',{version:3,platform:'插件侧栏',clientError:error.message,answerCount:0}).catch(()=>{});}finally{busy=false;}}
function setBusy(button,state,label){button.disabled=state;button.textContent=label;}
function showSettings(visible){
  $('settings').hidden=!visible;
  $('settingsToggle').setAttribute('aria-expanded',String(visible));
}
async function loadSettings(){
  const [settings,preferences]=await Promise.all([api('/settings'),chrome.storage.local.get('exportMode')]);
  $('savePath').textContent=`本机资料位置：${settings.savePath}`;
  const supportsFolders=Object.hasOwn(settings,'exportFolder');
  for(const id of ['openLibraryFolder','exportFolderPath','saveExportFolder'])$(id).disabled=!supportsFolders;
  $('chooseExportFolder').disabled=settings.folderBrowser!==true;
  $('folderHelp').hidden=settings.folderBrowser===true;
  exportFolderPath=settings.exportFolder||'';
  $('exportFolderPath').value=exportFolderPath;
  exportMode=exportFolderPath&&preferences.exportMode==='folder'?'folder':'chrome';
  renderExportDestination();
  $('health').textContent='本机已连接';$('health').classList.add('connected');
  $('connection').textContent='连接成功，任务保存在本机。';
}
function renderExportDestination(){
  const select=$('exportDestination');
  select.options[1].disabled=!exportFolderPath;
  select.value=exportMode;
  $('exportLocation').hidden=exportMode!=='folder';
  $('exportLocation').textContent=exportMode==='folder'?exportFolderPath:'';
}
async function setExportMode(mode){
  exportMode=exportFolderPath&&mode==='folder'?'folder':'chrome';
  await chrome.storage.local.set({exportMode});
  renderExportDestination();render();
}
async function applyExportFolder(path){
  exportFolderPath=path;
  $('exportFolderPath').value=path;
  await setExportMode(path?'folder':'chrome');
  folderFeedback('folderSettingsStatus',`已设为导出位置：${path}`);
}
function folderFeedback(id,message,error=false){
  const target=$(id);
  target.textContent=message;
  target.hidden=!message;
  target.classList.toggle('error',error);
}
async function browseExportFolders(path='',fallback=false){
  const revision=++folderBrowseRevision;
  const stillCurrent=()=>$('folderDialog').open&&revision===folderBrowseRevision;
  $('folderConfirm').disabled=true;
  $('folderUp').disabled=true;
  $('folderQuick').disabled=true;
  $('folderEntries').replaceChildren();
  $('folderCurrent').textContent=path;
  folderFeedback('folderBrowseStatus','正在读取文件夹…');
  try{
    const result=await api('/folders/list','POST',{path});
    if(!stillCurrent())return;
    browsedFolder=result;
    $('folderCurrent').textContent=result.path;
    const quick=$('folderQuick'),placeholder=node('option','选择位置');placeholder.value='';
    quick.replaceChildren(placeholder);
    for(const folder of result.quick){const option=node('option',folder.name);option.value=folder.path;quick.append(option);}
    quick.disabled=!result.quick.length;
    $('folderUp').disabled=!result.parent;
    $('folderConfirm').disabled=false;
    const entries=document.createDocumentFragment();
    for(const folder of result.folders){
      const button=node('button',folder.name);
      button.addEventListener('click',()=>browseExportFolders(folder.path));
      entries.append(button);
    }
    $('folderEntries').replaceChildren(entries);
    folderFeedback('folderBrowseStatus',result.truncated?'仅显示前 500 个子文件夹，可直接填写完整路径。':!result.folders.length?'当前文件夹没有子文件夹，可以直接使用。':'');
  }catch(error){
    if(!stillCurrent())return;
    if(fallback&&path)return browseExportFolders();
    folderFeedback('folderBrowseStatus',error.message,true);
    $('folderQuick').disabled=$('folderQuick').options.length<2;
    $('folderQuick').value='';
    $('folderUp').disabled=!browsedFolder;
  }
}
async function saveFolder(path,fromPicker=false){
  if(savingFolder)return;
  const feedback=fromPicker?'folderBrowseStatus':'folderSettingsStatus';
  if(!path?.trim()){folderFeedback(feedback,'请先选择文件夹，或填写完整路径。',true);return;}
  const button=$(fromPicker?'folderConfirm':'saveExportFolder');
  savingFolder=true;
  setBusy(button,true,'正在验证…');
  folderFeedback(feedback,'正在检查文件夹能否写入…');
  try{
    const {exportFolder}=await api('/export-folder','POST',{path});
    await applyExportFolder(exportFolder);
    if(fromPicker)$('folderDialog').close();
  }catch(error){folderFeedback(feedback,error.message,true);}
  finally{savingFolder=false;setBusy(button,false,fromPicker?'使用当前文件夹':'保存路径');}
}
const screenshotButtonLabel=count=>`${exportMode==='folder'?'保存截图':'下载截图'}${count>1?`（${count} 张）`:''}`;
async function refresh(){
  const revision=++refreshRevision;
  const tasks=await api('/tasks');
  const {currentTaskId}=await chrome.storage.local.get('currentTaskId');
  if(revision!==refreshRevision)return;
  const preferred=task?.id||currentTaskId;
  const current=tasks.some(t=>t.id===preferred)?preferred:tasks[0]?.id;
  $('taskSelect').replaceChildren();
  $('taskSelect').disabled=!tasks.length;
  if(!tasks.length){const empty=node('option','暂无任务');empty.value='';$('taskSelect').append(empty);}
  for(const t of tasks){const option=node('option',`${platformName(t.origin)} · ${t.keyword} · ${new Date(t.createdAt*1000).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} · ${t.count?`${t.done}/${t.count}`:`${t.screenshotCount||0} 次截图`}`);option.value=t.id;$('taskSelect').append(option);}
  if(current){
    $('taskSelect').value=current;
    if(task?.id===current&&task.updatedAt===tasks.find(t=>t.id===current).updatedAt){if(renderedTaskSignature!==`${task.id}:${task.updatedAt}`)render();return;}
    const updated=await api(`/tasks/${current}`);if(revision!==refreshRevision)return;task=updated;render();
  }else{task=null;render();}
}
const extracting=item=>['processing','extracting'].includes(item.status);
function selectedForExtraction(saveMedia){
  return (task?.items||[]).filter(item=>item.selected&&!extracting(item)&&(
    item.status!=='complete'||(saveMedia&&['video','gallery'].includes(item.type))));
}
function updateExtractionControls(){
  const items=task?.items||[],selected=items.filter(item=>item.selected);
  $('selectAll').checked=items.length>0&&selected.length===items.length;
  $('selectAll').indeterminate=selected.length>0&&selected.length<items.length;
  $('process').disabled=!selectedForExtraction($('downloadVideo').checked).length;
  const running=items.some(extracting);
  const done=items.filter(item=>['complete','partial','failed','unsupported'].includes(item.status)).length;
  $('progress').hidden=!running;
  $('progressBar').style.width=`${running?done/items.length*100:0}%`;
  $('progressLabel').textContent=running?`正在补采 · 已处理 ${done} / ${items.length} 条`:'';
}
function render(){
  const screenshots=task?.screenshots||[];
  const imageCount=screenshots.reduce((count,shot)=>count+shot.files.length,0);
  const screenshotTask=task?`${platformName(task.origin)} · ${task.keyword}`:'暂无任务';
  $('screenshotTask').textContent=screenshotTask;
  $('screenshotTask').title=screenshotTask;
  setBusy($('downloadScreenshots'),!imageCount,screenshotButtonLabel(imageCount));
  $('screenshots').replaceChildren();
  $('renameTask').disabled=!task;
  $('exportName').hidden=!task;
  if(renderedTaskId!==(task?.id||null)){
    renderedTaskId=task?.id||null;
    $('extractionTools').open=false;
    $('downloadVideo').checked=false;
  }
  $('sourceToolbar').hidden=!task?.items.length;
  updateExtractionControls();
  if(!task){
    renderedTaskSignature='';
    $('manualImport').textContent='建立链接任务';$('taskMeta').textContent='';
    for(const id of ['exportXlsx','exportMarkdown'])$(id).disabled=true;
    const empty=node('div',undefined,'empty');
    empty.append(node('p','当前没有任务。可在上方导入信源，或直接截取提问与回答。'),node('p','清理过的记录保存在回收站，可以选择恢复。'));
    const restore=node('button','查看回收站');restore.addEventListener('click',()=>action(async()=>{await loadLibrary();$('libraryView').value='trash';renderLibrary();$('libraryStatus').textContent='';$('libraryDialog').showModal();}));empty.append(restore);
    $('sources').replaceChildren(empty);return;
  }
  renderedTaskSignature=`${task.id}:${task.updatedAt}`;
  $('exportName').textContent=`Excel：${exportFilename(task)}\nMarkdown：${exportFilename(task,'md')}`;
  $('manualImport').textContent='补充到当前任务';
  const count=task.items.length;
  $('taskMeta').textContent=[platformName(task.origin),`${count} 条信源`,task.importWarning].filter(Boolean).join(' · ');
  $('exportXlsx').disabled=false;$('exportMarkdown').disabled=false;
  const fragment=document.createDocumentFragment();
  for(const item of task.items){
    const card=node('article',undefined,'source');
    const top=node('div',undefined,'top');const check=node('input');check.type='checkbox';check.checked=item.selected;check.setAttribute('aria-label',`选择 ${item.title||item.url}`);
    check.addEventListener('change',()=>action(async()=>{await api(`/tasks/${task.id}/items/${item.id}`,'PATCH',{selected:check.checked});item.selected=check.checked;updateExtractionControls();}));
    top.append(check,node('div',item.title||item.url,'title'));card.append(top);
    const meta=node('div',undefined,'meta');meta.append(node('span',statusLabels[item.status]||item.status,`status ${item.status}`),node('span',`${item.type==='article'?'文章':item.type==='gallery'?'图集':'视频'} · ${new URL(item.url).hostname}${item.author?' · '+item.author:''}`));card.append(meta);
    const snippet=item.recommendation||item.text||item.description||item.analysis?.summary||item.transcript;
    if(snippet)card.append(node('div',snippet.slice(0,600),'snippet'));
    if(item.warnings?.length)card.append(node('p',item.warnings.join('\n'),'warning'));
    const actions=node('div',undefined,'actions');const original=node('a','原网页');original.href=item.originalUrl||item.url;original.target='_blank';original.rel='noopener noreferrer';actions.append(original);
    const detail=node('button','查看内容');detail.addEventListener('click',()=>showDetail(item));actions.append(detail);
    const retry=node('button',item.status==='pending'?'提取原文':'重新提取');retry.disabled=extracting(item);retry.addEventListener('click',()=>requestExtraction([item.id]));actions.append(retry);
    if(item.type==='video'){const upload=node('button','导入视频');upload.disabled=['processing','extracting'].includes(item.status);upload.addEventListener('click',()=>{uploadItem=item;$('videoFile').click();});actions.append(upload);}
    card.append(actions);fragment.append(card);
  }
  $('sources').replaceChildren(fragment);
  if(!task.items.length)$('sources').append(node('div','已保存页面截图。可直接查看、下载或导出，也可补充信源链接。','empty'));
  for(const [index,shot]of screenshots.entries()){
    const label=shot.scope==='question-answer'?'问答截图':'回答截图';
    const card=node('article',undefined,'source');card.append(node('strong',`${label} ${index+1}`),node('p',`${new Date(shot.capturedAt*1000).toLocaleString('zh-CN')} · ${shot.width} × ${shot.height} 像素 · ${shot.files.length} 张图片`,'muted'));
    const controls=node('div',undefined,'actions');const preview=node('button','预览截图');preview.addEventListener('click',()=>action(()=>showScreenshot(task.id,shot)));
    const save=node('button',screenshotButtonLabel(shot.files.length));save.addEventListener('click',()=>action(()=>downloadScreenshots(task.id,[shot])));
    controls.append(preview,save);card.append(controls);$('screenshots').append(card);
  }
}
function clearPreview(){for(const url of previewUrls)URL.revokeObjectURL(url);previewUrls=[];}
async function showScreenshot(taskId,shot){
  clearPreview();const content=$('detailContent');content.replaceChildren();$('detailTitle').textContent=shot.scope==='question-answer'?'问答截图':'回答截图';
  const {connectionToken}=await chrome.storage.local.get('connectionToken');
  for(const file of shot.files){
    const response=await fetch(`http://127.0.0.1:18765/tasks/${taskId}/screenshots/${shot.id}/${encodeURIComponent(file)}`,{headers:{Authorization:`Bearer ${connectionToken}`}});
    if(!response.ok)throw new Error('截图读取失败，请刷新任务后重试。');
    const url=URL.createObjectURL(await response.blob());previewUrls.push(url);
    const image=node('img');image.src=url;image.alt=file;image.className='answer-preview';content.append(node('p',file,'muted'),image);
  }
  $('detailDialog').showModal();
}
function showDetail(item){
  $('detailTitle').textContent=item.title||'信源详情';const content=$('detailContent');content.replaceChildren();
  const blocks=[['原始链接',item.originalUrl||item.url],['处理链接',item.originalUrl&&item.originalUrl!==item.url?item.url:''],['推荐说明',item.recommendation],['文章正文',item.type==='article'?item.text:''],['发布文案',item.description],['口播转写',item.transcript]];
  for(const [label,value]of blocks)if(value){content.append(node('h3',label),node('pre',value));}
  if(item.analysis){content.append(node('h3','内容与标题分析'));for(const [key,label]of Object.entries({summary:'摘要',keyPoints:'核心观点',keywords:'关键词',titleAnalysis:'标题分析',relevance:'与搜索词关联',basis:'分析依据',limitations:'限制'})){const value=item.analysis[key];if(value)content.append(node('h3',label),node('pre',typeof value==='object'?JSON.stringify(value,null,2):value));}}
  if(item.files.length){content.append(node('h3','已保存素材'));for(const filename of item.files){const button=node('button',filename);button.addEventListener('click',()=>action(()=>exportMode==='folder'?saveExport(task.id,{kind:'source',itemId:item.id,filename}):download(`/tasks/${task.id}/files/${item.id}/${encodeURIComponent(filename)}`,filename)));content.append(button,node('span',' '));}}
  if(!item.text&&!item.description&&!item.transcript&&!item.analysis)content.append(node('p','已保留信源链接。需要原文时，可返回信源列表点击「提取原文」。','muted'));
  $('detailDialog').showModal();
}
async function download(path,filename){
  const {connectionToken}=await chrome.storage.local.get('connectionToken');
  // A real HTTP download retains the server's Chinese Content-Disposition name.
  // Blob URLs can be renamed to UUIDs by other download handlers or debugging tools.
  const id=await chrome.downloads.download({url:'http://127.0.0.1:18765'+path,headers:[{name:'Authorization',value:`Bearer ${connectionToken}`}],filename:`${chrome.runtime.getManifest().name}/${safeName(filename,180)}`,saveAs:false,conflictAction:'uniquify'});
  notice(`正在导出：${filename}`);
  const report=async()=>{
    const [item]=await chrome.downloads.search({id});
    if(!item||item.state==='in_progress')return;
    chrome.downloads.onChanged.removeListener(listener);
    notice(item.state==='complete'?`已导出：${item.filename}`:`导出失败：${item.error||'下载已中断'}`,item.state!=='complete');
  };
  const listener=delta=>{if(delta.id===id&&(delta.state||delta.filename))report().catch(error=>notice(error.message,true));};
  chrome.downloads.onChanged.addListener(listener);await report();
}
async function downloadScreenshots(taskId,shots){
  if(exportMode==='folder')return saveExport(taskId,{kind:'screenshots',shotIds:shots.map(shot=>shot.id)});
  for(const shot of shots){
    for(const file of shot.files)await download(`/tasks/${taskId}/screenshots/${shot.id}/${encodeURIComponent(file)}`,file);
  }
}
async function saveExport(taskId,selection){
  notice('正在另存到指定文件夹…');
  const {directory,files}=await api(`/tasks/${taskId}/save`,'POST',{...selection,folder:exportFolderPath});
  notice(`已保存 ${files.length} 个文件到：${directory}`);
}
function exportDocument(format){
  return exportMode==='folder'?saveExport(task.id,{kind:format}):download(`/tasks/${task.id}/${format}`,exportFilename(task,format));
}

function bytesLabel(bytes){return bytes<1024*1024?`${(bytes/1024).toFixed(1)} KB`:`${(bytes/1024/1024).toFixed(1)} MB`;}
async function loadLibrary(){library=await api('/library');renderLibrary();}
function renderLibrary(){
  const view=$('libraryView').value;
  $('libraryStats').textContent=`任务 ${library.tasks.length} 个 / ${bytesLabel(library.taskBytes)} · 回收站 ${library.trash.length} 个 / ${bytesLabel(library.trashBytes)}`;
  $('libraryPath').textContent=`资料位置：${library.savePath}`;
  $('librarySelectAll').checked=false;$('libraryRows').replaceChildren();
  for(const entry of library[view]){
    const row=node('label',undefined,'library-record');const check=node('input');check.type='checkbox';check.value=entry.id;check.disabled=entry.running;check.dataset.bytes=entry.bytes;
    const text=node('div',`${platformName(entry.origin)} · ${entry.keyword}`);
    text.append(node('small',`${new Date(entry.createdAt*1000).toLocaleString('zh-CN')} · ${entry.count} 条 · ${bytesLabel(entry.bytes)}${entry.running?' · 处理中':entry.archived?' · 已隐藏测试记录':''}`));
    row.append(check,text);$('libraryRows').append(row);
  }
  if(!library[view].length)$('libraryRows').append(node('p',view==='trash'?'回收站为空':'没有任务记录','muted'));
  $('libraryTrash').hidden=view!=='tasks';$('libraryRestore').hidden=view!=='trash';$('libraryPurge').hidden=view!=='trash';
}
function confirmCleanup(operation){
  const checks=[...$('libraryRows').querySelectorAll('input:checked:not(:disabled)')];
  if(!checks.length){notice('请先勾选需要处理的记录。');return;}
  pendingCleanup={operation,ids:checks.map(c=>c.value)};
  const size=bytesLabel(checks.reduce((sum,c)=>sum+Number(c.dataset.bytes),0));
  const labels={trash:'移到回收站',restore:'恢复任务',purge:'永久删除'};
  $('cleanupTitle').textContent=labels[operation];
  $('cleanupText').textContent=`所选 ${checks.length} 个任务，占用 ${size}。\n`+(operation==='purge'?'将永久删除这些任务、正文、视频和图片，删除后无法恢复。已导出的文件保留。':operation==='trash'?'任务和素材一起移入回收站，可恢复。清空回收站后才能释放空间。':'将任务和素材恢复到资料库。');
  $('cleanupConfirm').textContent=labels[operation];$('cleanupDialog').showModal();
}
function requestExtraction(ids){
  if(busy){notice('上一个操作仍在执行，请稍候。');return;}
  const downloadVideo=!ids&&$('downloadVideo').checked;
  const items=ids?(task?.items||[]).filter(item=>ids.includes(item.id)&&!extracting(item)):selectedForExtraction(downloadVideo);
  if(!items.length){notice('没有可补采的信源。');return;}
  const taskId=task.id;
  // The optional permission prompt must be initiated directly from a user gesture.
  const permission=chrome.permissions.request({origins:['https://*/*','http://*/*']});
  action(async()=>{
    if(!await permission)throw new Error('未授予信源网站读取权限，无法补采原文。已导入的信源仍可直接导出。');
    const {queued}=await send({type:'PROCESS',taskId,ids:items.map(item=>item.id),downloadVideo});
    if(!ids)$('downloadVideo').checked=false;
    updateExtractionControls();
    await refresh();
    notice(queued?`已安排补采 ${queued} 条信源${downloadVideo?'，同时保存可取得的视频／图集':''}。请保持 Chrome 运行。`:'所选信源已在补采队列中。');
  });
}
$('settingsToggle').addEventListener('click',()=>showSettings($('settings').hidden));
$('connect').addEventListener('click',()=>action(async()=>{await chrome.storage.local.set({connectionToken:$('token').value.trim()});await loadSettings();await refresh();notice('本机服务已连接。');}));
$('openLibraryFolder').addEventListener('click',()=>action(()=>api('/folders/open','POST',{which:'library'})));
$('chooseExportFolder').addEventListener('click',()=>{
  browsedFolder=null;
  $('folderDialog').showModal();
  browseExportFolders(exportFolderPath,true);
});
$('folderQuick').addEventListener('change',()=>{if($('folderQuick').value)browseExportFolders($('folderQuick').value);});
$('folderUp').addEventListener('click',()=>{
  if(browsedFolder)browseExportFolders($('folderCurrent').textContent===browsedFolder.path?browsedFolder.parent:browsedFolder.path);
});
$('folderCancel').addEventListener('click',()=>$('folderDialog').close());
$('folderDialog').addEventListener('close',()=>{folderBrowseRevision++;});
$('folderConfirm').addEventListener('click',()=>{if(browsedFolder)saveFolder(browsedFolder.path,true);});
$('saveExportFolder').addEventListener('click',()=>saveFolder($('exportFolderPath').value));
$('exportFolderPath').addEventListener('input',()=>folderFeedback('folderSettingsStatus',''));
$('exportFolderPath').addEventListener('keydown',event=>{
  if(event.key==='Enter'){event.preventDefault();saveFolder($('exportFolderPath').value);}
});
$('exportDestination').addEventListener('change',()=>action(()=>setExportMode($('exportDestination').value)));
$('openExportFolder').addEventListener('click',()=>action(()=>exportMode==='folder'?api('/folders/open','POST',{which:'export'}):chrome.downloads.showDefaultFolder()));
async function takeScreenshot(){
  capturing=true;
  try{
  notice('正在从本轮提问顶部截取完整问答，请保持 AI 标签页显示；完成后会恢复滚动位置。');
  task=await send({type:'CAPTURE',taskId:task?.id,keyword:$('keyword').value.trim()});refreshRevision++;render();await refresh();
  $('capturePermission').hidden=true;
  notice(`已将问答截图存入本机资料库：${task.screenshots.at(-1).files.join('、')}。需要副本时，可用侧栏顶部的截图按钮。`);
  }catch(error){if(error.code==='CAPTURE_PERMISSION_REQUIRED')$('capturePermission').hidden=false;throw error;}
  finally{capturing=false;}
}
$('captureAnswer').addEventListener('click',()=>action(async()=>{setBusy($('captureAnswer'),true,'正在截图…');try{await takeScreenshot();}finally{setBusy($('captureAnswer'),false,'截取提问与回答');}}));
$('downloadScreenshots').addEventListener('click',()=>action(()=>downloadScreenshots(task.id,task.screenshots)));
$('grantCapture').addEventListener('click',()=>{
  if(busy){notice('请等待当前操作完成后再启用截图权限。');return;}
  // Request synchronously in this click handler so Chrome retains the gesture.
  const permission=chrome.permissions.request({origins:['<all_urls>']});
  action(async()=>{
    setBusy($('grantCapture'),true,'等待 Chrome 权限确认…');
    try{
      if(!await permission)throw new Error('未启用截图权限。信源导入和导出仍可正常使用。');
      await takeScreenshot();
    }finally{setBusy($('grantCapture'),false,'启用截图权限并重试');}
  });
});
chrome.runtime.onMessage.addListener(message=>{if(message.type==='CAPTURE_PROGRESS'&&capturing)notice(`正在截取问答：${message.percent}% · 已截 ${message.frames} 段，请保持 AI 标签页显示。`);});
$('import').addEventListener('click',()=>action(async()=>{setBusy($('import'),true,'正在收集…');refreshRevision++;try{task=await send({type:'IMPORT',scope:$('scope').value,keyword:$('keyword').value.trim()});render();await refresh();notice(`已导入 ${task.items.length} 条信源。${task.importWarning?'\n'+task.importWarning:''}`);if($('captureOnImport').checked){if($('scope').value!=='current')notice('信源已导入。自动截图只适用于“当前回答”；可点击“截取提问与回答”单独保存。');else try{await takeScreenshot();}catch(error){notice(`信源已导入，截图未保存：${error.message}`,true);}}}finally{setBusy($('import'),false,'导入信源');}}));
$('manualImport').addEventListener('click',()=>action(async()=>{const urls=$('manualUrls').value.split(/\s+/).filter(Boolean);task=await send({type:'MANUAL_IMPORT',taskId:task?.id,keyword:$('keyword').value.trim(),urls});$('manualUrls').value='';await refresh();notice('链接已保存到任务中。');}));
$('taskSelect').addEventListener('change',()=>action(async()=>{refreshRevision++;const id=$('taskSelect').value;const selected=await api(`/tasks/${id}`);refreshRevision++;task=selected;await chrome.storage.local.set({currentTaskId:task.id});render();}));
$('refresh').addEventListener('click',()=>action(refresh));
$('renameTask').addEventListener('click',()=>{$('renameKeyword').value=task.keyword;$('renameDialog').showModal();});
$('renameCancel').addEventListener('click',()=>$('renameDialog').close());
$('renameSave').addEventListener('click',()=>action(async()=>{task=await api(`/tasks/${task.id}`,'PATCH',{keyword:$('renameKeyword').value});$('renameDialog').close();render();await refresh();notice('任务名已修改，导出文件名同步更新。');}));
$('manageLibrary').addEventListener('click',()=>action(async()=>{await loadLibrary();$('libraryStatus').textContent='';$('libraryDialog').showModal();}));
$('libraryClose').addEventListener('click',()=>$('libraryDialog').close());
$('libraryView').addEventListener('change',renderLibrary);
$('librarySelectAll').addEventListener('change',()=>{for(const check of $('libraryRows').querySelectorAll('input:not(:disabled)'))check.checked=$('librarySelectAll').checked;});
for(const [id,operation]of [['libraryTrash','trash'],['libraryRestore','restore'],['libraryPurge','purge']])$(id).addEventListener('click',()=>confirmCleanup(operation));
$('cleanupCancel').addEventListener('click',()=>{pendingCleanup=null;$('cleanupDialog').close();});
$('cleanupConfirm').addEventListener('click',()=>action(async()=>{
  const pending=pendingCleanup;if(!pending)return;pendingCleanup=null;$('cleanupDialog').close();
  const result=pending.operation==='trash'?await send({type:'TRASH_TASKS',ids:pending.ids}):await api(`/library/${pending.operation}`,'POST',{ids:pending.ids});
  refreshRevision++;
  if(pending.operation==='trash'&&pending.ids.includes(task?.id)){task=null;await chrome.storage.local.remove('currentTaskId');}
  await loadLibrary();await refresh();
  notice(pending.operation==='purge'?`已永久删除 ${result.count} 个任务，释放 ${bytesLabel(result.bytes)}。`:pending.operation==='trash'?`已将 ${result.count} 个任务移到回收站，可在回收站恢复。`:`已恢复 ${result.count} 个任务。`);
}));
$('selectAll').addEventListener('change',()=>action(async()=>{if(!task)return;const selected=$('selectAll').checked;for(const item of task.items)if(item.selected!==selected)await api(`/tasks/${task.id}/items/${item.id}`,'PATCH',{selected});await refresh();}));
$('process').addEventListener('click',()=>requestExtraction());
$('downloadVideo').addEventListener('change',updateExtractionControls);
$('detailClose').addEventListener('click',()=>$('detailDialog').close());
$('detailDialog').addEventListener('close',clearPreview);
$('exportXlsx').addEventListener('click',()=>action(()=>exportDocument('xlsx')));
$('videoFile').addEventListener('change',()=>action(async()=>{const file=$('videoFile').files[0];if(!file||!uploadItem)return;const {connectionToken}=await chrome.storage.local.get('connectionToken');const response=await fetch(`http://127.0.0.1:18765/tasks/${task.id}/items/${uploadItem.id}/upload`,{method:'POST',headers:{Authorization:`Bearer ${connectionToken}`,'Content-Type':'application/octet-stream'},body:file});const result=await response.json();if(!response.ok)throw new Error(result.error);$('videoFile').value='';await refresh();notice('视频已保存。可在这条信源的「查看内容」中下载。');}));
async function init(){const {connectionToken}=await chrome.storage.local.get('connectionToken');$('token').value=connectionToken||'';try{await loadSettings();await refresh();}catch(error){showSettings(true);notice(`初始化失败：${error.message}\n请检查本机服务和连接码后重试。`,true);}}
init();
setInterval(async()=>{if(busy)return;try{await send({type:'TICK'});await refresh();}catch{}},4000);

$('exportMarkdown').addEventListener('click',()=>action(()=>exportDocument('md')));

for(const link of document.querySelectorAll('.platform-link, #technicalSupportLink'))link.addEventListener('click',event=>{
  event.preventDefault();chrome.tabs.create({url:link.href}).catch(error=>notice(error.message,true));
});


document.getElementById('scriptState').textContent='主界面已就绪';
