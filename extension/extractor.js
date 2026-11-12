// Runs in the page's MAIN world. Returned data is treated as untrusted by the server.
async function extractSourcePage(saveMedia=false) {
  const meta = key=>document.querySelector(`meta[property="${key}"],meta[name="${key}"]`)?.content || '';
  const txt = e=>e?.innerText?.trim() || '';
  const isDouyin = /(^|\.)douyin\.com$/.test(location.hostname);
  if(saveMedia&&isDouyin&&!document.querySelector('[data-e2e="note-detail"]')){
    const root=document.querySelector('[data-e2e="video-detail"],main')||document;
    const player=root.querySelector('video');
    if(player){player.muted=true;player.play().catch(()=>{});await new Promise(resolve=>setTimeout(resolve,2500));}
  }
  const result = {url:location.href,title:meta('og:title')||txt(document.querySelector('h1'))||document.title,author:meta('author')||meta('article:author'),publishedAt:meta('article:published_time'),description:meta('og:description')||meta('description'),text:'',media:[],images:[],warnings:[]};
  const media = (url,kind='video')=>{if(!url||typeof url!=='string')return;try{const u=new URL(url,location.href); if(/\.(mp3|m4a|aac|ogg)(\?|$)/i.test(u.href))kind='audio';if(/^https?:$/.test(u.protocol)&&u.href!==location.href&&!result.media.some(e=>e.url===u.href)) result.media.push({url:u.href,kind});}catch{}};
  for(const video of document.querySelectorAll('video')) {media(video.currentSrc||video.src); for(const s of video.querySelectorAll('source')) media(s.src);}
  const structured=[];
  for(const s of document.querySelectorAll('script[type="application/ld+json"],script[type="application/json"],script#RENDER_DATA,script#__NEXT_DATA__')) {
    try {structured.push(JSON.parse(s.id==='RENDER_DATA'?decodeURIComponent(s.textContent):s.textContent));}catch{}
  }
  for(const key of ['_ROUTER_DATA','__INITIAL_STATE__','__NEXT_DATA__','SSR_RENDER_DATA']) if(globalThis[key]&&typeof globalThis[key]==='object') structured.push(globalThis[key]);
  if(isDouyin){
    const root=document.querySelector('[data-e2e="video-detail"], [data-e2e="note-detail"], main');
    for(const e of root?[root,...root.querySelectorAll('video')]:[]){
      for(const key of Object.keys(e))if(key.startsWith('__reactProps$'))structured.push(e[key]);
    }
  }
  const targetId=location.pathname.match(/\/(?:video|note)\/(\d+)/)?.[1];
  let scanned=0;
  const seen=new WeakSet();
  function walk(obj,depth=0){
    if(!obj||typeof obj!=='object'||obj instanceof Node||seen.has(obj)||depth>16||++scanned>35000) return;
    seen.add(obj);
    if(obj['@type']==='Article'||obj['@type']==='NewsArticle'){result.text=obj.articleBody||result.text; result.author=typeof obj.author==='object'?obj.author.name||result.author:obj.author||result.author;}
    if(obj['@type']==='VideoObject'){result.title=obj.name||result.title; result.description=obj.description||result.description; if(obj.contentUrl) media(obj.contentUrl);}
    if(isDouyin&&targetId&&(obj.aweme_id||obj.awemeId)&&String(obj.aweme_id||obj.awemeId)!==targetId)return;
    const item=obj.aweme_detail||obj.awemeDetail;
    if(item){result.description=item.desc||result.description;result.title=item.desc||result.title;result.author=item.author?.nickname||result.author;}
    if(obj.desc&&obj.video){result.description=obj.desc;result.title=obj.desc; result.author=obj.author?.nickname||result.author;}
    for(const [key,value]of Object.entries(obj)){
      if(['play_addr','playAddr','download_addr','downloadAddr','play_addr_h264','play_addr_265'].includes(key)&&typeof value==='object')for(const url of value?.url_list||value?.urlList||[])media(url,'video');
      if(['audio','audio_addr','audioAddr'].includes(key)&&typeof value==='object')for(const url of value?.url_list||value?.urlList||[])media(url,'audio');
      if(key==='images'&&Array.isArray(value))for(const im of value){const url=im.url_list?.[0]||im.urlList?.[0];if(url)result.images.push(url);}
      if(!['_owner','ownerDocument','parent','parentNode'].includes(key)&&value&&typeof value==='object')walk(value,depth+1);
    }
  }
  for(const obj of structured)walk(obj);
  if(isDouyin){
    const main=document.querySelector('[data-e2e="note-detail"], [data-e2e="video-detail"], main')||document;
    result.description=txt(main.querySelector('[data-e2e="video-desc"], [data-e2e="detail-video-desc"], [data-e2e="video-detail-desc"], .Bfj9rfeR .m53pwJvW'))||result.description;
    result.author=txt(main.querySelector('[data-e2e="video-author-name"], [data-e2e="detail-video-author-name"]'))||main.querySelector('[data-e2e="user-info"] img[alt]')?.alt||result.author;
    result.publishedAt=txt(main).match(/发布时间[：:]\s*([\d\-/: ]+)/)?.[1]?.trim()||result.publishedAt;
    if(result.description)result.title=result.description.split(/[。\n]/)[0].slice(0,150)||result.title;
    if(location.pathname.includes('/note/')||document.querySelector('[data-e2e="note-detail"]')){
      result.contentType='gallery';
      for(const img of main.querySelectorAll('[data-e2e="player-container"] img'))if(/^https?:/.test(img.src)&&/douyinpic|byteimg/.test(img.src))result.images.push(img.src);
    }
    result.text=result.description;
    for(const e of performance.getEntriesByType('resource')) if(/douyinvod\.com|\/video\/tos|media-video|media-audio/.test(e.name))media(e.name,/media-audio|mp4a/.test(e.name)?'audio':'video');
    if(/扫码登录|安全验证|验证后继续/.test(txt(document.body))&&!result.media.length)result.warnings.push('页面可能需要登录或验证；可手动打开原网页处理后重试。');
  }else{
    const candidates=[...document.querySelectorAll('article,[role="main"],main,#js_content,[itemprop="articleBody"],.article-content,.article_content,.content-article')];
    const best=candidates.sort((a,b)=>txt(b).length-txt(a).length)[0];
    const copy=(best||document.body).cloneNode(true);
    for(const e of copy.querySelectorAll('script,style,nav,header,footer,aside,form,button,[role="navigation"],.advertisement'))e.remove();
    for(const e of copy.querySelectorAll('p,h1,h2,h3,h4,li,br,section,blockquote')){e.prepend('\n');e.append('\n');}
    result.text=result.text||copy.innerText||copy.textContent||'';
    result.text=result.text.replace(/\n[ \t]*\n[ \t]*\n/g,'\n\n').trim().slice(0,300000);
    if(!best)result.warnings.push('使用整页文字提取，可能包含页面菜单或推荐内容。');
  }
  result.media=result.media.slice(0,30); result.images=[...new Set(result.images)].slice(0,100);
  return result;
}
