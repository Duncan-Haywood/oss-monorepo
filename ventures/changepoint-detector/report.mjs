// @ts-check
// Branded change report: the analysis on the analyst's own letterhead, one printable page set
// (cover, chart, the changes with their likely ranges, the segments, the stated assumptions).
// The detection itself is never gated; this is presentation. Pure: no network, every string
// escaped, the logo accepted only as a raster data: URL. States that a detected change is a
// statement about the data, not a cause.

/** @param {any} s */
export function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] || c); }

/** @param {string} c */
export function safeColor(c) { return /^#[0-9a-fA-F]{6}$/.test(String(c || "")) ? String(c) : "#1f5f86"; }

/** Only raster data URLs (no SVG, which can carry script). @param {string} u */
export function safeLogo(u) {
  const s = String(u || "");
  return /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length < 700000 ? s : "";
}

/** @param {any} v */
export function fmt(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return esc(v ?? "");
  const a = Math.abs(v);
  return a >= 100 ? v.toFixed(0) : a >= 1 ? v.toFixed(2) : a === 0 ? "0" : v.toPrecision(3);
}

/** Static SVG chart: series, segment means, dashed change lines. @param {any} r @param {string} accent */
export function chartSvg(r, accent) {
  const W = 900, H = 280, P = 48, n = r.values.length;
  const lo = Math.min(...r.values), hi = Math.max(...r.values);
  const pad = (hi - lo) * 0.06 || 1;
  const X = (/** @type {number} */ i) => P + (i / Math.max(1, n - 1)) * (W - P - 10);
  const Y = (/** @type {number} */ v) => 10 + (1 - (v - lo + pad) / (hi - lo + 2 * pad)) * (H - 40);
  const p = [`<line x1="${P}" y1="${H - 28}" x2="${W - 10}" y2="${H - 28}" stroke="#bbb"/>`];
  for (const t of [lo, (lo + hi) / 2, hi]) p.push(`<text x="${P - 6}" y="${(Y(t) + 4).toFixed(1)}" font-size="11" text-anchor="end" fill="#444">${fmt(t)}</text>`);
  const every = Math.max(1, Math.ceil(n / 8));
  for (let i = 0; i < n; i += every) p.push(`<text x="${X(i).toFixed(1)}" y="${H - 12}" font-size="11" text-anchor="middle" fill="#444">${esc(String(r.labels[i]).slice(0, 10))}</text>`);
  p.push(`<path d="${r.values.map((/** @type {number} */ v, /** @type {number} */ i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("")}" fill="none" stroke="#888" stroke-width="1.2"/>`);
  for (const s of r.pelt.segments) p.push(`<line x1="${X(s.start).toFixed(1)}" x2="${X(s.end).toFixed(1)}" y1="${Y(s.mean).toFixed(1)}" y2="${Y(s.mean).toFixed(1)}" stroke="${accent}" stroke-width="3"/>`);
  for (const c of r.pelt.changepoints) p.push(`<line x1="${X(c.index - 0.5).toFixed(1)}" x2="${X(c.index - 0.5).toFixed(1)}" y1="10" y2="${H - 28}" stroke="${accent}" stroke-dasharray="4 4"/>`);
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Series with segment means and detected changes">${p.join("")}</svg>`;
}

/**
 * @param {any} r result of analyze()
 * @param {{ title?: string, org?: string, author?: string, accent?: string, logo?: string, contact?: string, notes?: string, date?: string }} [o]
 */
export function reportHtml(r, o = {}) {
  const title = esc((o.title || "").trim() || "Change analysis");
  const org = esc((o.org || "").trim());
  const author = esc((o.author || "").trim());
  const contact = esc((o.contact || "").trim());
  const date = esc((o.date || "").trim());
  const accent = safeColor(o.accent || "");
  const logo = safeLogo(o.logo || "");
  const notes = (o.notes || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const logoTag = logo ? `<img class="logo" src="${logo}" alt="">` : "";
  const cps = r.pelt.changepoints;
  const changes = cps.length
    ? `<table><thead><tr><th>New segment from</th><th>Likely range (95%)</th><th class="n">Mean before</th><th class="n">Mean after</th><th class="n">Shift (noise sd)</th><th class="n">Bayesian prob. (±3)</th></tr></thead><tbody>${cps.map((/** @type {any} */ c) => `<tr><td>${esc(c.label)}</td><td>${c.range95 ? (c.range95.from === c.range95.to ? "that point only" : esc(c.range95.from) + " – " + esc(c.range95.to)) : "not computed"}</td><td class="n">${fmt(c.meanBefore)}</td><td class="n">${fmt(c.meanAfter)}</td><td class="n">${fmt(c.shiftInNoiseSd)}</td><td class="n">${Math.round((c.bocpdProbWithin3 || 0) * 100)}%</td></tr>`).join("")}</tbody></table>`
    : `<p>No change was found at this penalty.</p>`;
  const segs = `<table><thead><tr><th>From</th><th>To</th><th class="n">Points</th><th class="n">Mean</th><th class="n">SD</th></tr></thead><tbody>${r.pelt.segments.map((/** @type {any} */ s) => `<tr><td>${esc(s.from)}</td><td>${esc(s.to)}</td><td class="n">${s.n}</td><td class="n">${fmt(s.mean)}</td><td class="n">${fmt(s.sd)}</td></tr>`).join("")}</tbody></table>`;
  const warns = ["rangeWarning", "driftWarning", "cycleWarning"].filter((k) => r[k]).map((k) => `<p class="warn"><strong>Read with care:</strong> ${esc(r[k])}</p>`).join("");
  const noteBlock = notes.length ? `<h2>Analyst notes</h2><ul>${notes.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}${org ? " – " + org : ""}</title>
<style>:root{--a:${accent}}body{font:16px/1.5 system-ui,sans-serif;margin:0 auto;max-width:50rem;padding:1rem;color:#1a1a1a;background:#fff}h1,h2{color:var(--a)}.cover{text-align:center;padding:3rem 0;border-bottom:4px solid var(--a);margin-bottom:1.5rem}.cover .logo{max-height:8rem;max-width:16rem;margin-bottom:1rem}.cover h1{font-size:2.2rem;margin:.2rem 0}table{border-collapse:collapse;width:100%;margin-bottom:.75rem;font-size:.92rem}th,td{text-align:left;padding:.35rem .5rem;border-bottom:1px solid #ccc}th{border-bottom:2px solid var(--a)}.n{text-align:right}.warn{background:#fff6e5;border-left:4px solid #d08a00;padding:.4rem .6rem}svg{width:100%;height:auto}section{break-inside:avoid}footer{color:#555;font-size:.85rem;margin-top:2rem}@media print{body{max-width:none}}</style></head>
<body>
<div class="cover">${logoTag}<h1>${title}</h1>${org ? `<p>${org}</p>` : ""}${author || date ? `<p>${[author, date].filter(Boolean).join(" · ")}</p>` : ""}${contact ? `<p>${contact}</p>` : ""}</div>
<section><h2>Finding</h2><p>${esc(r.summary)}</p>${warns}</section>
<section><h2>The series</h2>${chartSvg(r, accent)}<p>Grey: the series. Solid line: segment mean. Dashed: a detected change.</p></section>
<section><h2>Changes</h2>${changes}</section>
<section><h2>Segments</h2>${segs}</section>
<section><h2>Method and assumptions</h2><p>Segments come from PELT (Killick, Fearnhead &amp; Eckley 2012), an exact search over every possible set of changes under a penalty per change. The probability column comes from Bayesian online changepoint detection (Adams &amp; MacKay 2007). Both assume points within a segment are independent around a constant level unless the options used say otherwise. A detected change is a statement about the data, not a cause: whether a release, price change or outage caused it needs knowledge of what happened then.</p></section>
${noteBlock}
<footer>Made with the free changepoint detector. <strong>No warranty.</strong> This report is a statistical estimate of the data supplied, provided as-is without warranty of any kind. It is not legal, tax or financial advice and does not replace a qualified statistician. Review and verify it before relying on it.</footer>
</body></html>
`;
}
