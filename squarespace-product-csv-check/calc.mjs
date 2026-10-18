// Squarespace product CSV import checker. Pure functions, no DOM, no network.
// Column names and rules are read from memory of Squarespace's public product CSV import
// documentation; no Squarespace import was available when this was built.

// documentation (the legacy "Item Type" layout); no BigCommerce import was available when this was built.

export function decodeBuffer(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return new TextDecoder("utf-8").decode(u8);
}

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

function distance(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

function balance(html) {
  const out = [];
  for (const t of ["div", "p", "ul", "ol", "li", "table", "tr", "td", "span", "strong", "em", "b", "i", "a", "h1", "h2", "h3"]) {
    const o = (html.match(new RegExp(`<${t}(\\s[^>]*)?>`, "gi")) || []).length;
    const c = (html.match(new RegExp(`</${t}\\s*>`, "gi")) || []).length;
    if (o !== c) out.push(`<${t}> opens ${o}, closes ${c}`);
  }
  return out;
}

function detectDelim(text) {
  const firstLine = text.split("\n", 1)[0];
  const count = (c) => firstLine.split(c).length - 1;
  if (count(",") === 0 && count(";") > 0) return ";";
  if (count(",") === 0 && count("\t") > 0) return "\t";
  return ",";
}


export const COLUMNS = [
  "Product ID [Non Editable]", "Variant ID [Non Editable]", "Product Type [Non Editable]", "Product Page", "Product URL",
  "Title", "Description", "SKU", "Option Name 1", "Option Value 1", "Option Name 2", "Option Value 2",
  "Option Name 3", "Option Value 3", "Price", "Sale Price", "On Sale", "Stock", "Categories", "Tags", "Weight",
  "Length", "Width", "Height", "Visible", "Hosted Image URLs",
];
const LOWER = new Map(COLUMNS.map((c) => [c.toLowerCase(), c]));
export const SEVERITIES = ["error", "warning", "info"];
const TYPES = new Map([["physical", "PHYSICAL"], ["service", "SERVICE"], ["digital", "DIGITAL"], ["gift_card", "GIFT_CARD"], ["gift card", "GIFT_CARD"]]);
const SCI = /^\d(\.\d+)?e\+?\d+$/i;
const isNum = (v) => /^\d+(\.\d+)?$/.test(v);
const toYesNo = (v) => (/^(y|yes|true|1)$/i.test(v) ? "Yes" : /^(n|no|false|0)$/i.test(v) ? "No" : null);
const MAX_VARIANTS = 200;

export function closestColumn(name) {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  let best = null, bestD = 99;
  for (const c of COLUMNS) {
    const d = distance(n, c.toLowerCase().replace(/[^a-z0-9]/g, ""));
    if (d < bestD) { bestD = d; best = c; }
  }
  return bestD <= Math.max(2, Math.floor(n.length / 4)) ? best : null;
}

function cleanPrice(v) {
  let s = v.trim().replace(/^[$€£¥]\s*/, "").replace(/\s*(USD|EUR|GBP|CAD|AUD)$/i, "");
  if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  return s;
}

function layout(header) {
  const idx = {};
  header.forEach((h, i) => {
    const lc = h.trim().toLowerCase();
    if (LOWER.has(lc)) { const c = LOWER.get(lc); if (idx[c] === undefined) idx[c] = i; }
  });
  return idx;
}

const PRICE_COLS = ["Price", "Sale Price"];
const DIM_COLS = ["Weight", "Length", "Width", "Height"];
const YN_COLS = ["On Sale", "Visible"];

export function validate(input) {
  const findings = [];
  const add = (severity, code, line, title, detail) => findings.push({ severity, code, line, title, detail });
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const summary = { rows: 0, products: 0, variants: 0, images: 0, columns: 0, delimiter: ",", groups: [] };
  if (!text.trim()) { add("error", "empty", 0, "The file is empty", "Paste or choose a Squarespace product CSV."); return { findings, summary }; }

  if (text.includes("\ufffd")) add("warning", "encoding", 0, "The file contains replacement characters", "Characters such as \ufffd mean the file was saved in a legacy encoding and read as UTF-8. Re-export as CSV UTF-8, or accents and symbols in titles will import damaged.");
  if (/\u00c3[\u0080-\u00bf]|\u00e2\u20ac[\u2122\u0153"\u02dc]/.test(text)) add("warning", "mojibake", 0, "Text looks double-encoded", "Sequences like \u00c3\u00a9 or \u00e2\u20ac\u2122 usually mean UTF-8 was saved as Windows-1252 and re-read. Fix the encoding before importing, or titles will show them.");

  const delim = detectDelim(text);
  summary.delimiter = delim;
  if (delim !== ",") add("error", "delimiter", 1, `The file is ${delim === ";" ? "semicolon" : "tab"}-separated`, "Squarespace's importer expects a comma delimiter. Excel in many European locales saves CSV with semicolons. Re-save as CSV UTF-8 (comma delimited), or use Apply safe fixes.");

  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) {
    add("error", "quote", parsed.unterminated, "A quoted cell is never closed", `A cell opened with a double quote on line ${parsed.unterminated} has no closing quote, so everything after it is read as one cell. A description with unescaped quotes is the usual cause.`);
    return { findings, summary };
  }
  const rows = parsed.rows;
  const header = rows[0].cells.map((h) => h.trim());
  summary.columns = header.length;
  const seen = new Map();
  header.forEach((h, i) => {
    const lc = h.toLowerCase();
    if (h === "") { add("warning", "blank-header", 1, `Column ${i + 1} has no name`, "An unnamed column is ignored. Often a stray trailing comma."); return; }
    if (seen.has(lc)) add("error", "dup-header", 1, `Column "${h}" appears twice`, `Columns ${seen.get(lc) + 1} and ${i + 1} share the name "${h}". Only one of them is mapped; delete the other.`);
    else seen.set(lc, i);
    if (LOWER.has(lc)) {
      if (h !== LOWER.get(lc)) add("warning", "header-case", 1, `Column "${h}" is not spelled like the template`, `Use "${LOWER.get(lc)}" exactly, including capitals and the [Non Editable] suffix.`);
    } else {
      const near = closestColumn(h);
      add("warning", "unknown-header", 1, `Unknown column "${h}"`, near ? `Did you mean "${near}"? Unmapped columns are skipped by the importer, so this data would not import.` : "Unmapped columns are skipped by the importer, so this data would not import.");
    }
  });
  const idx = layout(header);
  if (idx["Title"] === undefined) add("error", "no-title", 1, 'There is no "Title" column', "Every product needs a title; the importer has nothing to name the products with.");
  if (idx["Product URL"] === undefined) add("warning", "no-url-col", 1, 'There is no "Product URL" column', "Squarespace groups a product's variant rows by Product URL. Without it each row is read as its own product.");

  const g = (r, name) => (idx[name] === undefined ? "" : (r.cells[idx[name]] ?? ""));
  const body = [];
  let blank = 0;
  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri];
    summary.rows++;
    if (r.cells.every((c) => c.trim() === "")) { blank++; continue; }
    if (r.cells.length > header.length) add("error", "extra-cells", r.line, `Row has ${r.cells.length} cells but the header has ${header.length}`, "An unquoted comma in Categories, Tags or a description shifts every later cell one column right, so prices land in the wrong field. Quote the cell.");
    else if (r.cells.length < header.length) add("warning", "short-row", r.line, `Row has ${r.cells.length} cells but the header has ${header.length}`, "Missing trailing cells are read as blank. Check that nothing was cut off.");
    body.push(r);
  }
  if (blank) add("info", "blank-rows", 0, `${blank} blank row${blank === 1 ? "" : "s"} skipped`, "Blank rows are harmless but usually mean a spreadsheet range was exported wider than the data.");

  const skuLines = new Map(), urlProducts = new Map(), idLines = new Map();
  const note = (map, k, line) => { if (!map.has(k)) map.set(k, []); map.get(k).push(line); };
  let current = null;
  for (const r of body) {
    const title = g(r, "Title").trim();
    const url = g(r, "Product URL").trim();
    const sku = g(r, "SKU").trim();
    if (sku) note(skuLines, sku, r.line);
    const isProduct = title !== "" || current === null || (url !== "" && current.url !== url);
    if (isProduct) {
      summary.products++;
      current = { line: r.line, title, url, variants: 0, optNames: [1, 2, 3].map((n) => g(r, `Option Name ${n}`).trim()), combos: new Set(), grp: null, imgs: 0 };
      current.grp = { line: r.line, handle: url || sku || title, title, variants: 0, images: 0 };
      summary.groups.push(current.grp);
      if (!title) add("error", "title-blank", r.line, "Title is blank", "A product's first row needs a Title. A row with no Title is read as a variant of the product above it, and here there is none to attach it to.");
      else if (title.length > 200) add("warning", "title-long", r.line, `Title is ${title.length} characters`, "Very long titles are cut off in search results and may be rejected.");
      if (url) {
        if (/\s/.test(url) || /[A-Z]/.test(url) || /[^a-z0-9\-_\/]/.test(url.replace(/[A-Z]/g, "a").replace(/\s/g, "-"))) add("warning", "url", r.line, `Product URL "${url}" is not a clean slug`, "A product URL is lowercase letters, digits and hyphens with no spaces, for example canvas-tote-bag.");
        note(urlProducts, url, r.line);
      } else add("info", "url-blank", r.line, "No Product URL", "Squarespace will generate a URL from the title. Variant rows can then not be grouped under this product, so set one when the product has variants.");
      const id = g(r, "Product ID [Non Editable]").trim();
      if (id) note(idLines, id, r.line);
      const pt = g(r, "Product Type [Non Editable]").trim();
      if (pt && !TYPES.has(pt.toLowerCase())) add("error", "product-type", r.line, `Product Type "${pt}" is not recognised`, "Use PHYSICAL, SERVICE, DIGITAL or GIFT_CARD.");
      else if (pt && pt !== TYPES.get(pt.toLowerCase())) add("warning", "product-type-case", r.line, `Product Type "${pt}" should be ${TYPES.get(pt.toLowerCase())}`, "Match the template's capitals exactly.");
      else if (!pt && idx["Product Type [Non Editable]"] !== undefined) add("warning", "product-type-blank", r.line, "Product Type is blank", "Set PHYSICAL, SERVICE, DIGITAL or GIFT_CARD.");
      const d = g(r, "Description");
      const bal = balance(d);
      if (bal.length) add("warning", "html-balance", r.line, "Description HTML is unbalanced", `${bal.join("; ")}. An unclosed tag can break the product page layout.`);
      const imgs = g(r, "Hosted Image URLs");
      if (imgs.trim()) {
        const parts = imgs.trim().split(/\s+/);
        current.grp.images = parts.length;
        summary.images += parts.length;
        if (/[,;]\s*(?=https?:\/\/)/i.test(imgs)) add("error", "image-sep", r.line, "Hosted Image URLs are separated by a comma or semicolon", "Squarespace reads several image addresses separated by spaces (or new lines) in this one cell. A comma or semicolon makes them one broken address.");
        for (const p of parts) {
          if (/^[a-z][a-z0-9+.-]*:/i.test(p) && !/^https?:/i.test(p)) add("error", "image-scheme", r.line, `Image address "${p.slice(0, 40)}" uses an unsupported scheme`, "Only http and https addresses can be downloaded. Local paths such as C:\\ cannot be read.");
          else if (!/^https?:/i.test(p)) add("error", "image-relative", r.line, `Image "${p.slice(0, 40)}" is not a full web address`, "The importer downloads each image, so it needs a full https address, not a file name.");
          else if (/^http:/i.test(p)) add("info", "image-http", r.line, "An image uses http, not https", "A plain http image can fail to download or be blocked.");
        }
      } else add("info", "no-image", r.line, "No product image", "Products without an image convert far worse.");
    } else {
      summary.variants++;
      current.variants++;
      current.grp.variants++;
      if (current.variants + 1 === MAX_VARIANTS + 1) add("warning", "variant-limit", r.line, `More than ${MAX_VARIANTS} variants under "${current.title || current.url}"`, `Squarespace allows about ${MAX_VARIANTS} variants per product; the extra rows are likely to be rejected.`);
    }
    // option checks apply to every row of the product
    const names = [1, 2, 3].map((n) => g(r, `Option Name ${n}`).trim());
    const vals = [1, 2, 3].map((n) => g(r, `Option Value ${n}`).trim());
    for (let n = 0; n < 3; n++) {
      if (vals[n] && !current.optNames[n] && !names[n]) add("error", "option-no-name", r.line, `Option Value ${n + 1} "${vals[n]}" has no Option Name ${n + 1}`, `Name the option on the product's first row (Option Name ${n + 1}), or the value has nothing to attach to.`);
      if (!isProduct || vals[n] || current.optNames[n]) {
        if (current.optNames[n] && !vals[n] && (current.variants > 0 || isProduct) && (current.variants > 0 || vals.some(Boolean) || names.some(Boolean))) add("warning", "option-value-blank", r.line, `Option Value ${n + 1} is blank for option "${current.optNames[n]}"`, "Every variant row needs a value for each option the product defines.");
      }
    }
    const combo = vals.join("|").toLowerCase();
    if (vals.some(Boolean)) {
      if (current.combos.has(combo)) add("error", "dup-combo", r.line, `Duplicate option combination "${vals.filter(Boolean).join(" / ")}"`, `The same combination already appears under the product on line ${current.line}. The second would overwrite the first.`);
      current.combos.add(combo);
    }
    if (!isProduct && current.optNames.every((n) => !n) && !names.some(Boolean)) add("warning", "variant-no-options", r.line, "Variant row under a product with no options", "Define Option Name 1 and its values on the product, or this row is a second product with a blank title.");

    if (SCI.test(sku)) add("error", "sci-sku", r.line, `SKU "${sku}" is in scientific notation`, "Excel turned the SKU into a number and lost digits. Two products can collapse to the same value. Reformat the column as Text and re-enter the SKUs.");
    else if (!sku && idx["SKU"] !== undefined) add("info", "sku-blank", r.line, "No SKU", "A row without a SKU cannot be matched on a later import, so re-importing creates a duplicate instead of updating it.");

    const price = g(r, "Price").trim();
    if (idx["Price"] !== undefined && !price) add("error", "price-blank", r.line, "Price is blank", "A product or variant with no price imports at 0.00 or is rejected. Enter the selling price on every row.");
    for (const c of PRICE_COLS) {
      const v = g(r, c).trim();
      if (v && !isNum(v)) add("error", "price-format", r.line, `${c} "${v}" is not a plain number`, `Write ${c} as digits and a decimal point only, for example ${cleanPrice(v) || "24.00"}. A currency symbol, a decimal comma or a thousands separator makes the import reject the row or read the wrong value.`);
    }
    const sale = g(r, "Sale Price").trim();
    const on = g(r, "On Sale").trim();
    if (toYesNo(on) === "Yes" && !sale) add("warning", "on-sale-no-price", r.line, "On Sale is Yes but Sale Price is blank", "The item is flagged as on sale with nothing to sell it at. Enter the sale price or set On Sale to No.");
    if (isNum(price) && isNum(sale) && Number(sale) >= Number(price)) add("warning", "sale-price", r.line, `Sale Price ${sale} is not below Price ${price}`, "A sale price at or above the regular price is not a sale. The two columns are probably swapped.");
    if (sale && toYesNo(on) === "No") add("info", "sale-not-on", r.line, "Sale Price is set but On Sale is No", "The sale price will not apply until On Sale is Yes.");
    for (const c of DIM_COLS) {
      const v = g(r, c).trim();
      if (v && !isNum(v)) add("error", "dim-format", r.line, `${c} "${v}" is not a plain number`, "Weight and size are digits and a decimal point only, with no unit and no decimal comma.");
    }
    for (const c of YN_COLS) {
      const v = g(r, c).trim();
      if (v && !/^(Yes|No)$/.test(v)) add(toYesNo(v) ? "warning" : "error", "flag", r.line, `${c} "${v}" should be Yes or No`, "The importer's flag columns take Yes or No.");
    }
    const stock = g(r, "Stock").trim();
    if (stock && !/^\d+$/.test(stock) && !/^unlimited$/i.test(stock)) add("error", "stock", r.line, `Stock "${stock}" is not a whole number or Unlimited`, "Stock is a whole number of 0 or more, or the word Unlimited.");
    else if (/^unlimited$/i.test(stock) && stock !== "Unlimited") add("warning", "stock-case", r.line, `Stock "${stock}" should be "Unlimited"`, "Match the capitalisation exactly.");
    if (idx["Stock"] !== undefined && !stock) add("info", "stock-blank", r.line, "Stock is blank", "A blank stock is read as 0 on a product that tracks inventory, which shows it as sold out.");
  }
  for (const [s, ls] of skuLines) if (ls.length > 1) add("error", "dup-sku", ls[1], `SKU "${s}" is used ${ls.length} times`, `Lines ${ls.join(", ")}. SKUs must be unique across the store; the second use is rejected or overwrites the first.`);
  for (const [s, ls] of idLines) if (ls.length > 1) add("warning", "dup-id", ls[1], `Product ID ${s} is used on ${ls.length} product rows`, `Lines ${ls.join(", ")}. Each Product ID names one existing product; a repeat usually means variant rows with a Title filled in.`);
  for (const [u, ls] of urlProducts) if (ls.length > 1) add("error", "dup-url", ls[1], `Product URL "${u}" starts ${ls.length} products`, `Lines ${ls.join(", ")}. Two products cannot share a URL; if these are variants, blank the Title on the later rows.`);
  const rank = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.line || 0) - (b.line || 0));
  return { findings, summary };
}

export function repair(input) {
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (!text.trim()) return { text: "", changes: [], error: "Nothing to fix." };
  const delim = detectDelim(text);
  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) return { text: "", changes: [], error: `Line ${parsed.unterminated} has an unclosed quote; fix that first, then run the fixes.` };
  const rows = parsed.rows.map((r) => r.cells.slice());
  const changes = [];
  if (delim !== ",") changes.push(`Rewrote the ${delim === ";" ? "semicolon" : "tab"}-separated file with commas.`);
  const lineOf = (ri) => parsed.rows[ri].line;
  rows[0] = rows[0].map((h, i) => {
    const t = h.trim(), c = LOWER.get(t.toLowerCase());
    if (c && c !== h) { changes.push(`Header ${i + 1}: "${h}" to "${c}".`); return c; }
    return h;
  });
  const lc = rows[0].map((h) => h.trim().toLowerCase());
  const col = (n) => lc.indexOf(n.toLowerCase());
  const edit = (ri, ci, v, why) => { changes.push(`Line ${lineOf(ri)}, ${rows[0][ci]}: "${rows[ri][ci]}" to "${v}" (${why}).`); rows[ri][ci] = v; };
  const typeCi = col("Product Type [Non Editable]"), stockCi = col("Stock"), imgCi = col("Hosted Image URLs");
  const ynCols = YN_COLS.map(col), priceCols = PRICE_COLS.map(col), dimCols = DIM_COLS.map(col);
  const trimCols = ["Product ID [Non Editable]", "Variant ID [Non Editable]", "Product URL", "SKU"].map(col);
  for (let ri = 1; ri < rows.length; ri++) {
    if (rows[ri].every((c) => c.trim() === "")) continue;
    for (const ci of [...trimCols, imgCi]) if (ci >= 0 && rows[ri][ci] !== undefined && rows[ri][ci] !== rows[ri][ci].trim()) edit(ri, ci, rows[ri][ci].trim(), "stray spaces");
    if (typeCi >= 0 && rows[ri][typeCi] !== undefined) { const m = TYPES.get(rows[ri][typeCi].trim().toLowerCase()); if (m && m !== rows[ri][typeCi]) edit(ri, typeCi, m, "template capitals"); }
    for (const ci of ynCols) if (ci >= 0 && rows[ri][ci] !== undefined) { const f = toYesNo(rows[ri][ci].trim()); if (f !== null && f !== rows[ri][ci]) edit(ri, ci, f, "Yes or No"); }
    if (stockCi >= 0 && rows[ri][stockCi] !== undefined && /^unlimited$/i.test(rows[ri][stockCi].trim()) && rows[ri][stockCi] !== "Unlimited") edit(ri, stockCi, "Unlimited", "capitalisation");
    for (const ci of priceCols) {
      if (ci < 0 || rows[ri][ci] === undefined) continue;
      const v = rows[ri][ci].trim();
      if (v && !isNum(v)) { const c = cleanPrice(v); if (isNum(c)) edit(ri, ci, c, "plain number"); }
    }
    for (const ci of dimCols) if (ci >= 0 && rows[ri][ci] !== undefined && /^\d+,\d+$/.test(rows[ri][ci].trim())) edit(ri, ci, rows[ri][ci].trim().replace(",", "."), "decimal point");
    if (imgCi >= 0 && rows[ri][imgCi] !== undefined && /[,;]/.test(rows[ri][imgCi])) {
      const v = rows[ri][imgCi].trim();
      const parts = v.split(/[,;]\s*(?=https?:\/\/)/i);
      if (parts.length > 1 && parts.every((p) => /^https?:\/\/\S+$/i.test(p.trim()))) edit(ri, imgCi, parts.map((p) => p.trim()).join(" "), "image addresses separated by spaces");
    }
  }
  return { text: toCsv(rows), changes, error: null };
}

export function findingsCsv(result) {
  return toCsv([["severity", "line", "code", "title", "detail"], ...result.findings.map((f) => [f.severity, String(f.line || ""), f.code, f.title, f.detail])]);
}

const build = (rows) => toCsv([COLUMNS, ...rows.map((o) => COLUMNS.map((h) => o[h] ?? ""))]);

export function sampleFile() {
  return build([
    { "Product Type [Non Editable]": "PHYSICAL", "Product URL": "canvas-tote", Title: "Canvas Tote Bag", Description: "<p>Heavy cotton canvas.</p>", SKU: "TOTE-NAT", "Option Name 1": "Colour", "Option Value 1": "Natural", Price: "24.00", "Sale Price": "19.00", "On Sale": "Yes", Stock: "40", Categories: "Bags", Tags: "tote, canvas", Weight: "0.7", Visible: "Yes", "Hosted Image URLs": "https://images.example.com/tote.jpg https://images.example.com/tote-2.jpg" },
    { "Product Type [Non Editable]": "PHYSICAL", "Product URL": "canvas-tote", SKU: "TOTE-BLK", "Option Value 1": "Black", Price: "24.00", "Sale Price": "19.00", "On Sale": "Yes", Stock: "25", Weight: "0.7", Visible: "Yes" },
    { "Product Type [Non Editable]": "PHYSICAL", "Product URL": "enamel-mug", Title: "Enamel Mug", Description: "<p>350 ml.</p>", SKU: "MUG-01", Price: "14.50", "On Sale": "No", Stock: "Unlimited", Categories: "Kitchen", Weight: "0.5", Visible: "Yes", "Hosted Image URLs": "https://images.example.com/mug.png" },
  ]);
}

export function sampleBrokenFile() {
  return build([
    { "Product Type [Non Editable]": "physical", "Product URL": "Canvas Tote", Title: "Canvas Tote Bag", Description: "<div><p>Heavy cotton canvas.</div>", SKU: "TOTE-NAT", "Option Name 1": "Colour", "Option Value 1": "Natural", Price: "$24.00", "Sale Price": "29.00", "On Sale": "yes", Stock: "40", Weight: "0,7", Visible: "Yes", "Hosted Image URLs": "https://images.example.com/tote.jpg, https://images.example.com/tote-2.jpg" },
    { "Product Type [Non Editable]": "PHYSICAL", "Product URL": "Canvas Tote", SKU: "TOTE-NAT", "Option Value 1": "Natural", Price: "24.00", Stock: "lots", Visible: "Yes" },
    { "Product Type [Non Editable]": "PHYSICAL", "Product URL": "Canvas Tote", SKU: "TOTE-GRN", "Option Value 2": "Large", Price: "", Stock: "5", Visible: "maybe" },
    { "Product Type [Non Editable]": "PHYSICAL", "Product URL": "enamel-mug", Title: "", SKU: "1.23457E+12", Price: "14,50", "On Sale": "Yes", Stock: "unlimited", Visible: "Yes", "Hosted Image URLs": "C:\\photos\\mug.png" },
  ]);
}
