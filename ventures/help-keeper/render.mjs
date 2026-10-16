// Server-rendered pages. Every dynamic value goes through esc(); article bodies go through markdown.render, which escapes first.
import { esc, render, plain, slugify } from "./markdown.mjs";
import { snippet, related } from "./search.mjs";
import { collections, indexOf, contactHref, gaps, weakArticles, stats, published } from "./kb.mjs";

const css = `:root{font:16px/1.55 system-ui,sans-serif;color:#1c2030;background:#f6f7fb}body{max-width:860px;margin:auto;padding:24px}a{color:#2342b8}h1{line-height:1.15}.card{background:#fff;border:1px solid #dde1ec;border-radius:12px;padding:18px;margin:16px 0}input,select,textarea{width:100%;box-sizing:border-box;padding:9px;border:1px solid #b5bdd6;border-radius:6px;font:inherit}textarea.code{font:14px/1.4 ui-monospace,monospace;min-height:340px}label{display:block;font-weight:600;margin:10px 0 4px}button{padding:8px 16px;border:0;border-radius:6px;background:#2342b8;color:#fff;font:inherit;cursor:pointer}button.alt{background:#e3e6f1;color:#1c2030}.muted{color:#46506b;font-size:.88rem}table{border-collapse:collapse;width:100%;font-size:.92rem}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e3e6f1;vertical-align:top}mark{background:#fff0a8}pre{background:#eef0f8;padding:10px;border-radius:8px;overflow-x:auto}code{background:#eef0f8;padding:1px 4px;border-radius:4px}pre code{padding:0}blockquote{border-left:4px solid #b5bdd6;margin:12px 0;padding:2px 14px;color:#33405e}img{max-width:100%}.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}.pill{display:inline-block;padding:1px 8px;border-radius:99px;font-size:.78rem;background:#e3e6f1}.err{background:#fbd9db;color:#6b0f14;padding:10px 14px;border-radius:8px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}.grid div{background:#eef0f8;border-radius:8px;padding:10px}.grid b{display:block;font-size:1.4rem}`;

const shell = (cfg, title, body, { desc = "", canonical = "", noindex = false, ld = null, admin = false } = {}) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${noindex || admin ? '<meta name="robots" content="noindex">' : ""}<title>${esc(title)}</title>${desc ? `<meta name="description" content="${esc(desc)}">` : ""}${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ""}${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>` : ""}<style>${css}</style></head><body><main>
<p class="muted" style="margin:0"><a href="${admin ? "/admin" : "/"}">${esc(admin ? `${cfg.state.settings.name} · admin` : cfg.state.settings.name)}</a></p>${body}
<p class="muted">Answers are provided as-is without warranty and may be out of date.${cfg.sponsor ? ` <a href="https://github.com/sponsors/Duncan-Haywood">Sponsor the author</a>.` : ""}</p></main></body></html>`;

const searchBox = (q = "", s = "") => `<form method="get" action="/search" role="search"><label for="q" class="muted" style="font-weight:400">Search the help center</label><div style="display:flex;gap:8px"><input id="q" name="q" value="${esc(q)}" autocomplete="off" placeholder="${esc(s)}" maxlength="100"><button>Search</button></div></form>`;
const stillStuck = (state) => { const h = contactHref(state.settings.contact); return h ? `<p class="muted">Still stuck? <a href="${esc(h)}">Contact us</a>.</p>` : ""; };
const desc = (a) => plain(a.body).slice(0, 155);

export function homePage(cfg, state) {
  const cols = collections(state), s = state.settings;
  const top = published(state).slice().sort((a, b) => b.views - a.views).filter((a) => a.views > 0).slice(0, 5);
  return shell(cfg, s.name, `<h1>${esc(s.name)}</h1><p>${esc(s.tagline)}</p><div class="card">${searchBox("", "e.g. reset my password")}</div>
${top.length ? `<div class="card"><h2>Popular</h2><ul>${top.map((a) => `<li><a href="/a/${esc(a.slug)}">${esc(a.title)}</a></li>`).join("")}</ul></div>` : ""}
<div class="cols">${cols.map((c) => `<div class="card"><h2><a href="/c/${esc(c.slug)}">${esc(c.name)}</a></h2><ul>${c.articles.slice(0, 6).map((a) => `<li><a href="/a/${esc(a.slug)}">${esc(a.title)}</a></li>`).join("")}</ul>${c.articles.length > 6 ? `<p class="muted"><a href="/c/${esc(c.slug)}">All ${c.articles.length} articles</a></p>` : ""}</div>`).join("") || `<p>No articles yet.</p>`}</div>${stillStuck(state)}`, { desc: s.tagline, canonical: cfg.baseUrl ? `${cfg.baseUrl}/` : "" });
}

export function collectionPage(cfg, state, c) {
  return shell(cfg, `${c.name} · ${state.settings.name}`, `<h1>${esc(c.name)}</h1><div class="card"><ul>${c.articles.map((a) => `<li><a href="/a/${esc(a.slug)}">${esc(a.title)}</a><div class="muted">${esc(plain(a.body).slice(0, 120))}</div></li>`).join("")}</ul></div>${searchBox()}`, { desc: `${c.name} articles`, canonical: cfg.baseUrl ? `${cfg.baseUrl}/c/${c.slug}` : "" });
}

export function searchPage(cfg, state, q, results) {
  const body = results.length ? results.map((r) => `<div class="card"><h2 style="margin:0"><a href="/a/${esc(r.article.slug)}?from=${encodeURIComponent(q.slice(0, 100))}">${esc(r.article.title)}</a></h2><p class="muted" style="margin:4px 0">${esc(r.article.collection)}</p><p>${snippet(plain(r.article.body), q).map((x) => (x.hit ? `<mark>${esc(x.text)}</mark>` : esc(x.text))).join("")}</p></div>`).join("") : `<div class="card"><p>Nothing matched <b>${esc(q)}</b>. Try fewer or different words.</p>${stillStuck(state)}</div>`;
  return shell(cfg, `${q} · Search · ${state.settings.name}`, `<h1>Search</h1><div class="card">${searchBox(q)}</div>${body}`, { noindex: true });
}

export function articlePage(cfg, state, a, { from = "", preview = false, voted = "" } = {}) {
  const r = render(a.body), rel = related(indexOf(state, { drafts: preview }), a.id).map((id) => state.articles[id]).filter((x) => x && (preview || x.status === "published"));
  const url = cfg.baseUrl ? `${cfg.baseUrl}/a/${a.slug}` : "";
  const ld = { "@context": "https://schema.org", "@type": "Article", headline: a.title, dateModified: new Date(a.updated).toISOString(), datePublished: new Date(a.created).toISOString(), articleSection: a.collection, ...(url ? { mainEntityOfPage: url } : {}) };
  return shell(cfg, `${a.title} · ${state.settings.name}`, `${preview ? `<p class="err">Preview${a.status === "draft" ? " — this draft is not public" : ""}.</p>` : ""}<p class="muted"><a href="/c/${esc(encodeCol(a.collection))}">${esc(a.collection)}</a></p><h1>${esc(a.title)}</h1>
${r.toc.length > 2 ? `<nav class="card" aria-label="On this page"><b>On this page</b><ul>${r.toc.map((t) => `<li style="margin-left:${(t.level - 2) * 16}px"><a href="#${esc(t.id)}">${esc(t.text)}</a></li>`).join("")}</ul></nav>` : ""}
<article>${r.html}</article><p class="muted">Updated ${esc(new Date(a.updated).toISOString().slice(0, 10))}</p>
${a.status === "published" && !preview ? (voted ? `<div class="card">Thanks for the feedback.</div>` : `<form method="post" action="/a/${esc(a.slug)}/vote" class="card"><b>Was this helpful?</b> <button name="helpful" value="yes">Yes</button> <button class="alt" name="helpful" value="no">No</button><label for="c" class="muted" style="font-weight:400">If no, what was missing? (optional)</label><input id="c" name="comment" maxlength="500"><input type="hidden" name="from" value="${esc(from)}"></form>`) : ""}
${rel.length ? `<div class="card"><b>Related</b><ul>${rel.map((x) => `<li><a href="/a/${esc(x.slug)}">${esc(x.title)}</a></li>`).join("")}</ul></div>` : ""}${stillStuck(state)}`, { desc: desc(a), canonical: url, noindex: preview || a.status !== "published", ld });
}
const encodeCol = (name) => slugify(name) || "general";

export const notFound = (cfg, state) => shell(cfg, "Not found", `<h1>Not found</h1><p>That page does not exist.</p>${searchBox()}`, { noindex: true });

const dateOf = (t) => new Date(t).toISOString().slice(0, 16).replace("T", " ");

export function adminPage(cfg, state, base, error = "", ok = "") {
  const st = stats(state), arts = Object.values(state.articles).sort((a, b) => b.updated - a.updated);
  const g = gaps(state).length;
  return shell(cfg, "Help center admin", `${error ? `<p class="err" role="alert">${esc(error)}</p>` : ""}${ok ? `<p>${esc(ok)}</p>` : ""}
<div class="card"><div class="grid"><div><b>${st.published}</b>published</div><div><b>${st.views}</b>article views</div><div><b>${st.searches}</b>searches</div><div><b>${st.zero}</b>found nothing</div><div><b>${st.helpfulPct === null ? "—" : `${st.helpfulPct}%`}</b>said helpful</div></div>
<p><a href="/admin/new">New article</a> · <a href="/admin/gaps"><b>Content gaps (${g})</b></a> · <a href="/admin/import">Import</a> · <a href="/admin/export.json">Export JSON</a> · <a href="/" >View site</a></p></div>
<div class="card"><h2>Articles</h2><table><tr><th>Title</th><th>Collection</th><th>Status</th><th>Views</th><th>Helpful</th><th>Updated (UTC)</th></tr>${arts.map((a) => `<tr><td><a href="/admin/a/${esc(a.id)}">${esc(a.title)}</a></td><td>${esc(a.collection)}</td><td><span class="pill">${esc(a.status)}</span></td><td>${a.views}</td><td>${a.yes}/${a.yes + a.no}</td><td>${esc(dateOf(a.updated))}</td></tr>`).join("") || `<tr><td colspan="6">No articles yet.</td></tr>`}</table></div>
<div class="card"><h2>Site</h2><form method="post" action="/admin/settings"><label for="n">Name</label><input id="n" name="name" value="${esc(state.settings.name)}" maxlength="80"><label for="t">Tagline</label><input id="t" name="tagline" value="${esc(state.settings.tagline)}" maxlength="140"><label for="c">Contact (email address or https link, shown as "Still stuck?")</label><input id="c" name="contact" value="${esc(state.settings.contact)}"><p><button>Save</button></p></form>
<details><summary>Add a help button to your own site or app</summary><p class="muted">Paste this before <code>&lt;/body&gt;</code>. It adds a floating Help button that searches this help center as visitors type. Optional: <code>data-label</code>, <code>data-color="#RRGGBB"</code>, <code>data-position="left"</code>.</p><pre><code>${esc(`<script src="${base}/widget.js" defer></script>`)}</code></pre></details>
<details><summary>Search from your own site or app</summary><p class="muted"><code>GET ${esc(base)}/api/search?q=reset+password</code> returns JSON (title, url, excerpt). Cross-origin requests are allowed.</p></details></div>`, { admin: true });
}

export function editPage(cfg, state, a, error = "", values = null) {
  const v = values || a || { title: "", body: "", collection: "", tags: [], status: "draft", slug: "" };
  const cols = [...new Set(Object.values(state.articles).map((x) => x.collection))];
  return shell(cfg, `${a ? "Edit" : "New"} article`, `<h1>${a ? "Edit" : "New"} article</h1>${error ? `<p class="err" role="alert">${esc(error)}</p>` : ""}<form method="post" action="/admin/save" class="card">${a ? `<input type="hidden" name="id" value="${esc(a.id)}">` : ""}
<label for="ti">Title</label><input id="ti" name="title" required maxlength="140" value="${esc(v.title)}">
<label for="co">Collection</label><input id="co" name="collection" list="cols" value="${esc(v.collection)}" maxlength="60"><datalist id="cols">${cols.map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
<label for="bo">Body (Markdown: # headings, lists, **bold**, [links](https://…), \`code\`, \`\`\` blocks)</label><textarea class="code" id="bo" name="body" required>${esc(v.body)}</textarea>
<label for="tg">Tags (comma separated; they count as search words)</label><input id="tg" name="tags" value="${esc(Array.isArray(v.tags) ? v.tags.join(", ") : v.tags)}">
<label for="sl">Address (optional, /a/<b>address</b>)</label><input id="sl" name="slug" value="${esc(v.slug)}" maxlength="60">
<label for="st">Status</label><select id="st" name="status"><option value="draft"${v.status !== "published" ? " selected" : ""}>Draft</option><option value="published"${v.status === "published" ? " selected" : ""}>Published</option></select>
<p><button>Save</button> ${a ? `<a href="/admin/preview/${esc(a.id)}">Preview</a>` : ""}</p></form>${a ? `<form method="post" action="/admin/a/${esc(a.id)}/delete"><button class="alt">Delete article</button></form>` : ""}`, { admin: true });
}

export function gapsPage(cfg, state, now) {
  const rows = gaps(state), weak = weakArticles(state);
  return shell(cfg, "Content gaps", `<h1>Content gaps</h1><p>What visitors searched for that this help center could not answer. Write the top ones first.</p>
<div class="card"><table><tr><th>Search</th><th>Times</th><th>Opened a result</th><th>Why listed</th><th>Last</th><th></th></tr>${rows.slice(0, 200).map((r) => `<tr><td>${esc(r.q)}</td><td>${r.n}</td><td>${r.clicks}</td><td>${esc(r.kind)}</td><td>${esc(dateOf(r.last))}</td><td><a href="/admin/new?title=${encodeURIComponent(r.q)}">Write it</a></td></tr>`).join("") || `<tr><td colspan="6">Nothing yet: every search so far found something people opened.</td></tr>`}</table><p class="muted"><a href="/admin/gaps.csv">Download CSV</a></p></div>
<div class="card"><h2>Articles people rated unhelpful</h2><table><tr><th>Article</th><th>Not helpful</th></tr>${weak.map((x) => `<tr><td><a href="/admin/a/${esc(x.a.id)}">${esc(x.a.title)}</a></td><td>${x.a.no} of ${x.a.yes + x.a.no}</td></tr>`).join("") || `<tr><td colspan="2">None with enough votes yet (needs 3).</td></tr>`}</table></div>
<div class="card"><h2>What people said was missing</h2><ul>${state.feedback.slice(0, 40).map((f) => `<li>${esc(f.comment)} <span class="muted">on <a href="/admin/a/${esc(f.article)}">${esc(state.articles[f.article]?.title || f.article)}</a></span></li>`).join("") || "<li>No comments yet.</li>"}</ul></div>`, { admin: true });
}

export const importPage = (cfg, state, error = "") => shell(cfg, "Import articles", `<h1>Import articles</h1>${error ? `<p class="err" role="alert">${esc(error)}</p>` : ""}<form method="post" action="/admin/import" class="card"><p class="muted">Paste Markdown. Separate articles with a line of <code>=====</code>. Each may start with a front-matter block (<code>title</code>, <code>collection</code>, <code>tags</code>, <code>status</code>), or with a <code># Title</code> line. Imports are drafts unless <code>status: published</code>.</p><textarea class="code" name="text" aria-label="Markdown to import" required></textarea><p><button>Import</button></p></form>`, { admin: true });
