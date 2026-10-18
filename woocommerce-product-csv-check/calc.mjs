// WooCommerce product CSV import checker. Pure functions, no DOM, no network.
// Column names and rules are read from memory of WooCommerce's public product CSV
// importer documentation; no WooCommerce import was available when this was built.

export const COLUMNS = [
  "ID", "Type", "SKU", "GTIN, UPC, EAN, or ISBN", "Name", "Published", "Is featured?", "Visibility in catalog",
  "Short description", "Description", "Date sale price starts", "Date sale price ends", "Tax status", "Tax class",
  "In stock?", "Stock", "Low stock amount", "Backorders allowed?", "Sold individually?", "Weight (kg)", "Length (cm)",
  "Width (cm)", "Height (cm)", "Allow customer reviews?", "Purchase note", "Sale price", "Regular price", "Categories",
  "Tags", "Shipping class", "Images", "Download limit", "Download expiry days", "Parent", "Grouped products", "Upsells",
  "Cross-sells", "External URL", "Button text", "Position",
  "Attribute 1 name", "Attribute 1 value(s)", "Attribute 1 visible", "Attribute 1 global", "Attribute 1 default",
  "Attribute 2 name", "Attribute 2 value(s)", "Attribute 2 visible", "Attribute 2 global", "Attribute 2 default",
];

const LOWER = new Map(COLUMNS.map((c) => [c.toLowerCase(), c]));
// Columns the importer also accepts that are not fixed names.
const isOpenColumn = (h) => /^attribute \d+ (name|value\(s\)|visible|global|default)$/i.test(h) || /^meta: ?\S/i.test(h) || /^download \d+ (name|url|id)$/i.test(h);

export const SEVERITIES = ["error", "warning", "info"];

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

export function closestColumn(name) {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  let best = null, bestD = 99;
  for (const c of COLUMNS) {
    const d = distance(n, c.toLowerCase().replace(/[^a-z0-9]/g, ""));
    if (d < bestD) { bestD = d; best = c; }
  }
  return bestD <= Math.max(2, Math.floor(n.length / 4)) ? best : null;
}

export function gtinProblem(code) {
  if (!/^\d+$/.test(code)) return null;
  if (![8, 12, 13, 14].includes(code.length)) return code.length === 11 ? "11 digits: a UPC-A has 12, so a leading zero was probably lost" : null;
  const d = code.split("").map(Number), check = d.pop();
  let sum = 0;
  d.reverse().forEach((x, i) => { sum += x * (i % 2 === 0 ? 3 : 1); });
  const want = (10 - (sum % 10)) % 10;
  return want === check ? null : `check digit should be ${want}`;
}

const TYPES = new Set(["simple", "variable", "variation", "grouped", "external"]);
const TYPE_FLAGS = new Set(["downloadable", "virtual"]);
const VISIBILITY = new Set(["visible", "catalog", "search", "hidden"]);
const TAX_STATUS = new Set(["taxable", "shipping", "none"]);
const PUBLISHED = new Set(["1", "0", "-1"]);
const FLAG01 = new Set(["1", "0"]);
const BACKORDERS = new Set(["0", "1", "notify"]);
const PRICE_COLS = ["Regular price", "Sale price"];
const FLAG_COLS = ["Is featured?", "Sold individually?", "Allow customer reviews?"];
const DIM_COLS = ["Weight (kg)", "Length (cm)", "Width (cm)", "Height (cm)"];
const SCI = /^\d(\.\d+)?e\+?\d+$/i;

function cleanPrice(v) {
  let s = v.trim().replace(/^[$€£¥]\s*/, "").replace(/\s*(USD|EUR|GBP|CAD|AUD)$/i, "");
  if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  return s;
}
const isNum = (v) => /^\d+(\.\d+)?$/.test(v);
const toFlag = (v) => (/^(true|yes|y)$/i.test(v) ? "1" : /^(false|no|n)$/i.test(v) ? "0" : null);
const splitTop = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);

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

export function validate(input) {
  const findings = [];
  const add = (severity, code, line, title, detail) => findings.push({ severity, code, line, title, detail });
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const summary = { rows: 0, products: 0, variants: 0, images: 0, columns: 0, delimiter: ",", groups: [] };
  if (!text.trim()) { add("error", "empty", 0, "The file is empty", "Paste or choose a WooCommerce product CSV."); return { findings, summary }; }

  if (text.includes("�")) add("warning", "encoding", 0, "The file contains replacement characters", "Characters such as � mean the file was saved in a legacy encoding and read as UTF-8. Re-export as CSV UTF-8, or accents and symbols in names will import damaged.");
  if (/Ã[\u0080-¿]|â€[™œ"˜]/.test(text)) add("warning", "mojibake", 0, "Text looks double-encoded", "Sequences like Ã© or â€™ usually mean UTF-8 was saved as Windows-1252 and re-read. Fix the encoding before importing, or product names will show those characters.");

  const delim = detectDelim(text);
  summary.delimiter = delim;
  if (delim !== ",") add("error", "delimiter", 1, `The file is ${delim === ";" ? "semicolon" : "tab"}-separated`, `The importer's default delimiter is a comma. Excel in many European locales saves CSV with semicolons. Re-save as CSV UTF-8 (comma delimited), choose the matching delimiter in the importer's advanced options, or use "Apply safe fixes" below.`);

  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) {
    add("error", "quote", parsed.unterminated, "A quoted cell is never closed", `A cell opened with a double quote on line ${parsed.unterminated} has no closing quote, so everything after it is read as one cell. Description with unescaped quotes is the usual cause: inside a quoted cell, a literal quote must be doubled ("").`);
    return { findings, summary };
  }
  const rows = parsed.rows;
  const header = rows[0].cells.map((h) => h.trim());
  summary.columns = header.length;
  const idx = {};
  header.forEach((h, i) => {
    const lc = h.toLowerCase();
    const canon = LOWER.get(lc) ?? (isOpenColumn(h) ? lc.replace(/^(attribute \d+ )(\w)/, "$1$2") : null);
    if (LOWER.has(lc)) {
      const c = LOWER.get(lc);
      if (idx[c] !== undefined) add("error", "dup-header", 1, `Column "${c}" appears twice`, `Columns ${idx[c] + 1} and ${i + 1} are both "${c}". The importer maps only one of them; delete the other.`);
      else idx[c] = i;
      if (h !== c) add("warning", "header-case", 1, `Column "${h}" is not spelled like the template`, `Use "${c}" exactly, including capitals, punctuation and the question mark.`);
    } else if (/^attribute \d+ /i.test(h) && isOpenColumn(h)) {
      idx[lc] = i;
    } else if (!isOpenColumn(h) && h !== "") {
      const near = closestColumn(h);
      add("warning", "unknown-header", 1, `Unknown column "${h}"`, near ? `Did you mean "${near}"? Unmapped columns are skipped by the importer, so this data would not import.` : "Unmapped columns are skipped by the importer unless you map them by hand, so this data would not import.");
    }
    if (h === "") add("warning", "blank-header", 1, `Column ${i + 1} has no name`, "An unnamed column is ignored. Often a stray trailing comma.");
  });
  for (const k of Object.keys(idx)) if (/^Attribute \d+ /.test(k)) idx[k.toLowerCase()] = idx[k];
  if (idx["Name"] === undefined && idx["SKU"] === undefined && idx["ID"] === undefined) { add("error", "no-key", 1, 'There is no "Name", "SKU" or "ID" column', "The importer needs at least one of them to create or match a product."); return { findings, summary }; }
  if (idx["Type"] === undefined) add("info", "no-type", 1, 'There is no "Type" column', "Without it every row is imported as a simple product, so variable products and variations cannot be expressed.");

  const g = (r, name) => (idx[name] === undefined ? "" : (r.cells[idx[name]] ?? ""));
  const attrCols = [];
  for (let n = 1; n <= 20; n++) if (idx[`attribute ${n} name`] !== undefined || idx[`attribute ${n} value(s)`] !== undefined) attrCols.push(n);
  const ga = (r, n, what) => { const i = idx[`attribute ${n} ${what}`]; return i === undefined ? "" : (r.cells[i] ?? ""); };

  const prods = [];
  let blank = 0;
  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri];
    summary.rows++;
    if (r.cells.every((c) => c.trim() === "")) { blank++; continue; }
    if (r.cells.length > header.length) add("error", "extra-cells", r.line, `Row has ${r.cells.length} cells but the header has ${header.length}`, "An unquoted comma in Categories, Tags, Images or a description pushed the following cells one column to the right. Quote the cell that contains the comma.");
    else if (r.cells.length < header.length) add("warning", "short-row", r.line, `Row has ${r.cells.length} cells but the header has ${header.length}`, "Missing trailing cells are read as blank. Check that no cell was lost.");
    prods.push(r);
  }
  if (blank) add("info", "blank-rows", 0, `${blank} blank row${blank === 1 ? "" : "s"} skipped`, "Blank rows are harmless but usually mean a spreadsheet range was exported wider than the data.");

  // First pass: index parents by SKU and ID, count SKU/ID use.
  const typeOf = (r) => splitTop(g(r, "Type").toLowerCase()).find((t) => TYPES.has(t)) ?? (g(r, "Type").trim() ? null : "simple");
  const bySku = new Map(), byId = new Map();
  const skuLines = new Map(), idLines = new Map();
  for (const r of prods) {
    const sku = g(r, "SKU").trim(), id = g(r, "ID").trim();
    if (sku) { if (!skuLines.has(sku)) skuLines.set(sku, []); skuLines.get(sku).push(r.line); if (!bySku.has(sku)) bySku.set(sku, r); }
    if (id) { if (!idLines.has(id)) idLines.set(id, []); idLines.get(id).push(r.line); if (!byId.has(id)) byId.set(id, r); }
  }
  const variationsOf = new Map();
  const parentOf = (r) => {
    const p = g(r, "Parent").trim();
    if (!p) return null;
    if (/^id:\s*\d+$/i.test(p)) return { ref: p, row: byId.get(p.replace(/^id:\s*/i, "")) ?? null, external: !byId.has(p.replace(/^id:\s*/i, "")) };
    return { ref: p, row: bySku.get(p) ?? null, external: false };
  };
  for (const r of prods) if (typeOf(r) === "variation") {
    const p = parentOf(r);
    if (p?.row) { if (!variationsOf.has(p.row)) variationsOf.set(p.row, []); variationsOf.get(p.row).push(r); }
  }

  for (const r of prods) {
    const type = typeOf(r);
    const rawType = g(r, "Type").trim();
    const L = r.line;
    const sku = g(r, "SKU").trim(), name = g(r, "Name").trim(), id = g(r, "ID").trim();
    const label = sku || name || (id ? `ID ${id}` : "this row");
    summary.products++;
    if (type === "variation") summary.variants++;

    if (rawType) {
      const parts = splitTop(rawType);
      const bad = parts.filter((t) => !TYPES.has(t.toLowerCase()) && !TYPE_FLAGS.has(t.toLowerCase()));
      if (bad.length) add("error", "type", L, `Type "${rawType}" is not a product type`, `Use simple, variable, variation, grouped or external, optionally followed by downloadable or virtual (for example "simple, downloadable"). Types are lowercase.`);
      else if (parts.some((t) => t !== t.toLowerCase())) add("warning", "type-case", L, `Type "${rawType}" is not lowercase`, "Type values are read in lowercase.");
    }
    if (id && !/^\d+$/.test(id)) add("error", "id", L, `ID "${id}" is not a whole number`, "ID matches an existing product by its database ID. Leave it blank to create a new product.");
    if (id && idLines.get(id).length > 1 && idLines.get(id)[0] === L) add("error", "dup-id", idLines.get(id)[1], `ID ${id} appears on ${idLines.get(id).length} rows`, `Lines ${idLines.get(id).join(", ")}. The importer updates one product per ID, so the later rows overwrite the first.`);

    if (type !== "variation" && idx["Name"] !== undefined && !name) add("error", "name-blank", L, `Row "${label}" has no Name`, "A new product needs a Name. This is fine only when the row updates an existing product by ID or SKU.");
    if (name.length > 255) add("warning", "name-length", L, "Name is longer than 255 characters", "Long names are truncated or break the product title.");

    if (sku) {
      if (SCI.test(sku)) add("error", "sci-sku", L, `SKU "${sku}" is in scientific notation`, "Excel turned a long number into scientific notation and the original digits are gone. Format the column as Text and re-enter the SKUs.");
      if (/\s/.test(sku)) add("warning", "sku-space", L, `SKU "${sku}" contains a space`, "Spaces in a SKU make Parent references and later exports easy to get wrong.");
      if (skuLines.get(sku).length > 1 && skuLines.get(sku)[0] !== L) add("error", "dup-sku", L, `SKU "${sku}" repeats line ${skuLines.get(sku)[0]}`, "WooCommerce requires every SKU to be unique and rejects the later row with \"Invalid or duplicated SKU\".");
    } else if (type === "variation" || type === "variable") {
      add("info", "no-sku", L, `${type === "variable" ? "Variable product" : "Variation"} "${label}" has no SKU`, type === "variable" ? "Variations point at their parent by SKU or id:NN. With no SKU on the parent they need its ID, which a new product does not have yet." : "Optional, but without SKUs you cannot update these variations from a later file.");
    }
    const gtin = g(r, "GTIN, UPC, EAN, or ISBN").trim();
    if (gtin) {
      if (SCI.test(gtin)) add("error", "sci-gtin", L, `GTIN "${gtin}" is in scientific notation`, "Excel damaged this code and the original digits are gone. Format the column as Text and re-enter it.");
      else { const p = gtinProblem(gtin); if (p) add("warning", "gtin", L, `GTIN ${gtin}: ${p}`, "Marketplaces and Google Merchant Center reject codes with a wrong check digit."); }
    }

    const pub = g(r, "Published").trim();
    if (pub && !PUBLISHED.has(pub)) add("error", "published", L, `Published is "${pub}"`, `Use 1 (published), 0 (draft) or -1 (private).${toFlag(pub) ? ` "${pub}" looks like ${toFlag(pub)}.` : ""}`);
    for (const col of FLAG_COLS) { const v = g(r, col).trim(); if (v && !FLAG01.has(v)) add("error", "flag", L, `${col} is "${v}"`, `${col} must be 1 or 0.`); }
    const vis = g(r, "Visibility in catalog").trim();
    if (vis && !VISIBILITY.has(vis)) add("error", "visibility", L, `Visibility in catalog is "${vis}"`, "Use visible, catalog, search or hidden, lowercase.");
    const tax = g(r, "Tax status").trim();
    if (tax && !TAX_STATUS.has(tax)) add("error", "tax-status", L, `Tax status is "${tax}"`, "Use taxable, shipping or none, lowercase.");
    const bo = g(r, "Backorders allowed?").trim();
    if (bo && !BACKORDERS.has(bo)) add("error", "backorders", L, `Backorders allowed? is "${bo}"`, "Use 0 (no), 1 (yes) or notify.");
    const ins = g(r, "In stock?").trim();
    if (ins && !FLAG01.has(ins)) add("error", "in-stock", L, `In stock? is "${ins}"`, "Use 1 (in stock) or 0 (out of stock).");
    const stock = g(r, "Stock").trim();
    if (stock) {
      if (!/^-?\d+$/.test(stock)) add("error", "stock", L, `Stock "${stock}" is not a whole number`, "Use whole numbers only. A decimal or text value is ignored or rejected.");
      else if (ins === "0" && Number(stock) > 0) add("warning", "stock-conflict", L, `Stock is ${stock} but In stock? is 0`, "When stock is managed, the quantity decides; the two columns disagree about whether it can be sold.");
      else if (ins === "1" && Number(stock) <= 0 && bo === "0") add("warning", "stock-conflict", L, `Stock is ${stock} but In stock? is 1`, "A managed quantity of zero or less will show the product as out of stock.");
    }
    for (const col of DIM_COLS) {
      const v = g(r, col).trim();
      if (!v) continue;
      if (/^\d+,\d+$/.test(v)) add("error", "decimal-comma", L, `${col} "${v}" uses a decimal comma`, `Use a decimal point (${v.replace(",", ".")}).`);
      else if (!isNum(v)) add("error", "dimension", L, `${col} "${v}" is not a plain number`, "Digits and a decimal point only, with no unit. The unit is set in the shop's settings: kilograms and centimetres in this template.");
    }
    for (const col of ["Date sale price starts", "Date sale price ends"]) {
      const v = g(r, col).trim();
      if (v && !/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/.test(v)) add("error", "date", L, `${col} "${v}" is not a date`, "Use YYYY-MM-DD (for example 2026-11-27). Day-first dates such as 27/11/2026 are not read.");
    }
    const ds = g(r, "Date sale price starts").trim(), de = g(r, "Date sale price ends").trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(ds) && /^\d{4}-\d{2}-\d{2}/.test(de) && de.slice(0, 10) < ds.slice(0, 10)) add("error", "date-order", L, "The sale ends before it starts", `${de.slice(0, 10)} is earlier than ${ds.slice(0, 10)}.`);

    // Prices
    for (const col of PRICE_COLS) {
      const v = g(r, col).trim();
      if (!v) continue;
      if (!isNum(v)) { const c = cleanPrice(v); add("error", "price-format", L, `${col} "${v}" is not a plain number`, isNum(c) ? `The importer wants digits and a decimal point only. Use ${c}.` : "The importer wants digits and a decimal point only, with no currency symbol or thousands separator."); }
    }
    const reg = cleanPrice(g(r, "Regular price")), sale = cleanPrice(g(r, "Sale price"));
    if (isNum(reg) && isNum(sale) && Number(sale) >= Number(reg) && Number(sale) !== 0) add("warning", "sale-price", L, `Sale price ${sale} is not below Regular price ${reg}`, "A sale price at or above the regular price shows no discount, or WooCommerce ignores it. Leave Sale price blank if there is no sale.");
    if (sale && !reg && type !== "variable" && type !== "grouped") add("error", "sale-no-regular", L, "Sale price is set but Regular price is blank", "A sale price needs a regular price to be reduced from.");
    if ((type === "simple" || type === "variation" || type === "external") && !reg && !sale) add("warning", "price-blank", L, `"${label}" has no price`, "The product will import without a price and cannot be bought. Enter a Regular price, or leave it blank on purpose for a quote-only item.");
    if (type === "variable" && (reg || sale)) add("info", "variable-price", L, `Variable product "${label}" carries a price`, "A variable product's price comes from its variations; the value on the parent row is ignored.");

    // Description
    for (const col of ["Description", "Short description"]) {
      const bal = balance(g(r, col));
      if (bal.length) add("warning", "html-balance", L, `${col} of "${label}" has unbalanced tags`, `${bal.slice(0, 4).join("; ")}. Unclosed tags can break the layout of the whole product page.`);
    }

    // Images
    const imgs = splitTop(g(r, "Images"));
    summary.images += imgs.length;
    const seenImg = new Map();
    imgs.forEach((u) => {
      if (/\s/.test(u)) add("error", "image-space", L, `Image "${u.slice(0, 60)}" contains a space`, "The importer downloads the URL as written. Replace spaces with %20, or check that a comma-separated list was not split inside a name.");
      else if (!/^https?:\/\/[^\s/]+\S*$/i.test(u)) add("error", "image-url", L, `Image "${u.slice(0, 60)}" is not a web address`, "Each entry in Images must be a public http(s) URL the shop can fetch, or a file name already in the media library. A local path will not import.");
      else if (!/\.(jpe?g|png|gif|webp|avif|bmp|tiff?|svg)(\?|#|$)/i.test(u) && !/[?&]format=|\/cdn\//i.test(u)) add("info", "image-ext", L, "An image address has no recognisable image extension", "Fine for CDN links without extensions; otherwise check that the URL is the image and not a web page.");
      if (seenImg.has(u)) add("warning", "image-dup", L, "The same image is listed twice", "Two copies of one URL in a product import two copies.");
      seenImg.set(u, true);
    });
    if (type === "variation" && imgs.length > 1) add("warning", "variation-images", L, "A variation lists more than one image", "A variation shows a single image; the extras are ignored.");

    // Categories / tags
    const cats = splitTop(g(r, "Categories"));
    if (/ ?>> ?|\\|\/\//.test(g(r, "Categories"))) add("warning", "category-sep", L, "Categories uses an unusual separator", 'Nested categories are written "Parent > Child" and separate categories are separated by commas.');
    if (cats.some((c) => c.length > 200)) add("warning", "category-length", L, "A category name is very long", "A missing comma between categories is the usual cause.");

    // Type specific
    if (type === "external" && !g(r, "External URL").trim()) add("error", "external-url", L, `External product "${label}" has no External URL`, "An external/affiliate product needs the address its button points to.");
    if (type !== "external" && g(r, "External URL").trim()) add("info", "external-url-extra", L, "External URL on a non-external product", "It is ignored unless Type is external.");
    if (type === "grouped" && !g(r, "Grouped products").trim()) add("warning", "grouped-empty", L, `Grouped product "${label}" lists no children`, "Fill Grouped products with child SKUs (or id:NN) separated by commas.");

    // Attributes
    const attrs = [];
    for (const n of attrCols) {
      const an = ga(r, n, "name").trim(), av = ga(r, n, "value(s)").trim();
      if (!an && !av) continue;
      if (av && !an) add("error", "attr-name", L, `Attribute ${n} has values but no name`, `Put the attribute's name (for example Size) in "Attribute ${n} name".`);
      else if (an && !av && type !== "variable") add("warning", "attr-value", L, `Attribute ${n} "${an}" has no value`, "An attribute with a name and no value is dropped.");
      for (const what of ["visible", "global"]) { const v = ga(r, n, what).trim(); if (v && !FLAG01.has(v)) add("error", "flag", L, `Attribute ${n} ${what} is "${v}"`, `Attribute ${n} ${what} must be 1 or 0.`); }
      attrs.push({ n, name: an, values: splitTop(av) });
    }
    const names = attrs.map((a) => a.name.toLowerCase()).filter(Boolean);
    if (new Set(names).size !== names.length) add("error", "attr-dup", L, "The same attribute name is used twice", "Two attribute columns on one product have the same name; the second overwrites the first.");

    if (type === "variable") {
      if (!attrs.length) add("error", "variable-no-attr", L, `Variable product "${label}" has no attributes`, "A variable product needs at least one attribute (with 'Attribute N global' / values listing every option), or its variations have nothing to vary.");
      const vs = variationsOf.get(r) ?? [];
      if (!vs.length) add("warning", "variable-no-variations", L, `Variable product "${label}" has no variation rows`, "No row in this file has Type variation and this product as its Parent. It will import as a product nobody can buy.");
      summary.groups.push({ handle: sku || name, line: L, title: name, variants: vs.length, images: imgs.length });
    } else if (type === "variation") {
      const p = parentOf(r);
      if (!p) add("error", "variation-no-parent", L, `Variation "${label}" has no Parent`, "Put the variable product's SKU (or id:NN) in the Parent column.");
      else if (p.external) add("info", "parent-external", L, `Variation "${label}" points at ${p.ref}`, "That ID is not in this file; it is fine only if the product already exists in the shop.");
      else if (!p.row) add("error", "parent-missing", L, `Variation "${label}": Parent "${p.ref}" is not in the file`, "No row has that SKU. A parent SKU that differs by a space, a capital or an Excel rewrite is the usual cause. If the product already exists in the shop, use id:NN.");
      else {
        if (typeOf(p.row) !== "variable") add("error", "parent-type", L, `Variation "${label}": Parent "${p.ref}" is not a variable product`, `Line ${p.row.line} has Type "${g(p.row, "Type").trim() || "(blank)"}". Variations can only hang off a row whose Type is variable.`);
        if (p.row.line > L) add("error", "parent-order", L, `Variation "${label}" comes before its parent`, `The parent is on line ${p.row.line}. The importer reads top to bottom, so the parent row must come first.`);
        // value membership
        for (const a of attrs) {
          if (a.values.length > 1) add("warning", "variation-multi", L, `Variation "${label}" lists ${a.values.length} values for "${a.name}"`, "A variation takes exactly one value per attribute; the comma list belongs on the parent.");
          const pa = [...attrCols].map((n) => ({ name: ga(p.row, n, "name").trim(), values: splitTop(ga(p.row, n, "value(s)")) })).find((x) => x.name.toLowerCase() === a.name.toLowerCase());
          if (!pa) add("error", "variation-attr", L, `Variation "${label}": attribute "${a.name}" is not on the parent`, `Line ${p.row.line} does not list "${a.name}". Check the spelling against the parent's attribute names.`);
          else if (a.values.length === 1 && pa.values.length && !pa.values.some((v) => v.toLowerCase() === a.values[0].toLowerCase())) add("warning", "variation-value", L, `Variation "${label}": "${a.values[0]}" is not among the parent's ${a.name} values`, `The parent (line ${p.row.line}) lists ${pa.values.slice(0, 8).join(", ")}${pa.values.length > 8 ? ", …" : ""}. The variation will not be selectable.`);
        }
        const key = attrs.map((a) => `${a.name.toLowerCase()}=${a.values.join("|").toLowerCase()}`).sort().join("␟");
        const sibs = (variationsOf.get(p.row) ?? []);
        const first = sibs.find((s) => {
          if (s === r) return false;
          const sa = attrCols.map((n) => ({ name: ga(s, n, "name").trim(), values: splitTop(ga(s, n, "value(s)")) })).filter((x) => x.name || x.values.length);
          return sa.map((a) => `${a.name.toLowerCase()}=${a.values.join("|").toLowerCase()}`).sort().join("␟") === key && s.line < L;
        });
        if (key && first) add("error", "dup-variation", L, `Variation "${label}" repeats line ${first.line}`, "Two variations of one product have the same attribute values, so the second overwrites the first or is skipped.");
        if (!attrs.length) add("error", "variation-no-attrs", L, `Variation "${label}" has no attribute values`, "A variation needs one value for each attribute it varies on (Attribute 1 name and Attribute 1 value(s)).");
      }
    } else if (type === null) {
      // bad type already reported
    } else {
      summary.groups.push({ handle: sku || name, line: L, title: name, variants: 0, images: imgs.length });
    }
  }
  summary.products -= summary.variants;
  findings.sort((a, b) => (SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity)) || (a.line - b.line));
  return { findings, summary };
}

// Safe fixes only: things with exactly one reasonable reading. Never edits names,
// descriptions, SKUs, GTINs, stock, categories or image addresses.
export function repair(input) {
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const changes = [];
  if (!text.trim()) return { text: "", changes, error: "The file is empty." };
  const delim = detectDelim(text);
  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) return { text: "", changes, error: `A quote opened on line ${parsed.unterminated} is never closed; fix that first.` };
  const rows = parsed.rows.map((r) => r.cells.slice());
  const head = rows[0].map((h) => h.trim());
  const col = (name) => head.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  if (delim !== ",") changes.push(`Converted the ${delim === ";" ? "semicolon" : "tab"} delimiter to commas.`);
  head.forEach((h, i) => {
    const canon = LOWER.get(h.toLowerCase());
    if (canon && rows[0][i] !== canon) { changes.push(`Header "${rows[0][i]}" renamed to "${canon}".`); rows[0][i] = canon; }
  });
  const edit = (ri, ci, to, why) => {
    const from = rows[ri][ci];
    if (from === to) return;
    rows[ri][ci] = to;
    changes.push(`Line ${parsed.rows[ri].line}, ${rows[0][ci]}: "${from}" → "${to}" (${why}).`);
  };
  const lowerCols = ["Type", "Visibility in catalog", "Tax status", "Backorders allowed?"].map(col);
  const flagCols = ["Published", "Is featured?", "In stock?", "Sold individually?", "Allow customer reviews?"].map(col);
  const priceCols = PRICE_COLS.map(col);
  const dimCols = DIM_COLS.map(col);
  const trimCols = ["SKU", "Parent", "ID", "GTIN, UPC, EAN, or ISBN", "Images"].map(col);
  for (let ri = 1; ri < rows.length; ri++) {
    if (rows[ri].every((c) => c.trim() === "")) continue;
    for (const ci of lowerCols) if (ci >= 0 && rows[ri][ci] !== undefined && rows[ri][ci].trim() && rows[ri][ci] !== rows[ri][ci].trim().toLowerCase() && !/^id:/i.test(rows[ri][ci])) edit(ri, ci, rows[ri][ci].trim().toLowerCase(), "lowercase as the importer expects");
    for (const ci of flagCols) if (ci >= 0 && rows[ri][ci] !== undefined) { const f = toFlag(rows[ri][ci].trim()); if (f !== null) edit(ri, ci, f, "1 or 0"); }
    for (const ci of priceCols) {
      if (ci < 0 || rows[ri][ci] === undefined) continue;
      const v = rows[ri][ci].trim();
      if (v && !isNum(v)) { const c = cleanPrice(v); if (isNum(c)) edit(ri, ci, c, "plain number"); }
    }
    for (const ci of dimCols) if (ci >= 0 && rows[ri][ci] !== undefined && /^\d+,\d+$/.test(rows[ri][ci].trim())) edit(ri, ci, rows[ri][ci].trim().replace(",", "."), "decimal point");
    for (const ci of trimCols) if (ci >= 0 && rows[ri][ci] !== undefined && rows[ri][ci] !== rows[ri][ci].trim()) edit(ri, ci, rows[ri][ci].trim(), "stray spaces");
  }
  return { text: toCsv(rows), changes, error: null };
}

export function findingsCsv(result) {
  return toCsv([["severity", "line", "code", "title", "detail"], ...result.findings.map((f) => [f.severity, String(f.line || ""), f.code, f.title, f.detail])]);
}

const H = COLUMNS;
function build(rows) { return toCsv([H, ...rows.map((o) => H.map((h) => o[h] ?? ""))]); }
const base = (o) => ({ "Published": "1", "Visibility in catalog": "visible", "Tax status": "taxable", "In stock?": "1", "Backorders allowed?": "0", "Sold individually?": "0", "Allow customer reviews?": "1", ...o });

export function sampleFile() {
  return build([
    base({ ID: "", Type: "variable", SKU: "TOTE", Name: "Canvas Tote Bag", Description: "<p>Heavy cotton canvas, <strong>natural</strong>.</p>", Categories: "Bags > Totes", Tags: "bags, totes", Images: "https://cdn.example.com/tote.jpg", "Attribute 1 name": "Color", "Attribute 1 value(s)": "Natural, Black", "Attribute 1 visible": "1", "Attribute 1 global": "0" }),
    base({ Type: "variation", SKU: "TOTE-NAT", Parent: "TOTE", Stock: "40", "Weight (kg)": "0.32", "Regular price": "24.00", "Sale price": "19.00", "GTIN, UPC, EAN, or ISBN": "036000291452", "Attribute 1 name": "Color", "Attribute 1 value(s)": "Natural", "Attribute 1 global": "0" }),
    base({ Type: "variation", SKU: "TOTE-BLK", Parent: "TOTE", Stock: "25", "Weight (kg)": "0.32", "Regular price": "24.00", "Attribute 1 name": "Color", "Attribute 1 value(s)": "Black", "Attribute 1 global": "0" }),
    base({ Type: "simple", SKU: "MUG-01", Name: "Enamel Mug", Description: "<p>350 ml.</p>", Categories: "Kitchen", Stock: "60", "Weight (kg)": "0.21", "Regular price": "14.50", Images: "https://cdn.example.com/mug.png" }),
  ]);
}

export function sampleBrokenFile() {
  return build([
    base({ Type: "variable", SKU: "TOTE", Name: "Canvas Tote Bag", Description: "<div><p>Heavy cotton canvas.</div>", Categories: "Bags > Totes", Images: "https://cdn.example.com/tote natural.jpg", "Attribute 1 name": "Color", "Attribute 1 value(s)": "Natural, Black" }),
    base({ Type: "Variation", SKU: "TOTE-NAT", Parent: "TOTE", Stock: "40", "Regular price": "$24.00", "Sale price": "29.00", "GTIN, UPC, EAN, or ISBN": "036000291453", "Attribute 1 name": "Color", "Attribute 1 value(s)": "Natural", Published: "yes" }),
    base({ Type: "variation", SKU: "TOTE-NAT", Parent: "TOTE ", Stock: "25", "Regular price": "24,00", "Attribute 1 name": "Color", "Attribute 1 value(s)": "Red" }),
    base({ Type: "variation", SKU: "TOTE-GRN", Parent: "TOT", "Regular price": "24.00", "Attribute 1 name": "Color", "Attribute 1 value(s)": "Green" }),
    base({ Type: "simple", SKU: "1.23457E+12", Name: "", "Weight (kg)": "0,21", "Regular price": "14.50", "In stock?": "0", Stock: "60", "Date sale price starts": "27/11/2026", Images: "enamel-mug.png" }),
  ]);
}
