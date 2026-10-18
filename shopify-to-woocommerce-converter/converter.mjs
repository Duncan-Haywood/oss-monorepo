// Shopify product CSV -> WooCommerce product import CSV. Pure functions, no DOM, no network.
// Column names and mappings are read from memory of Shopify's public product CSV template and
// WooCommerce's public product CSV importer documentation; no import into either platform was
// available when this was built, so the output is meant to be imported on a staging copy first.

export const WOO_COLUMNS = [
  "ID", "Type", "SKU", "GTIN, UPC, EAN, or ISBN", "Name", "Published", "Is featured?", "Visibility in catalog",
  "Short description", "Description", "Tax status", "Tax class", "In stock?", "Stock", "Backorders allowed?",
  "Weight (kg)", "Sale price", "Regular price", "Categories", "Tags", "Images", "Parent", "Position",
  "Attribute 1 name", "Attribute 1 value(s)", "Attribute 1 visible", "Attribute 1 global",
  "Attribute 2 name", "Attribute 2 value(s)", "Attribute 2 visible", "Attribute 2 global",
  "Attribute 3 name", "Attribute 3 value(s)", "Attribute 3 visible", "Attribute 3 global",
];

export function decodeBuffer(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return new TextDecoder("utf-8").decode(u8);
}

// RFC 4180-ish: quoted fields, doubled quotes, newlines inside quotes. Tracks the
// physical line each record starts on so findings can name it.
export function parseCsv(text, delim = ",") {
  const rows = [];
  let row = [], cell = "", q = false, line = 1, start = 1, i = 0, quoteLine = 0, sawAny = false;
  const push = () => { row.push(cell); cell = ""; };
  const endRow = () => { push(); rows.push({ cells: row, line: start }); row = []; sawAny = false; };
  while (i < text.length) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        q = false; i++; continue;
      }
      if (ch === "\n") line++;
      cell += ch; i++; continue;
    }
    if (ch === '"' && cell === "") { q = true; quoteLine = line; sawAny = true; i++; continue; }
    if (ch === delim) { push(); sawAny = true; i++; continue; }
    if (ch === "\r") { i++; continue; }
    if (ch === "\n") { endRow(); line++; start = line; i++; continue; }
    cell += ch; sawAny = true; i++;
  }
  if (q) return { rows, unterminated: quoteLine };
  if (sawAny || cell !== "" || row.length) endRow();
  return { rows, unterminated: 0 };
}

export function toCsv(rows, delim = ",") {
  const esc = (v) => (/[",\r\n]/.test(v) || v !== v.trim() ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(esc).join(delim)).join("\r\n") + "\r\n";
}

export function slugify(s) {
  return String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}


const isNum = (v) => /^\d+(\.\d+)?$/.test(v);

function cleanPrice(v) {
  let s = String(v ?? "").trim().replace(/^[$€£¥]\s*/, "").replace(/\s*(USD|EUR|GBP|CAD|AUD)$/i, "");
  if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  return s;
}
const money = (n) => String(Math.round(n * 100) / 100).replace(/(\.\d)$/, "$10");
const kg = (g) => String(Math.round((g / 1000) * 10000) / 10000);
const esc = (v) => v.replace(/,/g, "\\,");
const upper = (s) => s.toUpperCase();

export const NOT_CONVERTED = [
  ["Vendor", "WooCommerce has no vendor field in the standard importer. Add it as a brand/taxonomy with a plugin, or as a tag."],
  ["SEO Title / SEO Description", "These belong to an SEO plugin (Yoast, Rank Math); map them with that plugin's importer."],
  ["Cost per item", "WooCommerce core has no cost field; cost-of-goods plugins have their own columns."],
  ["Gift Card", "Gift cards are a separate plugin product in WooCommerce."],
  ["Metafields and Google Shopping columns", "Plugin-specific; not carried across."],
  ["Variant Image", "Carried to the variation's Images where present."],
  ["Collections", "Shopify product CSVs do not contain collection membership; recreate categories from Type."],
];

function groupRows(rows, header) {
  const col = (n) => header.indexOf(n);
  const hc = col("Handle");
  const groups = new Map();
  for (const r of rows) {
    const h = (r.cells[hc] ?? "").trim();
    if (!h) continue;
    if (!groups.has(h)) groups.set(h, []);
    groups.get(h).push(r);
  }
  return groups;
}

export function convert(input) {
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const notes = [];
  const stats = { products: 0, simple: 0, variable: 0, variations: 0, images: 0, skuGenerated: 0 };
  if (!text.trim()) return { csv: "", notes, stats, error: "The file is empty." };
  const firstLine = text.split("\n", 1)[0];
  let delim = ",";
  if (!firstLine.includes(",") && firstLine.includes(";")) delim = ";";
  else if (!firstLine.includes(",") && firstLine.includes("\t")) delim = "\t";
  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) return { csv: "", notes, stats, error: `A quote opened on line ${parsed.unterminated} is never closed; fix the file first.` };
  const header = parsed.rows[0].cells.map((h) => h.trim());
  if (!header.includes("Handle")) return { csv: "", notes, stats, error: 'This is not a Shopify product CSV: there is no "Handle" column.' };
  const L = new Map(header.map((h, i) => [h.toLowerCase(), i]));
  const body = parsed.rows.slice(1).filter((r) => !r.cells.every((c) => c.trim() === ""));
  const groups = groupRows(body, header);
  const get = (r, name) => { const i = L.get(name.toLowerCase()); return i === undefined ? "" : (r.cells[i] ?? "").trim(); };
  if (delim !== ",") notes.push(`Read the file as ${delim === ";" ? "semicolon" : "tab"}-separated.`);
  const usedSkus = new Set();
  const out = [];
  const allSkus = new Map();
  for (const rs of groups.values()) for (const r of rs) { const s = get(r, "Variant SKU"); if (s) allSkus.set(s, (allSkus.get(s) || 0) + 1); }
  const uniqueSku = (want, fallback, line, quiet = false) => {
    let sku = want;
    if (!sku || usedSkus.has(sku)) {
      const why = !want ? "had no SKU" : "repeated a SKU already used";
      sku = fallback;
      let n = 2;
      while (usedSkus.has(sku)) sku = `${fallback}-${n++}`;
      if (!quiet) {
        stats.skuGenerated++;
        notes.push(`Line ${line}: variant ${why}; WooCommerce needs a unique SKU, so "${sku}" was generated.`);
      }
    }
    usedSkus.add(sku);
    return sku;
  };

  for (const [handle, rs] of groups) {
    const first = rs[0];
    const optNames = [1, 2, 3].map((n) => get(first, `Option${n} Name`));
    const variantRows = rs.filter((r, k) => k === 0 || get(r, `Option1 Value`) || get(r, "Variant Price") || get(r, "Variant SKU"));
    const isVariable = optNames.some(Boolean) && variantRows.length > 1;
    stats.products++;
    const status = get(first, "Status").toLowerCase();
    const pubRaw = get(first, "Published").toUpperCase();
    let published = pubRaw === "FALSE" ? "0" : "1";
    if (status === "draft" || status === "archived") { published = "0"; notes.push(`Line ${first.line}: "${handle}" is ${status} in Shopify; it is imported as a draft (Published 0).`); }
    const imgsAll = rs.filter((r) => get(r, "Image Src")).map((r) => ({ src: get(r, "Image Src"), pos: Number(get(r, "Image Position")) || 1e6, line: r.line }));
    imgsAll.sort((a, b) => a.pos - b.pos || a.line - b.line);
    const parentImgs = [...new Set(imgsAll.map((i) => i.src))];
    stats.images += parentImgs.length;
    const cat = get(first, "Type") || get(first, "Product Category");
    const tags = get(first, "Tags").split(",").map((s) => s.trim()).filter(Boolean).join(", ");
    const name = get(first, "Title") || handle;
    if (!get(first, "Title")) notes.push(`Line ${first.line}: "${handle}" has no Title; the handle was used as the Name.`);
    const common = { Name: name, Published: published, "Visibility in catalog": "visible", Description: get(first, "Body (HTML)"), Categories: cat, Tags: tags };
    const priceOf = (r) => {
      const p = cleanPrice(get(r, "Variant Price")), c = cleanPrice(get(r, "Variant Compare At Price"));
      if (isNum(p) && isNum(c) && Number(c) > Number(p)) return { reg: money(Number(c)), sale: money(Number(p)) };
      return { reg: isNum(p) ? p : "", sale: "" };
    };
    const stockOf = (r) => {
      const tracker = get(r, "Variant Inventory Tracker").toLowerCase(), qty = get(r, "Variant Inventory Qty");
      const pol = get(r, "Variant Inventory Policy").toLowerCase();
      const o = { "In stock?": "1", Stock: "", "Backorders allowed?": pol === "continue" ? "1" : "0" };
      if (tracker === "shopify" && /^-?\d+$/.test(qty)) { o.Stock = String(Math.max(0, Number(qty))); o["In stock?"] = Number(qty) > 0 || pol === "continue" ? "1" : "0"; if (Number(qty) < 0) notes.push(`Line ${r.line}: negative quantity ${qty} imported as 0.`); }
      return o;
    };
    const weightOf = (r) => {
      // Shopify stores weight in grams whatever unit the admin displays.
      const g = get(r, "Variant Grams");
      if (!g || !isNum(g)) return "";
      return kg(Number(g));
    };
    const taxOf = (r) => (get(r, "Variant Taxable").toUpperCase() === "FALSE" ? "none" : "taxable");
    const virtualOf = (r) => get(r, "Variant Requires Shipping").toUpperCase() === "FALSE";

    if (!isVariable) {
      const r = variantRows[0] || first;
      const sku = uniqueSku(get(r, "Variant SKU"), handle, r.line);
      const pr = priceOf(r);
      const o = { ...common, Type: virtualOf(r) ? "simple, virtual" : "simple", SKU: sku, "GTIN, UPC, EAN, or ISBN": get(r, "Variant Barcode"), "Regular price": pr.reg, "Sale price": pr.sale, "Weight (kg)": weightOf(r), "Tax status": taxOf(r), Images: parentImgs.join(", "), ...stockOf(r) };
      if (!pr.reg) notes.push(`Line ${r.line}: "${handle}" has no usable price; Regular price is blank.`);
      out.push(o);
      stats.simple++;
      continue;
    }
    // variable parent
    // Shopify has no product-level SKU, so the parent's is the handle; not a fault to report.
    const parentSku = uniqueSku("", allSkus.has(upper(handle)) ? `${upper(handle)}-PARENT` : upper(handle), first.line, true);
    const attrVals = [1, 2, 3].map((n) => (optNames[n - 1] ? [...new Set(variantRows.map((r) => get(r, `Option${n} Value`)).filter(Boolean))] : []));
    const parent = { ...common, Type: "variable", SKU: parentSku, Images: parentImgs.join(", "), "In stock?": "1" };
    [1, 2, 3].forEach((n) => {
      if (optNames[n - 1]) {
        parent[`Attribute ${n} name`] = optNames[n - 1];
        parent[`Attribute ${n} value(s)`] = attrVals[n - 1].map(esc).join(", ");
        parent[`Attribute ${n} visible`] = "1";
        parent[`Attribute ${n} global`] = "0";
      }
    });
    out.push(parent);
    stats.variable++;
    for (const r of variantRows) {
      const opts = [1, 2, 3].map((n) => get(r, `Option${n} Value`));
      const fallback = `${upper(handle)}-${opts.filter(Boolean).map((o) => upper(slugify(o))).join("-")}`;
      const sku = uniqueSku(get(r, "Variant SKU"), fallback, r.line);
      const pr = priceOf(r);
      const vimg = get(r, "Variant Image");
      const o = { Type: "variation", SKU: sku, "GTIN, UPC, EAN, or ISBN": get(r, "Variant Barcode"), Name: `${name} - ${opts.filter(Boolean).join(", ")}`, Published: "1", Parent: parentSku, "Regular price": pr.reg, "Sale price": pr.sale, "Weight (kg)": weightOf(r), "Tax status": taxOf(r), Images: vimg, ...stockOf(r) };
      [1, 2, 3].forEach((n) => {
        if (optNames[n - 1]) {
          o[`Attribute ${n} name`] = optNames[n - 1];
          o[`Attribute ${n} value(s)`] = opts[n - 1];
          o[`Attribute ${n} global`] = "0";
        }
      });
      if (!pr.reg) notes.push(`Line ${r.line}: variation "${sku}" has no usable price; WooCommerce will not let it be bought.`);
      for (const n of [1, 2, 3]) if (optNames[n - 1] && !opts[n - 1]) notes.push(`Line ${r.line}: variation "${sku}" has no ${optNames[n - 1]} value and will show as "Any".`);
      out.push(o);
      stats.variations++;
    }
  }
  if (usedSkus.size && stats.skuGenerated === 0) notes.push("Every variant already had a unique SKU; none were generated.");
  const csv = toCsv([WOO_COLUMNS, ...out.map((o) => WOO_COLUMNS.map((c) => o[c] ?? ""))]);
  return { csv, notes, stats, error: null };
}

export function notesCsv(result) {
  return toCsv([["note"], ...result.notes.map((n) => [n])]);
}

const S_HEAD = ["Handle", "Title", "Body (HTML)", "Vendor", "Type", "Tags", "Published", "Option1 Name", "Option1 Value", "Option2 Name", "Option2 Value", "Variant SKU", "Variant Grams", "Variant Inventory Tracker", "Variant Inventory Qty", "Variant Inventory Policy", "Variant Price", "Variant Compare At Price", "Variant Requires Shipping", "Variant Taxable", "Variant Barcode", "Image Src", "Image Position", "Variant Weight Unit", "Status"];
const shop = (rows) => toCsv([S_HEAD, ...rows.map((o) => S_HEAD.map((h) => o[h] ?? ""))]);
const bs = (o) => ({ Published: "TRUE", "Variant Inventory Tracker": "shopify", "Variant Inventory Policy": "deny", "Variant Requires Shipping": "TRUE", "Variant Taxable": "TRUE", "Variant Weight Unit": "g", Status: "active", ...o });

export function sampleShopifyFile() {
  return shop([
    bs({ Handle: "canvas-tote-bag", Title: "Canvas Tote Bag", "Body (HTML)": "<p>Heavy cotton canvas.</p>", Vendor: "Harbor Goods", Type: "Bags", Tags: "bags, totes", "Option1 Name": "Color", "Option1 Value": "Natural", "Variant SKU": "TOTE-NAT", "Variant Grams": "320", "Variant Inventory Qty": "40", "Variant Price": "19.00", "Variant Compare At Price": "24.00", "Variant Barcode": "036000291452", "Image Src": "https://cdn.example.com/tote-natural.jpg", "Image Position": "1" }),
    bs({ Handle: "canvas-tote-bag", "Option1 Value": "Black", "Variant SKU": "TOTE-BLK", "Variant Grams": "320", "Variant Inventory Qty": "0", "Variant Price": "24.00", "Image Src": "https://cdn.example.com/tote-black.jpg", "Image Position": "2" }),
    bs({ Handle: "enamel-mug", Title: "Enamel Mug", "Body (HTML)": "<p>350 ml.</p>", Vendor: "Harbor Goods", Type: "Kitchen", Tags: "mugs", "Option1 Name": "Title", "Option1 Value": "Default Title", "Variant SKU": "MUG-01", "Variant Grams": "210", "Variant Inventory Qty": "60", "Variant Price": "14.50", "Image Src": "https://cdn.example.com/mug.png", "Image Position": "1" }),
  ]);
}
