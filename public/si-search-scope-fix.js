/* Shadow Intelligence — Search Scope Fix v2.9.7
   Keep search/close behavior while observing navigation state only.
*/
(() => {
  const MAP_ID='page-overview';
  const SEARCH_ID='page-search';
  const SEARCH_ICON=`<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="M16 16l4.2 4.2"></path></svg>`;
  const CLOSE_ICON=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>`;

  let controlledButton=null;
  let applying=false;
  let raf=0;

  function activePage(){return document.querySelector('.si-page.active-page');}
  function visible(el){
    if(!(el instanceof HTMLElement)) return false;
    const cs=getComputedStyle(el);
    if(cs.display==='none'||cs.visibility==='hidden') return false;
    const r=el.getBoundingClientRect();
    return r.width>0&&r.height>0;
  }

  function directCandidates(){
    const selectors=[
      '#openSearchPage','#searchButton','#globalSearchButton','#globalSearch','#floatingSearchButton',
      '.si-search-button','.si-floating-search','.si-search-fab','button[data-nav="search"]',
      'button[aria-label="Search"]','button[title="Search"]','button[aria-label*="search" i]','button[title*="search" i]'
    ];
    const seen=new Set(),rows=[];
    for(const selector of selectors){
      document.querySelectorAll(selector).forEach(el=>{if(!seen.has(el)){seen.add(el);rows.push(el);}});
    }
    return rows;
  }

  function geometryCandidate(){
    const vw=Math.max(document.documentElement.clientWidth,window.innerWidth||0);
    const vh=Math.max(document.documentElement.clientHeight,window.innerHeight||0);
    const buttons=[...document.querySelectorAll('button')].filter(button=>{
      if(!visible(button)||button.closest('.si-immersive-dock')||button.closest('.si-modal')) return false;
      const r=button.getBoundingClientRect();
      return r.width>=48&&r.width<=96&&r.height>=48&&r.height<=96&&r.left>=vw*.72&&r.top>=vh*.60;
    });
    buttons.sort((a,b)=>{const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();return (br.right-ar.right)||(br.bottom-ar.bottom);});
    return buttons[0]||null;
  }

  function findSearchButton(){
    const direct=directCandidates();
    const preferred=direct.find(el=>el.tagName==='BUTTON'&&!el.closest('.si-immersive-dock')&&!el.closest('.si-modal'));
    return preferred||direct[0]||geometryCandidate();
  }

  function remember(button){
    if(controlledButton===button) return;
    controlledButton=button;
    button.dataset.siSearchScopeControlled='1';
  }

  function setIcon(button,mode){
    if(button.dataset.siSearchMode===mode) return;
    button.innerHTML=mode==='close'?CLOSE_ICON:SEARCH_ICON;
    const label=mode==='close'?'Close search':'Search';
    button.setAttribute('aria-label',label);
    button.setAttribute('title',label);
    button.dataset.siSearchMode=mode;
  }

  function setShown(button,shown){
    const hidden=!shown;
    if(button.hidden!==hidden) button.hidden=hidden;
    const wanted=shown?'':'none';
    if(button.style.getPropertyValue('display')!==wanted) button.style.setProperty('display',wanted,'important');
    const aria=shown?'false':'true';
    if(button.getAttribute('aria-hidden')!==aria) button.setAttribute('aria-hidden',aria);
    if(shown){if(button.hasAttribute('tabindex')) button.removeAttribute('tabindex');}
    else if(button.getAttribute('tabindex')!=='-1') button.setAttribute('tabindex','-1');
  }

  function clearSearchState(){
    const page=document.getElementById(SEARCH_ID);
    page?.querySelectorAll('input[type="search"],input').forEach(input=>{
      if(input.value){input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));}
    });
    const results=document.getElementById('searchPageResults');
    if(results) results.innerHTML='<div class="si-search-empty">Start typing to search Shadow Intelligence.</div>';
    document.documentElement.classList.remove('search-open','si-search-open','has-search-open');
    document.body.classList.remove('search-open','si-search-open','has-search-open');
  }

  function scheduleApply(){
    if(raf) return;
    raf=requestAnimationFrame(()=>{raf=0;apply();});
  }

  function goOverview(){
    clearSearchState();
    const nav=[...document.querySelectorAll('[data-nav="overview"]')].find(el=>el!==controlledButton);
    if(nav) nav.click();
    document.querySelectorAll('.si-page').forEach(page=>page.classList.toggle('active-page',page.id===MAP_ID));
    document.querySelectorAll('[data-nav]').forEach(el=>{
      const active=el.dataset.nav==='overview';
      el.classList.toggle('active',active);
      if(active) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current');
    });
    history.replaceState(history.state,'',location.pathname+location.search);
    scheduleApply();
  }

  function openSearch(){
    const nav=[...document.querySelectorAll('[data-nav="search"]')].find(el=>el!==controlledButton);
    if(nav){nav.click();return;}
    document.querySelectorAll('.si-page').forEach(page=>page.classList.toggle('active-page',page.id===SEARCH_ID));
    scheduleApply();
  }

  function clickHandler(event){
    const button=event.target.closest?.('[data-si-search-scope-controlled="1"]');
    if(!button) return;
    const pageId=activePage()?.id;
    if(pageId===SEARCH_ID){
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();goOverview();return;
    }
    if(pageId===MAP_ID&&!button.matches('[data-nav="search"]')){
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();openSearch();
    }
  }

  function apply(){
    if(applying) return;
    applying=true;
    try{
      const button=controlledButton?.isConnected?controlledButton:findSearchButton();
      if(!button) return;
      remember(button);
      const pageId=activePage()?.id||'';
      if(pageId===MAP_ID){setShown(button,true);setIcon(button,'search');}
      else if(pageId===SEARCH_ID){setShown(button,true);setIcon(button,'close');}
      else setShown(button,false);
    }finally{applying=false;}
  }

  document.addEventListener('click',clickHandler,true);

  const observer=new MutationObserver(scheduleApply);
  observer.observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['class']});

  window.addEventListener('pageshow',scheduleApply);
  window.addEventListener('popstate',scheduleApply);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden) scheduleApply();});

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',apply,{once:true});
  else apply();
})();
