/* Shadow Intelligence — unified graph engine */
(() => {
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const hash=s=>[...String(s||'x')].reduce((h,c)=>((h<<5)-h+c.charCodeAt(0))|0,2166136261);
  const imgCache=new Map();
  const money=n=>{n=Number(n||0);const a=Math.abs(n),s=n<0?'-':n>0?'+':'';if(a>=1e6)return s+'$'+(a/1e6).toFixed(2)+'M';if(a>=1e3)return s+'$'+(a/1e3).toFixed(a>=100000?0:1)+'K';return s+'$'+a.toFixed(a<10?2:0)};
  class Graph {
    constructor(root, model={}, opts={}) {
      this.root=root; this.model=model; this.onSelect=opts.onSelect||(()=>{}); this.onEvent=opts.onEvent||(()=>{});
      this.nodes=[]; this.edges=[]; this.pulses=[]; this.drag={}; this.zoom=1; this.panX=0; this.panY=0; this.rotX=.18; this.rotY=-.35; this.t=0; this.raf=0; this.destroyed=false;
      root.innerHTML='<canvas class="si-graph-canvas"></canvas><div class="si-graph-hud"><span class="si-graph-live"><i></i> LIVE</span><span>3D NETWORK</span><button class="si-graph-fit">Fit</button></div><div class="si-graph-empty">No network data yet.</div>';
      this.canvas=root.querySelector('canvas'); this.empty=root.querySelector('.si-graph-empty'); this.ctx=this.canvas.getContext('2d');
      this.bind(); this.resize(); this.setModel(model);
    }
    bind(){
      this.resizeObs=new ResizeObserver(()=>this.resize()); this.resizeObs.observe(this.root);
      this.canvas.addEventListener('pointerdown',e=>this.down(e)); this.canvas.addEventListener('pointermove',e=>this.move(e)); this.canvas.addEventListener('pointerup',e=>this.up(e)); this.canvas.addEventListener('pointercancel',e=>this.up(e));
      this.canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom=clamp(this.zoom*(e.deltaY>0?.91:1.1),.55,2.7);this.schedule()},{passive:false});
      this.canvas.addEventListener('click',e=>this.click(e)); this.root.querySelector('.si-graph-fit').onclick=()=>this.fit();
    }
    resize(){const r=this.root.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);this.w=Math.max(1,r.width);this.h=Math.max(1,r.height);this.dpr=d;this.canvas.width=this.w*d;this.canvas.height=this.h*d;this.canvas.style.width=this.w+'px';this.canvas.style.height=this.h+'px';this.ctx.setTransform(d,0,0,d,0,0);this.schedule()}
    setModel(m){this.model=m||{};this.build();this.schedule()}
    build(){
      const entities=this.model.entities||[], wallets=this.model.wallets||[], tokens=this.model.tokens||[];
      this.nodes=[];this.edges=[];this.hit=[];
      const entityIds=new Set(entities.map(e=>e.id));
      entities.forEach((e,i)=>this.nodes.push(this.node('entity',e,i,entities.length)));
      wallets.forEach((w,i)=>this.nodes.push(this.node('wallet',w,i,wallets.length)));
      tokens.forEach((t,i)=>this.nodes.push(this.node('token',t,i,tokens.length)));
      const byEntity={}; this.nodes.forEach(n=>{if(n.raw.entity_id){(byEntity[n.raw.entity_id]??=[]).push(n)}});
      for(const n of this.nodes.filter(n=>n.kind!=='entity')){
        const eid=n.raw.entity_id||n.raw.entityId; const e=this.nodes.find(x=>x.kind==='entity'&&x.raw.id===eid);
        if(e)this.edges.push({a:e,b:n,weight:n.kind==='token'?1.2:1});
      }
      // Global map: lightly connect entities by shared token/wallet references if supplied.
      const activity=this.model.activity||[];
      for(const a of activity){
        const w=this.nodes.find(n=>n.kind==='wallet'&&n.raw.id===a.wallet_id);
        const t=this.nodes.find(n=>n.kind==='token'&&(n.raw.mint===a.mint||n.raw.id===a.token_id));
        if(w&&t)this.edges.push({a:w,b:t,weight:1.8,activity:a});
      }
      this.empty.style.display=this.nodes.length?'none':'grid';
    }
    node(kind,raw,i,total){
      const seed=Math.abs(hash((raw.id||raw.mint||raw.address||raw.name||'')+kind));
      const a=(i/Math.max(1,total))*Math.PI*2 + (seed%31)/31;
      let radius=kind==='entity'?0.02:kind==='wallet'?.34+(i%3)*.12:0.58+(i%4)*.11;
      const side=kind==='wallet'?-1:kind==='token'?1:0;
      return {kind,raw,x:side?side*radius:0,y:kind==='entity'?0:Math.sin(a)*radius*.7,z:kind==='entity'?0:Math.cos(a)*radius,phase:(seed%100)/20,selected:false};
    }
    project(n){
      const cy=Math.cos(this.rotY),sy=Math.sin(this.rotY),cx=Math.cos(this.rotX),sx=Math.sin(this.rotX);
      let x=n.x*cy-n.z*sy,z=n.x*sy+n.z*cy; let y=n.y*cx-z*sx; z=n.y*sx+z*cx;
      const depth=1.35/(1.35+z*.55), scale=Math.min(this.w,this.h)*.62*this.zoom*depth;
      return {x:this.w/2+x*scale+this.panX,y:this.h/2+y*scale+this.panY,z,depth,scale};
    }
    avatar(n){
      const key=n.raw.avatar||n.raw.image||n.raw.symbol||n.raw.address||n.raw.name||n.raw.id||n.kind;
      if(imgCache.has(key))return imgCache.get(key);
      const src=n.raw.avatar||n.raw.image; if(!src)return null;
      const im=new Image();im.src=src;im.onload=()=>this.schedule();imgCache.set(key,im);return im;
    }
    nodeLabel(n){
      if(n.kind==='entity')return n.raw.x_handle||n.raw.xHandle||n.raw.name||'Entity';
      if(n.kind==='wallet')return n.raw.label||((n.raw.address||'Wallet').slice(0,6)+'…'+(n.raw.address||'').slice(-4));
      return n.raw.symbol||n.raw.name||'Token';
    }
    drawNode(n){
      const p=this.project(n), c=this.ctx, dark=document.documentElement.dataset.theme==='dark';
      const base=n.kind==='entity'?44:n.kind==='wallet'?27:28, r=base*p.depth;
      n._p=p;n._r=r;
      const rgb=n.kind==='entity'?'29,155,240':n.kind==='wallet'?'83,100,113':'0,186,124';
      c.save();
      const g=c.createRadialGradient(p.x,p.y,r*.1,p.x,p.y,r*2);g.addColorStop(0,`rgba(${rgb},.20)`);g.addColorStop(1,`rgba(${rgb},0)`);c.fillStyle=g;c.beginPath();c.arc(p.x,p.y,r*2,0,7);c.fill();
      c.fillStyle=dark?'#111418':'#fff';c.beginPath();c.arc(p.x,p.y,r+4,0,7);c.fill();
      const im=this.avatar(n);c.save();c.beginPath();c.arc(p.x,p.y,r,0,7);c.clip();
      if(im?.complete&&im.naturalWidth)c.drawImage(im,p.x-r,p.y-r,r*2,r*2);else{c.fillStyle=n.kind==='entity'?'#1d9bf0':n.kind==='wallet'?'#536471':'#00ba7c';c.fillRect(p.x-r,p.y-r,r*2,r*2);c.fillStyle='rgba(255,255,255,.22)';c.font=`800 ${r*.62}px Inter,system-ui`;c.textAlign='center';c.textBaseline='middle';c.fillText(n.kind==='entity'?'@':n.kind==='wallet'?'W':'$',p.x,p.y)}
      c.restore();
      c.strokeStyle=n.kind==='entity'?'#1d9bf0':n.kind==='wallet'?'#536471':'#00ba7c';c.lineWidth=n.kind==='entity'?2.5:1.5;c.beginPath();c.arc(p.x,p.y,r+3,0,7);c.stroke();
      const label=this.nodeLabel(n), yy=p.y+r+18;
      c.font=`${n.kind==='entity'?750:650} ${n.kind==='entity'?13:11}px Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillStyle=dark?'#e7e9ea':'#0f1419';c.fillText(label.slice(0,24),p.x,yy);
      if(n.kind==='token'){
        const known=n.raw.pnlKnown, pct=Number(n.raw.pnlPercent), usd=Number(n.raw.pnlUsd);
        c.font='700 10px Inter,system-ui';c.fillStyle=known?(usd>=0?'#00ba7c':'#f91880'):(dark?'#71767b':'#536471');c.fillText(known?`${pct>=0?'+':''}${pct.toFixed(2)}%`:'P&L —',p.x,yy+15);
        if(known){c.font='650 9px Inter,system-ui';c.fillText(money(usd),p.x,yy+28)}
      } else if(n.kind==='wallet'){
        const value=n.raw.trackedValueUsd; if(value!=null){c.font='600 9px Inter,system-ui';c.fillStyle=dark?'#8b98a5':'#536471';c.fillText(money(value),p.x,yy+14)}
      }
      c.restore();
    }
    drawEdge(e){
      const a=this.project(e.a),b=this.project(e.b),c=this.ctx,dark=document.documentElement.dataset.theme==='dark';
      const grad=c.createLinearGradient(a.x,a.y,b.x,b.y);grad.addColorStop(0,'rgba(29,155,240,.42)');grad.addColorStop(1,e.b.kind==='token'?'rgba(0,186,124,.42)':'rgba(83,100,113,.35)');
      c.strokeStyle=grad;c.lineWidth=clamp(e.weight*(a.depth+b.depth)/2,.65,1.8);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();
      if(e.activity){c.fillStyle=e.activity.type==='sell'?'#f91880':'#00ba7c';c.globalAlpha=.75;c.beginPath();c.arc((a.x+b.x)/2,(a.y+b.y)/2,2.4,0,7);c.fill();c.globalAlpha=1}
    }
    pulseFor(event){
      const a=this.nodes.find(n=>n.kind==='wallet'&&n.raw.id===event.wallet_id), b=this.nodes.find(n=>n.kind==='token'&&(n.raw.mint===event.mint||n.raw.id===event.token_id));
      if(!a||!b)return;
      const sell=['sell','send'].includes(String(event.type));this.pulses.push({a:sell?b:a,b:sell?a:b,start:performance.now(),color:sell?'#f91880':'#00ba7c',label:(event.sol_amount?`${Math.abs(Number(event.sol_amount)).toFixed(2)} SOL`:event.token_amount?`${Number(event.token_amount).toFixed(2)} tokens`:String(event.type||'ACTIVITY').toUpperCase())});
      this.schedule();
    }
    drawPulses(now){
      const c=this.ctx;this.pulses=this.pulses.filter(p=>now-p.start<1150);
      for(const p of this.pulses){const q=clamp((now-p.start)/1150,0,1),a=this.project(p.a),b=this.project(p.b),x=a.x+(b.x-a.x)*q,y=a.y+(b.y-a.y)*q;c.fillStyle=p.color;c.shadowBlur=14;c.shadowColor=p.color;c.beginPath();c.arc(x,y,4.5,0,7);c.fill();c.shadowBlur=0;c.globalAlpha=q>.45?1:Math.min(1,q*2.2);c.font='700 10px Inter,system-ui';c.textAlign='center';c.fillText(p.label,x,y-12);c.globalAlpha=1}
    }
    render(){
      if(this.destroyed)return;this.raf=0;this.t+=.008;const c=this.ctx,dark=document.documentElement.dataset.theme==='dark';c.clearRect(0,0,this.w,this.h);
      const grd=c.createRadialGradient(this.w*.5,this.h*.45,20,this.w*.5,this.h*.45,Math.max(this.w,this.h)*.7);grd.addColorStop(0,dark?'#101318':'#f7f9fa');grd.addColorStop(1,dark?'#080a0d':'#eef2f4');c.fillStyle=grd;c.fillRect(0,0,this.w,this.h);
      // subtle depth field
      for(let i=0;i<55;i++){const x=(i*83)%this.w,y=(i*47)%this.h;c.fillStyle=dark?'rgba(29,155,240,.035)':'rgba(29,155,240,.025)';c.beginPath();c.arc(x,y,1.2,0,7);c.fill()}
      const breathe=.018*Math.sin(this.t);this.nodes.forEach((n,i)=>{if(n.kind!=='entity'){n.x+=Math.sin(this.t+n.phase)*.00012;n.y+=Math.cos(this.t*.8+n.phase)*.00012;n.z+=breathe*Math.sin(n.phase+this.t)}});
      this.edges.sort((a,b)=>this.project(a.a).z-this.project(b.a).z).forEach(e=>this.drawEdge(e));
      [...this.nodes].sort((a,b)=>this.project(a).z-this.project(b).z).forEach(n=>this.drawNode(n));this.drawPulses(performance.now());this.schedule();
    }
    schedule(){if(!this.raf&&!this.destroyed)this.raf=requestAnimationFrame(()=>this.render())}
    fit(){this.zoom=1;this.panX=0;this.panY=0;this.rotX=.18;this.rotY=-.35;this.schedule()}
    down(e){this.drag={x:e.clientX,y:e.clientY,rx:this.rotX,ry:this.rotY,px:this.panX,py:this.panY,moved:false};this.canvas.setPointerCapture?.(e.pointerId)}
    move(e){if(!this.drag.x)return;const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;if(Math.abs(dx)+Math.abs(dy)>5)this.drag.moved=true;if(e.buttons===1){this.rotY=this.drag.ry+dx*.006;this.rotX=clamp(this.drag.rx+dy*.004,-.8,.8);this.panX=this.drag.px;this.panY=this.drag.py;this.schedule()}}
    up(e){this.canvas.releasePointerCapture?.(e.pointerId);this.drag={}}
    click(e){if(this.drag.moved)return;const r=this.canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;let best=null,bd=Infinity;for(const n of this.nodes){if(!n._p)continue;const d=Math.hypot(n._p.x-x,n._p.y-y);if(d<n._r+8&&d<bd){best=n;bd=d}}if(best)this.onSelect(best.kind,best.raw)}
    destroy(){this.destroyed=true;cancelAnimationFrame(this.raf);this.resizeObs?.disconnect()}
  }
  window.ShadowGraph=Graph;
})();