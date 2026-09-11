(() => {
  'use strict';

  const ROOT_ID = 'walletNetwork';
  const POLL_MS = 2500;
  const TOKEN_REFRESH_MS = 15000;
  const MAX_WALLETS = 12;
  const MAX_TOKENS = 16;
  const MAX_ACTIVITY = 220;
  const WSOL = 'So11111111111111111111111111111111111111112';
  const state = { entity:null, wallets:[], tokens:[], activities:[], solUsd:0, seen:new Set(), initialized:false, pulses:[], timer:null, tokenAt:0, busy:false, lastModelKey:'' };

  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
  const abs = v => Math.abs(num(v));
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const short = (v,n=5) => { const s=String(v||''); return s.length>n*2 ? `${s.slice(0,n)}…${s.slice(-n)}` : s; };
  const money = (v,sign=true) => { const n=num(v), a=Math.abs(n), p=n<0?'-':(sign&&n>0?'+':''); if(a>=1e6)return `${p}$${(a/1e6).toFixed(2)}M`; if(a>=1e3)return `${p}$${(a/1e3).toFixed(a>=1e5?0:1)}K`; return `${p}$${a.toFixed(a<10?2:0)}`; };
  const pct = v => `${num(v)>=0?'+':''}${num(v).toFixed(2)}%`;

  async function api(url){ const r=await fetch(url,{cache:'no-store'}); const d=await r.json().catch(()=>({})); if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`); return d; }

  function root(){ return $(`#${ROOT_ID}`); }
  function currentTheme(){ return document.documentElement.dataset.theme==='dark' ? 'dark' : 'light'; }
  function tokenKey(t){ return t?.mint || t?.id || t?.symbol || ''; }

  async function loadTokens(){
    if(Date.now()-state.tokenAt<TOKEN_REFRESH_MS && state.tokens.length)return;
    try{
      const d=await api('/api/tokens'); state.tokens=d.items||[]; state.tokenAt=Date.now();
      const sol=state.tokens.find(t=>t.mint===WSOL);
      if(sol?.price_usd)state.solUsd=num(sol.price_usd);
    }catch{}
  }

  async function loadSolBalances(wallets){
    if(!state.solUsd||!wallets?.length)return new Map();
    const out=new Map();
    await Promise.all(wallets.map(async w=>{
      try{
        const r=await fetch('https://api.mainnet-beta.solana.com',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getBalance',params:[w.address,{commitment:'confirmed'}]})});
        const d=await r.json(); out.set(w.id,num(d?.result?.value)/1e9);
      }catch{}
    }));
    return out;
  }

  function activityRows(rows){
    return (rows||[]).map(a=>({...a, key:a.id||`${a.signature}:${a.mint}:${a.type}:${a.block_time}`})).sort((a,b)=>new Date(a.block_time)-new Date(b.block_time));
  }

  async function loadModel(){
    const overview=await api('/api/overview');
    const entity=overview.selected;
    if(!entity)return {entity:null,wallets:[],activities:[],tokens:state.tokens};
    const wallets=(overview.selectedWallets||[]).slice(0,MAX_WALLETS);
    const packs=await Promise.all(wallets.map(async w=>{
      try{ const d=await api(`/api/wallets/${encodeURIComponent(w.id)}/activity?limit=${MAX_ACTIVITY}`); return {wallet:w,rows:activityRows(d.items||[])}; }
      catch{ return {wallet:w,rows:[]}; }
    }));
    const activities=packs.flatMap(x=>x.rows.map(a=>({...a,wallet:x.wallet}))).sort((a,b)=>new Date(a.block_time)-new Date(b.block_time));
    return {entity,wallets,activities,tokens:state.tokens};
  }

  function tokenStats(activities,tokens){
    const map=new Map(tokens.map(t=>[t.mint,t]));
    const stats=new Map();
    for(const a of activities){
      const mint=a.mint; if(!mint)continue;
      const s=stats.get(mint)||{mint,buys:0,sells:0,buySol:0,sellSol:0,position:0,received:0,sent:0,lastAt:a.block_time};
      const ta=abs(a.token_amount), sol=abs(a.sol_amount);
      if(a.type==='buy'||a.type==='swap'){s.buys+=ta;s.buySol+=sol;s.position+=ta;}
      else if(a.type==='sell'){s.sells+=ta;s.sellSol+=sol;s.position-=ta;}
      else if(a.type==='receive'){s.received+=ta;s.position+=ta;}
      else if(a.type==='send'){s.sent+=ta;s.position-=ta;}
      if(new Date(a.block_time)>new Date(s.lastAt))s.lastAt=a.block_time;
      stats.set(mint,s);
    }
    return [...stats.values()].map(s=>{
      const t=map.get(s.mint)||{};
      const buy=s.buySol, sell=s.sellSol, currentPrice=num(t.price_usd);
      const matched=Math.min(s.buys,s.sells), avgBuy=s.buys>0?buy/s.buys:0;
      const realized=(s.sells>0?s.sellSol*(matched/s.sells):0)-(matched*avgBuy);
      const remaining=Math.max(0,s.buys-matched);
      const unrealized=remaining*currentPrice-(remaining*avgBuy*state.solUsd);
      const known=state.solUsd>0 && buy>0 && s.buys>0 && (remaining===0 || currentPrice>0);
      const pnl=known?(realized*state.solUsd+unrealized):null;
      const basis=known?buy*state.solUsd:null;
      return {...s,token:t,position:Math.max(0,s.position),pnlKnown:known,pnlUsd:pnl,pnlPercent:known&&basis>0?(pnl/basis)*100:null,currentValue:Math.max(0,s.position)*currentPrice};
    }).filter(s=>s.buys||s.sells||s.received||s.sent).sort((a,b)=>new Date(b.lastAt)-new Date(a.lastAt));
  }

  function walletStats(wallet,activities,tokens,solBalance=0){
    const ts=tokenStats(activities.filter(a=>a.wallet_id===wallet.id),tokens);
    let buySol=0,sellSol=0,transferIn=0,transferOut=0;
    for(const a of activities.filter(x=>x.wallet_id===wallet.id)){
      if(a.type==='buy'||a.type==='swap')buySol+=abs(a.sol_amount);
      else if(a.type==='sell')sellSol+=abs(a.sol_amount);
      else if(a.type==='receive')transferIn+=abs(a.sol_amount);
      else if(a.type==='send')transferOut+=abs(a.sol_amount);
    }
    const tokenValue=ts.reduce((sum,t)=>sum+t.currentValue,0);
    const realized=(sellSol-buySol)*state.solUsd;
    const unrealized=ts.reduce((sum,t)=>sum+(t.pnlKnown?num(t.pnlUsd)-((t.sells>0?t.sellSol*(Math.min(t.buys,t.sells)/t.sells):0)-(Math.min(t.buys,t.sells)*(t.buys>0?t.buySol/t.buys:0)))*state.solUsd:0),0);
    const pnl=realized+unrealized;
    const netSol=transferIn+sellSol-transferOut-buySol;
    return {ts,buySol,sellSol,transferIn,transferOut,tokenValue,trackedSolValue:Math.max(0,netSol)*state.solUsd,pnl,trackedValue:tokenValue+Math.max(0,netSol)*state.solUsd,inflow:(transferIn+sellSol)*state.solUsd,outflow:(transferOut+buySol)*state.solUsd};
  }

  function makeLayout(w,h,wallets,tokens){
    const small=w<650;
    const center={x:w*.5,y:h*.51,r:small?38:50};
    const usableTop=72, usableBottom=h-78;
    const placed=[];
    const minGap=small?10:14;
    const radii={wallet:small?25:31,token:small?29:36};
    const candidates=(kind,count)=>{
      const left=kind==='wallet', sideW=w*.43;
      const x0=left?w*.12:w*.88, x1=left?w*.42:w*.58;
      const cols=count<=5?1:count<=10?2:3;
      const rows=Math.ceil(count/cols);
      const out=[];
      for(let c=0;c<cols;c++)for(let r=0;r<rows;r++){
        const x=cols===1?x0:x0+(x1-x0)*(c/(cols-1));
        const y=rows===1?(usableTop+usableBottom)/2:usableTop+(usableBottom-usableTop)*(r/(rows-1));
        out.push({x,y});
      }
      return out;
    };
    function place(list,kind){
      const r=radii[kind], cand=candidates(kind,list.length), out=[];
      for(const item of list){
        let best=null,bestScore=Infinity;
        for(const c of cand){
          let score=0; const dCenter=Math.hypot(c.x-center.x,c.y-center.y); score+=Math.max(0,center.r+r+minGap-dCenter)*100;
          for(const p of [...placed,...out]){ const d=Math.hypot(c.x-p.x,c.y-p.y); score+=Math.max(0,r+(p.r||r)+minGap-d)*140; }
          if(score<bestScore){bestScore=score;best=c;}
        }
        const p={...best,r,kind,item}; placed.push(p);out.push(p);
      }
      return out;
    }
    const walletNodes=place(wallets,'wallet');
    const tokenNodes=place(tokens,'token');
    return {center,walletNodes,tokenNodes,width:w,height:h};
  }

  function eventFor(a){
    const side=a.type==='sell'||a.type==='receive'?'sell':'buy';
    const token=a.mint; const usd=state.solUsd>0?abs(a.sol_amount)*state.solUsd:0;
    return {key:a.key,side,mint:token,walletId:a.wallet_id,amount:usd||abs(a.sol_amount),symbol:a.token_symbol||'',at:Date.now(),life:0};
  }

  function drawNetwork(model){
    const r=root(); if(!r)return;
    if(!model.entity){r.innerHTML='<div class="si-net-empty">Add a tracked entity and wallet to build the live network.</div>';return;}
    r.innerHTML=`<div class="si-live-network"><canvas aria-label="Live BubbleMaps-style wallet network"></canvas><div class="si-net-hud"><span><i class="entity"></i>ENTITY</span><span><i class="wallet"></i>WALLETS ${model.wallets.length}</span><span><i class="token"></i>TOKENS ${model.tokens.length}</span><b>LIVE</b></div><div class="si-net-help">Auto-fit · no overlap · live buy/sell impulses</div></div>`;
    const wrap=r.querySelector('.si-live-network'),canvas=wrap.querySelector('canvas'),ctx=canvas.getContext('2d');
    const dpr=Math.min(window.devicePixelRatio||1,2); const rect=()=>wrap.getBoundingClientRect();
    let layout, width=1,height=1,raf=0,dead=false,lastTs=performance.now();
    const images=new Map();
    const solBalancesPromise=loadSolBalances(model.wallets);
    const tokenRows=tokenStats(model.activities,model.tokens).slice(0,MAX_TOKENS);
    const tokenMap=new Map(tokenRows.map(t=>[t.mint,t]));
    const walletRows=model.wallets.map(w=>({...w,stats:walletStats(w,model.activities,model.tokens,0)}));
    const walletMap=new Map(walletRows.map(w=>[w.id,w]));
    const tokens=tokenRows.map(s=>({...s, ...(s.token||{}), __stats:s}));
    const allMints=new Set(tokens.map(t=>t.mint));
    for(const n of [...model.wallets,model.entity,...tokens]){ const src=n.avatar||n.image; if(src){const im=new Image();im.onload=()=>schedule();im.src=src;images.set(n.id||n.mint||n.address,im);} }

    function resize(){ const q=rect();width=Math.max(280,Math.round(q.width));height=Math.max(430,Math.round(q.height));canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);canvas.style.width=width+'px';canvas.style.height=height+'px';ctx.setTransform(dpr,0,0,dpr,0,0);layout=makeLayout(width,height,walletRows,tokens);schedule(); }
    function color(kind){return kind==='entity'?'#1d9bf0':kind==='wallet'?'#657786':'#00ba7c';}
    function line(a,b,kind,alpha=.35){ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=color(kind);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.restore();}
    function drawAvatar(n,x,y,r,kind){
      const dark=currentTheme()==='dark', c=color(kind), im=images.get(n.id||n.mint||n.address);
      ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.clip();
      ctx.fillStyle=dark?'#111820':'#eef3f5';ctx.fill();
      if(im?.complete&&im.naturalWidth)ctx.drawImage(im,x-r,y-r,r*2,r*2);
      else {ctx.fillStyle=c;ctx.beginPath();ctx.arc(x,y,r*.55,0,Math.PI*2);ctx.fill();}
      const g=ctx.createRadialGradient(x-r*.35,y-r*.45,r*.1,x,y,r);g.addColorStop(0,'rgba(255,255,255,.28)');g.addColorStop(1,'rgba(0,0,0,.18)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);ctx.restore();
      ctx.strokeStyle=c;ctx.lineWidth=kind==='entity'?2.4:1.4;ctx.beginPath();ctx.arc(x,y,r+2,0,Math.PI*2);ctx.stroke();
    }
    function label(text,x,y,size=10,weight=650,fill=null){ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`${weight} ${size}px Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;ctx.fillStyle=fill|| (currentTheme()==='dark'?'#e7e9ea':'#0f1419');ctx.fillText(String(text),x,y);ctx.restore();}
    function drawPill(text,x,y,fill){const w=Math.max(40,ctx.measureText(text).width+14);ctx.save();ctx.font='700 9px Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=fill;ctx.globalAlpha=.95;ctx.beginPath();ctx.roundRect(x-w/2,y-10,w,20,10);ctx.fill();ctx.fillStyle='#fff';ctx.fillText(text,x,y);ctx.restore();}
    function draw(){
      raf=0;if(dead)return;const now=performance.now();const dt=Math.min(60,now-lastTs);lastTs=now;
      ctx.clearRect(0,0,width,height);
      const dark=currentTheme()==='dark';ctx.fillStyle=dark?'#050607':'#fbfcfd';ctx.fillRect(0,0,width,height);
      // soft field dots, fixed so the graph reads as one flat plane
      for(let i=0;i<34;i++){const x=(i*97%100)/100*width,y=(i*53%100)/100*height;ctx.fillStyle=dark?'rgba(29,155,240,.045)':'rgba(29,155,240,.035)';ctx.beginPath();ctx.arc(x,y,1.5,0,Math.PI*2);ctx.fill();}
      const center=layout.center;
      for(const w of layout.walletNodes)line(center,w,'wallet',.24);
      const walletNodeById=new Map(layout.walletNodes.map(n=>[n.item.id,n]));
      const tokenNodeByMint=new Map(layout.tokenNodes.map(n=>[n.item.mint,n]));
      for(const a of model.activities){
        const wn=walletNodeById.get(a.wallet_id),tn=tokenNodeByMint.get(a.mint);if(wn&&tn)line(wn,tn,a.type==='sell'?'sell':'token',.40);
      }
      for(const n of layout.tokenNodes)line(center,n,'token',.13);
      // live pulses
      for(let i=state.pulses.length-1;i>=0;i--){const p=state.pulses[i];p.life+=dt/1000;if(p.life>2.3){state.pulses.splice(i,1);continue;}const wn=walletNodeById.get(p.walletId),tn=tokenNodeByMint.get(p.mint);if(!wn||!tn)continue;const from=p.side==='sell'?tn:wn,to=p.side==='sell'?wn:tn,t=clamp(p.life/1.25,0,1),ease=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2,x=from.x+(to.x-from.x)*ease,y=from.y+(to.y-from.y)*ease;ctx.save();ctx.shadowBlur=12;ctx.shadowColor=p.side==='sell'?'#f91880':'#00ba7c';ctx.fillStyle=p.side==='sell'?'#f91880':'#00ba7c';ctx.beginPath();ctx.arc(x,y,4.2,0,Math.PI*2);ctx.fill();ctx.restore();if(p.life<1.75){drawPill(`${p.side==='sell'?'SELL ':'BUY '}${p.amount?money(p.amount,false):short(p.symbol,6)}`,to.x,to.y-(to.r+18),p.side==='sell'?'#f91880':'#00ba7c');}}
      drawAvatar(model.entity,center.x,center.y,center.r,'entity');label(model.entity.x_handle||model.entity.name||'Entity',center.x,center.y+center.r+15,12,750);label('tracked entity',center.x,center.y+center.r+31,9,550,dark?'#71767b':'#536471');
      for(const n of layout.walletNodes){const w=n.item,s=w.stats;drawAvatar(w,n.x,n.y,n.r,'wallet');label(short(w.label||w.address,6),n.x,n.y+n.r+13,9,700);label(`P&L ${money(s.pnl)}`,n.x,n.y+n.r+27,8,650,s.pnl>=0?'#00ba7c':'#f91880');label(`Value ${money(s.trackedValue,false)}`,n.x,n.y+n.r+40,7,550,dark?'#71767b':'#536471');label(`${s.solBalance.toFixed(2)} SOL · In ${money(s.inflow,false)} · Out ${money(s.outflow,false)}`,n.x,n.y+n.r+52,7,520,dark?'#71767b':'#536471');}
      for(const n of layout.tokenNodes){const s=n.item.__stats;drawAvatar(n.item,n.x,n.y,n.r,'token');label(n.item.symbol||short(n.item.name,7)||'TOKEN',n.x,n.y+n.r+13,10,750);if(s?.pnlKnown){label(pct(s.pnlPercent),n.x,n.y+n.r+28,9,750,s.pnlUsd>=0?'#00ba7c':'#f91880');label(money(s.pnlUsd),n.x,n.y+n.r+42,8,650,s.pnlUsd>=0?'#00ba7c':'#f91880');}else label('P&L —',n.x,n.y+n.r+29,8,550,dark?'#71767b':'#536471');}
      if(state.pulses.length)schedule();
    }
    function schedule(){if(!raf&&!dead)raf=requestAnimationFrame(draw);}
    const ro=new ResizeObserver(resize);ro.observe(wrap);resize();
    wrap._siDestroy=()=>{dead=true;cancelAnimationFrame(raf);ro.disconnect();};
  }

  function detectPulses(activities){
    const nowKeys=new Set(activities.map(a=>a.key));
    if(!state.initialized){state.seen=nowKeys;state.initialized=true;return;}
    for(const a of activities){ if(!state.seen.has(a.key) && a.type!=='receive' && a.type!=='send')state.pulses.push(eventFor(a)); }
    state.seen=nowKeys;
    if(state.pulses.length>18)state.pulses.splice(0,state.pulses.length-18);
  }

  async function tick(){
    if(state.busy)return;state.busy=true;
    try{
      await loadTokens();
      const model=await loadModel();
      detectPulses(model.activities);
      state.entity=model.entity;state.wallets=model.wallets;state.activities=model.activities;
      const key=`${model.entity?.id||''}:${model.activities.map(a=>a.key).join('|')}:${model.tokens.map(t=>`${t.mint}:${t.price_usd}`).join('|')}`;
      if(key!==state.lastModelKey || state.pulses.length || !root()?.querySelector('.si-live-network')){state.lastModelKey=key;const old=root()?.querySelector('.si-live-network');old?._siDestroy?.();drawNetwork(model);} 
    }catch(e){console.warn('Live network update failed:',e.message);}
    finally{state.busy=false;clearTimeout(state.timer);state.timer=setTimeout(tick,POLL_MS);}
  }

  function boot(){
    if(!root())return setTimeout(boot,250);
    const observer=new MutationObserver(()=>{if(root()&&!root().querySelector('.si-live-network'))tick();});
    observer.observe(root(),{childList:true,subtree:true});
    tick();
  }
  boot();
})();
