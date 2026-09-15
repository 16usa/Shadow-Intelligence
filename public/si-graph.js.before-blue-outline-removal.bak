/* Shadow Intelligence — canonical interactive graph engine v1.8.0
   Single source of truth for every 3D/network area.

   Behavior:
   - every node is independently draggable
   - nodes start spread around the center, not in a grid
   - weak center attraction + slow organic wandering
   - screen-space collision boundaries prevent visual overlap
   - zero-restitution contact: separate once, no repeated spring/bounce
   - pinch/wheel zoom and empty-space orbit
   - node sizes are ~50% of the previous implementation
*/
(() => {
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const hash=s=>[...String(s||'x')].reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619)>>>0,2166136261>>>0);
  const money=n=>{
    n=Number(n||0);
    const a=Math.abs(n),s=n<0?'-':n>0?'+':'';
    if(a>=1e6)return s+'$'+(a/1e6).toFixed(2)+'M';
    if(a>=1e3)return s+'$'+(a/1e3).toFixed(1)+'K';
    return s+'$'+a.toFixed(a<10?2:0);
  };
  const imgs=new Map();
  const layoutMemory=new Map();

  class Graph {
    constructor(root,model={},opts={}){
      this.root=root;
      this.model=model||{};
      this.onSelect=opts.onSelect||(()=>{});
      this.nodes=[];
      this.edges=[];
      this.pulses=[];
      this.zoom=1;
      this.panX=0;
      this.panY=0;
      this.rotX=.08;
      this.rotY=-.14;
      this.raf=0;
      this.dead=false;
      this.t=0;
      this.lastFrame=performance.now();
      this.pointerMap=new Map();
      this.gesture='none';
      this.dragNode=null;
      this.dragStart=null;
      this.dragMoved=false;
      this.root.innerHTML='<canvas class="si-graph-canvas"></canvas><div class="si-graph-empty">No network data yet.</div>';
      this.canvas=root.querySelector('canvas');
      this.ctx=this.canvas.getContext('2d');
      this.empty=root.querySelector('.si-graph-empty');
      this.mode='global';
      this.bind();
      this.resize();
      this.setModel(this.model);
    }

    bind(){
      this.ro=new ResizeObserver(()=>this.resize());
      this.ro.observe(this.root);
      this.canvas.style.touchAction='none';
      this.canvas.addEventListener('pointerdown',e=>this.down(e),{passive:false});
      this.canvas.addEventListener('pointermove',e=>this.move(e),{passive:false});
      this.canvas.addEventListener('pointerup',e=>this.up(e),{passive:false});
      this.canvas.addEventListener('pointercancel',e=>this.up(e),{passive:false});
      this.canvas.addEventListener('wheel',e=>{
        e.preventDefault();
        this.zoom=clamp(this.zoom*(e.deltaY>0?.91:1.1),.28,3.2);
        this.schedule();
      },{passive:false});
    }

    resize(){
      const r=this.root.getBoundingClientRect();
      const d=Math.min(devicePixelRatio||1,2);
      this.w=Math.max(1,r.width);
      this.h=Math.max(1,r.height);
      this.canvas.width=this.w*d;
      this.canvas.height=this.h*d;
      this.canvas.style.width=this.w+'px';
      this.canvas.style.height=this.h+'px';
      this.ctx.setTransform(d,0,0,d,0,0);
      this.schedule();
    }

    setModel(model){
      this.model=model||{};
      this.mode=this.root.id==='globalMap'?'global':'detail';
      const anchor=this.model.entities?.[0]?.id||this.model.tokens?.[0]?.mint||this.model.wallets?.[0]?.id||'network';
      this.scope=this.mode==='global'?'global':`detail:${anchor}`;
      this.build();
      this.fit();
      this.schedule();
    }

    nodeKey(n){
      const r=n?.raw||{};
      return String(r.id||r.mint||r.address||r.name||r.symbol||n?.kind||'node');
    }

    build(){
      const es=this.model.entities||[];
      const ws=this.model.wallets||[];
      const ts=this.model.tokens||[];
      this.nodes=[];
      this.edges=[];
      this.pulses=[];
      this.empty.style.display='none';

      if(this.mode==='global') this.buildGlobal(es);
      else this.buildDetail(es[0],ws,ts,this.model.activity||[]);

      this.seedPositions();
      this.empty.style.display=this.nodes.length?'none':'grid';
    }

    buildGlobal(es){
      const total=Math.max(1,es.length);
      es.forEach((e,i)=>{
        const seed=hash((e.id||e.name||'entity')+':global');
        this.nodes.push({
          kind:'entity',raw:e,seed,idx:i,total,
          x:0,y:0,z:0,vx:0,vy:0,vz:0,
          phase1:(seed%6283)/1000,
          phase2:((seed>>>8)%6283)/1000,
          freq1:.00022+((seed>>>16)%100)*.0000015,
          freq2:.00017+((seed>>>23)%80)*.0000013
        });
      });
    }

    buildDetail(entity,wallets,tokens,activity){
      const center={
        kind:'entity',raw:entity||{},seed:hash((entity?.id||entity?.name||'entity')+':detail'),
        x:0,y:0,z:0,vx:0,vy:0,vz:0
      };
      this.nodes.push(center);

      const add=(kind,raw,i,total)=>{
        const seed=hash((raw.id||raw.mint||raw.address||raw.symbol||raw.name||'')+':'+kind);
        const n={
          kind,raw,seed,idx:i,total,
          x:0,y:0,z:0,vx:0,vy:0,vz:0,
          phase1:(seed%6283)/1000,
          phase2:((seed>>>8)%6283)/1000,
          freq1:.00024+((seed>>>16)%100)*.0000015,
          freq2:.00018+((seed>>>23)%80)*.0000013
        };
        this.nodes.push(n);
        this.edges.push({a:center,b:n,weight:kind==='token'?1.2:1});
        return n;
      };

      wallets.forEach((w,i)=>add('wallet',w,i,wallets.length));
      tokens.forEach((t,i)=>add('token',t,i,tokens.length));

      for(const a of activity||[]){
        const w=this.nodes.find(n=>n.kind==='wallet'&&n.raw.id===a.wallet_id);
        const t=this.nodes.find(n=>n.kind==='token'&&(n.raw.mint===a.mint||n.raw.id===a.token_id));
        if(w&&t)this.edges.push({a:w,b:t,weight:1.6,activity:a});
      }
    }

    memoryKey(n){return `${this.scope}:${n.kind}:${this.nodeKey(n)}`;}

    remember(){
      for(const n of this.nodes||[]){
        layoutMemory.set(this.memoryKey(n),{x:n.x,y:n.y,z:n.z});
      }
    }

    seedPositions(){
      const total=this.nodes.length;
      if(!total)return;
      const golden=2.399963229728653;
      const spread=this.mode==='global'
        ? (total>=16?1.62:total>=10?1.42:1.22)
        : (total>=18?1.52:total>=10?1.30:1.12);

      this.nodes.forEach((n,i)=>{
        const saved=layoutMemory.get(this.memoryKey(n));
        if(saved){
          n.x=saved.x;n.y=saved.y;n.z=saved.z;
          n.vx=n.vy=n.vz=0;
          return;
        }
        const seed=n.seed||hash(this.nodeKey(n));
        const j1=((seed&1023)/1023)-.5;
        const j2=(((seed>>>10)&1023)/1023)-.5;

        let radius;
        if(this.mode==='detail'&&n.kind==='entity'){
          radius=.08;
        }else{
          const f=Math.sqrt((i+.65)/Math.max(1,total));
          radius=.24+f*(spread-.24)+j2*.13;
        }
        const angle=i*golden+j1*.95;

        n.x=Math.cos(angle)*radius;
        n.y=Math.sin(angle)*radius*.88;
        n.z=((((seed>>>20)&1023)/1023)-.5)*.10;
        n.vx=n.vy=n.vz=0;
        n.phase1??=(seed%6283)/1000;
        n.phase2??=((seed>>>8)%6283)/1000;
        n.freq1??=.00023;
        n.freq2??=.00018;
      });
    }

    defaultZoom(){
      const n=this.nodes.length;
      if(n>=24)return .42;
      if(n>=18)return .48;
      if(n>=12)return .56;
      if(n>=8)return .64;
      return .72;
    }

    fit(){
      this.zoom=this.defaultZoom();
      this.panX=0;
      this.panY=0;
      this.rotX=.08;
      this.rotY=-.14;
      this.schedule();
    }

    project(n){
      const cy=Math.cos(this.rotY||0),sy=Math.sin(this.rotY||0);
      const cx=Math.cos(this.rotX||0),sx=Math.sin(this.rotX||0);
      let x=n.x*cy-n.z*sy;
      let z=n.x*sy+n.z*cy;
      let y=n.y*cx-z*sx;
      z=n.y*sx+z*cx;
      const depth=1.28/(1.28+z*.42);
      const scale=Math.min(this.w,this.h)*.62*this.zoom*depth;
      return{
        x:this.w/2+x*scale+this.panX,
        y:this.h/2+y*scale+this.panY,
        z,depth,scale
      };
    }

    image(n){
      const src=n.raw?.avatar||n.raw?.image;
      if(!src)return null;
      if(imgs.has(src))return imgs.get(src);
      const im=new Image();
      im.decoding='async';
      im.src=src;
      im.onload=()=>this.schedule();
      imgs.set(src,im);
      return im;
    }

    radius(n,p=this.project(n)){
      const zoomSize=clamp(this.zoom,.50,1.45);
      let base;
      if(this.mode==='global') base=31;
      else if(n.kind==='entity') base=34;
      else if(n.kind==='wallet') base=18;
      else base=19;
      return clamp(base*p.depth*zoomSize,10,this.mode==='global'?34:n.kind==='entity'?38:24);
    }

    label(n){
      if(n.kind==='entity')return n.raw.x_handle||n.raw.xHandle||n.raw.name||'Entity';
      if(n.kind==='wallet'){
        const a=n.raw.address||'Wallet';
        return n.raw.label||(a.length>12?a.slice(0,6)+'…'+a.slice(-4):a);
      }
      return n.raw.symbol||n.raw.name||'Token';
    }

    drawBackground(){
      const c=this.ctx;
      const dark=document.documentElement.dataset.theme==='dark';
      c.clearRect(0,0,this.w,this.h);
      const bg=c.createRadialGradient(this.w*.5,this.h*.46,10,this.w*.5,this.h*.46,Math.max(this.w,this.h)*.72);
      bg.addColorStop(0,dark?'#0e1217':'#f7fbfd');
      bg.addColorStop(1,dark?'#07090c':'#edf3f6');
      c.fillStyle=bg;
      c.fillRect(0,0,this.w,this.h);
    }

    drawEdge(e){
      const a=this.project(e.a),b=this.project(e.b),c=this.ctx;
      const grad=c.createLinearGradient(a.x,a.y,b.x,b.y);
      grad.addColorStop(0,'rgba(29,155,240,.27)');
      grad.addColorStop(1,e.b.kind==='token'?'rgba(0,186,124,.28)':'rgba(83,100,113,.24)');
      c.strokeStyle=grad;
      c.lineWidth=clamp(e.weight*(a.depth+b.depth)/2,.55,1.35);
      c.beginPath();
      c.moveTo(a.x,a.y);
      c.lineTo(b.x,b.y);
      c.stroke();
    }

    drawNode(n){
      const p=this.project(n),c=this.ctx,im=this.image(n),dark=document.documentElement.dataset.theme==='dark';
      const r=this.radius(n,p);
      n._p=p;
      n._r=r;

      const col=n.kind==='entity'?'29,155,240':n.kind==='wallet'?'83,100,113':'0,186,124';
      c.save();

      const glow=c.createRadialGradient(p.x,p.y,2,p.x,p.y,r*2.55);
      glow.addColorStop(0,`rgba(${col},.18)`);
      glow.addColorStop(1,`rgba(${col},0)`);
      c.fillStyle=glow;
      c.beginPath();
      c.arc(p.x,p.y,r*2.55,0,Math.PI*2);
      c.fill();

      c.fillStyle=dark?'#0d1014':'#fff';
      c.beginPath();
      c.arc(p.x,p.y,r+3,0,Math.PI*2);
      c.fill();

      c.save();
      c.beginPath();
      c.arc(p.x,p.y,r,0,Math.PI*2);
      c.clip();
      if(im?.complete&&im.naturalWidth){
        c.drawImage(im,p.x-r,p.y-r,r*2,r*2);
      }else{
        c.fillStyle=`rgb(${col})`;
        c.fillRect(p.x-r,p.y-r,r*2,r*2);
        c.fillStyle='rgba(255,255,255,.25)';
        c.font=`800 ${Math.max(9,r*.52)}px system-ui`;
        c.textAlign='center';
        c.textBaseline='middle';
        c.fillText(n.kind==='entity'?'@':n.kind==='wallet'?'W':'$',p.x,p.y);
      }
      c.restore();

      if(this.mode==='detail'){
        c.fillStyle=dark?'#e7e9ea':'#0f1419';
        c.font=`${n.kind==='entity'?700:600} ${n.kind==='entity'?11:9}px Inter,system-ui`;
        c.textAlign='center';
        c.textBaseline='middle';
        c.fillText(this.label(n).slice(0,22),p.x,p.y+r+13);
        if(n.kind==='token'){
          const known=n.raw.pnlKnown,pct=Number(n.raw.pnlPercent),usd=Number(n.raw.pnlUsd);
          c.font='700 8px Inter,system-ui';
          c.fillStyle=known?(usd>=0?'#00ba7c':'#f91880'):(dark?'#71767b':'#536471');
          c.fillText(known?`${pct>=0?'+':''}${pct.toFixed(2)}%`:'P&L —',p.x,p.y+r+24);
          if(known){
            c.font='650 8px Inter,system-ui';
            c.fillText(money(usd),p.x,p.y+r+34);
          }
        }
      }

      c.restore();
    }

    worldPixels(p){
      return Math.max(36,p?.scale||Math.min(this.w,this.h)*.62*this.zoom);
    }

    resolveCollisions(dragged=null){
      if(this.nodes.length<2)return;
      for(let pass=0;pass<5;pass++){
        let changed=false;
        for(let i=0;i<this.nodes.length;i++){
          const a=this.nodes[i],pa=this.project(a);
          const ra=this.radius(a,pa);
          for(let j=i+1;j<this.nodes.length;j++){
            const b=this.nodes[j],pb=this.project(b);
            const rb=this.radius(b,pb);
            let dx=pb.x-pa.x,dy=pb.y-pa.y;
            let dist=Math.hypot(dx,dy);

            if(dist<.001){
              const ang=(hash(this.nodeKey(a)+this.nodeKey(b))%6283)/1000;
              dx=Math.cos(ang);dy=Math.sin(ang);dist=1;
            }

            const minDist=ra+rb+5;
            if(dist>=minDist)continue;

            const nx=dx/dist,ny=dy/dist;
            const overlap=minDist-dist;
            const sa=this.worldPixels(pa),sb=this.worldPixels(pb);

            if(a===dragged&&b!==dragged){
              // dragged object keeps the finger position; neighbor moves out of the way
              b.x+=nx*(overlap/sb);
              b.y+=ny*(overlap/sb);
              b.vx=b.vy=0;
            }else if(b===dragged&&a!==dragged){
              a.x-=nx*(overlap/sa);
              a.y-=ny*(overlap/sa);
              a.vx=a.vy=0;
            }else{
              a.x-=nx*(overlap*.5/sa);
              a.y-=ny*(overlap*.5/sa);
              b.x+=nx*(overlap*.5/sb);
              b.y+=ny*(overlap*.5/sb);

              // zero restitution: kill approach along the contact normal, never add bounce energy
              const rvx=(b.vx||0)-(a.vx||0);
              const rvy=(b.vy||0)-(a.vy||0);
              const approach=rvx*nx+rvy*ny;
              if(approach<0){
                const k=-approach*.5;
                a.vx-=nx*k;a.vy-=ny*k;
                b.vx+=nx*k;b.vy+=ny*k;
              }
              a.vx*=.35;a.vy*=.35;
              b.vx*=.35;b.vy*=.35;
            }
            changed=true;
          }
        }
        if(!changed)break;
      }
    }

    keepInside(){
      const pad=10;
      for(const n of this.nodes){
        if(n===this.dragNode)continue;
        const p=this.project(n),r=this.radius(n,p);
        let sx=0,sy=0;
        if(p.x-r<pad)sx=(pad-(p.x-r))/this.worldPixels(p);
        else if(p.x+r>this.w-pad)sx=-((p.x+r)-(this.w-pad))/this.worldPixels(p);
        if(p.y-r<pad)sy=(pad-(p.y-r))/this.worldPixels(p);
        else if(p.y+r>this.h-pad)sy=-((p.y+r)-(this.h-pad))/this.worldPixels(p);
        if(sx||sy){
          n.x+=sx;n.y+=sy;
          n.vx*=.35;n.vy*=.35;
        }
      }
    }

    physics(now){
      const dt=clamp((now-this.lastFrame)/16.667,.35,2.0);
      this.lastFrame=now;

      for(const n of this.nodes){
        if(n===this.dragNode)continue;

        const noiseX=
          Math.sin(now*n.freq1+n.phase1)*.000065+
          Math.cos(now*n.freq2+n.phase2)*.000044;
        const noiseY=
          Math.cos(now*n.freq1*.91+n.phase2)*.000065+
          Math.sin(now*n.freq2*1.07+n.phase1)*.000044;

        // Weak center gravity: enough to regroup after drag, never enough to stack.
        const gravity=this.mode==='global'?.000115:.000135;
        n.vx=((n.vx||0)+(-n.x*gravity+noiseX)*dt)*.932;
        n.vy=((n.vy||0)+(-n.y*gravity+noiseY)*dt)*.932;
        n.vz=((n.vz||0)+(-n.z*.000055)*dt)*.95;

        n.x+=n.vx*dt;
        n.y+=n.vy*dt;
        n.z+=n.vz*dt;

        const d=Math.hypot(n.x,n.y);
        const max=this.mode==='global'?2.30:2.05;
        if(d>max){
          const k=max/d;
          n.x*=k;n.y*=k;
          n.vx*=.30;n.vy*=.30;
        }
      }

      this.resolveCollisions(null);
      this.keepInside();
    }

    render(){
      if(this.dead)return;
      this.raf=0;
      const now=performance.now();
      this.t+=.012;
      this.physics(now);
      this.drawBackground();

      if(this.mode==='detail'){
        [...this.edges]
          .sort((a,b)=>this.project(a.a).z-this.project(b.a).z)
          .forEach(e=>this.drawEdge(e));
      }

      [...this.nodes]
        .sort((a,b)=>this.project(a).z-this.project(b).z)
        .forEach(n=>this.drawNode(n));

      this.drawPulses(now);
      this.schedule();
    }

    schedule(){
      if(!this.raf&&!this.dead)this.raf=requestAnimationFrame(()=>this.render());
    }

    hit(e){
      const rect=this.canvas.getBoundingClientRect();
      const x=e.clientX-rect.left,y=e.clientY-rect.top;
      let best=null,bd=Infinity;
      for(const n of this.nodes){
        const p=n._p||this.project(n),r=(n._r||this.radius(n,p))+13;
        const d=Math.hypot(p.x-x,p.y-y);
        if(d<=r&&d<bd){best=n;bd=d;}
      }
      return best;
    }

    down(e){
      e.preventDefault();
      this.pointerMap.set(e.pointerId,{x:e.clientX,y:e.clientY});
      try{this.canvas.setPointerCapture?.(e.pointerId)}catch{}

      if(this.pointerMap.size>=2){
        const pts=[...this.pointerMap.values()].slice(0,2);
        this.gesture='pinch';
        this.dragNode=null;
        this.dragStart=null;
        this.pinch={
          distance:Math.max(1,Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y)),
          zoom:this.zoom
        };
        return;
      }

      const n=this.hit(e);
      if(n){
        this.gesture='node';
        this.dragNode=n;
        this.dragMoved=false;
        n.vx=n.vy=n.vz=0;
        const p=n._p||this.project(n);
        this.dragStart={
          id:e.pointerId,
          clientX:e.clientX,clientY:e.clientY,
          x:n.x,y:n.y,z:n.z,
          scale:this.worldPixels(p)
        };
        return;
      }

      this.gesture='orbit';
      this.orbit={
        id:e.pointerId,
        x:e.clientX,y:e.clientY,
        rx:this.rotX,ry:this.rotY
      };
    }

    move(e){
      if(this.pointerMap.has(e.pointerId)){
        this.pointerMap.set(e.pointerId,{x:e.clientX,y:e.clientY});
      }

      if(this.gesture==='pinch'&&this.pointerMap.size>=2){
        const pts=[...this.pointerMap.values()].slice(0,2);
        const d=Math.max(1,Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y));
        if(this.pinch?.distance){
          this.zoom=clamp(this.pinch.zoom*(d/this.pinch.distance),.28,3.2);
          this.schedule();
        }
        e.preventDefault();
        return;
      }

      if(this.gesture==='node'){
        const n=this.dragNode,s=this.dragStart;
        if(!n||s?.id!==e.pointerId)return;
        const dx=e.clientX-s.clientX,dy=e.clientY-s.clientY;
        if(Math.abs(dx)+Math.abs(dy)>10)this.dragMoved=true;

        n.x=s.x+dx/s.scale;
        n.y=s.y+dy/s.scale;
        n.z=s.z;
        n.vx=n.vy=n.vz=0;

        this.resolveCollisions(n);
        this.schedule();
        e.preventDefault();
        return;
      }

      if(this.gesture==='orbit'){
        const s=this.orbit;
        if(!s||s.id!==e.pointerId)return;
        this.rotY=s.ry+(e.clientX-s.x)*.0055;
        this.rotX=clamp(s.rx+(e.clientY-s.y)*.0038,-.72,.72);
        this.schedule();
        e.preventDefault();
      }
    }

    up(e){
      this.pointerMap.delete(e.pointerId);
      try{this.canvas.releasePointerCapture?.(e.pointerId)}catch{}

      if(this.gesture==='node'){
        const n=this.dragNode,s=this.dragStart;
        if(n&&s?.id===e.pointerId){
          if(!this.dragMoved)this.onSelect?.(n.kind,n.raw);
          n.vx=n.vy=n.vz=0;
          this.dragNode=null;
          this.dragStart=null;
          this.dragMoved=false;
          this.gesture='none';
          this.schedule();
          return;
        }
      }

      if(this.gesture==='pinch'){
        if(this.pointerMap.size<2){
          this.pinch=null;
          this.gesture='none';
        }
        return;
      }

      if(this.gesture==='orbit'){
        this.orbit=null;
        this.gesture='none';
      }
    }

    drawPulses(now){
      if(!this.pulses.length)return;
      const c=this.ctx;
      this.pulses=this.pulses.filter(p=>now-p.start<1100);
      for(const p of this.pulses){
        const q=clamp((now-p.start)/1100,0,1);
        const a=this.project(p.a),b=this.project(p.b);
        const x=a.x+(b.x-a.x)*q,y=a.y+(b.y-a.y)*q;
        c.fillStyle=p.color;
        c.shadowBlur=12;
        c.shadowColor=p.color;
        c.beginPath();
        c.arc(x,y,3.5,0,Math.PI*2);
        c.fill();
        c.shadowBlur=0;
      }
    }

    pulseFor(ev){
      if(this.mode==='global')return;
      const a=this.nodes.find(n=>n.kind==='wallet'&&n.raw.id===ev.wallet_id);
      const b=this.nodes.find(n=>n.kind==='token'&&(n.raw.mint===ev.mint||n.raw.id===ev.token_id));
      if(!a||!b)return;
      const sell=['sell','send'].includes(String(ev.type));
      this.pulses.push({
        a:sell?b:a,b:sell?a:b,start:performance.now(),
        color:sell?'#f91880':'#00ba7c'
      });
      this.schedule();
    }

    destroy(){
      this.remember();
      this.dead=true;
      cancelAnimationFrame(this.raf);
      this.ro?.disconnect();
      this.pointerMap.clear();
    }
  }

  window.ShadowGraph=Graph;
})();
