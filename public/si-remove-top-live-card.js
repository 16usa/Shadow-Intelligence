/* Shadow Intelligence — top live-card cleanup v2.9.7
   Initial full cleanup once; later inspect only newly-added subtrees inside overview.
*/
(() => {
  function looksLikeTopLiveCard(el){
    if(!(el instanceof HTMLElement)) return false;
    const text=(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim();
    if(!text) return false;
    if(!/\b(BUY|SELL)\b/i.test(text)||!/@[A-Za-z0-9_]{2,}/.test(text)||!/[+-]?\d+(?:\.\d+)?%/.test(text)) return false;
    const r=el.getBoundingClientRect();
    const vw=Math.max(document.documentElement.clientWidth,window.innerWidth||0);
    return r.top>=0&&r.top<190&&r.height>=35&&r.height<=120&&r.width>=180&&r.width<=Math.min(520,vw*.82)&&r.left>20;
  }

  function removeIfMatch(el){
    if(looksLikeTopLiveCard(el)){el.remove();return true;}
    return false;
  }

  function inspectTree(root){
    if(!(root instanceof HTMLElement)) return;
    if(removeIfMatch(root)) return;
    root.querySelectorAll?.('div,section,article,aside').forEach(removeIfMatch);
  }

  function initialCleanup(){
    const overview=document.querySelector('#page-overview');
    if(!overview) return;
    overview.querySelectorAll('div,section,article,aside').forEach(removeIfMatch);
  }

  function bindObserver(){
    const overview=document.querySelector('#page-overview');
    if(!overview) return;
    const observer=new MutationObserver(mutations=>{
      for(const mutation of mutations){
        for(const node of mutation.addedNodes) inspectTree(node);
      }
    });
    observer.observe(overview,{childList:true,subtree:true});
  }

  const start=()=>{initialCleanup();bindObserver();};
  window.addEventListener('pageshow',initialCleanup);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden) initialCleanup();});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
