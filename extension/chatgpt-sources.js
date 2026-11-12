// Runs in the page's main world. Read only citation cards bound to the selected response.
export function readChatGptCitations(marker) {
  if (location.hostname !== 'chatgpt.com' || !/^[a-f0-9-]{36}$/.test(marker)) return [];
  const root = document.querySelector(`[data-ai-source-chatgpt="${marker}"]`);
  const response = root?.matches('[data-dil-response]') ? root : root?.querySelector('[data-dil-response]');
  if (!response) return [];
  const key = Object.keys(response).find(name => name.startsWith('__reactFiber$'));
  for (let fiber = response[key], depth = 0; fiber && depth < 8; fiber = fiber.return, depth++) {
    const components = fiber.memoizedProps?.appData?.opGenui?.componentResults;
    if (!components || typeof components !== 'object') continue;
    const sources = [];
    for (const component of Object.values(components).slice(0, 300)) {
      const state = component?.state;
      if (!state || !Object.hasOwn(state, 'sources_title') || !Array.isArray(state.items)) continue;
      for (const item of state.items.slice(0, 100)) {
        if (typeof item?.url !== 'string') continue;
        let url;
        try { url = new URL(item.url); } catch { continue; }
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hostname === location.hostname) continue;
        const title = typeof item.title === 'string' ? item.title : item.source_label;
        sources.push({url:url.href, title:typeof title === 'string' ? title.slice(0,300) : '',
          recommendation:typeof item.snippet === 'string' ? item.snippet.slice(0,800) : '', titlePriority:4});
      }
    }
    return sources;
  }
  return [];
}
