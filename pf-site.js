(function(){
try{
if(navigator.doNotTrack==='1'||navigator.globalPrivacyControl===true)return;
if(localStorage.getItem('portfolio-hub-optout')==='1')return;
var tag=document.querySelector('script[data-pf-slug]');
var slug=tag?tag.getAttribute('data-pf-slug')||'':'';
if(!slug)return;
var k='portfolio-hub-usage';
var bump=function(event){
try{
var c=JSON.parse(localStorage.getItem(k)||'{}');
c[event]=(c[event]||0)+1;
c.last_day=new Date().toISOString().slice(0,10);
localStorage.setItem(k,JSON.stringify(c));
}catch(e){}
};
bump('tool_viewed:'+slug);
document.addEventListener('click',function(e){
var t=e.target&&e.target.closest?e.target:null;
if(!t)return;
var a=t.closest('[data-pf-to]');
if(a)bump('cross_tool_click:'+a.getAttribute('data-pf-to'));
if(t.closest('[data-pf-sponsor]'))bump('sponsor_link_clicked');
});
}catch(e){}
})();
(function(){
var candidates=[];
var tables=0;
var collect=function(){
var bare=document.getElementsByTagName('table');
for(var b=bare.length-1;b>=0;b--){
var t=bare[b];
var p=t.parentElement;
if(!p)continue;
if(p.className==="pf-table-scroll")continue;
if(p.closest&&p.closest('table'))continue;
var box=document.createElement('div');
box.className="pf-table-scroll";
p.insertBefore(box,t);
box.appendChild(t);
}
candidates=[];
var all=document.body?document.body.getElementsByTagName('*'):[];
for(var i=0;i<all.length;i++){
var o=getComputedStyle(all[i]).overflowX;
if(o==='auto'||o==='scroll')candidates.push(all[i]);
}
tables=document.getElementsByTagName('table').length;
};
var measure=function(){
for(var i=0;i<candidates.length;i++){
var el=candidates[i];
if(el.scrollWidth>el.clientWidth+1){
if(!el.hasAttribute('tabindex')){
el.setAttribute('tabindex','0');
el.setAttribute('data-pf-scrollable','');
}
}else if(el.hasAttribute('data-pf-scrollable')){
el.removeAttribute('tabindex');
el.removeAttribute('data-pf-scrollable');
}
}
};
var full=function(){try{collect();measure();}catch(e){}};
var quick=function(){
try{
if(document.getElementsByTagName('table').length!==tables){collect();}
measure();
}catch(e){}
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',full);
else full();
addEventListener('resize',full);
addEventListener('input',quick);
addEventListener('change',quick);
addEventListener('click',quick);
})();
(function(){
try{
var tag=document.currentScript;
var root=tag&&tag.src?new URL('./',tag.src).href:null;
if(!root)return;
var mod=root+'pf-assistant.js',p=null;
var get=function(){return p||(p=import(mod));};
var go=function(opts,fallback){get().then(function(m){m.open(opts);},function(){if(fallback)location.href=fallback;});};
addEventListener('click',function(e){
var a=e.target&&e.target.closest?e.target.closest('a[data-pfs-nav="ask"]'):null;
if(!a||e.button||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||document.getElementById('ask-app'))return;
e.preventDefault();
go({opener:a},a.href);
},true);
var warm=function(e){
if(p||!e.target||!e.target.closest||!e.target.closest('a[data-pfs-nav="ask"],.pf-ask-voice'))return;
var l=document.createElement('link');l.rel='modulepreload';l.href=mod;document.head.appendChild(l);
removeEventListener('pointerover',warm,true);
};
addEventListener('pointerover',warm,true);
var ready=function(){
var main=document.querySelector('main')||document.body;
if(window.top===window&&main&&main.querySelectorAll('input[type=number],input[inputmode=decimal],input[inputmode=numeric]').length>1&&!document.querySelector('.pf-ask-voice')){
var b=document.createElement('button');
b.type='button';b.className='pf-ask-voice';
b.setAttribute('aria-label','Fill this calculator by voice or chat');
b.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12z"/></svg><span>Speak or type</span>';
b.addEventListener('click',function(){go({opener:b});});
var s=document.createElement('style');
s.textContent='.pf-ask-voice{position:fixed;right:16px;bottom:16px;z-index:2147482000;display:inline-flex;align-items:center;gap:6px;padding:10px 14px;margin:0;border:0;border-radius:999px;background:#12594a;color:#fff;font:600 14px/1 system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer}.pf-ask-voice:focus-visible{outline:3px solid #f59f00;outline-offset:2px}@media (max-width:560px){.pf-ask-voice span{display:none}.pf-ask-voice{padding:12px}}@media print{.pf-ask-voice{display:none}}';
document.head.appendChild(s);document.body.appendChild(b);
}
if(navigator.modelContext)get().then(function(m){m.registerAgentTools();},function(){});
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
}catch(e){}
})();
