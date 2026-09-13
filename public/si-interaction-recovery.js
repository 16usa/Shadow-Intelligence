/* Shadow Interaction Recovery v1.4.0 */
(() => {
  const interactiveSelector = [
    '.si-immersive-dock button',
    'button[data-nav]',
    '[data-entity]',
    '[data-token]',
    '[data-open]',
    '[data-user]',
    '.si-entity-chip',
    '.si-entity-card',
    '.si-token-card',
    '.si-conversation',
    '.si-button',
    '#userButton',
    '#themeToggle',
    '#addEntityBtn',
    '#entitiesAddBtn',
    '#evidenceAddBtn',
    '#modalClose',
    '.si-sheet-close'
  ].join(',');

  function removeOldChromeArtifacts(){
    document.querySelectorAll('.shadow-window-chrome').forEach(el=>el.remove());

    document.querySelectorAll('.shadow-window-chrome-host').forEach(el=>{
      el.classList.remove('shadow-window-chrome-host');
      delete el.dataset.shadowWindowBottom;
      delete el.dataset.shadowWindowPanel;
      delete el.dataset.shadowWindowChromed;
    });

    document.querySelectorAll('[data-shadow-handle-hidden]').forEach(el=>{
      el.removeAttribute('data-shadow-handle-hidden');
      el.style.removeProperty('opacity');
      el.style.removeProperty('visibility');
      el.style.removeProperty('pointer-events');
    });

    document.querySelectorAll('[data-shadow-close-moved]').forEach(el=>{
      el.removeAttribute('data-shadow-close-moved');
    });
  }

  function repairPointerEvents(){
    document.querySelectorAll(interactiveSelector).forEach(el=>{
      el.style.pointerEvents='auto';
      el.style.touchAction='manipulation';
    });

    document.querySelectorAll('.si-page:not(#page-overview)').forEach(el=>{
      el.style.pointerEvents = el.classList.contains('active-page') ? 'auto' : 'none';
    });

    const modal=document.querySelector('.si-modal');
    if(modal){
      modal.style.pointerEvents = modal.classList.contains('hidden') ? 'none' : 'auto';
    }
  }

  function run(){
    removeOldChromeArtifacts();
    repairPointerEvents();
  }

  let raf=0;
  const queue=()=>{
    if(raf)return;
    raf=requestAnimationFrame(()=>{
      raf=0;
      run();
    });
  };

  document.addEventListener('DOMContentLoaded',queue,{once:true});
  window.addEventListener('load',queue,{once:true});

  new MutationObserver(queue).observe(document.documentElement,{
    subtree:true,
    childList:true,
    attributes:true,
    attributeFilter:['class','style','aria-hidden']
  });

  run();
})();
