const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const ago=v=>{if(!v)return'—';const m=Math.max(0,Math.floor((Date.now()-new Date(v))/60000));if(m<1)return'now';if(m<60)return`${m}m`;if(m<1440)return`${Math.floor(m/60)}h`;return`${Math.floor(m/1440)}d`};
const money=n=>{n=Number(n||0);const a=Math.abs(n),s=n<0?'-':n>0?'+':'';if(a>=1e6)return s+'$'+(a/1e6).toFixed(2)+'M';if(a>=1e3)return s+'$'+(a/1e3).toFixed(a>=100000?0:1)+'K';return s+'$'+a.toFixed(a<10?2:0)};
const short=a=>{a=String(a||'');return a.length>13?a.slice(0,7)+'…'+a.slice(-5):a};
/* SHADOW_TOKEN_ADDRESS_COPY_V220_START */
async function copyTokenAddress(value){
  const text=String(value||'').trim();
  if(!text)return false;

  try{
    if(navigator.clipboard?.writeText){
      await navigator.clipboard.writeText(text);
      return true;
    }
  }catch{}

  try{
    const ta=document.createElement('textarea');
    ta.value=text;
    ta.setAttribute('readonly','');
    ta.style.position='fixed';
    ta.style.opacity='0';
    ta.style.pointerEvents='none';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0,ta.value.length);
    const ok=document.execCommand('copy');
    ta.remove();
    return !!ok;
  }catch{
    return false;
  }
}

function tokenAddressCopyHtml(mint){
  const address=String(mint||'').trim();
  if(!address)return '<span>—</span>';

  return `<span class="si-token-address-copy" style="display:inline-flex;align-items:center;gap:8px;max-width:100%">
    <span style="min-width:0">${esc(short(address))}</span>
    <button
      type="button"
      data-copy-token-address="${esc(address)}"
      aria-label="Copy token address"
      title="Copy token address"
      style="
        width:30px;height:30px;min-width:30px;padding:0;
        display:inline-grid;place-items:center;
        border:0;background:transparent;color:currentColor;
        opacity:.72;cursor:pointer;border-radius:8px;
        -webkit-tap-highlight-color:transparent
      "
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="9" y="9" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.8"/>
        <path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    </button>
  </span>`;
}

function bindTokenAddressCopy(root=document){
  root.querySelectorAll?.('[data-copy-token-address]').forEach(button=>{
    button.onclick=async event=>{
      event.preventDefault();
      event.stopPropagation();

      const address=button.dataset.copyTokenAddress||'';
      const ok=await copyTokenAddress(address);

      if(ok){
        const oldTitle=button.getAttribute('title')||'Copy token address';
        button.setAttribute('title','Copied');
        button.style.opacity='1';
        toast('Token address copied');
        setTimeout(()=>{
          button.setAttribute('title',oldTitle);
          button.style.opacity='.72';
        },1200);
      }else{
        toast('Could not copy token address');
      }
    };
  });
}
/* SHADOW_TOKEN_ADDRESS_COPY_V220_END */
const state={user:null,settings:{},entities:[],tokens:[],overview:null,details:new Map(),graph:null,detailGraph:null,lastEventIds:new Set(),activeDm:null};
async function api(url,opt={}){const r=await fetch(url,{...opt,headers:{'content-type':'application/json',...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||`HTTP ${r.status}`);return d}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),2400)}
/* SHADOW_TOKEN_IMAGE_FIX_V211_START */
function imageSource(item){
  if(!item) return '';
  const candidates=[
    item.avatar,item.image,item.imageUrl,item.image_url,item.imageURI,item.image_uri,
    item.icon,item.iconUrl,item.iconURL,item.icon_url,
    item.logo,item.logoUrl,item.logoURL,item.logo_url,
    item.logoURI,item.logo_uri,
    item.thumbnail,item.thumb,item.picture,item.photo,
    item.profile_image,item.profileImage,
    item.metadata?.image,item.metadata?.image_url,item.metadata?.logoURI,
    item.token?.image,item.token?.image_url,item.token?.logoURI
  ];
  for(const v of candidates){
    const src=String(v||'').trim();
    if(src) return src;
  }
  return '';
}
function avatar(item,size='md'){
  const src=imageSource(item);
  const key=item?.name||item?.displayName||item?.x_handle||item?.xHandle||item?.symbol||item?.address||item?.mint||'SI';
  const hue=Math.abs([...String(key)].reduce((a,c)=>a+c.charCodeAt(0),0))%360;
  const bg=src
    ? `background-image:url(&quot;${esc(src)}&quot;)`
    : `background:linear-gradient(135deg,hsl(${hue} 70% 52%),#111)`;
  return `<span class="avatar avatar-${size}" style="${bg}"></span>`;
}
/* SHADOW_TOKEN_IMAGE_FIX_V211_END */
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
 try{
   const me=await api('/api/me');
   state.user=me.user;
   state.settings=me.settings||{};
   document.title=state.settings.platformName||'Shadow Intelligence';
 }catch{}
 setAuth();
 bind();
 nav('overview',{push:false,replace:true});
 refresh();
 startMapSignalPoll();
 setInterval(()=>{
   if(!['chat','messages','settings'].includes(currentPage))refresh();
 },7000);
}
function bind(){
 $$('[data-nav]').forEach(b=>b.onclick=()=>{
   const target=b.dataset.nav;
   nav(target);
   if(target==='overview')renderOverview().catch(e=>console.error('Map render failed',e));
 });$('#themeToggle').onclick=toggleTheme;$('#adminTheme').onclick=toggleTheme;$('#userButton').onclick=()=>state.user?nav('messages'):authModal('login');$('#modalClose').onclick=closeModal;$('#modal').onclick=e=>{if(e.target.id==='modal')closeModal()};$('#addEntityBtn').onclick=entityModal;$('#entitiesAddBtn').onclick=entityModal;$('#evidenceAddBtn').onclick=evidenceModal;$('#chatForm').onsubmit=sendChat;$('#dmForm').onsubmit=sendDm;$('#userSearch').oninput=()=>searchUsers($('#userSearch').value);$('#settingsForm').onsubmit=saveSettings;$('#globalSearch').onkeydown=e=>{if(e.key==='Enter')searchGlobal(e.target.value)};$('#fitMap').onclick=()=>state.graph?.fit();
  $('#pageBack').onclick=backPage;
  window.addEventListener('popstate',e=>{
    const name=e.state?.shadowPage||'overview';
    nav(name,{push:false});
  });
}
let refreshSeq=0;
let graphEntityKey='';

function globalEntityModel(){
  return {entities:state.entities.slice(0,18),wallets:[],tokens:[],activity:[]};
}

function currentMapCounts(){
  return {
    entities:state.entities.length,
    wallets:state.entities.reduce((n,e)=>n+Number(e.walletCount||0),0),
    tokens:state.tokens.length
  };
}

function updateMapCounts(){
  const el=$('#mapCounts');
  if(!el)return;
  const c=currentMapCounts();
  el.textContent=`${c.entities} entities · ${c.wallets} wallets · ${c.tokens} tokens`;
}

/* SHADOW_LIVE_TRADE_BEACON_V214_START */
let mapSignalPollTimer=0;
let mapSignalPollBusy=false;
let mapSignalSeeded=false;

function mapSignalKind(event){
  const type=String(event?.type||'').toLowerCase();
  const title=String(event?.title||'').toLowerCase();

  if(type==='buy'||type.includes('buy')||title.startsWith('bought ')||title.includes(' bought '))return 'buy';
  if(type==='sell'||type.includes('sell')||title.startsWith('sold ')||title.includes(' sold '))return 'sell';
  return '';
}

function rememberMapSignal(id){
  if(!id)return;
  state.lastEventIds.add(String(id));
  while(state.lastEventIds.size>320){
    const oldest=state.lastEventIds.values().next().value;
    state.lastEventIds.delete(oldest);
  }
}

function consumeMapSignals(items=[]){
  const rows=Array.isArray(items)?items:[];

  if(!mapSignalSeeded){
    rows.forEach(event=>rememberMapSignal(event?.id));
    mapSignalSeeded=true;
    return;
  }

  const fresh=rows
    .filter(event=>event?.id&&!state.lastEventIds.has(String(event.id)))
    .reverse();

  for(const event of fresh){
    rememberMapSignal(event.id);
    const kind=mapSignalKind(event);
    if(!kind||!event?.entityId)continue;

    if(
      currentPage==='overview' &&
      !document.body.classList.contains('si-detail-page-open')
    ){
      state.graph?.pulseEntity?.(event.entityId,kind);
    }
  }
}

async function pollMapSignals(){
  if(mapSignalPollBusy||document.hidden)return;
  mapSignalPollBusy=true;
  try{
    const data=await api('/api/feed?limit=30');
    consumeMapSignals(data?.items||[]);
  }catch(error){
    console.debug('Map signal poll skipped:',error?.message||error);
  }finally{
    mapSignalPollBusy=false;
  }
}

function startMapSignalPoll(){
  if(mapSignalPollTimer)return;
  pollMapSignals();
  mapSignalPollTimer=setInterval(pollMapSignals,2000);
}
/* SHADOW_LIVE_TRADE_BEACON_V214_END */

function renderOverviewChrome(live=state.liveStatus){
  const o=state.overview||{};
  const selected=o.selected||state.entities[0]||null;
  const focus=$('#focusPanel');
  if(focus){
    focus.innerHTML=selected
      ? focusHtml(selected)
      : '<div class="guest-note">Add an entity to begin mapping intelligence.</div>';
  }
  renderLive(o.feed||[]);
  renderEntitiesStrip();
  renderConnections({tokens:state.tokens.slice(0,42)});
  const status=$('#railStatus');
  if(status)status.textContent=live?.solana?.status==='online'?'online':'check';
  updateMapCounts();
}

/* SHADOW_DOM_SWARM_V207_START */
class ShadowDomSwarm{
  constructor(root,model={},opts={}){
    this.root=root;
    this.model=model||{};
    this.entities=Array.isArray(this.model.entities)?this.model.entities:[];
    this.onSelect=opts.onSelect||(()=>{});
    this.nodes=[];
    this.dead=false;
    this.raf=0;
    this.last=performance.now();
    this.lastPaint=0;
    this.drag=null;
    this.w=1;
    this.h=1;
    this.centerX=0;
    this.centerY=0;
    this.safe={left:28,right:28,top:118,bottom:158};

    root.dataset.renderer='dom-v207';
    root.dataset.rendererState='booting';
    /* SHADOW_DOM_PILL_WATERMARK_V214_START
       Main Map watermark belongs to the active ShadowDomSwarm renderer.
       SVG is DOM-based and sits behind entity nodes. */
    root.innerHTML=
      '<div class="si-dom-pill-watermark" aria-hidden="true">'+
        '<svg viewBox="0 0 400 184" focusable="false" aria-hidden="true">'+
          '<rect x="8" y="8" width="384" height="168" rx="84" ry="84"></rect>'+
          '<path d="M200 8V176"></path>'+
        '</svg>'+
      '</div>'+
      '<div class="si-dom-swarm" aria-label="Entity intelligence map"></div>'+
      '<div class="si-graph-empty">No network data yet.</div>';
    /* SHADOW_DOM_PILL_WATERMARK_V214_END */

    this.layer=root.querySelector('.si-dom-swarm');
    this.empty=root.querySelector('.si-graph-empty');

    if(!this.layer||!this.empty){
      throw new Error('Global map DOM scaffold could not be created');
    }

    this.ro=typeof ResizeObserver==='function'
      ? new ResizeObserver(()=>this.resize())
      : null;
    this.ro?.observe(root);

    window.addEventListener('resize',this._onWindowResize=()=>this.resize(),{passive:true});
    window.visualViewport?.addEventListener('resize',this._onViewportResize=()=>this.resize(),{passive:true});

    this.build();
    this.resize(true);
    root.dataset.rendererState='ready';
    root.dataset.nodeCount=String(this.nodes.length);
    this.schedule();
  }

  hash(value){
    let h=2166136261>>>0;
    for(const ch of String(value||'entity')){
      h^=ch.charCodeAt(0);
      h=Math.imul(h,16777619)>>>0;
    }
    return h>>>0;
  }

  key(e){
    return String(e?.id||e?.name||e?.x_handle||e?.xHandle||'entity');
  }

  build(){
    this.nodes=[];
    this.layer.replaceChildren();

    for(let i=0;i<this.entities.length;i++){
      const raw=this.entities[i];
      const seed=this.hash(this.key(raw));
      const el=document.createElement('button');

      el.type='button';
      el.className='si-dom-node';
      el.setAttribute('aria-label',raw?.name||raw?.x_handle||'Entity');
      el.style.position='absolute';
      el.style.display='block';
      el.style.opacity='1';
      el.style.visibility='visible';
      el.style.transform='none';
      el.style.webkitTransform='none';

      const avatarUrl=String(raw?.avatar||'').trim();
      if(avatarUrl){
        const img=document.createElement('img');
        img.alt='';
        img.draggable=false;
        img.decoding='async';
        img.loading='eager';
        img.src=avatarUrl;
        img.addEventListener('error',()=>{
          img.remove();
          this.ensureFallback(el,raw);
        },{once:true});
        el.appendChild(img);
      }else{
        this.ensureFallback(el,raw);
      }

      const node={
        raw,el,seed,index:i,
        x:0,y:0,vx:0,vy:0,
        radius:23,
        phase:(seed%6283)/1000,
        phase2:((seed>>>8)%6283)/1000
      };

      el.addEventListener('pointerdown',e=>this.pointerDown(e,node),{passive:false});
      el.addEventListener('pointermove',e=>this.pointerMove(e,node),{passive:false});
      el.addEventListener('pointerup',e=>this.pointerUp(e,node),{passive:false});
      el.addEventListener('pointercancel',e=>this.pointerUp(e,node),{passive:false});

      this.layer.appendChild(el);
      this.nodes.push(node);
    }

    this.empty.style.display=this.nodes.length?'none':'grid';
    this.root.dataset.nodeCount=String(this.nodes.length);
  }

  ensureFallback(el,raw){
    if(el.querySelector('.si-dom-node-fallback'))return;
    const f=document.createElement('span');
    f.className='si-dom-node-fallback';
    const text=String(raw?.name||raw?.x_handle||'?').trim();
    f.textContent=(text[0]||'?').toUpperCase();
    el.appendChild(f);
  }

  resize(forceFit=false){
    if(this.dead)return;

    const r=this.root.getBoundingClientRect();
    const viewportW=window.visualViewport?.width||window.innerWidth||r.width;
    const viewportH=window.visualViewport?.height||window.innerHeight||r.height;

    const nw=Math.max(1,r.width||viewportW);
    const nh=Math.max(1,r.height||viewportH);
    const oldW=this.w,oldH=this.h;
    const first=oldW<=1||oldH<=1;

    this.w=nw;
    this.h=nh;

    this.safe.top=Math.min(136,Math.max(104,this.h*.14));
    this.safe.bottom=Math.min(190,Math.max(150,this.h*.18));
    this.centerX=this.w*.5;

    const usable=Math.max(180,this.h-this.safe.top-this.safe.bottom);
    this.centerY=this.safe.top+usable*.46;

    this.root.dataset.mapSize=`${Math.round(this.w)}x${Math.round(this.h)}`;

    if(forceFit||first){
      this.fit();
      return;
    }

    const sx=this.w/Math.max(1,oldW);
    const sy=this.h/Math.max(1,oldH);

    for(const n of this.nodes){
      n.x*=sx;
      n.y*=sy;
      this.keepNodeInside(n);
    }

    for(let i=0;i<4;i++)this.resolveCollisions(null);
    this.renderNodes();
    this.schedule();
  }

  fit(){
    if(!this.nodes.length)return;

    const usableH=Math.max(180,this.h-this.safe.top-this.safe.bottom);
    const spread=Math.max(82,Math.min(this.w*.31,usableH*.29,142));
    const golden=2.399963229728653;
    const total=this.nodes.length;

    this.nodes.forEach((n,i)=>{
      const f=Math.sqrt((i+.72)/Math.max(1,total));
      const jitter=((n.seed&1023)/1023)-.5;
      const angle=i*golden+jitter*.64;
      const dist=42+f*Math.max(40,spread-42);

      n.x=this.centerX+Math.cos(angle)*dist;
      n.y=this.centerY+Math.sin(angle)*dist*.84;
      n.vx=0;
      n.vy=0;
      this.keepNodeInside(n);
    });

    for(let i=0;i<10;i++)this.resolveCollisions(null);
    this.renderNodes();
    this.schedule();
  }

  keepNodeInside(n){
    const r=n.radius+7;
    const minX=this.safe.left+r;
    const maxX=Math.max(minX,this.w-this.safe.right-r);
    const minY=this.safe.top+r;
    const maxY=Math.max(minY,this.h-this.safe.bottom-r);

    n.x=Math.max(minX,Math.min(maxX,n.x));
    n.y=Math.max(minY,Math.min(maxY,n.y));
  }

  resolveCollisions(dragged=null){
    if(this.nodes.length<2)return;

    for(let pass=0;pass<4;pass++){
      let changed=false;

      for(let i=0;i<this.nodes.length;i++){
        const a=this.nodes[i];

        for(let j=i+1;j<this.nodes.length;j++){
          const b=this.nodes[j];

          let dx=b.x-a.x;
          let dy=b.y-a.y;
          let d=Math.hypot(dx,dy);

          if(d<.01){
            const angle=((a.seed^b.seed)%6283)/1000;
            dx=Math.cos(angle);
            dy=Math.sin(angle);
            d=1;
          }

          const min=a.radius+b.radius+10;
          if(d>=min)continue;

          const nx=dx/d;
          const ny=dy/d;
          const overlap=min-d;

          if(a===dragged&&b!==dragged){
            b.x+=nx*overlap;
            b.y+=ny*overlap;
            b.vx=b.vy=0;
            this.keepNodeInside(b);
          }else if(b===dragged&&a!==dragged){
            a.x-=nx*overlap;
            a.y-=ny*overlap;
            a.vx=a.vy=0;
            this.keepNodeInside(a);
          }else{
            a.x-=nx*overlap*.5;
            a.y-=ny*overlap*.5;
            b.x+=nx*overlap*.5;
            b.y+=ny*overlap*.5;

            a.vx*=.22;a.vy*=.22;
            b.vx*=.22;b.vy*=.22;

            this.keepNodeInside(a);
            this.keepNodeInside(b);
          }

          changed=true;
        }
      }

      if(!changed)break;
    }
  }

  physics(now){
    const dt=Math.max(.45,Math.min(2.2,(now-this.last)/16.667));
    this.last=now;

    for(const n of this.nodes){
      if(this.drag?.node===n)continue;

      const wanderX=
        Math.sin(now*.00021+n.phase)*.007+
        Math.cos(now*.00013+n.phase2)*.004;
      const wanderY=
        Math.cos(now*.00019+n.phase2)*.007+
        Math.sin(now*.00011+n.phase)*.004;

      n.vx+=((this.centerX-n.x)*.00013+wanderX)*dt;
      n.vy+=((this.centerY-n.y)*.00013+wanderY)*dt;
      n.vx*=.972;
      n.vy*=.972;

      const speed=Math.hypot(n.vx,n.vy);
      if(speed>.72){
        n.vx=n.vx/speed*.72;
        n.vy=n.vy/speed*.72;
      }

      n.x+=n.vx*dt;
      n.y+=n.vy*dt;
      this.keepNodeInside(n);
    }

    this.resolveCollisions(null);
  }

  renderNodes(){
    for(const n of this.nodes){
      const left=Math.round(n.x-n.radius);
      const top=Math.round(n.y-n.radius);

      n.el.style.left=`${left}px`;
      n.el.style.top=`${top}px`;
      n.el.style.transform='none';
      n.el.style.webkitTransform='none';
      n.el.style.zIndex=String(12+n.index);
    }
  }

  render(){
    if(this.dead)return;
    this.raf=0;

    if(currentPage!=='overview'||document.body.classList.contains('si-detail-page-open')){
      return;
    }

    const now=performance.now();

    if(now-this.lastPaint<30){
      this.schedule();
      return;
    }

    this.lastPaint=now;
    this.physics(now);
    this.renderNodes();
    this.schedule();
  }

  schedule(){
    if(!this.dead&&!this.raf){
      this.raf=requestAnimationFrame(()=>this.render());
    }
  }

  pointerDown(e,node){
    if(this.dead)return;
    e.preventDefault();
    e.stopPropagation();

    try{node.el.setPointerCapture(e.pointerId)}catch{}

    this.drag={
      node,
      id:e.pointerId,
      startX:e.clientX,
      startY:e.clientY,
      originX:node.x,
      originY:node.y,
      moved:false
    };

    node.vx=node.vy=0;
    node.el.classList.add('dragging');
  }

  pointerMove(e,node){
    const d=this.drag;
    if(!d||d.id!==e.pointerId||d.node!==node)return;

    e.preventDefault();
    e.stopPropagation();

    const dx=e.clientX-d.startX;
    const dy=e.clientY-d.startY;

    if(Math.hypot(dx,dy)>4)d.moved=true;

    node.x=d.originX+dx;
    node.y=d.originY+dy;

    this.keepNodeInside(node);
    this.resolveCollisions(node);
    this.renderNodes();
  }

  pointerUp(e,node){
    const d=this.drag;
    if(!d||d.id!==e.pointerId||d.node!==node)return;

    e.preventDefault();
    e.stopPropagation();

    try{node.el.releasePointerCapture(e.pointerId)}catch{}

    node.el.classList.remove('dragging');
    this.drag=null;
    node.vx=node.vy=0;

    if(!d.moved)this.onSelect('entity',node.raw);
    this.schedule();
  }

  pulseEntity(entityId,kind='buy'){
    if(this.dead||!entityId)return false;

    const node=this.nodes.find(n=>String(n.raw?.id||'')===String(entityId));
    if(!node?.el)return false;

    const existing=[...node.el.querySelectorAll('.si-entity-beacon')];
    while(existing.length>=2)existing.shift()?.remove();

    const beacon=document.createElement('span');
    beacon.className=`si-entity-beacon ${kind==='sell'?'sell':'buy'}`;
    beacon.setAttribute('aria-hidden','true');
    node.el.appendChild(beacon);

    setTimeout(()=>beacon.remove(),60000);
    return true;
  }

  setModel(model={}){
    this.model=model||{};
    this.entities=Array.isArray(this.model.entities)?this.model.entities:[];
    this.build();
    this.fit();
  }

  destroy(){
    this.dead=true;

    if(this.raf)cancelAnimationFrame(this.raf);
    this.raf=0;

    this.ro?.disconnect();
    window.removeEventListener('resize',this._onWindowResize);
    window.visualViewport?.removeEventListener('resize',this._onViewportResize);

    this.drag=null;
  }
}

function mountGlobalGraph(){
  const root=$('#globalMap');
  if(!root)return null;

  const model=globalEntityModel();
  updateMapCounts();

  const key=JSON.stringify(model.entities.map(e=>[
    e.id||'',e.name||'',e.avatar||'',e.x_handle||e.xHandle||''
  ]));

  const healthy=
    state.graph instanceof ShadowDomSwarm &&
    root.dataset.renderer==='dom-v207' &&
    root.dataset.rendererState==='ready' &&
    root.querySelectorAll('.si-dom-node').length===model.entities.length;

  if(healthy&&graphEntityKey===key){
    state.graph.schedule();
    return model;
  }

  try{state.graph?.destroy?.()}catch(error){
    console.warn('Graph destroy warning:',error);
  }

  state.graph=null;
  root.replaceChildren();

  try{
    state.graph=new ShadowDomSwarm(root,model,{onSelect:openObject});
    graphEntityKey=key;
    return model;
  }catch(error){
    root.dataset.rendererState='error';
    root.innerHTML=
      '<div class="si-map-render-error">'+
      '<strong>Map renderer error</strong>'+
      '<span>'+esc(error?.message||'Unknown renderer failure')+'</span>'+
      '</div>';
    throw error;
  }
}
/* SHADOW_DOM_SWARM_V207_END */

async function renderOverview(live=state.liveStatus){
  let model=null;
  try{model=mountGlobalGraph()}
  catch(error){
    console.error('Global graph render failed:',error);
    toast('3D renderer failed to start');
  }
  renderOverviewChrome(live);
  return model;
}

async function refresh(){
  const seq=++refreshSeq;

  const entitiesTask=api('/api/entities')
    .then(data=>{
      if(seq!==refreshSeq)return;
      state.entities=Array.isArray(data.items)?data.items:[];
      updateMapCounts();
      if(currentPage==='overview')renderOverview();
      if(currentPage==='entities')renderEntities();
    })
    .catch(error=>{
      console.error('Entities refresh failed:',error);
      if(!state.entities.length)toast('Entity data unavailable');
    });

  const tokensTask=api('/api/tokens')
    .then(data=>{
      if(seq!==refreshSeq)return;
      state.tokens=Array.isArray(data.items)?data.items:[];
      updateMapCounts();
      if(currentPage==='tokens')renderTokens();
      if(currentPage==='overview')renderConnections({tokens:state.tokens.slice(0,42)});
    })
    .catch(error=>console.error('Tokens refresh failed:',error));

  const overviewTask=api('/api/overview')
    .then(data=>{
      if(seq!==refreshSeq)return;
      state.overview=data||null;
      if(currentPage==='overview')renderOverviewChrome();
      if(currentPage==='feed')renderFeed();
    })
    .catch(error=>console.error('Overview refresh failed:',error));

  const liveTask=api('/api/live/status')
    .then(data=>{
      if(seq!==refreshSeq)return;
      state.liveStatus=data||null;
      if(currentPage==='overview')renderOverviewChrome(state.liveStatus);
    })
    .catch(error=>console.error('Live status refresh failed:',error));

  await Promise.allSettled([entitiesTask,tokensTask,overviewTask,liveTask]);
}

/* SHADOW_PUMP_LINKS_V217_START */
function pumpFunCoinUrl(mint){
  const value=String(mint||'').trim();
  return value ? `https://pump.fun/coin/${encodeURIComponent(value)}` : '';
}

function pumpTokenLink(token,label){
  const mint=String(token?.mint||token?.tokenMint||'').trim();
  const text=esc(label||token?.symbol||token?.tokenName||token?.name||'Token');
  if(!mint)return `<strong>${text}</strong>`;
  return `<a class="si-token-trade-link" data-pump-token-link="1" href="${esc(pumpFunCoinUrl(mint))}" aria-label="Open ${text.replace(/<[^>]*>/g,'')} on Pump.fun"><span>${text}</span><span class="si-token-trade-arrow" aria-hidden="true">&#8599;</span></a>`;
}
/* SHADOW_PUMP_LINKS_V217_END */

function focusHtml(e){const d=state.details.get(e.id),ws=d?.wallets?.length??e.walletCount??0,ts=d?.tokens?.length??0;return`<div class="si-focus-main">${avatar(e,'lg')}<div><h3>${esc(e.name)}</h3><p>${esc(e.x_handle||'')} · ${e.confidence||0}% confidence</p></div></div><div class="si-metrics"><div class="si-metric"><strong>${ws}</strong><small>Wallets</small></div><div class="si-metric"><strong>${ts}</strong><small>Tokens</small></div><div class="si-metric"><strong>${e.riskScore||0}</strong><small>Signal</small></div></div>`}
function eventHtml(x){
  const type=String(x.type||'activity').toLowerCase(),sell=type.includes('sell')||type==='send',tr=type.includes('transfer')||type==='receive';
  const title=(x.title||type).replace(/^./,c=>c.toUpperCase());
  const titleHtml=x.tokenMint?pumpTokenLink({mint:x.tokenMint},title):`<strong>${esc(title)}</strong>`;
  return `<div class="si-event"><i class="si-event-dot ${sell?'sell':tr?'transfer':''}"></i><div>${titleHtml}<small>${esc(x.detail||x.symbol||x.tokenName||x.walletAddress||'Observed on-chain activity')}</small></div><time>${ago(x.createdAt||x.block_time)}</time></div>`;
}
function renderLive(items){$('#overviewLive').innerHTML=(items||[]).slice(0,8).map(eventHtml).join('')||'<div class="guest-note">Waiting for live activity.</div>'}
function renderEntitiesStrip(){const arr=state.entities.slice(0,4);$('#entityStrip').innerHTML=arr.map(e=>`<div class="si-entity-chip" data-open="${e.id}">${avatar(e,'sm')}<div><strong>${esc(e.name)}</strong><small>${esc(e.x_handle||'')} · ${e.walletCount||0} wallets</small></div></div>`).join('')||'<div class="guest-note">No tracked entities.</div>';$$('[data-open]',$('#entityStrip')).forEach(x=>x.onclick=()=>openObject('entity',{id:x.dataset.open}))}
function renderConnections(model){const pairs=[];model.tokens.slice(0,12).forEach(t=>pairs.push(`${t.symbol||t.name||'Token'} ↔ ${short(t.mint)}`));$('#connectionStrip').innerHTML=pairs.map(x=>`<span class="si-connection">${esc(x)}</span>`).join('')||'<span class="guest-note">Connections appear after wallet activity.</span>'}
function renderEntities(q=''){const query=(q||'').toLowerCase();const a=state.entities.filter(e=>!query||[e.name,e.x_handle,e.notes].join(' ').toLowerCase().includes(query));$('#entitiesGrid').innerHTML=a.map(e=>`<article class="si-panel si-entity-card" data-entity="${e.id}"><div class="si-card-top">${avatar(e,'lg')}<div><h3>${esc(e.name)}</h3><p>${esc(e.x_handle||'')} · ${e.confidence||0}% confidence</p></div></div><div class="si-card-stats"><div class="si-card-stat"><strong>${e.walletCount||0}</strong><small>Wallets</small></div><div class="si-card-stat"><strong>${e.incidents||0}</strong><small>Events</small></div><div class="si-card-stat"><strong>${e.riskScore||0}</strong><small>Signal</small></div></div></article>`).join('')||'<div class="guest-note">No entities found.</div>';$$('[data-entity]').forEach(x=>x.onclick=()=>openObject('entity',{id:x.dataset.entity}))}
async function renderWallets(){try{const ds=await Promise.all(state.entities.map(e=>api(`/api/entities/${e.id}`)));const ws=ds.flatMap(d=>(d.wallets||[]).map(w=>({...w,entityName:d.entity.name,xHandle:d.entity.x_handle})));$('#walletsTable').innerHTML=`<table class="si-table"><thead><tr><th>Wallet</th><th>Entity</th><th>Status</th><th>Last scan</th><th></th></tr></thead><tbody>${ws.map(w=>`<tr><td><strong>${short(w.address)}</strong><br><small>${esc(w.label||'')}</small></td><td>${esc(w.entityName)}<br><small>${esc(w.xHandle||'')}</small></td><td>${esc(w.sync_status||'pending')}</td><td>${w.last_scanned_at?ago(w.last_scanned_at)+' ago':'not scanned'}</td><td>${['owner','admin'].includes(state.user?.role)?`<button class="si-button" data-sync="${w.id}">Sync</button>`:''}</td></tr>`).join('')}</tbody></table>`;$$('[data-sync]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const r=await api(`/api/wallets/${b.dataset.sync}/sync`,{method:'POST',body:'{}'});toast(`Synced · ${r.newActivity||0} new`);renderWallets()}catch(e){toast(e.message)}finally{b.disabled=false}})}catch(e){toast(e.message)}}
function renderTokens(){const a=state.tokens;$('#tokensGrid').innerHTML=a.map(t=>`<article class="si-panel si-token-card" data-token="${esc(t.mint)}">${avatar(t,'md')}<div><span class="si-token-symbol">${pumpTokenLink(t,t.symbol||'TOKEN')}</span><p>${esc(t.name||'Unknown')}<br><small>${short(t.mint)}</small></p><small>${t.is_pump?'Pump.fun / PumpSwap':esc(t.dex_id||'Solana')} · MC ${money(t.market_cap||0)}</small></div><strong class="${Number(t.price_change)>=0?'pos':'neg'}">${Number(t.price_change)>=0?'+':''}${Number(t.price_change||0).toFixed(1)}%</strong></article>`).join('')||'<div class="guest-note">Tokens appear after observed activity.</div>';$$('[data-token]').forEach(x=>x.onclick=event=>{if(event.target.closest('[data-pump-token-link]'))return;openObject('token',{mint:x.dataset.token})})}
function renderFeed(){
  const rows=state.overview?.feed||[];
  $('#fullFeed').innerHTML=rows.map(x=>{
    const title=x.title||x.type||'Activity';
    const titleHtml=x.tokenMint
      ? pumpTokenLink({mint:x.tokenMint},title)
      : `<strong>${esc(title)}</strong>`;
    return `<div class="si-feed-row">${avatar(x,'md')}<div><h3>${titleHtml}</h3><p>${esc(x.detail||x.symbol||x.walletAddress||'')}</p><time>${esc(x.entityName||'Unknown')} · ${ago(x.createdAt)}</time></div><strong class="${Number(x.value)<0?'neg':'pos'}">${x.value!=null?(Number(x.value)>0?'+':'')+esc(x.value)+'%':''}</strong></div>`;
  }).join('')||'<div class="guest-note">No live events yet.</div>';
  loadHealth();
}
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
  state.graph?.schedule?.();
}
/* SHADOW_INSTANT_ENTITY_OPEN_V208_START */
let entityOpenSeq=0;

function entityDetailLoading(e){
  const wallets=Number(e?.walletCount||0);
  const signal=Number(e?.riskScore??e?.risk_score??0);
  const handle=e?.xHandle||e?.x_handle||'';

  modal(`<div class="si-detail-layout">
    <aside class="si-detail-side">
      <div class="si-panel" style="box-shadow:none">
        ${avatar(e,'xl')}
        <h2>${esc(e?.name||'Entity')}</h2>
        <p>${esc(handle)} · ${e?.confidence||0}% confidence</p>
        <div class="si-metrics">
          <div class="si-metric"><strong>${wallets}</strong><small>Wallets</small></div>
          <div class="si-metric"><strong>…</strong><small>Tokens</small></div>
          <div class="si-metric"><strong>${signal}</strong><small>Signal</small></div>
        </div>
      </div>
      <div class="si-panel" style="box-shadow:none;margin-top:12px">
        <div class="si-panel-head"><span>LIVE ACTIVITY</span></div>
        <div class="guest-note">Loading live activity…</div>
      </div>
    </aside>
    <section class="si-detail-map">
      <div class="guest-note">Loading network…</div>
    </section>
  </div>`);

  const body=$('#modalBody');
  if(body)body.dataset.detailLoadingId=String(e?.id||'');
}

async function openObject(kind,raw){
  if(kind==='entity'){
    const id=raw?.id;
    if(!id){
      toast('Entity id missing');
      return;
    }

    const cached=state.details.get(id);
    if(cached){
      entityDetail(cached);
      return;
    }

    const e=state.entities.find(x=>x.id===id)||raw;
    const seq=++entityOpenSeq;

    // Open immediately from data already present in the global map.
    // Do not wait for the detail endpoint or market-price enrichment.
    entityDetailLoading(e);

    try{
      const d=await api(`/api/entities/${id}`);
      state.details.set(id,d);

      const body=$('#modalBody');
      const stillCurrent=
        seq===entityOpenSeq &&
        body?.dataset.detailLoadingId===String(id) &&
        !$('#modal')?.classList.contains('hidden');

      if(!stillCurrent)return;

      delete body.dataset.detailLoadingId;
      entityDetail(d);
    }catch(e){
      console.error('Open entity hydration failed:',e);
      const body=$('#modalBody');
      if(
        seq===entityOpenSeq &&
        body?.dataset.detailLoadingId===String(id) &&
        !$('#modal')?.classList.contains('hidden')
      ){
        const note=body.querySelector('.si-detail-activity')||body.querySelector('.guest-note');
        if(note)note.textContent='Could not load live details. Tap back and try again.';
      }
      toast(e.message);
    }
    return;
  }

  if(kind==='wallet'){
    try{
      const id=raw?.id;
      if(!id)throw new Error('Wallet id missing');
      const a=await api(`/api/wallets/${id}/activity?limit=120`);
      walletDetail(raw,a.items||[]);
    }catch(e){
      console.error('Open wallet failed:',e);
      toast(e.message);
    }
    return;
  }

  if(kind==='token'){
    try{
      const mint=raw?.mint;
      if(!mint)throw new Error('Token mint missing');
      const t=state.tokens.find(x=>x.mint===mint)||raw;
      tokenDetail(t);
    }catch(e){
      console.error('Open token failed:',e);
      toast(e.message);
    }
  }
}
/* SHADOW_INSTANT_ENTITY_OPEN_V208_END */

/* SHADOW_ENTITY_TOKENS_V210_START */
function entityTokenRows(tokens=[]){
  if(!tokens.length){
    return '<div class="guest-note si-detail-token-empty">No tracked tokens yet.</div>';
  }

  return `<div class="si-detail-token-list">${
    tokens.map((t,index)=>{
      const pct=t?.pnlKnown && Number.isFinite(Number(t.pnlPercent))
        ? Number(t.pnlPercent)
        : null;
      const pnl=t?.pnlKnown && Number.isFinite(Number(t.pnlUsd))
        ? Number(t.pnlUsd)
        : null;
      const qty=Number(t?.positionTokens||0);

      const qtyText=qty>0
        ? `${qty>=1000000?(qty/1000000).toFixed(2)+'M':qty>=1000?(qty/1000).toFixed(1)+'K':qty.toLocaleString(undefined,{maximumFractionDigits:4})} tokens`
        : short(t?.mint||'');

      return `<button type="button" class="si-detail-token-row" data-entity-token="${index}">
        ${avatar(t,'md')}
        <span class="si-detail-token-main">
          ${pumpTokenLink(t,t?.symbol||'Token')}
          <small>${esc(t?.name||'Unknown token')}</small>
          <small class="si-detail-token-mint">${esc(qtyText)}</small>
        </span>
        <span class="si-detail-token-pnl">
          <strong class="${pct===null?'':pct>=0?'pos':'neg'}">${
            pct===null?'—':`${pct>=0?'+':''}${pct.toFixed(2)}%`
          }</strong>
          <small class="${pnl===null?'':pnl>=0?'pos':'neg'}">${
            pnl===null?'P&L —':money(pnl)
          }</small>
        </span>
      </button>`;
    }).join('')
  }</div>`;
}

function entityDetail(d){
  const liveEntity=state.entities.find(x=>x.id===d?.entity?.id)||{};
  const e={
    ...liveEntity,
    ...(d?.entity||{}),
    avatar:d?.entity?.avatar||liveEntity.avatar||''
  };

  const tokens=(Array.isArray(d?.tokens)?d.tokens:[]).map(t=>{
    const live=(state.tokens||[]).find(x=>
      (t?.mint && x?.mint===t.mint) ||
      (t?.address && x?.address===t.address) ||
      (t?.id && x?.id===t.id) ||
      ((t?.symbol||'') && (x?.symbol||'') && t.symbol===x.symbol && (t?.name||'')===(x?.name||''))
    )||{};
    const src=imageSource(t)||imageSource(live);
    return {
      ...live,
      ...t,
      avatar: src || t?.avatar || live?.avatar || '',
      image: src || t?.image || live?.image || '',
      imageUrl: src || t?.imageUrl || live?.imageUrl || '',
      image_url: src || t?.image_url || live?.image_url || '',
      logoURI: src || t?.logoURI || live?.logoURI || ''
    };
  });
  const wallets=Array.isArray(d?.wallets)?d.wallets:[];
  const incidents=Array.isArray(d?.incidents)?d.incidents:[];

  const model={
    entities:[e],
    wallets,
    tokens:tokens.map(t=>({...t,entity_id:e.id})),
    activity:incidents
  };

  modal(`<div class="si-detail-layout">
    <aside class="si-detail-side">
      <div class="si-panel si-entity-profile-panel" style="box-shadow:none">
        <div class="si-entity-profile-avatar">${avatar(e,'xl')}</div>
        <h2>${esc(e.name)}</h2>
        <p>${esc(e.xHandle||e.x_handle||'')} · ${e.confidence||0}% confidence</p>

        <div class="si-metrics">
          <div class="si-metric"><strong>${wallets.length}</strong><small>Wallets</small></div>
          <div class="si-metric"><strong>${tokens.length}</strong><small>Tokens</small></div>
          <div class="si-metric"><strong>${e.riskScore||e.risk_score||0}</strong><small>Signal</small></div>
        </div>

        ${['owner','admin'].includes(state.user?.role)
          ? `<div class="si-entity-admin-actions" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">
               <button id="syncEntity" class="si-button primary" style="grid-column:1/-1;width:100%">Sync now</button>
               <button id="editEntity" class="si-button" type="button">Edit</button>
               <button id="deleteEntity" class="si-button" type="button" style="border-color:rgba(255,75,75,.5);color:#ff5c5c">Delete</button>
             </div>`
          : ''
        }
      </div>

      <div class="si-panel" style="box-shadow:none;margin-top:12px">
        <div class="si-panel-head"><span>LIVE ACTIVITY</span></div>
        <div class="si-detail-activity">${
          incidents.slice(0,14).map(eventHtml).join('')||
          '<div class="guest-note">No activity yet.</div>'
        }</div>
      </div>

      <div class="si-panel si-detail-tokens-panel" style="box-shadow:none;margin-top:12px">
        <div class="si-panel-head">
          <span>TOKENS</span>
          <span>${tokens.length}</span>
        </div>
        ${entityTokenRows(tokens)}
      </div>
    </aside>

    <section class="si-detail-map">
      <div id="detailGraph" class="si-graph"></div>
    </section>
  </div>`);

  state.detailGraph=new ShadowGraph($('#detailGraph'),model,{onSelect:openObject});

  $$('[data-entity-token]').forEach(row=>{
    row.onclick=(event)=>{
      if(event.target.closest('[data-pump-token-link]'))return;
      const token=tokens[Number(row.dataset.entityToken)];
      if(token)openObject('token',token);
    };
  });

  const b=$('#syncEntity');
  if(b)b.onclick=async()=>{
    b.disabled=true;
    try{
      const r=await api(`/api/entities/${e.id}/sync`,{method:'POST',body:'{}'});
      toast(`Sync complete · ${r.wallets?.reduce((n,x)=>n+(x.newActivity||0),0)||0} new activity`);
      const nd=await api(`/api/entities/${e.id}`);
      state.details.set(e.id,nd);
      entityDetail(nd);
    }catch(x){
      toast(x.message);
    }finally{
      b.disabled=false;
    }
  };

  const edit=$('#editEntity');
  if(edit)edit.onclick=()=>entityEditModal({
    entity:e,
    wallets,
    tokens,
    incidents,
    evidence:Array.isArray(d?.evidence)?d.evidence:[]
  });

  const del=$('#deleteEntity');
  if(del)del.onclick=()=>entityDeleteModal(e);
}
/* SHADOW_ENTITY_TOKENS_V210_END */

function walletDetail(w,items){const model={entities:state.entities.filter(e=>e.id===w.entity_id),wallets:[w],tokens:state.tokens.filter(t=>items.some(a=>a.mint===t.mint)).map(t=>({...t,entity_id:w.entity_id})),activity:items};modal(`<div class="si-detail-layout"><aside class="si-detail-side"><div class="si-panel" style="box-shadow:none">${avatar(w,'xl')}<h2>Wallet</h2><p>${short(w.address)}</p><div class="si-metrics"><div class="si-metric"><strong>${esc(w.sync_status||'pending')}</strong><small>Status</small></div><div class="si-metric"><strong>${items.length}</strong><small>Events</small></div><div class="si-metric"><strong>${esc(w.chain||'solana')}</strong><small>Chain</small></div></div></div><div class="si-panel" style="box-shadow:none;margin-top:12px"><div class="si-panel-head"><span>ACTIVITY</span></div>${items.slice(0,18).map(a=>eventHtml({type:a.type,title:(a.type||'activity').toUpperCase(),detail:a.mint?short(a.mint):'',createdAt:a.block_time})).join('')||'<div class="guest-note">No activity.</div>'}</div></aside><section class="si-detail-map"><div id="detailGraph" class="si-graph"></div></section></div>`);state.detailGraph=new ShadowGraph($('#detailGraph'),model,{onSelect:openObject})}
function tokenDetail(t){const related=state.overview?.feed?.filter(x=>x.symbol===t.symbol||x.tokenName===t.name)||[];modal(`<div class="si-detail-layout"><aside class="si-detail-side"><div class="si-panel" style="box-shadow:none">${avatar(t,'xl')}<h2>${esc(t.symbol||'Token')}</h2><p>${esc(t.name||'Unknown')}</p><p>${tokenAddressCopyHtml(t.mint)}</p><div class="si-metrics"><div class="si-metric"><strong>${money(t.market_cap||0)}</strong><small>Market cap</small></div><div class="si-metric"><strong class="${Number(t.price_change)>=0?'pos':'neg'}">${Number(t.price_change)>=0?'+':''}${Number(t.price_change||0).toFixed(1)}%</strong><small>Change</small></div><div class="si-metric"><strong>${money(t.liquidity_usd||0)}</strong><small>Liquidity</small></div></div></div><div class="si-panel" style="box-shadow:none;margin-top:12px"><div class="si-panel-head"><span>RECENT SIGNALS</span></div>${related.slice(0,12).map(eventHtml).join('')||'<div class="guest-note">No recent incident records.</div>'}</div></aside><section class="si-detail-map"><div id="detailGraph" class="si-graph"></div></section></div>`);const entities=state.entities.filter(e=>related.some(x=>x.entityId===e.id));state.detailGraph=new ShadowGraph($('#detailGraph'),{entities:entities.length?entities:[state.overview?.selected].filter(Boolean),wallets:[],tokens:[t]},{onSelect:openObject});bindTokenAddressCopy($('#modalBody')||document)}
function entityModal(){modal(`<h2>Add entity</h2><form id="entityForm" class="si-modal-form"><label>Name<input name="name" required placeholder="Entity name"></label><label>X handle<input name="xHandle" placeholder="@handle"></label><label>Avatar URL<input name="avatar" placeholder="Optional — auto from Pump.fun wallet"></label><label>Initial wallet<input name="wallet" placeholder="Solana address"></label><label>Notes<textarea name="notes" rows="4"></textarea></label><button class="si-button primary">Create entity</button></form>`);$('#entityForm').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));try{const x=await api('/api/entities',{method:'POST',body:JSON.stringify(b)});if(b.wallet)await api(`/api/entities/${x.id}/wallets`,{method:'POST',body:JSON.stringify({address:b.wallet,label:'Main wallet'})});closeModal();toast('Entity created');await refresh();nav('entities')}catch(x){toast(x.message)}}}
/* SHADOW_ADMIN_ENTITY_UI_V213_START */
async function reloadEntityDetail(id){
  const nd=await api(`/api/entities/${id}`);
  state.details.set(id,nd);
  const idx=state.entities.findIndex(x=>x.id===id);
  if(idx>=0)state.entities[idx]={...state.entities[idx],...(nd.entity||{})};
  entityDetail(nd);
  return nd;
}

function entityEditModal(d){
  if(!['owner','admin'].includes(state.user?.role)){
    toast('Owner access required');
    return;
  }

  const e=d?.entity||d||{};
  const status=String(e.status||'watch');

  modal(`<div class="si-admin-editor">
    <h2>Edit entity</h2>
    <p class="guest-note" style="margin-top:-4px">Admin only · ${esc(e.xHandle||e.x_handle||e.name||e.id||'entity')}</p>

    <form id="entityEditForm" class="si-modal-form" novalidate>
      <label>Name
        <input name="name" required maxlength="80" value="${esc(e.name||'')}">
      </label>

      <label>X handle
        <input name="xHandle" maxlength="50" placeholder="@handle" value="${esc(e.xHandle||e.x_handle||'')}">
      </label>

      <label>Avatar URL
        <input name="avatar" maxlength="1400000" placeholder="https://…" value="${esc(e.avatar||'')}">
      </label>

      <label>Confidence
        <input name="confidence" type="number" min="0" max="100" step="1" value="${esc(e.confidence??50)}">
      </label>

      <label>Signal
        <input name="riskScore" type="number" min="0" max="100" step="1" value="${esc(e.riskScore??e.risk_score??0)}">
      </label>

      <label>Status
        <select name="status">
          ${['watch','monitoring','high','blocked','inactive'].map(v=>`<option value="${v}" ${status===v?'selected':''}>${v}</option>`).join('')}
        </select>
      </label>

      <label>Notes
        <textarea name="notes" rows="5" maxlength="500">${esc(e.notes||'')}</textarea>
      </label>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button id="entityEditCancel" class="si-button" type="button">Cancel</button>
        <button id="entitySaveChanges" class="si-button primary" type="button">Save changes</button>
      </div>
    </form>
  </div>`);

  const cancel=$('#entityEditCancel');
  if(cancel)cancel.onclick=()=>reloadEntityDetail(e.id).catch(x=>toast(x.message));

  const form=$('#entityEditForm');
  const save=$('#entitySaveChanges');

  if(save&&form)save.onclick=async()=>{
    const name=String(form.elements.name?.value||'').trim();
    if(!name){
      form.elements.name?.focus();
      toast('Name is required');
      return;
    }

    const confidence=Number(form.elements.confidence?.value);
    const riskScore=Number(form.elements.riskScore?.value);

    if(!Number.isFinite(confidence)||confidence<0||confidence>100){
      toast('Confidence must be 0–100');
      return;
    }
    if(!Number.isFinite(riskScore)||riskScore<0||riskScore>100){
      toast('Signal must be 0–100');
      return;
    }

    const originalText=save.textContent;
    save.disabled=true;
    save.textContent='Saving…';

    try{
      const body=Object.fromEntries(new FormData(form));
      body.confidence=confidence;
      body.riskScore=riskScore;

      const result=await api(`/api/entities/${e.id}/update`,{
        method:'POST',
        body:JSON.stringify(body)
      });

      if(!result?.ok||result?.mutation!=='update'){
        throw new Error('Server did not confirm the update');
      }

      state.details.delete(e.id);
      await refresh();
      await reloadEntityDetail(e.id);
      toast('Changes saved');
    }catch(x){
      console.error('Entity save failed:',x);
      toast(`Save failed: ${x.message}`);
      save.disabled=false;
      save.textContent=originalText;
    }
  };
}

function entityDeleteModal(e){
  if(!['owner','admin'].includes(state.user?.role)){
    toast('Owner access required');
    return;
  }

  const label=String(e.xHandle||e.x_handle||e.name||e.id||'').trim();
  const display=label||String(e.id||'entity');

  modal(`<div class="si-admin-editor">
    <h2>Delete entity</h2>
    <p>This permanently removes <strong>${esc(display)}</strong> from Shadow Intelligence.</p>
    <p class="guest-note">Linked wallets, wallet activity, incidents, social records and entity evidence will also be deleted. Orphan token records are cleaned up automatically.</p>

    <form id="entityDeleteForm" class="si-modal-form" novalidate>
      <label>Type <strong>${esc(display)}</strong> to confirm
        <input name="confirm" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(display)}">
      </label>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button id="entityDeleteCancel" class="si-button" type="button">Cancel</button>
        <button id="entityDeletePermanent" class="si-button" type="button" style="border-color:rgba(255,75,75,.55);color:#ff5c5c">Delete permanently</button>
      </div>
    </form>
  </div>`);

  const cancel=$('#entityDeleteCancel');
  if(cancel)cancel.onclick=()=>reloadEntityDetail(e.id).catch(x=>toast(x.message));

  const form=$('#entityDeleteForm');
  const del=$('#entityDeletePermanent');

  if(del&&form)del.onclick=async()=>{
    const typed=String(form.elements.confirm?.value||'').trim();
    if(typed!==display){
      form.elements.confirm?.focus();
      toast(`Type ${display} exactly`);
      return;
    }

    const originalText=del.textContent;
    del.disabled=true;
    del.textContent='Deleting…';

    try{
      const result=await api(`/api/entities/${e.id}/delete`,{
        method:'POST',
        body:'{}'
      });

      if(!result?.ok||result?.mutation!=='delete'||result?.deletedId!==e.id){
        throw new Error('Server did not confirm the deletion');
      }

      state.details.delete(e.id);
      state.entities=state.entities.filter(x=>x.id!==e.id);

      if(state.overview?.selected?.id===e.id){
        state.overview={...state.overview,selected:null};
      }

      graphEntityKey='';
      closeModal();
      await refresh();
      nav('entities');
      toast('Entity deleted permanently');
    }catch(x){
      console.error('Entity delete failed:',x);
      toast(`Delete failed: ${x.message}`);
      del.disabled=false;
      del.textContent=originalText;
    }
  };
}
/* SHADOW_ADMIN_ENTITY_UI_V213_END */

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
