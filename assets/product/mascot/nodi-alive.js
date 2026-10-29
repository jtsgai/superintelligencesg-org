/* Nodi alive: pointer drag-to-turn, pointer/scroll tilt, tracking face nodes, blink, data packet. No deps. */
(()=>{const f=document.querySelector('.nodi');if(!f||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
const d=document.documentElement.style,q=s=>f.querySelector(s),N=['.nl','.nr','.nb'].map(q),ln=q('.nf-link'),pk=q('.nf-pkt'),P=[[252,352],[384,352],[317,417]];
let tx=0,ty=0,cx=0,cy=0,sy=0,vis=1,run=0,last=0,idle=9e3,bl=0,nb=2400;
const k=v=>Math.max(-1,Math.min(1,v));
let dr=null;const K=v=>Math.max(-3,Math.min(3,v));
f.addEventListener('pointerdown',e=>{if(f.classList.contains('is3d')||e.target.closest('button,a,model-viewer,.nodi-3d'))return;dr={x:e.clientX,y:e.clientY,tx,ty};f.classList.add('dragging');try{f.setPointerCapture(e.pointerId)}catch(_){}idle=0;go()});
f.addEventListener('pointermove',e=>{if(!dr)return;tx=K(dr.tx+(e.clientX-dr.x)/60);ty=Math.max(-1.6,Math.min(1.6,dr.ty+(e.clientY-dr.y)/80));idle=0;go()});
const up=()=>{if(!dr)return;dr=null;f.classList.remove('dragging');idle=1200};['pointerup','pointercancel','lostpointercapture'].forEach(n=>f.addEventListener(n,up));
addEventListener('pointermove',e=>{if(dr)return;const r=f.getBoundingClientRect();tx=k((e.clientX-r.left-r.width/2)/(innerWidth/2));ty=k((e.clientY-r.top-r.height*.45)/(innerHeight/2));idle=0;go()},{passive:true});
addEventListener('scroll',()=>{const r=f.getBoundingClientRect();sy=k(-r.top/r.height);go()},{passive:true});
new IntersectionObserver(e=>{vis=e[0].isIntersecting;go()}).observe(f);
function go(){if(vis&&!run){run=1;last=performance.now();requestAnimationFrame(loop)}}
function loop(t){const dt=Math.min(50,t-last);last=t;idle+=dt;
if(!dr&&idle>2500){tx=Math.sin(t/1900)*.55;ty=Math.sin(t/2600)*.35}
const g=dr?.25:.07;cx+=(tx-cx)*g;cy+=(ty-cy)*g;
d.setProperty('--nx',cx.toFixed(3));d.setProperty('--ny',cy.toFixed(3));d.setProperty('--sy',sy.toFixed(3));
let s=1;nb-=dt;if(nb<0){bl+=dt;s=Math.max(.1,Math.abs(1-bl/80));if(bl>160){bl=0;s=1;nb=2200+Math.random()*3400}}
if(ln){const p=P.map(([x,y],i)=>[x+cx*(i>1?16:22),y+cy*14]);
N.forEach((n,i)=>n.setAttribute('transform',`translate(${p[i][0].toFixed(1)} ${p[i][1].toFixed(1)}) scale(1 ${i<2?s.toFixed(2):1})`));
ln.setAttribute('points',p.map(a=>a.map(v=>v.toFixed(1)).join(',')).join(' '));
const u=(t/1600)%3,e=u|0,w=u-e,a=p[e],b=p[(e+1)%3];
pk.setAttribute('cx',(a[0]+(b[0]-a[0])*w).toFixed(1));pk.setAttribute('cy',(a[1]+(b[1]-a[1])*w).toFixed(1));
}
if(vis)requestAnimationFrame(loop);else run=0}})();
