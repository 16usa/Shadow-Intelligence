/* SYNC_STOP_RECLAIM_V21B_UI */
(()=>{
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const qs=new URLSearchParams(location.search);
  const entity=String(qs.get('entity')||'');
  const api=async(url,opt={})=>{
    const r=await fetch(url,{credentials:'include',cache:'no-store',headers:{accept:'application/json','cache-control':'no-cache',...(opt.body?{'content-type':'application/json'}:{})},...opt});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);
    return d;
  };
  const status=(t,kind='')=>{$('#status').textContent=t;$('#status').className='status '+kind};
  function provider(){return window.phantom?.solana||(window.solflare?.solana||window.solflare)||window.solana||null}
  function sol(lamports){return (Number(lamports||0)/1e9).toFixed(6).replace(/0+$/,'').replace(/\.$/,'')+' SOL'}
  function short(v){v=String(v||'');return v.length>18?v.slice(0,8)+'…'+v.slice(-8):v}
  function render(d){
    if(!d.available){
      $('#details').innerHTML='<div class="row"><small>Status</small><b>No delegated vault found</b></div>';
      $('#actionBtn').disabled=true;status(d.message||'Nothing to return.','good');return;
    }
    const assets=Array.isArray(d.assets)?d.assets:[];
    const assetHtml=assets.length?assets.map(a=>'<div class="row"><small>'+(a.isWsol?'Vault WSOL':'Vault token')+'</small><b>'+esc(a.isWsol?(a.uiAmount+' SOL'):(a.uiAmount+' · '+short(a.mint)))+'</b></div>').join(''):'<div class="row"><small>Vault assets</small><b>0</b></div>';
    $('#details').innerHTML='<div class="row"><small>Owner wallet</small><b>'+esc(d.ownerAddress)+'</b></div><div class="row"><small>Delegated vault</small><b>'+esc(d.vaultAddress)+'</b></div>'+assetHtml+'<div class="row"><small>24/7 network reserve</small><b>'+esc(sol(d.reserveLamports))+'</b></div><div class="row"><small>Policy</small><b>'+(d.policyVerification?.status==='revoked_onchain'?'Revoked on-chain':d.policyVerification?.status==='active'?'Active on-chain':d.policyExists?'Exists — status unverified':'Not found')+'</b></div>';
    $('#actionBtn').disabled=true;
    const v=d.policyVerification||{};
    const failed=Array.isArray(v.failedFields)?v.failedFields:[];
    const info='Policy verification: '+String(v.status||'unverified')+(failed.length?' | Mismatch: '+failed.join(', '):'');
    const diagnostic=document.createElement('div');
    diagnostic.className='row';
    diagnostic.style.cssText='display:block;overflow-wrap:anywhere;white-space:normal';
    diagnostic.textContent='Last checked: '+new Date().toLocaleString()+' | Historical subscription: '+String(d.subscriptionId||'unknown')+' | Policy: '+String(d.policyAddress||'unknown')+' | '+info;
    $('#details').appendChild(diagnostic);
    status('SYNC_V62_READ_ONLY — '+info+'. No reclaim signing, session rebinding or trading activation is enabled.','bad');
  }
  // SYNC_V59_REFRESH: fresh, visible, read-only status check.
  let loading=false;
  async function load(){
    if(loading)return;
    if(!entity){status('Missing entity id.','bad');return}
    loading=true;
    const btn=$('#refreshBtn');
    btn.disabled=true;
    const oldText=btn.textContent;
    btn.textContent='Checking on-chain status…';
    status('Checking historical policy and vault via RPC…');
    try{
      const url='/api/entities/'+encodeURIComponent(entity)+'/copy/reclaim?refresh='+Date.now();
      render(await api(url));
    }catch(e){
      status('Refresh failed: '+String(e.message||e)+' | '+new Date().toLocaleString(),'bad');
      $('#actionBtn').disabled=true;
    }finally{
      loading=false;
      btn.disabled=false;
      btn.textContent=oldText;
    }
  }
  async function sign(){
    const p=provider();
    if(!p){status('Open this page inside Phantom or Solflare so the owner wallet can sign.','bad');return}
    $('#actionBtn').disabled=true;
    try{
      await p.connect();
      const prep=await api('/api/entities/'+encodeURIComponent(entity)+'/copy/reclaim/prepare',{method:'POST',body:'{}'});
      const txs=Array.isArray(prep.transactions)?prep.transactions:[];
      if(prep.alreadyComplete||!txs.length){
        const done=await api('/api/entities/'+encodeURIComponent(entity)+'/copy/reclaim/confirm',{method:'POST',body:JSON.stringify({signatures:[]})});
        const r=done.reserveRefund||{};
        status('Vault already empty. Policy/session state reconciled.'+(r.refundedLamports?' Reserve returned: '+sol(r.refundedLamports):''),'good');
        return;
      }
      if(!p.signAndSendTransaction)throw new Error('Connected wallet does not expose signAndSendTransaction');
      const web3=window.solanaWeb3;if(!web3?.Transaction)throw new Error('Wallet transaction codec is unavailable on this page');
      const signatures=[];
      for(let i=0;i<txs.length;i++){
        const item=txs[i];
        status(`Wallet confirmation ${i+1}/${txs.length}: ${item.label||'Return funds'}…`);
        const bytes=Uint8Array.from(atob(item.transaction),c=>c.charCodeAt(0));
        const tx=web3.Transaction.from(bytes);
        const sent=await p.signAndSendTransaction(tx);
        const signature=String(sent?.signature||sent||'');
        if(!signature)throw new Error('Wallet did not return a transaction signature');
        signatures.push(signature);
        status(`Submitted ${i+1}/${txs.length}: ${signature.slice(0,12)}…`);
      }
      status('Transactions submitted. Verifying vault and returning unused network reserve…');
      const result=await api('/api/entities/'+encodeURIComponent(entity)+'/copy/reclaim/confirm',{method:'POST',body:JSON.stringify({signatures})});
      const refund=result.reserveRefund||{};
      let msg='Vault assets returned and 24/7 policy revoked.';
      if(refund.ok&&Number(refund.refundedLamports)>0)msg+=' Network reserve returned: '+sol(refund.refundedLamports)+'.';
      else if(!refund.ok)msg+=' Vault funds are safe; reserve refund needs retry: '+String(refund.error||'unknown error');
      status(msg,'good');
      $('#actionBtn').textContent='FUNDS RETURNED';$('#actionBtn').disabled=true;
      setTimeout(()=>{location.href='/sync.html'},2200);
    }catch(e){status(e.message,'bad');$('#actionBtn').disabled=false}
  }
  // SYNC_V58_READ_ONLY: no signing action bound on the recovery diagnostics page.
  $('#actionBtn').disabled=true;
  $('#refreshBtn').addEventListener('click',load);
  load();
})();
