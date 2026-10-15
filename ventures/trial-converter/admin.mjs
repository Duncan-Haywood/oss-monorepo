// Admin dashboard: one static page served at /admin. It holds no data; the
// browser sends your ADMIN_KEY (kept in sessionStorage, never in a URL) to
// /v1/summary and /v1/cases and renders the answer with textContent only.
export const ADMIN_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'";

export const ADMIN_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Trial Converter admin</title>
<style>
body{font:15px/1.5 system-ui,sans-serif;margin:0 auto;max-width:960px;padding:16px;color:#1a1a1a;background:#fff}
@media(prefers-color-scheme:dark){body{color:#eee;background:#111}th,td{border-color:#333!important}}
h1{font-size:20px}.cards{display:flex;flex-wrap:wrap;gap:12px;margin:12px 0}
.card{border:1px solid #8884;border-radius:8px;padding:8px 14px;min-width:110px}.card b{display:block;font-size:22px}
table{border-collapse:collapse;width:100%;display:block;overflow-x:auto}th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left;white-space:nowrap}
input,button{font:inherit;padding:6px 10px}.banner{padding:8px 12px;border-radius:6px;background:#fc03;margin:8px 0}
.err{color:#c00}
</style></head><body>
<h1>Trial Converter admin</h1>
<form id="f"><label>Admin key <input id="k" type="password" autocomplete="off" required></label> <button>Load</button> <span id="e" class="err" role="alert"></span></form>
<div id="b" class="banner" hidden></div><div id="s" class="cards"></div>
<table id="t" hidden><thead><tr><th>Subscription</th><th>Customer</th><th>Mode</th><th>Status</th><th>Next steps</th></tr></thead><tbody></tbody></table>
<p><small>Open source, MIT. <a href="https://github.com/sponsors/Duncan-Haywood" rel="noopener">Support the creator</a>. You operate this copy and are responsible for the emails it sends.</small></p>
<script>
var $=function(i){return document.getElementById(i)};
function td(tr,t){var c=document.createElement("td");c.textContent=t==null?"":String(t);tr.appendChild(c)}
async function get(p,k){var r=await fetch(p,{headers:{authorization:"Bearer "+k}});if(r.status===401)throw new Error("Wrong admin key");if(!r.ok)throw new Error("Server error "+r.status);return r.json()}
async function load(k){
  $("e").textContent="";
  try{
    var s=await get("/v1/summary",k),c=await get("/v1/cases",k);sessionStorage.setItem("dk",k);
    $("b").hidden=!s.dryRun;$("b").textContent="DRY RUN: nothing is emailed or extended until you set DRY_RUN=false.";
    var box=$("s");box.textContent="";
    Object.keys(s).filter(function(n){return typeof s[n]!=="object"&&n!=="dryRun"}).forEach(function(n){var d=document.createElement("div");d.className="card";var b=document.createElement("b");b.textContent=s[n];d.appendChild(b);d.appendChild(document.createTextNode(n));box.appendChild(d)});
    var tb=$("t").querySelector("tbody");tb.textContent="";
    c.forEach(function(x){var tr=document.createElement("tr");td(tr,x.subscription);td(tr,x.customer);td(tr,x.hasCard?"card":"no card");td(tr,x.status);
      td(tr,(x.steps||[]).filter(function(t){return t.status==="pending"}).map(function(t){return t.kind+" "+t.at.slice(0,10)}).join(", "));tb.appendChild(tr)});
    $("t").hidden=false;
  }catch(err){$("e").textContent=err.message;try{sessionStorage.removeItem("dk")}catch(_){}}
}
$("f").addEventListener("submit",function(ev){ev.preventDefault();load($("k").value)});
try{var k=sessionStorage.getItem("dk");if(k){$("k").value=k;load(k)}}catch(_){}
</script></body></html>
`;
