/**
 * Partner catalogue intake: a partner brand sends its products as a CSV, the
 * shop checks it, sees what each piece pays the brand and the shop under the
 * agreed terms, and builds one multi-brand shop page with each brand named.
 *
 * Header names are matched loosely (sku, id; name, title; price, retail;
 * colors, colours; sizes; image; url, link). The price is the shelf price the
 * shopper pays, VAT included, in the shop's currency. Money maths is
 * `splitSale` from commission.mjs. Nothing is uploaded and no money moves.
 * The shop page lists products and links to each brand's own https page to
 * buy; it never takes payment. Whether the shop or the brand is the seller of
 * record is a matter for the contract (see commission.mjs).
 */
import { splitSale, checkTerms } from "./commission.mjs";

export const MAX_ROWS = 500;
const ALIASES = {
  sku: ["sku", "id", "code", "item", "reference", "ref"],
  name: ["name", "title", "product", "style"],
  price: ["price", "retail", "shelfprice", "rrp", "msrp"],
  colours: ["colours", "colors", "colour", "color"],
  sizes: ["sizes", "size"],
  image: ["image", "imageurl", "photo", "picture"],
  url: ["url", "link", "producturl", "page"],
};
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const r2 = v => Math.round((v + Number.EPSILON) * 100) / 100;
const httpsOnly = u => { try { const x = new URL(String(u).trim()); return x.protocol === "https:" ? x.href : ""; } catch { return ""; } };

/** RFC-4180-ish: quoted fields may hold commas, doubled quotes and newlines. */
export function parseCsv(text) {
  const rows = []; let row = [], cur = "", q = false;
  const s = String(text ?? "").replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"' && s[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === "," || c === ";") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ""));
}

const norm = h => String(h).toLowerCase().replace(/[^a-z]/g, "");
const money = v => { const n = Number(String(v).replace(/[^0-9.,\-]/g, "").replace(/,(\d{2})$/, ".$1").replace(/,/g, "")); return Number.isFinite(n) ? n : NaN; };
const list = v => String(v ?? "").split(/[|,/]/).map(x => x.trim()).filter(Boolean).slice(0, 20);

/**
 * @returns {{ok:boolean, error?:string, brand:string, products:object[], warnings:string[]}}
 */
export function parseFeed(text, brand) {
  const name = String(brand ?? "").trim().slice(0, 60);
  if (!name) return { ok: false, error: "Name the partner brand.", brand: "", products: [], warnings: [] };
  const rows = parseCsv(text);
  if (rows.length < 2) return { ok: false, error: "Paste a header row and at least one product row.", brand: name, products: [], warnings: [] };
  const head = rows[0].map(norm), col = {};
  for (const [k, names] of Object.entries(ALIASES)) col[k] = head.findIndex(h => names.includes(h));
  if (col.name < 0 || col.price < 0) return { ok: false, error: "The header needs a name (or title) column and a price column.", brand: name, products: [], warnings: [] };
  if (rows.length - 1 > MAX_ROWS) return { ok: false, error: `A feed holds up to ${MAX_ROWS} products.`, brand: name, products: [], warnings: [] };
  const warnings = [], products = [], seen = new Set();
  rows.slice(1).forEach((r, i) => {
    const at = c => (c >= 0 ? (r[c] ?? "").trim() : "");
    const n = at(col.name).slice(0, 120), price = money(at(col.price));
    if (!n || !(price > 0)) { warnings.push(`Row ${i + 2} skipped: it needs a name and a price above 0.`); return; }
    let sku = at(col.sku).slice(0, 40) || `${name.slice(0, 3).toUpperCase()}-${String(products.length + 1).padStart(3, "0")}`;
    if (seen.has(sku)) { warnings.push(`Row ${i + 2}: SKU ${sku} repeats; renamed ${sku}-2.`); sku += "-2"; }
    seen.add(sku);
    const url = httpsOnly(at(col.url)), image = httpsOnly(at(col.image));
    if (at(col.url) && !url) warnings.push(`Row ${i + 2}: the product link is not an https address and was dropped.`);
    if (at(col.image) && !image) warnings.push(`Row ${i + 2}: the image link is not an https address and was dropped.`);
    products.push({ brand: name, sku, name: n, price: r2(price), colours: list(at(col.colours)), sizes: list(at(col.sizes)), image, url });
  });
  if (!products.length) return { ok: false, error: "No usable product rows.", brand: name, products, warnings };
  return { ok: true, brand: name, products, warnings };
}

/**
 * Put payout figures on each product under the terms; flag pieces where the
 * brand or the shop would earn nothing. Same SKU in two brands is allowed
 * (the brand is part of the key) but the same brand and name twice is flagged.
 */
export function priceCatalogue(feeds, terms = {}) {
  const { errors } = checkTerms(terms);
  if (errors.length) return { ok: false, error: errors.join(" ") };
  const items = [], warnings = [], names = new Set();
  const perBrand = {};
  for (const f of feeds) for (const p of f.products) {
    const key = `${p.brand}|${p.name.toLowerCase()}`;
    if (names.has(key)) warnings.push(`${p.brand}: "${p.name}" is listed twice.`);
    names.add(key);
    const s = splitSale(p.price, terms);
    if (s.error) return { ok: false, error: s.error };
    items.push({ ...p, brandPayout: s.brandPayout, shopKeeps: s.shopKeeps, commission: s.commission, cardFee: s.cardFee });
    if (s.brandPayout <= 0) warnings.push(`${p.brand}: "${p.name}" (${p.price.toFixed(2)}) would pay the brand nothing or less.`);
    if (s.shopKeeps <= 0) warnings.push(`${p.brand}: "${p.name}" (${p.price.toFixed(2)}) would lose the shop money.`);
    const b = (perBrand[p.brand] ??= { brand: p.brand, products: 0, avgPrice: 0, avgShopKeeps: 0 });
    b.products++; b.avgPrice += p.price; b.avgShopKeeps += s.shopKeeps;
  }
  const brands = Object.values(perBrand).map(b => ({ ...b, avgPrice: r2(b.avgPrice / b.products), avgShopKeeps: r2(b.avgShopKeeps / b.products) }));
  return { ok: true, items, brands, warnings };
}

/** One static, script-free page: a section per brand, escaped, https links only. */
export function multiBrandShopHtml(catalogue, shop = {}) {
  if (!catalogue?.ok) return "";
  const cur = String(shop.currency || "EUR").slice(0, 3).toUpperCase();
  const title = esc(shop.name || "Multi-brand shop");
  const sections = catalogue.brands.map(b => {
    const cards = catalogue.items.filter(i => i.brand === b.brand).map(i => {
      const img = i.image ? `<img src="${esc(i.image)}" alt="${esc(i.name)}" loading="lazy" width="240">` : "";
      const buy = i.url ? `<p><a href="${esc(i.url)}" rel="noopener nofollow">View at ${esc(i.brand)}</a></p>` : "";
      return `<article>${img}<h3>${esc(i.name)}</h3><p class="p">${esc(cur)} ${i.price.toFixed(2)}</p>${i.colours.length ? `<p>Colours: ${i.colours.map(esc).join(", ")}</p>` : ""}${i.sizes.length ? `<p>Sizes: ${i.sizes.map(esc).join(", ")}</p>` : ""}${buy}</article>`;
    }).join("\n");
    return `<section><h2>${esc(b.brand)}</h2><div class="g">\n${cards}\n</div></section>`;
  }).join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>body{font:15px/1.45 Georgia,serif;max-width:1000px;margin:24px auto;padding:0 16px;color:#221d1a}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}article{border:1px solid #ddd2c4;border-radius:8px;padding:10px}img{max-width:100%;height:auto}h3{font-size:1rem;margin:6px 0}p{margin:3px 0}.p{font-weight:700}a{color:#6b1e2c}</style></head><body>
<h1>${title}</h1>${shop.about ? `<p>${esc(shop.about)}</p>` : ""}
${sections}
<p><small>Prices include VAT where it applies. Each product is made and sold by the brand named above.</small></p></body></html>`;
}

export function catalogueCsv(catalogue) {
  const q = v => { const t = String(v ?? "").replace(/^[=+\-@\t\r]/, "'$&"); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const rows = [["Brand", "SKU", "Name", "Price", "Commission", "Card fee", "Brand paid", "Shop keeps"]];
  for (const i of catalogue.items) rows.push([i.brand, i.sku, i.name, i.price.toFixed(2), i.commission.toFixed(2), i.cardFee.toFixed(2), i.brandPayout.toFixed(2), i.shopKeeps.toFixed(2)]);
  return rows.map(r => r.map(q).join(",")).join("\n") + "\n";
}
