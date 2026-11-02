// Branded bid package: one printable document with the contractor's name, logo
// and licence number on a cover, the customer proposal, the materials list from
// the takeoff and the terms. Pure function; every typed string is escaped, the
// logo must be an embedded png/jpeg/webp data URI (so the file stays
// self-contained and a typed value cannot inject markup), and the accent
// colour must be a #rrggbb hex. The free proposal in bidletter.mjs is
// unchanged; this is the paid layer on top of it.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] || c);
const money = (x) => x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const safeLogo = (u) => (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(String(u || "")) && String(u).length < 400000 ? String(u) : "");
export const safeAccent = (c) => (/^#[0-9a-fA-F]{6}$/.test(String(c || "")) ? String(c) : "#1f4e79");

/**
 * @param {any} q result of proposal() from bidletter.mjs
 * @param {{item: string, qty: number|string, unit?: string}[]} materials
 * @param {{company?: string, contact?: string, phone?: string, email?: string, licenceNo?: string, logo?: string, accent?: string}} [brand]
 */
export function bidPackageHtml(q, materials = [], brand = {}) {
  const acc = safeAccent(brand.accent), logo = safeLogo(brand.logo);
  const css = `body{font:14px/1.5 system-ui,sans-serif;color:#111;margin:0}.pg{max-width:46rem;margin:0 auto;padding:2rem 1rem}.cover{min-height:60vh;border-top:10px solid ${acc};padding-top:2rem}.cover img{max-height:90px;max-width:260px;display:block;margin-bottom:1rem}h1{font-size:2rem;color:${acc};margin:.2rem 0}h2{color:${acc};border-bottom:2px solid ${acc};padding-bottom:.15rem}table{width:100%;border-collapse:collapse}td,th{padding:.3rem .4rem;border-bottom:1px solid #ccc;text-align:left}td.n{text-align:right;font-variant-numeric:tabular-nums}tr.total td{font-weight:700;border-top:2px solid #111}.small{font-size:.85rem;color:#444}.warn{border:2px solid #b00;padding:.5rem;font-weight:700}.brk{page-break-before:always}@media print{.pg{padding:0}}`;
  const who = [brand.company, brand.contact, brand.phone, brand.email].filter(Boolean).map(esc).join(" · ");
  const head = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Bid package${q.ok && q.meta.project ? ": " + esc(q.meta.project) : ""}</title><style>${css}</style></head><body><div class="pg">`;
  if (!q.ok) return head + `<h1>Bid package not issued</h1><p>${esc(q.error)}</p></div></body></html>`;
  const h = [head, `<section class="cover">${logo ? `<img src="${logo}" alt="">` : ""}<p class="small">${esc(brand.company || "")}</p><h1>Bid package${q.meta.project ? ": " + esc(q.meta.project) : ""}</h1>`];
  if (q.meta.client) h.push(`<p>Prepared for ${esc(q.meta.client)}${q.meta.date ? ", " + esc(q.meta.date) : ""}</p>`);
  else if (q.meta.date) h.push(`<p>${esc(q.meta.date)}</p>`);
  if (who) h.push(`<p>${who}</p>`);
  if (brand.licenceNo) h.push(`<p class="small">Contractor licence no. ${esc(brand.licenceNo)}</p>`);
  h.push(`<p><strong>Total price ${money(q.price)}</strong>, valid for ${q.validDays} days.</p></section>`);
  h.push(`<section class="brk"><h2>Scope of work</h2><p>${q.scope.map(esc).join(", ")}.</p>`);
  if (q.inclusions.length) h.push(`<p>Also included: ${q.inclusions.map(esc).join("; ")}.</p>`);
  h.push(`<h2>Price by section</h2><table><tbody>${q.rows.map((r) => `<tr><td>${esc(r.name)}</td><td class="n">${money(r.amount)}</td></tr>`).join("")}<tr class="total"><td>Total</td><td class="n">${money(q.price)}</td></tr></tbody></table>`);
  if (q.allowances.length) h.push(`<h2>Allowances</h2><p class="small">Actual cost is billed; the price moves with the difference.</p><table><tbody>${q.allowances.map((a) => `<tr><td>${esc(a.item)}</td><td class="n">${money(a.amount)}</td></tr>`).join("")}</tbody></table>`);
  if (q.payments.length) h.push(`<h2>Payment schedule</h2><table><tbody>${q.payments.map((m) => `<tr><td>${esc(m.name)}</td><td class="n">${m.pct}%</td><td class="n">${money(m.amount)}</td></tr>`).join("")}</tbody></table>`);
  h.push("</section>");
  if (materials.length) h.push(`<section class="brk"><h2>Materials list</h2><p class="small">Quantities from the plans as drawn.</p><table><thead><tr><th>Item</th><th class="n">Qty</th><th>Unit</th></tr></thead><tbody>${materials.map((m) => `<tr><td>${esc(m.item)}</td><td class="n">${esc(m.qty)}</td><td>${esc(m.unit || "")}</td></tr>`).join("")}</tbody></table></section>`);
  if (q.exclusions.length || q.terms.length) {
    h.push(`<section>`);
    if (q.exclusions.length) h.push(`<h2>Not included</h2><ul>${q.exclusions.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>`);
    if (q.terms.length) h.push(`<h2>Terms</h2><ul>${q.terms.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`);
    h.push(`</section>`);
  }
  h.push(`<p class="small">This price is valid for ${q.validDays} days. Quantities come from the plans as drawn; changes are priced by change order. An estimate from the prices the contractor typed, not a contract or a legal document; check it against your licence, local law and the customer's agreement before it is sent.</p>`);
  if (q.partial) h.push(`<p class="warn">Partial proposal, not priced: ${q.gaps.map(esc).join("; ")}.</p>`);
  h.push("</div></body></html>");
  return h.join("");
}
