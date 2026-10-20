// Server-rendered signing page, certificate and admin page. Everything dynamic goes through esc().
import { CONSENT_TEXT } from "./store.mjs";
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const color = (c) => (/^#[0-9a-fA-F]{6}$/.test(c || "") ? c : "#0f766e");
const when = (t) => new Date(t).toISOString().replace("T", " ").slice(0, 19) + " UTC";

const shell = (c, title, body, noindex = true) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${noindex ? '<meta name="robots" content="noindex">' : ""}<title>${esc(title)}</title>
<style>body{font:16px system-ui,sans-serif;max-width:42rem;margin:2rem auto;padding:0 1rem;color:#111827}h1{color:${color(c)};font-size:1.5rem}label{display:block;font-weight:600;margin:.8rem 0 .2rem}
input,textarea,button{font:inherit;padding:.55rem .7rem;border-radius:8px;border:1px solid #9ca3af;width:100%;box-sizing:border-box}input[type=checkbox]{width:auto}button{background:${color(c)};color:#fff;border:0;font-weight:700;cursor:pointer;margin-top:1rem}
button.alt{background:#fff;color:#374151;border:1px solid #9ca3af}.hp{position:absolute;left:-9999px;height:0;overflow:hidden}.note{font-size:.85rem;color:#4b5563}.err{color:#b91c1c;font-weight:700}
.doc{white-space:pre-wrap;border:1px solid #d1d5db;border-radius:10px;padding:1rem;background:#fafafa;max-height:26rem;overflow:auto;font:15px/1.5 Georgia,serif}.card{border:1px solid #e5e7eb;border-radius:10px;padding:.7rem 1rem;margin:.6rem 0}
code{font-size:.8rem;word-break:break-all}table{border-collapse:collapse;width:100%;font-size:.88rem}td,th{text-align:left;padding:5px 6px;border-bottom:1px solid #e5e7eb;vertical-align:top}
@media print{button,.noprint{display:none}}</style></head><body>${body}</body></html>`;

export function renderSign({ r, company, color: c, error, token }) {
  return shell(c, r.title, `<h1>${esc(r.title)}</h1><p class="note">Requested by ${esc(company)}. Read the whole document, then sign at the bottom. Document fingerprint (SHA-256): <code>${esc(r.docHash)}</code></p>
<div class="doc" tabindex="0">${esc(r.body)}</div>${error ? `<p class="err" role="alert">${esc(error)}</p>` : ""}
<form method="post" action="/s/${esc(token)}"><label for="name">Type your full name to sign${r.signerName ? ` (${esc(r.signerName)})` : ""}</label><input id="name" name="name" required maxlength="100" autocomplete="name">
<div class="hp" aria-hidden="true"><label>Leave blank<input name="website" tabindex="-1" autocomplete="off"></label></div>
<label style="font-weight:400"><input type="checkbox" name="consent" value="on" required> ${esc(CONSENT_TEXT)}</label>
<button name="action" value="sign">Sign document</button><button class="alt" name="action" value="decline" formnovalidate>Decline to sign</button></form>
<p class="note">Your typed name, the time, and a hashed network identifier are recorded with this document. This is a simple electronic signature; ask the sender whether your situation needs a stricter kind.</p>`);
}

export const renderMessage = ({ c, title, text }) => shell(c, title, `<h1>${esc(title)}</h1><p>${esc(text)}</p>`);

export function renderCertificate({ r, v, company, color: c, certUrl }) {
  const s = r.signature;
  return shell(c, `Certificate: ${r.title}`, `<h1>Certificate of electronic signature</h1>
<p><strong>${esc(r.title)}</strong>, requested by ${esc(company)}.</p>
<div class="card"><p>Signed by <strong>${esc(s.name)}</strong> on ${esc(when(s.at))}.</p><p>Document SHA-256: <code>${esc(r.docHash)}</code></p><p>Audit chain head: <code>${esc(v.head)}</code></p>
<p>Integrity check just now: <strong>${v.ok ? "intact" : "FAILED: " + esc(v.problems.join("; "))}</strong></p></div>
<h2>Audit trail</h2><table><tr><th>When</th><th>Event</th><th>Hash</th></tr>${r.events.map((e) => `<tr><td>${esc(when(e.at))}</td><td>${esc(e.type)}</td><td><code>${esc(e.hash.slice(0, 16))}…</code></td></tr>`).join("")}</table>
<h2>Document as signed</h2><div class="doc">${esc(r.body)}</div>
<p class="note">Consent recorded: ${esc(s.consent)}</p><p class="note noprint">Anyone can re-check this at <code>${esc(certUrl)}.json</code>: the hash of the text and every event hash are recomputed from the stored data. Print this page to keep a PDF copy. This is a record, not legal advice.</p>`);
}

export function renderAdmin({ company, color: c }) {
  return shell(c, `${company} signatures`, `<h1>${esc(company)} signature requests</h1>
<label for="key">Admin key</label><input id="key" type="password" autocomplete="off"><button id="load" type="button">Load</button>
<h2>New request</h2><label for="t">Title</label><input id="t" maxlength="120"><label for="b">Document text</label><textarea id="b" rows="8" maxlength="20000"></textarea>
<label for="n">Signer name (optional, must match)</label><input id="n" maxlength="100"><label for="d">Valid for days</label><input id="d" value="14" inputmode="numeric"><button id="create" type="button">Create signing link</button>
<p id="msg" class="note" role="status"></p><div id="list"></div>
<script>
const $=(i)=>document.getElementById(i);const H=()=>({authorization:"Bearer "+$("key").value});
async function api(p,o){const r=await fetch(p,Object.assign({headers:H()},o));const j=await r.json();if(!r.ok)throw new Error(j.error||r.status);return j}
async function load(){try{const rows=await api("/v1/requests");const l=$("list");l.textContent="";for(const q of rows){const d=document.createElement("div");d.className="card";
const h=document.createElement("strong");h.textContent=q.title+" \\u2014 "+q.status;d.append(h);const p=document.createElement("div");p.className="note";
p.textContent=(q.signedName?"Signed by "+q.signedName+". ":"")+(q.signerName?"Asked: "+q.signerName+". ":"");d.append(p);
const a=document.createElement("a");a.textContent="signing link";a.href=q.signUrl;d.append(a);
if(q.certUrl){d.append(" \\u00b7 ");const c=document.createElement("a");c.textContent="certificate";c.href=q.certUrl;d.append(c)}
if(q.status==="pending"||q.status==="expired"){const b=document.createElement("button");b.textContent="Void";b.className="alt";b.onclick=async()=>{await api("/v1/requests/"+q.id+"/void",{method:"POST"});load()};d.append(b)}
l.append(d)}$("msg").textContent=rows.length+" request(s)"}catch(e){$("msg").textContent=e.message}}
$("load").onclick=load;
$("create").onclick=async()=>{try{const j=await api("/v1/requests",{method:"POST",body:JSON.stringify({title:$("t").value,body:$("b").value,signerName:$("n").value,days:$("d").value})});$("msg").textContent="Send this link: "+j.signUrl;load()}catch(e){$("msg").textContent=e.message}};
</script>`);
}
