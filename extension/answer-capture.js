(() => {
  if(globalThis.AISourceCapture?.version===4)return;
  globalThis.AISourceCapture?.finish();
  let state=null;
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const painted=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  function finish(){
    if(!state)return;
    const previous=state;state=null;clearTimeout(previous.timer);
    previous.style.remove();previous.root.removeAttribute('data-ai-answer-capture');
    previous.question.removeAttribute('data-ai-question-capture');
    for(const element of previous.excluded)element.removeAttribute('data-ai-capture-exclude');
    for(const [element,left,top]of previous.positions.slice().reverse())element.scrollTo({left,top,behavior:'instant'});
  }
  async function begin(){
    if(state)throw new Error('页面截图正在进行，请等待完成。');
    const root=AISourceCollector.currentAnswer();if(!root?.isConnected)throw new Error('没有识别到回答，请点击回答正文后再截图。');
    const info=AISourceCollector.captureInfo(root);
    if(!info.answer.trim())throw new Error('回答内容为空，请等待回答完成后截图。');
    const question=AISourceCollector.questionFor(root);
    if(!question?.isConnected||!info.question.trim())throw new Error('没有识别到这轮回答对应的提问。请先在网页显示完整提问，再点击对应回答后截图。');
    let common=root;while(common&&!common.contains(question))common=common.parentElement;
    if(!common)throw new Error('提问与回答区域已变化，请刷新页面后重试。');
    const scrollables=[];
    for(let e=common;e;e=e.parentElement){const s=getComputedStyle(e);if(/auto|scroll|overlay/.test(s.overflowY)&&e.scrollHeight>e.clientHeight+4)scrollables.push(e);}
    const documentScroll=document.scrollingElement;
    if(!scrollables.includes(documentScroll))scrollables.push(documentScroll);
    const positions=scrollables.map(e=>[e,e.scrollLeft,e.scrollTop]);
    // Preserve both paths to the selected question and answer. Other turns,
    // navigation and floating input branches stay hidden without reflow.
    const paths=new Set();for(const target of [question,root])for(let e=target;e;e=e.parentElement)paths.add(e);
    const excluded=[];for(const parent of paths){if(parent===root||parent===question)continue;for(const sibling of parent.children)if(!paths.has(sibling)){sibling.setAttribute('data-ai-capture-exclude','');excluded.push(sibling);}}
    if(location.hostname==='gemini.google.com')for(const overlay of root.querySelectorAll('.hover-card-container,[role="dialog"]')){
      overlay.setAttribute('data-ai-capture-exclude','');excluded.push(overlay);
    }
    const style=document.createElement('style');style.textContent='html *,html{scroll-behavior:auto!important;animation-play-state:paused!important;transition:none!important;caret-color:transparent!important}[data-ai-capture-exclude][data-ai-capture-exclude][data-ai-capture-exclude],[data-ai-capture-exclude][data-ai-capture-exclude][data-ai-capture-exclude] *{visibility:hidden!important}';
    state={root,question,positions,style,excluded,scroller:scrollables[0],height:0,width:0,timer:setTimeout(finish,150000)};
    root.setAttribute('data-ai-answer-capture','');question.setAttribute('data-ai-question-capture','');document.documentElement.append(style);
    try{
      await Promise.race([document.fonts?.ready||Promise.resolve(),pause(1200)]);
      question.scrollIntoView({block:'start',inline:'nearest',behavior:'instant'});await painted();await pause(180);
      const rect=bounds();state.height=rect.height;state.width=rect.width;
      if(state.height<2||state.width<2)throw new Error('回答区域不可见，请展开回答后截图。');
      return {...info,scope:'question-answer',height:state.height,width:state.width};
    }catch(error){finish();throw error;}
  }
  function bounds(){
    if(!state?.root.isConnected||!state.question.isConnected)throw new Error('提问或回答区域已变化，请重新截图。');
    const answer=state.root.getBoundingClientRect(),question=state.question.getBoundingClientRect();
    const top=Math.min(answer.top,question.top),bottom=Math.max(answer.bottom,question.bottom),left=Math.min(answer.left,question.left),right=Math.max(answer.right,question.right);
    return {top,bottom,left,right,width:right-left,height:bottom-top};
  }
  async function frame(offset){
    if(!state||!state.root.isConnected)throw new Error('回答区域已变化，请重新截图。');
    const {root,scroller}=state;
    let scrollRect=scroller===document.scrollingElement?{top:0,left:0,bottom:innerHeight,right:innerWidth}:scroller.getBoundingClientRect();
    const boundaryTop=Math.max(0,scrollRect.top+(scroller===document.scrollingElement?0:scroller.clientTop));
    const r=bounds();
    scroller.scrollTo({top:scroller.scrollTop+r.top-boundaryTop+offset,left:scroller.scrollLeft,behavior:'instant'});
    await painted();await pause(100);
    const rect=bounds();
    if(Math.abs(rect.height-state.height)>2||Math.abs(rect.width-state.width)>2)throw new Error('回答布局正在变化，请等待生成和图片加载完成后重新截图。');
    scrollRect=scroller===document.scrollingElement?{top:0,left:0,bottom:innerHeight,right:innerWidth}:scroller.getBoundingClientRect();
    const top=Math.max(0,scrollRect.top+(scroller===document.scrollingElement?0:scroller.clientTop),rect.top+offset);
    const bottom=Math.min(innerHeight,scrollRect.bottom,rect.bottom);
    const left=Math.max(0,scrollRect.left,rect.left);const right=Math.min(innerWidth,scrollRect.right,rect.right);
    if(top-rect.top>offset+2||bottom-top<1||right-left<2)throw new Error('回答区域被遮挡或无法继续滚动，请展开回答并保持页面可见后重试。');
    if(right-left<state.width-2)throw new Error('回答横向超出窗口，请调整浏览器宽度后重新截图。');
    return {x:left,y:top,width:right-left,height:bottom-top,offset:top-rect.top,next:bottom-rect.top,total:state.height,viewportWidth:innerWidth,viewportHeight:innerHeight};
  }
  function verify(rect){
    if(!state?.root.isConnected)throw new Error('回答已变化，请重新截图。');
    const r=bounds();
    if(Math.abs(r.top-(rect.y-rect.offset))>1||Math.abs(r.left-rect.x)>1||innerWidth!==rect.viewportWidth||innerHeight!==rect.viewportHeight)throw new Error('截图期间页面被滚动或窗口变化，本次已取消，请保持页面不动后重试。');
  }
  function snapshot(){
    if(!state?.root.isConnected||!state.question.isConnected||AISourceCollector.questionFor(state.root)!==state.question)throw new Error('提问或回答区域已变化，请重新截图。');
    return AISourceCollector.captureInfo(state.root);
  }
  globalThis.AISourceCapture={version:4,begin,frame,verify,snapshot,finish};
  addEventListener('pagehide',finish);
})();
