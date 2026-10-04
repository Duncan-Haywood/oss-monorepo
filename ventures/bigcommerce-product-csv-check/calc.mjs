// BigCommerce product CSV import checker. Pure functions, no DOM, no network.
// Column names and rules are read from memory of BigCommerce's public product CSV import
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

export function gtinProblem(code) {
  if (!/^\d+$/.test(code)) return null;
  if (![8, 12, 13, 14].includes(code.length)) return code.length === 11 ? "11 digits: a UPC-A has 12, so a leading zero was probably lost" : null;
  const d = code.split("").map(Number), check = d.pop();
  let sum = 0;
  d.reverse().forEach((x, i) => { sum += x * (i % 2 === 0 ? 3 : 1); });
  const want = (10 - (sum % 10)) % 10;
  return want === check ? null : `check digit should be ${want}`;
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
  "Item Type", "Product ID", "Product Name", "Product Type", "Product Code/SKU", "Bin Picking Number", "Brand Name",
  "Option Set", "Option Set Align", "Product Description", "Price", "Cost Price", "Retail Price", "Sale Price",
  "Fixed Shipping Cost", "Free Shipping", "Product Warranty", "Product Weight", "Product Width", "Product Height",
  "Product Depth", "Allow Purchases?", "Product Visible?", "Product Availability", "Track Inventory",
  "Current Stock Level", "Low Stock Level", "Category", "Product Image ID - 1", "Product Image File - 1",
  "Product Image Description - 1", "Product Image Is Thumbnail - 1", "Product Image Sort - 1", "Search Keywords",
  "Page Title", "Meta Keywords", "Meta Description", "Product Condition", "Show Product Condition?", "Sort Order",
  "Product Tax Class", "Product UPC/EAN", "Stop Processing Rules", "Product URL", "Redirect Old URL?",
  "GPS Global Trade Item Number", "GPS Manufacturer Part Number", "GPS Gender", "GPS Age Group", "GPS Color",
  "GPS Size", "GPS Material", "GPS Pattern", "GPS Item Group ID", "GPS Category", "GPS Enabled",
  "Avalara Product Tax Code", "Product Custom Fields",
];
const LOWER = new Map(COLUMNS.map((c) => [c.toLowerCase(), c]));
const IMG = /^product image (id|file|description|is thumbnail|sort) - (\d+)$/i;
const isOpenColumn = (h) => IMG.test(h);
export const SEVERITIES = ["error", "warning", "info"];

export function closestColumn(name) {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  let best = null, bestD = 99;
  for (const c of COLUMNS) {
    const d = distance(n, c.toLowerCase().replace(/[^a-z0-9]/g, ""));
    if (d < bestD) { bestD = d; best = c; }
  }
  return bestD <= Math.max(2, Math.floor(n.length / 4)) ? best : null;
}

const ITEM_TYPES = new Map([["product", "Product"], ["sku", "SKU"], ["rule", "Rule"], ["image", "Image"]]);
const YN = ["Allow Purchases?", "Product Visible?", "Free Shipping", "Redirect Old URL?", "Show Product Condition?", "Stop Processing Rules", "GPS Enabled"];
const PRICE_COLS = ["Price", "Cost Price", "Retail Price", "Sale Price", "Fixed Shipping Cost"];
const DIM_COLS = ["Product Weight", "Product Width", "Product Height", "Product Depth"];
const AVAIL = new Set(["available", "disabled", "preorder"]);
const TRACK = new Set(["none", "by product", "by option"]);
const COND = new Set(["new", "used", "refurbished"]);
const SCI = /^\d(\.\d+)?e\+?\d+$/i;
const isNum = (v) => /^\d+(\.\d+)?$/.test(v);
const toYN = (v) => (/^(y|yes|true|1)$/i.test(v) ? "Y" : /^(n|no|false|0)$/i.test(v) ? "N" : null);

function cleanPrice(v) {
  let s = v.trim().replace(/^[$€£¥]\s*/, "").replace(/\s*(USD|EUR|GBP|CAD|AUD)$/i, "");
  if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  return s;
}

export function gtinCheck(code) {
  if (!/^\d+$/.test(code)) return null;
  if (![8, 12, 13, 14].includes(code.length)) return code.length === 11 ? "11 digits: a UPC-A has 12, so a leading zero was probably lost" : null;
  const d = code.split("").map(Number), check = d.pop();
  let sum = 0;
  d.reverse().forEach((x, i) => { sum += x * (i % 2 === 0 ? 3 : 1); });
  const want = (10 - (sum % 10)) % 10;
  return want === check ? null : `check digit should be ${want}`;
}

function layout(header) {
  const idx = {}, images = new Map();
  header.forEach((h, i) => {
    const lc = h.trim().toLowerCase();
    if (LOWER.has(lc)) { const c = LOWER.get(lc); if (idx[c] === undefined) idx[c] = i; }
    const m = h.trim().match(IMG);
    if (m) {
      const n = Number(m[2]);
      if (!images.has(n)) images.set(n, {});
      images.get(n)[m[1].toLowerCase()] = i;
    }
  });
  return { idx, images };
}

export function validate(input) {
  const findings = [];
  const add = (severity, code, line, title, detail) => findings.push({ severity, code, line, title, detail });
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const summary = { rows: 0, products: 0, variants: 0, images: 0, columns: 0, delimiter: ",", groups: [] };
  if (!text.trim()) { add("error", "empty", 0, "The file is empty", "Paste or choose a BigCommerce product CSV."); return { findings, summary }; }

  if (text.includes("�")) add("warning", "encoding", 0, "The file contains replacement characters", "Characters such as � mean the file was saved in a legacy encoding and read as UTF-8. Re-export as CSV UTF-8, or accents and symbols in names will import damaged.");
  if (/Ã[\u0080-¿]|â€[™œ"˜]/.test(text)) add("warning", "mojibake", 0, "Text looks double-encoded", "Sequences like Ã© or â€™ usually mean UTF-8 was saved as Windows-1252 and re-read. Fix the encoding before importing, or product names will show them.");

  const delim = detectDelim(text);
  summary.delimiter = delim;
  if (delim !== ",") add("error", "delimiter", 1, `The file is ${delim === ";" ? "semicolon" : "tab"}-separated`, "BigCommerce's importer expects a comma delimiter. Excel in many European locales saves CSV with semicolons. Re-save as CSV UTF-8 (comma delimited), or use Apply safe fixes.");

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
      if (h !== LOWER.get(lc)) add("warning", "header-case", 1, `Column "${h}" is not spelled like the template`, `Use "${LOWER.get(lc)}" exactly, including capitals, punctuation and the question mark.`);
    } else if (!isOpenColumn(h)) {
      const near = closestColumn(h);
      add("warning", "unknown-header", 1, `Unknown column "${h}"`, near ? `Did you mean "${near}"? Unmapped columns are skipped by the importer, so this data would not import.` : "Unmapped columns are skipped by the importer, so this data would not import.");
    }
  });
  const { idx, images } = layout(header);
  if (idx["Item Type"] === undefined) add("warning", "no-item-type", 1, 'There is no "Item Type" column', "The legacy importer reads Item Type to tell a Product row from a SKU, Rule or Image row. Without it the file is read as products only, so variants and rules cannot be expressed.");
  if (idx["Product Name"] === undefined) add("error", "no-name", 1, 'There is no "Product Name" column', "Every product needs a name; the importer has nothing to name the products with.");

  const g = (r, name) => (idx[name] === undefined ? "" : (r.cells[idx[name]] ?? ""));
  const body = [];
  let blank = 0;
  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri];
    summary.rows++;
    if (r.cells.every((c) => c.trim() === "")) { blank++; continue; }
    if (r.cells.length > header.length) add("error", "extra-cells", r.line, `Row has ${r.cells.length} cells but the header has ${header.length}`, "An unquoted comma in Category, Search Keywords or a description shifts every later cell one column right, so prices land in the wrong field. Quote the cell.");
    else if (r.cells.length < header.length) add("warning", "short-row", r.line, `Row has ${r.cells.length} cells but the header has ${header.length}`, "Missing trailing cells are read as blank. Check that nothing was cut off.");
    body.push(r);
  }
  if (blank) add("info", "blank-rows", 0, `${blank} blank row${blank === 1 ? "" : "s"} skipped`, "Blank rows are harmless but usually mean a spreadsheet range was exported wider than the data.");

  const kindOf = (r) => {
    const raw = g(r, "Item Type").trim();
    if (!raw) return idx["Item Type"] === undefined ? "Product" : null;
    return ITEM_TYPES.get(raw.toLowerCase()) ?? "?";
  };
  const skuLines = new Map(), idLines = new Map(), nameLines = new Map();
  const note = (map, k, line) => { if (!map.has(k)) map.set(k, []); map.get(k).push(line); };
  let current = null;
  const thumbs = [];
  for (const r of body) {
    const kind = kindOf(r);
    const raw = g(r, "Item Type").trim();
    if (kind === null) { add("error", "item-type-blank", r.line, "Item Type is blank", 'Each row must say whether it is a "Product", "SKU", "Rule" or "Image".'); continue; }
    if (kind === "?") { add("error", "item-type", r.line, `Unknown Item Type "${raw}"`, 'Valid values are Product, SKU, Rule and Image. A row with any other value is skipped or rejected.'); continue; }
    if (raw && raw !== kind) add("warning", "item-type-case", r.line, `Item Type "${raw}" should be "${kind}"`, "Match the template's capitalisation exactly.");
    const sku = g(r, "Product Code/SKU").trim();
    if (sku) note(skuLines, sku, r.line);
    if (kind === "Product") {
      summary.products++;
      current = { line: r.line, name: g(r, "Product Name").trim(), skus: 0, optionSet: g(r, "Option Set").trim(), combos: new Set(), imagesN: 0, sku };
      summary.groups.push({ line: r.line, handle: sku || current.name, title: current.name, variants: 0, images: 0 });
      const grp = summary.groups[summary.groups.length - 1];
      current.grp = grp;
      const id = g(r, "Product ID").trim();
      if (id) note(idLines, id, r.line);
      if (!current.name) add("error", "name-blank", r.line, "Product Name is blank", "Every Product row needs a name; the importer rejects it.");
      else {
        if (current.name.length > 250) add("warning", "name-long", r.line, `Product Name is ${current.name.length} characters`, "BigCommerce limits a product name to 250 characters; longer names are rejected or cut.");
        note(nameLines, current.name.toLowerCase(), r.line);
      }
      if (!sku) add("info", "sku-blank", r.line, "No Product Code/SKU", "A product without a SKU cannot be matched on a later import, so a re-import creates a duplicate instead of updating it.");
      const pt = g(r, "Product Type").trim();
      if (pt && !/^(p|d|physical|digital)$/i.test(pt)) add("error", "product-type", r.line, `Product Type "${pt}" is not P or D`, "Use P for a physical product that ships and D for a digital download.");
      else if (!pt && idx["Product Type"] !== undefined) add("warning", "product-type-blank", r.line, "Product Type is blank", "Set P (physical) or D (digital).");
      const price = g(r, "Price").trim();
      if (idx["Price"] !== undefined && !price) add("error", "price-blank", r.line, "Price is blank", "A product with no price imports at 0.00 or is rejected. Enter the selling price.");
      for (const c of PRICE_COLS) {
        const v = g(r, c).trim();
        if (v && !isNum(v)) add("error", "price-format", r.line, `${c} "${v}" is not a plain number`, `Write ${c} as digits and a decimal point only, for example ${cleanPrice(v) || "24.00"}. A currency symbol, a decimal comma or a thousands separator makes the import reject the row or read the wrong value.`);
      }
      const sale = g(r, "Sale Price").trim();
      if (isNum(price) && isNum(sale) && Number(sale) > Number(price)) add("warning", "sale-price", r.line, `Sale Price ${sale} is higher than Price ${price}`, "A sale price above the regular price is a markup, not a sale. The two columns are probably swapped.");
      const cost = g(r, "Cost Price").trim();
      if (isNum(price) && isNum(cost) && Number(cost) > Number(price) && Number(price) > 0) add("info", "cost-above-price", r.line, `Cost Price ${cost} is above Price ${price}`, "The product would sell at a loss. Often a cost and price column swapped.");
      for (const c of DIM_COLS) {
        const v = g(r, c).trim();
        if (v && !isNum(v)) add("error", "dim-format", r.line, `${c} "${v}" is not a plain number`, "Weight and size are digits and a decimal point only, with no unit and no decimal comma. The unit comes from the store settings.");
      }
      if (/^p/i.test(pt) && idx["Product Weight"] !== undefined && !g(r, "Product Weight").trim()) add("info", "weight-blank", r.line, "Weight is blank on a physical product", "Weight-based shipping quotes treat a blank weight as zero.");
      for (const c of YN) {
        const v = g(r, c).trim();
        if (v && !/^[YN]$/.test(v)) add(toYN(v) ? "warning" : "error", "flag", r.line, `${c} "${v}" should be Y or N`, "The importer's flag columns take a capital Y or N.");
      }
      const av = g(r, "Product Availability").trim();
      if (av && !AVAIL.has(av.toLowerCase())) add("error", "availability", r.line, `Product Availability "${av}" is not recognised`, "Use available, disabled or preorder.");
      const tr = g(r, "Track Inventory").trim();
      if (tr && !TRACK.has(tr.toLowerCase())) add("error", "track", r.line, `Track Inventory "${tr}" is not recognised`, "Use none, by product or by option.");
      const stock = g(r, "Current Stock Level").trim();
      if (stock && !/^\d+$/.test(stock)) add("error", "stock", r.line, `Current Stock Level "${stock}" is not a whole number`, "Stock is a whole number of 0 or more.");
      if (/^by option$/i.test(tr) && !current.optionSet) add("warning", "track-option", r.line, "Inventory is tracked by option but there is no Option Set", "Tracking by option needs variants. Without an Option Set the product has none.");
      const cond = g(r, "Product Condition").trim();
      if (cond && !COND.has(cond.toLowerCase())) add("warning", "condition", r.line, `Product Condition "${cond}" is not recognised`, "Use New, Used or Refurbished.");
      const cat = g(r, "Category");
      if (cat) {
        if (/(^|;)\s*\/|\/\s*(;|$)|\/\s*\//.test(cat)) add("warning", "category-path", r.line, "Category has an empty path segment", `"${cat}" has a leading, trailing or doubled slash. Write Parent/Child; separate several categories with a semicolon.`);
        if (/>/.test(cat)) add("warning", "category-sep", r.line, 'Category uses ">" as a separator', 'BigCommerce category paths use "/", for example Bags/Totes. A ">" is read as part of the category name.');
      }
      const url = g(r, "Product URL").trim();
      if (url && (!url.startsWith("/") || /\s/.test(url) || /[A-Z]/.test(url))) add("warning", "url", r.line, `Product URL "${url}" is not a clean path`, "A custom URL starts with a slash, has no spaces and is lowercase, for example /canvas-tote/.");
      const upc = g(r, "Product UPC/EAN").trim() || g(r, "GPS Global Trade Item Number").trim();
      if (upc) {
        if (SCI.test(upc)) add("error", "sci-gtin", r.line, `Barcode "${upc}" is in scientific notation`, "Excel rewrote the barcode and dropped its digits. Reformat the column as Text and re-enter the original codes.");
        else { const p = gtinCheck(upc); if (p) add("warning", "gtin", r.line, `Barcode ${upc}: ${p}`, "Marketplaces and Google Merchant Center reject a wrong check digit. Check the number against the package."); }
      }
      if (SCI.test(sku)) add("error", "sci-sku", r.line, `SKU "${sku}" is in scientific notation`, "Excel turned the SKU into a number and lost digits. Two products can collapse to the same value. Reformat the column as Text and re-enter the SKUs.");
      const d = g(r, "Product Description");
      const bal = balance(d);
      if (bal.length) add("warning", "html-balance", r.line, "Description HTML is unbalanced", `${bal.join("; ")}. An unclosed tag can break the product page layout.`);
      let thumb = 0, imgs = 0;
      for (const [n, c] of [...images.entries()].sort((a, b) => a[0] - b[0])) {
        const f = c.file === undefined ? "" : (r.cells[c.file] ?? "");
        if (!f.trim()) continue;
        imgs++;
        if (f !== f.trim()) add("warning", "image-space", r.line, `Image ${n} address has leading or trailing spaces`, "Spaces around the address make it unreachable. Apply safe fixes trims them.");
        const t = f.trim();
        if (/\s/.test(t)) add("error", "image-url", r.line, `Image ${n} address contains a space`, "Spaces inside an image address break the download. Use %20 or rename the file.");
        else if (/^[a-z][a-z0-9+.-]*:/i.test(t) && !/^https?:/i.test(t)) add("error", "image-scheme", r.line, `Image ${n} address uses an unsupported scheme`, "The importer fetches http and https addresses (or files uploaded to the store's WebDAV folder). Local drive paths such as C:\\ cannot be read.");
        else if (!/^https?:/i.test(t)) add("info", "image-relative", r.line, `Image ${n} "${t}" is not a full web address`, "A bare file name works only if the file is already in the store's image folder or WebDAV. Otherwise use a full https address.");
        else if (/^http:/i.test(t)) add("info", "image-http", r.line, `Image ${n} uses http, not https`, "A plain http image can be blocked on an https storefront.");
        const th = c["is thumbnail"] === undefined ? "" : (r.cells[c["is thumbnail"]] ?? "").trim();
        if (/^y$/i.test(th) || /^true$/i.test(th)) thumb++;
        if (th && !/^[YN]$/.test(th)) add("warning", "thumb-flag", r.line, `Image ${n} thumbnail flag "${th}" should be Y or N`, "Use a capital Y or N.");
      }
      if (imgs > 0 && thumb === 0) add("info", "no-thumb", r.line, "No image is marked as the thumbnail", "Mark exactly one image Y in Product Image Is Thumbnail so the category page shows the right picture.");
      if (thumb > 1) add("warning", "multi-thumb", r.line, `${thumb} images are marked as the thumbnail`, "Only one image can be the thumbnail; the importer keeps one and the choice is not obvious.");
      current.grp.images = imgs;
      summary.images += imgs;
      if (imgs === 0 && /^p|^d|^$/i.test(pt)) add("info", "no-image", r.line, "No product image", "Products without an image convert far worse and are rejected by most marketplace feeds.");
    } else if (kind === "SKU") {
      summary.variants++;
      if (!current) { add("error", "sku-orphan", r.line, "A SKU row comes before any Product row", "A SKU row belongs to the Product row above it. Move the product row above its SKU rows."); continue; }
      current.skus++;
      current.grp.variants++;
      if (!current.optionSet) add("warning", "sku-no-option-set", r.line, `Product on line ${current.line} has SKU rows but no Option Set`, "SKU rows describe option combinations of an option set. Name the set on the Product row, or the combinations cannot be created.");
      const nm = g(r, "Product Name").trim();
      if (!nm) add("error", "sku-options-blank", r.line, "SKU row has no option values", 'The Product Name cell of a SKU row lists its option values, for example "[RB]Size=Medium,[RB]Color=Red". It is blank here.');
      else if (!/=/.test(nm)) add("warning", "sku-options-format", r.line, `SKU row option values "${nm}" have no "="`, 'Write each option as [RB]Name=Value, for example "[RB]Size=Medium".');
      else {
        const key = nm.toLowerCase().replace(/\s+/g, "");
        if (current.combos.has(key)) add("error", "sku-dup-combo", r.line, `Duplicate option combination "${nm}"`, `The same combination already appears under the product on line ${current.line}. The second would overwrite the first.`);
        current.combos.add(key);
      }
      if (!sku) add("error", "sku-blank", r.line, "SKU row has no Product Code/SKU", "A variant needs its own SKU to be matched on later imports and to track stock.");
      if (SCI.test(sku)) add("error", "sci-sku", r.line, `SKU "${sku}" is in scientific notation`, "Excel turned the SKU into a number and lost digits. Reformat the column as Text and re-enter the SKUs.");
      const price = g(r, "Price").trim();
      if (price && !isNum(price) && !/^[+-]?\d+(\.\d+)?$/.test(price)) add("error", "price-format", r.line, `Price "${price}" is not a plain number`, `On a SKU row Price is an adjustment such as 5 or -2. Write digits and a decimal point only; ${cleanPrice(price) || "a plain number"} would be accepted.`);
      const stock = g(r, "Current Stock Level").trim();
      if (stock && !/^\d+$/.test(stock)) add("error", "stock", r.line, `Current Stock Level "${stock}" is not a whole number`, "Stock is a whole number of 0 or more.");
    } else if (kind === "Rule") {
      if (!current) add("error", "rule-orphan", r.line, "A Rule row comes before any Product row", "A Rule row belongs to the Product row above it.");
    }
  }
  for (const [s, ls] of skuLines) if (ls.length > 1) add("error", "dup-sku", ls[1], `SKU "${s}" is used ${ls.length} times`, `Lines ${ls.join(", ")}. SKUs must be unique across the store; the second use is rejected or overwrites the first.`);
  for (const [s, ls] of idLines) if (ls.length > 1) add("error", "dup-id", ls[1], `Product ID ${s} is used ${ls.length} times`, `Lines ${ls.join(", ")}. Each Product ID names one existing product.`);
  for (const [s, ls] of nameLines) if (ls.length > 1) add("warning", "dup-name", ls[1], `Product Name "${s}" appears ${ls.length} times`, `Lines ${ls.join(", ")}. Two products with one name are valid but usually mean a duplicate row.`);
  for (const grp of summary.groups) {
    const p = body.find((r) => r.line === grp.line);
    if (p && g(p, "Option Set").trim() && grp.variants === 0 && idx["Item Type"] !== undefined) add("info", "option-set-no-skus", grp.line, `"${grp.title}" names an Option Set but has no SKU rows`, "The product imports with the option set attached and no purchasable combinations or per-variant stock.");
  }
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
  const itemCi = col("Item Type"), typeCi = col("Product Type");
  const ynCols = YN.map(col), priceCols = PRICE_COLS.map(col), dimCols = DIM_COLS.map(col);
  const trimCols = ["Item Type", "Product ID", "Product Code/SKU", "Product UPC/EAN"].map(col);
  const imgFile = rows[0].map((h, i) => (/^product image file - \d+$/i.test(h.trim()) ? i : -1)).filter((i) => i >= 0);
  const thumbCols = rows[0].map((h, i) => (/^product image is thumbnail - \d+$/i.test(h.trim()) ? i : -1)).filter((i) => i >= 0);
  for (let ri = 1; ri < rows.length; ri++) {
    if (rows[ri].every((c) => c.trim() === "")) continue;
    for (const ci of [...trimCols, ...imgFile]) if (ci >= 0 && rows[ri][ci] !== undefined && rows[ri][ci] !== rows[ri][ci].trim()) edit(ri, ci, rows[ri][ci].trim(), "stray spaces");
    if (itemCi >= 0 && rows[ri][itemCi] !== undefined) { const c = ITEM_TYPES.get(rows[ri][itemCi].trim().toLowerCase()); if (c && c !== rows[ri][itemCi]) edit(ri, itemCi, c, "template capitalisation"); }
    if (typeCi >= 0 && rows[ri][typeCi] !== undefined) { const v = rows[ri][typeCi].trim(); const m = /^physical$/i.test(v) ? "P" : /^digital$/i.test(v) ? "D" : /^[pd]$/i.test(v) ? v.toUpperCase() : null; if (m && m !== rows[ri][typeCi]) edit(ri, typeCi, m, "P or D"); }
    for (const ci of [...ynCols, ...thumbCols]) if (ci >= 0 && rows[ri][ci] !== undefined) { const f = toYN(rows[ri][ci].trim()); if (f !== null && f !== rows[ri][ci]) edit(ri, ci, f, "Y or N"); }
    for (const ci of priceCols) {
      if (ci < 0 || rows[ri][ci] === undefined) continue;
      const v = rows[ri][ci].trim();
      if (v && !isNum(v)) { const c = cleanPrice(v); if (isNum(c)) edit(ri, ci, c, "plain number"); }
    }
    for (const ci of dimCols) if (ci >= 0 && rows[ri][ci] !== undefined && /^\d+,\d+$/.test(rows[ri][ci].trim())) edit(ri, ci, rows[ri][ci].trim().replace(",", "."), "decimal point");
  }
  return { text: toCsv(rows), changes, error: null };
}

export function findingsCsv(result) {
  return toCsv([["severity", "line", "code", "title", "detail"], ...result.findings.map((f) => [f.severity, String(f.line || ""), f.code, f.title, f.detail])]);
}

const H = [...COLUMNS.slice(0, COLUMNS.indexOf("Product Image ID - 1")), "Product Image File - 1", "Product Image Is Thumbnail - 1", "Product Image File - 2", "Product Image Is Thumbnail - 2", ...COLUMNS.slice(COLUMNS.indexOf("Search Keywords"))].filter((c) => !/^Product Image (ID|Description|Sort) - 1$/.test(c));
function build(rows) { return toCsv([H, ...rows.map((o) => H.map((h) => o[h] ?? ""))]); }
const base = (o) => ({ "Allow Purchases?": "Y", "Product Visible?": "Y", "Product Availability": "available", "Track Inventory": "by product", "Product Condition": "New", ...o });

export function sampleFile() {
  return build([
    base({ "Item Type": "Product", "Product Name": "Canvas Tote Bag", "Product Type": "P", "Product Code/SKU": "TOTE", "Brand Name": "Harbor Goods", "Option Set": "Tote Colour", "Product Description": "<p>Heavy cotton canvas.</p>", Price: "24.00", "Sale Price": "19.00", "Product Weight": "0.7", Category: "Bags/Totes", "Product Image File - 1": "https://cdn.example.com/tote.jpg", "Product Image Is Thumbnail - 1": "Y", "Product UPC/EAN": "036000291452", "Product URL": "/canvas-tote/" }),
    base({ "Item Type": "SKU", "Product Name": "[RB]Colour=Natural", "Product Code/SKU": "TOTE-NAT", "Current Stock Level": "40" }),
    base({ "Item Type": "SKU", "Product Name": "[RB]Colour=Black", "Product Code/SKU": "TOTE-BLK", "Current Stock Level": "25", Price: "2" }),
    base({ "Item Type": "Product", "Product Name": "Enamel Mug", "Product Type": "P", "Product Code/SKU": "MUG-01", "Product Description": "<p>350 ml.</p>", Price: "14.50", "Product Weight": "0.5", Category: "Kitchen", "Current Stock Level": "60", "Product Image File - 1": "https://cdn.example.com/mug.png", "Product Image Is Thumbnail - 1": "Y", "Track Inventory": "by product" }),
  ]);
}

export function sampleBrokenFile() {
  return build([
    base({ "Item Type": "product", "Product Name": "Canvas Tote Bag", "Product Type": "Physical", "Product Code/SKU": "TOTE", "Option Set": "Tote Colour", "Product Description": "<div><p>Heavy cotton canvas.</div>", Price: "$24.00", "Sale Price": "29.00", "Product Weight": "0,7", Category: "Bags > Totes", "Product Image File - 1": "https://cdn.example.com/tote natural.jpg", "Product Image Is Thumbnail - 1": "yes", "Product UPC/EAN": "036000291453", "Product URL": "Canvas Tote" }),
    base({ "Item Type": "SKU", "Product Name": "[RB]Colour=Natural", "Product Code/SKU": "TOTE-NAT", "Current Stock Level": "40" }),
    base({ "Item Type": "SKU", "Product Name": "[RB]Colour=Natural", "Product Code/SKU": "TOTE-NAT", "Current Stock Level": "lots" }),
    base({ "Item Type": "SKU", "Product Name": "Green", "Product Code/SKU": "TOTE-GRN" }),
    base({ "Item Type": "Product", "Product Name": "", "Product Type": "P", "Product Code/SKU": "1.23457E+12", Price: "", "Product Image File - 1": "C:\\photos\\mug.png", "Allow Purchases?": "maybe", "Track Inventory": "by option" }),
  ]);
}
