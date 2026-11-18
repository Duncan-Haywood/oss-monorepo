// @ts-check
// Branded shed build pack: the design on a seller's or builder's own letterhead, as one page set
// to print or save as PDF. Cover (business name, logo, contact, the shed's facts), elevations, the
// roof and footprint plan, the shopping list with quantities, and the how-to-build steps. Every
// number comes from the same model, estimate and instructions the free designer shows; this is
// presentation only and nothing in it is gated except the letterhead. Pure: no network, every
// typed string escaped, the logo accepted only as a raster data: URL.
import { packetSummary, elevationSvg, planSvg, VIEWS } from './hoa.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** @param {string} c */
export function safeColor(c) { return /^#[0-9a-fA-F]{6}$/.test(String(c || '')) ? String(c) : '#24392b'; }

/** Only raster data URLs are allowed (no SVG, which can carry script). @param {string} u */
export function safeLogo(u) {
  const s = String(u || '');
  return /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length < 700000 ? s : '';
}

/**
 * @param {import('./model.mjs').Shed} shed
 * @param {{ shopping: { section: string, name: string, qty: number, unit: string, price: number, total: number }[], total: number, unpriced?: string[] }} est
 * @param {{ title: string, why?: string, steps: string[], check?: string[] }[]} sections from buildInstructions
 * @param {{ business?: string, customer?: string, contact?: string, accent?: string, logo?: string, notes?: string, showPrices?: boolean, date?: string }} [o]
 */
export function buildPackHtml(shed, est, sections, o = {}) {
  const d = shed.design;
  const business = esc((o.business || '').trim() || 'Shed build pack');
  const customer = esc((o.customer || '').trim());
  const contact = esc((o.contact || '').trim());
  const date = esc((o.date || '').trim());
  const accent = safeColor(o.accent || '');
  const logo = safeLogo(o.logo || '');
  const showPrices = o.showPrices !== false;
  const notes = (o.notes || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const head = `<header class="bar">${logo ? `<img class="logo" src="${logo}" alt="">` : ''}<div><strong>${business}</strong> <span>${esc(d.name)}</span></div></header>`;
  const rows = packetSummary(shed).map(([a, b]) => `<tr><th>${esc(a)}</th><td>${esc(b)}</td></tr>`).join('');
  const figs = VIEWS.map((v) => `<figure>${elevationSvg(shed, v)}<figcaption>${esc(v[0].toUpperCase() + v.slice(1))} elevation</figcaption></figure>`).join('');
  const bySection = new Map();
  for (const r of est.shopping) { if (!bySection.has(r.section)) bySection.set(r.section, []); bySection.get(r.section).push(r); }
  const money = (n) => n.toFixed(2);
  const shop = [...bySection].map(([sec, items]) => `<h3>${esc(sec)}</h3><table><thead><tr><th>Item</th><th>Qty</th><th>Unit</th>${showPrices ? '<th>Each</th><th>Total</th>' : ''}</tr></thead><tbody>${items.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.qty)}</td><td>${esc(r.unit)}</td>${showPrices ? `<td>${money(r.price)}</td><td>${money(r.total)}</td>` : ''}</tr>`).join('')}</tbody></table>`).join('');
  const unpriced = (est.unpriced || []).length ? `<p class="note">Not in the list or total: ${(est.unpriced || []).map(esc).join('; ')}.</p>` : '';
  const total = showPrices ? `<p class="total">Materials total ${money(est.total)} at the prices shown (starting prices, not a quote; check them where you buy).</p>` : '';
  const steps = sections.map((s, i) => `<section class="step"><h3>${i + 1}. ${esc(s.title)}</h3>${s.why ? `<p class="why">${esc(s.why)}</p>` : ''}<ol>${s.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>${s.check?.length ? `<p><strong>Check:</strong></p><ul>${s.check.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</section>`).join('');
  const noteBlock = notes.length ? `<section class="sheet"><h2>Notes</h2><ul>${notes.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></section>` : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${business}: ${esc(d.name)} build pack</title>
<style>:root{--a:${accent}}body{font:15px/1.5 system-ui,sans-serif;margin:0 auto;max-width:52rem;padding:1rem;color:#1a1a1a;background:#fff}.bar{display:flex;align-items:center;gap:.75rem;border-bottom:4px solid var(--a);padding-bottom:.4rem;margin-bottom:.8rem}.bar span{color:#555}.logo{max-height:3rem;max-width:8rem}.cover{min-height:40vh;border-left:8px solid var(--a);padding:1rem 1.2rem;margin-bottom:1rem}.cover h1{margin:.2em 0;color:var(--a)}table{border-collapse:collapse;width:100%;margin:.4rem 0 1rem}th,td{border:1px solid #ccc;padding:.25rem .5rem;text-align:left;vertical-align:top}th{background:#f3f3f3}figure{margin:0 0 1rem;break-inside:avoid}figure svg{max-width:100%;height:auto}figcaption{font-size:.85rem;color:#555}.step{break-inside:avoid;margin-bottom:.8rem}.why{color:#555;font-style:italic}.note,.total{color:#333}footer{margin-top:1.5rem;padding-top:.5rem;border-top:1px solid #ccc;font-size:.8rem;color:#555}h2{color:var(--a);break-before:page}@media print{body{padding:0}.cover{break-after:page}}</style></head>
<body>
<section class="cover">${logo ? `<img class="logo" src="${logo}" alt="">` : ''}<h1>${business}</h1><p>${esc(d.name)}${customer ? ` for ${customer}` : ''}${date ? `, ${date}` : ''}</p>${contact ? `<p>${contact}</p>` : ''}<table>${rows}</table></section>
${head}
<h2>Elevations</h2>${figs}
<h2>Roof and footprint plan</h2><figure>${planSvg(shed)}<figcaption>Seen from above, front wall at the bottom.</figcaption></figure>
<h2>Shopping list</h2>${shop}${unpriced}${total}
<h2>How to build</h2>${steps}
${noteBlock}
<footer>Made with the free Shed Designer. Not engineering or building-code advice: check your local code, permit rules and each product's instructions, and have an engineer review anything unusual. Quantities come from the design above and may differ from what you buy. <strong>No warranty.</strong> Provided as-is, without warranty of any kind.</footer>
</body></html>
`;
}
