const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const ago=v=>{if(!v)return'—';const m=Math.max(0,Math.floor((Date.now()-new Date(v))/60000));if(m<1)return'now';if(m<60)return`${m}m`;if(m<1440)return`${Math.floor(m/60)}h`;return`${Math.floor(m/1440)}d`};
const money=n=>{n=Number(n||0);const a=Math.abs(n),s=n<0?'-':n>0?'+':'';if(a>=1e6)return s+'$'+(a/1e6).toFixed(2)+'M';if(a>=1e3)return s+'$'+(a/1e3).toFixed(a>=100000?0:1)+'K';return s+'$'+a.toFixed(a<10?2:0)};
const short=a=>{a=String(a||'');return a.length>13?a.slice(0,7)+'…'+a.slice(-5):a};
const state={user:null,settings:{},entities:[],tokens:[],overview:null,details:new Map(),graph:null,detailGraph:null,lastEventIds:new Set(),activeDm:null};
async function api(url,opt={}){const r=await fetch(url,{...opt,headers:{'content-type':'application/json',...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||`HTTP ${r.status}`);return d}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),2400)}
function avatar(item,size='md'){const src=item?.avatar||item?.image||'';const key=item?.name||item?.displayName||item?.x_handle||item?.xHandle||item?.symbol||item?.address||'SI';const bg=src?`background-image:url("${esc(src)}")`:`background:linear-gradient(135deg,hsl(${Math.abs([...key].reduce((a,c)=>a+c.charCodeAt(0),0))%360} 70% 52%),#111)`;return`<span class="avatar avatar-${size}" style="${bg}"></span>`}
function setAuth(){document.body.classList.toggle('is-auth',!!state.user);document.body.classList.toggle('is-owner',['owner','admin'].includes(state.user?.role));$('#userLabel').textContent=state.user?.displayName||'Sign in';$('#userAvatar').outerHTML=avatar(state.user,'sm').replace('class="avatar','id="userAvatar" class="avatar');$$('.auth-only').forEach(x=>x.style.display=state.user?'':'none');$$('.guest-only').forEach(x=>x.style.display=state.user?'none':'');$$('.owner-only').forEach(x=>x.style.display=['owner','admin'].includes(state.user?.role)?'':'none')}
function theme(){return document.documentElement.dataset.theme==='dark'?'dark':'light'}
function toggleTheme(){const n=theme()==='dark'?'light':'dark';document.documentElement.dataset.theme=n;localStorage.setItem('si-theme',n);state.graph?.schedule();state.detailGraph?.schedule()}
let currentPage='overview';

function nav(name,{push=true,replace=false}={}){
  const page=$(`#page-${name}`);
  if(!page)return;
  if(['messages'].includes(name)&&!state.user)return authModal('login');
  if(name==='settings'&&!['owner','admin'].includes(state.user?.role))return toast('Owner access required');

  if(!$('#modal')?.classList.contains('hidden'))closeModal();

  const previous=currentPage;
  currentPage=name;
  $$('.si-page').forEach(p=>p.classList.remove('active-page'));
  page.classList.add('active-page');
  $$('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===name));

  if(push && name!==previous){
    const url=new URL(location.href);
    url.hash=name==='overview'?'':name;
    const hist={...(history.state||{}),shadowPage:name};
    if(replace)history.replaceState(hist,'',url);
    else history.pushState(hist,'',url);
  }else if(replace){
    const url=new URL(location.href);
    url.hash=name==='overview'?'':name;
    history.replaceState({...(history.state||{}),shadowPage:name},'',url);
  }

  try{page.scrollTo({top:0,behavior:'instant'})}catch{page.scrollTop=0}

  if(name==='entities')renderEntities();
  if(name==='wallets')renderWallets();
  if(name==='tokens')renderTokens();
  if(name==='feed')renderFeed();
  if(name==='evidence')loadEvidence();
  if(name==='chat')loadChat();
  if(name==='messages')loadConversations();
  if(name==='settings')loadSettings();
}

function backPage(){
  if(currentPage==='overview')return;
  if(history.state?.shadowPage===currentPage && history.length>1){
    history.back();
    return;
  }
  nav('overview',{push:false,replace:true});
}

async function boot(){
 try{const me=await api('/api/me');state.user=me.user;state.settings=me.settings||{};document.title=state.settings.platformName||'Shadow Intelligence'}catch{}
 setAuth();bind();await refresh();nav('overview',{push:false,replace:true});
 setInterval(()=>{
   if(!['chat','messages','settings'].includes(currentPage))refresh();
 },7000);
}
function bind(){
 $$('[data-nav]').forEach(b=>b.onclick=()=>{
   const target=b.dataset.nav;
   nav(target);
   if(target==='overview' && state.overview && !state.graph){
     renderOverview().catch(e=>console.error('Map retry failed',e));
   }
 });$('#themeToggle').onclick=toggleTheme;$('#adminTheme').onclick=toggleTheme;$('#userButton').onclick=()=>state.user?nav('messages'):authModal('login');$('#modalClose').onclick=closeModal;$('#modal').onclick=e=>{if(e.target.id==='modal')closeModal()};$('#addEntityBtn').onclick=entityModal;$('#entitiesAddBtn').onclick=entityModal;$('#evidenceAddBtn').onclick=evidenceModal;$('#chatForm').onsubmit=sendChat;$('#dmForm').onsubmit=sendDm;$('#userSearch').oninput=()=>searchUsers($('#userSearch').value);$('#settingsForm').onsubmit=saveSettings;$('#globalSearch').onkeydown=e=>{if(e.key==='Enter')searchGlobal(e.target.value)};$('#fitMap').onclick=()=>state.graph?.fit();
  $('#pageBack').onclick=backPage;
  window.addEventListener('popstate',e=>{
    const name=e.state?.shadowPage||'overview';
    nav(name,{push:false});
  });
}
async function refresh(){
  try{
    const [o,l,e,t]=await Promise.all([
      api('/api/overview'),
      api('/api/live/status').catch(()=>null),
      api('/api/entities'),
      api('/api/tokens')
    ]);
    state.overview=o;
    state.entities=e.items||[];
    state.tokens=t.items||[];

    if(currentPage==='overview')await renderOverview(l);
    if(currentPage==='feed')renderFeed();
    if(currentPage==='entities')renderEntities();
    if(currentPage==='tokens')renderTokens();
  }catch(e){
    toast(e.message);
  }
}
async function buildGlobalModel(){
 const details=await Promise.all(state.entities.slice(0,18).map(async e=>{try{return await api(`/api/entities/${e.id}`)}catch{return null}}));state.details.clear();details.filter(Boolean).forEach(d=>state.details.set(d.entity.id,d));
 const wallets=details.filter(Boolean).flatMap(d=>d.wallets||[]);
 const seen=new Set(),tokens=[];details.filter(Boolean).forEach(d=>(d.tokens||[]).forEach(t=>{if(!seen.has(t.mint)){seen.add(t.mint);tokens.push({...t,entity_id:d.entity.id})}}));
 return{entities:state.entities.slice(0,18),wallets:wallets.slice(0,36),tokens:tokens.slice(0,42),activity:details.flatMap(d=>d.incidents||[]).slice(0,80)}
}
/* SHADOW_GRAPH_BOOT_RECOVERY_V204_START */
let shadowGraphBootPromise=null;

async function ensureShadowGraph(){
  if(typeof window.ShadowGraph==='function')return window.ShadowGraph;
  if(shadowGraphBootPromise)return shadowGraphBootPromise;

  shadowGraphBootPromise=new Promise((resolve,reject)=>{
    const done=()=>{
      if(typeof window.ShadowGraph==='function')resolve(window.ShadowGraph);
      else reject(new Error('3D engine loaded but ShadowGraph is unavailable'));
    };

    document.querySelectorAll('script[data-shadow-graph-recovery]').forEach(x=>x.remove());

    const tag=document.createElement('script');
    tag.src='/si-graph.js?v=graph-recovery-2.0.4-20260913221305';
    tag.dataset.shadowGraphRecovery='1';
    tag.async=false;
    tag.onload=done;
    tag.onerror=()=>reject(new Error('Failed to load 3D engine'));
    document.head.appendChild(tag);

    setTimeout(()=>{
      if(typeof window.ShadowGraph==='function')resolve(window.ShadowGraph);
    },120);
  });

  try{
    return await shadowGraphBootPromise;
  }catch(error){
    shadowGraphBootPromise=null;
    throw error;
  }
}

function bootGlobalGraph(model){
  const root=$('#globalMap');
  if(!root)throw new Error('3D root #globalMap is missing');

  return ensureShadowGraph().then(Graph=>{
    try{ state.graph?.destroy?.(); }catch(error){ console.warn('Previous graph destroy failed',error); }
    state.graph=null;

    root.replaceChildren();

    const instance=new Graph(root,model,{onSelect:openObject});
    state.graph=instance;

    try{
      if(instance.raf){
        cancelAnimationFrame(instance.raf);
        instance.raf=0;
      }
      instance.resize?.();
      instance.render?.();
    }catch(error){
      try{instance.destroy?.()}catch{}
      state.graph=null;
      throw error;
    }

    return instance;
  });
}
/* SHADOW_GRAPH_BOOT_RECOVERY_V204_END */

async function renderOverview(live){
 const o=state.overview, model=await buildGlobalModel();$('#mapCounts').textContent=`${model.entities.length} entities · ${model.wallets.length} wallets · ${model.tokens.length} tokens`;
 try{
   await bootGlobalGraph(model);
 }catch(error){
   console.error('Shadow 3D boot failed:',error);
   const root=$('#globalMap');
   if(root){
     root.innerHTML='<div class="si-graph-recovery-error">3D renderer unavailable. Tap Map to retry.</div>';
   }
   toast('3D renderer failed to start');
 }$('#focusPanel').innerHTML=o.selected?focusHtml(o.selected):'<div class="guest-note">Add an entity to begin mapping intelligence.</div>';renderLive(o.feed||[]);renderEntitiesStrip();renderConnections(model);
 $('#railStatus').textContent=live?.solana?.status==='online'?'online':'check';
}
function focusHtml(e){const d=state.details.get(e.id),ws=d?.wallets?.length??e.walletCount??0,ts=d?.tokens?.length??0;return`<div class="si-focus-main">${avatar(e,'lg')}<div><h3>${esc(e.name)}</h3><p>${esc(e.x_handle||'')} · ${e.confidence||0}% confidence</p></div></div><div class="si-metrics"><div class="si-metric"><strong>${ws}</strong><small>Wallets</small></div><div class="si-metric"><strong>${ts}</strong><small>Tokens</small></div><div class="si-metric"><strong>${e.riskScore||0}</strong><small>Signal</small></div></div>`}
function eventHtml(x){const type=String(x.type||'activity').toLowerCase(),sell=type.includes('sell')||type==='send',tr=type.includes('transfer')||type==='receive';return`<div class="si-event"><i class="si-event-dot ${sell?'sell':tr?'transfer':''}"></i><div><strong>${esc((x.title||type).replace(/^./,c=>c.toUpperCase()))}</strong><small>${esc(x.detail||x.symbol||x.tokenName||x.walletAddress||'Observed on-chain activity')}</small></div><time>${ago(x.createdAt||x.block_time)}</time></div>`}
function renderLive(items){$('#overviewLive').innerHTML=(items||[]).slice(0,8).map(eventHtml).join('')||'<div class="guest-note">Waiting for live activity.</div>'}
function renderEntitiesStrip(){const arr=state.entities.slice(0,4);$('#entityStrip').innerHTML=arr.map(e=>`<div class="si-entity-chip" data-open="${e.id}">${avatar(e,'sm')}<div><strong>${esc(e.name)}</strong><small>${esc(e.x_handle||'')} · ${e.walletCount||0} wallets</small></div></div>`).join('')||'<div class="guest-note">No tracked entities.</div>';$$('[data-open]',$('#entityStrip')).forEach(x=>x.onclick=()=>openObject('entity',{id:x.dataset.open}))}
function renderConnections(model){const pairs=[];model.tokens.slice(0,12).forEach(t=>pairs.push(`${t.symbol||t.name||'Token'} ↔ ${short(t.mint)}`));$('#connectionStrip').innerHTML=pairs.map(x=>`<span class="si-connection">${esc(x)}</span>`).join('')||'<span class="guest-note">Connections appear after wallet activity.</span>'}
function renderEntities(q=''){const query=(q||'').toLowerCase();const a=state.entities.filter(e=>!query||[e.name,e.x_handle,e.notes].join(' ').toLowerCase().includes(query));$('#entitiesGrid').innerHTML=a.map(e=>`<article class="si-panel si-entity-card" data-entity="${e.id}"><div class="si-card-top">${avatar(e,'lg')}<div><h3>${esc(e.name)}</h3><p>${esc(e.x_handle||'')} · ${e.confidence||0}% confidence</p></div></div><div class="si-card-stats"><div class="si-card-stat"><strong>${e.walletCount||0}</strong><small>Wallets</small></div><div class="si-card-stat"><strong>${e.incidents||0}</strong><small>Events</small></div><div class="si-card-stat"><strong>${e.riskScore||0}</strong><small>Signal</small></div></div></article>`).join('')||'<div class="guest-note">No entities found.</div>';$$('[data-entity]').forEach(x=>x.onclick=()=>openObject('entity',{id:x.dataset.entity}))}
async function renderWallets(){try{const ds=await Promise.all(state.entities.map(e=>api(`/api/entities/${e.id}`)));const ws=ds.flatMap(d=>(d.wallets||[]).map(w=>({...w,entityName:d.entity.name,xHandle:d.entity.x_handle})));$('#walletsTable').innerHTML=`<table class="si-table"><thead><tr><th>Wallet</th><th>Entity</th><th>Status</th><th>Last scan</th><th></th></tr></thead><tbody>${ws.map(w=>`<tr><td><strong>${short(w.address)}</strong><br><small>${esc(w.label||'')}</small></td><td>${esc(w.entityName)}<br><small>${esc(w.xHandle||'')}</small></td><td>${esc(w.sync_status||'pending')}</td><td>${w.last_scanned_at?ago(w.last_scanned_at)+' ago':'not scanned'}</td><td>${['owner','admin'].includes(state.user?.role)?`<button class="si-button" data-sync="${w.id}">Sync</button>`:''}</td></tr>`).join('')}</tbody></table>`;$$('[data-sync]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const r=await api(`/api/wallets/${b.dataset.sync}/sync`,{method:'POST',body:'{}'});toast(`Synced · ${r.newActivity||0} new`);renderWallets()}catch(e){toast(e.message)}finally{b.disabled=false}})}catch(e){toast(e.message)}}
function renderTokens(){const a=state.tokens;$('#tokensGrid').innerHTML=a.map(t=>`<article class="si-panel si-token-card" data-token="${esc(t.mint)}">${avatar(t,'md')}<div><span class="si-token-symbol">${esc(t.symbol||'TOKEN')}</span><p>${esc(t.name||'Unknown')}<br><small>${short(t.mint)}</small></p><small>${t.is_pump?'Pump.fun / PumpSwap':esc(t.dex_id||'Solana')} · MC ${money(t.market_cap||0)}</small></div><strong class="${Number(t.price_change)>=0?'pos':'neg'}">${Number(t.price_change)>=0?'+':''}${Number(t.price_change||0).toFixed(1)}%</strong></article>`).join('')||'<div class="guest-note">Tokens appear after observed activity.</div>';$$('[data-token]').forEach(x=>x.onclick=()=>openObject('token',{mint:x.dataset.token}))}
function renderFeed(){const a=state.overview?.feed||[];$('#fullFeed').innerHTML=a.map(x=>`<div class="si-feed-row">${avatar(x,'md')}<div><h3>${esc(x.title||x.type||'Activity')}</h3><p>${esc(x.detail||x.symbol||x.walletAddress||'')}</p><time>${esc(x.entityName||'Unknown')} · ${ago(x.createdAt)}</time></div><strong class="${Number(x.value)<0?'neg':'pos'}">${x.value!=null?(Number(x.value)>0?'+':'')+esc(x.value)+'%':''}</strong></div>`).join('')||'<div class="guest-note">No live events yet.</div>';loadHealth()}
async function loadHealth(){try{const h=await api('/api/health');$('#liveHealth').innerHTML=`<div class="si-health-line"><span>Solana</span><strong>${esc(h.live?.solana?.status||'unknown')}</strong></div><div class="si-health-line"><span>Provider</span><strong>${esc(h.live?.solana?.provider||'')}</strong></div><div class="si-health-line"><span>X API</span><strong>${h.intelligence?.x?.configured?'configured':'not configured'}</strong></div>`}catch{}}
function modal(html){
  const wasHidden=$('#modal')?.classList.contains('hidden');

  state.detailGraph?.destroy();
  state.detailGraph=null;

  $('#modalBody').innerHTML=html;
  $('#modal').classList.remove('hidden');
  $('#modalBody').scrollTop=0;
  document.body.classList.add('si-detail-page-open');

  if(wasHidden){
    const active=$('.si-page.active-page');
    document.body.dataset.detailReturnPage=active?.id||'page-overview';
  }
}

function closeModal(){
  state.detailGraph?.destroy();
  state.detailGraph=null;
  $('#modal').classList.add('hidden');
  $('#modalBody').innerHTML='';
  document.body.classList.remove('si-detail-page-open');
  delete document.body.dataset.detailReturnPage;
}
function entityDetail(d){const e=d.entity, model={entities:[e],wallets:d.wallets||[],tokens:(d.tokens||[]).map(t=>({...t,entity_id:e.id})),activity:d.incidents||[]};modal(`<div class="si-detail-layout"><aside class="si-detail-side"><div class="si-panel" style="box-shadow:none">${avatar(e,'xl')}<h2>${esc(e.name)}</h2><p>${esc(e.xHandle||e.x_handle||'')} · ${e.confidence||0}% confidence</p><div class="si-metrics"><div class="si-metric"><strong>${d.wallets?.length||0}</strong><small>Wallets</small></div><div class="si-metric"><strong>${d.tokens?.length||0}</strong><small>Tokens</small></div><div class="si-metric"><strong>${e.riskScore||0}</strong><small>Signal</small></div></div>${['owner','admin'].includes(state.user?.role)?'<button id="syncEntity" class="si-button primary" style="margin-top:12px;width:100%">Sync now</button>':''}</div><div class="si-panel" style="box-shadow:none;margin-top:12px"><div class="si-panel-head"><span>LIVE ACTIVITY</span></div><div class="si-detail-activity">${(d.incidents||[]).slice(0,14).map(eventHtml).join('')||'<div class="guest-note">No activity yet.</div>'}</div></div></aside><section class="si-detail-map"><div id="detailGraph" class="si-graph"></div></section></div>`);state.detailGraph=new ShadowGraph($('#detailGraph'),model,{onSelect:openObject});const b=$('#syncEntity');if(b)b.onclick=async()=>{b.disabled=true;try{const r=await api(`/api/entities/${e.id}/sync`,{method:'POST',body:'{}'});toast(`Sync complete · ${r.wallets?.reduce((n,x)=>n+(x.newActivity||0),0)||0} new activity`);const nd=await api(`/api/entities/${e.id}`);entityDetail(nd)}catch(x){toast(x.message)}finally{b.disabled=false}}}
function walletDetail(w,items){const model={entities:state.entities.filter(e=>e.id===w.entity_id),wallets:[w],tokens:state.tokens.filter(t=>items.some(a=>a.mint===t.mint)).map(t=>({...t,entity_id:w.entity_id})),activity:items};modal(`<div class="si-detail-layout"><aside class="si-detail-side"><div class="si-panel" style="box-shadow:none">${avatar(w,'xl')}<h2>Wallet</h2><p>${short(w.address)}</p><div class="si-metrics"><div class="si-metric"><strong>${esc(w.sync_status||'pending')}</strong><small>Status</small></div><div class="si-metric"><strong>${items.length}</strong><small>Events</small></div><div class="si-metric"><strong>${esc(w.chain||'solana')}</strong><small>Chain</small></div></div></div><div class="si-panel" style="box-shadow:none;margin-top:12px"><div class="si-panel-head"><span>ACTIVITY</span></div>${items.slice(0,18).map(a=>eventHtml({type:a.type,title:(a.type||'activity').toUpperCase(),detail:a.mint?short(a.mint):'',createdAt:a.block_time})).join('')||'<div class="guest-note">No activity.</div>'}</div></aside><section class="si-detail-map"><div id="detailGraph" class="si-graph"></div></section></div>`);state.detailGraph=new ShadowGraph($('#detailGraph'),model,{onSelect:openObject})}
function tokenDetail(t){const related=state.overview?.feed?.filter(x=>x.symbol===t.symbol||x.tokenName===t.name)||[];modal(`<div class="si-detail-layout"><aside class="si-detail-side"><div class="si-panel" style="box-shadow:none">${avatar(t,'xl')}<h2>${esc(t.symbol||'Token')}</h2><p>${esc(t.name||'Unknown')}</p><p>${short(t.mint)}</p><div class="si-metrics"><div class="si-metric"><strong>${money(t.market_cap||0)}</strong><small>Market cap</small></div><div class="si-metric"><strong class="${Number(t.price_change)>=0?'pos':'neg'}">${Number(t.price_change)>=0?'+':''}${Number(t.price_change||0).toFixed(1)}%</strong><small>Change</small></div><div class="si-metric"><strong>${money(t.liquidity_usd||0)}</strong><small>Liquidity</small></div></div></div><div class="si-panel" style="box-shadow:none;margin-top:12px"><div class="si-panel-head"><span>RECENT SIGNALS</span></div>${related.slice(0,12).map(eventHtml).join('')||'<div class="guest-note">No recent incident records.</div>'}</div></aside><section class="si-detail-map"><div id="detailGraph" class="si-graph"></div></section></div>`);const entities=state.entities.filter(e=>related.some(x=>x.entityId===e.id));state.detailGraph=new ShadowGraph($('#detailGraph'),{entities:entities.length?entities:[state.overview?.selected].filter(Boolean),wallets:[],tokens:[t]},{onSelect:openObject})}
function entityModal(){modal(`<h2>Add entity</h2><form id="entityForm" class="si-modal-form"><label>Name<input name="name" required placeholder="Entity name"></label><label>X handle<input name="xHandle" placeholder="@handle"></label><label>Avatar URL<input name="avatar" placeholder="https://…"></label><label>Initial wallet<input name="wallet" placeholder="Solana address"></label><label>Notes<textarea name="notes" rows="4"></textarea></label><button class="si-button primary">Create entity</button></form>`);$('#entityForm').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));try{const x=await api('/api/entities',{method:'POST',body:JSON.stringify(b)});if(b.wallet)await api(`/api/entities/${x.id}/wallets`,{method:'POST',body:JSON.stringify({address:b.wallet,label:'Main wallet'})});closeModal();toast('Entity created');await refresh();nav('entities')}catch(x){toast(x.message)}}}
function evidenceModal(){modal(`<h2>Add evidence</h2><form id="evidenceForm" class="si-modal-form"><label>Title<input name="title" required></label><label>Entity<select name="entityId"><option value="">General</option>${state.entities.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select></label><label>Type<select name="kind"><option value="x_post">X post</option><option value="profile">Profile</option><option value="transaction">Transaction</option><option value="screenshot">Screenshot</option><option value="note">Research note</option></select></label><label>Source URL<input name="sourceUrl" type="url"></label><label>Note<textarea name="note" rows="5"></textarea></label><button class="si-button primary">Submit evidence</button></form>`);$('#evidenceForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/evidence',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});closeModal();toast('Evidence saved');loadEvidence()}catch(x){toast(x.message)}}}
async function loadEvidence(){try{const d=await api('/api/evidence');$('#evidenceGrid').innerHTML=d.items.map(e=>`<article class="si-panel"><div class="si-eyebrow">${esc(e.kind)}</div><h3>${esc(e.title)}</h3><p>${esc(e.entityName||'General')} · ${ago(e.created_at)}</p><p>${esc(e.note||e.source_url||'')}</p></article>`).join('')||'<div class="guest-note">No evidence yet.</div>'}catch(e){toast(e.message)}}
let chatLoadSeq=0;

async function loadChat(){
  const box=$('#chatMessages');
  if(!box)return;

  const seq=++chatLoadSeq;
  box.setAttribute('aria-busy','true');

  if(!box.childElementCount){
    box.innerHTML='<div class="si-chat-loading">Loading messages…</div>';
  }

  try{
    const d=await api('/api/chat/messages');
    if(seq!==chatLoadSeq)return;

    const items=Array.isArray(d.items)?d.items:[];

    box.innerHTML=items.map(m=>`<div class="si-chat-message">${avatar(m,'sm')}<div class="si-chat-bubble"><strong>${esc(m.displayName)}</strong><time>${ago(m.createdAt)}</time><p>${esc(m.body)}</p></div></div>`).join('')||'<div class="guest-note">Start the conversation.</div>';
    box.removeAttribute('aria-busy');

    const toLatest=()=>{ box.scrollTop=Math.max(0,box.scrollHeight-box.clientHeight); };
    toLatest();
    requestAnimationFrame(toLatest);
    requestAnimationFrame(()=>requestAnimationFrame(toLatest));
  }catch(e){
    if(seq!==chatLoadSeq)return;
    box.removeAttribute('aria-busy');
    box.innerHTML=`<div class="guest-note">${esc(e.message)}</div>`;
  }
}

async function sendChat(e){
  e.preventDefault();

  const i=$('#chatInput');
  const box=$('#chatMessages');
  const body=(i?.value||'').trim();

  if(!body||!box)return;

  // Render immediately. Do NOT wait for network / reload.
  const tempId='chat_tmp_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
  const me=state.user||{displayName:'You',avatar:''};

  box.insertAdjacentHTML('beforeend',`
    <div class="si-chat-message" data-chat-temp="${tempId}">
      ${avatar(me,'sm')}
      <div class="si-chat-bubble">
        <strong>${esc(me.displayName||'You')}</strong>
        <time>sending...</time>
        <p>${esc(body)}</p>
      </div>
    </div>
  `);

  i.value='';

  const optimistic=box.querySelector(`[data-chat-temp="${tempId}"]`);
  const time=optimistic?.querySelector('time');

  const toBottom=()=>{
    box.scrollTop=Math.max(0,box.scrollHeight-box.clientHeight);
  };
  toBottom();
  requestAnimationFrame(toBottom);

  try{
    const saved=await api('/api/chat/messages',{
      method:'POST',
      body:JSON.stringify({body})
    });

    // Server confirmation: keep the already-visible message.
    if(optimistic){
      optimistic.removeAttribute('data-chat-temp');
      if(saved?.item?.id)optimistic.dataset.chatId=saved.item.id;
    }
    if(time)time.textContent='now';

  }catch(x){
    // Keep failed bubble visible and restore draft for retry.
    if(time){
      time.textContent='not sent';
      time.style.color='var(--si-pink)';
    }
    optimistic?.setAttribute('data-chat-failed','true');

    if(i && !i.value)i.value=body;
    toast(x.message);
  }
}

async function loadConversations(){try{const d=await api('/api/conversations');renderConversations(d.items)}catch(e){toast(e.message)}}
function renderConversations(a){$('#conversationList').innerHTML=a.map(u=>`<div class="si-conversation" data-user="${u.id}">${avatar(u,'sm')}<div><strong>${esc(u.displayName)}</strong><small>${esc(u.lastBody||u.xHandle||'Start')}</small></div></div>`).join('')||'<div class="guest-note">No conversations.</div>';$$('[data-user]').forEach(x=>x.onclick=()=>openDm(x.dataset.user))}
async function searchUsers(q){if(!q.trim())return loadConversations();try{const d=await api('/api/users?q='+encodeURIComponent(q));renderConversations(d.items)}catch(e){toast(e.message)}}
async function openDm(id){try{const d=await api('/api/dm/'+id);state.activeDm=id;$('#dmHeader').innerHTML=`${avatar(d.user,'sm')} ${esc(d.user.displayName)} <small>${esc(d.user.xHandle||'')}</small>`;$('#dmMessages').innerHTML=d.items.map(m=>`<div class="si-dm-line ${m.senderId===state.user.id?'mine':''}"><div class="si-dm-text">${esc(m.body)}</div></div>`).join('');$('#dmInput').disabled=false;$('#dmForm button').disabled=false}catch(e){toast(e.message)}}
async function sendDm(e){e.preventDefault();if(!state.activeDm)return;const i=$('#dmInput');if(!i.value.trim())return;try{await api('/api/dm/'+state.activeDm,{method:'POST',body:JSON.stringify({body:i.value})});i.value='';openDm(state.activeDm)}catch(x){toast(x.message)}}
async function loadSettings(){try{const s=await api('/api/settings');$('#setPlatformName').value=s.platform_name||'';$('#setRegistration').checked=s.registration_enabled==='true';$('#setChat').checked=s.community_chat_enabled==='true';$('#setCopy').checked=s.copy_trading_enabled==='true';$('#setRiskThreshold').value=s.risk_high_threshold||80;$('#setDemo').checked=s.demo_mode==='true';$('#setLiveMonitor').checked=s.live_monitor_enabled==='true';$('#setPollSeconds').value=s.live_poll_seconds||60;$('#setHistoryLimit').value=s.wallet_history_limit||30;$('#setXMonitor').checked=s.x_monitor_enabled==='true';const h=await api('/api/live/status');$('#providerStatus').textContent=`Solana: ${h.solana?.status||'unknown'} · ${h.solana?.provider||''} · X: ${h.x?.configured?'configured':'not configured'}`}catch(e){toast(e.message)}}
async function saveSettings(e){e.preventDefault();try{const b={platform_name:$('#setPlatformName').value,registration_enabled:$('#setRegistration').checked,community_chat_enabled:$('#setChat').checked,copy_trading_enabled:$('#setCopy').checked,risk_high_threshold:$('#setRiskThreshold').value,demo_mode:$('#setDemo').checked,live_monitor_enabled:$('#setLiveMonitor').checked,live_poll_seconds:$('#setPollSeconds').value,wallet_history_limit:$('#setHistoryLimit').value,x_monitor_enabled:$('#setXMonitor').checked};const s=await api('/api/settings',{method:'PATCH',body:JSON.stringify(b)});document.querySelectorAll('[data-platform-name]').forEach(x=>x.textContent=s.platform_name);toast('Settings saved')}catch(e){toast(e.message)}}
function searchGlobal(q){q=q.trim().toLowerCase();if(!q)return;const e=state.entities.find(x=>[x.name,x.x_handle].join(' ').toLowerCase().includes(q));if(e)return openObject('entity',e);const t=state.tokens.find(x=>[x.symbol,x.name,x.mint].join(' ').toLowerCase().includes(q));if(t)return openObject('token',t);const w=[...state.details.values()].flatMap(d=>d.wallets||[]).find(x=>String(x.address).toLowerCase().includes(q));if(w)return openObject('wallet',w);toast('Nothing found')}
boot();

/* SHADOW_VIEWPORT_LOCK_V193_START */
function installShadowViewportLock193(){
  if(window.__shadowViewportLock193)return;
  window.__shadowViewportLock193=true;

  for(const type of ['gesturestart','gesturechange','gestureend']){
    document.addEventListener(type,e=>{
      e.preventDefault();
    },{passive:false});
  }

  document.addEventListener('dblclick',e=>{
    if(!(e.target instanceof Element && e.target.closest('.si-graph'))){
      e.preventDefault();
    }
  },{passive:false});

  document.addEventListener('wheel',e=>{
    if(e.ctrlKey||e.metaKey)e.preventDefault();
  },{passive:false});
}

installShadowViewportLock193();
/* SHADOW_VIEWPORT_LOCK_V193_END */
