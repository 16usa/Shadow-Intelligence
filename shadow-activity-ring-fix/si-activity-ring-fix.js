/* Shadow Intelligence — Activity Ring Fix v2.7.3
   Keep activity/beacon logic intact.
   Remove ONLY the persistent green outline/ring around active avatars.
*/
(() => {
  const BEACON = '.si-entity-beacon';
  const MARK = 'data-si-activity-ring-neutralized';

  const saved = new WeakMap();

  function styleSnapshot(el){
    if(!(el instanceof HTMLElement)) return null;
    return {
      borderTopColor: el.style.getPropertyValue('border-top-color'),
      borderRightColor: el.style.getPropertyValue('border-right-color'),
      borderBottomColor: el.style.getPropertyValue('border-bottom-color'),
      borderLeftColor: el.style.getPropertyValue('border-left-color'),
      borderColor: el.style.getPropertyValue('border-color'),
      outline: el.style.getPropertyValue('outline'),
      outlineColor: el.style.getPropertyValue('outline-color'),
      boxShadow: el.style.getPropertyValue('box-shadow'),
    };
  }

  function remember(el){
    if(!(el instanceof HTMLElement) || saved.has(el)) return;
    saved.set(el, styleSnapshot(el));
  }

  function restore(el){
    if(!(el instanceof HTMLElement)) return;
    const old=saved.get(el);
    if(!old) return;

    const props={
      'border-top-color':old.borderTopColor,
      'border-right-color':old.borderRightColor,
      'border-bottom-color':old.borderBottomColor,
      'border-left-color':old.borderLeftColor,
      'border-color':old.borderColor,
      'outline':old.outline,
      'outline-color':old.outlineColor,
      'box-shadow':old.boxShadow
    };

    for(const [prop,value] of Object.entries(props)){
      if(value) el.style.setProperty(prop,value);
      else el.style.removeProperty(prop);
    }

    saved.delete(el);
  }

  function sameVisualPeer(node){
    if(!(node instanceof HTMLElement)) return null;
    const parent=node.parentElement;
    if(!parent) return null;

    const rect=node.getBoundingClientRect();
    const candidates=[...parent.children].filter(el=>{
      if(!(el instanceof HTMLElement) || el===node) return false;
      if(el.querySelector(BEACON)) return false;

      const r=el.getBoundingClientRect();
      if(!r.width || !r.height) return false;

      const sameTag=el.tagName===node.tagName;
      const similarSize=
        Math.abs(r.width-rect.width)<=Math.max(8,rect.width*.18) &&
        Math.abs(r.height-rect.height)<=Math.max(8,rect.height*.18);

      return sameTag && similarSize;
    });

    if(!candidates.length) return null;

    const nodeClasses=[...node.classList].filter(c=>
      !/active|beacon|buy|sell|pulse|live|signal/i.test(c)
    );

    candidates.sort((a,b)=>{
      const score=el=>{
        const classes=[...el.classList];
        return nodeClasses.reduce((n,c)=>n+(classes.includes(c)?1:0),0);
      };
      return score(b)-score(a);
    });

    return candidates[0] || null;
  }

  function copyNeutralVisual(target,peer){
    if(!(target instanceof HTMLElement)) return;
    remember(target);

    if(peer instanceof HTMLElement){
      const cs=getComputedStyle(peer);
      target.style.setProperty('border-top-color',cs.borderTopColor,'important');
      target.style.setProperty('border-right-color',cs.borderRightColor,'important');
      target.style.setProperty('border-bottom-color',cs.borderBottomColor,'important');
      target.style.setProperty('border-left-color',cs.borderLeftColor,'important');
      target.style.setProperty(
        'outline',
        `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`,
        'important'
      );
      target.style.setProperty('box-shadow',cs.boxShadow,'important');
      return;
    }

    // Fallback: remove only outline/shadow. Do not touch layout, size,
    // animation, beacon DOM, activity tracking, or event state.
    target.style.setProperty('outline','none','important');
    target.style.setProperty('box-shadow','none','important');
  }

  function correspondingVisual(activeRoot,peerRoot){
    const selectors=[
      'img',
      '.si-avatar',
      '.avatar',
      '[class*="avatar"]',
      '[class*="image"]'
    ];

    for(const selector of selectors){
      const active=activeRoot.querySelector(selector);
      const peer=peerRoot?.querySelector?.(selector);
      if(active instanceof HTMLElement){
        return {active,peer:peer instanceof HTMLElement?peer:null};
      }
    }

    return {active:null,peer:null};
  }

  function neutralizeNode(node){
    if(!(node instanceof HTMLElement)) return;

    const peer=sameVisualPeer(node);
    copyNeutralVisual(node,peer);

    const {active,peer:peerVisual}=correspondingVisual(node,peer);
    if(active) copyNeutralVisual(active,peerVisual);

    // If the beacon itself is the full-size circular overlay that paints the
    // green ring, neutralize ONLY its ring paint. The beacon stays mounted,
    // timed, persisted, and functional.
    const beacon=node.querySelector(BEACON);
    if(beacon instanceof HTMLElement){
      const nr=node.getBoundingClientRect();
      const br=beacon.getBoundingClientRect();

      const fullSize =
        nr.width>0 && nr.height>0 &&
        br.width>=nr.width*.65 &&
        br.height>=nr.height*.65;

      if(fullSize){
        remember(beacon);
        beacon.style.setProperty('border-color','transparent','important');
        beacon.style.setProperty('outline','none','important');
        beacon.style.setProperty('box-shadow','none','important');
      }
    }

    node.setAttribute(MARK,'1');
  }

  function clearNode(node){
    if(!(node instanceof HTMLElement)) return;

    restore(node);

    const {active}=correspondingVisual(node,null);
    if(active) restore(active);

    const beacon=node.querySelector(BEACON);
    if(beacon instanceof HTMLElement) restore(beacon);

    node.removeAttribute(MARK);
  }

  function sync(){
    // Neutralize only nodes with an active beacon.
    document.querySelectorAll(BEACON).forEach(beacon=>{
      const node=beacon.parentElement;
      if(node instanceof HTMLElement) neutralizeNode(node);
    });

    // Restore nodes after their beacon expires/disappears.
    document.querySelectorAll(`[${MARK}]`).forEach(node=>{
      if(!node.querySelector(BEACON)) clearNode(node);
    });
  }

  let raf=0;
  const schedule=()=>{
    cancelAnimationFrame(raf);
    raf=requestAnimationFrame(sync);
  };

  const observer=new MutationObserver(schedule);
  observer.observe(document.documentElement,{
    subtree:true,
    childList:true,
    attributes:true,
    attributeFilter:['class','style']
  });

  window.addEventListener('pageshow',schedule);
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden) schedule();
  });

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',schedule,{once:true});
  }else{
    schedule();
  }
})();