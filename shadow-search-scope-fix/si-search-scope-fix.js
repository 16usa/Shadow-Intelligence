/* Shadow Intelligence — Search Scope Fix v2.7.2
   Search button exists only on:
   - Map / overview  -> magnifier
   - Search page     -> close X
*/
(() => {
  const MAP_ID = 'page-overview';
  const SEARCH_ID = 'page-search';

  const SEARCH_ICON = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5"></circle>
      <path d="M16 16l4.2 4.2"></path>
    </svg>`;

  const CLOSE_ICON = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18"></path>
    </svg>`;

  let controlledButton = null;
  let originalHtml = '';
  let originalAria = '';
  let originalTitle = '';
  let applying = false;

  function activePage(){
    return document.querySelector('.si-page.active-page');
  }

  function visible(el){
    if(!el || !(el instanceof HTMLElement)) return false;
    const cs = getComputedStyle(el);
    if(cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function directCandidates(){
    const selectors = [
      '#searchButton',
      '#globalSearchButton',
      '#globalSearch',
      '#floatingSearchButton',
      '.si-search-button',
      '.si-floating-search',
      '.si-search-fab',
      'button[data-nav="search"]',
      'button[aria-label="Search"]',
      'button[title="Search"]',
      'button[aria-label*="search" i]',
      'button[title*="search" i]'
    ];

    const seen = new Set();
    const rows = [];

    for(const selector of selectors){
      document.querySelectorAll(selector).forEach(el => {
        if(!seen.has(el)){
          seen.add(el);
          rows.push(el);
        }
      });
    }

    return rows;
  }

  function geometryCandidate(){
    const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);

    const buttons = [...document.querySelectorAll('button')].filter(button => {
      if(!visible(button)) return false;
      if(button.closest('.si-immersive-dock')) return false;
      if(button.closest('.si-modal')) return false;

      const r = button.getBoundingClientRect();
      const roundish = r.width >= 48 && r.width <= 96 &&
                       r.height >= 48 && r.height <= 96;
      const rightSide = r.left >= vw * 0.72;
      const lowerArea = r.top >= vh * 0.60;
      return roundish && rightSide && lowerArea;
    });

    // Prefer the right-most/lower floating circle.
    buttons.sort((a,b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return (br.right - ar.right) || (br.bottom - ar.bottom);
    });

    return buttons[0] || null;
  }

  function findSearchButton(){
    const direct = directCandidates();

    // Prefer a button that is not inside the main dock.
    const preferred = direct.find(el =>
      el.tagName === 'BUTTON' &&
      !el.closest('.si-immersive-dock') &&
      !el.closest('.si-modal')
    );

    return preferred || direct[0] || geometryCandidate();
  }

  function remember(button){
    if(controlledButton === button) return;

    controlledButton = button;
    originalHtml = button.innerHTML;
    originalAria = button.getAttribute('aria-label') || '';
    originalTitle = button.getAttribute('title') || '';

    button.dataset.siSearchScopeControlled = '1';
  }

  function setIcon(button, mode){
    if(mode === 'close'){
      button.innerHTML = CLOSE_ICON;
      button.setAttribute('aria-label','Close search');
      button.setAttribute('title','Close search');
      button.dataset.siSearchMode = 'close';
    } else {
      // Use our clean icon so stale X state can never remain.
      button.innerHTML = SEARCH_ICON;
      button.setAttribute('aria-label','Search');
      button.setAttribute('title','Search');
      button.dataset.siSearchMode = 'search';
    }
  }

  function setShown(button, shown){
    button.hidden = !shown;
    button.style.setProperty('display', shown ? '' : 'none', 'important');
    button.setAttribute('aria-hidden', shown ? 'false' : 'true');
    if(shown) button.removeAttribute('tabindex');
    else button.setAttribute('tabindex','-1');
  }

  function clearSearchState(){
    const page = document.getElementById(SEARCH_ID);

    page?.querySelectorAll('input[type="search"], input').forEach(input => {
      input.value = '';
      input.dispatchEvent(new Event('input', {bubbles:true}));
    });

    const results = document.getElementById('searchPageResults');
    if(results){
      results.innerHTML =
        '<div class="si-search-empty">Start typing to search Shadow Intelligence.</div>';
    }

    // Close any search-specific overlays/panels that may have been left open.
    document.documentElement.classList.remove(
      'search-open',
      'si-search-open',
      'has-search-open'
    );
    document.body.classList.remove(
      'search-open',
      'si-search-open',
      'has-search-open'
    );
  }

  function goOverview(){
    clearSearchState();

    // Use the application's existing navigation whenever possible.
    const nav = [...document.querySelectorAll('[data-nav="overview"]')]
      .find(el => el !== controlledButton);

    if(nav){
      nav.click();
    }

    // Defensive state correction in case the old router did not fully close Search.
    document.querySelectorAll('.si-page').forEach(page => {
      page.classList.toggle('active-page', page.id === MAP_ID);
    });

    document.querySelectorAll('[data-nav]').forEach(el => {
      const active = el.dataset.nav === 'overview';
      el.classList.toggle('active', active);
      if(active) el.setAttribute('aria-current','page');
      else el.removeAttribute('aria-current');
    });

    history.replaceState(
      history.state,
      '',
      location.pathname + location.search
    );

    requestAnimationFrame(apply);
  }

  function openSearch(){
    const nav = [...document.querySelectorAll('[data-nav="search"]')]
      .find(el => el !== controlledButton);

    if(nav){
      nav.click();
      return;
    }

    // Fallback when the floating button itself is the only search navigation control.
    document.querySelectorAll('.si-page').forEach(page => {
      page.classList.toggle('active-page', page.id === SEARCH_ID);
    });

    requestAnimationFrame(apply);
  }

  function clickHandler(event){
    const button = event.target.closest?.('[data-si-search-scope-controlled="1"]');
    if(!button) return;

    const pageId = activePage()?.id;

    if(pageId === SEARCH_ID){
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      goOverview();
      return;
    }

    if(pageId === MAP_ID && !button.matches('[data-nav="search"]')){
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openSearch();
    }
  }

  function apply(){
    if(applying) return;
    applying = true;

    try{
      const button = controlledButton?.isConnected
        ? controlledButton
        : findSearchButton();

      if(!button) return;
      remember(button);

      const pageId = activePage()?.id || '';

      if(pageId === MAP_ID){
        setShown(button, true);
        setIcon(button, 'search');
      } else if(pageId === SEARCH_ID){
        setShown(button, true);
        setIcon(button, 'close');
      } else {
        setShown(button, false);
      }
    } finally {
      applying = false;
    }
  }

  document.addEventListener('click', clickHandler, true);

  const observer = new MutationObserver(() => {
    requestAnimationFrame(apply);
  });

  observer.observe(document.documentElement, {
    subtree:true,
    childList:true,
    attributes:true,
    attributeFilter:['class','hidden','style']
  });

  window.addEventListener('pageshow', apply);
  window.addEventListener('popstate', apply);
  document.addEventListener('visibilitychange', () => {
    if(!document.hidden) apply();
  });

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', apply, {once:true});
  }else{
    apply();
  }
})();