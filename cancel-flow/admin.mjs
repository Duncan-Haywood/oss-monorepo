// The owner dashboard at /admin. A static page: it holds no data and no key.
// You paste ADMIN_KEY into it; it keeps the key in this tab's memory only and
// sends it to /v1/summary and /v1/sessions on the same origin. Every dynamic
// string goes through textContent, never innerHTML.
export function renderAdminPage({ company = "cancel-flow" } = {}) {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Cancel flow results — ${esc(company)}</title>
<style>:root{font:15px system-ui,sans-serif;color:#1b1f2a;background:#f6f6fb}body{max-width:900px;margin:4vh auto;padding:0 16px}
h1{font-size:1.3rem}h2{font-size:1rem;margin:26px 0 8px}.card{background:#fff;border:1px solid #dcdbec;border-radius:12px;padding:16px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}.kpi b{display:block;font-size:1.5rem}.kpi span{color:#555}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #eceaf6;font-size:.9rem}th{color:#555;font-weight:600}
.bar{display:inline-block;height:10px;background:#4338ca;border-radius:3px;vertical-align:middle}.muted{color:#666}.banner{background:#fff4d6;border:1px solid #e8c766;padding:8px 12px;border-radius:8px;margin:10px 0}
input,button{font:inherit;padding:8px 10px;border-radius:8px;border:1px solid #b4b3d1}button{background:#4338ca;color:#fff;border:0;font-weight:700;cursor:pointer}.err{color:#a11}[hidden]{display:none}
@media (prefers-color-scheme:dark){:root{color:#e8e8f2;background:#14141c}.card{background:#1d1d29;border-color:#34344a}th,td{border-color:#2d2d40}.muted,th,.kpi span{color:#aaa}input{background:#14141c;color:inherit}}</style></head><body>
<h1>Cancel flow results</h1>
<form id="login" class="card"><label for="key">Admin key (the <code>ADMIN_KEY</code> you set on the server)</label><br>
<input id="key" type="password" autocomplete="off" size="36" required> <button>Show results</button>
<p class="muted">The key stays in this tab and goes only to this server. Nothing is stored.</p><p id="err" class="err" role="alert"></p></form>
<main id="out" hidden>
<div id="mode" class="banner" hidden>Test mode (DRY_RUN): offers are recorded but no subscription was changed.</div>
<div class="kpis" id="kpis"></div>
<h2>By reason</h2><div class="card"><table id="reasons"><thead><tr><th>Reason</th><th>Customers</th><th>Saved</th><th>Canceled</th><th>Save rate</th><th></th></tr></thead><tbody></tbody></table></div>
<div id="expwrap" hidden><h2>Offer tests</h2><div class="card"><table id="exp"><thead><tr><th>Reason</th><th>Arm</th><th>Offered</th><th>Saved</th><th>Save rate</th><th>p</th><th>Verdict</th></tr></thead><tbody></tbody></table></div></div>
<div id="wbwrap" hidden><h2>Win-back</h2><div class="card kpis" id="wb"></div></div>
<h2>Recent sessions</h2><div class="card"><table id="sess"><thead><tr><th>When</th><th>Reason</th><th>Offer</th><th>Outcome</th><th>Comment</th></tr></thead><tbody></tbody></table></div>
<p class="muted">Save rate is saved ÷ offered. Gaps between offers are noise until each arm has 30 offers. Export: <a id="dl" href="#" download="cancel-sessions.csv">sessions as CSV</a>.</p>
</main>
<script>
const $=(i)=>document.getElementById(i);let KEY="";
const el=(t,x,c)=>{const e=document.createElement(t);e.textContent=x==null?"":String(x);if(c)e.className=c;return e};
const pct=(n)=>n==null?"–":n+"%";
const money=(minor,cur)=>{try{return new Intl.NumberFormat(undefined,{style:"currency",currency:(cur||"usd").toUpperCase()}).format((minor||0)/100)}catch{return ((minor||0)/100).toFixed(2)}};
const row=(tb,cells)=>{const tr=document.createElement("tr");for(const c of cells)tr.append(c instanceof Node?c:el("td",c));tb.append(tr)};
const td=(n)=>{const c=document.createElement("td");c.append(n);return c};
const api=async(p)=>{const r=await fetch(p,{headers:{authorization:"Bearer "+KEY}});if(r.status===401)throw new Error("That key was not accepted.");if(!r.ok)throw new Error("The server returned "+r.status+".");return r.json()};
const csv=(rows)=>{const q=(v)=>'"'+String(v==null?"":v).replace(/"/g,'""').replace(/^([=+\\-@])/,"'$1")+'"';return rows.map((r)=>r.map(q).join(",")).join("\\n")};
async function load(){
  const [s,list]=await Promise.all([api("/v1/summary"),api("/v1/sessions")]);
  const cur=(list.find((x)=>x.currency)||{}).currency;
  $("mode").hidden=!s.dryRun;
  const k=$("kpis");k.replaceChildren();
  for(const [v,l] of [[s.started,"started"],[s.offered,"shown an offer"],[s.saved,"saved"],[pct(s.saveRate),"save rate"],[s.canceled,"canceled"],[money(s.monthlyKept,cur)+"/mo","kept by discounts"]]){const d=el("div","","card kpi");d.append(el("b",v),el("span",l));k.append(d)}
  const rb=$("reasons").tBodies[0];rb.replaceChildren();
  const max=Math.max(1,...Object.values(s.byReason).map((r)=>r.n));
  for(const [r,v] of Object.entries(s.byReason).sort((a,b)=>b[1].n-a[1].n)){const bar=document.createElement("span");bar.className="bar";bar.style.width=Math.round(v.n/max*120)+"px";
    row(rb,[r.replace(/_/g," "),v.n,v.saved,v.canceled,pct(v.n?Math.round(v.saved/v.n*1000)/10:null),td(bar)])}
  if(!Object.keys(s.byReason).length)row(rb,["No answers yet","","","","",""]);
  const eb=$("exp").tBodies[0];eb.replaceChildren();const ex=Object.entries(s.experiments||{});$("expwrap").hidden=!ex.length;
  for(const [r,arms] of ex)for(const [a,v] of Object.entries(arms))row(eb,[r.replace(/_/g," "),a+(a==="A"?" (control)":""),v.offered,v.saved,pct(v.saveRate),v.p==null?"–":v.p,v.verdict||"control"]);
  const w=s.winback;$("wbwrap").hidden=!w;if(w){const h=$("wb");h.replaceChildren();for(const [v,l] of [[w.emailed,"emailed"],[w.optedOut,"opted out"],[w.resubscribed,"resubscribed"],[pct(w.resubscribeRate),"resubscribe rate"]]){const d=el("div","","kpi");d.append(el("b",v),el("span",l));h.append(d)}}
  const sb=$("sess").tBodies[0];sb.replaceChildren();
  for(const x of list.slice().reverse().slice(0,50))row(sb,[x.at.slice(0,16).replace("T"," "),(x.reason||"").replace(/_/g," "),x.offer?x.offer.type:(x.shownHelp?"help":""),x.outcome||"open",x.comment||""]);
  const rows=[["at","reason","offer","outcome","comment"],...list.map((x)=>[x.at,x.reason,x.offer?x.offer.type:"",x.outcome,x.comment])];
  $("dl").href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv(rows));
  $("login").hidden=true;$("out").hidden=false;
}
$("login").addEventListener("submit",async(e)=>{e.preventDefault();KEY=$("key").value.trim();$("err").textContent="";try{await load()}catch(x){KEY="";$("err").textContent=x.message}});
</script></body></html>`;
}
