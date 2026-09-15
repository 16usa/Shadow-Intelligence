(() => {
  function looksLikeTopLiveCard(el){
    if(!(el instanceof HTMLElement)) return false;

    const text=(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim();
    if(!text) return false;

    const hasTrade=/\b(BUY|SELL)\b/i.test(text);
    const hasHandle=/@[A-Za-z0-9_]{2,}/.test(text);
    const hasPct=/[+-]?\d+(?:\.\d+)?%/.test(text);

    if(!(hasTrade&&hasHandle&&hasPct)) return false;

    const r=el.getBoundingClientRect();
    const vw=Math.max(document.documentElement.clientWidth,window.innerWidth||0);

    // Only target the small top-center pill, never feed rows or graph nodes.
    return r.top>=0 &&
           r.top<190 &&
           r.height>=35 &&
           r.height<=120 &&
           r.width>=180 &&
           r.width<=Math.min(520,vw*.82) &&
           r.left>20;
  }

  function remove(){
    const overview=document.querySelector('#page-overview')||document.body;
    const nodes=[...overview.querySelectorAll('div,section,article,aside')];

    for(const el of nodes){
      if(looksLikeTopLiveCard(el)){
        el.remove();
      }
    }
  }

  remove();

  const observer=new MutationObserver(()=>remove());
  observer.observe(document.documentElement,{childList:true,subtree:true});

  window.addEventListener('pageshow',remove);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)remove()});
})();