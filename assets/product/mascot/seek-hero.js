/* Deterministic entrance: window.seek(t) is a pure function of t (seconds) -> CSS vars. No randomness, no clock inside.
   After entrance, nodi-alive.js (drag/tilt via --nx/--ny/--sy) is loaded; scroll writes only --scroll. */
(async()=>{
const root=document.documentElement, $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let C={timing:{duration:2.4,nodi:[0,1.1],copy:[.15,.9],tags:[.9,1.6],perks:[.8,2.2],form:[1.4,2.4]},scroll:{tagsRevealPx:160}};
try{const j=await (await fetch('/assets/product/mascot/campaign.json',{cache:'no-store'})).json();C={...C,...j,timing:{...C.timing,...j.timing}}}catch(_){}
if(C.colors?.primary)root.style.setProperty('--accent',C.colors.primary);
if(C.colors?.sage)root.style.setProperty('--sage',C.colors.sage);
if(C.copy){const c=C.copy;c.tagline&&($('.fold .tagline').textContent=c.tagline);c.titleHtml&&($('.fold h1').innerHTML=c.titleHtml);c.lede&&($('.fold .lede').textContent=c.lede)}
const T=C.timing, clamp=v=>Math.max(0,Math.min(1,v)), ease=x=>1-Math.pow(1-x,3);
const win=([a,b],t)=>ease(clamp((t-a)/(b-a)));
const perks=$$('.fold .perks li'), tags=$$('.fold .nodi-tag');
const set=(el,k,v)=>el&&el.style.setProperty(k,v.toFixed(4));
window.seek=t=>{
  set(root,'--enter',win(T.nodi,t));
  set($('.fold .hero-copy'),'--e',win(T.copy,t));
  set($('.fold .signup'),'--e',win(T.form,t)); set($('.fold .fine'),'--e',win(T.form,t));
  const [a,b]=T.perks, st=(b-a)/Math.max(1,perks.length);
  perks.forEach((li,i)=>set(li,'--e',win([a+i*st*.6,a+i*st*.6+st*1.6],t)));
  tags.forEach((g,i)=>set(g,'--e',win([T.tags[0]+i*.2,T.tags[1]+i*.2],t)));
  return t;
};
window.campaign=C;
const startAlive=()=>{root.classList.add('entered');const s=document.createElement('script');s.src='/assets/product/mascot/nodi-alive.js';document.body.appendChild(s)};
const scrollSeek=()=>set(root,'--scroll',clamp(scrollY/(C.scroll?.tagsRevealPx||160)));
addEventListener('scroll',scrollSeek,{passive:true});scrollSeek();
const q=new URLSearchParams(location.search);
if(matchMedia('(prefers-reduced-motion: reduce)').matches){seek(1e9);root.classList.add('entered');return}  // 终态，无动画，不加载拖拽
if(q.has('t')){seek(+q.get('t'));return}  // ?t=1.2 冻结某帧（截图/质检）
const t0=performance.now();
(function f(n){const t=(n-t0)/1000;seek(t);t<T.duration?requestAnimationFrame(f):(seek(T.duration),startAlive())})(t0);
})();
