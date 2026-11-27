// @ts-check
// Branded bid package: the customer proposal with the contractor's letterhead and a
// quantities appendix (and, for a roof from an outline, the dimensioned roof plan), as one
// printable page (Print, Save as PDF). The appendix lists
// quantities only, never unit prices, so the customer sees neither cost nor margin.
import { proposalHtml } from "./bidletter.mjs";

const esc = (/** @type {string} */ s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] || c);

/** A logo may be an https URL or a PNG/JPEG/WebP/GIF data URL; SVG and anything else is dropped. @param {string} v */
export function cleanLogo(v) {
  const s = String(v || "").trim();
  if (/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length < 400000) return s;
  try { const u = new URL(s); return u.protocol === "https:" && !u.username && !u.password ? u.href : ""; } catch { return ""; }
}
/** @param {string} v */
export const cleanAccent = (v) => (/^#[0-9a-fA-F]{6}$/.test(String(v || "").trim()) ? String(v).trim() : "#1f3a5f");

/**
 * The roof plan drawing for the package: only an SVG that roofplan.mjs draws (numbers, lines,
 * polygons and plain dimension text) is kept; anything that could run or load is dropped.
 * @param {unknown} svg
 */
export function cleanDrawing(svg) {
  const s = typeof svg === "string" ? svg : "";
  if (!s.startsWith('<svg xmlns="http://www.w3.org/2000/svg" ') || !s.endsWith("</svg>") || s.length > 2000000) return "";
  if (/<(?!\/?(?:svg|line|polygon|path|text)[\s>\/])/i.test(s) || /\son\w+\s*=|href|url\(|javascript:|<!|&#/i.test(s)) return "";
  return s;
}

/**
 * @param {any} q result of proposal()
 * @param {{ lines?: { section: string, item: string, qty: number, unit: string }[] }} b the budget the proposal came from
 * @param {{ company?: string, logo?: string, address?: string, phone?: string, email?: string, licenseNo?: string, accent?: string }} [brand]
 * @param {{ roofPlanSvg?: string }} [drawings] roofplan.mjs `roofPlanSvg` output, printed before the quantities
 */
export function bidPackageHtml(q, b, brand = {}, drawings = {}) {
  if (!q || !q.ok) return proposalHtml(q);
  const accent = cleanAccent(brand.accent || "");
  const logo = cleanLogo(brand.logo || "");
  const contact = [brand.address, brand.phone, brand.email, brand.licenseNo ? "Licence " + brand.licenseNo : ""].filter(Boolean).map((x) => esc(String(x))).join(" &middot; ");
  const header = `<header class="brand">${logo ? `<img src="${esc(logo)}" alt="" style="max-height:64px;max-width:200px">` : ""}<div><strong>${esc(brand.company || "")}</strong><br><span class="small">${contact}</span></div></header>`;
  const groups = new Map();
  for (const l of (b && b.lines) || []) {
    if (l.section === "Labor" || l.section === "Allowances") continue;
    if (!groups.has(l.section)) groups.set(l.section, []);
    groups.get(l.section).push(l);
  }
  const appendix = groups.size
    ? `<h2>Quantities from the plans</h2><p class="small">Counted from the drawings as typed; no unit prices are shown.</p>` +
      [...groups].map(([s, ls]) => `<h3>${esc(s)}</h3><table><thead><tr><th scope="col">Item</th><th scope="col" class="n">Quantity</th><th scope="col">Unit</th></tr></thead><tbody>${ls.map((/** @type {any} */ l) => `<tr><td>${esc(l.item)}</td><td class="n">${l.qty}</td><td>${esc(l.unit)}</td></tr>`).join("")}</tbody></table>`).join("")
    : "";
  const roof = cleanDrawing(drawings.roofPlanSvg);
  const drawing = roof ? `<section class="drawing"><h2>Roof plan</h2><p class="small">From above, plan north up, to scale from the plan's corners; eave sides dimensioned along the eave edge. Not a construction drawing.</p>${roof}</section>` : "";
  const css = `${roof ? ".drawing svg{max-height:none!important;border:1px solid #ccc}.drawing{break-inside:avoid;page-break-inside:avoid}" : ""}.brand{display:flex;gap:1rem;align-items:center;border-bottom:3px solid ${accent};padding-bottom:.6rem;margin-bottom:1rem}h1,h2,h3{color:${accent}}`;
  return proposalHtml(q, { header, appendix: drawing + appendix, css, footer: `<p class="small">Estimate from the contractor's own prices; not a contract.</p>` });
}
