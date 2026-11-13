const IC={
overview:'<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>',
clients:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.700 1.900 6.500 5.500"/><path d="M16 4.500a3.500 3.500 0 010 7M18 14.800c1.800.7 3 2.400 3.500 5.200"/>',
creators:'<path d="M12 3l2.600 5.600 6 .7-4.500 4.100 1.200 6L12 16.500 6.700 19.400l1.200-6L3.400 9.300l6-.7z"/>',
market:'<path d="M4 8l1.500-4h13L20 8M4 8v11a1 1 0 001 1h14a1 1 0 001-1V8M4 8h16M9 12h6"/>',
orders:'<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/>',
beta:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3.500 7.500L12 13l8.500-5.500"/>',
push:'<path d="M6 16V11a6 6 0 1112 0v5l1.500 2h-15zM10 20a2 2 0 004 0"/>',
affiliate:'<path d="M10 14a4 4 0 005.700 0l3-3a4 4 0 00-5.700-5.700l-1 1M14 10a4 4 0 00-5.700 0l-3 3a4 4 0 005.700 5.700l1-1"/>',
settings:'<circle cx="12" cy="12" r="3"/><path d="M19.400 15a1.700 1.700 0 00.3 1.800l.1.1a2 2 0 11-2.800 2.800l-.1-.1a1.700 1.700 0 00-1.800-.3 1.700 1.700 0 00-1 1.500V21a2 2 0 11-4 0v-.1a1.700 1.700 0 00-1.100-1.500 1.700 1.700 0 00-1.800.3l-.1.1a2 2 0 11-2.800-2.800l.1-.1a1.700 1.700 0 00.3-1.800 1.700 1.700 0 00-1.500-1H3a2 2 0 110-4h.1a1.700 1.700 0 001.500-1.100 1.700 1.700 0 00-.3-1.800l-.1-.1a2 2 0 112.800-2.800l.1.100a1.700 1.700 0 001.800.3H9a1.700 1.700 0 001-1.500V3a2 2 0 114 0v.1a1.700 1.700 0 001 1.500 1.700 1.700 0 001.800-.3l.1-.1a2 2 0 112.800 2.800l-.1.1a1.700 1.700 0 00-.3 1.800V9a1.700 1.700 0 001.500 1H21a2 2 0 110 4h-.1a1.700 1.700 0 00-1.500 1z"/>',
search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.500-3.500"/>',
refresh:'<path d="M20 11a8 8 0 00-14.500-4M4 5v4h4M4 13a8 8 0 0014.500 4M20 19v-4h-4"/>',
user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1.200-4 4.200-6 8-6s6.800 2 8 6"/>',
bag:'<path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 016 0v2"/>',
mail:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3.500 7.500L12 13l8.500-5.500"/>',
shield:'<path d="M12 3l7 3v5c0 4.500-3 8-7 10-4-2-7-5.500-7-10V6z"/>',
clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.900 4.900l1.400 1.400M17.700 17.700l1.400 1.400M2 12h2M20 12h2M4.900 19.100l1.400-1.400M17.700 6.300l1.400-1.400"/>',
ext:'<path d="M7 17L17 7M8 7h9v9"/>'};
const ico=n=>`<svg viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;
const DONE=['overview','clients','creators','market','orders','beta','push','affiliate','settings'];
const NAV=[['overview','Overview','overview.html'],['clients','Clients','clients.html',''],['creators','Creators','creators.html',''],['market','Marketplace','marketplace.html',''],['orders','Orders & escrow','orders.html'],['beta','Beta whitelist','beta.html',''],['push','Push','push.html'],['affiliate','Affiliate catalog','affiliate.html'],['settings','Settings','settings.html']];
const href=n=>DONE.includes(n[0])?n[2]:'index.html';
function shell(active,me){
 const sb=document.getElementById('sb');
 sb.innerHTML=`<div class="brand"><b>PARURE</b><i>Operations</i></div><nav class="nav" aria-label="Admin">${NAV.map(n=>`<a href="${href(n)}" class="${n[0]===active?'on':''}">${ico(n[0])}${n[1]}${n[3]!==undefined?`<span class="ct" data-badge="${n[0]}" hidden></span>`:''}</a>`).join('')}</nav><div class="me"><div class="av">${(me&&me.initials)||'PA'}</div><div style="min-width:0"><b>${(me&&me.name)||'Parure Master Admin'}</b><small>${(me&&me.email)||''}</small></div><button class="btn" id="lo" style="margin-left:auto;padding:6px 10px">Log out</button></div>`;
 const p=document.createElement('div');p.className='pal';p.innerHTML=`<div class="box"><input placeholder="Search clients, orders, pages…" aria-label="Search"><div>${NAV.map(n=>`<a href="${href(n)}">${ico(n[0])}${n[1]}<span>Go to</span></a>`).join('')}</div></div>`;
 document.body.appendChild(p);
 const open=()=>{p.classList.add('on');p.querySelector('input').focus()},close=()=>p.classList.remove('on');
 document.querySelectorAll('[data-pal]').forEach(e=>e.addEventListener('click',open));
 p.addEventListener('click',e=>{if(e.target===p)close()});
 addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();open()}if(e.key==='Escape')close()});
 const t=document.getElementById('theme');if(t)t.addEventListener('click',()=>{const r=document.documentElement;r.dataset.theme=r.dataset.theme==='light'?'dark':'light';try{localStorage.setItem('pt',r.dataset.theme)}catch(e){}});
 try{const s=localStorage.getItem('pt');if(s)document.documentElement.dataset.theme=s}catch(e){}
}
function countUp(el){const to=parseFloat(el.dataset.to),pre=el.dataset.pre||'',dec=+el.dataset.dec||0,t0=performance.now(),d=1400;
 setTimeout(()=>{el.textContent=pre+to.toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec})},d+250);
 (function f(t){const k=Math.min(1,(t-t0)/d),e=1-Math.pow(1-k,4);el.textContent=pre+(to*e).toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec});if(k<1)requestAnimationFrame(f)})(t0)}

function setBadge(k,v){document.querySelectorAll('[data-badge="'+k+'"]').forEach(e=>{e.textContent=v;e.hidden=false;e.classList.toggle('hot',!v)})}
window.shellApi={setBadge};
