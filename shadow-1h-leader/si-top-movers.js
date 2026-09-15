/* Shadow Intelligence — 1H Fastest Mover v2.5.5 */
(() => {
  const ROOT_ID='siTopMovers24h', REFRESH_MS=60000;
  let timer=0, loading=false;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sym=v=>{const s=String(v||'TOKEN').trim();return s.startsWith('$')?s:'$'+s};
  const cap=v=>{const n=Number(v);if(!Number.isFinite(n)||n<=0)return'—';if(n>=1e9)return'$'+(n/1e9).toFixed(n>=1e10?0:1)+'B';if(n>=1e6)return'$'+(n/1e6).toFixed(n>=1e7?0:1)+'M';if(n>=1e3)return'$'+(n/1e3).toFixed(n>=1e5?0:1)+'K';return'$'+n.toFixed(0)};
  function spark(values){
    const a=(Array.isArray(values)?values:[]).map(Number).filter(n=>Number.isFinite(n)&&n>0);
    if(a.length<2)return '<svg class="si-mover-spark is-empty" viewBox="0 0 96 44"><path d="M3 22H93"/></svg>';
    const w=96,h=44,px=3,py=4;let mn=Math.min(...a),mx=Math.max(...a);
    if(mx-mn<Math.max(1e-12,Math.abs(mx)*.000001)){mn-=Math.abs(mn||1)*.01;mx+=Math.abs(mx||1)*.01}
    const sp=mx-mn||1,step=(w-px*2)/Math.max(1,a.length-1);
    const d=a.map((n,i)=>{const x=px+step*i,y=py+(1-(n-mn)/sp)*(h-py*2);return`${i?'L':'M'}${x.toFixed(2)} ${y.toFixed(2)}`}).join(' ');
    return `<svg class="si-mover-spark is-positive" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${d}"/></svg>`;
  }
  function card(i){
    const ch=Number(i.change1h||0);
    return `<button type="button" class="si-mover-card" data-mover-mint="${esc(i.mint)}">
      <span class="si-mover-copy">
        <span class="si-mover-symbol">${esc(sym(i.symbol))}</span>
        <span class="si-mover-market"><span class="si-mover-mc">${esc(cap(i.marketCap))}</span><b class="pos">+${ch.toFixed(2)}%</b></span>
      </span>
      <span class="si-mover-chart">${spark(i.sparkline)}</span>
    </button>`;
  }
  function root(){
    let r=document.getElementById(ROOT_ID); if(r)return r;
    const p=document.getElementById('page-overview'); if(!p)return null;
    r=document.createElement('section'); r.id=ROOT_ID; r.className='si-top-movers24h si-fastest-mover1h'; r.hidden=true;
    r.innerHTML='<div class="si-movers-track"></div>'; p.appendChild(r); return r;
  }
  function bind(r){
    const c=r.querySelector('[data-mover-mint]'); if(!c)return;
    c.onclick=()=>{const mint=c.dataset.moverMint; try{if(typeof openObject==='function')openObject('token',{mint})}catch{}};
  }
  async function load(){
    if(loading||document.hidden)return; const r=root(); if(!r)return; loading=true;
    try{
      const q=await fetch('/api/market/movers',{headers:{accept:'application/json'},cache:'no-store'});
      if(!q.ok)throw new Error(`HTTP ${q.status}`);
      const d=await q.json(), i=Array.isArray(d.items)?d.items[0]:null, t=r.querySelector('.si-movers-track');
      if(!i||Number(i.change1h||0)<=0){r.hidden=true;t.innerHTML='';return}
      t.innerHTML=card(i); r.hidden=false; bind(r);
    }catch(e){console.debug('1H fastest mover unavailable:',e)}finally{loading=false}
  }
  function start(){root();load();clearInterval(timer);timer=setInterval(load,REFRESH_MS)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load()});
  window.addEventListener('pageshow',load);
})();