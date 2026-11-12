// Independent of panel.js so a module/startup failure is visible and diagnosable.
(() => {
 const button=document.getElementById('diagnose');const notice=document.getElementById('notice');
 const show=(message,error=false)=>{notice.hidden=false;notice.textContent=message;notice.className=error?'error':'';};
 const saveError=async(message,platform='插件侧栏')=>{try{const {connectionToken}=await chrome.storage.local.get('connectionToken');if(connectionToken)await fetch('http://127.0.0.1:18765/diagnostics',{method:'POST',headers:{Authorization:'Bearer '+connectionToken,'Content-Type':'application/json'},body:JSON.stringify({version:5,platform,clientError:message,answerCount:0})});}catch{}};
 window.addEventListener('error',event=>{const message='侧栏脚本错误：'+(event.message||event.target?.src||'资源加载失败');show(message,true);saveError(message);},true);
 window.addEventListener('unhandledrejection',event=>{const message='侧栏运行错误：'+String(event.reason?.message||event.reason);show(message,true);saveError(message);});
 document.getElementById('scriptState').textContent='诊断已就绪';
 const expectedBuild='1.4.15';
 const checkBuild=async()=>{
  const result=await chrome.runtime.sendMessage({type:'BUILD'});
  const details={kind:'PANEL_BUILD',panelBuild:expectedBuild,backgroundBuild:result?.data?.build||'未知',captureBuild:result?.data?.captureBuild||'旧版',manifestVersion:chrome.runtime.getManifest().version,extensionId:chrome.runtime.id};
  document.getElementById('runtimeVersions').textContent=`侧栏 ${details.panelBuild} · 后台 ${details.backgroundBuild} · 截图 ${details.captureBuild} · 清单 ${details.manifestVersion}`;
  saveError(JSON.stringify(details),'插件版本');
  if(!result?.ok||details.backgroundBuild!==expectedBuild||details.captureBuild!==expectedBuild||details.manifestVersion!==expectedBuild){
   document.getElementById('scriptState').textContent='后台版本未同步';
   show('侧栏与扩展后台版本未同步。请在 chrome://extensions 刷新体系致胜GEO-信源助手，再关闭并重新打开侧栏。',true);
  }
  return details;
 };
 checkBuild().catch(error=>show('扩展后台连接失败：'+error.message,true));
 button.dataset.ready='true';button.textContent='诊断当前页面';
 button.addEventListener('click',async()=>{
  button.disabled=true;button.textContent='正在诊断…';show('诊断按钮已触发，正在连接插件后台…');
  let timer;
  try{
   const build=await checkBuild();
   const result=await Promise.race([chrome.runtime.sendMessage({type:'DIAGNOSE'}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('插件后台 25 秒未响应，请检查 chrome://extensions 中的扩展错误。')),25000);})]);
   if(!result?.ok)throw new Error(result?.error||'后台没有返回结果');
   show(`页面诊断已保存到本机：${result.data.path}\n识别到 ${result.data.answerCount} 个回答区域。\n侧栏 ${build.panelBuild}／后台 ${build.backgroundBuild}／截图 ${build.captureBuild}／清单 ${build.manifestVersion}`);
  }catch(error){show('诊断失败：'+error.message,true);saveError(error.message);}
  finally{clearTimeout(timer);button.disabled=false;button.textContent='诊断当前页面';}
 });
})();
