// @ts-check
// Branded change report: the analysis on the analyst's own letterhead, as one page to print or save
// as PDF. Title block (logo, name, contact), the chart, the plain-language reading, the change and
// segment tables, and a fixed statement of the assumptions. The detector itself is never gated; this
// is presentation. Pure and self-contained: no network, every typed string and every series label
// escaped, the logo accepted only as a raster data: URL.

/** @param {any} s */
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] || c);
/** @param {any} v */
export const fmt = (v) => (typeof v !== "number" ? esc(v) : !Number.isFinite(v) ? "n/a" : Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toPrecision(3));

/** @param {string} c */
export function safeColor(c) { return /^#[0-9a-fA-F]{6}$/.test(String(c || "")) ? String(c) : "#1f5f86"; }

/** Only raster data URLs (no SVG, which can carry script). @param {string} u */
export function safeLogo(u) {
  const s = String(u || "");
  return /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length < 700000 ? s : "";
}

/** The page's chart, shared so the report shows exactly what the free page shows. @param {any} r */
export function chartSvg(r) {
  const W = 900, H1 = 260, H2 = 90, P = 44, n = r.values.length;
  const lo = Math.min(...r.values), hi = Math.max(...r.values);
  const pad = (hi - lo) * 0.06 || 1;
  const X = (/** @type {number} */ i) => P + (i / Math.max(1, n - 1)) * (W - P - 10);
  const Y = (/** @type {number} */ v) => 10 + (1 - (v - lo + pad) / (hi - lo + 2 * pad)) * (H1 - 30);
  const parts = [];
  parts.push(`<line x1="${P}" y1="${H1 - 20}" x2="${W - 10}" y2="${H1 - 20}" stroke="#ccd5dd"/>`);
  for (const t of [lo, (lo + hi) / 2, hi]) parts.push(`<text x="${P - 6}" y="${Y(t) + 4}" font-size="11" text-anchor="end" fill="#4c5a68">${fmt(t)}</text>`);
  const tickEvery = Math.max(1, Math.ceil(n / 8));
  for (let i = 0; i < n; i += tickEvery) parts.push(`<text x="${X(i)}" y="${H1 - 6}" font-size="11" text-anchor="middle" fill="#4c5a68">${esc(r.labels[i]).slice(0, 10)}</text>`);
  const path = r.values.map((/** @type {number} */ v, /** @type {number} */ i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  parts.push(`<path d="${path}" fill="none" stroke="#8aa1b1" stroke-width="1.2"/>`);
  if (n <= 600) for (let i = 0; i < n; i++) parts.push(`<circle cx="${X(i).toFixed(1)}" cy="${Y(r.values[i]).toFixed(1)}" r="2" fill="#4c6a7d"/>`);
  for (const s of r.pelt.segments) parts.push(`<line x1="${X(s.start)}" x2="${X(s.end)}" y1="${Y(s.mean)}" y2="${Y(s.mean)}" stroke="#c0392b" stroke-width="3"/>`);
  for (const c of r.pelt.changepoints) parts.push(`<line x1="${X(c.index - 0.5)}" x2="${X(c.index - 0.5)}" y1="10" y2="${H1 - 20}" stroke="#c0392b" stroke-dasharray="4 4"/>`);
  const base = H1 + H2 - 10;
  parts.push(`<text x="${P - 6}" y="${H1 + 14}" font-size="11" text-anchor="end" fill="#4c5a68">100%</text><text x="${P - 6}" y="${base}" font-size="11" text-anchor="end" fill="#4c5a68">0%</text>`);
  const bw = Math.max(1, (W - P - 10) / n - 1);
  r.bocpd.changeProb.forEach((/** @type {number} */ p, /** @type {number} */ i) => { if (p > 0.005) parts.push(`<rect x="${(X(i) - bw / 2).toFixed(1)}" y="${(base - p * (H2 - 14)).toFixed(1)}" width="${bw.toFixed(1)}" height="${(p * (H2 - 14)).toFixed(1)}" fill="#1f5f86"><title>${esc(r.labels[i])}: ${(p * 100).toFixed(0)}%</title></rect>`); });
  parts.push(`<line x1="${P}" y1="${base}" x2="${W - 10}" y2="${base}" stroke="#ccd5dd"/>`);
  return `<svg viewBox="0 0 ${W} ${H1 + H2}" xmlns="http://www.w3.org/2000/svg">${parts.join("")}</svg>`;
}

/**
 * @param {any} r result of analyze()
 * @param {{ title?: string, author?: string, contact?: string, accent?: string, logo?: string, notes?: string, date?: string, agreed?: string }} [o]
 * o.agreed: consensus.mjs agreedText() for the same series; when given, the report leads with it.
 */
export function changeReportHtml(r, o = {}) {
  const title = esc((o.title || "").trim() || "Change report");
  const author = esc((o.author || "").trim());
  const contact = esc((o.contact || "").trim());
  const date = esc((o.date || "").trim());
  const accent = safeColor(o.accent || "");
  const logo = safeLogo(o.logo || "");
  const notes = (o.notes || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const agreed = (o.agreed || "").trim() ? `<p class="agreed"><strong>Agreed changes:</strong> ${esc(String(o.agreed).trim())}</p>` : "";
  const warn = ["rangeWarning", "driftWarning", "cycleWarning", "overcutWarning"].filter((k) => r[k]).map((k) => `<p class="warn"><strong>Read with care:</strong> ${esc(r[k])}</p>`).join("");
  const cps = r.pelt.changepoints;
  const changes = cps.length
    ? `<table><thead><tr><th>New segment from</th><th class="n">Mean before</th><th class="n">Mean after</th><th class="n">Shift (noise sd)</th><th class="n">SD before → after</th><th class="n">Bayesian prob. (±3 points)</th></tr></thead><tbody>` +
      cps.map((/** @type {any} */ c) => `<tr><td>${esc(c.label)}</td><td class="n">${fmt(c.meanBefore)}</td><td class="n">${fmt(c.meanAfter)}</td><td class="n">${fmt(c.shiftInNoiseSd)}</td><td class="n">${fmt(c.sdBefore)} → ${fmt(c.sdAfter)}</td><td class="n">${Math.round(c.bocpdProbWithin3 * 100)}%</td></tr>`).join("") + `</tbody></table>`
    : `<p>No change was found at this penalty.</p>`;
  const segs = `<table><thead><tr><th>From</th><th>To</th><th class="n">Points</th><th class="n">Mean</th><th class="n">SD</th></tr></thead><tbody>` +
    r.pelt.segments.map((/** @type {any} */ s) => `<tr><td>${esc(s.from)}</td><td>${esc(s.to)}</td><td class="n">${s.n}</td><td class="n">${fmt(s.mean)}</td><td class="n">${fmt(s.sd)}</td></tr>`).join("") + `</tbody></table>`;
  const noteBlock = notes.length ? `<h2>Analyst's notes</h2><ul>${notes.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>:root{--a:${accent}}body{font:15px/1.5 system-ui,sans-serif;margin:0 auto;max-width:52rem;padding:1rem;color:#1a1a1a;background:#fff}.bar{display:flex;align-items:center;gap:.75rem;border-bottom:4px solid var(--a);padding-bottom:.5rem;margin-bottom:1rem}.bar .logo{max-height:3.5rem;max-width:8rem}.bar small{display:block;color:#555}h1,h2{color:var(--a)}h1{margin:0;font-size:1.5rem}table{border-collapse:collapse;width:100%;margin-bottom:.75rem}th,td{text-align:left;padding:.3rem .5rem;border-bottom:1px solid #ccc}th{border-bottom:2px solid var(--a)}.n{text-align:right}.agreed{border-left:4px solid var(--a);padding:.4rem .6rem;background:#f3f7fa}.warn{background:#fff4e0;border-left:4px solid #c77c00;padding:.4rem .6rem}svg{width:100%;height:auto}.legend{color:#555;font-size:.85rem}.assume{font-size:.85rem;color:#444;border-top:1px solid #ccc;margin-top:1.5rem;padding-top:.5rem}@media print{body{max-width:none}h2{break-after:avoid}table,svg{break-inside:avoid}}</style></head>
<body>
<header class="bar">${logo ? `<img class="logo" src="${logo}" alt="">` : ""}<div><h1>${title}</h1><small>${[author, date, contact].filter(Boolean).join(" · ")}</small></div></header>
<h2>What changed</h2>
${agreed}<p>${agreed ? "Level model alone: " : ""}${esc(r.summary)}</p>
${warn}
<p class="legend">● series · red line: segment mean (PELT) · blue bars: change probability (Bayesian)</p>
${chartSvg(r)}
<h2>Changes</h2>
${changes}
<h2>Segments</h2>
${segs}
${noteBlock}
<p class="assume"><strong>Assumptions and limits.</strong> Changes are found with PELT (Killick, Fearnhead and Eckley 2012, exact, penalised) and probabilities with Bayesian online changepoint detection (Adams and MacKay 2007). Both treat points inside a segment as independent around a constant level; strong seasonality or autocorrelation can show up as extra changes. A detected change shows that the data before and after are better described as two segments than one. <strong>It does not show what caused the change.</strong> ${r.n} points analysed. Statistical estimates from the supplied data, not advice; no warranty; check results before relying on them.</p>
</body></html>
`;
}
