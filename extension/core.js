export function canonicalUrl(raw, base) {
  try {
    let u = new URL(raw, base);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return null;
    for (const key of ['url','target','target_url']) {
      const nested = u.searchParams.get(key);
      if (nested && /^https?:\/\//.test(nested) && /redirect|link|jump/.test(u.pathname)) {
        u = new URL(nested); break;
      }
    }
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return null;
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (/^utm_/i.test(key) || /^(gclid|fbclid|msclkid|share_app_id|share_link_id|from|source)$/i.test(key)) u.searchParams.delete(key);
    }
    const share = /(^|\.)iesdouyin\.com$/.test(u.hostname) && u.pathname.match(/^\/share\/(video|note)\/(\d+)/);
    if (share) return `https://www.douyin.com/${share[1]}/${share[2]}`;
    const id = /(^|\.)douyin\.com$/.test(u.hostname) && u.pathname.match(/^\/(video|note)\/(\d+)/);
    if (id) return `https://www.douyin.com/${id[1]}/${id[2]}`;
    u.searchParams.sort();
    return u.href;
  } catch { return null; }
}
export function classifyUrl(url) {
  const u = new URL(url);
  if (/(^|\.)(douyin|iesdouyin)\.com$/.test(u.hostname)) return /\/note\//.test(u.pathname) ? 'gallery' : 'video';
  if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) return 'video';
  if (/(^|\.)(bilibili\.com|b23\.tv|kuaishou\.com|youtube\.com|youtu\.be|ixigua\.com)$/.test(u.hostname)) return 'unsupported-video';
  return 'article';
}
export function dedupeSources(sources, base) {
  const map = new Map();
  for (const source of sources) {
    const url = canonicalUrl(source.url, base);
    if (!url) continue;
    const clean = {...source, originalUrl:source.originalUrl||source.url, url, type: classifyUrl(url)};
    if (!map.has(url)) map.set(url, clean);
    else {
      const previous = map.get(url);
      if (clean.title && ((!previous.title || /^[\d\s-]+$/.test(previous.title) || /^https?:/.test(previous.title)) || (clean.titlePriority||0)>(previous.titlePriority||0))) {previous.title=clean.title;previous.titlePriority=clean.titlePriority||0;}
      if (clean.recommendation && !previous.recommendation) previous.recommendation = clean.recommendation;
    }
  }
  return [...map.values()];
}
export function safeName(value,limit=70) {
  let name=[...String(value || '信源').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')].slice(0,limit).join('').replace(/[. ]+$/, '') || '信源';
  if(/^(CON|PRN|AUX|NUL|COM\d|LPT\d)(\.|$)/i.test(name))name='_'+name;
  return name;
}
export const statusLabels = {pending:'已保存引用',extracting:'读取原网页',processing:'保存补采内容',complete:'已补采',partial:'部分补采',failed:'补采失败',unsupported:'待支持'};
export function platformName(origin){
  let host;try{host=new URL(origin).hostname;}catch{return '手动导入';}
  const platforms=[['Doubao',['www.doubao.com']],['DeepSeek',['chat.deepseek.com']],['元宝',['yuanbao.tencent.com']],['文心一言',['yiyan.baidu.com','wenxin.baidu.com']],['Kimi',['www.kimi.com','kimi.com','kimi.moonshot.cn','www.kimi.ai']],['千问',['www.qianwen.com','qianwen.com','www.tongyi.com','tongyi.aliyun.com']],['ChatGPT',['chatgpt.com']],['Gemini',['gemini.google.com']]];
  return platforms.find(([,hosts])=>hosts.includes(host))?.[0]||'手动导入';
}
export function exportFilename(task,format='xlsx'){
  const parts=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date((task.createdAt||Date.now()/1000)*1000));
  const date=['year','month','day'].map(key=>parts.find(p=>p.type===key).value).join('');
  return `${[...safeName(task.keyword)].slice(0,44).join('')}-${date}-${platformName(task.origin)}.${format}`;
}
