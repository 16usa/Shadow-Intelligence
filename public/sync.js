(function(){
  "use strict";

  var state={
    room:null,
    user:null,
    wallet:null,
    copy:null,
    execution:null,
    authorizationUrl:"",
    ownerConfig:null,
    busy:false
  };

  function qs(selector){return document.querySelector(selector)}
  function qsa(selector){return Array.prototype.slice.call(document.querySelectorAll(selector))}
  function esc(value){
    return String(value==null?"":value).replace(/[&<>"']/g,function(ch){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch];
    });
  }
  function short(value){
    var s=String(value||"");
    return s.length>12?s.slice(0,5)+"…"+s.slice(-5):s;
  }
  function fmtUsd(value){
    var n=Number(value||0);
    if(!isFinite(n)||n<=0)return "$0";
    if(n>=1e9)return "$"+(n/1e9).toFixed(n>=1e10?0:1)+"B";
    if(n>=1e6)return "$"+(n/1e6).toFixed(n>=1e7?0:1)+"M";
    if(n>=1e3)return "$"+(n/1e3).toFixed(n>=1e4?0:1)+"K";
    return "$"+Math.round(n).toLocaleString();
  }
  function ago(value){
    var t=Date.parse(value||"");
    if(!isFinite(t))return "";
    var s=Math.max(0,Math.floor((Date.now()-t)/1000));
    if(s<60)return s+"s ago";
    if(s<3600)return Math.floor(s/60)+"m ago";
    if(s<86400)return Math.floor(s/3600)+"h ago";
    return Math.floor(s/86400)+"d ago";
  }
  function toast(message){
    var el=qs("#toast");
    if(!el)return;
    el.textContent=String(message||"");
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer=setTimeout(function(){el.classList.remove("show")},2400);
  }
  async function api(url,opt){
    opt=opt||{};
    var headers=Object.assign({"content-type":"application/json"},opt.headers||{});
    var response=await fetch(url,Object.assign({},opt,{headers:headers,cache:"no-store"}));
    var data=await response.json().catch(function(){return {}});
    if(!response.ok)throw new Error(data.error||("HTTP "+response.status));
    return data;
  }

  function roomReady(){
    return !!(state.room&&state.room.configured&&state.room.enabled&&state.room.leader);
  }

  function renderHero(){
    var room=state.room||{};
    var live=roomReady();
    var roomState=qs("#roomState");
    roomState.classList.toggle("is-live",live);
    roomState.querySelector("span:last-child").textContent=live?"LIVE":"SETUP";

    qs("#walletCount").textContent=String(Number(room.counts&&room.counts.active||0));

    var card=qs("#leaderCard");
    var avatar=qs("#leaderAvatar");
    var name=qs("#leaderName");
    var wallet=qs("#leaderWallet");
    var status=qs("#leaderStatus");

    if(!live){
      card.classList.add("is-empty");
      avatar.innerHTML="S";
      name.textContent="Leader not configured";
      wallet.textContent="Owner setup required";
      status.textContent="OFFLINE";
      qs("#leaderLine").textContent="ONE LEADER · ONE SIGNAL";
      return;
    }

    card.classList.remove("is-empty");
    var leader=room.leader;
    if(leader.avatar){
      avatar.innerHTML='<img src="'+esc(leader.avatar)+'" alt="">';
    }else{
      avatar.textContent=(leader.name||"L").slice(0,1).toUpperCase();
    }
    name.textContent=leader.xHandle||leader.name||"Leader";
    wallet.textContent=short(leader.mainWallet&&leader.mainWallet.address||"");
    status.textContent="ONLINE";
    qs("#leaderLine").textContent="ONE LEADER · "+Number(room.counts&&room.counts.connected||0)+" CONNECTED";
  }

  function renderActivity(){
    var list=qs("#activityList");
    var rows=state.room&&Array.isArray(state.room.recent)?state.room.recent:[];
    if(!rows.length){
      list.innerHTML='<div class="empty-row">Waiting for leader activity.</div>';
      return;
    }
    list.innerHTML=rows.map(function(row){
      var side=row.side==="sell"?"sell":"buy";
      var token=String(row.symbol||row.tokenName||short(row.tokenMint)||"TOKEN").replace(/^\$/,"");
      var meta=[];
      if(Number(row.marketCap)>0)meta.push("MC "+fmtUsd(row.marketCap));
      if(Number(row.tradeUsd)>0)meta.push(fmtUsd(row.tradeUsd));
      if(row.eventAt)meta.push(ago(row.eventAt));
      return '<div class="activity-row '+side+'">'+
        '<span class="activity-dot"></span>'+
        '<div class="activity-copy"><strong>$'+esc(token)+'</strong><span>'+esc(meta.join(" · ")||"Confirmed signal")+'</span></div>'+
        '<span class="activity-side">'+(side==="sell"?"SELL":"BUY")+'</span>'+
      '</div>';
    }).join("");
  }

  function renderWallet(){
    var connected=!!state.wallet;
    qs("#guestActions").hidden=connected;
    qs("#walletBar").hidden=!connected;
    qs("#copyForm").hidden=!connected;
    if(connected)qs("#connectedWallet").textContent=short(state.wallet.address);
  }

  function currentSolUsd(){
    var n=Number(state.room&&state.room.solUsd||0);
    return isFinite(n)&&n>0?n:0;
  }

  function authorizationFromExecution(data){
    if(!data)return "";
    return String(
      data.executionWallet&&data.executionWallet.authorizationUrl||
      data.engine&&data.engine.authorizationUrl||
      data.engine&&data.engine.executionWallet&&data.engine.executionWallet.authorizationUrl||
      ""
    );
  }

  function hydrateCopyForm(){
    var sub=state.copy;
    var solUsd=currentSolUsd();
    if(sub&&solUsd>0){
      var amount=Math.max(1,Math.round(Number(sub.amountSol||0)*solUsd));
      var maxPos=Math.max(amount,Math.round(Number(sub.maxPositionSol||0)*solUsd));
      var daily=Math.max(amount,Math.round(Number(sub.maxDailySol||0)*solUsd));
      qs("#amountUsd").value=String(amount||50);
      qs("#maxPositionUsd").value=String(maxPos||150);
      qs("#dailyCapUsd").value=String(daily||500);
      qs("#minMc").value=String(Math.round(Number(sub.minMarketCapUsd||0)));
      qs("#maxMc").value=String(Math.round(Number(sub.maxMarketCapUsd||0)));
      qs("#copyBuys").checked=sub.copyBuys!==false;
      qs("#copySells").checked=sub.copySells!==false;
      qs("#slippagePercent").value=String(Math.max(.1,Number(sub.slippageBps||500)/100));
    }
    renderCopyState();
  }

  function renderCopyState(){
    var sub=state.copy;
    var active=!!(sub&&sub.enabled&&sub.engineState==="active");
    var pending=!!(sub&&!active&&sub.engineState&&sub.engineState!=="stopped"&&sub.engineState!=="draft");
    var badge=qs("#copyBadge");
    badge.classList.toggle("is-active",active);
    badge.textContent=active?"SYNCED":pending?"PENDING":"OFF";
    qs("#copyStateTitle").textContent=active?"Synced with leader":pending?"Authorization pending":"Ready to sync";
    qs("#startButton").textContent=active?"UPDATE SETTINGS":"START COPYING";
    qs("#stopButton").hidden=!sub||(!active&&!pending);
    qs("#authorizationBox").hidden=!state.authorizationUrl;
  }

  async function loadRoom(){
    try{
      state.room=await api("/api/public-copy-room/status");
      renderHero();
      renderActivity();
    }catch(error){
      toast(error.message);
    }
  }

  async function loadSession(){
    try{
      var me=await api("/api/me");
      state.user=me.user||null;
    }catch(error){
      state.user=null;
    }

    state.wallet=null;
    state.copy=null;
    state.execution=null;
    state.authorizationUrl="";

    if(state.user){
      try{
        var wallets=await api("/api/user-wallets");
        state.wallet=Array.isArray(wallets.items)?wallets.items[0]||null:null;
      }catch(error){}
    }

    renderWallet();

    if(state.wallet&&roomReady()){
      await loadCopyState();
    }else{
      renderCopyState();
    }

    if(state.user&&(state.user.role==="owner"||state.user.role==="admin")){
      await loadOwnerConfig();
    }else{
      qs("#ownerPanel").hidden=true;
    }
  }

  async function loadCopyState(){
    if(!state.wallet||!roomReady())return;
    try{
      var data=await api("/api/entities/"+encodeURIComponent(state.room.leader.id)+"/copy");
      state.copy=data.subscription||null;
    }catch(error){
      console.debug(error);
    }
    try{
      state.execution=await api("/api/entities/"+encodeURIComponent(state.room.leader.id)+"/copy/execution");
      state.authorizationUrl=authorizationFromExecution(state.execution);
    }catch(error){
      state.execution=null;
    }
    hydrateCopyForm();
  }

  function bytesToBase64(bytes){
    var binary="";
    var arr=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||[]);
    for(var i=0;i<arr.length;i++)binary+=String.fromCharCode(arr[i]);
    return btoa(binary);
  }

  function walletCandidates(){
    var rows=[];
    var phantom=window.phantom&&window.phantom.solana;
    if(phantom&&phantom.isPhantom)rows.push({name:"Phantom",key:"phantom",provider:phantom});
    var sf=(window.solflare&&window.solflare.solana)||window.solflare;
    if(sf&&(sf.isSolflare||sf.connect))rows.push({name:"Solflare",key:"solflare",provider:sf});
    if(window.solana&&window.solana.connect&&!rows.some(function(x){return x.provider===window.solana})){
      rows.push({name:window.solana.isPhantom?"Phantom":"Solana wallet",key:window.solana.isPhantom?"phantom":"solana",provider:window.solana});
    }
    return rows;
  }

  function mobileWalletUrl(kind){
    var target=encodeURIComponent(location.href);
    var ref=encodeURIComponent(location.origin);
    if(kind==="phantom")return "https://phantom.app/ul/browse/"+target+"?ref="+ref;
    if(kind==="solflare")return "https://solflare.com/ul/v1/browse/"+target+"?ref="+ref;
    return "";
  }

  function openWalletSheet(){
    var choices=qs("#walletChoices");
    var rows=walletCandidates();
    choices.innerHTML=rows.length?rows.map(function(row,index){
      return '<button class="primary-button" type="button" data-wallet-index="'+index+'">CONNECT '+esc(row.name.toUpperCase())+'</button>';
    }).join(""):'<div class="empty-row">No injected Solana wallet detected in this browser.</div>';
    qsa("[data-wallet-index]").forEach(function(button){
      button.onclick=function(){connectWallet(rows[Number(button.dataset.walletIndex)],button)};
    });
    qs("#walletSheet").hidden=false;
  }

  function closeWalletSheet(){qs("#walletSheet").hidden=true}

  async function connectWallet(candidate,button){
    if(!candidate||!candidate.provider)throw new Error("Wallet provider unavailable");
    if(button)button.disabled=true;
    try{
      var provider=candidate.provider;
      var result=await provider.connect();
      var publicKey=provider.publicKey||(result&&result.publicKey);
      var address=String(publicKey&&publicKey.toString?publicKey.toString():publicKey||"");
      if(!address)throw new Error("Wallet did not return a Solana address");
      if(!provider.signMessage)throw new Error("This wallet does not support message signing");

      var challenge=await api("/api/wallet-auth/challenge",{
        method:"POST",
        body:JSON.stringify({address:address})
      });
      var bytes=new TextEncoder().encode(challenge.message);
      var signed=await provider.signMessage(bytes,"utf8");
      var signature=signed&&signed.signature?signed.signature:signed;
      if(!signature)throw new Error("Wallet signature was not returned");

      await api("/api/wallet-auth/verify",{
        method:"POST",
        body:JSON.stringify({
          challengeId:challenge.challengeId,
          address:address,
          provider:candidate.key,
          signature:bytesToBase64(signature)
        })
      });

      closeWalletSheet();
      toast("Wallet connected");
      await loadSession();
    }catch(error){
      toast(error.message);
    }finally{
      if(button)button.disabled=false;
    }
  }

  async function disconnectWallet(){
    if(!state.wallet||state.busy)return;
    state.busy=true;
    try{
      await api("/api/user-wallets/"+encodeURIComponent(state.wallet.id),{method:"DELETE"});
      if(state.user&&String(state.user.email||"").endsWith("@wallet.shadow.local")){
        try{await api("/api/auth/logout",{method:"POST",body:"{}"})}catch(error){}
      }
      state.wallet=null;state.copy=null;state.execution=null;state.authorizationUrl="";
      renderWallet();renderCopyState();
      toast("Wallet disconnected");
    }catch(error){
      toast(error.message);
    }finally{
      state.busy=false;
    }
  }

  function copyPayload(enabled){
    var solUsd=currentSolUsd();
    if(!(solUsd>0))throw new Error("Live SOL price is unavailable. Try again.");
    var amountUsd=Math.max(1,Number(qs("#amountUsd").value||0));
    var maxPositionUsd=Math.max(amountUsd,Number(qs("#maxPositionUsd").value||0));
    var dailyCapUsd=Math.max(amountUsd,Number(qs("#dailyCapUsd").value||0));
    var minMc=Math.max(0,Number(qs("#minMc").value||0));
    var maxMc=Math.max(0,Number(qs("#maxMc").value||0));
    if(maxMc>0&&maxMc<minMc)throw new Error("Maximum MC must be greater than or equal to minimum MC");
    return {
      walletId:state.wallet.id,
      enabled:!!enabled,
      amountSol:amountUsd/solUsd,
      maxPositionSol:maxPositionUsd/solUsd,
      maxDailySol:dailyCapUsd/solUsd,
      slippageBps:Math.round(Math.max(.1,Math.min(30,Number(qs("#slippagePercent").value||5)))*100),
      minMarketCapUsd:minMc,
      maxMarketCapUsd:maxMc,
      copyBuys:qs("#copyBuys").checked,
      copySells:qs("#copySells").checked,
      sellPercent:100
    };
  }

  async function saveCopy(enabled){
    if(!state.wallet) return openWalletSheet();
    if(!roomReady()) return toast("Leader room is not configured yet");
    if(state.busy)return;
    state.busy=true;
    qs("#startButton").disabled=true;
    qs("#stopButton").disabled=true;
    try{
      var result=await api("/api/entities/"+encodeURIComponent(state.room.leader.id)+"/copy",{
        method:"PUT",
        body:JSON.stringify(copyPayload(enabled))
      });
      state.copy=result.subscription||state.copy;
      state.authorizationUrl=String(result.authorizationUrl||"");
      if(result.requiresAuthorization&&state.authorizationUrl){
        toast("Execution authorization required");
      }else if(state.copy&&state.copy.enabled){
        toast("Copy trading active");
      }else if(enabled){
        toast("Settings saved");
      }else{
        toast("Copy trading stopped");
      }
      await loadCopyState();
      await loadRoom();
    }catch(error){
      toast(error.message);
    }finally{
      state.busy=false;
      qs("#startButton").disabled=false;
      qs("#stopButton").disabled=false;
    }
  }

  async function loadOwnerConfig(){
    try{
      var data=await api("/api/public-copy-room/config");
      state.ownerConfig=data;
      var select=qs("#leaderSelect");
      var items=Array.isArray(data.entities)?data.entities:[];
      select.innerHTML='<option value="">Choose Entity</option>'+items.map(function(item){
        var label=(item.xHandle||item.name||item.id)+(item.mainWalletAddress?" · "+short(item.mainWalletAddress):" · no wallet");
        return '<option value="'+esc(item.id)+'">'+esc(label)+'</option>';
      }).join("");
      select.value=data.leaderEntityId||"";
      qs("#roomEnabled").checked=data.enabled!==false;
      qs("#ownerPanel").hidden=false;
    }catch(error){
      qs("#ownerPanel").hidden=true;
    }
  }

  async function saveOwnerConfig(){
    var button=qs("#saveRoomButton");
    button.disabled=true;
    try{
      await api("/api/public-copy-room/config",{
        method:"PUT",
        body:JSON.stringify({
          entityId:qs("#leaderSelect").value,
          enabled:qs("#roomEnabled").checked
        })
      });
      toast("Room saved");
      await loadRoom();
      await loadSession();
    }catch(error){
      toast(error.message);
    }finally{
      button.disabled=false;
    }
  }

  function bind(){
    qs("#connectButton").onclick=openWalletSheet;
    qs("#disconnectButton").onclick=disconnectWallet;
    qsa("[data-close-sheet]").forEach(function(button){button.onclick=closeWalletSheet});
    qs("#openPhantom").onclick=function(){location.href=mobileWalletUrl("phantom")};
    qs("#openSolflare").onclick=function(){location.href=mobileWalletUrl("solflare")};
    qsa("[data-amount]").forEach(function(button){
      button.onclick=function(){qs("#amountUsd").value=button.dataset.amount};
    });
    qs("#copyForm").onsubmit=function(event){event.preventDefault();saveCopy(true)};
    qs("#stopButton").onclick=function(){saveCopy(false)};
    qs("#authorizeButton").onclick=function(){
      if(state.authorizationUrl)location.href=state.authorizationUrl;
    };
    qs("#saveRoomButton").onclick=saveOwnerConfig;
  }

  async function boot(){
    bind();
    await loadRoom();
    await loadSession();
    setInterval(loadRoom,5000);
  }

  boot();
})();
