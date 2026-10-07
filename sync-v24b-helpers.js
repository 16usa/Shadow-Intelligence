  /* SYNC_VAULT_HEADER_LIVE_V24B */
  function ensureVaultHeader(){
    var topbar=qs(".topbar");
    var menu=qs(".sync-menu");
    if(!topbar||!menu)return null;

    var box=qs("#vaultHeaderBalance");
    if(box)return box;

    var right=document.createElement("div");
    right.className="vault-header-right";

    box=document.createElement("div");
    box.id="vaultHeaderBalance";
    box.className="vault-header-balance";
    box.hidden=true;
    box.setAttribute("aria-label","Delegated vault balance");
    box.innerHTML='<span id="vaultHeaderAmount">0</span><small>SOL</small>';

    menu.parentNode.insertBefore(right,menu);
    right.appendChild(box);
    right.appendChild(menu);
    return box;
  }

  function formatVaultHeaderSol(value){
    var n=Number(value||0);
    if(!isFinite(n)||n<=0)return "0";
    if(n<0.001)return n.toFixed(6).replace(/0+$/,"").replace(/\.$/,"");
    if(n<1)return n.toFixed(4).replace(/0+$/,"").replace(/\.$/,"");
    if(n<100)return n.toFixed(3).replace(/0+$/,"").replace(/\.$/,"");
    return n.toFixed(2).replace(/0+$/,"").replace(/\.$/,"");
  }

  function extractVaultSol(data){
    var direct=[
      data&&data.vaultWsol,
      data&&data.vaultWsolSol,
      data&&data.vaultBalanceSol,
      data&&data.vaultSol,
      data&&data.amountSol,
      data&&data.balanceSol,
      data&&data.freeSol,
      data&&data.reclaimableSol,
      data&&data.reclaimable&&data.reclaimable.sol,
      data&&data.vault&&data.vault.wsol,
      data&&data.vault&&data.vault.balanceSol,
      data&&data.engine&&data.engine.vaultWsol,
      data&&data.engine&&data.engine.vaultBalanceSol
    ];
    for(var i=0;i<direct.length;i++){
      var n=Number(direct[i]);
      if(isFinite(n)&&n>=0)return n;
    }

    var assets=Array.isArray(data&&data.assets)?data.assets:[];
    var total=0,found=false;
    assets.forEach(function(asset){
      if(!asset)return;
      var isWsol=asset.isWsol===true ||
        String(asset.symbol||"").toUpperCase()==="WSOL" ||
        String(asset.mint||"")==="So11111111111111111111111111111111111111112";
      if(!isWsol)return;
      var n=Number(asset.uiAmount!=null?asset.uiAmount:
        asset.amountSol!=null?asset.amountSol:
        asset.balanceSol!=null?asset.balanceSol:asset.amount);
      if(isFinite(n)&&n>=0){total+=n;found=true}
    });
    return found?total:null;
  }

  function renderVaultHeaderBalance(value,visible){
    var box=ensureVaultHeader();
    if(!box)return;
    var amount=qs("#vaultHeaderAmount");
    if(!visible){
      box.hidden=true;
      return;
    }
    var n=Math.max(0,Number(value||0));
    amount.textContent=formatVaultHeaderSol(n);
    box.classList.toggle("is-zero",n<=0);
    box.hidden=false;
  }

  async function loadVaultHeaderBalance(){
    if(state.vaultHeaderBusy)return;
    if(document.visibilityState==="hidden")return;

    ensureVaultHeader();

    if(!state.user||!state.wallet||!roomReady()){
      state.vaultHeaderLast=null;
      renderVaultHeaderBalance(0,false);
      return;
    }

    state.vaultHeaderBusy=true;
    try{
      var base="/api/entities/"+encodeURIComponent(state.room.leader.id)+"/copy";
      var data=null;
      try{
        data=await api(base+"/reclaim",{method:"GET"});
      }catch(firstError){
        try{
          data=await api(base+"/execution",{method:"GET"});
        }catch(secondError){
          throw firstError;
        }
      }

      var total=extractVaultSol(data);
      if(total==null)throw new Error("Vault balance not present in response");

      state.vaultHeaderLast=total;
      renderVaultHeaderBalance(total,true);
    }catch(error){
      if(state.vaultHeaderLast!=null){
        renderVaultHeaderBalance(state.vaultHeaderLast,true);
      }else{
        renderVaultHeaderBalance(0,false);
      }
    }finally{
      state.vaultHeaderBusy=false;
    }
  }
  /* SYNC_VAULT_HEADER_LIVE_V24B_END */

