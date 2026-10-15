// Server-rendered pages. No client framework: the board works with JavaScript off.
import { esc } from "./notify.mjs";

const LABEL = { open: "Open", planned: "Planned", "in-progress": "In progress", shipped: "Shipped", declined: "Declined" };
const date = (t) => new Date(t).toISOString().slice(0, 10);

const CSS = `:root{font:16px system-ui,sans-serif;color:#1c2230;background:#f6f7fb}body{max-width:760px;margin:auto;padding:24px}a{color:#3b3bd6}
h1{font-size:1.7rem;margin:0 0 4px}.sub{color:#555;margin:0 0 18px}nav a{margin-right:14px;font-weight:600}
.post{display:flex;gap:14px;background:#fff;border:1px solid #dde1ee;border-radius:12px;padding:14px;margin:10px 0}
.vote{flex:none;text-align:center}.vote button{display:block;width:54px;border:1px solid #c3c8e6;background:#f1f2fb;border-radius:9px;padding:6px 0;font-weight:700;cursor:pointer}
.vote button.on{background:#3b3bd6;color:#fff;border-color:#3b3bd6}.post h2{font-size:1.05rem;margin:0 0 4px}.post p{margin:4px 0;color:#444;white-space:pre-wrap}
.tag{display:inline-block;padding:1px 9px;border-radius:99px;font-size:.78rem;font-weight:700;background:#e4e6f7}.s-planned{background:#dbeafe}.s-in-progress{background:#fef3c7}.s-shipped{background:#d1fae5}.s-declined{background:#eee}
form.new,.card{background:#fff;border:1px solid #dde1ee;border-radius:12px;padding:16px;margin:14px 0}label{display:block;font-weight:600;margin:10px 0 4px}
input,textarea,select{width:100%;box-sizing:border-box;padding:9px;border:1px solid #b9bfdc;border-radius:7px;font:inherit}textarea{min-height:90px}
button.go{border:0;background:#3b3bd6;color:#fff;border-radius:8px;padding:10px 16px;font-weight:700;margin-top:12px;cursor:pointer}
.hint{font-size:.85rem;color:#555}#sim{margin:8px 0;padding:0;list-style:none}#sim li{background:#fff8e1;border:1px solid #f1d98b;border-radius:8px;padding:8px 10px;margin:6px 0}
.hp{position:absolute;left:-9999px}footer{margin-top:28px;font-size:.82rem;color:#555}.team{border-left:3px solid #3b3bd6;padding-left:10px}`;

export function layout({ title, boardTitle, body, head = "" }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><link rel="alternate" type="application/atom+xml" href="/changelog.atom">${head}<style>${CSS}</style></head><body><header><h1>${esc(boardTitle)}</h1><nav><a href="/">Ideas</a><a href="/roadmap">Roadmap</a><a href="/changelog">Changelog</a></nav></header><main>${body}</main><footer>Powered by <a href="https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/feedback-keeper">Feedback Keeper</a> (open source, MIT). <a href="https://github.com/sponsors/Duncan-Haywood">Support the creator</a>. Voting uses one first-party cookie to count each person once; no tracking.</footer></body></html>`;
}

const tag = (s) => `<span class="tag s-${s}">${LABEL[s]}</span>`;

export function postCard(p, { voted, votes }) {
  return `<article class="post"><form class="vote" method="post" action="/vote/${p.id}"><button class="${voted ? "on" : ""}" aria-label="${voted ? "Remove your vote" : "Vote for this idea"}" aria-pressed="${voted}">▲<br>${votes}</button></form><div><h2><a href="/post/${p.id}">${esc(p.title)}</a></h2>${tag(p.status)}${p.body ? `<p>${esc(p.body.slice(0, 220))}${p.body.length > 220 ? "…" : ""}</p>` : ""}</div></article>`;
}

export function board({ boardTitle, posts, voter, sort, q, notice }) {
  const cards = posts.map((p) => postCard(p, { voted: p.votes.includes(voter), votes: p.votes.length })).join("") || `<p class="hint">Nothing here yet. Be the first to suggest something.</p>`;
  const opt = (v, t) => `<option value="${v}"${sort === v ? " selected" : ""}>${t}</option>`;
  return layout({ title: boardTitle, boardTitle, body: `${notice ? `<p class="card">${esc(notice)}</p>` : ""}
<p class="sub">Vote for what you want built, or suggest something new.</p>
<form class="new" method="post" action="/submit"><label for="t">Your idea</label><input id="t" name="title" maxlength="120" required autocomplete="off"><ul id="sim" aria-live="polite"></ul><label for="b">Details (optional)</label><textarea id="b" name="body" maxlength="4000"></textarea><label for="e">Email, to hear when it ships (optional)</label><input id="e" name="email" type="email" autocomplete="email"><input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><button class="go">Post idea</button></form>
<form method="get" action="/"><label for="q">Search ideas</label><input id="q" name="q" value="${esc(q || "")}"> <label for="sort">Sort</label><select id="sort" name="sort" onchange="this.form.submit()">${opt("top", "Most votes")}${opt("trending", "Trending")}${opt("new", "Newest")}</select><noscript><button class="go">Apply</button></noscript></form>
${cards}
<script>(()=>{const t=document.getElementById("t"),s=document.getElementById("sim");let h;t.addEventListener("input",()=>{clearTimeout(h);h=setTimeout(async()=>{if(t.value.length<6){s.textContent="";return}try{const r=await fetch("/v1/similar?q="+encodeURIComponent(t.value));const j=await r.json();s.textContent="";for(const x of j.similar){const li=document.createElement("li"),a=document.createElement("a");a.href="/post/"+x.id;a.textContent=x.title;li.append("Already suggested? ",a," (",x.votes," votes)");s.append(li)}}catch{}},250)})})()</script>` });
}

export function postPage({ boardTitle, p, voter }) {
  const cs = p.comments.map((c) => `<div class="card${c.admin ? " team" : ""}"><b>${c.admin ? "Team" : "Someone"}</b> <span class="hint">${date(c.at)}</span><p>${esc(c.body)}</p></div>`).join("");
  return layout({ title: `${p.title} — ${boardTitle}`, boardTitle, body: `${postCard(p, { voted: p.votes.includes(voter), votes: p.votes.length })}${p.body ? `<div class="card"><p style="white-space:pre-wrap">${esc(p.body)}</p></div>` : ""}${cs}
<form class="new" method="post" action="/comment/${p.id}"><label for="c">Add a comment</label><textarea id="c" name="body" maxlength="2000" required></textarea><input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><button class="go">Comment</button></form>
<form class="new" method="post" action="/follow/${p.id}"><label for="fe">Email me when this changes</label><input id="fe" name="email" type="email" required><button class="go">Follow</button></form>` });
}

export function roadmap({ boardTitle, posts }) {
  const col = (s) => `<h2>${LABEL[s]}</h2>${posts.filter((p) => p.status === s).sort((a, b) => b.votes.length - a.votes.length).map((p) => `<article class="post"><div class="vote"><b>${p.votes.length}</b><br><span class="hint">votes</span></div><div><h2><a href="/post/${p.id}">${esc(p.title)}</a></h2></div></article>`).join("") || `<p class="hint">Nothing yet.</p>`}`;
  return layout({ title: `Roadmap — ${boardTitle}`, boardTitle, body: ["planned", "in-progress", "shipped"].map(col).join("") });
}

export function changelogPage({ boardTitle, entries }) {
  return layout({ title: `Changelog — ${boardTitle}`, boardTitle, body: entries.map((e) => `<article class="card"><h2>${esc(e.title)}</h2><span class="hint">${date(e.at)}</span><p style="white-space:pre-wrap">${esc(e.body)}</p></article>`).join("") || `<p class="hint">No releases announced yet.</p>` });
}

export function atom({ boardTitle, baseUrl, entries }) {
  const upd = entries[0] ? new Date(entries[0].at).toISOString() : new Date(0).toISOString();
  return `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>${esc(boardTitle)} changelog</title><id>${esc(baseUrl)}/changelog</id><link href="${esc(baseUrl)}/changelog"/><updated>${upd}</updated>${entries.map((e) => `<entry><title>${esc(e.title)}</title><id>${esc(baseUrl)}/changelog#${e.id}</id><updated>${new Date(e.at).toISOString()}</updated><content type="text">${esc(e.body)}</content></entry>`).join("")}</feed>`;
}
