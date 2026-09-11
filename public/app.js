const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const esc = (v='') => String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const money = n => { n=Number(n||0); if(Math.abs(n)>=1e6)return '$'+(n/1e6).toFixed(1)+'M'; if(Math.abs(n)>=1e3)return '$'+(n/1e3).toFixed(0)+'K'; return '$'+n.toFixed(0); };
const ago = iso => { const m=Math.max(0,Math.round((Date.now()-new Date(iso))/60000)); if(m<1)return 'now'; if(m<60)return `${m}m`; if(m<1440)return `${Math.floor(m/60)}h`; return `${Math.floor(m/1440)}d`; };
const state = { user:null, overview:null, liveStatus:null, entities:[], tokens:[], evidence:[], chat:[], activeDm:null, avatarData:'' };
const hashText = (value='') => [...String(value)].reduce((h,c)=>((h<<5)-h+c.charCodeAt(0))|0,2166136261);
function fallbackAvatar(value='shadow'){
  const h=Math.abs(hashText(value));
  const hue=h%360, hue2=(hue+48+(h%70))%360;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hue} 76% 58%)"/><stop offset="1" stop-color="hsl(${hue2} 72% 34%)"/></linearGradient><radialGradient id="r" cx="34%" cy="24%" r="78%"><stop stop-color="#fff" stop-opacity=".36"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="96" height="96" rx="48" fill="url(#g)"/><path d="M17 64c10-24 23-37 39-39 11-1 20 3 26 10-11 1-20 7-26 16-8 11-19 17-39 13Z" fill="#070b14" fill-opacity=".72"/><circle cx="48" cy="48" r="42" fill="url(#r)"/><circle cx="48" cy="48" r="45" fill="none" stroke="#fff" stroke-opacity=".28"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

async function api(url, options={}){
  const r=await fetch(url,{...options,headers:{'content-type':'application/json',...(options.headers||{})}});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error||`HTTP ${r.status}`);
  return data;
}
function toast(msg){ const el=$('#toast'); el.textContent=msg; el.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove('show'),2600); }
function avatarHtml(item,size='md'){
  const key=item?.displayName||item?.entityName||item?.name||item?.xHandle||item?.address||item?.symbol||'shadow';
  const src=item?.avatar||item?.image||fallbackAvatar(key);
  return `<span class="avatar avatar-${size}" style="background-image:url('${esc(src)}')"></span>`;
}
function riskClass(status='',score=0){ if(status==='high'||status==='critical'||score>=80)return'high'; if(status==='medium'||score>=60)return'medium'; if(status==='watch'||score>=40)return'watch'; return'monitoring'; }
function riskLabel(status='',score=0){const c=riskClass(status,score);return c==='high'?'High Risk':c==='medium'?'Medium':c==='watch'?'Watch':'Monitoring';}
function riskDisplay(score=0){return Number(score)>0?`${Number(score)} Risk`:'Unrated';}
function setAuthUI(){
  document.body.classList.toggle('is-auth',!!state.user); const owner=state.user&&['owner','admin'].includes(state.user.role); document.body.classList.toggle('is-owner',!!owner);
  $('#userLabel').textContent=state.user?state.user.displayName:'Sign in'; const a=$('#userAvatar');
  const key=state.user?.displayName||state.user?.email||'guest'; a.textContent=''; a.style.backgroundImage=`url("${state.user?.avatar||fallbackAvatar(key)}")`;
}
function applyPlatformName(name){ $$('[data-platform-name]').forEach(el=>el.textContent=name||'Shadow Intelligence'); document.title=name||'Shadow Intelligence'; }
async function boot(){
  try{ const me=await api('/api/me'); state.user=me.user; applyPlatformName(me.settings.platformName); }catch{}
  setAuthUI(); bind(); await refreshOverview(); navigate('overview');
  setInterval(()=>{ if($('.active-page')?.id==='page-community') loadChat(); },5000);
  setInterval(()=>{ const id=$('.active-page')?.id; if(id==='page-overview'||id==='page-feed') refreshOverview(); },15000);
}
function bind(){
  $$('[data-nav]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.nav)));
  $('#themeToggle').addEventListener('click',toggleTheme); $('#userButton').addEventListener('click',()=>state.user?navigate('profile'):authModal('login'));
  $('#modalClose').addEventListener('click',closeModal); $('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});
  $('#addEntityBtn').addEventListener('click',entityModal); $('#entitiesAddBtn').addEventListener('click',entityModal);
  $('#evidenceAddBtn').addEventListener('click',evidenceModal); $('#uploadEvidenceQuick').addEventListener('click',evidenceModal); $('#copyAddBtn').addEventListener('click',copyModal);
  $('#chatForm').addEventListener('submit',sendChat); $('#dmForm').addEventListener('submit',sendDm); $('#userSearch').addEventListener('input',debounce(searchUsers,250));
  $('#profileForm').addEventListener('submit',saveProfile); $('#profileAvatarFile').addEventListener('change',handleProfileAvatar); $('#settingsForm').addEventListener('submit',saveSettings);
  $('#globalSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){navigate('entities'); renderEntities(e.target.value)}});
}
function toggleTheme(){ const dark=document.documentElement.dataset.theme==='dark'; if(dark)delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme='dark'; localStorage.setItem('si-theme',dark?'light':'dark'); }
function navigate(name){
  const target=$(`#page-${name}`); if(!target)return;
  if(['messages','profile'].includes(name)&&!state.user){authModal('login');return}
  if(name==='settings'&&!['owner','admin'].includes(state.user?.role||'')){toast('Owner access required');return}
  $$('.page').forEach(p=>p.classList.remove('active-page')); target.classList.add('active-page'); $$('.nav-item,.mobile-nav-item').forEach(n=>n.classList.toggle('active',n.dataset.nav===name));
  if(name==='feed')renderFullFeed(); if(name==='entities')loadEntities(); if(name==='wallets')loadWallets(); if(name==='tokens')loadTokens(); if(name==='evidence')loadEvidence(); if(name==='copy')loadCopyGroups(); if(name==='community')loadChat(); if(name==='messages')loadConversations(); if(name==='profile')fillProfile(); if(name==='settings')loadSettings();
  window.scrollTo({top:0,behavior:'instant'});
}
async function refreshOverview(){
  try{
    const [overview,liveStatus]=await Promise.all([api('/api/overview'),api('/api/live/status').catch(()=>null)]);
    state.overview=overview; state.liveStatus=liveStatus;
    renderStats(); renderFeed($('#overviewFeed'),state.overview.feed.slice(0,8)); renderLeaderboard(); renderSnapshot(); renderNetwork(); renderEvidencePreview(); renderCopyPreview(); await loadChatPreview();
    if($('.active-page')?.id==='page-feed')renderFullFeed();
  } catch(e){toast(e.message)}
}

function renderStats(){
  const x=state.overview.stats, live=state.liveStatus;
  const online=live?.solana?.status==='online';
  const rows=[
    ['Tracked Entities',x.trackedEntities,'real profiles','◎'],
    ['Live Monitor',online?'ONLINE':'CHECK',live?.solana?.provider||'Solana','●'],
    ['Observed Losses',money(x.estimatedFollowerLosses),x.estimatedFollowerLosses?'evidence-based':'not estimated','↘'],
    ['Linked Wallets',x.linkedWallets,'auto-monitor','▣']
  ];
  $('#statsGrid').innerHTML=rows.map((r,i)=>`<article class="stat-card"><div><span class="label">${r[0]}</span><strong>${r[1]}</strong><span class="trend ${i===2&&x.estimatedFollowerLosses?'bad':''}">${r[2]}</span></div><span class="stat-icon">${r[3]}</span></article>`).join('');
}

function renderFeed(root,items){ root.innerHTML=items.length?items.map(x=>{const rc=riskClass(x.severity,x.riskScore);const val=Number(x.value||x.priceChange||0);return `<div class="feed-row"><span class="timeline-dot ${rc}"></span>${avatarHtml(x,'md')}<div class="identity"><strong>${esc(x.entityName||'Unknown')}<span class="risk-tag ${rc}">${riskLabel(x.severity,x.riskScore)}</span></strong><small>${esc(x.xHandle||'')} · ${ago(x.createdAt)}</small></div><div class="event-copy"><strong>${esc(x.title)}</strong><small>${esc(x.detail||x.walletAddress||'')}</small></div><div class="value ${val<0?'neg':'pos'}">${esc(x.symbol||'')}<br>${val?`${val>0?'+':''}${val}%`:''}</div></div>`}).join(''):`<div class="guest-note">No incidents yet.</div>`; }
function renderFullFeed(){ renderFeed($('#fullFeed'),state.overview?.feed||[]); }
function renderLeaderboard(){ const rows=state.overview.leaderboard; $('#leaderboard').innerHTML=`<div class="leader-head"><span>#</span><span>Entity</span><span>Risk</span><span>Cases</span><span>Losses</span></div>`+rows.map((e,i)=>`<div class="leader-row" data-entity="${e.id}"><span class="leader-num">${i+1}</span><div class="leader-identity">${avatarHtml(e,'sm')}<div><strong>${esc(e.name)}</strong><small>${esc(e.xHandle)}</small></div></div><span class="score-pill">${e.riskScore}</span><span class="leader-num">${e.incidents}</span><strong class="leader-num">${money(e.followerLosses)}</strong></div>`).join(''); $$('[data-entity]',$('#leaderboard')).forEach(el=>el.addEventListener('click',()=>entityDetailModal(el.dataset.entity))); }
function renderSnapshot(){ const e=state.overview.selected;if(!e){$('#entitySnapshot').innerHTML='';return} const recent=state.overview.feed.filter(x=>x.entityId===e.id).slice(0,4); $('#entitySnapshot').innerHTML=`<div class="entity-snapshot"><div class="entity-top">${avatarHtml(e,'lg')}<div class="entity-top-text"><h3>${esc(e.name)} <span class="risk-tag ${riskClass(e.status,e.riskScore)}">${riskDisplay(e.riskScore)}</span></h3><p>${esc(e.xHandle)} · ${esc(e.notes||'Observed intelligence profile')}</p></div></div><div class="chips"><span class="chip">◉ ${esc(e.avatar_source||'avatar fallback')}</span><span class="chip good">● ${e.confidence}% confidence</span></div><div class="mini-metrics"><div class="mini-metric"><strong>${e.walletCount}</strong><small>Linked wallets</small></div><div class="mini-metric"><strong>${e.incidents}</strong><small>Incidents</small></div><div class="mini-metric"><strong>${money(e.followerLosses)}</strong><small>Follower losses</small></div></div><div class="entity-activity">${recent.map(x=>`<div><span>${ago(x.createdAt)} · ${esc(x.title)}</span><b class="${Number(x.value)<0?'value neg':'value pos'}">${x.symbol||''} ${Number(x.value||0)>0?'+':''}${x.value||''}${x.value?'%':''}</b></div>`).join('')}</div></div>`; }
function network3dPnlMoney(value){
  const n=Number(value||0),a=Math.abs(n),sign=n>0?'+':n<0?'-':'';
  let body;
  if(a>=1000000)body=`$${(a/1000000).toFixed(2)}M`;
  else if(a>=1000)body=`$${(a/1000).toFixed(a>=100000?0:1)}K`;
  else body=`$${a.toFixed(a<10?2:0)}`;
  return sign+body;
}

function network3dImage(item){
  return item?.avatar||item?.image||fallbackAvatar(item?.displayName||item?.entityName||item?.name||item?.xHandle||item?.address||item?.symbol||'shadow');
}

function createNetwork3D(root, entity, wallets, tokens){
  if(root._network3dController) root._network3dController.destroy();
  const canvas=root.querySelector('.network3d-canvas');
  const ctx=canvas?.getContext('2d');
  if(!canvas||!ctx)return;

  const dpr=Math.min(window.devicePixelRatio||1,2);
  const images=new Map(),pointers=new Map();
  let width=1,height=1,raf=0,destroyed=false;
  let zoom=1,targetZoom=1,panX=0,panY=0,targetPanX=0,targetPanY=0,lastPinch=0,lastTap=0;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const walletList=(wallets||[]).slice(0,10);
  const tokenList=(tokens||[]).slice(0,12);

  function sectorNodes(list,kind){
    const perRing=5,side=kind==='wallet'?-1:1;
    return list.map((raw,i)=>{
      const ring=Math.floor(i/perRing),slot=i%perRing,total=Math.min(perRing,list.length-ring*perRing);
      const t=total<=1?.5:slot/(total-1);
      const angle=(kind==='wallet'?(2.08+t*2.10):(-1.04+t*2.08));
      const radius=.98+ring*.54;
      return {
        kind,raw,
        label:kind==='wallet'?(raw.label||`${String(raw.address||'Wallet').slice(0,5)}…${String(raw.address||'').slice(-5)}`):(raw.symbol||raw.name||'Token'),
        sub:kind==='wallet'?(raw.sync_status||'wallet'):(raw.is_pump?'Pump.fun / PumpSwap':(raw.dex_id||'token')),
        pnlKnown:kind==='token'&&!!raw.pnlKnown,pnlPercent:Number(raw.pnlPercent||0),pnlUsd:Number(raw.pnlUsd||0),
        x:Math.cos(angle)*radius,y:Math.sin(angle)*radius*.82,z:0,
        color:kind==='wallet'?'#657786':'#00ba7c',image:network3dImage(raw),ring
      };
    });
  }
  const walletNodes=sectorNodes(walletList,'wallet');
  const tokenNodes=sectorNodes(tokenList,'token');
  const entityNode={kind:'entity',raw:entity,label:entity.xHandle||entity.name||'Entity',sub:'tracked entity',x:0,y:0,z:0,color:'#7b61ff',image:network3dImage(entity),ring:0};
  const nodes=[...walletNodes,entityNode,...tokenNodes];
  const maxRadius=Math.max(1.05,...nodes.map(n=>Math.hypot(n.x,n.y)));
  const backgroundDots=Array.from({length:34},(_,i)=>({
    x:((Math.sin(i*12.9898)*43758.5453)%1+1)%1,
    y:((Math.sin((i+17)*78.233)*19642.349)%1+1)%1,
    r:1.5+(((i*17)%7)/7)*4,
    a:.035+((i%5)*.012)
  }));

  for(const n of nodes){
    const img=new Image();img.decoding='async';img.onload=()=>schedule();img.onerror=()=>{};img.src=n.image;images.set(n,img);
  }

  function baseScale(){
    const horizontal=(width-112)/(maxRadius*2.08);
    const vertical=(height-132)/(maxRadius*1.80);
    return Math.max(52,Math.min(horizontal,vertical));
  }
  function project(n){
    const scale=baseScale()*zoom;
    return {x:width/2+n.x*scale+panX,y:height/2+7+n.y*scale+panY,scale};
  }
  function roundedRect(x,y,w,h,r){
    const rr=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);ctx.arcTo(x,y,x+w,y,rr);ctx.closePath();
  }
  function drawBackground(){
    const dark=document.documentElement.dataset.theme==='dark';
    ctx.save();
    for(const d of backgroundDots){
      const x=d.x*width,y=d.y*height;
      ctx.fillStyle=dark?`rgba(29,155,240,${d.a})`:`rgba(29,155,240,${d.a*.7})`;
      ctx.beginPath();ctx.arc(x,y,d.r*zoom*.72,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
  function drawLine(n){
    const a=project(entityNode),b=project(n),token=n.kind==='token';
    const grad=ctx.createLinearGradient(a.x,a.y,b.x,b.y);
    grad.addColorStop(0,'rgba(123,97,255,.58)');
    grad.addColorStop(1,token?'rgba(0,186,124,.55)':'rgba(101,119,134,.48)');
    ctx.strokeStyle=grad;ctx.lineWidth=clamp(1.15*zoom,.85,1.8);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    const mx=a.x+(b.x-a.x)*.58,my=a.y+(b.y-a.y)*.58;
    ctx.fillStyle=token?'rgba(0,186,124,.82)':'rgba(101,119,134,.72)';ctx.beginPath();ctx.arc(mx,my,clamp(2.1*zoom,1.4,3.4),0,Math.PI*2);ctx.fill();
  }
  function drawNode(n){
    const p=project(n),dark=document.documentElement.dataset.theme==='dark';
    const base=n.kind==='entity'?43:n.kind==='wallet'?26:27;
    const r=clamp(base*zoom,n.kind==='entity'?31:18,n.kind==='entity'?58:38),x=p.x,y=p.y;
    ctx.save();
    const glowColor=n.kind==='entity'?'123,97,255':n.kind==='token'?'0,186,124':'101,119,134';
    const glow=ctx.createRadialGradient(x,y,r*.55,x,y,r*1.72);glow.addColorStop(0,`rgba(${glowColor},.18)`);glow.addColorStop(1,`rgba(${glowColor},0)`);ctx.fillStyle=glow;ctx.beginPath();ctx.arc(x,y,r*1.7,0,Math.PI*2);ctx.fill();
    const sphere=ctx.createRadialGradient(x-r*.34,y-r*.38,r*.08,x,y,r*1.08);sphere.addColorStop(0,'rgba(255,255,255,.92)');sphere.addColorStop(.18,n.color);sphere.addColorStop(.72,dark?'#111820':'#d9e3ea');sphere.addColorStop(1,'#030507');ctx.fillStyle=sphere;ctx.beginPath();ctx.arc(x,y,r+4,0,Math.PI*2);ctx.fill();
    ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.clip();const img=images.get(n);if(img?.complete&&img.naturalWidth)ctx.drawImage(img,x-r,y-r,r*2,r*2);else{ctx.fillStyle=n.color;ctx.fillRect(x-r,y-r,r*2,r*2)}const gloss=ctx.createLinearGradient(x-r,y-r,x+r,y+r);gloss.addColorStop(0,'rgba(255,255,255,.22)');gloss.addColorStop(.48,'rgba(255,255,255,0)');gloss.addColorStop(1,'rgba(0,0,0,.24)');ctx.fillStyle=gloss;ctx.fillRect(x-r,y-r,r*2,r*2);ctx.restore();
    ctx.lineWidth=n.kind==='entity'?2.4:1.5;ctx.strokeStyle=n.kind==='entity'?'rgba(123,97,255,.98)':n.kind==='token'?'rgba(0,186,124,.95)':'rgba(101,119,134,.95)';ctx.beginPath();ctx.arc(x,y,r+4,0,Math.PI*2);ctx.stroke();
    const labelX=clamp(x,58,width-58),labelY=y+r+15,maxW=Math.min(116,width*.29),fontScale=clamp(.92+((zoom-1)*.28),.82,1.16);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`${n.kind==='entity'?750:680} ${(n.kind==='entity'?14:11)*fontScale}px Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;let shown=String(n.label||'');while(shown.length>5&&ctx.measureText(shown).width>maxW)shown=shown.slice(0,-2)+'…';ctx.fillStyle=dark?'#e7e9ea':'#0f1419';ctx.fillText(shown,labelX,labelY);
    if(n.kind==='token'){
      if(n.pnlKnown){
        const positive=n.pnlUsd>=0,pnlColor=positive?'#00ba7c':'#f91880',pct=`${n.pnlPercent>0?'+':''}${n.pnlPercent.toFixed(2)}%`;
        ctx.font=`700 ${10*fontScale}px Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;ctx.fillStyle=pnlColor;ctx.fillText(pct,labelX,labelY+14*fontScale);
        ctx.font=`650 ${9*fontScale}px Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;ctx.fillText(network3dPnlMoney(n.pnlUsd),labelX,labelY+27*fontScale);
      }else{ctx.font=`600 ${9*fontScale}px Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;ctx.fillStyle=dark?'#71767b':'#536471';ctx.fillText('P&L —',labelX,labelY+16*fontScale)}
    }else{ctx.font=`500 ${9*fontScale}px Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;ctx.fillStyle=dark?'#71767b':'#536471';ctx.fillText(String(n.sub||''),labelX,labelY+14*fontScale)}
    ctx.restore();
  }
  function lane(text,x,color,count){
    const dark=document.documentElement.dataset.theme==='dark',w=122,h=32,y=27;ctx.save();roundedRect(x-w/2,y-h/2,w,h,16);ctx.fillStyle=dark?'rgba(22,24,28,.90)':'rgba(247,249,249,.96)';ctx.fill();ctx.strokeStyle=dark?'#2f3336':'#cfd9de';ctx.lineWidth=1;ctx.stroke();ctx.fillStyle=color;ctx.beginPath();ctx.arc(x-w/2+16,y,4,0,Math.PI*2);ctx.fill();ctx.font='700 11px Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';ctx.textBaseline='middle';ctx.textAlign='left';ctx.fillStyle=dark?'#e7e9ea':'#0f1419';ctx.fillText(text,x-w/2+28,y);ctx.textAlign='right';ctx.fillStyle=dark?'#71767b':'#536471';ctx.font='600 10px Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';ctx.fillText(String(count),x+w/2-12,y);ctx.restore();
  }
  function render(){
    raf=0;if(destroyed)return;
    zoom+=(targetZoom-zoom)*.18;panX+=(targetPanX-panX)*.20;panY+=(targetPanY-panY)*.20;
    ctx.clearRect(0,0,width,height);drawBackground();
    for(const w of walletNodes)drawLine(w);for(const t of tokenNodes)drawLine(t);
    [...walletNodes,...tokenNodes,entityNode].forEach(drawNode);
    lane('WALLETS',Math.max(70,width*.19),'#657786',wallets?.length||0);lane('TOKENS',Math.min(width-70,width*.81),'#00ba7c',tokens?.length||0);
    if(Math.abs(targetZoom-zoom)>.001||Math.abs(targetPanX-panX)>.08||Math.abs(targetPanY-panY)>.08)schedule();
  }
  function schedule(){if(!raf&&!destroyed)raf=requestAnimationFrame(render)}
  function resize(){const r=canvas.getBoundingClientRect();width=Math.max(1,Math.round(r.width));height=Math.max(1,Math.round(r.height));canvas.width=Math.max(1,Math.round(width*dpr));canvas.height=Math.max(1,Math.round(height*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);targetPanX=panX=0;targetPanY=panY=0;targetZoom=zoom=1;schedule()}
  const ro=new ResizeObserver(resize);ro.observe(canvas);resize();
  function pinchDistance(){const a=[...pointers.values()];if(a.length<2)return 0;return Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)}
  function down(ev){pointers.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});canvas.setPointerCapture?.(ev.pointerId);if(pointers.size===2)lastPinch=pinchDistance();canvas.classList.add('is-dragging')}
  function move(ev){const old=pointers.get(ev.pointerId);if(!old)return;pointers.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});if(pointers.size>=2){const d=pinchDistance();if(lastPinch>0)targetZoom=clamp(targetZoom*(d/lastPinch),.72,2.15);lastPinch=d;schedule();return}const dx=ev.clientX-old.x,dy=ev.clientY-old.y;const maxX=width*.58*Math.max(0,targetZoom-.78),maxY=height*.52*Math.max(0,targetZoom-.78);targetPanX=clamp(targetPanX+dx,-maxX,maxX);targetPanY=clamp(targetPanY+dy,-maxY,maxY);schedule()}
  function up(ev){pointers.delete(ev.pointerId);if(pointers.size<2)lastPinch=0;if(!pointers.size)canvas.classList.remove('is-dragging');canvas.releasePointerCapture?.(ev.pointerId)}
  function wheel(ev){ev.preventDefault();targetZoom=clamp(targetZoom*(ev.deltaY>0?.92:1.08),.72,2.15);schedule()}
  function reset(){targetZoom=1;targetPanX=0;targetPanY=0;schedule()}
  function tap(){const now=Date.now();if(now-lastTap<320)reset();lastTap=now}
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('wheel',wheel,{passive:false});canvas.addEventListener('click',tap);
  root._network3dController={destroy(){destroyed=true;cancelAnimationFrame(raf);ro.disconnect();canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('wheel',wheel);canvas.removeEventListener('click',tap);pointers.clear()}};
}

function renderNetwork(){
  const root=$('#walletNetwork'),panel=root?.closest('.network-panel'),caption=panel?.querySelector('.panel-head>span');if(caption)caption.textContent='Wallets · Entity · Tokens';const e=state.overview.selected;
  if(!e){if(root?._network3dController)root._network3dController.destroy();root.innerHTML='<div class="guest-note">Add a tracked entity and wallet to build the network.</div>';return}
  const wallets=state.overview.selectedWallets||[],tokens=state.overview.selectedTokens||[];
  root.innerHTML=`<div class="network3d-v12-shell"><canvas class="network3d-canvas" aria-label="Flat wallet and token network"></canvas><div class="network3d-v12-help">Drag to pan · pinch to zoom · flat view</div></div><div class="network3d-v12-legend"><span><i class="entity"></i>Entity</span><span><i class="wallet"></i>Wallets</span><span><i class="token"></i>Tokens</span></div>`;
  createNetwork3D(root,e,wallets,tokens);
}

function renderEvidencePreview(){ const f=state.overview.feed.slice(0,3); const kinds=['social','wallet','token']; const labels=['X / social signal','Wallet transaction','Token event']; $('#evidencePreview').innerHTML=f.map((x,i)=>`<article class="evidence-thumb evidence-${kinds[i]}"><div class="evidence-visual"><div class="evidence-mini-head">${avatarHtml(x,'xs')}<span>${esc(x.xHandle||x.entityName)}</span><i>${i===0?'X':i===1?'↗':'●'}</i></div><strong>${esc(x.title)}</strong><p>${esc(x.detail||x.walletAddress||'Observed signal')}</p><div class="evidence-mini-foot"><span>${esc(x.symbol||'Signal')}</span><b class="${Number(x.value)<0?'neg':'pos'}">${Number(x.value||0)>0?'+':''}${x.value||''}${x.value?'%':''}</b></div></div><div class="evidence-caption"><strong>${labels[i]}</strong><span>${ago(x.createdAt)} ago</span></div></article>`).join(''); }
function renderCopyPreview(){ $('#copyPreview').innerHTML=state.overview.groups.map(g=>`<div class="copy-row"><span class="status-dot" style="opacity:${g.enabled?1:.25}"></span><strong>${esc(g.name)}</strong><span class="muted">${g.walletCount} wallets · ${esc(g.mode)}</span></div>`).join(''); }
async function loadChatPreview(){ try{const d=await api('/api/chat/messages');state.chat=d.items;const last=d.items.slice(-3);$('#chatPreview').innerHTML=last.length?last.map(m=>`<div class="chat-mini">${avatarHtml(m,'xs')}<div><strong>${esc(m.displayName)}</strong><p>${esc(m.body)}</p></div><time>${ago(m.createdAt)}</time></div>`).join(''):`<div class="chat-empty"><div class="chat-empty-icon">◌</div><div><strong>Community is ready</strong><p>Be the first to share a signal or discuss an incident.</p></div></div>`}catch{$('#chatPreview').innerHTML='<div class="chat-empty"><div><strong>Community unavailable</strong><p>Chat is currently disabled by the owner.</p></div></div>'} }
async function loadEntities(){ try{state.entities=(await api('/api/entities')).items;renderEntities($('#globalSearch').value)}catch(e){toast(e.message)} }
function renderEntities(query=''){ const q=query.toLowerCase().trim();const items=state.entities.filter(e=>!q||[e.name,e.xHandle,e.notes].join(' ').toLowerCase().includes(q)); $('#entitiesGrid').innerHTML=items.map(e=>`<article class="panel entity-card" data-open-entity="${e.id}"><div class="entity-card-top">${avatarHtml(e,'lg')}<div><h3>${esc(e.name)} <span class="risk-tag ${riskClass(e.status,e.riskScore)}">${e.riskScore}</span></h3><p>${esc(e.xHandle)} · ${e.confidence}% confidence</p></div></div><div class="entity-card-metrics"><div class="mini-metric"><strong>${e.walletCount}</strong><small>Wallets</small></div><div class="mini-metric"><strong>${e.incidents}</strong><small>Incidents</small></div><div class="mini-metric"><strong>${money(e.followerLosses)}</strong><small>Losses</small></div></div></article>`).join('')||'<div class="muted">No matching entities.</div>'; $$('[data-open-entity]').forEach(x=>x.addEventListener('click',()=>entityDetailModal(x.dataset.openEntity))); }
async function loadWallets(){
  try{
    if(!state.entities.length)state.entities=(await api('/api/entities')).items;
    const details=await Promise.all(state.entities.map(e=>api(`/api/entities/${e.id}`)));
    const ws=details.flatMap(d=>d.wallets.map(w=>({...w,entityName:d.entity.name,xHandle:d.entity.x_handle})));
    $('#walletsTable').innerHTML=ws.length?`<table class="data-table"><thead><tr><th>Wallet</th><th>Entity</th><th>Status</th><th>Last scan</th><th>Source</th><th></th></tr></thead><tbody>${ws.map(w=>`<tr><td><strong>${esc(w.address.slice(0,8))}…${esc(w.address.slice(-6))}</strong><small class="muted"> ${esc(w.label||'')}</small></td><td>${esc(w.entityName)} <span class="muted">${esc(w.xHandle||'')}</span></td><td><span class="sync-pill sync-${esc(w.sync_status||'pending')}">${esc(w.sync_status||'pending')}</span>${w.sync_error?`<small class="sync-error">${esc(w.sync_error)}</small>`:''}</td><td>${w.last_scanned_at?ago(w.last_scanned_at)+' ago':'not scanned'}</td><td>${esc(w.chain||'solana')}</td><td><button class="secondary small owner-only" data-sync-wallet="${w.id}">Sync now</button></td></tr>`).join('')}</tbody></table>`:'<div class="guest-note">No wallets tracked yet.</div>';
    $$('[data-sync-wallet]').forEach(b=>b.addEventListener('click',async()=>{const old=b.textContent;b.disabled=true;b.textContent='Syncing…';try{const r=await api(`/api/wallets/${b.dataset.syncWallet}/sync`,{method:'POST',body:'{}'});toast(`Synced · ${r.newActivity} new activity`);await refreshOverview();await loadWallets()}catch(e){toast(e.message)}finally{b.disabled=false;b.textContent=old}}));
  }catch(e){toast(e.message)}
}

async function loadTokens(){
  try{state.tokens=(await api('/api/tokens')).items;$('#tokensGrid').innerHTML=state.tokens.length?state.tokens.map(t=>`<article class="panel token-card">${avatarHtml(t,'md')}<div><span class="token-symbol">${esc(t.symbol)}</span><p>${esc(t.name)}<br><span class="muted">${esc((t.mint||'').slice(0,8))}…${esc((t.mint||'').slice(-6))}</span></p><small>${t.is_pump?'Pump.fun / PumpSwap':esc(t.dex_id||'Solana')} · MC ${money(t.market_cap||0)} · Liq ${money(t.liquidity_usd||0)}</small></div><span class="token-change ${t.price_change<0?'value neg':'value pos'}">${t.price_change>0?'+':''}${Number(t.price_change||0).toFixed(1)}%</span></article>`).join(''):'<div class="guest-note">Tokens appear automatically when tracked wallets trade them.</div>'}catch(e){toast(e.message)}
}

async function loadEvidence(){ try{state.evidence=(await api('/api/evidence')).items;$('#evidenceGrid').innerHTML=state.evidence.map(e=>`<article class="panel evidence-card"><strong>${esc(e.title)}</strong><p>${esc(e.entityName||'General research')} · ${esc(e.kind)} · ${ago(e.created_at)}</p>${e.image?`<div class="preview-img" style="background-image:url('${esc(e.image)}')"></div>`:''}<p>${esc(e.note||e.source_url||'')}</p></article>`).join('')||'<div class="muted">No evidence submitted yet.</div>'}catch(e){toast(e.message)} }
async function loadCopyGroups(){
  try{
    const [h,d]=await Promise.all([api('/api/health'),api('/api/copy-groups')]);
    $('#copyAdapterStatus').textContent=h.copyEngineConfigured?'External copy engine configured through server secrets.':'Groups and wallet membership are live. Trade execution is still simulation until your existing copy engine is connected through Replit Secrets.';
    $('#copyGroupsPage').innerHTML=d.items.length?d.items.map(g=>`<article class="panel copy-group-card"><h3>${esc(g.name)}</h3><div class="copy-group-meta"><span>${g.walletCount} wallets</span><span>${esc(g.mode)}</span><span>${g.enabled?'Enabled':'Paused'}</span></div><div class="copy-card-actions owner-only"><button class="secondary" data-manage-group="${g.id}">Manage wallets</button><button class="secondary" data-toggle-group="${g.id}">${g.enabled?'Pause':'Enable'}</button></div></article>`).join(''):'<div class="guest-note">No copy groups yet. Create one and add any number of tracked wallets.</div>';
    $$('[data-toggle-group]').forEach(b=>b.addEventListener('click',async()=>{try{const r=await api(`/api/copy-groups/${b.dataset.toggleGroup}/toggle`,{method:'POST',body:'{}'});toast(`${r.enabled?'Enabled':'Paused'} · ${r.engine.mode||r.engine.error||'engine'}`);loadCopyGroups();refreshOverview()}catch(e){toast(e.message)}}));
    $$('[data-manage-group]').forEach(b=>b.addEventListener('click',()=>manageCopyGroup(b.dataset.manageGroup)));
  }catch(e){toast(e.message)}
}
async function manageCopyGroup(groupId){
  try{
    const d=await api(`/api/copy-groups/${groupId}`);
    modal(`<h2>${esc(d.group.name)}</h2><p>${esc(d.group.mode)} group · add as many tracked wallets as you need.</p><div class="panel" style="box-shadow:none;margin:12px 0"><div class="panel-head"><h2>Included wallets</h2></div><div class="copy-list">${d.wallets.map(w=>`<div class="copy-row">${avatarHtml(w,'sm')}<strong>${esc(w.entityName||'Unlinked')}</strong><span class="muted">${esc(w.address.slice(0,6))}…${esc(w.address.slice(-6))}</span><button class="secondary small" data-remove-group-wallet="${w.id}">Remove</button></div>`).join('')||'<div class="guest-note">No wallets in this group.</div>'}</div></div>${d.available.length?`<form id="groupWalletForm" class="modal-form"><label>Add tracked wallet<select name="walletId">${d.available.map(w=>`<option value="${w.id}">${esc(w.entityName||'Unlinked')} · ${esc(w.address.slice(0,6))}…${esc(w.address.slice(-6))}</option>`).join('')}</select></label><button class="primary">Add wallet</button></form>`:'<div class="guest-note">Every tracked wallet is already in this group.</div>'}`);
    if($('#groupWalletForm'))$('#groupWalletForm').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));try{await api(`/api/copy-groups/${groupId}/wallets`,{method:'POST',body:JSON.stringify(b)});toast('Wallet added to group');manageCopyGroup(groupId);loadCopyGroups()}catch(err){toast(err.message)}};
    $$('[data-remove-group-wallet]').forEach(b=>b.onclick=async()=>{try{await api(`/api/copy-groups/${groupId}/wallets/${b.dataset.removeGroupWallet}`,{method:'DELETE'});toast('Wallet removed');manageCopyGroup(groupId);loadCopyGroups()}catch(err){toast(err.message)}});
  }catch(e){toast(e.message)}
}

async function loadChat(){ try{const d=await api('/api/chat/messages');state.chat=d.items;$('#chatMessages').innerHTML=d.items.map(m=>`<div class="chat-message">${avatarHtml(m,'sm')}<div class="chat-bubble"><strong>${esc(m.displayName)}${m.role==='owner'?'<span class="risk-tag medium">Owner</span>':''}</strong><time>${ago(m.createdAt)}</time><p>${esc(m.body)}</p></div></div>`).join('')||'<div class="muted">Start the conversation.</div>';const box=$('#chatMessages');box.scrollTop=box.scrollHeight;}catch(e){$('#chatMessages').innerHTML=`<div class="muted">${esc(e.message)}</div>`} }
async function sendChat(e){ e.preventDefault();const input=$('#chatInput');if(!input.value.trim())return;try{await api('/api/chat/messages',{method:'POST',body:JSON.stringify({body:input.value})});input.value='';loadChat();loadChatPreview()}catch(err){toast(err.message)} }
async function loadConversations(){ try{const d=await api('/api/conversations');renderConversationList(d.items)}catch(e){toast(e.message)} }
function renderConversationList(items){$('#conversationList').innerHTML=items.map(u=>`<div class="conversation-item" data-user="${u.id}">${avatarHtml(u,'sm')}<div><strong>${esc(u.displayName)}</strong><small>${esc(u.lastBody||u.xHandle||'Start a conversation')}</small></div></div>`).join('')||'<div class="guest-note">Search for a user to start a message.</div>';$$('[data-user]',$('#conversationList')).forEach(x=>x.addEventListener('click',()=>openDm(x.dataset.user)));}
async function searchUsers(){const q=$('#userSearch').value.trim();if(!q)return loadConversations();try{const d=await api('/api/users?q='+encodeURIComponent(q));renderConversationList(d.items)}catch(e){toast(e.message)} }
async function openDm(userId){try{const d=await api('/api/dm/'+userId);state.activeDm=userId;$('#dmHeader').innerHTML=`${avatarHtml(d.user,'sm')}<span style="margin-left:9px">${esc(d.user.displayName)} <small class="muted">${esc(d.user.xHandle||'')}</small></span>`;$('#dmMessages').innerHTML=d.items.map(m=>`<div class="dm-line ${m.senderId===state.user.id?'mine':''}"><div class="dm-text">${esc(m.body)}</div></div>`).join('');$('#dmInput').disabled=false;$('#dmForm button').disabled=false;const box=$('#dmMessages');box.scrollTop=box.scrollHeight;}catch(e){toast(e.message)} }
async function sendDm(e){e.preventDefault();if(!state.activeDm)return;const input=$('#dmInput');if(!input.value.trim())return;try{await api('/api/dm/'+state.activeDm,{method:'POST',body:JSON.stringify({body:input.value})});input.value='';openDm(state.activeDm);loadConversations()}catch(err){toast(err.message)} }
function fillProfile(){if(!state.user)return;$('#profileName').value=state.user.displayName||'';$('#profileX').value=state.user.xHandle||'';$('#profileBio').value=state.user.bio||'';state.avatarData=state.user.avatar||'';renderProfileAvatar();}
function renderProfileAvatar(){const p=$('#profileAvatarPreview');p.textContent='';p.style.backgroundImage=`url("${state.avatarData||fallbackAvatar(state.user?.displayName||'profile')}")`;}
function handleProfileAvatar(e){const f=e.target.files?.[0];if(!f)return;if(f.size>1_050_000){toast('Please use an image under about 1 MB');e.target.value='';return}const r=new FileReader();r.onload=()=>{state.avatarData=r.result;renderProfileAvatar()};r.readAsDataURL(f);}
async function saveProfile(e){e.preventDefault();try{const d=await api('/api/profile',{method:'PATCH',body:JSON.stringify({displayName:$('#profileName').value,xHandle:$('#profileX').value,bio:$('#profileBio').value,avatar:state.avatarData})});state.user=d.user;setAuthUI();toast('Profile saved')}catch(err){toast(err.message)} }
async function loadSettings(){try{const s=await api('/api/settings');$('#setPlatformName').value=s.platform_name||'';$('#setRegistration').checked=s.registration_enabled==='true';$('#setChat').checked=s.community_chat_enabled==='true';$('#setCopy').checked=s.copy_trading_enabled==='true';$('#setRiskThreshold').value=s.risk_high_threshold||80;$('#setDemo').checked=s.demo_mode==='true';$('#setLiveMonitor').checked=s.live_monitor_enabled==='true';$('#setPollSeconds').value=s.live_poll_seconds||60;$('#setHistoryLimit').value=s.wallet_history_limit||30;$('#setXMonitor').checked=s.x_monitor_enabled==='true';const h=await api('/api/live/status');$('#liveProviderStatus').textContent=`Solana: ${h.solana.status} · ${h.solana.provider}. X API: ${h.x.configured?'configured':'not configured'}.`; }catch(e){toast(e.message)}}

async function saveSettings(e){e.preventDefault();try{const s=await api('/api/settings',{method:'PATCH',body:JSON.stringify({platform_name:$('#setPlatformName').value,registration_enabled:$('#setRegistration').checked,community_chat_enabled:$('#setChat').checked,copy_trading_enabled:$('#setCopy').checked,risk_high_threshold:$('#setRiskThreshold').value,demo_mode:$('#setDemo').checked,live_monitor_enabled:$('#setLiveMonitor').checked,live_poll_seconds:$('#setPollSeconds').value,wallet_history_limit:$('#setHistoryLimit').value,x_monitor_enabled:$('#setXMonitor').checked})});applyPlatformName(s.platform_name);toast('Owner settings saved');loadSettings()}catch(err){toast(err.message)}}

function modal(html){$('#modalBody').innerHTML=html;$('#modal').classList.remove('hidden')}
function closeModal(){const n=$('#entity3dNetwork');if(n?._network3dController)n._network3dController.destroy();$('#modal').classList.add('hidden');$('#modalBody').innerHTML=''}
function authModal(mode='login'){const login=mode==='login';modal(`<h2>${login?'Welcome back':'Create account'}</h2><p>${login?'Sign in to chat, message users and manage your profile.':'A standard email account. The first account becomes owner if no owner is configured in Secrets.'}</p><form id="authForm" class="modal-form">${login?'':'<label>Display name<input name="displayName" maxlength="60" required></label>'}<label>Email<input name="email" type="email" required></label><label>Password<input name="password" type="password" minlength="8" required></label><button class="primary">${login?'Sign in':'Create account'}</button><button class="secondary" type="button" id="authSwitch">${login?'Create an account':'Already have an account'}</button></form>`);$('#authSwitch').onclick=()=>authModal(login?'register':'login');$('#authForm').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));try{const d=await api(`/api/auth/${login?'login':'register'}`,{method:'POST',body:JSON.stringify(b)});state.user=d.user;setAuthUI();closeModal();toast(`Signed in as ${state.user.displayName}`);refreshOverview()}catch(err){toast(err.message)}};}
function entityModal(){modal(`<h2>Add tracked entity</h2><p>Create the X/person profile once, then attach as many wallets as needed. You can upload the real avatar now; otherwise the initial wallet will resolve a configured profile image or generate a deterministic fallback.</p><form id="entityForm" class="modal-form"><label>Name / alias<input name="name" required placeholder="moondev"></label><label>X handle<input name="xHandle" placeholder="@moondev"></label><label>Avatar (optional)<input id="entityAvatarFile" type="file" accept="image/*"></label><div class="split"><label>Risk score<input name="riskScore" type="number" min="0" max="100" value="0"></label><label>Confidence<input name="confidence" type="number" min="0" max="100" value="50"></label></div><label>Initial wallet (optional)<input name="wallet" placeholder="Solana wallet address"></label><label>Notes<textarea name="notes" rows="3" placeholder="Observed pattern, source, context…"></textarea></label><button class="primary">Create entity</button></form>`);let entityAvatar='';$('#entityAvatarFile').onchange=e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>1_050_000){toast('Please use an image under about 1 MB');e.target.value='';return}const r=new FileReader();r.onload=()=>entityAvatar=r.result;r.readAsDataURL(f)};$('#entityForm').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));b.avatar=entityAvatar;try{const ent=await api('/api/entities',{method:'POST',body:JSON.stringify(b)});if(b.wallet)await api(`/api/entities/${ent.id}/wallets`,{method:'POST',body:JSON.stringify({address:b.wallet,label:'Main wallet'})});closeModal();toast('Entity created');await refreshOverview();loadEntities()}catch(err){toast(err.message)}};}
async function entityDetailModal(entityId){
  try{
    const d=await api(`/api/entities/${entityId}`);const e=d.entity;
    modal(`<h2>${esc(e.name)} <span class="risk-tag ${riskClass(e.status,e.riskScore)}">${riskDisplay(e.riskScore)}</span></h2><p>${esc(e.xHandle||'')} · ${e.confidence}% identity confidence · ${d.wallets.length} linked wallets</p><div class="entity-top" style="margin:14px 0">${avatarHtml(e,'xl')}<div><strong>${esc(e.notes||'Monitoring profile')}</strong><div class="chips"><span class="chip">Avatar: ${esc(e.avatar_source||'manual')}</span><span class="chip good">● Live intelligence</span></div></div></div><div class="modal-actions owner-only"><button class="primary" id="syncEntityNow">↻ Sync wallet + X now</button></div><div class="panel" style="box-shadow:none;margin:12px 0"><div class="panel-head"><h2>Linked wallets</h2></div><div class="copy-list">${d.wallets.map(w=>`<div class="copy-row">${avatarHtml(w,'sm')}<strong>${esc(w.address.slice(0,8))}…${esc(w.address.slice(-6))}</strong><span class="muted">${esc(w.label||'Wallet')} · ${esc(w.sync_status||'pending')} ${w.last_scanned_at?'· '+ago(w.last_scanned_at)+' ago':''}</span><button class="secondary small owner-only" data-detail-sync="${w.id}">Sync</button></div>`).join('')||'<div class="guest-note">No wallets yet.</div>'}</div></div><div class="panel entity-3d-panel" style="box-shadow:none;margin:12px 0"><div class="panel-head"><h2>Network</h2><span>Wallets · Entity · Tokens</span></div><div id="entity3dNetwork" class="entity-3d-network"><div class="network3d-v12-shell"><canvas class="network3d-canvas" aria-label="Flat entity wallet and token network"></canvas><div class="network3d-v12-help">Drag to pan · pinch to zoom · flat view</div></div><div class="network3d-v12-legend"><span><i class="entity"></i>Entity</span><span><i class="wallet"></i>Wallets</span><span><i class="token"></i>Tokens</span></div></div></div><div class="panel" style="box-shadow:none;margin:12px 0"><div class="panel-head"><h2>Recent observed activity</h2></div><div class="entity-activity">${d.incidents.slice(0,12).map(x=>`<div><span>${ago(x.createdAt)} · ${esc(x.title)}</span><b class="${Number(x.value)<0?'value neg':'value pos'}">${esc(x.symbol||'')}</b></div>`).join('')||'<div class="guest-note">No activity yet. Press Sync now.</div>'}</div></div>${document.body.classList.contains('is-owner')?`<form id="walletAddForm" class="modal-form"><label>Add another wallet<input name="address" required placeholder="Solana wallet address"></label><label>Label<input name="label" placeholder="Secondary wallet"></label><button class="primary">Add wallet + start monitoring</button></form>`:''}`);
    const detail3d=$('#entity3dNetwork');if(detail3d)requestAnimationFrame(()=>createNetwork3D(detail3d,e,d.wallets||[],d.tokens||[]));
    const syncEntity=$('#syncEntityNow'); if(syncEntity)syncEntity.onclick=async()=>{syncEntity.disabled=true;syncEntity.textContent='Syncing…';try{const r=await api(`/api/entities/${entityId}/sync`,{method:'POST',body:'{}'});const n=r.wallets?.reduce((a,x)=>a+(x.newActivity||0),0)||0;toast(`Live sync complete · ${n} new activity${r.x?.configured?' · X checked':''}`);await refreshOverview();entityDetailModal(entityId)}catch(err){toast(err.message)}finally{syncEntity.disabled=false}};
    $$('[data-detail-sync]').forEach(b=>b.onclick=async()=>{b.disabled=true;b.textContent='…';try{const r=await api(`/api/wallets/${b.dataset.detailSync}/sync`,{method:'POST',body:'{}'});toast(`Synced · ${r.newActivity} new activity`);await refreshOverview();entityDetailModal(entityId)}catch(err){toast(err.message)}});
    if($('#walletAddForm'))$('#walletAddForm').onsubmit=async ev=>{ev.preventDefault();const b=Object.fromEntries(new FormData(ev.target));try{await api(`/api/entities/${entityId}/wallets`,{method:'POST',body:JSON.stringify(b)});toast('Wallet added · monitoring started');await refreshOverview();entityDetailModal(entityId)}catch(err){toast(err.message)}};
  }catch(e){toast(e.message)}
}

function evidenceModal(){
  const localNow=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
  modal(`<h2>Upload evidence</h2><p>Add the original source, screenshot and observed time. For an X post about a token, add the mint/symbol so Shadow Intelligence can correlate the post with wallet buys and sells.</p><form id="evidenceForm" class="modal-form"><label>Title<input name="title" required placeholder="X post mentioning $TOKEN"></label><label>Entity<select name="entityId"><option value="">General / unlinked</option>${state.entities.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select></label><label>Evidence type<select name="kind"><option value="x_post">X post</option><option value="profile">X profile / identity</option><option value="transaction">Wallet transaction</option><option value="screenshot">Screenshot</option><option value="note">Research note</option></select></label><label>Observed / posted time<input name="observedAt" type="datetime-local" value="${localNow}"></label><div class="split"><label>Token mint (optional)<input name="tokenMint" placeholder="Solana token mint"></label><label>Token symbol (optional)<input name="tokenSymbol" placeholder="$TOKEN"></label></div><label>Source URL<input name="sourceUrl" type="url" placeholder="https://x.com/…"></label><label>Screenshot<input id="evidenceFile" type="file" accept="image/*"></label><label>Note<textarea name="note" rows="4" placeholder="What is directly observable in this source?"></textarea></label><button class="primary">Submit evidence</button></form>`);
  let image='';$('#evidenceFile').onchange=e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>1_050_000){toast('Please use an image under about 1 MB');return}const r=new FileReader();r.onload=()=>image=r.result;r.readAsDataURL(f)};
  $('#evidenceForm').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));b.image=image;if(b.observedAt)b.observedAt=new Date(b.observedAt).toISOString();try{await api('/api/evidence',{method:'POST',body:JSON.stringify(b)});closeModal();toast('Evidence submitted and linked');loadEvidence();refreshOverview()}catch(err){toast(err.message)}};
}

function copyModal(){modal(`<h2>New Copy Group</h2><p>One group can contain many tracked wallets. “Copy” follows them; “Watch” only alerts; “Inverse” treats exits from high-risk wallets as a warning signal.</p><form id="copyForm" class="modal-form"><label>Group name<input name="name" required></label><label>Mode<select name="mode"><option value="copy">Copy</option><option value="watch">Watch only</option><option value="inverse">Inverse monitor</option></select></label><button class="primary">Create group</button></form>`);$('#copyForm').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));try{await api('/api/copy-groups',{method:'POST',body:JSON.stringify(b)});closeModal();toast('Copy group created');loadCopyGroups();refreshOverview()}catch(err){toast(err.message)}};}
function debounce(fn,ms){let t;return(...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),ms)}}
boot();
