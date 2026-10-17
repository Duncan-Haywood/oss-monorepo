// Square item library import CSV checker. Pure functions, no DOM, no network.
// Column names and rules are read from memory of Square's public item library
// import documentation; no Square import was available when this was built.

export const COLUMNS = [
  "Token", "Item Name", "Variation Name", "Unit and Precision", "SKU", "Description", "Category", "SEO Title",
  "SEO Description", "Permalink", "GTIN", "Square Online Item Visibility", "Item Type", "Weight (lb)",
  "Social Media Link Title", "Social Media Link Description", "Shipping Enabled", "Self-serve Ordering Enabled",
  "Delivery Enabled", "Pickup Enabled", "Price", "Online Sale Price", "Archived", "Sellable", "Stockable",
  "Skip Detail Screen in POS", "Option Name 1", "Option Value 1", "Option Name 2", "Option Value 2",
  "Default Unit Cost", "Default Vendor Name", "Default Vendor Code",
];

const LOWER = new Map(COLUMNS.map((c) => [c.toLowerCase(), c]));
// Per-location and per-tax columns carry the location or tax name in brackets or after a dash.
// Square writes the location name after the label, with or without brackets, depending on the export.
const LOCATION_RE = /^(Current Quantity|New Quantity|Stock Alert Enabled|Stock Alert Count|Price) \[?[^\]]+\]?$/i;
const TAX_RE = /^Tax - .+$/i;
const OPTION_RE = /^Option (Name|Value) \d+$/i;
const isOpenColumn = (h) => LOCATION_RE.test(h) || TAX_RE.test(h) || OPTION_RE.test(h);

export const SEVERITIES = ["error", "warning", "info"];

const YN_COLS = ["Shipping Enabled", "Self-serve Ordering Enabled", "Delivery Enabled", "Pickup Enabled", "Archived", "Sellable", "Stockable", "Skip Detail Screen in POS"];
const PRICE_COLS = ["Price", "Online Sale Price", "Default Unit Cost"];
const VISIBILITY = new Set(["visible", "hidden", "unavailable"]);
const ITEM_TYPES = new Set(["physical good", "digital good", "donation", "service", "event", "prepared food and beverage", "regular", "appointments service", "membership"]);
const SCI = /^\d(\.\d+)?e\+?\d+$/i;
const isNum = (v) => /^\d+(\.\d+)?$/.test(v);
const toYN = (v) => (/^(y|yes|true|1)$/i.test(v) ? "Y" : /^(n|no|false|0)$/i.test(v) ? "N" : null);

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

export function validate(input) {
  const findings = [];
  const add = (severity, code, line, title, detail) => findings.push({ severity, code, line, title, detail });
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const summary = { rows: 0, products: 0, variants: 0, images: 0, columns: 0, delimiter: ",", groups: [], locations: 0 };
  if (!text.trim()) { add("error", "empty", 0, "The file is empty", "Paste or choose a Square item library CSV."); return { findings, summary }; }

  if (text.includes("�")) add("warning", "encoding", 0, "The file contains replacement characters", "Characters such as � mean the file was saved in a legacy encoding and read as UTF-8. Re-export as CSV UTF-8, or accents and symbols in item names will import damaged.");
  if (/Ã[\u0080-¿]|â€[™œ"˜]/.test(text)) add("warning", "mojibake", 0, "Text looks double-encoded", "Sequences like Ã© or â€™ usually mean UTF-8 was saved as Windows-1252 and re-read. Fix the encoding before importing, or item names will show those characters.");

  const delim = detectDelim(text);
  summary.delimiter = delim;
  if (delim !== ",") add("error", "delimiter", 1, `The file is ${delim === ";" ? "semicolon" : "tab"}-separated`, 'Square reads a comma-separated file. Excel in many European locales saves CSV with semicolons. Re-save as "CSV UTF-8 (Comma delimited)" or use "Apply safe fixes" below.');

  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) {
    add("error", "quote", parsed.unterminated, "A quoted cell is never closed", `A cell opened with a double quote on line ${parsed.unterminated} has no closing quote, so everything after it is read as one cell. An unescaped quote inside a Description is the usual cause: inside a quoted cell, a literal quote must be doubled ("").`);
    return { findings, summary };
  }
  const rows = parsed.rows;
  const header = rows[0].cells.map((h) => h.trim());
  summary.columns = header.length;
  const idx = {};
  const locations = new Set();
  header.forEach((h, i) => {
    const lc = h.toLowerCase();
    const fixed = LOWER.get(lc);
    if (fixed) {
      if (idx[fixed] !== undefined) add("error", "dup-header", 1, `Column "${fixed}" appears twice`, `Columns ${idx[fixed] + 1} and ${i + 1} are both "${fixed}". Square maps only one of them; delete the other.`);
      else idx[fixed] = i;
      if (h !== fixed) add("warning", "header-case", 1, `Column "${h}" is not spelled like the template`, `Use "${fixed}" exactly, including capitals and punctuation.`);
    } else if (isOpenColumn(h)) {
      if (idx[lc] !== undefined) add("error", "dup-header", 1, `Column "${h}" appears twice`, `Columns ${idx[lc] + 1} and ${i + 1} are both "${h}".`);
      else idx[lc] = i;
      if (LOCATION_RE.test(h)) locations.add(h.replace(/^(current quantity|new quantity|stock alert enabled|stock alert count|price) /i, "").replace(/^\[|\]$/g, "").toLowerCase());
    } else if (h !== "") {
      const near = closestColumn(h);
      add("warning", "unknown-header", 1, `Unknown column "${h}"`, near ? `Did you mean "${near}"? Square skips columns it does not recognise, so this data would not import.` : "Square skips columns it does not recognise, so this data would not import.");
    }
    if (h === "") add("warning", "blank-header", 1, `Column ${i + 1} has no name`, "An unnamed column is ignored. Often a stray trailing comma.");
  });
  for (const k of Object.keys(idx)) if (/^Option /.test(k)) idx[k.toLowerCase()] = idx[k];
  summary.locations = locations.size;
  if (idx["Item Name"] === undefined && idx["Token"] === undefined) { add("error", "no-key", 1, 'There is no "Item Name" or "Token" column', "Square needs an Item Name to create an item, or a Token to match an existing variation."); return { findings, summary }; }

  const g = (r, name) => (idx[name] === undefined ? "" : (r.cells[idx[name]] ?? ""));
  const optionNums = [];
  for (let n = 1; n <= 6; n++) if (idx[`option name ${n}`] !== undefined || idx[`option value ${n}`] !== undefined) optionNums.push(n);
  const locCols = Object.keys(idx).filter((k) => LOCATION_RE.test(k));
  const taxCols = Object.keys(idx).filter((k) => TAX_RE.test(k));

  const data = [];
  let blank = 0;
  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri];
    summary.rows++;
    if (r.cells.every((c) => c.trim() === "")) { blank++; continue; }
    if (r.cells.length > header.length) add("error", "extra-cells", r.line, `Row has ${r.cells.length} cells but the header has ${header.length}`, "An unquoted comma in a Description or Category pushed the following cells one column to the right. Quote the cell that contains the comma.");
    else if (r.cells.length < header.length) add("warning", "short-row", r.line, `Row has ${r.cells.length} cells but the header has ${header.length}`, "Missing trailing cells are read as blank. Check that no cell was lost.");
    data.push(r);
  }
  if (blank) add("info", "blank-rows", 0, `${blank} blank row${blank === 1 ? "" : "s"} skipped`, "Blank rows are harmless but usually mean a spreadsheet range was exported wider than the data.");

  // Group rows into items by Item Name. Each row is one variation of its item.
  const items = new Map();
  const tokenLines = new Map(), skuLines = new Map(), permalinkLines = new Map();
  for (const r of data) {
    const name = g(r, "Item Name").trim();
    const key = name.toLowerCase();
    if (key) { if (!items.has(key)) items.set(key, { name, rows: [] }); items.get(key).rows.push(r); }
    const tok = g(r, "Token").trim();
    if (tok) { if (!tokenLines.has(tok)) tokenLines.set(tok, []); tokenLines.get(tok).push(r.line); }
    const sku = g(r, "SKU").trim();
    if (sku) { if (!skuLines.has(sku)) skuLines.set(sku, []); skuLines.get(sku).push(r.line); }
  }
  const firstOfItem = new Set([...items.values()].map((it) => it.rows[0]));

  for (const r of data) {
    const L = r.line;
    const name = g(r, "Item Name").trim(), vname = g(r, "Variation Name").trim(), tok = g(r, "Token").trim(), sku = g(r, "SKU").trim();
    const label = sku || (name ? (vname ? `${name} / ${vname}` : name) : tok ? `Token ${tok}` : "this row");
    summary.variants++;
    if (firstOfItem.has(r)) summary.products++;

    if (!name && !tok) add("error", "name-blank", L, "Row has no Item Name and no Token", "Square cannot tell which item this row belongs to. Fill Item Name, or give a Token to update an existing variation.");
    else if (!name && idx["Item Name"] !== undefined) add("warning", "name-blank-token", L, `Row "${label}" has a Token but no Item Name`, "This is fine only when the row updates an existing variation by Token; a new item needs a name.");
    if (name.length > 255) add("warning", "name-length", L, "Item Name is longer than 255 characters", "Very long names are cut off in the POS and on receipts.");

    if (tok) {
      if (SCI.test(tok)) add("error", "sci-token", L, `Token "${tok}" is in scientific notation`, "Excel rewrote the token and the original characters are gone. Re-export from Square and avoid opening the file in Excel before saving, or format the column as Text first.");
      else if (!/^[A-Za-z0-9]{20,28}$/.test(tok)) add("warning", "token-shape", L, `Token "${tok.slice(0, 30)}" does not look like a Square token`, "Tokens in a Square export are about 24 letters and digits. A cut or edited token will not match its variation, so the row may create a duplicate instead of updating.");
      if (tokenLines.get(tok).length > 1 && tokenLines.get(tok)[0] !== L) add("error", "dup-token", L, `Token "${tok}" repeats line ${tokenLines.get(tok)[0]}`, "Each Token names one variation. Two rows with the same Token update the same variation twice, and the later row wins.");
    }

    if (sku) {
      if (SCI.test(sku)) add("error", "sci-sku", L, `SKU "${sku}" is in scientific notation`, "Excel turned a long number into scientific notation and the original digits are gone. Format the column as Text and re-enter the SKUs.");
      if (/\s/.test(sku)) add("warning", "sku-space", L, `SKU "${sku}" contains a space`, "Spaces in a SKU make scanner lookups and later exports easy to get wrong.");
      if (skuLines.get(sku).length > 1 && skuLines.get(sku)[0] !== L) add("error", "dup-sku", L, `SKU "${sku}" repeats line ${skuLines.get(sku)[0]}`, "Square expects each variation to have its own SKU, and a repeated SKU is flagged on import or makes barcode scans ambiguous.");
    }
    const gtin = g(r, "GTIN").trim();
    if (gtin) {
      if (SCI.test(gtin)) add("error", "sci-gtin", L, `GTIN "${gtin}" is in scientific notation`, "Excel damaged this code and the original digits are gone. Format the column as Text and re-enter it.");
      else { const p = gtinProblem(gtin); if (p) add("warning", "gtin", L, `GTIN ${gtin}: ${p}`, "Marketplaces and Google Merchant Center reject codes with a wrong check digit."); }
    }

    for (const col of YN_COLS) {
      const v = g(r, col).trim();
      if (v && v !== "Y" && v !== "N") add("error", "flag", L, `${col} is "${v}"`, `${col} must be Y or N, capitalised.${toYN(v) ? ` "${v}" looks like ${toYN(v)}.` : ""}`);
    }
    for (const col of taxCols) {
      const v = (r.cells[idx[col]] ?? "").trim();
      if (v && v !== "Y" && v !== "N") add("error", "tax-flag", L, `${rows[0].cells[idx[col]].trim()} is "${v}"`, `Tax columns take Y (this item is taxed) or N.${toYN(v) ? ` "${v}" looks like ${toYN(v)}.` : ""}`);
    }
    const vis = g(r, "Square Online Item Visibility").trim();
    if (vis && !VISIBILITY.has(vis.toLowerCase())) add("warning", "visibility", L, `Square Online Item Visibility is "${vis}"`, "Expected visible, hidden or unavailable.");
    const itype = g(r, "Item Type").trim();
    if (itype && !ITEM_TYPES.has(itype.toLowerCase())) add("info", "item-type", L, `Item Type "${itype}" is not one of the usual values`, `Seen in exports: ${[...ITEM_TYPES].join(", ")}. Check the spelling against an export from your own account.`);

    const wt = g(r, "Weight (lb)").trim();
    if (wt) {
      if (/^\d+,\d+$/.test(wt)) add("error", "decimal-comma", L, `Weight (lb) "${wt}" uses a decimal comma`, `Use a decimal point (${wt.replace(",", ".")}).`);
      else if (!isNum(wt)) add("error", "weight", L, `Weight (lb) "${wt}" is not a plain number`, "Digits and a decimal point only, with no unit. The column is in pounds.");
    }
    for (const col of [...PRICE_COLS, ...Object.keys(idx).filter((k) => /^price /.test(k))]) {
      const v = (r.cells[idx[col]] ?? "").trim();
      if (!v) continue;
      const label2 = rows[0].cells[idx[col]].trim();
      if (!isNum(v)) { const c = cleanPrice(v); add("error", "price-format", L, `${label2} "${v}" is not a plain number`, isNum(c) ? `Square wants digits and a decimal point only. Use ${c}.` : "Square wants digits and a decimal point only, with no currency symbol, thousands separator or text. Leave the cell blank for variable pricing."); }
    }
    const price = cleanPrice(g(r, "Price")), sale = cleanPrice(g(r, "Online Sale Price"));
    if (isNum(price) && isNum(sale) && Number(sale) >= Number(price) && Number(sale) !== 0) add("warning", "sale-price", L, `Online Sale Price ${sale} is not below Price ${price}`, "A sale price at or above the regular price shows no discount. Leave it blank if there is no sale.");
    if (sale && !price) add("warning", "sale-no-price", L, "Online Sale Price is set but Price is blank", "A variable-price variation has nothing to be reduced from, so the sale price is ignored.");
    if (idx["Price"] !== undefined && !g(r, "Price").trim() && !locCols.some((c) => /^price /.test(c) && (r.cells[idx[c]] ?? "").trim())) add("info", "price-blank", L, `"${label}" has no price`, "Square treats a blank price as variable pricing, so the cashier types it at the till. Fine for services and open-price items, a gap otherwise.");

    for (const col of locCols) {
      const v = (r.cells[idx[col]] ?? "").trim(), nm = rows[0].cells[idx[col]].trim();
      if (!v || /^price /.test(col)) continue;
      if (/^(current|new) quantity/.test(col)) {
        if (!/^-?\d+(\.\d+)?$/.test(v)) add("error", "quantity", L, `${nm} "${v}" is not a number`, "Use digits only. Blank means leave the quantity untracked or unchanged.");
        else if (Number(v) < 0 && /^new/.test(col)) add("warning", "quantity-negative", L, `${nm} is negative`, "A negative new quantity sets stock below zero.");
      } else if (/^stock alert count/.test(col)) {
        if (!/^\d+$/.test(v)) add("error", "alert-count", L, `${nm} "${v}" is not a whole number`, "Use a whole number of units.");
      } else if (v !== "Y" && v !== "N") add("error", "flag", L, `${nm} is "${v}"`, `${nm} must be Y or N.`);
    }
    if (g(r, "Stockable").trim() === "N" && locCols.some((c) => /^new quantity/.test(c) && (r.cells[idx[c]] ?? "").trim())) add("warning", "stock-conflict", L, `"${label}" is not stockable but has a New Quantity`, "A variation with Stockable N does not track inventory, so the quantity is ignored.");

    const link = g(r, "Permalink").trim();
    if (link) {
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(link)) add("warning", "permalink", L, `Permalink "${link.slice(0, 40)}" is not a clean slug`, "Use lowercase letters, digits and single hyphens. Spaces and capitals are rewritten or rejected.");
      if (!permalinkLines.has(link)) permalinkLines.set(link, L);
      else if (firstOfItem.has(r)) add("error", "dup-permalink", L, `Permalink "${link}" repeats line ${permalinkLines.get(link)}`, "Two items cannot share a Square Online URL.");
    }
    if (g(r, "SEO Title").length > 70) add("info", "seo-title", L, "SEO Title is longer than 70 characters", "Search results cut long titles off.");
    if (g(r, "SEO Description").length > 320) add("info", "seo-description", L, "SEO Description is longer than 320 characters", "Search results cut long descriptions off.");

    for (const n of optionNums) {
      const on = (r.cells[idx[`option name ${n}`]] ?? "").trim(), ov = (r.cells[idx[`option value ${n}`]] ?? "").trim();
      if (on && !ov) add("error", "option-value", L, `Option Name ${n} "${on}" has no Option Value ${n}`, "Each option name needs a value on every variation.");
      else if (ov && !on) add("error", "option-name", L, `Option Value ${n} "${ov}" has no Option Name ${n}`, "Put the option's name (for example Size) in the matching Option Name column.");
    }
  }

  // Item level checks.
  for (const it of items.values()) {
    const L = it.rows[0].line;
    const v = it.rows.length;
    summary.groups.push({ handle: it.name, line: L, title: g(it.rows[0], "Category"), variants: v, images: 0 });
    if (v > 250) add("warning", "variation-count", L, `Item "${it.name}" has ${v} variations`, "Square limits how many variations one item can carry (about 250, from memory). Split it into more than one item.");
    const vnames = it.rows.map((r) => g(r, "Variation Name").trim().toLowerCase());
    if (v > 1) {
      it.rows.forEach((r, i) => { if (!vnames[i]) add("warning", "variation-name-blank", r.line, `Variation of "${it.name}" has no Variation Name`, "When an item has more than one variation, each needs its own name or the POS shows them all as Regular."); });
      const seen = new Map();
      it.rows.forEach((r, i) => {
        if (!vnames[i]) return;
        if (seen.has(vnames[i])) add("error", "dup-variation", r.line, `Variation "${g(r, "Variation Name").trim()}" of "${it.name}" repeats line ${seen.get(vnames[i])}`, "Two variations of one item have the same name, so the second overwrites the first or is skipped.");
        else seen.set(vnames[i], r.line);
      });
      const cats = new Set(it.rows.map((r) => g(r, "Category").trim().toLowerCase()).filter(Boolean));
      if (cats.size > 1) add("warning", "category-mismatch", L, `Variations of "${it.name}" disagree on Category`, "An item has one category; Square uses one of these values, and which one is not under your control.");
      for (const col of ["Description", "Item Type", "Archived"]) {
        const vals = new Set(it.rows.map((r) => g(r, col).trim()).filter(Boolean));
        if (vals.size > 1) add("info", "item-level-mismatch", L, `Variations of "${it.name}" disagree on ${col}`, `${col} belongs to the item, not the variation, so only one of these values is kept.`);
      }
    }
    // Option combinations should be unique within an item, and option names consistent.
    if (optionNums.length && v > 1) {
      const combos = new Map();
      it.rows.forEach((r) => {
        const key = optionNums.map((n) => `${(r.cells[idx[`option name ${n}`]] ?? "").trim().toLowerCase()}=${(r.cells[idx[`option value ${n}`]] ?? "").trim().toLowerCase()}`).join("|");
        if (/^(=\|?)+$/.test(key)) return;
        if (combos.has(key)) add("error", "dup-options", r.line, `Variation of "${it.name}" repeats the options on line ${combos.get(key)}`, "Two variations carry the same option values, so they cannot be told apart in Square Online.");
        else combos.set(key, r.line);
      });
      const nameSets = new Set(it.rows.map((r) => optionNums.map((n) => (r.cells[idx[`option name ${n}`]] ?? "").trim().toLowerCase()).join("|")));
      if (nameSets.size > 1) add("warning", "option-names", L, `Variations of "${it.name}" use different option names`, "Every variation of an item should use the same Option Name columns, for example Size and Color on all of them.");
    }
  }
  summary.products = items.size;
  findings.sort((a, b) => (SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity)) || (a.line - b.line));
  return { findings, summary };
}

// Safe fixes only: things with exactly one reasonable reading. Never edits item
// names, variation names, descriptions, SKUs, GTINs, tokens, quantities or categories.
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
  if (delim !== ",") changes.push(`Converted the ${delim === ";" ? "semicolon" : "tab"} delimiter to commas.`);
  head.forEach((h, i) => {
    const canon = LOWER.get(h.toLowerCase());
    if (canon && rows[0][i] !== canon) { changes.push(`Header "${rows[0][i]}" renamed to "${canon}".`); rows[0][i] = canon; }
  });
  const colIdx = (pred) => head.map((h, i) => (pred(h) ? i : -1)).filter((i) => i >= 0);
  const named = (...names) => colIdx((h) => names.some((n) => n.toLowerCase() === h.toLowerCase()));
  const edit = (ri, ci, to, why) => {
    const from = rows[ri][ci];
    if (from === to) return;
    rows[ri][ci] = to;
    changes.push(`Line ${parsed.rows[ri].line}, ${rows[0][ci].trim()}: "${from}" → "${to}" (${why}).`);
  };
  const ynCols = [...named(...YN_COLS), ...colIdx((h) => TAX_RE.test(h) || /^Stock Alert Enabled /i.test(h))];
  const priceCols = [...named(...PRICE_COLS), ...colIdx((h) => /^Price /i.test(h))];
  const wtCols = named("Weight (lb)");
  const trimCols = named("Token", "SKU", "GTIN", "Permalink");
  for (let ri = 1; ri < rows.length; ri++) {
    if (rows[ri].every((c) => c.trim() === "")) continue;
    for (const ci of ynCols) if (rows[ri][ci] !== undefined) { const f = toYN(rows[ri][ci].trim()); if (f !== null) edit(ri, ci, f, "Y or N as Square expects"); }
    for (const ci of priceCols) {
      if (rows[ri][ci] === undefined) continue;
      const v = rows[ri][ci].trim();
      if (v && !isNum(v)) { const c = cleanPrice(v); if (isNum(c)) edit(ri, ci, c, "plain number"); }
    }
    for (const ci of wtCols) if (rows[ri][ci] !== undefined && /^\d+,\d+$/.test(rows[ri][ci].trim())) edit(ri, ci, rows[ri][ci].trim().replace(",", "."), "decimal point");
    for (const ci of trimCols) if (rows[ri][ci] !== undefined && rows[ri][ci] !== rows[ri][ci].trim()) edit(ri, ci, rows[ri][ci].trim(), "stray spaces");
  }
  return { text: toCsv(rows), changes, error: null };
}

export function findingsCsv(result) {
  return toCsv([["severity", "line", "code", "title", "detail"], ...result.findings.map((f) => [f.severity, String(f.line || ""), f.code, f.title, f.detail])]);
}

const H = [...COLUMNS, "Current Quantity Main Street", "New Quantity Main Street", "Tax - Sales Tax (8%)"];
function build(rows) { return toCsv([H, ...rows.map((o) => H.map((h) => o[h] ?? ""))]); }
const base = (o) => ({ "Square Online Item Visibility": "visible", "Item Type": "Physical good", "Shipping Enabled": "Y", "Self-serve Ordering Enabled": "N", "Delivery Enabled": "N", "Pickup Enabled": "Y", Archived: "N", Sellable: "Y", Stockable: "Y", "Skip Detail Screen in POS": "N", "Tax - Sales Tax (8%)": "Y", ...o });

export function sampleFile() {
  return build([
    base({ Token: "", "Item Name": "Canvas Tote Bag", "Variation Name": "Natural", SKU: "TOTE-NAT", Category: "Bags", Description: "Heavy cotton canvas.", Permalink: "canvas-tote-bag", GTIN: "036000291452", "Weight (lb)": "0.7", Price: "24.00", "Option Name 1": "Color", "Option Value 1": "Natural", "New Quantity Main Street": "40" }),
    base({ "Item Name": "Canvas Tote Bag", "Variation Name": "Black", SKU: "TOTE-BLK", Category: "Bags", Price: "24.00", "Option Name 1": "Color", "Option Value 1": "Black", "New Quantity Main Street": "25" }),
    base({ "Item Name": "Enamel Mug", "Variation Name": "Regular", SKU: "MUG-01", Category: "Kitchen", Price: "14.50", "Online Sale Price": "12.00", "New Quantity Main Street": "60" }),
    base({ "Item Name": "Gift Wrap", "Variation Name": "Regular", SKU: "WRAP-01", Category: "Extras", "Item Type": "Service", Stockable: "N" }),
  ]);
}

export function sampleBrokenFile() {
  return build([
    base({ Token: "ABCDEFGHIJKLMNOPQRSTUVWX", "Item Name": "Canvas Tote Bag", "Variation Name": "Natural", SKU: "TOTE-NAT", Category: "Bags", Permalink: "Canvas Tote Bag", GTIN: "036000291453", Price: "$24.00", "Online Sale Price": "29.00", "Option Name 1": "Color", "Option Value 1": "Natural" }),
    base({ Token: "ABCDEFGHIJKLMNOPQRSTUVWX", "Item Name": "Canvas Tote Bag", "Variation Name": "Natural", SKU: "TOTE-NAT", Category: "Totes", Price: "24,00", "Option Name 1": "Color", "Option Value 1": "Natural", Sellable: "yes" }),
    base({ "Item Name": "Canvas Tote Bag", "Variation Name": "", SKU: "1.23457E+12", Price: "24.00", "Option Name 1": "Color" }),
    base({ "Item Name": "Enamel Mug", "Variation Name": "Regular", SKU: "MUG-01", Price: "14.50", Stockable: "N", "New Quantity Main Street": "sixty", "Weight (lb)": "0,5", "Tax - Sales Tax (8%)": "true" }),
  ]);
}
