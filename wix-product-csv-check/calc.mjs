// Wix Stores product CSV checker. Pure functions, no DOM, no network.
// Column names and limits are read from memory of Wix's public product import/export
// documentation; no Wix import was available when this was built.

const OPTION_SLOTS = [1, 2, 3, 4, 5, 6];
export const COLUMNS = [
  "handleId", "fieldType", "name", "description", "productImageUrl", "collection", "sku", "ribbon",
  "price", "surcharge", "visible", "discountMode", "discountValue", "inventory", "weight", "cost",
  ...OPTION_SLOTS.flatMap((n) => [`productOptionName${n}`, `productOptionType${n}`, `productOptionDescription${n}`]),
  "additionalInfoTitle1", "additionalInfoDescription1", "additionalInfoTitle2", "additionalInfoDescription2",
  "customTextField1", "customTextCharLimit1", "customTextMandatory1", "brand",
];
const canon = (h) => h.trim().toLowerCase().replace(/[\s_]+/g, "");
const LOWER = new Map(COLUMNS.map((c) => [canon(c), c]));
export const SEVERITIES = ["error", "warning", "info"];
export const LIMITS = { name: 80, ribbon: 30, options: 6, variants: 1000 };
export const OPTION_TYPES = ["DROP_DOWN", "COLOR"];
export const DISCOUNT_MODES = ["PERCENT", "AMOUNT"];

const SCI = /^\d(\.\d+)?e\+?\d+$/i;
const isNum = (v) => /^\d+(\.\d+)?$/.test(v);
const splitSemi = (v) => v.split(";").map((x) => x.trim());
const IMG = /^https?:\/\/\S+$/i;

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
  const n = canon(name).replace(/[^a-z0-9]/g, "");
  let best = null, bestD = 99;
  for (const c of COLUMNS) {
    const d = distance(n, c.toLowerCase());
    if (d < bestD) { bestD = d; best = c; }
  }
  return bestD <= Math.max(2, Math.floor(n.length / 4)) ? best : null;
}

export function cleanPrice(v) {
  let s = v.trim().replace(/^[$€£¥]\s*/, "").replace(/\s*(USD|EUR|GBP|CAD|AUD)$/i, "");
  if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  return s;
}

function detectDelim(text) {
  const firstLine = text.split("\n", 1)[0];
  const count = (c) => firstLine.split(c).length - 1;
  if (count(",") === 0 && count(";") > 0) return ";";
  if (count(",") === 0 && count("\t") > 0) return "\t";
  return ",";
}

const BOOL = /^(TRUE|FALSE)$/;
const trunc = (s, n = 40) => (s.length > n ? s.slice(0, n) + "…" : s);

export function validate(input) {
  const findings = [];
  const add = (severity, code, line, title, detail) => findings.push({ severity, code, line, title, detail });
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const summary = { rows: 0, products: 0, variants: 0, columns: 0, delimiter: ",", groups: [] };
  if (!text.trim()) { add("error", "empty", 0, "The file is empty", "Paste or choose a Wix Stores product CSV."); return { findings, summary }; }

  if (text.includes("�")) add("warning", "encoding", 0, "The file contains replacement characters", "Characters such as � mean the file was saved in a legacy encoding and read as UTF-8. Re-export as CSV UTF-8 or accents and symbols in product names will import damaged.");
  if (/Ã[\u0080-¿]|â€[™œ"˜]/.test(text)) add("warning", "mojibake", 0, "Text looks double-encoded", "Sequences like Ã© or â€™ usually mean UTF-8 was saved as Windows-1252 and re-read. Fix the encoding before importing.");

  const delim = detectDelim(text);
  summary.delimiter = delim;
  if (delim !== ",") add("error", "delimiter", 1, `The file is ${delim === ";" ? "semicolon" : "tab"}-separated`, 'Wix reads a comma-separated file. Excel in many European locales saves CSV with semicolons. Re-save as "CSV UTF-8 (Comma delimited)" or use "Apply safe fixes" below.');

  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) {
    add("error", "quote", parsed.unterminated, "A quoted cell is never closed", `A cell opened with a double quote on line ${parsed.unterminated} has no closing quote, so everything after it is read as one cell. An unescaped quote inside a description is the usual cause: inside a quoted cell a literal quote must be doubled ("").`);
    return { findings, summary };
  }
  const rows = parsed.rows;
  const header = rows[0].cells.map((h) => h.trim());
  summary.columns = header.length;
  const idx = {};
  header.forEach((h, i) => {
    const fixed = LOWER.get(canon(h));
    if (fixed) {
      if (idx[fixed] !== undefined) add("error", "dup-header", 1, `Column "${fixed}" appears twice`, `Columns ${idx[fixed] + 1} and ${i + 1} are both "${fixed}". Wix maps only one of them; delete the other.`);
      else idx[fixed] = i;
      if (h !== fixed) add("warning", "header-case", 1, `Column "${h}" is not spelled like the export`, `Use "${fixed}" exactly, with that capitalisation.`);
    } else if (h !== "") {
      const near = closestColumn(h);
      add("warning", "unknown-header", 1, `Unknown column "${h}"`, near ? `Did you mean "${near}"? Wix skips columns it does not recognise, so this data would not import.` : "Wix skips columns it does not recognise, so this data would not import.");
    }
    if (h === "") add("warning", "blank-header", 1, `Column ${i + 1} has no name`, "An unnamed column is ignored. Often a stray trailing comma.");
  });
  for (const need of ["handleId", "fieldType", "name", "price"]) if (idx[need] === undefined) add("error", "missing-column", 1, `There is no ${need} column`, `Wix needs ${need} to build the catalogue.`);
  if (idx.handleId === undefined || idx.fieldType === undefined) return { findings, summary };

  const g = (r, name) => (idx[name] === undefined ? "" : (r.cells[idx[name]] ?? ""));
  const data = [];
  let blank = 0;
  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri];
    summary.rows++;
    if (r.cells.every((c) => c.trim() === "")) { blank++; continue; }
    if (r.cells.length > header.length) add("error", "extra-cells", r.line, `Row has ${r.cells.length} cells but the header has ${header.length}`, "An unquoted comma in a name or description pushed the following cells one column to the right. Quote the cell that contains the comma.");
    else if (r.cells.length < header.length) add("warning", "short-row", r.line, `Row has ${r.cells.length} cells but the header has ${header.length}`, "Missing trailing cells are read as blank. Check that no cell was lost.");
    data.push(r);
  }
  if (blank) add("info", "blank-rows", 0, `${blank} blank row${blank === 1 ? "" : "s"} skipped`, "Blank rows are harmless but usually mean a spreadsheet range was exported wider than the data.");

  // Products: handleId -> { line, name, price, options: [{name,type,choices:Set}], variants }
  const products = new Map();
  const skus = new Map();
  for (const r of data) {
    const sku = g(r, "sku").trim();
    if (sku) { if (!skus.has(sku)) skus.set(sku, []); skus.get(sku).push(r.line); }
  }

  for (const r of data) {
    const L = r.line;
    const handle = g(r, "handleId").trim();
    const ftRaw = g(r, "fieldType").trim();
    const ft = ftRaw.toLowerCase() === "product" ? "Product" : ftRaw.toLowerCase() === "variant" ? "Variant" : ftRaw;

    if (!handle) add("error", "handle-blank", L, "Row has no handleId", "handleId ties a Variant row to its Product row. Every row needs one.");
    if (ft !== "Product" && ft !== "Variant") {
      add("error", "field-type", L, ftRaw ? `fieldType "${ftRaw}" is not Product or Variant` : "Row has no fieldType", "Each row is either a Product row or a Variant row of the product with the same handleId.");
      continue;
    }
    if (ftRaw !== ft) add("warning", "field-type-case", L, `fieldType "${ftRaw}" is not capitalised like the export`, `Use "${ft}".`);

    const sku = g(r, "sku").trim();
    if (sku) {
      if (SCI.test(sku)) add("error", "sci-sku", L, `sku "${sku}" is in scientific notation`, "Excel turned a long number into scientific notation and the original digits are gone. Format the column as Text and re-enter the SKUs.");
      if (skus.get(sku).length > 1 && skus.get(sku)[0] !== L) add("warning", "dup-sku", L, `sku "${sku}" repeats line ${skus.get(sku)[0]}`, "Two products or variants with one SKU make inventory and order exports ambiguous.");
    }

    const price = g(r, "price").trim();
    if (price && !isNum(price)) { const c = cleanPrice(price); add("error", "price-format", L, `price "${price}" is not a plain number`, isNum(c) ? `Wix wants digits and a decimal point only. Use ${c}.` : "Wix wants digits and a decimal point only, with no currency symbol, thousands separator or text. The store currency is set in Wix, not in the file."); }
    const wt = g(r, "weight").trim();
    if (wt && !isNum(wt)) add("error", "weight", L, `weight "${wt}" is not a number`, "Use digits and a decimal point only; the unit is set in your Wix store settings.");
    const cost = g(r, "cost").trim();
    if (cost && !isNum(cost)) add("warning", "cost", L, `cost "${cost}" is not a plain number`, "Use digits and a decimal point only.");

    const vis = g(r, "visible").trim();
    if (vis && !BOOL.test(vis)) add(BOOL.test(vis.toUpperCase()) ? "warning" : "error", "visible", L, `visible "${vis}" is not TRUE or FALSE`, BOOL.test(vis.toUpperCase()) ? `Use ${vis.toUpperCase()}.` : "Use TRUE or FALSE. Yes, 1 and 0 are not read.");

    const inv = g(r, "inventory").trim();
    if (inv) {
      if (!/^(InStock|OutOfStock|\d+)$/.test(inv)) {
        const fix = /^instock$/i.test(inv) ? "InStock" : /^outofstock$/i.test(inv) ? "OutOfStock" : null;
        add(fix ? "warning" : "error", "inventory", L, `inventory "${inv}" is not InStock, OutOfStock or a whole number`, fix ? `Use ${fix}.` : /^\d+\.\d+$/.test(inv) ? "Stock counts are whole units." : "Use InStock, OutOfStock, or the number of units to track.");
      }
    }

    const dm = g(r, "discountMode").trim(), dv = g(r, "discountValue").trim();
    if (dm && !DISCOUNT_MODES.includes(dm)) add(DISCOUNT_MODES.includes(dm.toUpperCase()) ? "warning" : "error", "discount-mode", L, `discountMode "${dm}" is not PERCENT or AMOUNT`, DISCOUNT_MODES.includes(dm.toUpperCase()) ? `Use ${dm.toUpperCase()}.` : "Use PERCENT or AMOUNT.");
    if (dv && !isNum(dv)) add("error", "discount-value", L, `discountValue "${dv}" is not a plain number`, "Use digits and a decimal point only, with no % or currency sign.");
    else if (dv && !dm) add("warning", "discount-orphan", L, "discountValue is set but discountMode is blank", "Without PERCENT or AMOUNT the discount is ignored.");
    else if (dv && dm.toUpperCase() === "PERCENT" && Number(dv) > 100) add("error", "discount-percent", L, `A ${dv}% discount is above 100`, "A percent discount cannot exceed 100.");
    if (dm && !dv) add("warning", "discount-blank", L, "discountMode is set but discountValue is blank", "A mode with no value does nothing.");

    const imgs = g(r, "productImageUrl").trim();
    if (imgs) for (const u of splitSemi(imgs).filter(Boolean)) {
      if (!/^https?:\/\//i.test(u)) add("error", "image-url", L, `Image "${trunc(u, 50)}" is not a web address`, "Wix fetches images from a public https:// address; several are separated by semicolons. A file name or local path cannot be fetched.");
      else if (!IMG.test(u)) add("warning", "image-url", L, `Image "${trunc(u, 50)}" looks malformed`, "Check for spaces inside the address.");
      else if (/^http:\/\//i.test(u)) add("info", "image-http", L, "An image uses http, not https", "Some hosts redirect; use https where you can.");
    }

    const optionsHere = [];
    for (const n of OPTION_SLOTS) {
      const nm = g(r, `productOptionName${n}`).trim(), ty = g(r, `productOptionType${n}`).trim(), ds = g(r, `productOptionDescription${n}`).trim();
      if (nm || ty || ds) optionsHere.push({ n, nm, ty, ds });
    }

    if (ft === "Product") {
      summary.products++;
      const name = g(r, "name").trim();
      if (handle && products.has(handle)) add("error", "dup-handle", L, `Product handleId "${handle}" repeats line ${products.get(handle).line}`, "Two Product rows with one handleId are merged or rejected. Variants belong on Variant rows.");
      const label = name ? `"${trunc(name)}"` : "this product";
      if (!name) add("error", "name-blank", L, "Product row has no name", "Wix cannot create a product without a name.");
      else {
        if (name.length > LIMITS.name) add("error", "name-length", L, `name is ${name.length} characters`, `Wix product names stop at ${LIMITS.name} characters (from memory). The import rejects the row or cuts the end off.`);
        if (name.length > 12 && name === name.toUpperCase() && /[A-Z]/.test(name)) add("info", "name-caps", L, "name is all capitals", "All-capital product names read badly in search results and on the page.");
      }
      if (idx.price !== undefined && !price) add("error", "price-blank", L, `${label} has no price`, "A Product row needs a price; Variant rows can add a surcharge.");
      if (g(r, "ribbon").length > LIMITS.ribbon) add("warning", "ribbon-length", L, `ribbon is ${g(r, "ribbon").length} characters`, `Ribbons are short badges, ${LIMITS.ribbon} characters at most (from memory).`);
      if (idx.description !== undefined && !g(r, "description").trim()) add("info", "description-blank", L, `${label} has no description`, "A product without a description converts poorly and ranks worse in search.");
      if (idx.productImageUrl !== undefined && !imgs) add("info", "no-images", L, `${label} has no image`, "Wix shows a placeholder.");
      const coll = g(r, "collection").trim();
      if (coll && coll.includes(",") && !coll.includes(";")) add("info", "collection-separator", L, "collection contains commas", "Several collections are separated by semicolons. A comma is read as part of one collection's name.");
      if (g(r, "surcharge").trim()) add("warning", "surcharge-on-product", L, "surcharge is set on a Product row", "A surcharge adjusts the price of a variant. On a Product row it is ignored.");

      const defs = [];
      const seenNames = new Set();
      for (const o of optionsHere) {
        if (!o.nm) add("error", "option-name", L, `productOptionDescription${o.n} or Type is set but productOptionName${o.n} is blank`, "Name the option (for example Size or Color) so shoppers can see what the choices are.");
        else if (seenNames.has(o.nm.toLowerCase())) add("error", "option-dup-name", L, `Option name "${o.nm}" is used twice`, "Each option on a product needs a different name.");
        seenNames.add(o.nm.toLowerCase());
        if (!o.ty) add("error", "option-type-blank", L, `Option "${o.nm || o.n}" has no productOptionType${o.n}`, "Use DROP_DOWN or COLOR.");
        else if (!OPTION_TYPES.includes(o.ty)) add(OPTION_TYPES.includes(o.ty.toUpperCase().replace(/[\s-]+/g, "_")) ? "warning" : "error", "option-type", L, `productOptionType${o.n} "${o.ty}" is not DROP_DOWN or COLOR`, OPTION_TYPES.includes(o.ty.toUpperCase().replace(/[\s-]+/g, "_")) ? `Use ${o.ty.toUpperCase().replace(/[\s-]+/g, "_")}.` : "Use DROP_DOWN or COLOR.");
        if (!o.ds) add("error", "option-values", L, `Option "${o.nm || o.n}" has no choices`, `Put the choices in productOptionDescription${o.n}, separated by semicolons.`);
        const list = splitSemi(o.ds);
        if (o.ds && list.some((x) => x === "")) add("warning", "option-empty", L, `Option "${o.nm}" has an empty choice`, "Two semicolons in a row or a trailing semicolon leaves an empty choice.");
        if (o.ds && !o.ds.includes(";") && o.ds.includes(",")) add("warning", "option-comma", L, `Option "${o.nm}" choices are separated by commas`, "Wix reads choices separated by semicolons, so this is one choice with commas in its name.");
        const seen = new Set();
        for (const v of list.filter(Boolean)) { const k = v.toLowerCase(); if (seen.has(k)) add("error", "option-dup-choice", L, `Option "${o.nm}" choice "${v}" is listed twice`, "Each choice must be unique within its option."); seen.add(k); }
        defs.push({ n: o.n, name: o.nm, type: o.ty, choices: new Set(list.filter(Boolean).map((x) => x.toLowerCase())) });
      }
      if (handle) products.set(handle, { line: L, name, price, defs, variants: 0, combos: new Set() });
      summary.groups.push({ handle: name || handle, line: L, title: price, variants: 0, images: imgs ? splitSemi(imgs).filter(Boolean).length : 0, key: handle });
    } else {
      summary.variants++;
      const p = products.get(handle);
      if (!p) {
        add("error", "orphan-variant", L, `Variant row's handleId "${handle}" has no Product row above it`, "Put the Product row first, then its Variant rows, all with the same handleId. A variant with no product is dropped.");
        continue;
      }
      p.variants++;
      if (p.variants > LIMITS.variants) add("error", "variant-count", L, `Product "${trunc(p.name)}" has more than ${LIMITS.variants} variants`, `Wix allows up to ${LIMITS.variants} variants per product (from memory).`);
      if (g(r, "name").trim()) add("info", "variant-name", L, "A Variant row has a name", "Wix takes the name from the Product row; a name on a Variant row is ignored.");
      if (idx.price !== undefined && price) add("info", "variant-price", L, "A Variant row has a price", "Use surcharge on a Variant row to add to or subtract from the product price. A price here is ignored.");
      const sc = g(r, "surcharge").trim();
      if (sc && !/^-?\d+(\.\d+)?$/.test(sc)) { const c = cleanPrice(sc); add("error", "surcharge-format", L, `surcharge "${sc}" is not a plain number`, /^-?\d+(\.\d+)?$/.test(c) ? `Use ${c}.` : "Use digits and a decimal point only, with a minus sign for a reduction."); }
      const combo = [];
      for (const d of p.defs) {
        const v = g(r, `productOptionDescription${d.n}`).trim();
        const n = g(r, `productOptionName${d.n}`).trim();
        if (!v) { add("error", "variant-choice-blank", L, `Variant has no choice for option "${d.name}"`, `Fill productOptionDescription${d.n} with one of: ${[...d.choices].slice(0, 6).join(", ")}.`); continue; }
        if (n && d.name && n.toLowerCase() !== d.name.toLowerCase()) add("warning", "variant-option-name", L, `Option ${d.n} is "${n}" here but "${d.name}" on the product`, "Option names must match the Product row.");
        if (v.includes(";")) add("error", "variant-multi", L, `Variant lists several choices for "${d.name}"`, "A Variant row carries exactly one choice per option; give each combination its own row.");
        else if (!d.choices.has(v.toLowerCase())) add("error", "variant-unknown-choice", L, `"${v}" is not a choice of option "${d.name}"`, `The Product row on line ${p.line} lists: ${[...d.choices].join(", ")}. A variant with an unlisted choice is dropped or creates a stray option.`);
        combo.push(v.toLowerCase());
      }
      for (const n of OPTION_SLOTS) if (!p.defs.some((d) => d.n === n) && g(r, `productOptionDescription${n}`).trim()) add("warning", "variant-extra-option", L, `Variant fills option ${n}, which the product does not define`, "The extra choice is ignored.");
      const key = combo.join("|");
      if (combo.length && p.combos.has(key)) add("error", "dup-variant", L, `This combination (${combo.join(" / ")}) repeats another variant`, "Each combination of choices can appear once per product.");
      p.combos.add(key);
    }
  }
  for (const grp of summary.groups) grp.variants = products.get(grp.key)?.variants ?? 0;
  for (const p of products.values()) if (p.defs.length && !p.variants) add("warning", "no-variants", p.line, `Product "${trunc(p.name)}" defines options but has no Variant rows`, "Add a Variant row for each combination you sell; otherwise shoppers see the option but nothing to buy.");
  findings.sort((a, b) => (SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity)) || (a.line - b.line));
  return { findings, summary };
}

// Safe fixes only: things with exactly one reasonable reading. Never edits a name,
// description, image address, collection, option choice, SKU or handleId.
export function repair(input) {
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const changes = [];
  if (!text.trim()) return { text: "", changes, error: "The file is empty." };
  const delim = detectDelim(text);
  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) return { text: "", changes, error: `A quote opened on line ${parsed.unterminated} is never closed; fix that first.` };
  const rows = parsed.rows.map((r) => r.cells.slice());
  if (delim !== ",") changes.push(`Converted the ${delim === ";" ? "semicolon" : "tab"} delimiter to commas.`);
  rows[0].forEach((h, i) => {
    const c = LOWER.get(canon(h));
    if (c && h !== c) { changes.push(`Header "${h}" renamed to "${c}".`); rows[0][i] = c; }
  });
  const head = rows[0].map((h) => h.trim());
  const col = (n) => head.indexOf(n);
  const edit = (ri, ci, to, why) => {
    const from = rows[ri][ci];
    if (from === to) return;
    rows[ri][ci] = to;
    changes.push(`Line ${parsed.rows[ri].line}, ${head[ci]}: "${from}" → "${to}" (${why}).`);
  };
  const ft = col("fieldType"), price = col("price"), sur = col("surcharge"), vis = col("visible"), dm = col("discountMode"), inv = col("inventory"), sku = col("sku");
  const types = OPTION_SLOTS.map((n) => col(`productOptionType${n}`));
  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri];
    if (r.every((c) => c.trim() === "")) continue;
    if (ft >= 0 && r[ft] !== undefined && /^(product|variant)$/i.test(r[ft].trim())) edit(ri, ft, r[ft].trim()[0].toUpperCase() + r[ft].trim().slice(1).toLowerCase(), "Product or Variant");
    if (price >= 0 && r[price] !== undefined) { const v = r[price].trim(); if (v && !isNum(v)) { const c = cleanPrice(v); if (isNum(c)) edit(ri, price, c, "plain number"); } }
    if (sur >= 0 && r[sur] !== undefined) { const v = r[sur].trim(); if (v && !/^-?\d+(\.\d+)?$/.test(v)) { const c = cleanPrice(v); if (/^-?\d+(\.\d+)?$/.test(c)) edit(ri, sur, c, "plain number"); } }
    if (vis >= 0 && r[vis] !== undefined && /^(true|false)$/i.test(r[vis].trim())) edit(ri, vis, r[vis].trim().toUpperCase(), "TRUE or FALSE");
    if (dm >= 0 && r[dm] !== undefined && /^(percent|amount)$/i.test(r[dm].trim())) edit(ri, dm, r[dm].trim().toUpperCase(), "PERCENT or AMOUNT");
    if (inv >= 0 && r[inv] !== undefined) { const v = r[inv].trim(); if (/^instock$/i.test(v)) edit(ri, inv, "InStock", "Wix spelling"); else if (/^outofstock$/i.test(v)) edit(ri, inv, "OutOfStock", "Wix spelling"); }
    for (const ci of types) if (ci >= 0 && r[ci] !== undefined) { const v = r[ci].trim().toUpperCase().replace(/[\s-]+/g, "_"); if (OPTION_TYPES.includes(v)) edit(ri, ci, v, "DROP_DOWN or COLOR"); }
    if (sku >= 0 && r[sku] !== undefined && r[sku] !== r[sku].trim()) edit(ri, sku, r[sku].trim(), "stray spaces");
  }
  return { text: toCsv(rows), changes, error: null };
}

export function findingsCsv(result) {
  return toCsv([["severity", "line", "code", "title", "detail"], ...result.findings.map((f) => [f.severity, String(f.line || ""), f.code, f.title, f.detail])]);
}

const build = (rows) => toCsv([COLUMNS, ...rows.map((o) => COLUMNS.map((h) => o[h] ?? ""))]);
const img = (n) => `https://example.com/photos/${n}.jpg`;

export function sampleFile() {
  return build([
    { handleId: "linen-shirt", fieldType: "Product", name: "Linen Shirt", description: "Relaxed fit, washed linen.", productImageUrl: `${img("shirt-1")};${img("shirt-2")}`, collection: "Shirts", sku: "SHIRT", ribbon: "New", price: "64.00", visible: "TRUE", inventory: "InStock", weight: "0.4", productOptionName1: "Size", productOptionType1: "DROP_DOWN", productOptionDescription1: "S;M;L", productOptionName2: "Color", productOptionType2: "COLOR", productOptionDescription2: "Sand;Navy" },
    ...["S", "M", "L"].flatMap((s) => ["Sand", "Navy"].map((c) => ({ handleId: "linen-shirt", fieldType: "Variant", sku: `SHIRT-${s}-${c.slice(0, 2).toUpperCase()}`, surcharge: s === "L" ? "4.00" : "", visible: "TRUE", inventory: "12", productOptionName1: "Size", productOptionDescription1: s, productOptionName2: "Color", productOptionDescription2: c }))),
    { handleId: "tote-bag", fieldType: "Product", name: "Canvas Tote Bag", description: "Heavy cotton canvas.", productImageUrl: img("tote-1"), collection: "Bags", sku: "TOTE", price: "22.00", visible: "TRUE", inventory: "InStock", discountMode: "PERCENT", discountValue: "10" },
  ]);
}

export function sampleBrokenFile() {
  return build([
    { handleId: "linen-shirt", fieldType: "product", name: "LINEN SHIRT WITH A VERY LONG NAME THAT KEEPS GOING PAST THE LIMIT FOR PRODUCT NAMES IN THE STORE", description: "Relaxed fit.", productImageUrl: "shirt-1.jpg", sku: "1.23457E+12", price: "$64.00", visible: "yes", inventory: "In stock", productOptionName1: "Size", productOptionType1: "Drop down", productOptionDescription1: "S;M;L;M" },
    { handleId: "linen-shirt", fieldType: "Variant", sku: "SHIRT-S", surcharge: "$4", productOptionName1: "Size", productOptionDescription1: "S" },
    { handleId: "linen-shirt", fieldType: "Variant", sku: "SHIRT-XL", productOptionName1: "Size", productOptionDescription1: "XL" },
    { handleId: "linen-shirt", fieldType: "Variant", sku: "SHIRT-S", productOptionName1: "Size", productOptionDescription1: "S" },
    { handleId: "mug", fieldType: "Variant", sku: "MUG-1", productOptionName1: "Size", productOptionDescription1: "Large" },
    { handleId: "tote-bag", fieldType: "Product", name: "Canvas Tote Bag", price: "22,00", visible: "TRUE", discountMode: "percent", discountValue: "150", inventory: "3.5" },
    { handleId: "tote-bag", fieldType: "Product", name: "Canvas Tote Bag Two", price: "24.00" },
  ]);
}
