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
