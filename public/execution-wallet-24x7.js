/* SHADOW_INTERNAL_COPY_ENGINE_V330_UI */
/* SHADOW_EXECUTION_WALLET_24X7_V320 */
(()=>{
  const $=(s,r=document)=>r.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const short=v=>{v=String(v||'');return v.length>14?`${v.slice(0,6)}…${v.slice(-5)}`:v||'—'};
  const api=async(url,options={})=>{
    const response=await fetch(url,{credentials:'include',headers:{accept:'application/json',...(options.body?{'content-type':'application/json'}:{})},...options});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(new Error(data.error||`HTTP ${response.status}`),{data,status:response.status});
    return data;
  };
  const notify=text=>{
    const toast=$('.toast,.si-toast,[data-toast]');
    if(toast){toast.textContent=text;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2600)}
    else console.info('[Shadow Execution]',text);
  };

  let activeEntity='';
  let focusTimer=0;

  function statusModel(payload){
    const execution=payload?.executionWallet||null;
    const sub=payload?.subscription||null;
    const engineState=String(sub?.engineState||'').toLowerCase();
    const authState=String(execution?.authorizationState||'').toLowerCase();
    const armed=authState==='armed'&&!!execution?.address&&sub?.enabled===true;
    if(armed)return {label:'24/7 ACTIVE',cls:'is-live',detail:'No confirmation per copied trade'};
    if(authState==='execution_wallet_required'||engineState==='execution_wallet_required')return {label:'EXECUTION WALLET REQUIRED',detail:'Engine must provision a dedicated wallet/vault'};
    if(authState==='authorization_required'||engineState==='authorization_required')return {label:'AUTHORIZE 24/7',detail:'One-time execution authorization required'};
    if(authState==='engine_key_required')return {label:'MASTER KEY REQUIRED',detail:'Add SHADOW_EXECUTION_MASTER_KEY in Replit Secrets'};
    if(authState==='funding_required')return {label:'FUND EXECUTION WALLET',detail:'Authorization is complete; fund the dedicated wallet to arm 24/7'};
    if(engineState==='engine_required'||!payload?.engineConfigured)return {label:'LIVE NOT ARMED',detail:'Copy execution engine is not configured'};
    if(engineState==='stopped'||authState==='revoked')return {label:'PAUSED',detail:'Automatic execution is stopped'};
    if(authState==='error'||engineState==='error')return {label:'ERROR',detail:execution?.lastError||sub?.lastError||'Execution engine error'};
    return {label:'NOT ARMED',detail:'Create/authorize the Execution Wallet first'};
  }

  function panelHtml(payload){
    const execution=payload?.executionWallet||null;
    const sub=payload?.subscription||null;
    const st=statusModel(payload);
    // SHADOW_EXECUTION_WALLET_24X7_V321_ARMED_SCOPE_FIX
    // Keep the render-time armed flag in the same scope where the button uses it.
    const armed=String(execution?.authorizationState||'').toLowerCase()==='armed'
      && !!execution?.address
      && sub?.enabled===true;
    const main=payload?.mainWallet?.address||'';
    const funding=payload?.fundingWallet?.address||sub?.walletAddress||'';
    const authUrl=execution?.authorizationUrl||'';
    const fundingUrl=execution?.fundingUrl||'';
    const canRemove=!!execution?.address||['armed','authorization_required','pending','error'].includes(String(execution?.authorizationState||''));
    return `<section class="si-execution-wallet-panel" data-execution-panel>
      <div class="si-execution-wallet-head"><strong>Execution Wallet</strong><span class="si-execution-wallet-state ${st.cls||''}">${esc(st.label)}</span></div>
      <div class="si-execution-wallet-grid">
        <div class="si-execution-wallet-cell"><small>Execution wallet</small><b title="${esc(execution?.address||'')}">${esc(short(execution?.address))}</b></div>
        <div class="si-execution-wallet-cell"><small>Funding / identity wallet</small><b title="${esc(funding)}">${esc(short(funding))}</b></div>
        <div class="si-execution-wallet-cell"><small>Copy source</small><b title="${esc(main)}">Main Wallet · ${esc(short(main))}</b></div>
        <div class="si-execution-wallet-cell"><small>Mode</small><b>${esc(execution?.kind||'Dedicated 24/7')}</b></div>
      </div>
      <p class="si-execution-wallet-note">${esc(st.detail)}. After 24/7 is armed, Shadow can mirror permitted trades through the dedicated Execution Wallet without asking you to approve every BUY/SELL.</p>
      <div class="si-execution-wallet-actions">
        ${authUrl?`<button class="si-button primary" type="button" data-execution-authorize>Authorize 24/7</button>`:''}
        ${execution?.address?`<button class="si-button" type="button" data-execution-copy-address>Copy wallet address</button>`:''}
        ${fundingUrl?`<button class="si-button" type="button" data-execution-fund>Fund Execution Wallet</button>`:''}
        <button class="si-button" type="button" data-execution-refresh>${armed?'Refresh status':'Check / Create'}</button>
        ${execution?.address?'<button class="si-button" type="button" data-execution-withdraw>Withdraw SOL</button>':''}
        ${canRemove?'<button class="si-button" type="button" data-execution-remove style="color:#ff5c5c;border-color:rgba(255,75,75,.5)">Pause 24/7</button>':''}
      </div>
      ${execution?.lastError?`<div class="si-execution-wallet-error">${esc(execution.lastError)}</div>`:''}
      <div class="si-execution-main-only">Main Wallet only · Linked Wallets remain intelligence-only and are never sent as copy sources.</div>
    </section>`;
  }

  async function load(entityId,{sync=false}={}){
    const url=`/api/entities/${encodeURIComponent(entityId)}/copy/execution${sync?'/refresh':''}`;
    return api(url,{method:sync?'POST':'GET',...(sync?{body:JSON.stringify({})}:{})});
  }

  async function render(modal,{sync=false}={}){
    const entityId=modal?.dataset?.executionEntity||'';
    if(!entityId)return;
    activeEntity=entityId;
    let holder=$('[data-execution-panel]',modal);
    if(!holder){
      holder=document.createElement('div');
      holder.dataset.executionPanel='loading';
      holder.className='si-execution-wallet-panel';
      holder.innerHTML='<div class="si-execution-wallet-head"><strong>Execution Wallet</strong><span class="si-execution-wallet-state">LOADING</span></div>';
      const anchor=$('.si-wallet-summary',modal)||$('form',modal);
      if(anchor?.parentNode)anchor.insertAdjacentElement('afterend',holder); else modal.prepend(holder);
    }
    try{
      const payload=await load(entityId,{sync});
      const wrapper=document.createElement('div');
      wrapper.innerHTML=panelHtml(payload);
      holder.replaceWith(wrapper.firstElementChild);
      bind(modal,payload);
      if(sync&&payload?.executionWallet?.authorizationState==='armed')notify('Execution Wallet is armed · 24/7 ACTIVE');
      return payload;
    }catch(error){
      holder=$('[data-execution-panel]',modal)||holder;
      if(holder)holder.innerHTML=`<div class="si-execution-wallet-head"><strong>Execution Wallet</strong><span class="si-execution-wallet-state">ERROR</span></div><div class="si-execution-wallet-error">${esc(error.message)}</div><div class="si-execution-wallet-actions"><button class="si-button" type="button" data-execution-refresh>Retry</button></div>`;
      $('[data-execution-refresh]',modal)?.addEventListener('click',()=>render(modal,{sync:true}),{once:true});
    }
  }

  function bind(modal,payload){
    $('[data-execution-copy-address]',modal)?.addEventListener('click',async()=>{const a=payload?.executionWallet?.address||'';if(!a)return;try{await navigator.clipboard.writeText(a);notify('Execution Wallet address copied')}catch{notify(a)}});
    $('[data-execution-withdraw]',modal)?.addEventListener('click',async e=>{if(!confirm('Withdraw available SOL from the Execution Wallet back to the verified funding wallet?'))return;e.currentTarget.disabled=true;try{const r=await api(`/api/entities/${encodeURIComponent(activeEntity)}/copy/execution/withdraw-sol`,{method:'POST',body:JSON.stringify({confirm:true})});notify(`Withdrawal submitted ${String(r.signature||'').slice(0,8)}…`);await render(modal,{sync:true})}catch(error){notify(error.message);e.currentTarget.disabled=false}});
    $('[data-execution-authorize]',modal)?.addEventListener('click',()=>{
      const url=payload?.executionWallet?.authorizationUrl;
      if(url)window.open(url,'_blank','noopener,noreferrer');
    });
    $('[data-execution-fund]',modal)?.addEventListener('click',()=>{
      const url=payload?.executionWallet?.fundingUrl;
      if(url)window.open(url,'_blank','noopener,noreferrer');
    });
    $('[data-execution-refresh]',modal)?.addEventListener('click',async e=>{
      e.currentTarget.disabled=true;
      await render(modal,{sync:true});
    });
    $('[data-execution-remove]',modal)?.addEventListener('click',async e=>{
      if(!confirm('Remove Execution Wallet and stop 24/7 copy trading?'))return;
      e.currentTarget.disabled=true;
      try{
        await api(`/api/entities/${encodeURIComponent(activeEntity)}/copy/execution/revoke`,{method:'POST',body:JSON.stringify({})});
        notify('Execution Wallet removed and 24/7 stopped');
        await render(modal,{sync:false});
      }catch(error){
        notify(error.message);
        e.currentTarget.disabled=false;
      }
    });
  }

  function scan(){
    const modal=$('.si-copy-modal[data-execution-entity]');
    if(modal&&!modal.dataset.executionEnhanced){
      modal.dataset.executionEnhanced='1';
      render(modal).catch(()=>{});
    }
  }
  new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('focus',()=>{
    clearTimeout(focusTimer);
    focusTimer=setTimeout(()=>{
      const modal=$('.si-copy-modal[data-execution-entity]');
      if(modal&&activeEntity)render(modal,{sync:true}).catch(()=>{});
    },450);
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan);else scan();
})();
