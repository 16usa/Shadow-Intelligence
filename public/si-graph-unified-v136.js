/* Shadow Intelligence — Unified Graph Interaction v1.3.6
   Soft contact, NO repeated spring-bounce.

   Applies to every ShadowGraph instance:
   - main Intelligence Map
   - entity/person detail graph

   Behavior:
   - slight contact separation when circles touch
   - no repeated springing/oscillation between nodes
   - nodes settle immediately after contact resolution
   - released node returns to center with smooth monotonic easing
   - independent dragging
   - pinch zoom
   - empty-space orbit
*/
(() => {
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  function hash(s){
    let h=2166136261>>>0;
    for(const c of String(s||'node')){
      h^=c.charCodeAt(0);
      h=Math.imul(h,16777619)>>>0;
    }
    return h>>>0;
  }

  function rng(seed){
    let x=seed>>>0;
    return ()=>{
      x=(x+0x6D2B79F5)>>>0;
      let t=x;
      t=Math.imul(t^(t>>>15),t|1);
      t^=t+Math.imul(t^(t>>>7),t|61);
      return ((t^(t>>>14))>>>0)/4294967296;
    };
  }

  function nodeKey(n){
    const r=n?.raw||{};
    return String(r.id||r.mint||r.address||r.name||r.symbol||n?.kind||'node');
  }

  function visualBaseRadius(n){
    return n.kind==='entity' ? 44 : n.kind==='wallet' ? 27 : 28;
  }

  function install(){
    const Graph=window.ShadowGraph;
    if(!Graph?.prototype){ setTimeout(install,20); return; }

    const p=Graph.prototype;
    if(p.__shadowSoftContact136) return;
    p.__shadowSoftContact136=true;

    const baseBuild=p.build;
    const baseSetModel=p.setModel;
    const baseRender=p.render;

    p.defaultZoom=function(){
      const n=this.nodes?.length||0;
      if(n>=140)return .17;
      if(n>=100)return .19;
      if(n>=70)return .22;
      if(n>=50)return .25;
      if(n>=30)return .31;
      if(n>=18)return .39;
      if(n>=10)return .48;
      return .58;
    };

    p.__layout136=function(){
      const nodes=this.nodes||[];
      if(!nodes.length)return;

      const rank=n=>n.kind==='entity'?0:n.kind==='wallet'?1:2;
      const ordered=[...nodes].sort((a,b)=>rank(a)-rank(b)||hash(nodeKey(a))-hash(nodeKey(b)));
      const count=nodes.length;
      const maxR=count>=140?1.82:count>=100?1.68:count>=70?1.56:count>=50?1.43:count>=30?1.28:count>=18?1.10:.92;

      const placed=[];

      for(let i=0;i<ordered.length;i++){
        const n=ordered[i];
        const random=rng(hash(nodeKey(n)+':'+n.kind+':u136'));
        let chosen=null,best=null,bestClear=-Infinity;

        for(let attempt=0;attempt<420;attempt++){
          const angle=random()*Math.PI*2;
          const radial=.15+Math.pow(random(),.56)*(maxR-.15);
          const x=Math.cos(angle)*radial;
          const y=Math.sin(angle)*radial*.92;

          let clear=Infinity;
          for(const q of placed){
            const need=(n.kind==='entity'?.18:.13)+(q.kind==='entity'?.18:.13)+.03;
            clear=Math.min(clear,Math.hypot(x-q.x,y-q.y)-need);
          }

          if(clear>=0){chosen={x,y};break}
          if(clear>bestClear){bestClear=clear;best={x,y}}
        }

        chosen ||= best || {
          x:Math.cos(i*2.3999632297)*maxR*.86,
          y:Math.sin(i*2.3999632297)*maxR*.79
        };

        n.__ux=chosen.x;
        n.__uy=chosen.y;
        n.__uz=(random()-.5)*.055;

        n.x=n.__ux; n.y=n.__uy; n.z=n.__uz;

        n.__returning136=false;
        n.__settle136=0;
        n.__relaxFrames136=0;
      }

      this.__layoutReady136=true;
      this.__dragNode136=null;
      this.__dragStart136=null;
      this.__gesture136='none';
      this.__pointers136=new Map();
      this.__needsRelax136=true;
    };

    p.build=function(...args){
      const out=baseBuild.apply(this,args);
      this.__layout136();
      return out;
    };

    p.setModel=function(m){
      const out=baseSetModel.call(this,m);
      this.zoom=this.defaultZoom();
      this.panX=0;
      this.panY=0;
      this.rotX=.08;
      this.rotY=-.14;
      this.__pointers136=new Map();
      this.__gesture136='none';
      this.__needsRelax136=true;
      this.schedule?.();
      return out;
    };

    p.fit=function(){
      this.zoom=this.defaultZoom();
      this.panX=0;
      this.panY=0;
      this.rotX=.08;
      this.rotY=-.14;
      this.__needsRelax136=true;
      this.schedule?.();
    };

    p.__screenRadius136=function(n,q){
      const pnt=q||n._p||this.project(n);
      if(Number.isFinite(n._r)&&n._r>0)return n._r;
      return Math.max(7,visualBaseRadius(n)*(pnt?.depth||1));
    };

    p.__pixelsToWorld136=function(q){
      const depth=Math.max(.16,q?.depth||1);
      return Math.max(
        42,
        Math.min(this.w||1,this.h||1) *
        .62 *
        Math.max(.14,this.zoom||1) *
        depth
      );
    };

    // Kinematic overlap resolution only.
    // No stored pair velocities, no springing, no oscillation.
    p.__resolveContacts136=function({dragged=null, mode='split'}={}){
      const nodes=this.nodes||[];
      if(nodes.length<2)return false;

      let changed=false;
      const passes = dragged ? 7 : 3;

      for(let pass=0; pass<passes; pass++){
        let passChanged=false;

        for(let i=0;i<nodes.length;i++){
          const a=nodes[i];
          const pa=this.project(a);

          for(let j=i+1;j<nodes.length;j++){
            const b=nodes[j];
            const pb=this.project(b);

            let dx=pb.x-pa.x;
            let dy=pb.y-pa.y;
            let dist=Math.hypot(dx,dy);

            if(dist<.001){
              const ang=(hash(nodeKey(a)+':'+nodeKey(b))%6283)/1000;
              dx=Math.cos(ang);
              dy=Math.sin(ang);
              dist=1;
            }

            const ra=this.__screenRadius136(a,pa);
            const rb=this.__screenRadius136(b,pb);

            // Tiny neutral gap only.
            const minDist=ra+rb+3;

            if(dist>=minDist)continue;

            const overlap=minDist-dist;
            const nx=dx/dist;
            const ny=dy/dist;

            const sa=this.__pixelsToWorld136(pa);
            const sb=this.__pixelsToWorld136(pb);

            const aDragged = a===dragged;
            const bDragged = b===dragged;

            if(aDragged && !bDragged){
              // Move only active node.
              a.__ux -= nx*(overlap/sa);
              a.__uy -= ny*(overlap/sa);
              a.x=a.__ux; a.y=a.__uy;
            }else if(bDragged && !aDragged){
              b.__ux += nx*(overlap/sb);
              b.__uy += ny*(overlap/sb);
              b.x=b.__ux; b.y=b.__uy;
            }else{
              // Small single shared correction with no velocity memory.
              a.__ux -= nx*(overlap*.5/sa);
              a.__uy -= ny*(overlap*.5/sa);
              b.__ux += nx*(overlap*.5/sb);
              b.__uy += ny*(overlap*.5/sb);
              a.x=a.__ux; a.y=a.__uy;
              b.x=b.__ux; b.y=b.__uy;
            }

            passChanged=true;
            changed=true;
          }
        }

        if(!passChanged)break;
      }

      return changed;
    };

    p.__advanceReturn136=function(){
      let moving=false;

      for(const n of this.nodes||[]){
        if(!n.__returning136 || n===this.__dragNode136) continue;
        moving=true;

        // Monotonic easing to center, not spring physics.
        n.__ux *= 0.92;
        n.__uy *= 0.92;
        n.__uz *= 0.92;

        n.x=n.__ux; n.y=n.__uy; n.z=n.__uz;

        // Only resolve contact geometrically. No bounce.
        this.__resolveContacts136({dragged:n, mode:'dragged-only'});

        const remaining=Math.hypot(n.__ux,n.__uy);
        if(remaining<0.006){
          n.__returning136=false;
          n.__ux=0;
          n.__uy=0;
          n.__uz=0;
          n.x=0; n.y=0; n.z=0;
        }
      }

      return moving;
    };

    p.__hitNode136=function(e){
      const rect=this.canvas.getBoundingClientRect();
      const x=e.clientX-rect.left;
      const y=e.clientY-rect.top;

      let best=null;
      let bestDist=Infinity;

      const candidates=[...(this.nodes||[])].sort((a,b)=>{
        const pa=a._p||this.project(a);
        const pb=b._p||this.project(b);
        return (pb?.z||0)-(pa?.z||0);
      });

      for(const n of candidates){
        const q=n._p||this.project(n);
        if(!q)continue;

        const r=this.__screenRadius136(n,q)+16;
        const d=Math.hypot(q.x-x,q.y-y);

        if(d<=r && d<bestDist){
          best=n;
          bestDist=d;
        }
      }

      return best;
    };

    p.bind=function(){
      this.resizeObs=new ResizeObserver(()=>this.resize());
      this.resizeObs.observe(this.root);

      this.__pointers136=new Map();
      this.__gesture136='none';
      this.canvas.style.touchAction='none';

      this.canvas.addEventListener('pointerdown',e=>this.down(e),{passive:false});
      this.canvas.addEventListener('pointermove',e=>this.move(e),{passive:false});
      this.canvas.addEventListener('pointerup',e=>this.up(e),{passive:false});
      this.canvas.addEventListener('pointercancel',e=>this.up(e),{passive:false});

      this.canvas.addEventListener('wheel',e=>{
        e.preventDefault();
        this.zoom=clamp(this.zoom*(e.deltaY>0?.91:1.1),.14,3.6);
        this.__needsRelax136=true;
        this.schedule?.();
      },{passive:false});

      const fit=this.root.querySelector('.si-graph-fit');
      if(fit)fit.onclick=()=>this.fit();
    };

    p.down=function(e){
      e.preventDefault?.();

      this.__pointers136??=new Map();
      this.__pointers136.set(e.pointerId,{x:e.clientX,y:e.clientY});

      try{this.canvas.setPointerCapture?.(e.pointerId)}catch{}

      if(this.__pointers136.size>=2){
        const pts=[...this.__pointers136.values()].slice(0,2);

        this.__gesture136='pinch';
        this.__dragNode136=null;
        this.__dragStart136=null;
        this.__pinch136={
          distance:Math.max(1,Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y)),
          zoom:this.zoom
        };
        return;
      }

      const hit=this.__hitNode136(e);

      if(hit){
        this.__gesture136='node';
        this.__dragNode136=hit;
        this.__dragMoved136=false;

        hit.__returning136=false;

        const q=hit._p||this.project(hit);

        this.__dragStart136={
          pointerId:e.pointerId,
          clientX:e.clientX,
          clientY:e.clientY,
          x:hit.__ux??hit.x,
          y:hit.__uy??hit.y,
          z:hit.__uz??hit.z,
          depth:Math.max(.16,q?.depth||1)
        };
        return;
      }

      this.__gesture136='orbit';
      this.__orbitStart136={
        pointerId:e.pointerId,
        x:e.clientX,
        y:e.clientY,
        rx:this.rotX,
        ry:this.rotY
      };
    };

    p.move=function(e){
      if(this.__pointers136?.has(e.pointerId)){
        this.__pointers136.set(e.pointerId,{x:e.clientX,y:e.clientY});
      }

      if(this.__gesture136==='pinch'&&(this.__pointers136?.size||0)>=2){
        const pts=[...this.__pointers136.values()].slice(0,2);
        const d=Math.max(1,Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y));

        if(this.__pinch136?.distance){
          this.zoom=clamp(
            this.__pinch136.zoom*(d/this.__pinch136.distance),
            .14,3.6
          );
          this.__needsRelax136=true;
          this.schedule?.();
        }

        e.preventDefault?.();
        return;
      }

      if(this.__gesture136==='node'){
        const n=this.__dragNode136;
        const s=this.__dragStart136;
        if(!n||s?.pointerId!==e.pointerId)return;

        const dx=e.clientX-s.clientX;
        const dy=e.clientY-s.clientY;
        if(Math.abs(dx)+Math.abs(dy)>12)this.__dragMoved136=true;

        const scale=Math.max(
          44,
          Math.min(this.w||1,this.h||1)*.62*Math.max(.14,this.zoom||1)*s.depth
        );

        n.__ux=s.x+dx/scale;
        n.__uy=s.y+dy/scale;
        n.__uz=s.z;

        n.x=n.__ux; n.y=n.__uy; n.z=n.__uz;

        // Move only the active node to clear overlaps.
        this.__resolveContacts136({dragged:n, mode:'dragged-only'});

        this.schedule?.();
        e.preventDefault?.();
        return;
      }

      if(this.__gesture136==='orbit'){
        const s=this.__orbitStart136;
        if(!s||s.pointerId!==e.pointerId)return;

        const dx=e.clientX-s.x;
        const dy=e.clientY-s.y;

        this.rotY=s.ry+dx*.006;
        this.rotX=clamp(s.rx+dy*.004,-.8,.8);

        this.__needsRelax136=true;
        this.schedule?.();
        e.preventDefault?.();
      }
    };

    p.up=function(e){
      this.__pointers136?.delete(e.pointerId);
      try{this.canvas.releasePointerCapture?.(e.pointerId)}catch{}

      if(this.__gesture136==='node'){
        const n=this.__dragNode136;
        const s=this.__dragStart136;

        if(n&&s?.pointerId===e.pointerId){
          if(this.__dragMoved136){
            n.__returning136=true;
          }else{
            this.onSelect?.(n.kind,n.raw);
          }

          this.__dragNode136=null;
          this.__dragStart136=null;
          this.__dragMoved136=false;
          this.__gesture136='none';
          this.schedule?.();
          return;
        }
      }

      if(this.__gesture136==='pinch'){
        if((this.__pointers136?.size||0)<2){
          this.__pinch136=null;
          this.__gesture136='none';
          this.__needsRelax136=true;
          this.schedule?.();
        }
        return;
      }

      if(this.__gesture136==='orbit'){
        this.__orbitStart136=null;
        this.__gesture136='none';
        return;
      }

      this.__gesture136='none';
    };

    p.click=function(){};

    p.render=function(...args){
      if(!this.__layoutReady136&&(this.nodes||[]).length)this.__layout136();

      const returning=this.__advanceReturn136();

      // Only a few settling passes after load / zoom / rotation.
      let relaxing=false;
      if(this.__needsRelax136){
        relaxing=this.__resolveContacts136();
        this.__needsRelax136=false;
      }

      for(const n of this.nodes||[]){
        n.x=n.__ux??n.x;
        n.y=n.__uy??n.y;
        n.z=n.__uz??n.z;
      }

      const out=baseRender.apply(this,args);

      for(const n of this.nodes||[]){
        n.x=n.__ux??n.x;
        n.y=n.__uy??n.y;
        n.z=n.__uz??n.z;
      }

      if(returning||relaxing)this.schedule?.();
      return out;
    };
  }

  install();
})();
