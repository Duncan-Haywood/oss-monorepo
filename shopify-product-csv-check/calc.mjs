// Shopify product CSV import checker. Pure functions, no DOM, no network.
// Column names and rules are read from memory of Shopify's public product CSV
// template and import help; no Shopify import was available when this was built.

export const COLUMNS = [
  "Handle", "Title", "Body (HTML)", "Vendor", "Product Category", "Type", "Tags", "Published",
  "Option1 Name", "Option1 Value", "Option1 Linked To", "Option2 Name", "Option2 Value", "Option2 Linked To",
  "Option3 Name", "Option3 Value", "Option3 Linked To", "Variant SKU", "Variant Grams",
  "Variant Inventory Tracker", "Variant Inventory Qty", "Variant Inventory Policy",
  "Variant Fulfillment Service", "Variant Price", "Variant Compare At Price", "Variant Requires Shipping",
  "Variant Taxable", "Variant Barcode", "Image Src", "Image Position", "Image Alt Text", "Gift Card",
  "SEO Title", "SEO Description", "Variant Image", "Variant Weight Unit", "Variant Tax Code",
  "Cost per item", "Status",
];

const LOWER = new Map(COLUMNS.map((c) => [c.toLowerCase(), c]));
// Columns Shopify also accepts that are not fixed names.
const isOpenColumn = (h) => /^google shopping \//i.test(h) || /\(.*(?:product|variant)\.metafields?\..*\)\s*$/i.test(h) || /^metafield:/i.test(h);

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

export function slugify(s) {
  return String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
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

const BOOL = new Set(["TRUE", "FALSE"]);
const UNITS = new Set(["g", "kg", "lb", "oz"]);
const STATUS = new Set(["active", "draft", "archived"]);
const PRICE_COLS = ["Variant Price", "Variant Compare At Price", "Cost per item"];
const SCI = /^\d(\.\d+)?e\+?\d+$/i;

function decimalComma(v) { return /^\d+,\d{1,2}$/.test(v); }
function cleanPrice(v) {
  let s = v.trim().replace(/^[$€£¥]\s*/, "").replace(/\s*(USD|EUR|GBP|CAD|AUD)$/i, "");
  if (decimalComma(s)) s = s.replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  return s;
}
const isNum = (v) => /^\d+(\.\d+)?$/.test(v);

function balance(html) {
  const out = [];
  for (const t of ["div", "p", "ul", "ol", "li", "table", "tr", "td", "span", "strong", "em", "b", "i", "a", "h1", "h2", "h3"]) {
    const o = (html.match(new RegExp(`<${t}(\\s[^>]*)?>`, "gi")) || []).length;
    const c = (html.match(new RegExp(`</${t}\\s*>`, "gi")) || []).length;
    if (o !== c) out.push(`<${t}> opens ${o}, closes ${c}`);
  }
  return out;
}

export function validate(input) {
  const findings = [];
  const add = (severity, code, line, title, detail) => findings.push({ severity, code, line, title, detail });
  let text = String(input ?? "");
  const hadBom = text.charCodeAt(0) === 0xfeff;
  if (hadBom) text = text.slice(1);
  const summary = { rows: 0, products: 0, variants: 0, images: 0, columns: 0, delimiter: ",", groups: [] };
  if (!text.trim()) { add("error", "empty", 0, "The file is empty", "Paste or choose a Shopify product CSV."); return { findings, summary }; }

  if (text.includes("�")) add("warning", "encoding", 0, "The file contains replacement characters", "Characters such as � mean the file was saved in a legacy encoding and read as UTF-8. Re-export as CSV UTF-8, or accents and symbols in titles will import damaged.");
  if (/Ã[\u0080-¿]|â€[™œ"˜]/.test(text)) add("warning", "mojibake", 0, "Text looks double-encoded", "Sequences like Ã© or â€™ usually mean UTF-8 was saved as Windows-1252 and re-read. Fix the encoding before importing, or product names will show those characters.");

  const firstLine = text.split("\n", 1)[0];
  const count = (c) => (firstLine.match(new RegExp(c === "\t" ? "\t" : `\\${c}`, "g")) || []).length;
  let delim = ",";
  if (count(",") === 0 && count(";") > 0) delim = ";";
  else if (count(",") === 0 && count("\t") > 0) delim = "\t";
  summary.delimiter = delim;
  if (delim !== ",") add("error", "delimiter", 1, `The file is ${delim === ";" ? "semicolon" : "tab"}-separated`, `Shopify reads comma-separated files. Excel in many European locales saves CSV with semicolons. Re-save as CSV UTF-8 (comma delimited), or use "Apply safe fixes" below.`);

  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) {
    add("error", "quote", parsed.unterminated, "A quoted cell is never closed", `A cell opened with a double quote on line ${parsed.unterminated} has no closing quote, so everything after it is read as one cell. Body (HTML) with unescaped quotes is the usual cause: inside a quoted cell, a literal quote must be doubled ("").`);
    return { findings, summary };
  }
  const rows = parsed.rows;
  const header = rows[0].cells.map((h) => h.trim());
  summary.columns = header.length;
  const idx = {};
  const seen = new Map();
  header.forEach((h, i) => {
    const canon = LOWER.get(h.toLowerCase());
    if (canon) {
      if (idx[canon] !== undefined) add("error", "dup-header", 1, `Column "${canon}" appears twice`, `Columns ${idx[canon] + 1} and ${i + 1} are both "${canon}". Shopify uses one of them and ignores the other; delete one.`);
      else idx[canon] = i;
      if (h !== canon) add("warning", "header-case", 1, `Column "${h}" is not spelled like Shopify's template`, `Use "${canon}" exactly, including capitals, spaces and brackets.`);
    } else if (!isOpenColumn(h)) {
      const near = closestColumn(h);
      if (/^option4/i.test(h)) add("error", "option4", 1, `"${h}": Shopify allows three options`, "Product CSV files carry Option1, Option2 and Option3. Merge or drop an option.");
      else add("warning", "unknown-header", 1, `Unknown column "${h}"`, near ? `Did you mean "${near}"? Shopify ignores columns it does not recognise, so this data would not import.` : "Shopify ignores columns it does not recognise, so this data would not import.");
    }
    if (h === "") add("warning", "blank-header", 1, `Column ${i + 1} has no name`, "An unnamed column is ignored. Often a stray trailing comma.");
    seen.set(h, i);
  });
  if (idx["Handle"] === undefined) { add("error", "no-handle", 1, 'There is no "Handle" column', "Handle is what groups rows into one product. Without it Shopify cannot import the file."); return { findings, summary }; }
  if (idx["Title"] === undefined) add("warning", "no-title", 1, 'There is no "Title" column', "New products need a Title. This is fine only if the file updates products that already exist.");

  const g = (r, name) => (idx[name] === undefined ? "" : (r.cells[idx[name]] ?? ""));
  const groups = new Map();
  const order = [];
  const lastHandle = { v: null };
  const closed = new Set();
  let blank = 0;

  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri];
    summary.rows++;
    if (r.cells.every((c) => c.trim() === "")) { blank++; continue; }
    if (r.cells.length > header.length) add("error", "extra-cells", r.line, `Row has ${r.cells.length} cells but the header has ${header.length}`, "An unquoted comma in Tags, a title or a description pushed the following cells one column to the right. Quote the cell that contains the comma.");
    else if (r.cells.length < header.length) add("warning", "short-row", r.line, `Row has ${r.cells.length} cells but the header has ${header.length}`, "Missing trailing cells are read as blank. Check that no cell was lost.");
    const handleRaw = g(r, "Handle");
    const handle = handleRaw.trim();
    if (!handle) { add("error", "blank-handle", r.line, "Handle is blank", "Every row needs its product's Handle, including variant and extra-image rows. A blank Handle is where Excel fill-down was skipped."); continue; }
    if (lastHandle.v !== null && lastHandle.v !== handle && !closed.has(lastHandle.v)) closed.add(lastHandle.v);
    if (closed.has(handle)) add("warning", "split-product", r.line, `Rows for "${handle}" are not together`, `Rows for one product should be consecutive. Later rows for "${handle}" can be skipped or create a second product. Sort the file by Handle, keeping each product's first row first.`);
    lastHandle.v = handle;
    if (!groups.has(handle)) { groups.set(handle, []); order.push(handle); }
    groups.get(handle).push(r);
  }
  if (blank) add("info", "blank-rows", 0, `${blank} blank row${blank === 1 ? "" : "s"} skipped`, "Blank rows are harmless but usually mean a spreadsheet range was exported wider than the data.");

  const skuLines = new Map();
  for (const handle of order) {
    const rs = groups.get(handle);
    const first = rs[0];
    summary.products++;
    const line1 = first.line;
    if (handle.length > 255) add("error", "handle-length", line1, "Handle is longer than 255 characters", `"${handle.slice(0, 40)}…" is too long for Shopify.`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle)) add("warning", "handle-format", line1, `Handle "${handle}" is not in Shopify's lowercase-hyphen form`, `Shopify turns handles into URL slugs; this would become "${slugify(handle)}". If another row uses the slugified form, the two rows merge into one product.`);
    const title = g(first, "Title").trim();
    if (idx["Title"] !== undefined && !title) add("error", "title-blank", line1, `Product "${handle}" has no Title`, "The first row of a product needs a Title for a new product to be created.");
    if (title.length > 255) add("error", "title-length", line1, "Title is longer than 255 characters", "Shopify limits product titles to 255 characters.");
    for (const r of rs.slice(1)) {
      const t = g(r, "Title").trim();
      if (t && title && t !== title) add("info", "title-differs", r.line, `A later row for "${handle}" has a different Title`, "Only the first row's Title is used for the product. Delete the Title from variant and image rows to avoid confusion.");
    }
    const seo = g(first, "SEO Title"), seod = g(first, "SEO Description");
    if (seo.length > 70) add("info", "seo-title", line1, `SEO Title is ${seo.length} characters`, "Search results usually cut titles at around 60-70 characters.");
    if (seod.length > 320) add("info", "seo-description", line1, `SEO Description is ${seod.length} characters`, "Search results usually cut descriptions at 150-320 characters.");
    const tags = g(first, "Tags").split(",").map((s) => s.trim()).filter(Boolean);
    if (tags.length > 250) add("error", "tags-count", line1, `${tags.length} tags on "${handle}"`, "Shopify allows at most 250 tags per product.");
    if (tags.some((t) => t.length > 255)) add("warning", "tag-length", line1, "A tag is longer than 255 characters", "Shopify limits each tag to 255 characters. A comma missing between tags is the usual cause.");
    const body = g(first, "Body (HTML)");
    const bal = balance(body);
    if (bal.length) add("warning", "html-balance", line1, `Body (HTML) of "${handle}" has unbalanced tags`, `${bal.slice(0, 4).join("; ")}. Unclosed tags can break the layout of the whole product page.`);
    for (const col of ["Published", "Gift Card"]) {
      for (const r of rs) {
        const v = g(r, col).trim();
        if (v && !BOOL.has(v)) add("error", "boolean", r.line, `${col} is "${v}"`, `${col} must be TRUE or FALSE in capitals.`);
      }
    }
    const st = g(first, "Status").trim();
    if (st && !STATUS.has(st)) add("error", "status", line1, `Status is "${st}"`, "Status must be active, draft or archived in lowercase.");

    const combos = new Map();
    const positions = new Map(), srcs = new Map();
    let variants = 0, images = 0;
    const optNames = [g(first, "Option1 Name").trim(), g(first, "Option2 Name").trim(), g(first, "Option3 Name").trim()];
    rs.forEach((r, k) => {
      const vals = [1, 2, 3].map((n) => g(r, `Option${n} Value`).trim());
      const names = [1, 2, 3].map((n) => g(r, `Option${n} Name`).trim());
      [1, 2, 3].forEach((n) => {
        if (vals[n - 1] && !optNames[n - 1] && !names[n - 1]) add("error", "option-name", r.line, `Option${n} Value "${vals[n - 1]}" has no Option${n} Name`, `Put the option's name (for example Size) in Option${n} Name on the product's first row.`);
        if (k > 0 && names[n - 1] && optNames[n - 1] && names[n - 1] !== optNames[n - 1]) add("warning", "option-name-differs", r.line, `Option${n} Name "${names[n - 1]}" differs from the first row's "${optNames[n - 1]}"`, "Option names are taken from the first row. Leave later rows blank.");
        if (k === 0 && optNames[n - 1] && !vals[n - 1] && (g(r, "Variant Price").trim() || g(r, "Variant SKU").trim())) add("warning", "option-value-missing", r.line, `Option${n} Name is "${optNames[n - 1]}" but this variant has no value`, "Every variant needs a value for each option the product has.");
      });
      const hasVariant = k === 0 || vals.some(Boolean) || g(r, "Variant Price").trim() !== "" || g(r, "Variant SKU").trim() !== "";
      const imgSrc = g(r, "Image Src").trim();
      if (hasVariant) {
        variants++;
        const key = vals.join("␟");
        if (vals.some(Boolean)) {
          if (combos.has(key)) add("error", "dup-variant", r.line, `Variant "${vals.filter(Boolean).join(" / ")}" repeats line ${combos.get(key)}`, "Each option combination can appear once per product, otherwise Shopify rejects the second row.");
          else combos.set(key, r.line);
        } else if (k > 0 && !imgSrc) {
          add("warning", "empty-variant", r.line, "Row has no option values, price or image", "Extra rows should either describe a variant (option values and price) or an image (Image Src).");
        }
        const price = g(r, "Variant Price").trim();
        if (!price && (idx["Variant Price"] !== undefined)) add("warning", "price-blank", r.line, "Variant Price is blank", "Shopify may import this variant at 0.00 or reject it. Enter the price.");
        for (const col of PRICE_COLS) {
          const v = g(r, col).trim();
          if (!v) continue;
          if (!isNum(v)) {
            const cleaned = cleanPrice(v);
            add("error", "price-format", r.line, `${col} "${v}" is not a plain number`, isNum(cleaned) ? `Shopify wants digits and a decimal point only. Use ${cleaned}.` : "Shopify wants digits and a decimal point only, with no currency symbol or separators.");
          }
        }
        const cmp = cleanPrice(g(r, "Variant Compare At Price"));
        const pc = cleanPrice(price);
        if (isNum(pc) && isNum(cmp) && Number(cmp) !== 0 && Number(cmp) <= Number(pc)) add("warning", "compare-at", r.line, `Compare At Price ${cmp} is not above Price ${price}`, "A compare-at price at or below the price shows no sale badge, or a confusing one. Leave it blank if the item is not discounted.");
        const sku = g(r, "Variant SKU").trim();
        if (sku) {
          if (SCI.test(sku)) add("error", "sci-sku", r.line, `SKU "${sku}" is in scientific notation`, "Excel turned a long number into scientific notation and the original digits are gone. Format the column as Text and re-enter the SKUs.");
          if (!skuLines.has(sku)) skuLines.set(sku, []);
          skuLines.get(sku).push(r.line);
        }
        const bc = g(r, "Variant Barcode").trim();
        if (bc) {
          if (SCI.test(bc)) add("error", "sci-barcode", r.line, `Barcode "${bc}" is in scientific notation`, "Excel damaged this barcode and the original digits are gone. Format the column as Text and re-enter it.");
          else {
            const p = gtinProblem(bc);
            if (p) add("warning", "barcode", r.line, `Barcode ${bc}: ${p}`, "Shopify accepts any barcode text, but marketplaces and Google Shopping reject GTINs with a wrong check digit.");
          }
        }
        const grams = g(r, "Variant Grams").trim();
        if (grams) {
          if (!isNum(grams)) add("error", "grams", r.line, `Variant Grams "${grams}" is not a number`, "Weight is grams, digits only. Convert pounds or ounces first.");
          else if (!/^\d+$/.test(grams) && Number(grams) < 5) add("warning", "grams-kg", r.line, `Variant Grams ${grams} looks like kilograms`, "This column is grams; 0.5 here would be half a gram.");
        }
        const unit = g(r, "Variant Weight Unit").trim();
        if (unit && !UNITS.has(unit)) add("error", "weight-unit", r.line, `Variant Weight Unit "${unit}"`, "Use g, kg, lb or oz in lowercase.");
        const tracker = g(r, "Variant Inventory Tracker").trim();
        if (tracker && tracker !== "shopify") add("error", "tracker", r.line, `Variant Inventory Tracker "${tracker}"`, 'Leave it blank, or use "shopify" in lowercase.');
        const qty = g(r, "Variant Inventory Qty").trim();
        if (qty) {
          if (!/^-?\d+$/.test(qty)) add("error", "qty", r.line, `Variant Inventory Qty "${qty}" is not a whole number`, "Use whole numbers only.");
          else if (!tracker) add("warning", "qty-untracked", r.line, `Quantity ${qty} is set but the Inventory Tracker is blank`, 'Shopify only stores a quantity for tracked variants. Set Variant Inventory Tracker to "shopify".');
        }
        const pol = g(r, "Variant Inventory Policy").trim();
        if (pol && !["deny", "continue"].includes(pol)) add("error", "policy", r.line, `Variant Inventory Policy "${pol}"`, 'Use "deny" (stop selling at zero) or "continue" (allow overselling), lowercase.');
        const ful = g(r, "Variant Fulfillment Service").trim();
        if (ful && ful !== "manual" && !/^[a-z0-9-]+$/.test(ful)) add("warning", "fulfillment", r.line, `Variant Fulfillment Service "${ful}"`, 'Usually "manual", or the lowercase handle of a fulfilment app.');
        for (const col of ["Variant Requires Shipping", "Variant Taxable"]) {
          const v = g(r, col).trim();
          if (v && !BOOL.has(v)) add("error", "boolean", r.line, `${col} is "${v}"`, `${col} must be TRUE or FALSE in capitals.`);
        }
      }
      if (imgSrc) {
        images++;
        if (/\s/.test(imgSrc)) add("error", "image-space", r.line, "Image Src contains a space", "Shopify downloads the URL as written. Replace spaces with %20.");
        else if (!/^https?:\/\/[^\s/]+\S*$/i.test(imgSrc)) add("error", "image-url", r.line, `Image Src "${imgSrc.slice(0, 60)}" is not a web address`, "Image Src must be a public http(s) URL that Shopify can fetch. A file name or local path will not import.");
        else if (!/\.(jpe?g|png|gif|webp|avif|heic|bmp|tiff?)(\?|#|$)/i.test(imgSrc) && !/[?&]format=|\/cdn\//i.test(imgSrc)) add("info", "image-ext", r.line, "Image Src has no recognisable image extension", "Fine for CDN links without extensions; otherwise check that the URL is the image and not a web page.");
        if (srcs.has(imgSrc)) add("warning", "image-dup", r.line, `Image repeats line ${srcs.get(imgSrc)}`, "The same URL twice in one product imports two copies.");
        else srcs.set(imgSrc, r.line);
        const pos = g(r, "Image Position").trim();
        if (pos) {
          if (!/^[1-9]\d*$/.test(pos)) add("error", "image-pos", r.line, `Image Position "${pos}"`, "Image Position is a whole number starting at 1.");
          else if (positions.has(pos)) add("warning", "image-pos-dup", r.line, `Image Position ${pos} repeats line ${positions.get(pos)}`, "Two images at one position are ordered unpredictably.");
          else positions.set(pos, r.line);
        }
      } else if (g(r, "Image Position").trim() || g(r, "Image Alt Text").trim()) {
        add("warning", "image-orphan", r.line, "Image Position or Alt Text without an Image Src", "Nothing to attach it to; it is ignored.");
      }
    });
    summary.variants += variants;
    summary.images += images;
    if (variants > 100) add("warning", "variant-count", line1, `"${handle}" has ${variants} variants`, "Older Shopify limits were 100 variants per product. Current plans allow more, but check yours and consider splitting.");
    summary.groups.push({ handle, line: line1, title, variants, images });
  }
  for (const [sku, lines] of skuLines) {
    if (lines.length > 1) add("warning", "dup-sku", lines[1], `SKU "${sku}" is used on ${lines.length} variants`, `Lines ${lines.join(", ")}. Shopify allows duplicate SKUs, but inventory and order exports then cannot tell them apart.`);
  }
  findings.sort((a, b) => (SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity)) || (a.line - b.line));
  return { findings, summary };
}

// Safe fixes only: things with exactly one reasonable reading. Never edits titles,
// descriptions, SKUs, barcodes, quantities, or image URLs.
export function repair(input) {
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const changes = [];
  if (!text.trim()) return { text: "", changes, error: "The file is empty." };
  const firstLine = text.split("\n", 1)[0];
  let delim = ",";
  if (!firstLine.includes(",") && firstLine.includes(";")) delim = ";";
  else if (!firstLine.includes(",") && firstLine.includes("\t")) delim = "\t";
  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) return { text: "", changes, error: `A quote opened on line ${parsed.unterminated} is never closed; fix that first.` };
  const rows = parsed.rows.map((r) => r.cells.slice());
  const head = rows[0].map((h) => h.trim());
  const col = (name) => head.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  if (col("Handle") < 0) return { text: "", changes, error: 'There is no "Handle" column; nothing can be repaired.' };
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
  const hc = col("Handle");
  const slugMap = new Map(), rev = new Map();
  let slugOk = true;
  for (let ri = 1; ri < rows.length; ri++) {
    const h = (rows[ri][hc] ?? "").trim();
    if (!h) continue;
    const s = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(h) ? h : slugify(h);
    if (!s) { slugOk = false; continue; }
    if (rev.has(s) && rev.get(s) !== h) slugOk = false;
    rev.set(s, h); slugMap.set(h, s);
  }
  const lowerCols = ["Variant Inventory Tracker", "Variant Inventory Policy", "Variant Weight Unit", "Status"].map(col);
  const boolCols = ["Published", "Gift Card", "Variant Requires Shipping", "Variant Taxable"].map(col);
  const priceCols = PRICE_COLS.map(col);
  const trimCols = ["Variant SKU", "Variant Barcode", "Image Src", "Option1 Value", "Option2 Value", "Option3 Value"].map(col);
  for (let ri = 1; ri < rows.length; ri++) {
    if (rows[ri].every((c) => c.trim() === "")) continue;
    if (slugOk && rows[ri][hc] !== undefined) {
      const raw = rows[ri][hc].trim();
      if (slugMap.has(raw) && slugMap.get(raw) !== rows[ri][hc]) edit(ri, hc, slugMap.get(raw), "handle in Shopify's lowercase-hyphen form");
    } else if (rows[ri][hc] !== undefined && rows[ri][hc] !== rows[ri][hc].trim()) edit(ri, hc, rows[ri][hc].trim(), "stray spaces");
    for (const ci of lowerCols) if (ci >= 0 && rows[ri][ci] !== undefined && rows[ri][ci].trim() && rows[ri][ci] !== rows[ri][ci].trim().toLowerCase()) edit(ri, ci, rows[ri][ci].trim().toLowerCase(), "lowercase as Shopify expects");
    for (const ci of boolCols) if (ci >= 0 && rows[ri][ci] !== undefined && /^(true|false)$/i.test(rows[ri][ci].trim()) && rows[ri][ci] !== rows[ri][ci].trim().toUpperCase()) edit(ri, ci, rows[ri][ci].trim().toUpperCase(), "TRUE/FALSE in capitals");
    for (const ci of priceCols) {
      if (ci < 0 || rows[ri][ci] === undefined) continue;
      const v = rows[ri][ci].trim();
      if (v && !isNum(v)) { const c = cleanPrice(v); if (isNum(c)) edit(ri, ci, c, "plain number"); }
    }
    for (const ci of trimCols) if (ci >= 0 && rows[ri][ci] !== undefined && rows[ri][ci] !== rows[ri][ci].trim()) edit(ri, ci, rows[ri][ci].trim(), "stray spaces");
  }
  return { text: toCsv(rows), changes, error: null };
}

export function findingsCsv(result) {
  return toCsv([["severity", "line", "code", "title", "detail"], ...result.findings.map((f) => [f.severity, String(f.line || ""), f.code, f.title, f.detail])]);
}

const H = COLUMNS;
function build(rows) { return toCsv([H, ...rows.map((o) => H.map((h) => o[h] ?? ""))]); }
const base = (o) => ({ "Published": "TRUE", "Variant Inventory Tracker": "shopify", "Variant Inventory Policy": "deny", "Variant Fulfillment Service": "manual", "Variant Requires Shipping": "TRUE", "Variant Taxable": "TRUE", "Variant Weight Unit": "g", "Status": "active", ...o });

export function sampleFile() {
  return build([
    base({ Handle: "canvas-tote-bag", Title: "Canvas Tote Bag", "Body (HTML)": "<p>Heavy cotton canvas, <strong>natural</strong>.</p>", Vendor: "Harbor Goods", Type: "Bags", Tags: "bags, totes, cotton", "Option1 Name": "Color", "Option1 Value": "Natural", "Variant SKU": "TOTE-NAT", "Variant Grams": "320", "Variant Inventory Qty": "40", "Variant Price": "24.00", "Variant Compare At Price": "30.00", "Variant Barcode": "036000291452", "Image Src": "https://cdn.example.com/tote-natural.jpg", "Image Position": "1", "Image Alt Text": "Natural tote bag" }),
    base({ Handle: "canvas-tote-bag", "Option1 Value": "Black", "Variant SKU": "TOTE-BLK", "Variant Grams": "320", "Variant Inventory Qty": "25", "Variant Price": "24.00", "Image Src": "https://cdn.example.com/tote-black.jpg", "Image Position": "2" }),
    base({ Handle: "enamel-mug", Title: "Enamel Mug", "Body (HTML)": "<p>350 ml.</p>", Vendor: "Harbor Goods", Type: "Kitchen", Tags: "mugs", "Option1 Name": "Title", "Option1 Value": "Default Title", "Variant SKU": "MUG-01", "Variant Grams": "210", "Variant Inventory Qty": "60", "Variant Price": "14.50", "Image Src": "https://cdn.example.com/mug.png", "Image Position": "1" }),
  ]);
}

export function sampleBrokenFile() {
  return build([
    base({ Handle: "Canvas Tote Bag", Title: "Canvas Tote Bag", "Body (HTML)": "<div><p>Heavy cotton canvas.</div>", Vendor: "Harbor Goods", Tags: "bags, totes", "Option1 Name": "Color", "Option1 Value": "Natural", "Variant SKU": "TOTE-NAT", "Variant Grams": "320", "Variant Inventory Qty": "40", "Variant Price": "$24.00", "Variant Compare At Price": "19.00", "Variant Barcode": "036000291453", "Image Src": "https://cdn.example.com/tote natural.jpg", "Image Position": "1", Published: "true" }),
    base({ Handle: "Canvas Tote Bag", "Option1 Value": "Natural", "Variant SKU": "TOTE-NAT", "Variant Grams": "320", "Variant Inventory Qty": "25", "Variant Price": "24,00" }),
    base({ Handle: "enamel-mug", Title: "", "Variant SKU": "1.23457E+12", "Variant Inventory Tracker": "", "Variant Inventory Qty": "60", "Variant Price": "14.50", "Image Src": "enamel-mug.png", "Image Position": "1" }),
    base({ Handle: "Canvas Tote Bag", "Option1 Value": "Red", "Variant Price": "24.00" }),
  ]);
}
