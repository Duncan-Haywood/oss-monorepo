// The script customers paste into their site. Served as /t.js; kept as a string so the tests can run it.
export const TRACKER = `(function(){
var s=document.currentScript,d=s.dataset,l=location,h=history,e=s.src.replace(/t\\.js(\\?.*)?$/,"e"),last,first=true;
if(d.ignoreDnt===undefined&&(navigator.doNotTrack==="1"||navigator.globalPrivacyControl))return;
function send(n,v){
if(!d.local&&/^(localhost|127\\.|\\[::1\\]|0\\.0\\.0\\.0)/.test(l.hostname))return;
if(navigator.webdriver||window.__nightmare||window.callPhantom)return;
var b=JSON.stringify({n:n,u:l.href,r:first?document.referrer:"",v:v});
if(navigator.sendBeacon&&navigator.sendBeacon(e,new Blob([b],{type:"text/plain"})))return;
fetch(e,{method:"POST",body:b,keepalive:true,headers:{"content-type":"text/plain"}}).catch(function(){})}
function pv(){var k=l.pathname+l.search;if(k===last)return;last=k;send("pageview");first=false}
if(h.pushState){var p=h.pushState;h.pushState=function(){p.apply(h,arguments);setTimeout(pv,0)};addEventListener("popstate",pv)}
window.visitKeeper=function(n,v){send(String(n),v)};
if(document.visibilityState==="prerender")document.addEventListener("visibilitychange",pv,{once:true});else pv()
})();
`;
