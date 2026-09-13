/* === SOURCE: si-graph-current-v171.js === */
/* Shadow Intelligence — Micro Swarm Physics v1.7.1
   Compatible with the consolidated runtime.
   Does NOT require editing si-graph.js text signatures.
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

  function nodeKey(n){
    const r=n?.raw||{};
    return String(r.id||r.mint||r.address||r.name||r.symbol||n?.kind||'node');
  }

  function install(){
    const Graph=window.ShadowGraph;
    if(!Graph?.prototype){setTimeout(install,20);return}

    const p=Graph.prototype;
    if(p.__shadowMicroSwarm171)return;
    p.__shadowMicroSwarm171=true;

    const baseBuild=p.build;
    const baseSetModel=p.setModel;
    const baseRender=p.render;
    const baseDrawNode=p.drawNode;

    // Halve visible node radius WITHOUT changing the base file.
    // During drawNode only, project().depth is presented at 50%.
    p.drawNode=function(n){
      const realProject=this.project;
      this.project=function(node){
        const q=realProject.call(this,node);
        return {...q,depth:q.depth*.5};
      };
      try{
        return baseDrawNode.call(this,n);
      }finally{
        this.project=realProject;
      }
    };

    p.defaultZoom=function(){
      const n=this.nodes?.length||0;
      if(n>=140)return .22;
      if(n>=100)return .25;
      if(n>=70)return .28;
      if(n>=50)return .32;
      if(n>=30)return .38;
      if(n>=18)return .46;
      if(n>=10)return .54;
      return .64;
    };

    p.__initMicro171=function(){
      const nodes=this.nodes||[];
      if(!nodes.length)return;

      const total=nodes.length;
      const spread=
        total>=140?1.95:
        total>=100?1.82:
        total>=70?1.68:
        total>=50?1.54:
        total>=30?1.38:
        total>=18?1.22:
        total>=10?1.10:1.02;

      const golden=2.399963229728653;

      nodes.forEach((n,i)=>{
        const seed=hash(nodeKey(n)+':'+n.kind+':micro171');
        const j1=((seed&1023)/1023)-.5;
        const j2=(((seed>>>10)&1023)/1023)-.5;

        const fraction=Math.sqrt((i+.7)/Math.max(1,total));
        const angle=i*golden+j1*.82;
        const rr=.18+fraction*(spread-.18)+j2*.16;

        n.__mx=Math.cos(angle)*rr;
        n.__my=Math.sin(angle)*rr*.92;
        n.__mz=((((seed>>>20)&1023)/1023)-.5)*.08;

        n.__mvx=0;
        n.__mvy=0;
        n.__mvz=0;

        n.__phase1=(seed%6283)/1000;
        n.__phase2=((seed>>>8)%6283)/1000;
        n.__freq1=.00030+((seed>>>16)%100)*.0000014;
        n.__freq2=.00023+((seed>>>23)%80)*.0000012;

        n.x=n.__mx;
        n.y=n.__my;
        n.z=n.__mz;
      });

      this.__microReady171=true;
      this.__dragNode171=null;
      this.__dragStart171=null;
      this.__dragMoved171=false;
      this.__gesture171='none';
      this.__pointers171=new Map();
      this.__lastPhysics171=performance.now();
    };

    p.build=function(...args){
      const out=baseBuild.apply(this,args);
      this.__initMicro171();
      return out;
    };

    p.setModel=function(m){
      const out=baseSetModel.call(this,m);
      this.zoom=this.defaultZoom();
      this.panX=0;
      this.panY=0;
      this.rotX=.08;
      this.rotY=-.14;
      this.__pointers171=new Map();
      this.__gesture171='none';
      this.schedule?.();
      return out;
    };

    p.fit=function(){
      this.zoom=this.defaultZoom();
      this.panX=0;
      this.panY=0;
      this.rotX=.08;
      this.rotY=-.14;
      this.schedule?.();
    };

    // Visual radius is the actual _r produced by the halved drawNode wrapper.
    p.__radius171=function(n,q){
      if(Number.isFinite(n._r)&&n._r>0)return n._r;
      const base=n.kind==='entity'?22:14;
      return Math.max(5,base*(q?.depth||1));
    };

    p.__pixelScale171=function(q){
      return Math.max(
        38,
        Math.min(this.w||1,this.h||1)*
        .62*
        Math.max(.12,this.zoom||1)*
        Math.max(.16,q?.depth||1)
      );
    };

    p.__sync171=function(){
      for(const n of this.nodes||[]){
        n.x=n.__mx??n.x;
        n.y=n.__my??n.y;
        n.z=n.__mz??n.z;
      }
    };

    // Position correction only + zero restitution.
    // Objects separate when touching but never repeatedly spring apart.
    p.__contacts171=function(dragged=null){
      const nodes=this.nodes||[];
      if(nodes.length<2)return false;
      let touched=false;

      for(let pass=0;pass<4;pass++){
        let changed=false;
        this.__sync171();

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

            const ra=this.__radius171(a,pa);
            const rb=this.__radius171(b,pb);
            const minDist=ra+rb+3;

            if(dist>=minDist)continue;

            const nx=dx/dist;
            const ny=dy/dist;
            const overlap=minDist-dist;
            const sa=this.__pixelScale171(pa);
            const sb=this.__pixelScale171(pb);

            if(a===dragged && b!==dragged){
              a.__mx-=nx*(overlap/sa);
              a.__my-=ny*(overlap/sa);
              a.__mvx=0;
              a.__mvy=0;
            }else if(b===dragged && a!==dragged){
              b.__mx+=nx*(overlap/sb);
              b.__my+=ny*(overlap/sb);
              b.__mvx=0;
              b.__mvy=0;
            }else{
              a.__mx-=nx*(overlap*.5/sa);
              a.__my-=ny*(overlap*.5/sa);
              b.__mx+=nx*(overlap*.5/sb);
              b.__my+=ny*(overlap*.5/sb);

              // Kill incoming normal velocity. No bounce impulse.
              const rvx=(b.__mvx||0)-(a.__mvx||0);
              const rvy=(b.__mvy||0)-(a.__mvy||0);
              const normalSpeed=rvx*nx+rvy*ny;
              if(normalSpeed<0){
                const correction=-normalSpeed*.5;
                a.__mvx-=nx*correction;
                a.__mvy-=ny*correction;
                b.__mvx+=nx*correction;
                b.__mvy+=ny*correction;
              }

              a.__mvx*=.42;
              a.__mvy*=.42;
              b.__mvx*=.42;
              b.__mvy*=.42;
            }

            touched=true;
            changed=true;
          }
        }

        if(!changed)break;
      }

      this.__sync171();
      return touched;
    };

    p.__physics171=function(now){
      if(!this.__microReady171)return false;

      const dt=clamp((now-(this.__lastPhysics171||now))/16.667,.35,2.2);
      this.__lastPhysics171=now;

      for(const n of this.nodes||[]){
        if(n===this.__dragNode171)continue;

        const noiseX=
          Math.sin(now*n.__freq1+n.__phase1)*.000080+
          Math.cos(now*n.__freq2+n.__phase2)*.000052;
        const noiseY=
          Math.cos(now*n.__freq1*.91+n.__phase2)*.000080+
          Math.sin(now*n.__freq2*1.07+n.__phase1)*.000052;

        // Organic wandering + weak center gravity.
        const fx=(-n.__mx*.00020)+noiseX;
        const fy=(-n.__my*.00020)+noiseY;
        const fz=(-n.__mz*.00010);

        n.__mvx=((n.__mvx||0)+fx*dt)*.925;
        n.__mvy=((n.__mvy||0)+fy*dt)*.925;
        n.__mvz=((n.__mvz||0)+fz*dt)*.94;

        n.__mx+=n.__mvx*dt;
        n.__my+=n.__mvy*dt;
        n.__mz+=n.__mvz*dt;

        const d=Math.hypot(n.__mx,n.__my);
        if(d>2.18){
          const k=2.18/d;
          n.__mx*=k;
          n.__my*=k;
          n.__mvx*=.35;
          n.__mvy*=.35;
        }
      }

      this.__sync171();
      this.__contacts171(null);
      return true;
    };

    p.__hit171=function(e){
      const rect=this.canvas.getBoundingClientRect();
      const x=e.clientX-rect.left;
      const y=e.clientY-rect.top;
      let best=null,bd=Infinity;

      for(const n of this.nodes||[]){
        const q=n._p||this.project(n);
        if(!q)continue;
        const r=this.__radius171(n,q)+14;
        const d=Math.hypot(q.x-x,q.y-y);
        if(d<=r&&d<bd){
          best=n;
          bd=d;
        }
      }
      return best;
    };

    p.bind=function(){
      this.resizeObs=new ResizeObserver(()=>this.resize());
      this.resizeObs.observe(this.root);

      this.__pointers171=new Map();
      this.__gesture171='none';
      this.canvas.style.touchAction='none';

      this.canvas.addEventListener('pointerdown',e=>this.down(e),{passive:false});
      this.canvas.addEventListener('pointermove',e=>this.move(e),{passive:false});
      this.canvas.addEventListener('pointerup',e=>this.up(e),{passive:false});
      this.canvas.addEventListener('pointercancel',e=>this.up(e),{passive:false});

      this.canvas.addEventListener('wheel',e=>{
        e.preventDefault();
        this.zoom=clamp(this.zoom*(e.deltaY>0?.91:1.1),.12,3.8);
        this.schedule?.();
      },{passive:false});

      const fit=this.root.querySelector('.si-graph-fit');
      if(fit)fit.onclick=()=>this.fit();
    };

    p.down=function(e){
      e.preventDefault?.();

      this.__pointers171??=new Map();
      this.__pointers171.set(e.pointerId,{x:e.clientX,y:e.clientY});
      try{this.canvas.setPointerCapture?.(e.pointerId)}catch{}

      if(this.__pointers171.size>=2){
        const pts=[...this.__pointers171.values()].slice(0,2);
        this.__gesture171='pinch';
        this.__dragNode171=null;
        this.__dragStart171=null;
        this.__pinch171={
          distance:Math.max(1,Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y)),
          zoom:this.zoom
        };
        return;
      }

      const hit=this.__hit171(e);
      if(hit){
        this.__gesture171='node';
        this.__dragNode171=hit;
        this.__dragMoved171=false;
        hit.__mvx=hit.__mvy=hit.__mvz=0;

        const q=hit._p||this.project(hit);
        this.__dragStart171={
          pointerId:e.pointerId,
          clientX:e.clientX,
          clientY:e.clientY,
          x:hit.__mx??hit.x,
          y:hit.__my??hit.y,
          z:hit.__mz??hit.z,
          depth:Math.max(.16,q?.depth||1)
        };
        return;
      }

      this.__gesture171='orbit';
      this.__orbit171={
        pointerId:e.pointerId,
        x:e.clientX,
        y:e.clientY,
        rx:this.rotX,
        ry:this.rotY
      };
    };

    p.move=function(e){
      if(this.__pointers171?.has(e.pointerId)){
        this.__pointers171.set(e.pointerId,{x:e.clientX,y:e.clientY});
      }

      if(this.__gesture171==='pinch'&&(this.__pointers171?.size||0)>=2){
        const pts=[...this.__pointers171.values()].slice(0,2);
        const d=Math.max(1,Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y));
        if(this.__pinch171?.distance){
          this.zoom=clamp(this.__pinch171.zoom*(d/this.__pinch171.distance),.12,3.8);
          this.schedule?.();
        }
        e.preventDefault?.();
        return;
      }

      if(this.__gesture171==='node'){
        const n=this.__dragNode171;
        const s=this.__dragStart171;
        if(!n||s?.pointerId!==e.pointerId)return;

        const dx=e.clientX-s.clientX;
        const dy=e.clientY-s.clientY;

        if(Math.abs(dx)+Math.abs(dy)>12)this.__dragMoved171=true;

        const scale=Math.max(
          38,
          Math.min(this.w||1,this.h||1)*
          .62*
          Math.max(.12,this.zoom||1)*
          s.depth
        );

        n.__mx=s.x+dx/scale;
        n.__my=s.y+dy/scale;
        n.__mz=s.z;
        n.__mvx=n.__mvy=n.__mvz=0;

        this.__sync171();
        this.__contacts171(n);
        this.schedule?.();
        e.preventDefault?.();
        return;
      }

      if(this.__gesture171==='orbit'){
        const s=this.__orbit171;
        if(!s||s.pointerId!==e.pointerId)return;

        const dx=e.clientX-s.x;
        const dy=e.clientY-s.y;
        this.rotY=s.ry+dx*.006;
        this.rotX=clamp(s.rx+dy*.004,-.8,.8);
        this.schedule?.();
        e.preventDefault?.();
      }
    };

    p.up=function(e){
      this.__pointers171?.delete(e.pointerId);
      try{this.canvas.releasePointerCapture?.(e.pointerId)}catch{}

      if(this.__gesture171==='node'){
        const n=this.__dragNode171;
        const s=this.__dragStart171;

        if(n&&s?.pointerId===e.pointerId){
          if(!this.__dragMoved171){
            this.onSelect?.(n.kind,n.raw);
          }

          // No throw velocity; weak center gravity resumes.
          n.__mvx=n.__mvy=n.__mvz=0;

          this.__dragNode171=null;
          this.__dragStart171=null;
          this.__dragMoved171=false;
          this.__gesture171='none';
          this.schedule?.();
          return;
        }
      }

      if(this.__gesture171==='pinch'){
        if((this.__pointers171?.size||0)<2){
          this.__pinch171=null;
          this.__gesture171='none';
        }
        return;
      }

      if(this.__gesture171==='orbit'){
        this.__orbit171=null;
        this.__gesture171='none';
        return;
      }

      this.__gesture171='none';
    };

    p.click=function(){};

    p.render=function(...args){
      if(!this.__microReady171&&(this.nodes||[]).length)this.__initMicro171();

      this.__physics171(performance.now());
      this.__sync171();

      const out=baseRender.apply(this,args);

      // Stop base renderer's own drift from accumulating.
      this.__sync171();

      return out;
    };
  }

  install();
})();
/* === SOURCE: si-interaction-recovery.js === */
/* Shadow Interaction Recovery v1.4.0 */
(() => {
  const interactiveSelector = [
    '.si-immersive-dock button',
    'button[data-nav]',
    '[data-entity]',
    '[data-token]',
    '[data-open]',
    '[data-user]',
    '.si-entity-chip',
    '.si-entity-card',
    '.si-token-card',
    '.si-conversation',
    '.si-button',
    '#userButton',
    '#themeToggle',
    '#addEntityBtn',
    '#entitiesAddBtn',
    '#evidenceAddBtn',
    '#modalClose',
    '.si-sheet-close'
  ].join(',');

  function removeOldChromeArtifacts(){
    document.querySelectorAll('.shadow-window-chrome').forEach(el=>el.remove());

    document.querySelectorAll('.shadow-window-chrome-host').forEach(el=>{
      el.classList.remove('shadow-window-chrome-host');
      delete el.dataset.shadowWindowBottom;
      delete el.dataset.shadowWindowPanel;
      delete el.dataset.shadowWindowChromed;
    });

    document.querySelectorAll('[data-shadow-handle-hidden]').forEach(el=>{
      el.removeAttribute('data-shadow-handle-hidden');
      el.style.removeProperty('opacity');
      el.style.removeProperty('visibility');
      el.style.removeProperty('pointer-events');
    });

    document.querySelectorAll('[data-shadow-close-moved]').forEach(el=>{
      el.removeAttribute('data-shadow-close-moved');
    });
  }

  function repairPointerEvents(){
    document.querySelectorAll(interactiveSelector).forEach(el=>{
      el.style.pointerEvents='auto';
      el.style.touchAction='manipulation';
    });

    document.querySelectorAll('.si-page:not(#page-overview)').forEach(el=>{
      el.style.pointerEvents = el.classList.contains('active-page') ? 'auto' : 'none';
    });

    const modal=document.querySelector('.si-modal');
    if(modal){
      modal.style.pointerEvents = modal.classList.contains('hidden') ? 'none' : 'auto';
    }
  }

  function run(){
    removeOldChromeArtifacts();
    repairPointerEvents();
  }

  let raf=0;
  const queue=()=>{
    if(raf)return;
    raf=requestAnimationFrame(()=>{
      raf=0;
      run();
    });
  };

  document.addEventListener('DOMContentLoaded',queue,{once:true});
  window.addEventListener('load',queue,{once:true});

  new MutationObserver(queue).observe(document.documentElement,{
    subtree:true,
    childList:true,
    attributes:true,
    attributeFilter:['class','style','aria-hidden']
  });

  run();
})();
