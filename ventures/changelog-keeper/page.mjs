// Server-rendered public changelog and the admin page.
import { esc, renderMarkdown } from "./store.mjs";
export { esc };
const color = (c) => (/^#[0-9a-fA-F]{6}$/.test(c || "") ? c : "#0f766e");

const shell = (c, title, body, head = "", robots = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${robots}<title>${esc(title)}</title>${head}
<style>body{font:16px/1.55 system-ui,sans-serif;max-width:42rem;margin:2.5rem auto;padding:0 1rem;color:#111827}h1{color:${color(c)};font-size:1.7rem}h2{font-size:1.2rem;margin:.2rem 0}
.e{border-top:1px solid #e5e7eb;padding:1.2rem 0}.m{font-size:.85rem;color:#4b5563}.tag{display:inline-block;padding:0 .55rem;border-radius:99px;background:${color(c)};color:#fff;font-size:.75rem;font-weight:700;text-transform:uppercase;margin-right:.5rem}
code{background:#f3f4f6;padding:0 .25rem;border-radius:4px}label{display:block;font-weight:600;margin:.8rem 0 .2rem}input,textarea,select,button{font:inherit;padding:.5rem .65rem;border-radius:8px;border:1px solid #9ca3af;width:100%;box-sizing:border-box}
button{background:${color(c)};color:#fff;border:0;font-weight:700;cursor:pointer;margin-top:.8rem}.row button{width:auto;margin:.3rem .3rem 0 0;padding:.3rem .7rem}.card{border:1px solid #e5e7eb;border-radius:10px;padding:.8rem 1rem;margin:.7rem 0}.note{font-size:.85rem;color:#4b5563}</style></head><body>${body}</body></html>`;

const day = (t) => new Date(t).toISOString().slice(0, 10);

export function renderChangelog({ entries, company, color: c, publicUrl }) {
  const head = `<link rel="alternate" type="application/atom+xml" href="${esc(publicUrl)}/feed.xml" title="${esc(company)} changelog"><link rel="alternate" type="application/feed+json" href="${esc(publicUrl)}/feed.json"><link rel="canonical" href="${esc(publicUrl)}/changelog">`;
  return shell(c, `${company} changelog`, `<h1>${esc(company)} changelog</h1><p class="note">Subscribe: <a href="${esc(publicUrl)}/feed.xml">Atom</a> &middot; <a href="${esc(publicUrl)}/feed.json">JSON Feed</a></p>
${entries.map((e) => `<article class="e" id="${esc(e.id)}"><div class="m"><span class="tag">${esc(e.tag)}</span>${day(e.publishAt)}</div><h2>${esc(e.title)}</h2>${renderMarkdown(e.body)}</article>`).join("") || "<p>Nothing published yet.</p>"}`, head);
}

// The admin page holds no secrets: it asks for the admin key in the browser and calls the API.
export function renderAdmin({ company, color: c }) {
  return shell(c, `Changelog · ${company}`, `<h1>${esc(company)} changelog admin</h1><label for="k">Admin key</label><input id="k" type="password" autocomplete="off"><button id="go" type="button">Load</button>
<div class="card"><label for="ti">Title</label><input id="ti" maxlength="120"><label for="tg">Type</label><select id="tg"><option>new</option><option>improved</option><option>fixed</option><option>removed</option><option>security</option><option>announcement</option></select>
<label for="bo">Body (Markdown subset: **bold**, *italic*, \`code\`, [link](https://...), "- " lists, "## " headings)</label><textarea id="bo" rows="6" maxlength="4000"></textarea>
<label for="wh">Publish at (optional, e.g. 2026-11-01T09:00:00Z; leave empty for now)</label><input id="wh"><label style="font-weight:400"><input type="checkbox" id="dr" style="width:auto"> Save as draft</label><button id="add" type="button">Add entry</button></div>
<div id="out"></div><p class="note">Entries are shown exactly as written. Drafts and future-dated entries are not public.</p>
<script>
var out=document.getElementById("out");
function el(t,x){var e=document.createElement(t);if(x)e.textContent=x;return e}
function call(m,p,b){return fetch(p,{method:m,headers:{authorization:"Bearer "+document.getElementById("k").value},body:b?JSON.stringify(b):undefined}).then(function(r){return r.json()})}
function load(){call("GET","/v1/entries").then(function(list){out.textContent="";if(!Array.isArray(list)){out.appendChild(el("p","Wrong key."));return}
list.forEach(function(t){var c=el("div");c.className="card";var live=t.status==="published"&&t.publishAt<=Date.now();c.appendChild(el("strong",t.title+" · "+t.tag+" · "+(t.status==="draft"?"draft":live?"live":"scheduled")+" · "+new Date(t.publishAt).toISOString().slice(0,10)));c.appendChild(el("p",t.body));
var row=el("div");row.className="row";var tog=el("button",t.status==="draft"?"Publish":"Make draft");tog.type="button";tog.onclick=function(){call("POST","/v1/entries/"+t.id,{status:t.status==="draft"?"published":"draft"}).then(load)};row.appendChild(tog);
var del=el("button","Delete");del.type="button";del.onclick=function(){if(confirm("Delete this entry?"))call("DELETE","/v1/entries/"+t.id).then(load)};row.appendChild(del);c.appendChild(row);out.appendChild(c)})})}
document.getElementById("go").onclick=load;
document.getElementById("add").onclick=function(){var b={title:document.getElementById("ti").value,body:document.getElementById("bo").value,tag:document.getElementById("tg").value};var w=document.getElementById("wh").value;if(w)b.publishAt=w;if(document.getElementById("dr").checked)b.status="draft";
call("POST","/v1/entries",b).then(function(r){if(r.error){alert(r.error);return}document.getElementById("ti").value="";document.getElementById("bo").value="";load()})};
</script>`, "", '<meta name="robots" content="noindex">');
}
