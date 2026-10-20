// Server-rendered dashboard: no JavaScript, one inline stylesheet, charts are inline SVG.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (n) => (n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(Math.round(n * 10) / 10));
const pct = (r) => `${Math.round(r * 1000) / 10}%`;
const dur = (s) => (s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);

function delta(now, before) {
  if (!before) return now ? '<span class="d up">new</span>' : "";
  const c = Math.round(((now - before) / before) * 100);
  return c === 0 ? '<span class="d">0%</span>' : `<span class="d ${c > 0 ? "up" : "down"}">${c > 0 ? "▲" : "▼"} ${Math.abs(c)}%</span>`;
}

function chart(series) {
  const w = 720, h = 140, max = Math.max(1, ...series.map((r) => r.visitors));
  const bw = w / series.length;
  const bars = series.map((r, i) => {
    const bh = Math.round((r.visitors / max) * (h - 8));
    return `<rect x="${(i * bw + 1).toFixed(1)}" y="${h - bh}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${bh}" rx="2"><title>${r.day}: ${r.visitors} visitors, ${r.views} views</title></rect>`;
  }).join("");
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Visitors per day, ${esc(series[0].day)} to ${esc(series.at(-1).day)}, peak ${max}">${bars}</svg>`;
}

const table = (title, rows, label = "Visitors") => `<section><h2>${esc(title)}</h2>${rows.length
  ? `<table><thead><tr><th>Name</th><th class="n">${esc(label)}</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.name)}</td><td class="n">${num(r.count)}</td></tr>`).join("")}</tbody></table>`
  : '<p class="muted">Nothing yet.</p>'}</section>`;

// meta: {title, sites[], share?: bool}. summary comes from stats.summarize.
export function dashboard(summary, meta) {
  const { totals: t, previous: p } = summary;
  const nav = meta.sites.map((s) => `<a href="${meta.share ? `/share/${encodeURIComponent(s)}` : `/?site=${encodeURIComponent(s)}`}${summary.days !== 30 ? `${meta.share ? "?" : "&"}days=${summary.days}` : ""}"${s === summary.site ? ' aria-current="page"' : ""}>${esc(s)}</a>`).join("");
  const base = meta.share ? `/share/${encodeURIComponent(summary.site)}` : `/?site=${encodeURIComponent(summary.site)}`;
  const link = (d) => `<a href="${base}${meta.share ? "?" : "&"}days=${d}"${d === summary.days ? ' aria-current="page"' : ""}>${d}d</a>`;
  const tile = (label, value, d = "") => `<div class="tile"><div class="k">${label}</div><div class="v">${value}</div>${d}</div>`;
  const goals = summary.goals.length ? `<section class="wide"><h2>Goals</h2><table><thead><tr><th>Goal</th><th class="n">Visitors</th><th class="n">Events</th><th class="n">Conv. rate</th><th class="n">Value</th><th>Best sources (conversions per visit)</th></tr></thead><tbody>${summary.goals.map((g) =>
    `<tr><td>${esc(g.name)}</td><td class="n">${num(g.visitors)}</td><td class="n">${num(g.events)}</td><td class="n">${pct(g.conversionRate)}</td><td class="n">${g.value ? num(g.value) : "–"}</td><td>${g.bySource.slice(0, 3).map((s) => `${esc(s.source)} ${num(s.conversions)}/${num(s.visits)} (${pct(s.rate)})`).join(", ") || "–"}</td></tr>`).join("")}</tbody></table></section>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(summary.site)} — ${esc(meta.title)}</title><style>
:root{--bg:#fafaf9;--fg:#1c1917;--mut:#57534e;--card:#fff;--line:#e7e5e4;--acc:#4f46e5;--up:#15803d;--down:#b91c1c}
@media(prefers-color-scheme:dark){:root{--bg:#0c0a09;--fg:#f5f5f4;--mut:#a8a29e;--card:#1c1917;--line:#292524;--acc:#818cf8;--up:#4ade80;--down:#f87171}}
body{margin:0;font:15px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--fg)}main{max-width:960px;margin:0 auto;padding:16px}
nav,.range{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}a{color:var(--acc)}nav a,.range a{padding:4px 10px;border:1px solid var(--line);border-radius:999px;text-decoration:none;background:var(--card)}
[aria-current]{background:var(--acc)!important;color:#fff!important;border-color:var(--acc)!important}
h1{font-size:20px;margin:8px 0}h2{font-size:14px;margin:0 0 8px;color:var(--mut);text-transform:uppercase;letter-spacing:.04em}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:12px 0}.tile,section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}
.k{color:var(--mut);font-size:12px}.v{font-size:24px;font-weight:650}.d{font-size:12px;color:var(--mut)}.up{color:var(--up)}.down{color:var(--down)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:10px;margin-top:10px}.wide{grid-column:1/-1}
svg{width:100%;height:auto;fill:var(--acc)}table{width:100%;border-collapse:collapse}td,th{padding:4px 6px;border-bottom:1px solid var(--line);text-align:left;overflow-wrap:anywhere}th{font-size:12px;color:var(--mut)}.n{text-align:right;white-space:nowrap}.muted,footer{color:var(--mut);font-size:13px}
</style></head><body><main>
<h1>${esc(meta.title)}</h1><nav aria-label="Sites">${nav}</nav>
<div class="range" aria-label="Period">${[7, 30, 90].map(link).join("")}</div>
${summary.hasData ? "" : `<section><p>No visits recorded for <b>${esc(summary.site)}</b> yet. Add the snippet from the setup page to its <code>&lt;head&gt;</code>, load a page, and this fills in within seconds.</p></section>`}
<div class="tiles">
${tile("Live (5 min)", num(summary.live))}${tile("Visitors", num(t.visitors), delta(t.visitors, p.visitors))}${tile("Visits", num(t.visits), delta(t.visits, p.visits))}${tile("Pageviews", num(t.views), delta(t.views, p.views))}${tile("Bounce rate", pct(t.bounceRate))}${tile("Avg. visit", dur(t.avgVisitSeconds))}${tile("Pages / visit", num(t.viewsPerVisit))}
</div>
<section><h2>Visitors per day</h2>${chart(summary.series)}<p class="muted">${esc(summary.from)} to ${esc(summary.to)} (UTC). Visitors are counted per day, so someone who returns on another day counts again.</p></section>
${goals ? `<div class="grid">${goals}</div>` : ""}
<div class="grid">
<section><h2>Top pages</h2>${summary.pages.length ? `<table><thead><tr><th>Page</th><th class="n">Views</th><th class="n">Visitors</th></tr></thead><tbody>${summary.pages.map((r) => `<tr><td>${esc(r.name)}</td><td class="n">${num(r.views)}</td><td class="n">${num(r.visitors)}</td></tr>`).join("")}</tbody></table>` : '<p class="muted">Nothing yet.</p>'}</section>
${table("Entry pages", summary.entries, "Visits")}${table("Sources", summary.sources, "Visits")}${table("UTM campaigns", summary.campaigns, "Visits")}
${table("Countries", summary.countries)}${table("Devices", summary.devices)}${table("Browsers", summary.browsers)}${table("Operating systems", summary.os)}
</div>
<footer><p>No cookies, no fingerprinting, no IP or user-agent stored. Own your data: <a href="/api/stats.csv?site=${encodeURIComponent(summary.site)}&amp;days=${summary.days}">CSV</a> · <a href="/api/stats?site=${encodeURIComponent(summary.site)}&amp;days=${summary.days}">JSON</a>. Free and as-is, no warranty.</p></footer>
</main></body></html>`;
}

export const loginHelp = (title) => `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><p>Sign in with any user name and your ADMIN_KEY as the password.`;
