/* Shadow Intelligence — Live Activity Beacon Card v2.5.6 */
(() => {
  const ROOT_ID='siTopMovers24h';
  const REFRESH_MS=15000;
  let timer=0, loading=false, lastId='';

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function ago(v){
    if(!v)return '';
    const t=new Date(v).getTime();
    if(!Number.isFinite(t))return '';
    const m=Math.max(0,Math.floor((Date.now()-t)/60000));
    if(m<1)return 'now';
    if(m<60)return `${m}m`;
    const h=Math.floor(m/60);
    if(h<24)return `${h}h`;
    return `${Math.floor(h/24)}d`;
  }

  function actionLabel(type){
    const t=String(type||'').toLowerCase();
    if(t==='buy')return 'BUY';
    if(t==='sell')return 'SELL';
    if(t==='swap')return 'SWAP';
    return t.toUpperCase()||'LIVE';
  }

  function tokenLabel(item){
    const raw=String(item.tokenSymbol||item.symbol||item.tokenName||'TOKEN').trim();
    return raw.startsWith('$')?raw:`$${raw.replace(/^\$/,'')}`;
  }

  function entityLabel(item){
    const x=String(item.xHandle||'').trim().replace(/^@/,'');
    if(x)return `@${x}`;
    return String(item.entityName||'LIVE').trim();
  }

  function valueHtml(item){
    const n=Number(item.value ?? item.priceChange);
    if(!Number.isFinite(n))return '';
    const cls=n>=0?'pos':'neg';
    return `<b class="si-live-beacon-value ${cls}">${n>=0?'+':''}${n.toFixed(Math.abs(n)>=100?0:2)}%</b>`;
  }

  function cardHtml(item){
    const type=String(item.type||'').toLowerCase();
    return `<button type="button" class="si-live-beacon-card" data-live-event="${esc(item.id||'')}">
      <span class="si-live-beacon-dot" aria-hidden="true"></span>
      <span class="si-live-beacon-copy">
        <span class="si-live-beacon-top">
          <strong>${esc(entityLabel(item))}</strong>
          <small>${esc(ago(item.createdAt||item.eventAt))}</small>
        </span>
        <span class="si-live-beacon-bottom">
          <em class="is-${esc(type)}">${esc(actionLabel(type))}</em>
          <span>${esc(tokenLabel(item))}</span>
          ${valueHtml(item)}
        </span>
      </span>
    </button>`;
  }

  function ensureRoot(){
    let r=document.getElementById(ROOT_ID);
    if(r)return r;
    const p=document.getElementById('page-overview');
    if(!p)return null;
    r=document.createElement('section');
    r.id=ROOT_ID;
    r.className='si-top-movers24h si-live-beacon-shell';
    r.hidden=true;
    r.setAttribute('aria-label','Latest live activity');
    r.innerHTML='<div class="si-movers-track"></div>';
    p.appendChild(r);
    return r;
  }

  function bind(r){
    const card=r.querySelector('.si-live-beacon-card');
    if(!card)return;
    card.onclick=()=>{
      try{
        if(typeof nav==='function'){
          nav('feed');
          return;
        }
      }catch{}
      const link=document.querySelector('[data-page="feed"],[data-nav="feed"],a[href="#feed"]');
      if(link)link.click();
    };
  }

  function newestTrade(items){
    return (Array.isArray(items)?items:[]).find(item=>{
      const t=String(item?.type||'').toLowerCase();
      return t==='buy'||t==='sell'||t==='swap';
    })||null;
  }

  async function load(){
    if(loading||document.hidden)return;
    const r=ensureRoot();
    if(!r)return;
    loading=true;
    try{
      const q=await fetch('/api/feed?limit=20',{headers:{accept:'application/json'},cache:'no-store'});
      if(!q.ok)throw new Error(`HTTP ${q.status}`);
      const data=await q.json();
      const item=newestTrade(data?.items);
      const track=r.querySelector('.si-movers-track');

      if(!item){
        r.hidden=true;
        track.innerHTML='';
        return;
      }

      const id=String(item.id||'');
      const changed=!!lastId && id && id!==lastId;
      const first=!lastId;
      lastId=id||lastId;

      track.innerHTML=cardHtml(item);
      r.hidden=false;
      bind(r);

      if(changed||first){
        const card=r.querySelector('.si-live-beacon-card');
        card?.classList.add('is-new');
        setTimeout(()=>card?.classList.remove('is-new'),700);
      }
    }catch(error){
      console.debug('Live activity beacon unavailable:',error);
    }finally{
      loading=false;
    }
  }

  function start(){
    ensureRoot();
    load();
    clearInterval(timer);
    timer=setInterval(load,REFRESH_MS);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',start,{once:true});
  }else{
    start();
  }

  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
  window.addEventListener('pageshow',load);
})();
