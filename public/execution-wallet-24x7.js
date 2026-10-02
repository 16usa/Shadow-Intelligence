/* SHADOW_DELEGATED_EXECUTION_UI_V340 */
(()=>{
  const $=(s,r=document)=>r.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const short=v=>{v=String(v||'');return v.length>14?`${v.slice(0,6)}…${v.slice(-5)}`:v||'—'};
  const api=async(url,options={})=>{const response=await fetch(url,{credentials:'include',headers:{accept:'application/json',...(options.body?{'content-type':'application/json'}:{})},...options});const data=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(data.error||`HTTP ${response.status}`),{data,status:response.status});return data};
  const notify=t=>{const toast=$('.toast,.si-toast,[data-toast]');if(toast){toast.textContent=t;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2600)}else console.info('[Shadow Delegated]',t)};
  let activeEntity='';let focusTimer=0;
  function statusModel(payload){
    const e=payload?.executionWallet||null,s=payload?.subscription||null;
    const auth=String(e?.authorizationState||'').toLowerCase(),engine=String(s?.engineState||'').toLowerCase();
    const armed=auth==='armed'&&!!e?.address&&s?.enabled===true;
    if(auth==='policy_active_executor_locked')return {label:'POLICY ACTIVE · EXECUTOR LOCKED',detail:'Owner-signed on-chain policy exists, but autonomous swap execution remains fail-closed until the audited executor is wired'};
    if(armed)return {label:'24/7 ACTIVE',cls:'is-live',detail:'Owner-signed on-chain delegation and audited autonomous execution are active'};
    if(auth==='delegated_program_required')return {label:'PROGRAM REQUIRED',detail:'Non-custodial policy program is not configured'};
    if(auth==='session_key_store_required')return {label:'SESSION STORE REQUIRED',detail:'Add SHADOW_SESSION_MASTER_KEY; this encrypts only scoped session keys, never user wallet keys'};
    if(auth==='mainnet_review_required')return {label:'MAINNET LOCKED',detail:'Public mainnet execution stays fail-closed until the delegated program is audited and explicitly approved'};
    if(auth==='authorization_required'||engine==='authorization_required')return {label:'AUTHORIZE 24/7',detail:'One owner-signed on-chain policy transaction required'};
    if(auth==='revocation_required')return {label:'REVOKE REQUIRED',detail:'Owner signature is required to revoke the on-chain session'};
    if(auth==='revoked'||engine==='stopped')return {label:'REVOKED',detail:'Delegated session is disabled'};
    if(auth==='error'||engine==='error')return {label:'ERROR',detail:e?.lastError||s?.lastError||'Delegated engine error'};
    return {label:'NOT ARMED',detail:'Create an owner-controlled delegated vault policy first'};
  }
  function panelHtml(payload){
    const e=payload?.executionWallet||null,s=payload?.subscription||null,st=statusModel(payload),main=payload?.mainWallet?.address||'',funding=payload?.fundingWallet?.address||s?.walletAddress||'';
    const auth=String(e?.authorizationState||'').toLowerCase();
    const armed=auth==='armed'&&!!e?.address&&s?.enabled===true;
    const policyActive=armed||auth==='policy_active_executor_locked';
    const authUrl=e?.authorizationUrl||'',revokeUrl=e?.revocationUrl||'';
    return `<section class="si-execution-wallet-panel" data-execution-panel><div class="si-execution-wallet-head"><strong>Delegated Execution Vault</strong><span class="si-execution-wallet-state ${st.cls||''}">${esc(st.label)}</span></div><div class="si-execution-wallet-grid"><div class="si-execution-wallet-cell"><small>Vault (no private key)</small><b title="${esc(e?.address||'')}">${esc(short(e?.address))}</b></div><div class="si-execution-wallet-cell"><small>Owner / funding wallet</small><b title="${esc(funding)}">${esc(short(funding))}</b></div><div class="si-execution-wallet-cell"><small>Copy source</small><b title="${esc(main)}">Main Wallet · ${esc(short(main))}</b></div><div class="si-execution-wallet-cell"><small>Mode</small><b>Non-custodial · delegated session</b></div></div><p class="si-execution-wallet-note">${esc(st.detail)}. Shadow never receives the owner's seed/private key. A scoped session key can act only inside the on-chain policy limits and can be revoked by the owner.</p><div class="si-execution-wallet-actions">${authUrl?'<button class="si-button primary" type="button" data-execution-authorize>Authorize 24/7 on-chain</button>':''}${e?.address?'<button class="si-button" type="button" data-execution-copy-address>Copy vault address</button>':''}<button class="si-button" type="button" data-execution-refresh>${armed?'Refresh policy':'Check / Create'}</button>${(revokeUrl||policyActive)?'<button class="si-button" type="button" data-execution-revoke style="color:#ff5c5c;border-color:rgba(255,75,75,.5)">Revoke 24/7 on-chain</button>':''}</div>${e?.lastError?`<div class="si-execution-wallet-error">${esc(e.lastError)}</div>`:''}<div class="si-execution-main-only">Main Wallet only · Linked Wallets remain intelligence-only and are never copy sources.</div></section>`;
  }
  async function load(entityId,{sync=false}={}){const url=`/api/entities/${encodeURIComponent(entityId)}/copy/execution${sync?'/refresh':''}`;return api(url,{method:sync?'POST':'GET',...(sync?{body:JSON.stringify({})}:{})})}
  async function render(modal,{sync=false}={}){const entityId=modal?.dataset?.executionEntity||'';if(!entityId)return;activeEntity=entityId;let holder=$('[data-execution-panel]',modal);if(!holder){holder=document.createElement('div');holder.className='si-execution-wallet-panel';holder.dataset.executionPanel='loading';holder.innerHTML='<div class="si-execution-wallet-head"><strong>Delegated Execution Vault</strong><span class="si-execution-wallet-state">LOADING</span></div>';const anchor=$('.si-wallet-summary',modal)||$('form',modal);if(anchor?.parentNode)anchor.insertAdjacentElement('afterend',holder);else modal.prepend(holder)}try{const payload=await load(entityId,{sync});const w=document.createElement('div');w.innerHTML=panelHtml(payload);holder.replaceWith(w.firstElementChild);bind(modal,payload);return payload}catch(error){holder=$('[data-execution-panel]',modal)||holder;if(holder)holder.innerHTML=`<div class="si-execution-wallet-head"><strong>Delegated Execution Vault</strong><span class="si-execution-wallet-state">ERROR</span></div><div class="si-execution-wallet-error">${esc(error.message)}</div><div class="si-execution-wallet-actions"><button class="si-button" type="button" data-execution-refresh>Retry</button></div>`;$('[data-execution-refresh]',modal)?.addEventListener('click',()=>render(modal,{sync:true}),{once:true})}}
  function bind(modal,payload){
    $('[data-execution-authorize]',modal)?.addEventListener('click',()=>{const u=payload?.executionWallet?.authorizationUrl;if(u)location.href=u});
    $('[data-execution-copy-address]',modal)?.addEventListener('click',async()=>{const a=payload?.executionWallet?.address||'';if(!a)return;try{await navigator.clipboard.writeText(a);notify('Delegated vault address copied')}catch{notify(a)}});
    $('[data-execution-refresh]',modal)?.addEventListener('click',async e=>{e.currentTarget.disabled=true;await render(modal,{sync:true})});
    $('[data-execution-revoke]',modal)?.addEventListener('click',async e=>{e.currentTarget.disabled=true;try{let u=payload?.executionWallet?.revocationUrl||'';if(!u){const r=await api(`/api/entities/${encodeURIComponent(activeEntity)}/copy/execution/revoke`,{method:'POST',body:JSON.stringify({})});u=r.revocationUrl||''}if(!u)throw new Error('Revocation transaction is not available');location.href=u}catch(error){notify(error.message);e.currentTarget.disabled=false}});
  }
  function scan(){const modal=$('.si-copy-modal[data-execution-entity]');if(modal&&!modal.dataset.executionEnhanced){modal.dataset.executionEnhanced='1';render(modal).catch(()=>{})}}
  new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('focus',()=>{clearTimeout(focusTimer);focusTimer=setTimeout(()=>{const modal=$('.si-copy-modal[data-execution-entity]');if(modal&&activeEntity)render(modal,{sync:true}).catch(()=>{})},450)});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan);else scan();
})();
