// Server-side HTML. Every dynamic value goes through esc(); the pages work without JavaScript.
import { STATUSES, list, hasVoted, visible } from "./board.mjs";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const LABEL = { open: "Open", planned: "Planned", "in-progress": "In progress", shipped: "Shipped", declined: "Declined" };
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(c || "") ? c : "#2f5de0");

function shell(cfg, title, body, { active = "", admin = false } = {}) {
  const nav = [["/", "Ideas", "board"], ["/roadmap", "Roadmap", "roadmap"], ["/changelog", "Changelog", "changelog"]]
    .map(([h, t, k]) => `<a href="${h}"${active === k ? ' aria-current="page"' : ""}>${t}</a>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · ${esc(cfg.company)}</title>
<link rel="alternate" type="application/rss+xml" title="${esc(cfg.company)} changelog" href="/changelog.rss">
${admin ? '<meta name="robots" content="noindex">' : ""}
<style>
:root{font:16px/1.5 system-ui,sans-serif;--a:${safeColor(cfg.accent)};--bg:#f6f7fb;--fg:#1c2030;--mut:#5a6275;--card:#fff;--line:#dde1ec}
@media(prefers-color-scheme:dark){:root{--bg:#12141c;--fg:#e8eaf2;--mut:#9aa2b8;--card:#1b1e2a;--line:#2b3042}}
body{margin:0;background:var(--bg);color:var(--fg)}main{max-width:760px;margin:auto;padding:20px}
a{color:var(--a)}header{display:flex;flex-wrap:wrap;gap:12px 22px;align-items:baseline;border-bottom:1px solid var(--line);padding-bottom:10px;margin-bottom:18px}
header strong{font-size:1.2rem;margin-right:auto}nav a{margin-right:14px;text-decoration:none;color:var(--mut)}nav a[aria-current]{color:var(--fg);font-weight:700;border-bottom:2px solid var(--a)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:10px 0}
.post{display:flex;gap:14px;align-items:flex-start}.post h3{margin:0 0 2px;font-size:1.05rem}.post p{margin:2px 0;color:var(--mut)}
.vote{display:flex;flex-direction:column;align-items:center;min-width:50px}.vote button{border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:10px;padding:6px 10px;cursor:pointer;font:inherit}
.vote button[aria-pressed=true]{background:var(--a);color:#fff;border-color:var(--a)}
.tag{display:inline-block;font-size:.78rem;font-weight:700;padding:1px 8px;border-radius:99px;background:var(--line);color:var(--fg)}
.s-planned{background:#d9e6ff;color:#173a8a}.s-in-progress{background:#fde9c4;color:#7a4a00}.s-shipped{background:#d3f1de;color:#0d5a2a}.s-declined{background:#f6d6d6;color:#8a1c1c}
input,textarea,select{width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg);font:inherit}
label{display:block;font-weight:600;margin:10px 0 3px}.btn{border:0;border-radius:8px;padding:9px 14px;background:var(--a);color:#fff;font-weight:700;cursor:pointer;font:inherit;font-weight:700}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px}.mut,footer{color:var(--mut);font-size:.85rem}.hp{position:absolute;left:-9999px}
@media(max-width:520px){main{padding:14px}}
</style></head><body><main>
<header><strong>${esc(cfg.company)}</strong><nav aria-label="Sections">${nav}</nav></header>
${body}
<footer><p>Powered by <a href="${esc(cfg.homepage)}">Feedback Board</a>, open source (MIT). Votes use one anonymous cookie; no accounts, no tracking.${cfg.sponsor ? ` <a href="https://github.com/sponsors/Duncan-Haywood">Sponsor the author</a>.` : ""}</p></footer>
</main></body></html>`;
}

const badge = (s) => `<span class="tag s-${s}">${LABEL[s]}</span>`;

function postCard(state, p, voterId, csrf) {
  const voted = hasVoted(state, p, voterId);
  return `<article class="card post"><form class="vote" method="post" action="/p/${p.id}/vote"><button aria-pressed="${voted}" aria-label="${voted ? "Remove your vote" : "Vote"} for ${esc(p.title)}">▲<br>${p.votes.length}</button></form>
<div><h3><a href="/p/${p.id}">${esc(p.title)}</a></h3>${p.body ? `<p>${esc(p.body.slice(0, 160))}${p.body.length > 160 ? "…" : ""}</p>` : ""}
<span class="mut">${badge(p.status)} · ${p.comments.length} comment${p.comments.length === 1 ? "" : "s"} · ${day(p.created)}</span></div></article>`;
}

export function boardPage(cfg, state, { voterId, status, sort, q, voteError }) {
  const posts = list(state, { status, sort, q });
  const tabs = [["", "Active"], ...STATUSES.filter((s) => s !== "open").map((s) => [s, LABEL[s]])]
    .map(([s, t]) => `<a href="/?${s ? `status=${s}` : ""}"${(status || "") === s ? ' aria-current="page"' : ""}>${t}</a>`).join("");
  return shell(cfg, "Feedback", `
<h1>${esc(cfg.tagline)}</h1>
<form class="card" method="post" action="/posts" aria-labelledby="new">
<h2 id="new" style="margin-top:0;font-size:1.05rem">Suggest an idea</h2>
<label for="title">Title</label><input id="title" name="title" required minlength="4" maxlength="120" autocomplete="off" placeholder="Short and specific, e.g. “Export reports to CSV”">
<div id="sim" aria-live="polite"></div>
<label for="body">Details <span class="mut">(optional)</span></label><textarea id="body" name="body" rows="3" maxlength="2000"></textarea>
<label for="email">Email <span class="mut">(optional, only so the team can follow up)</span></label><input id="email" name="email" type="email" maxlength="200" autocomplete="email">
<div class="hp" aria-hidden="true"><label for="website">Leave this empty</label><input id="website" name="website" tabindex="-1" autocomplete="off"></div>
<p><button class="btn" type="submit">Post idea</button></p></form>
<form method="get" action="/" class="card" style="display:flex;gap:8px"><label for="q" class="hp">Search ideas</label><input id="q" name="q" value="${esc(q || "")}" placeholder="Search existing ideas…" style="flex:1"><button class="btn" type="submit">Search</button></form>
<nav aria-label="Filter" style="margin:8px 0">${tabs} <span class="mut">· sort: <a href="/?${status ? `status=${esc(status)}&` : ""}sort=top">top</a> <a href="/?${status ? `status=${esc(status)}&` : ""}sort=new">new</a></span></nav>
${voteError ? `<p role="alert">${esc(voteError)}</p>` : ""}
${posts.length ? posts.map((p) => postCard(state, p, voterId)).join("") : `<p class="mut">Nothing here yet. Be the first to suggest something.</p>`}
<script>(function(){var t=document.getElementById('title'),o=document.getElementById('sim'),h;if(!t||!window.fetch)return;t.addEventListener('input',function(){clearTimeout(h);h=setTimeout(function(){if(t.value.length<4){o.textContent='';return}fetch('/api/similar?q='+encodeURIComponent(t.value)).then(function(r){return r.json()}).then(function(d){o.textContent='';if(!d.length)return;var p=document.createElement('p');p.className='mut';p.textContent='Already suggested? Vote instead of posting twice:';o.appendChild(p);d.forEach(function(x){var a=document.createElement('a');a.href='/p/'+x.id;a.textContent=x.title+' ('+x.votes+')';a.style.display='block';o.appendChild(a)})}).catch(function(){})},250)})})();</script>`, { active: "board" });
}

export function postPage(cfg, state, p, { voterId, admin, csrf }) {
  const adminBox = admin ? `<form class="card" method="post" action="/admin/p/${p.id}/status"><h2 style="margin-top:0;font-size:1rem">Team controls</h2>
<label for="st">Status</label><select id="st" name="status">${STATUSES.map((s) => `<option${s === p.status ? " selected" : ""}>${s}</option>`).join("")}</select>
<label for="mg">Merge into post id <span class="mut">(for duplicates, e.g. p3)</span></label><input id="mg" name="mergeInto" placeholder="p3">
<p><button class="btn" type="submit">Save</button> <button class="btn" type="submit" formaction="/admin/p/${p.id}/delete" style="background:#b3261e" onclick="return confirm('Delete this post?')">Delete</button></p></form>` : "";
  return shell(cfg, p.title, `
<p><a href="/">← All ideas</a></p>
${postCard(state, p, voterId)}
${p.body ? `<div class="card"><p style="white-space:pre-wrap;margin:0">${esc(p.body)}</p></div>` : ""}
<h2 style="font-size:1.05rem">${p.comments.length} comment${p.comments.length === 1 ? "" : "s"}</h2>
${p.comments.map((c) => `<div class="card"><strong>${esc(c.author)}</strong>${c.admin ? ' <span class="tag">team</span>' : ""} <span class="mut">${day(c.at)}</span><p style="white-space:pre-wrap;margin:4px 0 0">${esc(c.text)}</p></div>`).join("")}
<form class="card" method="post" action="/p/${p.id}/comments"><label for="ct">Add a comment</label><textarea id="ct" name="text" rows="3" maxlength="1000" required></textarea>
<label for="ca">Name <span class="mut">(optional)</span></label><input id="ca" name="author" maxlength="40">
<div class="hp" aria-hidden="true"><label for="w2">Leave this empty</label><input id="w2" name="website" tabindex="-1" autocomplete="off"></div>
<p><button class="btn" type="submit">Comment</button></p></form>${adminBox}`, { active: "board" });
}

export function roadmapPage(cfg, state) {
  const col = (s) => { const ps = visible(state).filter((p) => p.status === s).sort((a, b) => b.votes.length - a.votes.length);
    return `<section><h2 style="font-size:1.05rem">${badge(s)}</h2>${ps.map((p) => `<div class="card"><a href="/p/${p.id}">${esc(p.title)}</a><div class="mut">▲ ${p.votes.length}</div></div>`).join("") || '<p class="mut">Nothing yet</p>'}</section>`; };
  const shipped = visible(state).filter((p) => p.status === "shipped").sort((a, b) => (b.statusAt || 0) - (a.statusAt || 0)).slice(0, 5);
  return shell(cfg, "Roadmap", `<h1>Roadmap</h1><div class="cols">${["planned", "in-progress"].map(col).join("")}<section><h2 style="font-size:1.05rem">${badge("shipped")}</h2>${shipped.map((p) => `<div class="card"><a href="/p/${p.id}">${esc(p.title)}</a></div>`).join("") || '<p class="mut">Nothing yet</p>'}</section></div>`, { active: "roadmap" });
}

export function changelogPage(cfg, state) {
  return shell(cfg, "Changelog", `<h1>What’s new</h1>${state.changelog.map((c) => `<article class="card" id="${esc(c.id)}"><h2 style="margin:0;font-size:1.1rem">${esc(c.title)}</h2><div class="mut">${esc(c.date)}${c.tags.map((t) => ` <span class="tag">${esc(t)}</span>`).join("")}</div><div style="white-space:pre-wrap">${esc(c.body)}</div></article>`).join("") || '<p class="mut">No entries yet.</p>'}`, { active: "changelog" });
}

export function adminPage(cfg, state, summary) {
  return shell(cfg, "Admin", `<h1>Team admin</h1><p class="mut">${summary.posts} ideas, ${summary.votes} votes, ${summary.changelog} changelog entries. Open a post to change its status, merge duplicates, or delete it.</p>
<form class="card" method="post" action="/admin/changelog"><h2 style="margin-top:0;font-size:1.05rem">Publish a changelog entry</h2>
<label for="ct">Title</label><input id="ct" name="title" required maxlength="120"><label for="cb">What changed</label><textarea id="cb" name="body" rows="4" maxlength="5000"></textarea>
<label for="cg">Tags <span class="mut">(comma separated)</span></label><input id="cg" name="tags" placeholder="new, improved, fix"><label for="cd">Date <span class="mut">(YYYY-MM-DD, default today)</span></label><input id="cd" name="date" pattern="\\d{4}-\\d{2}-\\d{2}">
<p><button class="btn" type="submit">Publish</button></p></form>
<h2 style="font-size:1.05rem">All ideas</h2>${visible(state).sort((a, b) => b.created - a.created).map((p) => `<div class="card"><a href="/p/${p.id}">${esc(p.title)}</a> ${badge(p.status)} <span class="mut">▲ ${p.votes.length} · ${esc(p.id)}${p.email ? ` · ${esc(p.email)}` : ""}</span></div>`).join("") || '<p class="mut">No ideas yet.</p>'}`, { admin: true });
}

const xml = (s) => esc(s);
export function rss(cfg, state, base) {
  const items = state.changelog.slice(0, 50).map((c) => `<item><title>${xml(c.title)}</title><link>${xml(base)}/changelog#${xml(c.id)}</link><guid isPermaLink="false">${xml(c.id)}</guid><pubDate>${new Date(`${c.date}T12:00:00Z`).toUTCString()}</pubDate><description>${xml(c.body)}</description></item>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xml(cfg.company)} changelog</title><link>${xml(base)}/changelog</link><description>What's new at ${xml(cfg.company)}</description>${items}</channel></rss>`;
}

// Embeddable "What's new" dot: <script src="https://board.example.com/widget.js" data-target="#whats-new" defer></script>
export const widgetJs = (base) => `(function(){var s=document.currentScript,sel=s&&s.getAttribute('data-target'),el=sel&&document.querySelector(sel);if(!el)return;
fetch(${JSON.stringify(base)}+'/api/changelog').then(function(r){return r.json()}).then(function(d){var l=d[0];if(!l)return;var seen;try{seen=localStorage.getItem('fb-seen')}catch(e){}
var a=document.createElement('a');a.href=${JSON.stringify(base)}+'/changelog';a.target='_blank';a.rel='noopener';a.textContent=(seen&&seen>=l.date?'':'● ')+'What\\u2019s new';
a.addEventListener('click',function(){try{localStorage.setItem('fb-seen',l.date)}catch(e){}});el.appendChild(a)}).catch(function(){})})();`;
