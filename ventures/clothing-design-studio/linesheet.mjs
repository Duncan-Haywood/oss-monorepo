/**
 * Wholesale line sheet: the one-page catalogue a brand sends a boutique, and the
 * order form that comes back. Typed styles in, a printable self-contained HTML
 * file and a CSV order form out.
 *
 * Each style carries a retail price (tax included), colours and sizes. The
 * wholesale price per style is the tax-free retail price times (1 - shop
 * margin), the same keystone rule as wholesale.mjs. Style and order minimums
 * come from the brand's terms. Nothing is uploaded; the file is built here.
 * Estimates from typed numbers; the brand checks the terms before sending.
 */

const round2 = (v) => Math.round(v * 100) / 100;
const num = (v, d) => (v !== "" && v !== null && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : d);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const list = (v) => (Array.isArray(v) ? v : String(v ?? "").split(",")).map((s) => String(s).trim()).filter(Boolean);
export const MAX_STYLES = 60;

export function buildLineSheet(input) {
  const terms = {
    salesTaxPct: num(input?.salesTaxPct, 20), shopMarginPct: num(input?.shopMarginPct, 50),
    minOrderValue: num(input?.minOrderValue, 300), minPerStyle: num(input?.minPerStyle, 6),
    currency: String(input?.currency || "USD").slice(0, 3).toUpperCase(),
  };
  if (terms.shopMarginPct < 0 || terms.shopMarginPct >= 100) return { ok: false, error: "Shop margin must be from 0 to under 100 percent." };
  if (terms.salesTaxPct < 0) return { ok: false, error: "Sales tax cannot be negative." };
  if (terms.minOrderValue < 0 || terms.minPerStyle < 0) return { ok: false, error: "Minimums cannot be negative." };
  const raw = Array.isArray(input?.styles) ? input.styles : [];
  if (!raw.length) return { ok: false, error: "Add at least one style." };
  if (raw.length > MAX_STYLES) return { ok: false, error: `A line sheet holds up to ${MAX_STYLES} styles.` };
  const warnings = [];
  const styles = [];
  const seen = new Set();
  raw.forEach((s, i) => {
    const name = String(s?.name ?? "").trim();
    const retail = num(s?.retail, NaN);
    if (!name || !(retail > 0)) { warnings.push(`Style ${i + 1} skipped: it needs a name and a retail price above 0.`); return; }
    let sku = String(s?.sku || "").trim() || `S${String(styles.length + 1).padStart(3, "0")}`;
    if (seen.has(sku)) { warnings.push(`SKU ${sku} appears twice; the second was renamed ${sku}-2.`); sku += "-2"; }
    seen.add(sku);
    const retailNet = retail / (1 + terms.salesTaxPct / 100);
    const wholesale = round2(retailNet * (1 - terms.shopMarginPct / 100));
    const landed = num(s?.landed, null);
    if (landed != null && wholesale < landed * 2) warnings.push(`${name}: wholesale ${wholesale} is under 2x landed cost ${landed}, a rule of thumb for covering design and marketing.`);
    styles.push({ sku, name, retail: round2(retail), wholesale, colours: list(s?.colours), sizes: list(s?.sizes), fabric: String(s?.fabric ?? "").trim(), note: String(s?.note ?? "").trim() });
  });
  if (!styles.length) return { ok: false, error: "No style had both a name and a retail price above 0.", warnings };
  const lowest = Math.min(...styles.map((s) => s.wholesale));
  const minUnits = lowest > 0 ? Math.ceil(terms.minOrderValue / lowest) : null;
  return { ok: true, terms, styles, warnings, minUnitsAtCheapest: minUnits };
}

/** One row per style x colour x size for the stockist to fill the Qty column. */
export function orderFormCsv(sheet) {
  const q = (v) => { const t = String(v ?? "").replace(/^[=+\-@\t\r]/, "'$&"); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const rows = [["SKU", "Style", "Colour", "Size", `Wholesale (${sheet.terms.currency})`, `Retail (${sheet.terms.currency})`, "Qty"]];
  for (const s of sheet.styles) {
    const cols = s.colours.length ? s.colours : [""], sizes = s.sizes.length ? s.sizes : [""];
    for (const c of cols) for (const z of sizes) rows.push([s.sku, s.name, c, z, s.wholesale.toFixed(2), s.retail.toFixed(2), ""]);
  }
  return rows.map((r) => r.map(q).join(",")).join("\n") + "\n";
}

/** A standalone printable page. Brand text is escaped; no scripts, no external loads. */
export function lineSheetHtml(sheet, brand = {}) {
  const { terms } = sheet, c = terms.currency;
  const money = (v) => `${esc(c)} ${v.toFixed(2)}`;
  const cards = sheet.styles.map((s) => `<article><h2>${esc(s.name)}</h2><p class="sku">${esc(s.sku)}</p>
<p class="p">Wholesale <b>${money(s.wholesale)}</b> · Retail ${money(s.retail)}</p>
${s.colours.length ? `<p>Colours: ${s.colours.map(esc).join(", ")}</p>` : ""}${s.sizes.length ? `<p>Sizes: ${s.sizes.map(esc).join(", ")}</p>` : ""}${s.fabric ? `<p>Fabric: ${esc(s.fabric)}</p>` : ""}${s.note ? `<p class="n">${esc(s.note)}</p>` : ""}</article>`).join("\n");
  const title = `${esc(brand.name || "Line sheet")}${brand.season ? ` · ${esc(brand.season)}` : ""}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>body{font:15px/1.45 Georgia,serif;max-width:900px;margin:24px auto;padding:0 16px;color:#221d1a}h1{margin:0}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}article{border:1px solid #ddd2c4;border-radius:8px;padding:10px;break-inside:avoid}h2{font-size:1.05rem;margin:0}p{margin:3px 0}.sku{color:#6a605a;font-size:.8rem}.n{font-style:italic}.terms{background:#f5f0e8;padding:10px;border-radius:8px;margin:12px 0}@media print{body{margin:0}}</style></head><body>
<h1>${title}</h1>${brand.contact ? `<p>${esc(brand.contact)}</p>` : ""}${brand.delivery ? `<p>Delivery window: ${esc(brand.delivery)}</p>` : ""}
<div class="terms"><b>Terms.</b> Minimum order ${money(terms.minOrderValue)}; minimum ${terms.minPerStyle} pieces per style.${brand.payment ? ` Payment: ${esc(brand.payment)}.` : ""} Prices exclude shipping and taxes.</div>
<main>
${cards}
</main></body></html>`;
}
