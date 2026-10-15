// The /admin dashboard: one static page that calls this server's own /v1 API
// with the admin key you type in (kept in sessionStorage only). No third party.
export const ADMIN_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>webhook-relay</title>
<style>:root{font:15px system-ui,sans-serif;color:#1b1f2a;background:#f4f5f8}body{max-width:1000px;margin:auto;padding:20px}table{width:100%;border-collapse:collapse;background:#fff}th,td{text-align:left;padding:8px;border-bottom:1px solid #e3e5ea;font-size:.9rem}th{font-size:.75rem;text-transform:uppercase;color:#555}button,select,input{font:inherit;padding:6px 10px}code{background:#eceef3;padding:1px 5px;border-radius:4px}.pending{color:#9a6700}.delivered{color:#1a7f37}.dead{color:#cf222e}pre{background:#fff;padding:12px;overflow:auto;max-height:260px}</style></head><body>
<h1>webhook-relay</h1><p><label>Admin key <input id="key" type="password" autocomplete="off"></label> <button id="go">Load</button> <select id="st"><option value="">all</option><option>pending</option><option>delivered</option><option>dead</option></select></p>
<p id="sum"></p><table><thead><tr><th>Event</th><th>Route</th><th>Status</th><th>Tries</th><th>Next / last</th><th></th></tr></thead><tbody id="rows"></tbody></table><h2>Event</h2><pre id="detail">Select an event.</pre>
<script>
const $=(i)=>document.getElementById(i);$("key").value=sessionStorage.getItem("k")||"";
const api=async(p,o={})=>{const r=await fetch(p,{...o,headers:{authorization:"Bearer "+$("key").value}});if(!r.ok)throw new Error(r.status+" "+await r.text());return r.json()};
const esc=(s)=>String(s).replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const when=(t)=>t?new Date(t).toLocaleString():"-";
async function load(){try{sessionStorage.setItem("k",$("key").value);const s=await api("/v1/summary");$("sum").textContent=s.total+" events: "+s.pending+" pending, "+s.delivered+" delivered, "+s.dead+" dead";
const l=await api("/v1/events"+($("st").value?"?status="+$("st").value:""));
$("rows").innerHTML=l.map((e)=>{const a=e.attempts[e.attempts.length-1];return "<tr><td><code>"+esc(e.id)+"</code></td><td>"+esc(e.route)+"</td><td class='"+e.status+"'>"+e.status+"</td><td>"+e.attempts.length+"</td><td>"+when(e.status==="pending"?e.nextAt:a&&a.at)+"</td><td><button data-v='"+esc(e.id)+"'>View</button> <button data-r='"+esc(e.id)+"'>Replay</button></td></tr>"}).join("")}catch(e){$("sum").textContent=String(e.message)}}
document.addEventListener("click",async(ev)=>{const t=ev.target;if(t.dataset.v){const e=await api("/v1/events/"+t.dataset.v);let b=atob(e.bodyB64);$("detail").textContent=JSON.stringify({...e,bodyB64:undefined,body:b.slice(0,4000)},null,2)}
if(t.dataset.r){await api("/v1/events/"+t.dataset.r+"/replay",{method:"POST"});load()}});
$("go").onclick=load;$("st").onchange=load;if($("key").value)load();
</script></body></html>`;
