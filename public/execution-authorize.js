/* SHADOW_INTERNAL_COPY_ENGINE_V330_AUTH_UI */
(()=>{
  const $=s=>document.querySelector(s);const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const token=new URLSearchParams(location.search).get('token')||'';
  const api=async(url,o={})=>{const r=await fetch(url,{credentials:'include',headers:{accept:'application/json',...(o.body?{'content-type':'application/json'}:{})},...o});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d};
  const state=(t,cls='')=>{const old=$('.state');if(old){old.textContent=t;old.className=`state ${cls}`}};
  const provider=()=>window.phantom?.solana||window.solana||null;
  const b64=bytes=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s)};
  let details=null;
  async function load(){
    if(!token)throw new Error('Authorization token is missing');
    details=await api(`/api/copy-engine/authorization?token=${encodeURIComponent(token)}`);
    $('#details').innerHTML=`<div class="row"><small>Entity</small><b>${esc(details.entityName||details.entityId)}</b></div><div class="row"><small>Funding / identity wallet</small><b>${esc(details.fundingAddress)}</b></div><div class="row"><small>Execution Wallet</small><b>${esc(details.executionAddress)}</b></div><div class="row"><small>Copy source</small><b>Main Wallet · ${esc(details.mainWallet)}</b></div><div class="row"><small>Limits</small><b>${esc(details.amountSol)} SOL / trade · ${esc(details.maxPositionSol)} SOL max position · ${esc(details.maxDailySol)} SOL daily</b></div><div class="row"><small>Execution</small><b>${details.copyBuys?'BUY ':''}${details.copySells?'SELL ':''}· ${esc(details.slippageBps)} bps max slippage · SELL ${esc(details.sellPercent)}%</b></div><div class="state">Ready for one-time wallet signature.</div>`;
    $('#authorize').disabled=false;
  }
  $('#authorize').onclick=async()=>{
    const btn=$('#authorize');btn.disabled=true;
    try{
      const p=provider();if(!p?.connect||!p?.signMessage)throw new Error('Open this page inside Phantom or Solflare');
      const c=await p.connect();const address=String(c?.publicKey||p.publicKey||'');
      if(address!==details.fundingAddress)throw new Error(`Connect the verified funding wallet ${details.fundingAddress.slice(0,6)}…${details.fundingAddress.slice(-5)}`);
      const ch=await api('/api/copy-engine/authorization/challenge',{method:'POST',body:JSON.stringify({token})});
      const signed=await p.signMessage(new TextEncoder().encode(ch.message),'utf8');
      await api('/api/copy-engine/authorization/verify',{method:'POST',body:JSON.stringify({token,address,signature:b64(signed.signature||signed)})});
      state('24/7 authorization saved. Return to Shadow and fund the Execution Wallet.','ok');btn.textContent='Authorized';
    }catch(e){state(e.message,'err');btn.disabled=false}
  };
  $('#close').onclick=()=>{try{window.close()}catch{}history.back()};
  load().catch(e=>{state(e.message,'err')});
})();
