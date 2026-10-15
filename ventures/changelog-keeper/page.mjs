// Server-rendered HTML: the public changelog, one entry, and the admin editor.
import { esc, renderBody, CATEGORIES } from "./store.mjs";

export { esc };
const safeColor = (c) => (/^#[0-9a-fA-F]{6}$/.test(c || "") ? c : "#2563eb");
const fmt = (ms) => new Date(ms).toISOString().slice(0, 10);
const LABEL = { new: "New", improved: "Improved", fixed: "Fixed", breaking: "Breaking" };

const shell = ({ title, company, color, body, feed }) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>${feed ? `<link rel="alternate" type="application/rss+xml" title="${esc(company)} changelog" href="${esc(feed)}/feed.xml">` : ""}<style>:root{font:16px/1.55 system-ui,sans-serif;color:#1b1f2a;--c:${safeColor(color)}}body{max-width:720px;margin:auto;padding:28px 18px}a{color:var(--c)}h1{margin:0 0 4px}article{border-top:1px solid #e5e7eb;padding:22px 0}article h2{margin:6px 0 4px;font-size:1.3rem}time,.sub{color:#4b5563;font-size:.88rem}.tag{display:inline-block;padding:1px 9px;border-radius:99px;font-size:.78rem;font-weight:700;background:#eef2ff;color:#1e3a8a;margin-right:6px}.tag.fixed{background:#ecfdf5;color:#065f46}.tag.breaking{background:#fef2f2;color:#991b1b}.tag.improved{background:#fffbeb;color:#92400e}code{background:#f3f4f6;padding:1px 4px;border-radius:4px}footer{margin-top:30px;font-size:.82rem;color:#4b5563}</style></head><body><main>${body}</main></body></html>`;

const entryHtml = (e, link) => `<article id="${esc(e.slug)}"><span class="tag ${esc(e.category)}">${LABEL[e.category]}</span><time datetime="${fmt(e.publishedAt)}">${fmt(e.publishedAt)}</time><h2><a href="${esc(link)}/e/${esc(e.slug)}" style="color:inherit;text-decoration:none">${esc(e.title)}</a></h2>${renderBody(e.body)}</article>`;

export function renderIndex({ entries, company, color, link, category }) {
  const nav = ["", ...CATEGORIES].map((c) => `<a href="${esc(link)}/${c ? `?category=${c}` : ""}"${(category || "") === c ? ' aria-current="page"' : ""}>${c ? LABEL[c] : "All"}</a>`).join(" · ");
  const body = `<h1>${esc(company)} changelog</h1><p class="sub">${nav} · <a href="${esc(link)}/feed.xml">RSS</a> · <a href="${esc(link)}/feed.json">JSON Feed</a></p>${entries.length ? entries.map((e) => entryHtml(e, link)).join("") : "<p>Nothing published yet.</p>"}<footer>Powered by the open-source Changelog Keeper.</footer>`;
  return shell({ title: `${company} changelog`, company, color, body, feed: link });
}

export function renderEntry({ entry, company, color, link }) {
  const body = `<p class="sub"><a href="${esc(link)}/">&larr; ${esc(company)} changelog</a></p>${entryHtml(entry, link)}`;
  return shell({ title: `${entry.title} — ${company}`, company, color, body, feed: link });
}

// The admin key is typed into the page and kept in memory only; the list is built with textContent.
export function renderAdmin({ company, color }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(company)} changelog admin</title><style>:root{font:16px system-ui,sans-serif;--c:${safeColor(color)}}body{max-width:760px;margin:auto;padding:24px}input,textarea,select,button{font:inherit;padding:7px;margin:4px 0;max-width:100%}textarea{width:100%;height:150px}li{margin:8px 0;list-style:none;border-top:1px solid #ddd;padding-top:8px}button{cursor:pointer}</style></head><body><h1>${esc(company)} changelog</h1>
<p><label>Admin key <input id="key" type="password" autocomplete="off"></label> <button id="load">Load</button> <span id="msg" role="status"></span></p>
<h2>New entry</h2><p><label>Title <input id="title" maxlength="120"></label> <label>Category <select id="cat">${CATEGORIES.map((c) => `<option>${c}</option>`).join("")}</select></label> <label>Tags <input id="tags" placeholder="api, billing"></label></p>
<textarea id="body" aria-label="Body" placeholder="Markdown: - bullets, **bold**, \`code\`, [links](https://...)"></textarea><p><button id="draft">Save draft</button> <button id="pub">Publish now</button></p>
<h2>Entries</h2><ul id="list"></ul>
<script>
const $=(i)=>document.getElementById(i);let key="";
const api=async(m,p,b)=>{const r=await fetch("/v1"+p,{method:m,headers:{authorization:"Bearer "+key,"content-type":"application/json"},body:b?JSON.stringify(b):undefined});const j=await r.json();if(!r.ok)throw new Error(j.error||r.status);return j};
const say=(t)=>{$("msg").textContent=t};
async function load(){key=$("key").value;try{const rows=await api("GET","/entries");const ul=$("list");ul.textContent="";for(const e of rows.reverse()){const li=document.createElement("li");li.textContent=e.status.toUpperCase()+" · "+e.category+" · "+e.title+" ";for(const [label,fn] of [[e.status==="published"?"Unpublish":"Publish",()=>api("POST","/entries/"+e.id+"/status",{status:e.status==="published"?"draft":"published"})],["Delete",()=>confirm("Delete?")&&api("DELETE","/entries/"+e.id)]]){const b=document.createElement("button");b.textContent=label;b.onclick=async()=>{try{await fn();load()}catch(x){say(x.message)}};li.append(b)}ul.append(li)}say(rows.length+" entries")}catch(x){say(x.message)}}
async function add(status){try{const e=await api("POST","/entries",{title:$("title").value,body:$("body").value,category:$("cat").value,tags:$("tags").value});if(status==="published")await api("POST","/entries/"+e.id+"/status",{status});$("title").value=$("body").value="";load()}catch(x){say(x.message)}}
$("load").onclick=load;$("draft").onclick=()=>add("draft");$("pub").onclick=()=>add("published");
</script></body></html>`;
}
