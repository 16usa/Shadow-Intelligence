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
/* SHADOW_ENTITY_WALLET_COPY_V221_START */
function walletAddressCopyHtml(address){
  const value=String(address||'').trim();
  if(!value)return '';

  return `<span class="si-token-address-copy si-wallet-address-copy" style="display:inline-flex;align-items:center;gap:8px;max-width:100%">
    <span style="min-width:0">${esc(short(value))}</span>
    <button
      type="button"
      data-copy-wallet-address="${esc(value)}"
      aria-label="Copy wallet address"
      title="Copy wallet address"
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

function bindWalletAddressCopy(root=document){
  root.querySelectorAll?.('[data-copy-wallet-address]').forEach(button=>{
    button.onclick=async event=>{
      event.preventDefault();
      event.stopPropagation();

      const address=button.dataset.copyWalletAddress||'';
      const ok=await copyTokenAddress(address);

      if(ok){
        const oldTitle=button.getAttribute('title')||'Copy wallet address';
        button.setAttribute('title','Copied');
        button.style.opacity='1';
        toast('Wallet address copied');
        setTimeout(()=>{
          button.setAttribute('title',oldTitle);
          button.style.opacity='.72';
        },1200);
      }else{
        toast('Could not copy wallet address');
      }
    };
  });
}
/* SHADOW_ENTITY_WALLET_COPY_V221_END */

const state={user:null,settings:{},entities:[],tokens:[],overview:null,details:new Map(),graph:null,detailGraph:null,lastEventIds:new Set(),activeDm:null,userWallet:null,copySubscriptions:new Map(),notifications:{settings:null,items:[],unread:0,lastTopId:'',pollSeeded:false}};
/* SHADOW_USER_COPY_TRADING_V230_CLIENT */
let activeWalletProvider=null;

function bytesToBase64(bytes){
  let binary='';
  const arr=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||[]);
  for(let i=0;i<arr.length;i++)binary+=String.fromCharCode(arr[i]);
  return btoa(binary);
}

function walletProviderCandidates(){
  const rows=[];
  const phantom=window.phantom?.solana;
  if(phantom?.isPhantom)rows.push({name:'Phantom',key:'phantom',provider:phantom});

  const sf=window.solflare?.solana||window.solflare;
  if(sf && (sf.isSolflare||sf.connect))rows.push({name:'Solflare',key:'solflare',provider:sf});

  if(window.solana?.connect && !rows.some(x=>x.provider===window.solana)){
    rows.push({name:window.solana.isPhantom?'Phantom':'Solana wallet',key:window.solana.isPhantom?'phantom':'solana',provider:window.solana});
  }
  return rows;
}

function mobileWalletBrowseUrl(kind){
  const target=encodeURIComponent(location.href);
  const ref=encodeURIComponent(location.origin);
  if(kind==='phantom')return `https://phantom.app/ul/browse/${target}?ref=${ref}`;
  if(kind==='solflare')return `https://solflare.com/ul/v1/browse/${target}?ref=${ref}`;
  return '';
}

function renderWalletButton(){
  const b=$('#walletButton');
  if(!b)return;
  const connected=!!state.userWallet;
  b.classList.toggle('is-connected',connected);
  b.title=connected?`Wallet ${short(state.userWallet.address)}`:'Connect Solana wallet';
  b.setAttribute('aria-label',b.title);
}

async function loadUserWalletState(){
  state.userWallet=null;
  if(!state.user){renderWalletButton();return}
  try{
    const data=await api('/api/user-wallets');
    state.userWallet=Array.isArray(data.items)?data.items[0]||null:null;
  }catch(error){
    console.debug('User wallet state unavailable',error);
  }
  renderWalletButton();
}

function bindWalletButton(){
  const b=$('#walletButton');
  if(!b)return;
  b.onclick=()=>walletConnectionModal();
  renderWalletButton();
}

async function connectInjectedWallet(candidate){
  const provider=candidate?.provider;
  if(!provider?.connect)throw new Error('Wallet provider is unavailable');

  const result=await provider.connect();
  const publicKey=provider.publicKey||result?.publicKey;
  const address=String(publicKey?.toString?.()||publicKey||'');
  if(!address)throw new Error('Wallet did not return a Solana address');
  if(!provider.signMessage)throw new Error('This wallet does not support message signing');

  const challenge=await api('/api/wallet-auth/challenge',{
    method:'POST',
    body:JSON.stringify({address})
  });

  const messageBytes=new TextEncoder().encode(challenge.message);
  const signed=await provider.signMessage(messageBytes,'utf8');
  const signature=signed?.signature||signed;
  if(!signature)throw new Error('Wallet signature was not returned');

  const verified=await api('/api/wallet-auth/verify',{
    method:'POST',
    body:JSON.stringify({
      challengeId:challenge.challengeId,
      address,
      provider:candidate.key,
      signature:bytesToBase64(signature)
    })
  });

  activeWalletProvider=provider;
  state.user=verified.user||state.user;
  state.userWallet=verified.wallet;
  setAuth();
  await loadNotificationState({silent:true});
  renderWalletButton();
  toast(`Wallet connected · ${short(address)}`);
  walletConnectionModal();
}

function walletConnectionModal(){
  if(state.userWallet){
    modal(`<div class="si-wallet-modal">
      <h2>Solana wallet</h2>
      <p class="guest-note">Verified wallet used for your copy-trading subscriptions.</p>
      <div class="si-wallet-summary">
        <strong>${esc(short(state.userWallet.address))}</strong>
        <small>${esc(state.userWallet.address)}</small>
      </div>
      <div class="si-copy-actions">
        <button id="walletModalClose" type="button" class="si-button">Close</button>
        <button id="walletDisconnect" type="button" class="si-button" style="color:#ff5c5c;border-color:rgba(255,75,75,.5)">Disconnect</button>
      </div>
      <p class="si-copy-note">Shadow Intelligence stores the public address and verification proof only. Seed phrases and private keys are never requested.</p>
    </div>`);

    $('#walletModalClose').onclick=closeModal;
    $('#walletDisconnect').onclick=async()=>{
      const button=$('#walletDisconnect');
      button.disabled=true;
      try{
        await api(`/api/user-wallets/${state.userWallet.id}`,{method:'DELETE'});
        try{await activeWalletProvider?.disconnect?.()}catch{}
        activeWalletProvider=null;
        state.userWallet=null;
        state.copySubscriptions.clear();

        if(String(state.user?.email||'').endsWith('@wallet.shadow.local')){
          try{await api('/api/auth/logout',{method:'POST',body:'{}'})}catch{}
          state.user=null;
          setAuth();
        }

        closeModal();
        renderWalletButton();
        toast('Wallet disconnected');
      }catch(error){
        toast(error.message);
        button.disabled=false;
      }
    };
    return;
  }

  const candidates=walletProviderCandidates();
  const injected=candidates.map((c,i)=>`
    <button class="si-button primary" type="button" data-connect-wallet="${i}">
      Connect ${esc(c.name)}
    </button>`).join('');

  modal(`<div class="si-wallet-modal">
    <h2>Connect Solana wallet</h2>
    <p class="guest-note">Connect a wallet to configure copy trading for any Entity.</p>
    <div class="si-wallet-choice">
      ${injected||'<div class="guest-note">No injected Solana wallet detected in this browser.</div>'}
      <button id="openPhantomWallet" class="si-button" type="button">Open in Phantom</button>
      <button id="openSolflareWallet" class="si-button" type="button">Open in Solflare</button>
    </div>
    <p class="si-copy-note">On iPhone, open this site inside Phantom or Solflare, then tap Connect. Your wallet signature signs you in automatically. We never ask for a seed phrase or private key.</p>
  </div>`);

  $$('[data-connect-wallet]').forEach(button=>{
    button.onclick=async()=>{
      const candidate=candidates[Number(button.dataset.connectWallet)];
      button.disabled=true;
      try{await connectInjectedWallet(candidate)}
      catch(error){toast(error.message);button.disabled=false}
    };
  });
  $('#openPhantomWallet').onclick=()=>{location.href=mobileWalletBrowseUrl('phantom')};
  $('#openSolflareWallet').onclick=()=>{location.href=mobileWalletBrowseUrl('solflare')};
}

function copyControlHtml(entityId){
  return `<div id="entityCopyControl" class="si-copy-control" data-copy-entity="${esc(entityId)}">
    <button type="button" class="si-button si-copy-button" data-copy-open="${esc(entityId)}">Copy trade</button>
  </div>`;
}

async function hydrateEntityCopyControl(entityId){
  const root=$(`[data-copy-entity="${entityId}"]`);
  if(!root)return;

  if(!state.user){
    root.innerHTML=`<button type="button" class="si-button si-copy-button" data-copy-wallet="1">Connect wallet to copy trade</button>`;
    root.querySelector('[data-copy-wallet]').onclick=()=>walletConnectionModal();
    return;
  }

  try{
    const data=await api(`/api/entities/${entityId}/copy`);
    const sub=data.subscription;
    if(sub)state.copySubscriptions.set(entityId,sub);

    const active=!!sub?.enabled;
    const label=active?'Copy trading active':'Copy trade';
    const stateText=sub?.engineState==='authorization_required'
      ? 'Authorization required'
      : sub?.engineState==='engine_required'
        ? 'Execution engine required'
        : active
          ? `Active · ${Number(sub.amountSol||0).toFixed(3)} SOL/trade`
          : state.userWallet
            ? 'Wallet connected'
            : 'Connect wallet first';

    root.innerHTML=`
      <button type="button" class="si-button si-copy-button ${active?'is-active':''}" data-copy-open="${esc(entityId)}">${label}</button>
      <div class="si-copy-status"><span><i class="si-copy-dot ${active?'live':''}"></i>${esc(stateText)}</span></div>`;

    root.querySelector('[data-copy-open]').onclick=()=>copyTradingModal(entityId,data);
  }catch(error){
    root.innerHTML=`<button type="button" class="si-button si-copy-button" data-copy-open="${esc(entityId)}">Copy trade</button>`;
    root.querySelector('[data-copy-open]').onclick=()=>copyTradingModal(entityId);
  }
}

async function copyTradingModal(entityId,preloaded=null){
  if(!state.user){
    walletConnectionModal();
    return;
  }

  let data=preloaded;
  if(!data){
    try{data=await api(`/api/entities/${entityId}/copy`)}
    catch(error){toast(error.message);return}
  }

  if(!state.userWallet){
    walletConnectionModal();
    return;
  }

  const entity=state.entities.find(x=>x.id===entityId)||{};
  const sub=data.subscription||{};
  const enabled=!!sub.enabled;

  modal(`<div class="si-copy-modal">
    <h2>${enabled?'Copy trading':'Copy trade'} ${esc(entity.xHandle||entity.x_handle||entity.name||'Entity')}</h2>
    <p class="guest-note">Configure how this Entity is copied to your verified Solana wallet.</p>

    <div class="si-wallet-summary">
      <strong>Wallet ${esc(short(state.userWallet.address))}</strong>
      <small>${esc(state.userWallet.address)}</small>
    </div>

    <form id="copyTradingForm" class="si-copy-form" novalidate>
      <label>Trade size (SOL)
        <input name="amountSol" type="number" min="0.001" max="100" step="0.001" value="${esc(sub.amountSol??0.05)}">
      </label>
      <label>Max position (SOL)
        <input name="maxPositionSol" type="number" min="0.001" max="1000" step="0.001" value="${esc(sub.maxPositionSol??0.5)}">
      </label>
      <label>Daily cap (SOL)
        <input name="maxDailySol" type="number" min="0.001" max="10000" step="0.001" value="${esc(sub.maxDailySol??1)}">
      </label>
      <label>Max slippage (bps)
        <input name="slippageBps" type="number" min="10" max="3000" step="10" value="${esc(sub.slippageBps??500)}">
      </label>
      <label class="si-copy-check"><span>Copy buys</span><input name="copyBuys" type="checkbox" ${sub.copyBuys===false?'':'checked'}></label>
      <label class="si-copy-check"><span>Copy sells</span><input name="copySells" type="checkbox" ${sub.copySells===false?'':'checked'}></label>
      <label>Sell amount (%)
        <input name="sellPercent" type="number" min="1" max="100" step="1" value="${esc(sub.sellPercent??100)}">
      </label>

      <div class="si-copy-actions">
        <button id="copyCancel" class="si-button" type="button">Cancel</button>
        <button id="copySave" class="si-button primary" type="button">${enabled?'Update':'Start copying'}</button>
      </div>
      ${enabled?'<button id="copyStop" class="si-button" type="button" style="width:100%;color:#ff5c5c;border-color:rgba(255,75,75,.5)">Stop copying</button>':''}
    </form>

    <p class="si-copy-note">Wallet connection only proves ownership. Automatic unattended execution requires the configured copy engine to have an explicit execution authorization from the user. Shadow Intelligence never stores seed phrases or private keys.</p>
    ${!data.engineConfigured?'<p class="si-copy-note" style="color:#ff9f0a">Automatic execution engine is not configured on this deployment yet.</p>':''}
  </div>`);

  $('#copyCancel').onclick=()=>{
    const detail=state.details.get(entityId);
    if(detail)entityDetail(detail);
    else closeModal();
  };

  const form=$('#copyTradingForm');
  const save=$('#copySave');
  save.onclick=async()=>{
    const fd=new FormData(form);
    const body={
      walletId:state.userWallet.id,
      enabled:true,
      amountSol:Number(fd.get('amountSol')),
      maxPositionSol:Number(fd.get('maxPositionSol')),
      maxDailySol:Number(fd.get('maxDailySol')),
      slippageBps:Number(fd.get('slippageBps')),
      copyBuys:form.elements.copyBuys.checked,
      copySells:form.elements.copySells.checked,
      sellPercent:Number(fd.get('sellPercent'))
    };

    save.disabled=true;
    save.textContent='Connecting…';
    try{
      const result=await api(`/api/entities/${entityId}/copy`,{
        method:'PUT',
        body:JSON.stringify(body)
      });
      if(result.subscription)state.copySubscriptions.set(entityId,result.subscription);

      if(result.requiresAuthorization&&result.authorizationUrl){
        toast('Execution authorization required');
        window.open(result.authorizationUrl,'_blank','noopener,noreferrer');
      }else if(result.subscription?.enabled){
        toast('Copy trading active');
      }else{
        toast('Copy settings saved');
      }

      const detail=state.details.get(entityId);
      if(detail)entityDetail(detail);
      else closeModal();
    }catch(error){
      toast(error.message);
      save.disabled=false;
      save.textContent=enabled?'Update':'Start copying';
    }
  };

  const stop=$('#copyStop');
  if(stop)stop.onclick=async()=>{
    stop.disabled=true;
    stop.textContent='Stopping…';
    try{
      const result=await api(`/api/entities/${entityId}/copy`,{
        method:'PUT',
        body:JSON.stringify({
          walletId:state.userWallet.id,
          enabled:false,
          amountSol:Number(form.elements.amountSol.value),
          maxPositionSol:Number(form.elements.maxPositionSol.value),
          maxDailySol:Number(form.elements.maxDailySol.value),
          slippageBps:Number(form.elements.slippageBps.value),
          copyBuys:form.elements.copyBuys.checked,
          copySells:form.elements.copySells.checked,
          sellPercent:Number(form.elements.sellPercent.value)
        })
      });
      if(result.subscription)state.copySubscriptions.set(entityId,result.subscription);
      toast('Copy trading stopped');
      const detail=state.details.get(entityId);
      if(detail)entityDetail(detail);
      else closeModal();
    }catch(error){
      toast(error.message);
      stop.disabled=false;
      stop.textContent='Stop copying';
    }
  };
}
/* SHADOW_WALLET_AUTH_V235_CLIENT */
/* Wallet-first login enabled for guest/mobile wallet browsers. */
/* SHADOW_WALLET_AUTH_V235_CLIENT_END */
/* SHADOW_USER_COPY_TRADING_V230_CLIENT_END */
async function api(url,opt={}){const r=await fetch(url,{...opt,headers:{'content-type':'application/json',...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||`HTTP ${r.status}`);return d}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),2400)}
/* SHADOW_NOTIFICATIONS_V240_CLIENT */
function resetNotificationState(){
  state.notifications={settings:null,items:[],unread:0,lastTopId:'',pollSeeded:false};
  renderNotificationBell();
}

function renderNotificationBell(){
  const button=$('#notificationButton');
  const badge=$('#notificationBadge');
  if(!button||!badge)return;
  /* SHADOW_NOTIFICATION_ZERO_HIDE_V247 */
  const unread=Math.max(0,Number(state.user?state.notifications?.unread||0:0)||0);
  const hasUnread=unread>0;
  badge.hidden=!hasUnread;
  badge.style.display=hasUnread?'grid':'none';
  badge.textContent=hasUnread?(unread>99?'99+':String(unread)):'';
  button.classList.toggle('has-unread',hasUnread);
  button.title=state.user
    ? unread>0?`${unread} unread notification${unread===1?'':'s'}`:'Notifications'
    : 'Notifications · sign in to configure';
  button.setAttribute('aria-label',button.title);
}

function notificationEntityLabel(row){
  const handle=String(row?.xHandle||'').trim();
  if(handle)return handle.startsWith('@')?handle:`@${handle}`;
  return String(row?.entityName||'Entity').trim()||'Entity';
}
function notificationTokenLabel(row){
  const raw=String(row?.symbol||row?.tokenName||short(row?.tokenMint||'Token')).trim();
  return raw.startsWith('$')?raw:`$${raw}`;
}
function notificationAction(row){
  const type=String(row?.type||'').toLowerCase();
  return type==='sell'?'sold':type==='swap'?'swapped into':'bought';
}
function notificationEventHtml(row,index){
  const entity=notificationEntityLabel(row);
  const token=notificationTokenLabel(row);
  const amountSol=Number(row?.solAmount||0);
  const meta=[amountSol>0?`${amountSol.toFixed(amountSol<1?3:2)} SOL`:'',row?.eventAt?ago(row.eventAt):''].filter(Boolean).join(' · ');
  return `<button type="button" class="si-notification-row" data-notification-row="${index}">
    ${avatar({avatar:row?.entityAvatar,name:entity},'sm')}
    <span class="si-notification-copy"><strong>${esc(entity)} ${esc(notificationAction(row))} ${esc(token)}</strong><small>${esc(meta||'Confirmed on-chain trade')}</small></span>
    <span class="si-notification-chevron">›</span>
  </button>`;
}

async function loadNotificationState({silent=false}={}){
  if(!state.user){resetNotificationState();return;}
  try{
    const data=await api('/api/notifications?limit=60');
    state.notifications.settings=data.settings||null;
    state.notifications.items=Array.isArray(data.items)?data.items:[];
    state.notifications.unread=Number(data.unread||0);
    const topId=String(state.notifications.items[0]?.id||'');
    if(!state.notifications.pollSeeded){
      state.notifications.lastTopId=topId;
      state.notifications.pollSeeded=true;
    }else if(topId&&state.notifications.lastTopId&&topId!==state.notifications.lastTopId&&state.notifications.unread>0&&!silent){
      const first=state.notifications.items[0];
      toast(`${notificationEntityLabel(first)} ${notificationAction(first)} ${notificationTokenLabel(first)}`);
      state.notifications.lastTopId=topId;
    }else if(topId){state.notifications.lastTopId=topId;}
    renderNotificationBell();
  }catch(error){if(!silent)console.debug('Notification poll failed',error);}
}

async function markNotificationsRead(){
  if(!state.user)return;
  try{
    await api('/api/notifications/read',{method:'POST',body:'{}'});
    state.notifications.unread=0;
    renderNotificationBell();
  }catch(error){console.debug('Could not mark notifications read',error);}
}

function filterNotificationOptionRows(input,selector){
  const q=String(input?.value||'').trim().toLowerCase();
  document.querySelectorAll(selector).forEach(row=>{
    row.hidden=!!q&&!String(row.dataset.search||'').toLowerCase().includes(q);
  });
}

function notificationGuestModal(){
  modal(`<div class="si-notification-center">
    <div class="si-notification-head"><div><div class="si-eyebrow">ALERTS</div><h2>Notifications</h2><p>Sign in or connect a wallet to save alert preferences.</p></div></div>
    <div class="si-notification-guest-actions">
      <button id="notificationSignIn" class="si-button primary" type="button">Sign in</button>
      <button id="notificationConnectWallet" class="si-button" type="button">Connect wallet</button>
    </div>
  </div>`);
  $('#notificationSignIn').onclick=()=>authModal('login');
  $('#notificationConnectWallet').onclick=()=>walletConnectionModal();
}

function notificationCenterModal(tab='notifications'){
  if(!state.user)return notificationGuestModal();
  const settings=state.notifications.settings||{entitiesEnabled:false,tokensEnabled:false,liveEnabled:false,entityIds:[],tokenMints:[]};
  const selectedEntities=new Set(settings.entityIds||[]);
  const selectedTokens=new Set(settings.tokenMints||[]);
  const notificationsActive=tab==='notifications';
  const body=notificationsActive
    ? `<div class="si-notification-list">${(state.notifications.items||[]).map(notificationEventHtml).join('')||'<div class="si-notification-empty">No matching trade alerts yet.</div>'}</div>`
    : `<form id="notificationSettingsForm" class="si-notification-settings">
        <section class="si-notification-setting-block">
          <label class="si-notification-master"><span><strong>Entities</strong><small>Alert only for selected people.</small></span><input id="notifyEntitiesEnabled" type="checkbox" ${settings.entitiesEnabled?'checked':''}/></label>
          <input id="notifyEntitySearch" class="si-input" type="search" placeholder="Find an entity"/>
          <div class="si-notification-options si-notification-entity-options">
            ${(state.entities||[]).map(e=>{const name=e.xHandle||e.x_handle||e.name||'Entity';return `<label class="si-notification-option" data-notify-entity-row data-search="${esc([name,e.name].filter(Boolean).join(' '))}"><input type="checkbox" value="${esc(e.id)}" ${selectedEntities.has(e.id)?'checked':''}/>${avatar(e,'sm')}<span><strong>${esc(name)}</strong><small>${esc(e.name||'')}</small></span></label>`;}).join('')||'<div class="si-notification-empty">No Entities available.</div>'}
          </div>
        </section>
        <section class="si-notification-setting-block">
          <label class="si-notification-master"><span><strong>Tokens</strong><small>Alert when tracked Entities trade selected tokens.</small></span><input id="notifyTokensEnabled" type="checkbox" ${settings.tokensEnabled?'checked':''}/></label>
          <input id="notifyTokenSearch" class="si-input" type="search" placeholder="Find a token"/>
          <div class="si-notification-options si-notification-token-options">
            ${(state.tokens||[]).map(t=>{const symbol=t.symbol||t.name||'Token';return `<label class="si-notification-option" data-notify-token-row data-search="${esc([symbol,t.name,t.mint].filter(Boolean).join(' '))}"><input type="checkbox" value="${esc(t.mint)}" ${selectedTokens.has(t.mint)?'checked':''}/>${avatar(t,'sm')}<span><strong>${esc(symbol.startsWith('$')?symbol:`$${symbol}`)}</strong><small>${esc(t.name||short(t.mint))}</small></span></label>`;}).join('')||'<div class="si-notification-empty">No Tokens available.</div>'}
          </div>
        </section>
        <section class="si-notification-setting-block">
          <label class="si-notification-master"><span><strong>Live</strong><small>Alert for every confirmed Buy / Sell / Swap across the tracked system.</small></span><input id="notifyLiveEnabled" type="checkbox" ${settings.liveEnabled?'checked':''}/></label>
        </section>
        <button class="si-button primary si-notification-save" type="submit">Save notifications</button>
      </form>`;

  modal(`<div class="si-notification-center"><div class="si-notification-head"><div><div class="si-eyebrow">ALERTS</div><h2>Notifications</h2><p>Only confirmed Buy / Sell / Swap activity can trigger an alert.</p></div></div><div class="si-notification-tabs"><button type="button" data-notify-tab="notifications" class="${notificationsActive?'active':''}">Notifications</button><button type="button" data-notify-tab="settings" class="${!notificationsActive?'active':''}">Settings</button></div>${body}</div>`);

  $$('[data-notify-tab]').forEach(button=>{button.onclick=()=>notificationCenterModal(button.dataset.notifyTab);});
  if(notificationsActive){
    $$('[data-notification-row]').forEach(button=>{button.onclick=()=>{const row=state.notifications.items[Number(button.dataset.notificationRow)];if(!row)return;closeModal();if(row.entityId)return openObject('entity',{id:row.entityId});if(row.tokenMint)return openObject('token',{mint:row.tokenMint});};});
    markNotificationsRead();
    return;
  }

  const entitySearch=$('#notifyEntitySearch');
  const tokenSearch=$('#notifyTokenSearch');
  if(entitySearch)entitySearch.oninput=()=>filterNotificationOptionRows(entitySearch,'[data-notify-entity-row]');
  if(tokenSearch)tokenSearch.oninput=()=>filterNotificationOptionRows(tokenSearch,'[data-notify-token-row]');
  const form=$('#notificationSettingsForm');
  if(form)form.onsubmit=async event=>{
    event.preventDefault();
    const save=form.querySelector('.si-notification-save');
    save.disabled=true;save.textContent='Saving...';
    const payload={
      entitiesEnabled:!!$('#notifyEntitiesEnabled')?.checked,
      tokensEnabled:!!$('#notifyTokensEnabled')?.checked,
      liveEnabled:!!$('#notifyLiveEnabled')?.checked,
      entityIds:$$('[data-notify-entity-row] input:checked').map(x=>x.value),
      tokenMints:$$('[data-notify-token-row] input:checked').map(x=>x.value)
    };
    try{
      const saved=await api('/api/notification-settings',{method:'PUT',body:JSON.stringify(payload)});
      state.notifications.settings=saved.settings;
      state.notifications.items=[];state.notifications.unread=0;state.notifications.lastTopId='';state.notifications.pollSeeded=false;
      renderNotificationBell();
      toast('Notification settings saved');
      await loadNotificationState({silent:true});
      notificationCenterModal('notifications');
    }catch(error){toast(error.message);save.disabled=false;save.textContent='Save notifications';}
  };
}

function bindNotificationButton(){
  const button=$('#notificationButton');
  if(!button)return;
  button.onclick=async()=>{
    if(!state.user)return notificationGuestModal();
    await loadNotificationState({silent:true});
    notificationCenterModal('notifications');
  };
  renderNotificationBell();
}
async function pollNotifications(){
  if(!state.user||document.hidden)return;
  await loadNotificationState({silent:false});
}
/* SHADOW_NOTIFICATIONS_V240_CLIENT_END */
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
function setAuth(){
  const authed=!!state.user;
  document.body.classList.toggle('is-auth',authed);
  document.body.classList.toggle('is-owner',['owner','admin'].includes(state.user?.role));
  $$('.auth-only').forEach(x=>x.style.display=authed?'':'none');
  $$('.guest-only').forEach(x=>x.style.display=authed?'none':'');
  $$('.owner-only').forEach(x=>x.style.display=['owner','admin'].includes(state.user?.role)?'':'none');
  if(!authed)resetNotificationState();
  renderNotificationBell();
}
function theme(){return document.documentElement.dataset.theme==='dark'?'dark':'light'}
function toggleTheme(){const n=theme()==='dark'?'light':'dark';document.documentElement.dataset.theme=n;localStorage.setItem('si-theme',n);state.graph?.schedule();state.detailGraph?.schedule()}
let currentPage='overview';

function nav(name,{push=true,replace=false}={}){
  const page=$(`#page-${name}`);
  if(!page)return;
  if(['messages'].includes(name)&&!state.user)return authModal('login');
  /* SHADOW_ADMIN_WALLETS_V222_START */
  if(['settings','wallets'].includes(name)&&!['owner','admin'].includes(state.user?.role)){
    toast('Owner access required');
    return;
  }
  /* SHADOW_ADMIN_WALLETS_V222_END */

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
  if(name==='tokens')renderTokens();
  if(name==='feed')renderFeed();
  if(name==='evidence')loadEvidence();
  if(name==='chat')loadChat();
  if(name==='messages')loadConversations();
  if(name==='settings')loadSettings();
  if(name==='search')renderSearchPageResults($('#searchPageInput')?.value||'');
}

function backPage(){
  if(currentPage==='overview')return;
  if(history.state?.shadowPage===currentPage && history.length>1){
    history.back();
    return;
  }
  nav('overview',{push:false,replace:true});
}


/* SHADOW_SECTION_COUNTS_V246 */
const siSectionCounts={entities:null,wallets:null,tokens:null};
let siSectionCountObserver=null;
let siSectionCountQueued=false;

function siCaptureLegacyOverviewCounts(){
  const pattern=/^(\d+)\s+entities\s*[·•]\s*(\d+)\s+wallets\s*[·•]\s*(\d+)\s+tokens$/i;

  document.querySelectorAll('div,span,p').forEach(el=>{
    if(el.children.length)return;
    const text=String(el.textContent||'').replace(/\s+/g,' ').trim();
    const match=text.match(pattern);
    if(!match)return;

    siSectionCounts.entities=Number(match[1]);
    siSectionCounts.wallets=Number(match[2]);
    siSectionCounts.tokens=Number(match[3]);

    /* SHADOW_SECTION_COUNTS_CLEANUP_V2461 */
    let shell=el;
    for(let i=0;i<3 && shell.parentElement;i++){
      const parent=shell.parentElement;
      const parentText=String(parent.textContent||'').replace(/\s+/g,' ').trim();
      if(parentText===text && parent.children.length<=4){
        shell=parent;
        continue;
      }
      break;
    }
    shell.classList.add('si-legacy-overview-count-shell-hidden');
    shell.setAttribute('aria-hidden','true');
    el.classList.add('si-legacy-overview-count-hidden');
    el.setAttribute('aria-hidden','true');
  });
}

function siOverviewCount(key){
  if(key==='entities' && Array.isArray(state?.entities))return state.entities.length;
  if(key==='tokens' && Array.isArray(state?.tokens))return state.tokens.length;

  const overview=state?.overview||{};
  const candidates=[
    overview?.[key],
    overview?.counts?.[key],
    overview?.summary?.[key],
    overview?.stats?.[key],
    overview?.[`${key}Count`],
    overview?.[`${key}_count`]
  ];

  for(const value of candidates){
    const number=Number(value);
    if(Number.isFinite(number)&&number>=0)return number;
  }

  const cached=Number(siSectionCounts[key]);
  return Number.isFinite(cached)&&cached>=0?cached:null;
}

/* SHADOW_SECTION_COUNTS_REMOVE_SOURCE_V2462 */
function siRemoveLegacyCounterShell(){
  const seeds=[
    ...document.querySelectorAll(
      '.si-legacy-overview-count-hidden,.si-legacy-overview-count-shell-hidden'
    )
  ];

  for(const seed of seeds){
    let node=seed;
    for(let depth=0;depth<7 && node?.parentElement;depth++){
      const parent=node.parentElement;
      const rect=parent.getBoundingClientRect();
      const style=getComputedStyle(parent);
      const radius=parseFloat(style.borderTopLeftRadius)||0;

      const isSmallRenderedShell=
        rect.width>=16 &&
        rect.width<=520 &&
        rect.height>=12 &&
        rect.height<=96 &&
        radius>=8;

      if(isSmallRenderedShell){
        parent.remove();
        break;
      }
      node=parent;
    }
  }

  const viewportH=window.innerHeight||document.documentElement.clientHeight||0;
  document.querySelectorAll('#main div,#main span,main div,main span').forEach(el=>{
    if(el.children.length || String(el.textContent||'').trim())return;
    const rect=el.getBoundingClientRect();
    if(rect.width<16 || rect.width>100 || rect.height<12 || rect.height>50)return;
    if(rect.top < viewportH*0.55)return;

    const style=getComputedStyle(el);
    const radius=parseFloat(style.borderTopLeftRadius)||0;
    const borderWidth=parseFloat(style.borderTopWidth)||0;
    if(radius<8 || borderWidth<=0)return;
    if(el.closest('button,a,input,nav,.si-immersive-dock,.si-bottom-cluster'))return;
    el.remove();
  });
}
/* SHADOW_SECTION_COUNTS_REMOVE_SOURCE_V2462_END */

function siSyncSectionCount(){
  siCaptureLegacyOverviewCounts();
  siRemoveLegacyCounterShell();

  const main=document.querySelector('#main')||document.querySelector('main');
  if(!main)return;

  const titles=[...main.querySelectorAll('h1')];
  for(const h1 of titles){
    const title=[...h1.childNodes]
      .filter(node=>node.nodeType===Node.TEXT_NODE)
      .map(node=>node.textContent||'')
      .join('')
      .trim()
      .toLowerCase();

    const key=title==='entities'?'entities':title==='tokens'?'tokens':title==='wallets'?'wallets':'';
    const existing=h1.querySelector(':scope > .si-section-count');

    if(!key){
      existing?.remove();
      continue;
    }

    const count=siOverviewCount(key);
    if(count===null)continue;

    let badge=existing;
    if(!badge){
      badge=document.createElement('span');
      badge.className='si-section-count';
      badge.setAttribute('aria-hidden','true');
      h1.appendChild(badge);
    }
    badge.textContent=String(count);
    badge.title=`${count} ${key}`;
  }
}

function siQueueSectionCountSync(){
  if(siSectionCountQueued)return;
  siSectionCountQueued=true;
  requestAnimationFrame(()=>{
    siSectionCountQueued=false;
    siSyncSectionCount();
  });
}

function startSectionCountSync(){
  if(siSectionCountObserver)return;
  siSectionCountObserver=new MutationObserver(siQueueSectionCountSync);
  siSectionCountObserver.observe(document.body,{
    subtree:true,
    childList:true,
    characterData:true
  });
  siQueueSectionCountSync();
}
/* SHADOW_SECTION_COUNTS_V246_END */


async function boot(){
 startSectionCountSync();
 try{
   const me=await api('/api/me');
   state.user=me.user;
   state.settings=me.settings||{};
   document.title=state.settings.platformName||'Shadow Intelligence';
 }catch{}
 setAuth();
 await loadUserWalletState();
 bind();
 bindWalletButton();
 bindSearchPage();
 bindNotificationButton();
 nav('overview',{push:false,replace:true});
 refresh();
 startMapSignalPoll();
 setInterval(()=>{
   if(!['chat','messages','settings'].includes(currentPage))refresh();
 },7000);
 setInterval(()=>{
   pollNotifications().catch(()=>{});
 },7000);
}
function bind(){
 $$('[data-nav]').forEach(b=>b.onclick=()=>{
   const target=b.dataset.nav;
   nav(target);
   if(target==='overview')renderOverview().catch(e=>console.error('Map render failed',e));
 });const themeDockButton=$('#themeToggleDock');if(themeDockButton)themeDockButton.onclick=toggleTheme;$('#adminTheme').onclick=toggleTheme;$('#modalClose').onclick=closeModal;$('#modal').onclick=e=>{if(e.target.id==='modal')closeModal()};$('#addEntityBtn').onclick=entityModal;$('#entitiesAddBtn').onclick=entityModal;$('#evidenceAddBtn').onclick=evidenceModal;$('#chatForm').onsubmit=sendChat;$('#dmForm').onsubmit=sendDm;$('#userSearch').oninput=()=>searchUsers($('#userSearch').value);$('#settingsForm').onsubmit=saveSettings;$('#fitMap').onclick=()=>state.graph?.fit();
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
    /* SHADOW_SWARM_CONTINUITY_V238 */
    this.lastPersist=0;
    this.persistEveryMs=1000;
    this.persistKey='si-global-swarm-v238';
    this.persisted=this.loadPersistedState();
    this.didInitialRestore=false;
    this.activeBeacons=new Map();
    /* SHADOW_SWARM_CONTINUITY_V238_END */
    this.drag=null;
    this.w=1;
    this.h=1;
    this.centerX=0;
    this.centerY=0;
    this.safe={left:28,right:28,top:118,bottom:158};

    root.dataset.renderer='dom-v207';
    root.dataset.rendererState='booting';
    root.innerHTML=
      '<div class="si-dom-swarm" aria-label="Entity intelligence map"></div>'+
      '<div class="si-graph-empty">No network data yet.</div>';

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

    this._onPageHide=()=>this.persistState(true);
    this._onVisibilityChange=()=>{
      if(document.hidden){
        this.persistState(true);
      }else{
        this.last=performance.now();
        this.schedule();
      }
    };
    window.addEventListener('pagehide',this._onPageHide,{passive:true});
    document.addEventListener('visibilitychange',this._onVisibilityChange,{passive:true});

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

  loadPersistedState(){
    try{
      const raw=sessionStorage.getItem(this.persistKey);
      if(!raw)return null;
      const data=JSON.parse(raw);
      if(!data||data.version!==1)return null;
      if(Date.now()-Number(data.savedAt||0)>30*60*1000)return null;
      return data;
    }catch{
      return null;
    }
  }

  persistState(force=false){
    if(this.dead&&!force)return;
    if(!this.nodes?.length||this.w<=1||this.h<=1)return;
    try{
      const nodes={};
      for(const n of this.nodes){
        nodes[this.key(n.raw)]={nx:n.x/this.w,ny:n.y/this.h,vx:Number(n.vx||0),vy:Number(n.vy||0)};
      }
      const beacons=[];
      const now=Date.now();
      for(const [entityId,items] of this.activeBeacons){
        for(const item of items||[]){
          if(Number(item.expiresAt)>now){
            beacons.push({entityId:String(entityId),kind:item.kind==='sell'?'sell':'buy',expiresAt:Number(item.expiresAt)});
          }
        }
      }
      sessionStorage.setItem(this.persistKey,JSON.stringify({version:1,savedAt:now,nodes,beacons}));
    }catch{}
  }

  restorePersistedLayout(){
    if(this.didInitialRestore)return false;
    this.didInitialRestore=true;
    const saved=this.persisted?.nodes;
    if(!saved||typeof saved!=='object')return false;

    let restored=0;
    const missing=[];
    for(const n of this.nodes){
      const item=saved[this.key(n.raw)];
      if(item&&Number.isFinite(Number(item.nx))&&Number.isFinite(Number(item.ny))){
        n.x=Number(item.nx)*this.w;
        n.y=Number(item.ny)*this.h;
        n.vx=Number.isFinite(Number(item.vx))?Number(item.vx):0;
        n.vy=Number.isFinite(Number(item.vy))?Number(item.vy):0;
        this.keepNodeInside(n);
        restored++;
      }else missing.push(n);
    }
    if(!restored)return false;

    const usableH=Math.max(180,this.h-this.safe.top-this.safe.bottom);
    const spread=Math.max(82,Math.min(this.w*.31,usableH*.29,142));
    const golden=2.399963229728653;
    missing.forEach((n,i)=>{
      const jitter=((n.seed&1023)/1023)-.5;
      const angle=(restored+i)*golden+jitter*.64;
      const dist=Math.max(54,spread*.82);
      n.x=this.centerX+Math.cos(angle)*dist;
      n.y=this.centerY+Math.sin(angle)*dist*.84;
      n.vx=0;n.vy=0;
      this.keepNodeInside(n);
    });

    for(let i=0;i<8;i++)this.resolveCollisions(null);
    this.renderNodes();
    this.restorePersistedBeacons();
    this.schedule();
    return true;
  }

  restorePersistedBeacons(){
    const now=Date.now();
    const rows=Array.isArray(this.persisted?.beacons)?this.persisted.beacons:[];
    for(const row of rows){
      if(Number(row?.expiresAt)<=now)continue;
      this.mountBeacon(String(row.entityId||''),row.kind,Number(row.expiresAt),false);
    }
  }

  syncNodeVisual(node,raw,index){
    node.raw=raw;
    node.index=index;
    const el=node.el;
    if(!el)return;
    el.setAttribute('aria-label',raw?.name||raw?.x_handle||'Entity');
    const avatarUrl=String(raw?.avatar||'').trim();
    let img=el.querySelector('img');
    if(avatarUrl){
      if(!img){
        el.querySelector('.si-dom-node-fallback')?.remove();
        img=document.createElement('img');
        img.alt='';img.draggable=false;img.decoding='async';img.loading='eager';
        img.addEventListener('error',()=>{img.remove();this.ensureFallback(el,node.raw);});
        el.prepend(img);
      }
      if(img.getAttribute('src')!==avatarUrl)img.src=avatarUrl;
    }else{
      img?.remove();
      this.ensureFallback(el,raw);
    }
  }

  updateEntities(next=[]){
    const incoming=Array.isArray(next)?next:[];
    if(incoming.length!==this.nodes.length)return false;
    const byKey=new Map(this.nodes.map(n=>[this.key(n.raw),n]));
    const nextNodes=[];
    for(let i=0;i<incoming.length;i++){
      const raw=incoming[i];
      const node=byKey.get(this.key(raw));
      if(!node)return false;
      this.syncNodeVisual(node,raw,i);
      nextNodes.push(node);
    }
    this.entities=incoming;
    this.model={...(this.model||{}),entities:incoming};
    this.nodes=nextNodes;
    this.root.dataset.nodeCount=String(this.nodes.length);
    this.schedule();
    return true;
  }

  mountBeacon(entityId,kind='buy',expiresAt=Date.now()+60000,track=true){
    if(this.dead||!entityId)return false;
    const node=this.nodes.find(n=>String(n.raw?.id||'')===String(entityId));
    if(!node?.el)return false;
    const now=Date.now();
    if(expiresAt<=now)return false;

    const existing=[...node.el.querySelectorAll('.si-entity-beacon')];
    while(existing.length>=2)existing.shift()?.remove();

    const beacon=document.createElement('span');
    beacon.className=`si-entity-beacon ${kind==='sell'?'sell':'buy'}`;
    beacon.setAttribute('aria-hidden','true');
    node.el.appendChild(beacon);

    const remove=()=>{
      beacon.remove();
      const list=(this.activeBeacons.get(String(entityId))||[]).filter(x=>x.expiresAt!==expiresAt);
      if(list.length)this.activeBeacons.set(String(entityId),list);
      else this.activeBeacons.delete(String(entityId));
      this.persistState();
    };
    setTimeout(remove,Math.max(1,expiresAt-now));

    const key=String(entityId);
    const list=(this.activeBeacons.get(key)||[]).filter(x=>x.expiresAt>Date.now());
    if(track||!list.some(x=>x.expiresAt===expiresAt))list.push({kind:kind==='sell'?'sell':'buy',expiresAt});
    while(list.length>2)list.shift();
    this.activeBeacons.set(key,list);
    if(track)this.persistState();
    return true;
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
      if(this.restorePersistedLayout())return;
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
    const motionNow=Date.now();

    for(const n of this.nodes){
      if(this.drag?.node===n)continue;

      const wanderX=
        Math.sin(motionNow*.00021+n.phase)*.007+
        Math.cos(motionNow*.00013+n.phase2)*.004;
      const wanderY=
        Math.cos(motionNow*.00019+n.phase2)*.007+
        Math.sin(motionNow*.00011+n.phase)*.004;

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
    if(now-this.lastPersist>=this.persistEveryMs){
      this.lastPersist=now;
      this.persistState();
    }
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
    return this.mountBeacon(String(entityId||''),kind,Date.now()+60000,true);
  }

  setModel(model={}){
    const next=Array.isArray(model?.entities)?model.entities:[];
    if(this.updateEntities(next)){
      this.model=model||{};
      return;
    }
    this.persistState(true);
    this.model=model||{};
    this.entities=next;
    this.persisted=this.loadPersistedState();
    this.didInitialRestore=false;
    this.build();
    if(!this.restorePersistedLayout())this.fit();
  }

  destroy(){
    this.persistState(true);
    this.dead=true;

    if(this.raf)cancelAnimationFrame(this.raf);
    this.raf=0;

    this.ro?.disconnect();
    window.removeEventListener('resize',this._onWindowResize);
    window.visualViewport?.removeEventListener('resize',this._onViewportResize);
    window.removeEventListener('pagehide',this._onPageHide);
    document.removeEventListener('visibilitychange',this._onVisibilityChange);

    this.drag=null;
  }
}

function mountGlobalGraph(){
  const root=$('#globalMap');
  if(!root)return null;

  const model=globalEntityModel();
  updateMapCounts();

  const key=JSON.stringify(
    model.entities
      .map(e=>String(e.id||e.name||e.x_handle||e.xHandle||''))
      .sort()
  );

  const healthy=
    state.graph instanceof ShadowDomSwarm &&
    root.dataset.renderer==='dom-v207' &&
    root.dataset.rendererState==='ready' &&
    root.querySelectorAll('.si-dom-node').length===model.entities.length;

  if(healthy&&graphEntityKey===key){
    state.graph.updateEntities(model.entities);
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

/* SHADOW_ENTITY_PROFIT_V2413_APP */
function entityMetricMoney(e,key){
  if(!e?.profitKnown)return '—';
  const value=Number(e[key]);
  return Number.isFinite(value)?money(value):'—';
}
function entityMetricClass(e,key){
  if(!e?.profitKnown)return '';
  const value=Number(e[key]);
  return value>0?'pos':value<0?'neg':'';
}
function entityHandleHtml(e){
  const handle=String(e?.x_handle||e?.xHandle||'').trim();
  const name=String(e?.name||'').trim();
  if(!handle||handle.toLowerCase()===name.toLowerCase())return '';
  return `<p>${esc(handle)}</p>`;
}
function focusHtml(e){return`<div class="si-focus-main">${avatar(e,'lg')}<div><h3>${esc(e.name)}</h3>${entityHandleHtml(e)}</div></div><div class="si-metrics"><div class="si-metric"><strong class="${entityMetricClass(e,'profitUsd')}">${entityMetricMoney(e,'profitUsd')}</strong><small>Profit</small></div><div class="si-metric"><strong>${Number(e.performanceTokens||0)}</strong><small>Tokens</small></div><div class="si-metric"><strong class="${entityMetricClass(e,'avgProfitUsd')}">${entityMetricMoney(e,'avgProfitUsd')}</strong><small>Avg / Token</small></div></div>`}
/* SHADOW_ENTITY_PROFIT_V2413_APP_END */
function eventHtml(x){
  const type=String(x.type||'activity').toLowerCase(),sell=type.includes('sell')||type==='send',tr=type.includes('transfer')||type==='receive';
  const title=(x.title||type).replace(/^./,c=>c.toUpperCase());
  const titleHtml=x.tokenMint?pumpTokenLink({mint:x.tokenMint},title):`<strong>${esc(title)}</strong>`;
  return `<div class="si-event"><i class="si-event-dot ${sell?'sell':tr?'transfer':''}"></i><div>${titleHtml}<small>${esc(x.detail||x.symbol||x.tokenName||x.walletAddress||'Observed on-chain activity')}</small></div><time>${ago(x.createdAt||x.block_time)}</time></div>`;
}
function renderLive(items){$('#overviewLive').innerHTML=(items||[]).slice(0,8).map(eventHtml).join('')||'<div class="guest-note">Waiting for live activity.</div>'}
function renderEntitiesStrip(){const arr=state.entities.slice(0,4);$('#entityStrip').innerHTML=arr.map(e=>`<div class="si-entity-chip" data-open="${e.id}">${avatar(e,'sm')}<div><strong>${esc(e.name)}</strong><small>${esc(e.x_handle||'')} · ${e.walletCount||0} wallets</small></div></div>`).join('')||'<div class="guest-note">No tracked entities.</div>';$$('[data-open]',$('#entityStrip')).forEach(x=>x.onclick=()=>openObject('entity',{id:x.dataset.open}))}
function renderConnections(model){const pairs=[];model.tokens.slice(0,12).forEach(t=>pairs.push(`${t.symbol||t.name||'Token'} ↔ ${short(t.mint)}`));$('#connectionStrip').innerHTML=pairs.map(x=>`<span class="si-connection">${esc(x)}</span>`).join('')||'<span class="guest-note">Connections appear after wallet activity.</span>'}

/* SHADOW_ENTITIES_PROFIT_SORT_V2415 */
/* SHADOW_ENTITIES_OVERALL_RANK_V2421 */
function entityMetricPercentile(entity,key,{knownKey=''}={}){
  const population=Array.isArray(state.entities)?state.entities:[];
  const entityValue=Number(entity?.[key]);

  if(
    (knownKey && entity?.[knownKey]===false) ||
    !Number.isFinite(entityValue)
  ) return 50;

  const values=population
    .filter(row=>!(knownKey && row?.[knownKey]===false))
    .map(row=>Number(row?.[key]))
    .filter(Number.isFinite)
    .sort((a,b)=>a-b);

  if(values.length<=1)return 50;

  let below=0;
  let equal=0;
  for(const value of values){
    if(value<entityValue)below++;
    else if(value===entityValue)equal++;
  }

  return ((below + Math.max(0,equal-1)/2) / (values.length-1))*100;
}

function entityOverallScore(entity){
  const profit=entityMetricPercentile(entity,'profitUsd',{knownKey:'profitKnown'});
  const winRate=entityMetricPercentile(entity,'winRate',{knownKey:'winRateKnown'});
  const median=entityMetricPercentile(entity,'medianProfitUsd');
  const avg=entityMetricPercentile(entity,'avgProfitUsd');

  const raw=
    profit*.40+
    winRate*.30+
    median*.20+
    avg*.10;

  const closed=Math.max(0,Number(entity?.closedTokens||0));
  const reliability=Math.min(1,Math.sqrt(closed/12));
  const confidenceWeight=.5+(.5*reliability);
  const adjusted=50+((raw-50)*confidenceWeight);

  return Number(Math.max(0,Math.min(100,adjusted)).toFixed(2));
}

function entityProfitSort(a,b){
  const scoreDiff=entityOverallScore(b)-entityOverallScore(a);
  if(Math.abs(scoreDiff)>1e-9)return scoreDiff;

  const profitDiff=Number(b?.profitUsd||0)-Number(a?.profitUsd||0);
  if(Math.abs(profitDiff)>1e-9)return profitDiff;

  const winDiff=Number(b?.winRate||0)-Number(a?.winRate||0);
  if(Math.abs(winDiff)>1e-9)return winDiff;

  const medianDiff=Number(b?.medianProfitUsd||0)-Number(a?.medianProfitUsd||0);
  if(Math.abs(medianDiff)>1e-9)return medianDiff;

  return String(a?.name||'').localeCompare(String(b?.name||''));
}
/* SHADOW_ENTITIES_OVERALL_RANK_V2421_END */
/* SHADOW_ENTITIES_PROFIT_SORT_V2415_END */

/* SHADOW_ENTITIES_RANK_V2416 */
/* SHADOW_ENTITIES_CARD_INFO_V2417_APP */

/* SHADOW_ENTITIES_PODIUM_V2419_APP */
function entityPodiumClass(rank){
  const n=Number(rank||0);
  return n===1?'si-podium-gold':n===2?'si-podium-silver':n===3?'si-podium-bronze':'';
}
/* SHADOW_ENTITIES_PODIUM_V2419_APP_END */

/* SHADOW_ENTITY_PERFORMANCE_V2420_APP */
function entityWinRateText(e){
  if(!e?.winRateKnown||!Number.isFinite(Number(e?.winRate)))return '—';
  const value=Number(e.winRate);
  return `${value.toFixed(value%1?1:0)}%`;
}

function entityPerformanceMoney(value){
  const n=Number(value);
  return Number.isFinite(n)?money(n):'—';
}

function entityPerformanceMoneyClass(value){
  const n=Number(value);
  return !Number.isFinite(n)?'':n>0?'pos':n<0?'neg':'';
}

function entityPerformanceBreakdownHtml(e){
  return `<div class="si-entity-performance-breakdown">
    <div class="si-performance-counts">
      <div><strong>${Number(e?.wins||0)}</strong><small>Wins</small></div>
      <div><strong>${Number(e?.losses||0)}</strong><small>Losses</small></div>
      <div><strong>${Number(e?.openTokens||0)}</strong><small>Open</small></div>
      <div><strong>${Number(e?.flat||0)}</strong><small>Flat</small></div>
    </div>
    <div class="si-performance-money">
      <div>
        <span>Avg / Token</span>
        <strong class="${entityPerformanceMoneyClass(e?.avgProfitUsd)}">${entityPerformanceMoney(e?.avgProfitUsd)}</strong>
      </div>
      <div>
        <span>Median / Token</span>
        <strong class="${entityPerformanceMoneyClass(e?.medianProfitUsd)}">${entityPerformanceMoney(e?.medianProfitUsd)}</strong>
      </div>
    </div>
  </div>`;
}
/* SHADOW_ENTITY_PERFORMANCE_V2420_APP_END */

function entityCardMainWalletHtml(e){
  const address=String(e?.mainWalletAddress||'').trim();
  if(!address){
    return `<div class="si-entity-card-main-wallet" style="display:flex;align-items:center;gap:8px;min-width:0;opacity:.58">
      <span style="white-space:nowrap">Main Wallet</span>
      <span>-</span>
    </div>`;
  }

  return `<div class="si-entity-card-main-wallet" style="display:flex;align-items:center;gap:8px;min-width:0;opacity:.64">
    <span style="white-space:nowrap">Main Wallet</span>
    <span aria-hidden="true">·</span>
    ${walletAddressCopyHtml(address)}
  </div>`;
}

function entityCardCopyStatusHtml(e){
  const active=!!e?.copyTradingActive;
  return `<div class="si-entity-card-copy-status" style="display:flex;align-items:center;gap:7px;white-space:nowrap;opacity:${active?'1':'.58'}">
    <i class="si-copy-dot ${active?'live':''}" aria-hidden="true"></i>
    <span>Copy trade · ${active?'Active':'Off'}</span>
  </div>`;
}

function renderEntities(q=''){
  const query=(q||'').toLowerCase();

  const ranked=state.entities
    .slice()
    .sort(entityProfitSort)
    .map((e,index)=>({...e,entityRank:index+1}));

  const a=ranked.filter(e=>
    !query||[e.name,e.x_handle,e.notes,e.mainWalletAddress].join(' ').toLowerCase().includes(query)
  );

  $('#entitiesGrid').innerHTML=a.map(e=>`
    <article class="si-panel si-entity-card ${entityPodiumClass(e.entityRank)}" data-entity="${e.id}" style="position:relative">
      <span
        class="si-entity-rank"
        aria-label="Rank ${e.entityRank}"
        title="Overall performance rank"
        style="position:absolute;top:18px;right:18px;font-size:14px;font-weight:700;line-height:1;letter-spacing:.01em;opacity:.52;pointer-events:none"
      >#${e.entityRank}</span>

      <div class="si-card-top">
        ${avatar(e,'lg')}
        <div>
          <h3>${esc(e.name)}</h3>
          ${entityHandleHtml(e)}
        </div>
      </div>

      <div
        class="si-entity-card-meta"
        style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:12px 0 2px;font-size:13px"
      >
        ${entityCardMainWalletHtml(e)}
        ${entityCardCopyStatusHtml(e)}
      </div>

      <div class="si-card-stats">
        <div class="si-card-stat">
          <strong class="${entityMetricClass(e,'profitUsd')}">${entityMetricMoney(e,'profitUsd')}</strong>
          <small>Profit</small>
        </div>
        <div class="si-card-stat" title="${Number(e.wins||0)} wins · ${Number(e.losses||0)} losses · ${Number(e.flat||0)} flat">
          <strong>${entityWinRateText(e)}</strong>
          <small>Win Rate</small>
        </div>
        <div class="si-card-stat">
          <strong>${Number(e.performanceTokens||0)}</strong>
          <small>Tokens</small>
        </div>
      </div>
    </article>
  `).join('')||'<div class="guest-note">No entities found.</div>';

  $$('[data-entity]').forEach(x=>x.onclick=()=>openObject('entity',{id:x.dataset.entity}));
  bindWalletAddressCopy($('#entitiesGrid'));
}
/* SHADOW_ENTITIES_CARD_INFO_V2417_APP_END */
/* SHADOW_WALLETS_IN_ADMIN_V233_APP */
async function renderWalletInventory(targetSelector='#walletsAdminTable'){
  if(!['owner','admin'].includes(state.user?.role))return;

  const target=$(targetSelector);
  if(!target)return;

  try{
    const ds=await Promise.all(state.entities.map(e=>api(`/api/entities/${e.id}`)));
    const ws=ds.flatMap(d=>(d.wallets||[]).map(w=>({
      ...w,
      entityName:d.entity.name,
      xHandle:d.entity.x_handle
    })));

    const count=$('#adminWalletCount');
    if(count)count.textContent=`${ws.length} wallet${ws.length===1?'':'s'}`;

    target.innerHTML=`<table class="si-table">
      <thead>
        <tr>
          <th>Wallet</th>
          <th>Entity</th>
          <th>Status</th>
          <th>Last scan</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${ws.map(w=>`<tr>
          <td><strong>${short(w.address)}</strong><br><small>${esc(w.label||'Main wallet')}</small></td>
          <td>${esc(w.xHandle||w.entityName||'')}</td>
          <td>${esc(w.sync_status||'pending')}</td>
          <td>${w.last_scanned_at?ago(w.last_scanned_at)+' ago':'not scanned'}</td>
          <td><button class="si-button" data-admin-wallet-sync="${w.id}">Sync</button></td>
        </tr>`).join('')}
      </tbody>
    </table>`;

    target.querySelectorAll('[data-admin-wallet-sync]').forEach(button=>{
      button.onclick=async()=>{
        button.disabled=true;
        const original=button.textContent;
        button.textContent='Syncing...';
        try{
          const r=await api(`/api/wallets/${button.dataset.adminWalletSync}/sync`,{
            method:'POST',
            body:'{}'
          });
          toast(`Synced - ${r.newActivity||0} new`);
          await renderWalletInventory(targetSelector);
        }catch(error){
          toast(error.message);
          button.disabled=false;
          button.textContent=original;
        }
      };
    });
  }catch(error){
    target.innerHTML=`<div class="guest-note">${esc(error.message)}</div>`;
    toast(error.message);
  }
}

async function renderWallets(){
  return renderWalletInventory('#walletsAdminTable');
}
/* SHADOW_TOKEN_AVATAR_STABILITY_V2411_START */
const siTokenAvatarCache = new Map();

function siTokenAvatarKey(token){
  return String(token?.mint || token?.address || token?.tokenMint || '').trim();
}

function siFindDetailedToken(token){
  const mint = siTokenAvatarKey(token);
  if(!mint) return null;

  for(const value of state.details.values()){
    if(!value) continue;

    if(value?.token){
      const t = value.token;
      if(String(t?.mint || t?.address || t?.tokenMint || '').trim() === mint) return t;
    }

    const lists = [
      value?.tokens,
      value?.entity?.tokens,
      value?.holdings,
      value?.positions
    ];

    for(const list of lists){
      if(!Array.isArray(list)) continue;
      const hit = list.find(t =>
        String(t?.mint || t?.address || t?.tokenMint || '').trim() === mint
      );
      if(hit) return hit;
    }
  }

  return null;
}

function siStableTokenAvatarModel(token){
  const key = siTokenAvatarKey(token);
  const detailed = siFindDetailedToken(token);

  const currentSource = imageSource(token) || imageSource(detailed);

  if(currentSource && key){
    siTokenAvatarCache.set(key, currentSource);
  }

  const stableSource =
    currentSource ||
    (key ? siTokenAvatarCache.get(key) : '') ||
    '';

  return {
    ...(detailed || {}),
    ...(token || {}),
    avatar: stableSource,
    image: stableSource,
    imageUrl: stableSource,
    image_url: stableSource,
    imageURI: stableSource,
    image_uri: stableSource,
    icon: stableSource,
    iconUrl: stableSource,
    icon_url: stableSource,
    logo: stableSource,
    logoUrl: stableSource,
    logo_url: stableSource,
    logoURI: stableSource,
    logo_uri: stableSource,
    thumbnail: stableSource,
    thumb: stableSource,
    picture: stableSource,
    photo: stableSource
  };
}

function siTokenAvatarHtml(token){
  return avatar(siStableTokenAvatarModel(token),'md');
}
/* SHADOW_TOKEN_AVATAR_STABILITY_V2411_END */
/* SHADOW_TOKENS_JOINT_RANK_V269_START */
let tokenPeriod=(()=>{
  try{
    const saved=localStorage.getItem('si-token-period');
    if(['m1','m5','h1','h6','h24'].includes(saved))return saved;

    const legacy=localStorage.getItem('si-token-sort');
    if(['m1','m5','h1','h6','h24'].includes(legacy))return legacy;
    if(legacy==='top1h')return 'h1';

    return 'h1';
  }catch{
    return 'h1';
  }
})();

let tokenAgeDirection=(()=>{
  try{
    return localStorage.getItem('si-token-age-direction')==='oldest'
      ? 'oldest'
      : 'youngest';
  }catch{
    return 'youngest';
  }
})();

let tokenMcDirection=(()=>{
  try{
    return localStorage.getItem('si-token-mc-direction')==='asc'
      ? 'asc'
      : 'desc';
  }catch{
    return 'desc';
  }
})();

function tokenSortNumber(value,fallback=null){
  if(value==null||value==='')return fallback;
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
}

function tokenCreatedTimestamp(token){
  const raw=token?.token_created_at||token?.token_market_created_at||'';
  const value=Date.parse(raw);
  return Number.isFinite(value)?value:0;
}

function tokenAgeLabel(token){
  const created=tokenCreatedTimestamp(token);
  if(!created)return '—';

  const minutes=Math.max(0,Math.floor((Date.now()-created)/60000));
  if(minutes<1)return '<1m';
  if(minutes<60)return `${minutes}m`;

  const hours=Math.floor(minutes/60);
  if(hours<24)return `${hours}h`;

  const days=Math.floor(hours/24);
  if(days<30)return `${days}d`;

  const months=Math.floor(days/30);
  if(months<12)return `${months}mo`;

  return `${Math.floor(days/365)}y`;
}

function tokenChangeForPeriod(token,period=tokenPeriod){
  if(period==='m1')return token?.price_change_1m;
  if(period==='m5')return token?.price_change_5m;
  if(period==='h1')return token?.price_change_1h ?? token?.price_change;
  if(period==='h6')return token?.price_change_6h;
  if(period==='h24')return token?.price_change_24h;
  return token?.price_change_1h ?? token?.price_change;
}

function tokenRankKey(token,index){
  return String(token?.mint||token?.id||`row-${index}`);
}

function buildPercentileRanks(rows,valueGetter,direction='desc',validGetter=null){
  const ranked=[];

  rows.forEach((token,index)=>{
    const value=valueGetter(token);
    const valid=validGetter ? !!validGetter(value,token) : Number.isFinite(value);

    if(valid){
      ranked.push({
        key:tokenRankKey(token,index),
        value:Number(value),
        index
      });
    }
  });

  ranked.sort((a,b)=>{
    if(a.value===b.value)return a.index-b.index;
    return direction==='asc'
      ? a.value-b.value
      : b.value-a.value;
  });

  const scores=new Map();
  const n=ranked.length;

  if(!n)return scores;
  if(n===1){
    scores.set(ranked[0].key,1);
    return scores;
  }

  // Same raw value receives the same percentile score.
  let cursor=0;
  while(cursor<n){
    let end=cursor+1;
    while(end<n && ranked[end].value===ranked[cursor].value)end++;

    const mid=(cursor+(end-1))/2;
    const score=1-(mid/(n-1));

    for(let k=cursor;k<end;k++){
      scores.set(ranked[k].key,score);
    }

    cursor=end;
  }

  return scores;
}

function sortedTokenRows(rows){
  const out=[...(Array.isArray(rows)?rows:[])];

  /*
    TRUE JOINT SORT:
      1) selected period price-change rank
      2) Age rank
      3) MC rank

    All three are active at the same time with equal weight.
    This is intentionally NOT a tie-break chain.
  */

  const priceRanks=buildPercentileRanks(
    out,
    token=>tokenSortNumber(tokenChangeForPeriod(token),null),
    'desc',
    value=>Number.isFinite(value)
  );

  const ageRanks=buildPercentileRanks(
    out,
    token=>tokenCreatedTimestamp(token),
    tokenAgeDirection==='youngest'?'desc':'asc',
    value=>Number.isFinite(value)&&value>0
  );

  const mcRanks=buildPercentileRanks(
    out,
    token=>tokenSortNumber(token?.market_cap,null),
    tokenMcDirection==='desc'?'desc':'asc',
    value=>Number.isFinite(value)&&value>0
  );

  const scored=out.map((token,index)=>{
    const key=tokenRankKey(token,index);

    // Missing data gets 0 for that criterion rather than a fake favorable rank.
    const price=priceRanks.get(key)??0;
    const age=ageRanks.get(key)??0;
    const mc=mcRanks.get(key)??0;

    return {
      token,
      index,
      price,
      age,
      mc,
      total:(price+age+mc)/3
    };
  });

  scored.sort((a,b)=>
    b.total-a.total
    || b.price-a.price
    || b.age-a.age
    || b.mc-a.mc
    || a.index-b.index
  );

  return scored.map(row=>row.token);
}

function ensureTokenSortControls(){
  const grid=$('#tokensGrid');
  if(!grid)return;

  let wrap=$('#tokenSortWrap');
  if(!wrap){
    wrap=document.createElement('div');
    wrap.id='tokenSortWrap';
    wrap.className='si-token-sort-wrap';
    grid.before(wrap);
  }

  wrap.innerHTML=`
    <div class="si-token-sort" role="group" aria-label="Token joint sorting">
      <button type="button" data-token-period="m1">1M</button>
      <button type="button" data-token-period="m5">5M</button>
      <button type="button" data-token-period="h1">1H</button>
      <button type="button" data-token-period="h6">6H</button>
      <button type="button" data-token-period="h24">24H</button>
      <button type="button" data-token-age class="is-active">
        Age ${tokenAgeDirection==='youngest'?'↓':'↑'}
      </button>
      <button type="button" data-token-mc class="is-active">
        MC ${tokenMcDirection==='desc'?'↓':'↑'}
      </button>
    </div>`;

  wrap.querySelectorAll('[data-token-period]').forEach(button=>{
    const period=button.dataset.tokenPeriod;
    const active=period===tokenPeriod;

    button.classList.toggle('is-active',active);
    button.setAttribute('aria-pressed',active?'true':'false');

    button.onclick=()=>{
      tokenPeriod=period;

      try{
        localStorage.setItem('si-token-period',period);
      }catch{}

      renderTokens();
    };
  });

  const ageButton=wrap.querySelector('[data-token-age]');
  if(ageButton){
    ageButton.setAttribute('aria-pressed','true');

    ageButton.onclick=()=>{
      tokenAgeDirection=tokenAgeDirection==='youngest'
        ? 'oldest'
        : 'youngest';

      try{
        localStorage.setItem('si-token-age-direction',tokenAgeDirection);
      }catch{}

      renderTokens();
    };
  }

  const mcButton=wrap.querySelector('[data-token-mc]');
  if(mcButton){
    mcButton.setAttribute('aria-pressed','true');

    mcButton.onclick=()=>{
      tokenMcDirection=tokenMcDirection==='desc'
        ? 'asc'
        : 'desc';

      try{
        localStorage.setItem('si-token-mc-direction',tokenMcDirection);
      }catch{}

      renderTokens();
    };
  }
}

function renderTokens(){
  ensureTokenSortControls();

  const a=sortedTokenRows(state.tokens);

  $('#tokensGrid').innerHTML=a.map(t=>{
    const raw=tokenChangeForPeriod(t);
    const change=raw==null?null:Number(raw);
    const known=Number.isFinite(change);
    const changeClass=!known?'':change>=0?'pos':'neg';
    const changeText=!known
      ? '—'
      : `${change>=0?'+':''}${change.toFixed(1)}%`;

    return `<article class="si-panel si-token-card" data-token="${esc(t.mint)}">
      ${siTokenAvatarHtml(t)}
      <div>
        <span class="si-token-symbol">${pumpTokenLink(t,t.symbol||'TOKEN')}</span>
        <p>${esc(t.name||'Unknown')}<br><small>${short(t.mint)}</small></p>
        <small>${t.is_pump?'Pump.fun / PumpSwap':esc(t.dex_id||'Solana')} · Age ${tokenAgeLabel(t)} · MC ${money(t.market_cap||0)}</small>
      </div>
      <strong class="${changeClass}">${changeText}</strong>
    </article>`;
  }).join('')||'<div class="guest-note">Tokens appear after observed activity.</div>';

  $$('[data-token]').forEach(x=>x.onclick=event=>{
    if(event.target.closest('[data-pump-token-link]'))return;
    openObject('token',{mint:x.dataset.token});
  });

  ensureTokenSortControls();
}
/* SHADOW_TOKENS_JOINT_RANK_V269_END */
/* SHADOW_TOKENS_MARKET_REFRESH_V264_START */
let tokenMarketRefreshBusy=false;

async function refreshTokensMarketData(){
  const page=$('#page-tokens');
  if(
    document.hidden ||
    !page?.classList.contains('active-page') ||
    tokenMarketRefreshBusy
  )return;

  tokenMarketRefreshBusy=true;
  try{
    const data=await api('/api/tokens');
    if(Array.isArray(data?.items)){
      state.tokens=data.items;
      renderTokens();
    }
  }catch(error){
    console.debug('Tokens market refresh unavailable',error);
  }finally{
    tokenMarketRefreshBusy=false;
  }
}

setInterval(refreshTokensMarketData,65000);

document.addEventListener('visibilitychange',()=>{
  if(!document.hidden)refreshTokensMarketData();
});
/* SHADOW_TOKENS_MARKET_REFRESH_V264_END */

/* SHADOW_LIVE_AVATAR_STABILITY_V2410_START */
/*
 * Live Activity rows are event objects, not entity objects.
 * A refresh can therefore omit the avatar even though the tracked Entity
 * still has one. Resolve the row back to its Entity and remember the last
 * known-good image so the avatar does not blink/disappear between refreshes.
 */
const siLiveAvatarCache = new Map();

function siNormIdentity(value){
  return String(value ?? '').trim().toLowerCase().replace(/^@/,'');
}

function siLiveEventEntity(event){
  const rows = Array.isArray(state.entities) ? state.entities : [];
  if(!rows.length || !event) return null;

  const eventId = String(event.entityId ?? event.entity_id ?? '').trim();
  if(eventId){
    const hit = rows.find(e => String(e?.id ?? '').trim() === eventId);
    if(hit) return hit;
  }

  const names = [
    event.entityName,event.entity_name,event.entity,
    event.x_handle,event.xHandle,event.handle,event.username
  ].map(siNormIdentity).filter(Boolean);

  if(names.length){
    const hit = rows.find(e => {
      const entityNames = [
        e?.name,e?.displayName,e?.entityName,
        e?.x_handle,e?.xHandle,e?.handle,e?.username
      ].map(siNormIdentity).filter(Boolean);
      return names.some(n => entityNames.includes(n));
    });
    if(hit) return hit;
  }

  const wallet = siNormIdentity(
    event.walletAddress ?? event.wallet_address ?? event.wallet ?? event.address
  );
  if(wallet){
    const hit = rows.find(e => {
      const direct = [
        e?.walletAddress,e?.wallet_address,e?.wallet,e?.address
      ].map(siNormIdentity).filter(Boolean);
      const nested = Array.isArray(e?.wallets)
        ? e.wallets.flatMap(w => [
            w?.address,w?.walletAddress,w?.wallet_address,w?.wallet
          ].map(siNormIdentity).filter(Boolean))
        : [];
      return direct.includes(wallet) || nested.includes(wallet);
    });
    if(hit) return hit;
  }

  return null;
}

function siLiveAvatarKey(event, entity){
  return [
    entity?.id,
    event?.entityId,event?.entity_id,
    entity?.x_handle,entity?.xHandle,
    event?.entityName,event?.entity_name,
    event?.x_handle,event?.xHandle,
    event?.walletAddress,event?.wallet_address
  ].map(siNormIdentity).find(Boolean) || '';
}

function siLiveAvatarModel(event){
  const entity = siLiveEventEntity(event);
  const key = siLiveAvatarKey(event, entity);

  const currentSource = imageSource(event) || imageSource(entity);

  if(currentSource && key){
    siLiveAvatarCache.set(key, currentSource);
  }

  const stableSource = currentSource || (key ? siLiveAvatarCache.get(key) : '') || '';

  return {
    ...(entity || {}),
    ...(event || {}),
    avatar: stableSource,
    image: stableSource,
    imageUrl: stableSource,
    image_url: stableSource,
    profileImage: stableSource,
    profile_image: stableSource,
    name: event?.entityName || event?.entity_name || entity?.name || event?.name || 'Entity',
    x_handle: entity?.x_handle || entity?.xHandle || event?.x_handle || event?.xHandle || ''
  };
}

function siLiveAvatarHtml(event){
  return avatar(siLiveAvatarModel(event),'md');
}
/* SHADOW_LIVE_AVATAR_STABILITY_V2410_END */
function renderFeed(){
  const rows=state.overview?.feed||[];
  $('#fullFeed').innerHTML=rows.map(x=>{
    const title=x.title||x.type||'Activity';
    const titleHtml=x.tokenMint
      ? pumpTokenLink({mint:x.tokenMint},title)
      : `<strong>${esc(title)}</strong>`;
    return `<div class="si-feed-row">${siLiveAvatarHtml(x)}<div><h3>${titleHtml}</h3><p>${esc(x.detail||x.symbol||x.walletAddress||'')}</p><time>${esc(x.entityName||'Unknown')} · ${ago(x.createdAt)}</time></div><strong class="${Number(x.value)<0?'neg':'pos'}">${x.value!=null?(Number(x.value)>0?'+':'')+esc(x.value)+'%':''}</strong></div>`;
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

/* SHADOW_ENTITY_DETAIL_INFO_V2418 */
function entityGlobalRank(entityId){
  const id=String(entityId||'');
  const ranked=state.entities.slice().sort(entityProfitSort);
  const index=ranked.findIndex(e=>String(e?.id||'')===id);
  return index>=0?index+1:null;
}

function entityDetailRankHtml(e){
  const rank=entityGlobalRank(e?.id);
  return rank
    ? `<span class="si-entity-rank" aria-label="Rank ${rank}" title="Overall performance rank" style="position:absolute;top:24px;right:24px;font-size:18px;font-weight:700;line-height:1;opacity:.52;pointer-events:none">#${rank}</span>`
    : '';
}

function entityDetailMainWalletHtml(e,wallets=[]){
  const address=String(e?.mainWalletAddress||wallets?.[0]?.address||'').trim();
  return entityCardMainWalletHtml({...e,mainWalletAddress:address});
}

function entityDetailMetricsHtml(e){
  return `<div class="si-metrics">
    <div class="si-metric">
      <strong class="${entityMetricClass(e,'profitUsd')}">${entityMetricMoney(e,'profitUsd')}</strong>
      <small>Profit</small>
    </div>
    <div class="si-metric" title="${Number(e?.wins||0)} wins · ${Number(e?.losses||0)} losses · ${Number(e?.flat||0)} flat">
      <strong>${entityWinRateText(e)}</strong>
      <small>Win Rate</small>
    </div>
    <div class="si-metric">
      <strong>${Number(e?.performanceTokens||0)}</strong>
      <small>Tokens</small>
    </div>
  </div>`;
}
/* SHADOW_ENTITY_DETAIL_INFO_V2418_END */

function entityDetailLoading(e){
  const handle=e?.xHandle||e?.x_handle||'';

  modal(`<div class="si-detail-layout">
    <aside class="si-detail-side">
      <div class="si-panel si-entity-profile-panel ${entityPodiumClass(entityGlobalRank(e?.id))}" style="box-shadow:none;position:relative">
        ${entityDetailRankHtml(e)}
        <div class="si-entity-profile-avatar">${avatar(e,'xl')}</div>
        <h2>${esc(e?.name||'Entity')}</h2>
        ${handle?`<p>${esc(handle)}</p>`:''}

        <div style="margin-top:16px">
          ${entityDetailMainWalletHtml(e,[])}
        </div>

        <div style="margin-top:16px">
          ${entityDetailMetricsHtml(e)}
          ${entityPerformanceBreakdownHtml(e)}
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
      <div class="si-panel si-entity-profile-panel ${entityPodiumClass(entityGlobalRank(e?.id))}" style="box-shadow:none;position:relative">
        ${entityDetailRankHtml(e)}
        <div class="si-entity-profile-avatar">${avatar(e,'xl')}</div>
        <h2>${esc(e.name)}</h2>
        ${(e.xHandle||e.x_handle)?`<p>${esc(e.xHandle||e.x_handle||'')}</p>`:''}

        <div style="margin-top:16px">
          ${entityDetailMainWalletHtml(e,wallets)}
        </div>

        <div style="margin-top:16px">
          ${entityDetailMetricsHtml(e)}
          ${entityPerformanceBreakdownHtml(e)}
        </div>

        ${copyControlHtml(e.id)}

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
  bindWalletAddressCopy($('#modalBody')||document);
  hydrateEntityCopyControl(e.id);

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
async function loadSettings(){
  try{
    const s=await api('/api/settings');
    $('#setPlatformName').value=s.platform_name||'';
    $('#setRegistration').checked=s.registration_enabled==='true';
    $('#setChat').checked=s.community_chat_enabled==='true';
    $('#setCopy').checked=s.copy_trading_enabled==='true';
    $('#setRiskThreshold').value=s.risk_high_threshold||80;
    $('#setDemo').checked=s.demo_mode==='true';
    $('#setLiveMonitor').checked=s.live_monitor_enabled==='true';
    $('#setPollSeconds').value=s.live_poll_seconds||60;
    $('#setHistoryLimit').value=s.wallet_history_limit||30;
    $('#setXMonitor').checked=s.x_monitor_enabled==='true';

    const h=await api('/api/live/status');
    $('#providerStatus').textContent=`Solana: ${h.solana?.status||'unknown'} - ${h.solana?.provider||''} - X: ${h.x?.configured?'configured':'not configured'}`;

    await renderWalletInventory('#walletsAdminTable');
  }catch(e){
    toast(e.message);
  }
}
async function saveSettings(e){e.preventDefault();try{const b={platform_name:$('#setPlatformName').value,registration_enabled:$('#setRegistration').checked,community_chat_enabled:$('#setChat').checked,copy_trading_enabled:$('#setCopy').checked,risk_high_threshold:$('#setRiskThreshold').value,demo_mode:$('#setDemo').checked,live_monitor_enabled:$('#setLiveMonitor').checked,live_poll_seconds:$('#setPollSeconds').value,wallet_history_limit:$('#setHistoryLimit').value,x_monitor_enabled:$('#setXMonitor').checked};const s=await api('/api/settings',{method:'PATCH',body:JSON.stringify(b)});document.querySelectorAll('[data-platform-name]').forEach(x=>x.textContent=s.platform_name);toast('Settings saved')}catch(e){toast(e.message)}}
/* SHADOW_SEARCH_PAGE_V237_APP */
function searchMatches(q){
  const query=String(q||'').trim().toLowerCase();
  if(!query)return [];

  const rows=[];

  for(const e of state.entities||[]){
    const hay=[e.name,e.x_handle,e.xHandle,e.notes].filter(Boolean).join(' ').toLowerCase();
    if(hay.includes(query)){
      rows.push({
        kind:'entity',
        id:e.id,
        item:e,
        title:e.x_handle||e.xHandle||e.name||'Entity',
        subtitle:e.name||'Tracked entity',
        avatar:e
      });
    }
  }

  for(const t of state.tokens||[]){
    const hay=[t.symbol,t.name,t.mint,t.address].filter(Boolean).join(' ').toLowerCase();
    if(hay.includes(query)){
      rows.push({
        kind:'token',
        mint:t.mint,
        item:t,
        title:t.symbol||t.name||'Token',
        subtitle:t.name||short(t.mint||''),
        meta:short(t.mint||''),
        avatar:t
      });
    }
  }

  const seenWallets=new Set();
  for(const d of state.details.values()){
    for(const w of d?.wallets||[]){
      const address=String(w.address||'');
      if(!address || seenWallets.has(address))continue;
      seenWallets.add(address);
      const entity=d?.entity||{};
      const hay=[address,w.label,entity.name,entity.x_handle].filter(Boolean).join(' ').toLowerCase();
      if(hay.includes(query)){
        rows.push({
          kind:'wallet',
          item:w,
          title:short(address),
          subtitle:entity.x_handle||entity.name||w.label||'Tracked wallet',
          meta:'Wallet'
        });
      }
    }
  }

  return rows.slice(0,40);
}

function renderSearchPageResults(q=''){
  const root=$('#searchPageResults');
  if(!root)return;

  const query=String(q||'').trim();
  if(!query){
    root.innerHTML='<div class="si-search-empty">Start typing to search Shadow Intelligence.</div>';
    return;
  }

  const rows=searchMatches(query);
  if(!rows.length){
    root.innerHTML=`<div class="si-search-empty">No results for "${esc(query)}".</div>`;
    return;
  }

  root.innerHTML=rows.map((r,index)=>`
    <button type="button" class="si-search-result" data-search-result="${index}">
      ${r.avatar?avatar(r.avatar,'md'):'<span class="si-search-result-icon">Search</span>'}
      <span class="si-search-result-copy">
        <strong>${esc(r.title)}</strong>
        <small>${esc(r.subtitle||'')}</small>
      </span>
      <span class="si-search-result-meta">${esc(r.meta||r.kind)}</span>
    </button>
  `).join('');

  root.querySelectorAll('[data-search-result]').forEach(button=>{
    button.onclick=()=>{
      const row=rows[Number(button.dataset.searchResult)];
      if(!row)return;
      if(row.kind==='entity')return openObject('entity',{id:row.id});
      if(row.kind==='token')return openObject('token',{mint:row.mint});
      if(row.kind==='wallet')return openObject('wallet',row.item);
    };
  });
}

function openSearchPage(){
  nav('search');
  const input=$('#searchPageInput');
  if(!input)return;
  input.value='';
  renderSearchPageResults('');
  input.focus({preventScroll:true});
  try{input.setSelectionRange(0,0)}catch{}
}

function bindSearchPage(){
  const open=$('#openSearchPage');
  const input=$('#searchPageInput');
  const clear=$('#searchPageClear');

  if(open)open.onclick=openSearchPage;

  if(input){
    input.oninput=()=>renderSearchPageResults(input.value);
    input.onkeydown=e=>{
      if(e.key==='Escape'){
        e.preventDefault();
        backPage();
        return;
      }
      if(e.key==='Enter'){
        e.preventDefault();
        const first=$('#searchPageResults [data-search-result]');
        if(first)first.click();
      }
    };
  }

  if(clear)clear.onclick=()=>{
    if(!input)return;
    input.value='';
    renderSearchPageResults('');
    input.focus({preventScroll:true});
  };
}
/* SHADOW_SEARCH_PAGE_V237_APP_END */

function searchGlobal(q){
  const first=searchMatches(q)[0];
  if(!first)return toast('Nothing found');
  if(first.kind==='entity')return openObject('entity',{id:first.id});
  if(first.kind==='token')return openObject('token',{mint:first.mint});
  if(first.kind==='wallet')return openObject('wallet',first.item);
}
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
