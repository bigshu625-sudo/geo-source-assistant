(() => {
  if (globalThis.__aiSourceCollector===8) return;
  globalThis.__aiSourceCollector = 8;
  let chosen = null;
  let selectedFragment=null;let selectedText="";
  document.addEventListener("selectionchange",()=>{const selection=getSelection();if(selection?.rangeCount&&selection.toString().trim().length>15){selectedText=selection.toString().trim();selectedFragment=document.createElement("div");selectedFragment.append(selection.getRangeAt(0).cloneContents());}});
  const panelOwners=new WeakMap();
  const visible = e => !!e && e.getClientRects().length > 0;
  const text = e => e?.innerText?.trim() || '';
  const isChatGPT=location.hostname==='chatgpt.com';
  const isGemini=location.hostname==='gemini.google.com';
  const chatHeadings=role=>[...document.querySelectorAll(`main [data-conversation-role="${role}"]`)].map(e=>e.nextElementSibling).filter(visible);
  const profiles = {
    'yuanbao.tencent.com': {answer:'[class*="agent-chat__list__item--ai"], [class*="hyc-content-md"], [class*="hyc-common-markdown"]'},
    'yiyan.baidu.com': {answer:'[class*="answer-content"], [class*="assistant-message"], [class*="mark-down"]'},
    'wenxin.baidu.com': {answer:'[class*="answer-content"], [class*="assistant-message"], [class*="mark-down"]'},
    'kimi': {answer:'.segment-assistant, [class*="segment-assistant"], .markdown-container'},
    'qianwen': {answer:'[class*="chat-item-answer"], [class*="message-assistant"], [class*="markdown-body"]'}
  };
  const profile=profiles[location.hostname] || (/kimi/.test(location.hostname)?profiles.kimi:/qianwen|tongyi/.test(location.hostname)?profiles.qianwen:null);
  function answers() {
    if(isChatGPT){
      const current=chatHeadings('assistant');
      return current.length?current:[...document.querySelectorAll('main [data-message-author-role="assistant"]')].filter(visible);
    }
    if(isGemini)return [...document.querySelectorAll('model-response')].filter(e=>visible(e)&&e.querySelector('message-content'));
    if (/^(wenxin|yiyan)\.baidu\.com$/.test(location.hostname)){const nodes=[...document.querySelectorAll('.conversation-flow-answer-container')];if(nodes.length)return nodes;}
    if (/qianwen|tongyi/.test(location.hostname)){const nodes=[...document.querySelectorAll('[class*=message-select-wrapper-answer]')];if(nodes.length)return nodes;}
    if(location.hostname==='yuanbao.tencent.com'){const nodes=[...document.querySelectorAll('.agent-chat__list__item--ai')];if(nodes.length)return nodes;}
    if (location.hostname === 'chat.deepseek.com') return [...document.querySelectorAll('.ds-message')].filter(e=>e.querySelector('.ds-markdown') || e.querySelector('.ds-markdown-cite') || e.querySelector('.search-view-card__title'));
    if(profile){
      const nodes=[...document.querySelectorAll(profile.answer)].filter(e=>visible(e)&&text(e).length);
      if(nodes.length)return nodes.filter(e=>!nodes.some(other=>other!==e&&other.contains(e)));
    }
    const preferred = [...document.querySelectorAll('[data-testid="receive_message"], [data-testid*="assistant"], [data-message-role="assistant"], [data-role="assistant"]')];
    if (preferred.length) return preferred.filter(e=>!preferred.some(other=>other!==e && other.contains(e)));
    return [...document.querySelectorAll('[class*="flow-markdown"], [class*="markdown-body"], [class*="markdown-content"], [class*="message-content"], [class*="markdown"], [class*="mark-down"]')].filter(e=>text(e).length>30);
  }
  document.addEventListener('click', event=>{
    const found = answers().find(e=>e.contains(event.target));
    if (found) chosen = found;
  }, true);
  function anchorSources(root) {
    return [...(root.matches('a[href], [data-url], [data-href], [data-long-press-ext-info], [data-c="refer_panel"][data-click-extra]')?[root]:[]),...root.querySelectorAll('a[href], [data-url], [data-href], [data-long-press-ext-info], [data-c="refer_panel"][data-click-extra]')].flatMap(e=>{
      let info={};try{info=JSON.parse(e.getAttribute('data-long-press-ext-info')||e.getAttribute('data-click-extra')||'{}');}catch{}
      let url = info.link || info.ref_url || info.url || e.getAttribute('href') || e.dataset.url || e.dataset.href;
      try { const redirect=new URL(url,location.href);if(redirect.hostname===location.hostname){const target=['url','target','targetUrl','redirect'].map(k=>redirect.searchParams.get(k)).find(v=>/^https?:\/\//i.test(v||''));if(target)url=target;} } catch {return [];}
      if (!url) return [];
      try{if(!/^https?:/i.test(new URL(url, location.href).href))return [];}catch{return [];}
      const u = new URL(url, location.href);
      if (u.hostname === location.hostname || /^(cdn|lf\d*|static)\./.test(u.hostname) && /\.(png|svg|jpg)/.test(u.pathname)) return [];
      const card = e.closest('a') || e;
      const title = info.linkTitle || info.title || text(card.querySelector('.search-view-card__title, [class*="title"], h3, h4')) || e.getAttribute('title') || text(e);
      const recommendation = text(card.querySelector('.search-view-card__snippet, [class*="snippet"], [class*="description"]')) || text(e.closest('p, li')).slice(0,800);
      return [{url:u.href,title:title.replace(/^\d+[.、]\s*/,'').slice(0,300),titlePriority:(info.linkTitle||info.title)?4:card.querySelector('.search-view-card__title')?3:1,recommendation}];
    });
  }
  const pause = ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const referenceLabel=value=>/^(?:(?:show|view)\s+)?(?:sources?(?: and related links)?|citations?|references?|(?:查看|显示|展开)?(?:来源|信源|参考资料|引用))(?:\s*[（(]?\d+[）)]?)?$/i.test(value);
  const citationAnchor='a[href], [data-url], [data-href]';
  const citationDialog='[role="dialog"], sources-side-panel, source-panel, sources-list, [data-testid*="sources-sidebar"]';
  function referenceCards(root){
    return [...(root.matches(citationAnchor)?[root]:[]),...root.querySelectorAll(citationAnchor)].filter(visible).flatMap(anchor=>{
      const title=text(anchor.querySelector('.title, [data-testid*="title"], [class*="title"], h3, h4'));
      const snippet=text(anchor.querySelector('.snippet, [class*="snippet"], [class*="description"]'));
      return anchorSources(anchor).map(source=>({...source,title:title||source.title,recommendation:snippet||source.recommendation,titlePriority:title?4:source.titlePriority}));
    });
  }
  async function collectGeminiSidebar(current){
    const more=[...current.querySelectorAll('button[aria-label]')].find(button=>visible(button)&&
      /^(?:显示更多选项|更多选项|show more options|more options)$/i.test(button.getAttribute('aria-label').trim()));
    if(!more)return [];
    const findSidebar=()=>[...document.querySelectorAll('context-sidebar side-bar-sources')].find(visible);
    const hadSidebar=!!findSidebar();
    const findMenuItem=()=>[...document.querySelectorAll('[role="menuitem"]')].find(item=>visible(item)&&
      /^(?:查看信息来源|查看来源|view (?:information )?sources|show sources)$/i.test(text(item)));
    let selected=false;
    more.click();
    try{
      await pause(80);
      let item=findMenuItem();
      for(let i=0;i<8&&!item;i++){await pause(100);item=findMenuItem();}
      if(!item)return [];
      item.click();
      selected=true;
      await pause(250);
      for(let i=0;i<15;i++){
        const sidebar=findSidebar();
        const cards=sidebar?[...sidebar.querySelectorAll('inline-source-card a[href]')].flatMap(referenceCards):[];
        if(cards.length)return cards;
        await pause(120);
      }
      return [];
    }finally{
      if(!selected&&[...document.querySelectorAll('[role="menu"]')].some(visible))more.click();
      if(!hadSidebar){
        const sidebar=findSidebar()?.closest('context-sidebar');
        const close=sidebar&&[...sidebar.querySelectorAll('button[aria-label]')].find(button=>
          /^(?:关闭边栏|关闭侧边栏|close (?:side ?panel|sidebar))$/i.test(button.getAttribute('aria-label').trim()));
        if(close){close.click();await pause(150);}
      }
    }
  }
  function activateGeminiCitation(control){
    control.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
    control.focus({preventScroll:true});
    const rect=control.getBoundingClientRect();
    const event={bubbles:true,cancelable:true,composed:true,view:window,detail:1,button:0,
      clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2};
    for(const type of ['mouseover','mouseenter','mousedown','mouseup','click']){
      control.dispatchEvent(new MouseEvent(type,event));
    }
  }
  async function openCitation(control){
    const geminiChip=isGemini&&!!control.closest('source-inline-chip');
    const panelForControl=()=>document.getElementById(control.getAttribute('aria-controls')||'')||
      (geminiChip&&control.getAttribute('aria-expanded')==='true'?document.querySelector('.hover-card-container[role="dialog"]'):null);
    const associated=panelForControl();
    if(visible(associated)&&referenceCards(associated).length)return referenceCards(associated);
    const externalAnchors=()=>[...document.querySelectorAll(citationDialog)].filter(visible)
      .flatMap(panel=>[...panel.querySelectorAll(citationAnchor)].filter(visible));
    const before=new Map(externalAnchors().map(anchor=>[anchor,anchor.getAttribute('href')||anchor.dataset.url||anchor.dataset.href]));
    if(geminiChip)activateGeminiCitation(control);else control.click();
    try{
      for(let attempt=0;attempt<12;attempt++){
        const panel=panelForControl();
        const scoped=visible(panel)?referenceCards(panel):[];
        if(scoped.length)return scoped;
        const added=[...new Set(externalAnchors())].filter(anchor=>before.get(anchor)!==(anchor.getAttribute('href')||anchor.dataset.url||anchor.dataset.href));
        const sources=added.flatMap(referenceCards);
        if(sources.length)return sources;
        await pause(100);
      }
      return [];
    }finally{
      if(geminiChip){
        control.dispatchEvent(new MouseEvent('mouseout',{bubbles:true,relatedTarget:document.body}));
        control.blur();
        control.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      }
      if(control.getAttribute('aria-expanded')==='true')control.click();
      if(geminiChip)await pause(100);
    }
  }
  async function collectInternational(current){
    const info=captureInfo(current);
    if(isGemini){
      const sources=await collectGeminiSidebar(current);
      if(sources.length)return {sources,answer:info.answer,keyword:info.keyword,warning:''};
    }
    let structured=[];
    if(isChatGPT&&(current.matches('[data-dil-response]')||current.querySelector('[data-dil-response]'))){
      const marker=crypto.randomUUID();
      current.setAttribute('data-ai-source-chatgpt',marker);
      try{structured=(await chrome.runtime.sendMessage({type:'CHATGPT_CITATIONS',marker}))?.data||[];}
      catch{}finally{current.removeAttribute('data-ai-source-chatgpt');}
    }
    const body=isGemini?current.querySelector('message-content'):current;
    const sources=[...structured,...referenceCards(body||current)];
    const turn=current.closest('[data-turn="assistant"],[data-testid^="conversation-turn-"],[data-content-search-turn-key]')||current;
    const controls=[...turn.querySelectorAll('button,[role="button"]')];
    const summary=controls.find(control=>visible(control)&&[control.getAttribute('aria-label'),text(control)].some(label=>referenceLabel(label?.trim()||'')));
    if(summary)sources.push(...await openCitation(summary));
    const inline=isGemini?[...current.querySelectorAll('source-inline-chip button[aria-haspopup="dialog"]')]:
      structured.length?[]:[...current.querySelectorAll('[data-d-component="popover-trigger"][data-d-stream-inline], [data-testid*="citation"] button[aria-haspopup]')];
    let missed=0;
    const focus=document.activeElement;
    const positions=[];
    if(isGemini&&inline.length){
      for(let element=current.parentElement;element;element=element.parentElement){
        if(element===document.scrollingElement||(/auto|scroll|overlay/.test(getComputedStyle(element).overflowY)&&element.scrollHeight>element.clientHeight)){
          positions.push([element,element.scrollLeft,element.scrollTop]);
        }
      }
    }
    try{
      const deadline=performance.now()+14000;
      for(const control of inline.filter(visible).slice(0,60)){
        if(performance.now()>=deadline){missed++;break;}
        const links=await openCitation(control);
        if(!links.length)missed++;
        sources.push(...links);
      }
    }finally{
      if(positions.length&&focus?.isConnected)focus.focus({preventScroll:true});
      for(const [element,left,top] of positions.reverse())element.scrollTo({left,top,behavior:'instant'});
    }
    const warning=sources.length?(missed||inline.length>60?'部分正文引用未能读取，请核对网页引用。':''):
      '没有读到这轮回答的引用链接。请打开有网页引用的回答，或展开来源后重试。也可以单独截取提问与回答。';
    return {sources,answer:info.answer,keyword:info.keyword,warning};
  }
  const doubaoReferences=new WeakMap();
  const doubaoSearchLabel=value=>/^搜索\s*\d+\s*个关键词[，,\s]*参考\s*\d+\s*篇资料$/.test(value);
  async function collectDoubao(current,all){
    // The search summary is a clickable div, sometimes beside the markdown body.
    // Keep expansion inside this turn and never open another answer's sources.
    const searchLabels=root=>[...root.querySelectorAll('button,[role="button"],div,span')].filter(e=>visible(e)&&doubaoSearchLabel(text(e)));
    let scope=current;
    for(let n=0;n<4&&!searchLabels(scope).length;n++){
      const parent=scope.parentElement;
      if(!parent||parent.matches('main,body,[role="main"]')||all.some(other=>other!==current&&parent.contains(other)))break;
      scope=parent;
    }
    const labels=searchLabels(scope);
    const label=labels.find(e=>!labels.some(other=>other!==e&&e.contains(other)));
    if(!label)return null;
    const expected=Number(text(label).match(/参考\s*(\d+)/)[1]);
    const clickable=label.closest('button,[role="button"],.cursor-pointer');
    const control=clickable&&scope.contains(clickable)?clickable:label;
    const cached=()=>[...(doubaoReferences.get(current)||[])].filter(e=>e.isConnected&&visible(e)).flatMap(anchorSources);
    let sources=[...anchorSources(current),...cached()];
    if(new Set(sources.map(s=>s.url)).size<expected){
      const before=new Set([...document.querySelectorAll('a[href],[data-url],[data-href]')].filter(visible));
      control.click();
      for(let n=0;n<30;n++){
        await pause(150);
        const added=[...document.querySelectorAll('a[href],[data-url],[data-href]')].filter(e=>visible(e)&&!before.has(e)&&!all.some(other=>other!==current&&other.contains(e)));
        if(added.length)doubaoReferences.set(current,new Set([...(doubaoReferences.get(current)||[]),...added]));
        sources=[...anchorSources(current),...cached()];
        if(new Set(sources.map(s=>s.url)).size>=expected)break;
      }
    }
    const queryLines=text(scope).split('\n').map(s=>s.trim()).filter(s=>/^(?:搜索关键词[：:\s]*)?[“"]/.test(s)&&s.length<2000);
    const semanticQueries=[...new Set(queryLines.flatMap(line=>[...line.matchAll(/[“"]([^”"\n]+)[”"]/g)].map(m=>m[1])))];
    return {sources,answer:text(current),keyword:captureInfo().keyword,semanticQueries,expected,warning:''};
  }
  async function collect({scope='current'}={}) {
    if(scope==='selection'){
      if(!selectedFragment||!selectedText)throw new Error('请先在网页中拖选完整回答正文和信源链接，再点击“导入信源”。');
      const sources=anchorSources(selectedFragment);
      for(const match of selectedText.matchAll(/https?:\/\/[^\s<>"\u3000]+/g))sources.push({url:match[0].replace(/[，。；）】]+$/,''),title:'',recommendation:''});
      return {sources,answer:selectedText,keyword:document.title.replace(/ - .*/,''),warning:'通过手动选中内容导入，仅包含选区内的文字与链接，请核对信源完整性。'};
    }
    const all = answers();
    if (!all.length) throw new Error('没有识别到回答。请打开已有回答并点击回答正文，再尝试导入。');
    const current = chosen?.isConnected ? chosen : all.at(-1);
    if(scope==='conversation'){
      const previous=chosen;const parts=[];
      try{for(const root of all){chosen=root;parts.push(await collect({scope:'current'}));}}finally{chosen=previous;}
      return {sources:parts.flatMap(p=>p.sources),answer:parts.map(p=>p.answer).join('\n\n'),keyword:parts.length===1?parts[0].keyword:document.title,semanticQueries:[...new Set(parts.flatMap(p=>p.semanticQueries||[]))],warning:'仅收集当前已加载的对话内容，未加载的历史回答不包含在内；重复链接会合并。'};
    }
    if(isChatGPT||isGemini)return collectInternational(current);
    if(/kimi/.test(location.hostname)&&current.matches('.segment-assistant')&&current.querySelector('.ref-action')){
      const inline=anchorSources(current);
      const cards=()=>[...document.querySelectorAll('.ref a.site-item')];
      const matching=cards().some(e=>inline.some(i=>i.url.split('#')[0]===e.href.split('#')[0]));
      if(!matching){const control=current.querySelector('.ref-action');if(control){control.click();for(let n=0;n<25&&!cards().length;n++)await pause(150);}}
      const sources=cards().map(e=>({url:e.href,title:text(e.querySelector('.site-title')),titlePriority:4,recommendation:''}));
      const expected=Number(text(document.querySelector('.ref .generic-header__title')).match(/\d+/)?.[0]||0)||null;
      const user=[...document.querySelectorAll('.segment-user')].filter(e=>e.compareDocumentPosition(current)&Node.DOCUMENT_POSITION_FOLLOWING).at(-1);
      return {sources:sources.length?sources:inline,answer:text(current),keyword:text(user?.querySelector('.segment-content-box'))||document.title,expected,warning:sources.length?'':'未取得完整引用面板，仅保留回答中已有的链接，请核对。'};
    }
    if(location.hostname==='yuanbao.tencent.com'&&current.matches('.agent-chat__list__item--ai')){
      const control=current.querySelector('[data-toolbar-type="citation"]');
      const expected=Number(control?.getAttribute('aria-label')?.match(/引用\s*(\d+)\s*篇/)?.[1]||0)||null;
      const conv=current.getAttribute('data-conv-id');
      const cards=()=>[...document.querySelectorAll('.agent-dialogue-references__item')].filter(e=>e.getAttribute('dt-cid')===conv).flatMap(e=>[...e.querySelectorAll('.hyc-common-markdown__ref_card[data-url]')]);
      if(control&&!cards().length){control.click();for(let n=0;n<25&&!cards().length;n++)await pause(150);}
      const sources=cards().map(e=>({url:e.dataset.url,title:text(e.querySelector('.hyc-common-markdown__ref_card-title')),titlePriority:4,recommendation:text(e.querySelector('.hyc-common-markdown__ref_card-desc'))}));
      let previous=current.previousElementSibling;while(previous&&previous.getAttribute('data-conv-speaker')!=='human')previous=previous.previousElementSibling;
      return {sources,answer:text(current.querySelector('.hyc-content-md')||current),keyword:text(previous)||document.title,expected,warning:''};
    }
    if(/qianwen|tongyi/.test(location.hostname)&&current.matches('[class*=message-select-wrapper-answer]')){
      const expected=Number(text(current).match(/参考\s*(\d+)\s*篇资料/)?.[1]||text(current).match(/(\d+)\s*篇来源/)?.[1]||0)||null;
      const inline=anchorSources(current);
      const cards=()=>[...document.querySelectorAll('[class*=deep-think-source-] [data-c="refer_panel"][data-click-extra]')];
      const existing=cards().flatMap(anchorSources);
      if(!existing.some(s=>inline.some(i=>i.url===s.url))){
        let wrapper=current.querySelector('[class*=reference-wrap]');
        for(let n=0;n<25&&!wrapper;n++){await pause(150);wrapper=current.querySelector('[class*=reference-wrap]');}
        const control=wrapper?.firstElementChild||wrapper;
        if(control){control.click();for(let n=0;n<30&&!cards().length;n++)await pause(150);}
      }
      const sources=cards().flatMap(anchorSources);
      const semanticQueries=text(current).split('\n').map(s=>s.trim()).filter(s=>/^"[^"\n]+"$/.test(s)).map(s=>s.slice(1,-1));
      return {sources:sources.length?sources:inline,answer:text(current),keyword:current.closest('.chat-round')?.querySelector('.message-card-wrap.question')?.innerText?.trim()||document.title,semanticQueries,expected,warning:''};
    }
    if(/^(wenxin|yiyan)\.baidu\.com$/.test(location.hostname)&&current.matches('.conversation-flow-answer-container')){
      const refs=[...current.querySelectorAll('li[data-long-press-ext-info]')];
      const expected=Number(text(current).match(/共参考\s*(\d+)\s*篇资料/)?.[1]||0)||null;
      const searchLine=text(current).split('\n').find(line=>line.startsWith('搜索关键词'))||'';
      const semanticQueries=[...searchLine.matchAll(/“([^”]+)”/g)].map(match=>match[1]);
      return {sources:refs.flatMap(anchorSources),answer:text(current),keyword:current.closest('.chat-qa-container')?.querySelector('.conversation-flow-question-container')?.innerText?.trim()||semanticQueries.at(-1)||document.title,semanticQueries,expected,warning:''};
    }
    if(location.hostname==='www.doubao.com'){
      const result=await collectDoubao(current,all);
      if(result)return result;
    }
    let sources = anchorSources(current);
    const button = [...current.querySelectorAll('button, [role="button"], span, div')].find(e=>visible(e) && /^\d+\s*个网页$/.test(text(e)));
    let expected = button ? parseInt(text(button),10) : null;
    if (button) {
      const existingCards=[...document.querySelectorAll('a')].filter(e=>e.querySelector('.search-view-card__title'));
      const matchingExisting=existingCards.length&&existingCards.some(e=>sources.some(s=>s.url===e.href));
      if (!matchingExisting) button.click();
      for (let i=0;i<15;i++) {
        await pause(200);
        const cards = [...document.querySelectorAll('a')].filter(e=>e.querySelector('.search-view-card__title'));
        if (cards.length) { sources.push(...cards.flatMap(anchorSources)); break; }
      }
    } else if (location.hostname.includes('doubao')) {
      const expandable = [...current.querySelectorAll('button,[role="button"], [class*="reference"], [class*="source"]')].filter(e=>visible(e)&&/^(查看|展开)?\s*(全部)?\s*(\d+\s*(个|篇|条)?\s*)?(信源|来源|参考资料|搜索结果)/.test(text(e))&&text(e).length<65);
      for (const e of expandable.slice(0,1)) {e.click(); await pause(700);}
      const panels = document.querySelectorAll('[role="dialog"], [class*="reference-panel"], [class*="source-panel"], [class*="reference-list"], [class*="search-result"]');
      for (const panel of panels) if (visible(panel)) sources.push(...anchorSources(panel));
    }
    if(profile){
      const panelsSelector='[role="dialog"], [class*="reference-panel"], [class*="source-panel"], [class*="reference-list"], [class*="search-result"], [class*="searchResult"], [class*="citation-panel"]';
      const openPanels=()=>[...document.querySelectorAll(panelsSelector)].filter(visible);
      // Already-open source lists stay open. Only controls inside the chosen answer are expanded.
      const belongs=p=>!panelOwners.has(p)||panelOwners.get(p)===current;
      if(!openPanels().some(p=>belongs(p)&&anchorSources(p).length)){
        const controls=[...current.querySelectorAll('button,[role="button"]')].filter(e=>visible(e)&&/信源|来源|参考|搜索到|搜索结果|网页|引用/.test(text(e))&&text(e).length<80);
        if(controls.length){const label=text(controls[0]);const count=label.match(/(\d+)\s*(?:个|篇|条|项)?/);if(count)expected=Number(count[1]);controls[0].click();await pause(700);}
      }
      for(const panel of openPanels())if(belongs(panel)){panelOwners.set(panel,current);sources.push(...anchorSources(panel));}
    }
    for (const match of text(current).matchAll(/https?:\/\/[^\s<>"\u3000]+/g)) sources.push({url:match[0].replace(/[，。；）】]+$/,''),title:'',recommendation:''});
    const user = location.hostname==='chat.deepseek.com' ? [...document.querySelectorAll('.ds-message')].filter(e=>e.classList.contains('d29f3d7d')).at(-1)?.innerText : null;
    return {sources,answer:text(current),keyword:user?.trim().slice(0,100)||document.title.replace(/ - .*/,''),expected,warning:''};
  }
  function diagnose(){
    const describe=e=>({tag:e.tagName,classes:String(e.className||'').slice(0,300),role:e.getAttribute('role'),textLength:text(e).length,linkCount:e.querySelectorAll('a[href],[data-url],[data-href]').length});
    const candidates=[...document.querySelectorAll('main,article,[class*="markdown"],[class*="message"],[class*="answer"],[class*="reference"],[class*="source"],[class*="citation"],[role="dialog"]')].filter(visible).slice(-150);
    const controls=[...document.querySelectorAll('button,[role="button"],a,div,span')].filter(e=>visible(e)&&text(e).length<100&&((e.matches('button,[role="button"],a')&&/信源|来源|参考|搜索|引用|网页/.test(text(e)))||doubaoSearchLabel(text(e)))).slice(-80).map(e=>({...describe(e),label:text(e)}));
    return {version:2,origin:location.origin+location.pathname,title:document.title,answerCount:answers().length,profileSelector:profile?.answer||null,selectedCharacters:selectedText.length,candidates:candidates.map(describe),controls,frames:[...document.querySelectorAll('iframe')].map(e=>{try{return new URL(e.src).origin;}catch{return '';} }),shadowRoots:[...document.querySelectorAll('*')].filter(e=>e.shadowRoot).map(describe).slice(0,20)};
  }
  function currentAnswer(){return chosen?.isConnected?chosen:answers().at(-1);}
  function questionFor(root){
    let question;
    if(isChatGPT){
      const modern=chatHeadings('user');
      question=(modern.length?modern:[...document.querySelectorAll('main [data-message-author-role="user"]')]).filter(e=>e.compareDocumentPosition(root)&Node.DOCUMENT_POSITION_FOLLOWING).at(-1);
    }else if(isGemini)question=[...document.querySelectorAll('user-query')].filter(e=>e.compareDocumentPosition(root)&Node.DOCUMENT_POSITION_FOLLOWING).at(-1);
    else if(/kimi/.test(location.hostname))question=[...document.querySelectorAll('.segment-user')].filter(e=>e.compareDocumentPosition(root)&Node.DOCUMENT_POSITION_FOLLOWING).at(-1);
    else if(location.hostname==='yuanbao.tencent.com'){question=root.previousElementSibling;while(question&&question.getAttribute('data-conv-speaker')!=='human')question=question.previousElementSibling;}
    else if(/qianwen|tongyi/.test(location.hostname))question=root.closest('.chat-round')?.querySelector('.message-card-wrap.question');
    else if(/^(wenxin|yiyan)\.baidu\.com$/.test(location.hostname))question=root.closest('.chat-qa-container')?.querySelector('.conversation-flow-question-container');
    else question=[...document.querySelectorAll('[data-testid="send_message"],[data-message-role="user"],[data-role="user"],.ds-message.d29f3d7d')].filter(e=>e.compareDocumentPosition(root)&Node.DOCUMENT_POSITION_FOLLOWING).at(-1);
    return question||null;
  }
  function questionText(question){
    if(!question)return '';
    const body=question.querySelector('[data-testid="message_text_content"],.segment-content-box,.hyc-content-text,[class*="question-content"],[data-message-content],.query-text')||question;
    // Prompt containers also contain hover actions, timestamps and copy status.
    // Read the actual prompt independently of those transient controls and of
    // viewport-dependent innerText/content-visibility optimizations.
    const ignored='button,[role="button"],input,textarea,select,svg,script,style,time,[aria-hidden="true"],[hidden],.cdk-visually-hidden,.sr-only,[data-testid*="timestamp"],[class*="timestamp"],[class*="message-time"],[class*="messageTime"]';
    return readVisibleText(body,ignored);
  }
  function readVisibleText(body,ignored){
    function read(node){
      if(node.nodeType===Node.TEXT_NODE)return node.nodeValue||'';
      if(node.nodeType!==Node.ELEMENT_NODE)return '';
      if(node!==body&&node.matches(ignored))return '';
      const css=getComputedStyle(node);
      if(css.display==='none'||css.visibility==='hidden'||css.visibility==='collapse')return '';
      if(node.tagName==='BR')return '\n';
      const value=[...node.childNodes].map(read).join('');
      return /^(block|flex|grid|table|list-item|flow-root)/.test(css.display)?'\n'+value+'\n':value;
    }
    return read(body).replace(/[\t ]+\n/g,'\n').replace(/\n[\t ]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  }
  function captureInfo(root=currentAnswer()){
    if(!root)throw new Error('没有识别到回答，请点击回答正文后再截图。');
    const question=questionFor(root);
    const prompt=questionText(question);
    const body=isGemini?root.querySelector('message-content'):location.hostname==='yuanbao.tencent.com'?root.querySelector('.hyc-content-md'):null;
    const answer=isGemini?readVisibleText(body||root,'source-inline-chip,sources-list,multi-source-hovered-card,.hover-card-container,[role="dialog"],.cdk-visually-hidden,[aria-hidden="true"],[hidden],script,style'):text(body||root);
    return {origin:location.href,keyword:prompt||document.title.replace(/ - .*/,''),question:prompt,answer};
  }
  globalThis.AISourceCollector = {collect,answers,currentAnswer,questionFor,captureInfo,anchorSources,diagnose};
  globalThis.chrome?.runtime?.onMessage?.addListener((message,sender,respond)=>{
    if(message.type==='DIAGNOSE'){respond({ok:true,data:diagnose()});return;}
    if (message.type !== 'COLLECT') return;
    collect(message).then(data=>respond({ok:true,data})).catch(error=>respond({ok:false,error:error.message}));
    return true;
  });
})();
