// Amazon Seller Central inventory file checker (flat file / inventory loader).
// Pure functions, no DOM, no network. Column names, codes and limits are read
// from memory of Amazon's public inventory file documentation; no Seller
// Central upload was available when this was built.

export const COLUMNS = [
  "sku", "product-id", "product-id-type", "price", "minimum-seller-allowed-price",
  "maximum-seller-allowed-price", "item-condition", "condition-type", "quantity", "add-delete",
  "will-ship-internationally", "expedited-shipping", "standard-plus", "item-note", "condition-note",
  "fulfillment-center-id", "fulfillment-channel", "product-tax-code", "leadtime-to-ship", "handling-time",
];
const canon = (h) => h.trim().toLowerCase().replace(/[_\s]+/g, "-");
const LOWER = new Map(COLUMNS.map((c) => [canon(c), c]));
export const SEVERITIES = ["error", "warning", "info"];
export const LIMITS = { sku: 40, note: 2000, handling: 30 };
export const CONDITION_CODES = ["1", "2", "3", "4", "5", "6", "7", "8", "10", "11"];
export const CONDITION_TYPES = ["New", "Used", "Collectible", "Refurbished", "Club"];
const USED_CODES = ["1", "2", "3", "4", "5", "6", "7", "8"];

const SCI = /^\d(\.\d+)?e\+?\d+$/i;
const isNum = (v) => /^\d+(\.\d+)?$/.test(v);

export function decodeBuffer(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  // Excel's "Unicode Text" save is UTF-16; Seller Central wants UTF-8 or ANSI text.
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder("utf-16le").decode(u8.subarray(2));
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder("utf-16be").decode(u8.subarray(2));
  return new TextDecoder("utf-8").decode(u8);
}

// Quoted fields, doubled quotes, newlines inside quotes. Tracks the physical line
// each record starts on so findings can name it.
export function parseCsv(text, delim = "\t") {
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

export function toCsv(rows, delim = "\t") {
  const esc = (v) => (v.includes(delim) || /[\r\n]/.test(v) || v.startsWith('"') ? `"${v.replace(/"/g, '""')}"` : v);
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
    const d = distance(n, c.replace(/[^a-z0-9]/g, ""));
    if (d < bestD) { bestD = d; best = c; }
  }
  return bestD <= Math.max(2, Math.floor(n.length / 4)) ? best : null;
}

export function cleanPrice(v) {
  let s = v.trim().replace(/^[$€£¥]\s*/, "").replace(/\s*(USD|EUR|GBP|CAD|AUD|MXN)$/i, "");
  if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  return s;
}

// GTIN-8/12/13/14 check digit: weights 3,1,3,1... from the right of the body.
export function gtinValid(digits) {
  if (!/^\d+$/.test(digits) || ![8, 12, 13, 14].includes(digits.length)) return false;
  const body = digits.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(digits.at(-1));
}

function isbn10Valid(s) {
  if (!/^\d{9}[\dXx]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (10 - i) * (s[i].toUpperCase() === "X" ? 10 : Number(s[i]));
  return sum % 11 === 0;
}

// What a 11-digit "UPC" almost certainly is: a 12-digit UPC whose leading zero Excel removed.
// Only offered when the padded number passes the check digit.
export function paddedUpc(v) {
  return /^\d{11}$/.test(v) && gtinValid("0" + v) ? "0" + v : null;
}

function detectDelim(text) {
  const firstLine = text.split("\n", 1)[0];
  const count = (c) => firstLine.split(c).length - 1;
  if (count("\t") > 0) return "\t";
  if (count(",") > 0) return ",";
  if (count(";") > 0) return ";";
  return "\t";
}
const delimName = (d) => (d === "," ? "comma" : d === ";" ? "semicolon" : "tab");

export function validate(input) {
  const findings = [];
  const add = (severity, code, line, title, detail) => findings.push({ severity, code, line, title, detail });
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const summary = { rows: 0, listings: 0, columns: 0, delimiter: "\t", groups: [] };
  if (!text.trim()) { add("error", "empty", 0, "The file is empty", "Paste or choose an inventory file."); return { findings, summary }; }

  if (text.includes("\u0000")) add("error", "utf16", 0, "The file looks like UTF-16 text", "NUL characters mean the file was saved as Excel's \"Unicode Text\". Save it as \"Text (Tab delimited)\" instead, or use the file chooser on this page, which reads UTF-16.");
  if (text.includes("�")) add("warning", "encoding", 0, "The file contains replacement characters", "Characters such as � mean the file was saved in a legacy encoding and read as UTF-8. Item notes with accents or symbols will upload damaged.");
  if (/Ã[\u0080-¿]|â€[™œ"˜]/.test(text)) add("warning", "mojibake", 0, "Text looks double-encoded", "Sequences like Ã© or â€™ usually mean UTF-8 was saved as Windows-1252 and re-read. Fix the encoding before uploading.");

  const delim = detectDelim(text);
  summary.delimiter = delim;
  if (delim !== "\t") add("error", "delimiter", 1, `The file is ${delimName(delim)}-separated`, `Seller Central inventory files are tab-delimited text. A ${delimName(delim)}-separated file is read as one column. In Excel use "Text (Tab delimited)", or use "Apply safe fixes" below.`);

  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) {
    add("error", "quote", parsed.unterminated, "A quoted cell is never closed", `A cell opened with a double quote on line ${parsed.unterminated} has no closing quote, so everything after it is read as one cell. A cell that starts with a quote mark is the usual cause.`);
    return { findings, summary };
  }
  const rows = parsed.rows;
  const header = rows[0].cells.map((h) => h.trim());
  summary.columns = header.length;
  const idx = {};
  header.forEach((h, i) => {
    const fixed = LOWER.get(canon(h));
    if (fixed) {
      if (idx[fixed] !== undefined) add("error", "dup-header", 1, `Column "${fixed}" appears twice`, `Columns ${idx[fixed] + 1} and ${i + 1} are both "${fixed}". Delete the other.`);
      else idx[fixed] = i;
      if (h !== fixed) add("warning", "header-case", 1, `Column "${h}" is not spelled like the template`, `Use "${fixed}" exactly: lowercase with hyphens.`);
    } else if (h !== "") {
      const near = closestColumn(h);
      add("warning", "unknown-header", 1, `Unknown column "${h}"`, near ? `Did you mean "${near}"? Amazon ignores or rejects columns it does not recognise, so this data would not upload.` : "Amazon ignores or rejects columns it does not recognise, so this data would not upload. Category-specific listing files have their own columns this tool does not know.");
    }
    if (h === "") add("warning", "blank-header", 1, `Column ${i + 1} has no name`, "An unnamed column is ignored. Often a stray trailing tab.");
  });
  if (idx.sku === undefined) add("error", "missing-column", 1, "There is no sku column", "Every inventory file is keyed on sku.");
  if (idx.price === undefined && idx.quantity === undefined) add("error", "missing-column", 1, "There is neither a price nor a quantity column", "An inventory file has to change something: price, quantity, or both.");
  if (idx["product-id"] !== undefined && idx["product-id-type"] === undefined) add("error", "missing-column", 1, "There is a product-id column but no product-id-type", "Amazon needs to know whether each product-id is an ASIN, ISBN, UPC or EAN.");
  if (idx.sku === undefined) return { findings, summary };

  const g = (r, name) => (idx[name] === undefined ? "" : (r.cells[idx[name]] ?? ""));
  const data = [];
  let blank = 0;
  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri];
    summary.rows++;
    if (r.cells.every((c) => c.trim() === "")) { blank++; continue; }
    if (r.cells.length > header.length) add("error", "extra-cells", r.line, `Row has ${r.cells.length} cells but the header has ${header.length}`, "A stray tab, usually inside an item note, pushed the following cells one column to the right.");
    else if (r.cells.length < header.length) add("warning", "short-row", r.line, `Row has ${r.cells.length} cells but the header has ${header.length}`, "Missing trailing cells are read as blank. Check that no cell was lost.");
    data.push(r);
  }
  if (blank) add("info", "blank-rows", 0, `${blank} blank row${blank === 1 ? "" : "s"} skipped`, "Blank rows are harmless but usually mean a spreadsheet range was exported wider than the data.");

  const skus = new Map();
  for (const r of data) {
    const s = g(r, "sku").trim();
    if (s) { if (!skus.has(s)) skus.set(s, []); skus.get(s).push(r.line); }
  }

  for (const r of data) {
    const L = r.line;
    const rawSku = g(r, "sku");
    const sku = rawSku.trim();
    const label = sku ? `SKU ${sku.length > 24 ? sku.slice(0, 24) + "…" : sku}` : "this row";
    summary.listings++;
    const action = g(r, "add-delete").trim().toLowerCase();

    if (!sku) add("error", "sku-blank", L, "Row has no sku", "Amazon cannot tell which offer to change without one.");
    else {
      if (sku.length > LIMITS.sku) add("error", "sku-length", L, `sku is ${sku.length} characters`, `A SKU is limited to ${LIMITS.sku} characters (from memory).`);
      if (rawSku !== sku) add("warning", "sku-space", L, `sku "${rawSku}" has leading or trailing spaces`, "Amazon keeps the spaces, so this becomes a different SKU from the one in your inventory and creates a new offer.");
      if (SCI.test(sku)) add("error", "sci-sku", L, `sku "${sku}" is in scientific notation`, "Excel turned a long number into scientific notation and the original digits are gone. Format the column as Text and re-enter the SKUs.");
      if (/^'/.test(sku)) add("warning", "sku-apostrophe", L, `sku "${sku}" starts with an apostrophe`, "An apostrophe typed to force Text in Excel is saved as part of the value in some exports.");
      const same = skus.get(sku);
      if (same.length > 1 && same[0] !== L) add("warning", "dup-sku", L, `sku "${sku}" repeats line ${same[0]}`, "Two rows for one SKU in the same file conflict; one of them wins and it is not obvious which.");
    }

    if (idx["add-delete"] !== undefined) {
      const a = g(r, "add-delete").trim();
      if (a && !["a", "d", "x"].includes(a.toLowerCase())) add("error", "add-delete", L, `add-delete "${a}" is not a, d or x`, "Use a to add or update, d to delete the offer, x to delete the listing (from memory).");
      else if (a && a !== a.toLowerCase()) add("warning", "add-delete-case", L, `add-delete "${a}" is not lowercase`, `Use ${a.toLowerCase()}.`);
    }

    const pid = g(r, "product-id").trim(), pt = g(r, "product-id-type").trim();
    if (pid) {
      if (SCI.test(pid)) add("error", "sci-pid", L, `product-id "${pid}" is in scientific notation`, "Excel turned a long UPC or EAN into scientific notation and the original digits are gone. Re-enter it with the column formatted as Text.");
      else if (!pt) add("error", "pid-type-blank", L, `${label} has a product-id but no product-id-type`, "Use 1 for ASIN, 2 for ISBN, 3 for UPC, 4 for EAN (from memory).");
      else if (!["1", "2", "3", "4"].includes(pt)) add("error", "pid-type", L, `product-id-type "${pt}" is not 1, 2, 3 or 4`, "1 is ASIN, 2 is ISBN, 3 is UPC, 4 is EAN (from memory).");
      else if (pt === "1" && !/^[A-Za-z0-9]{10}$/.test(pid)) add("error", "asin", L, `ASIN "${pid}" is not ten letters and digits`, "An ASIN is ten characters, usually starting B0.");
      else if (pt === "1" && pid !== pid.toUpperCase()) add("warning", "asin-case", L, `ASIN "${pid}" is not in capitals`, `Use ${pid.toUpperCase()}.`);
      else if (pt === "2" && !(isbn10Valid(pid) || (/^\d{13}$/.test(pid) && gtinValid(pid)))) add("error", "isbn", L, `ISBN "${pid}" fails its check digit`, "An ISBN is 10 characters or 13 digits and its last digit is a checksum. One digit is probably wrong.");
      else if (pt === "3") {
        const pad = paddedUpc(pid);
        if (pad) add("error", "upc-short", L, `UPC "${pid}" has 11 digits`, `Excel dropped the leading zero. ${pad} passes the check digit. Use "Apply safe fixes".`);
        else if (!/^\d{12}$/.test(pid)) add("error", "upc", L, `UPC "${pid}" is not 12 digits`, "A UPC is exactly 12 digits.");
        else if (!gtinValid(pid)) add("error", "upc-check", L, `UPC "${pid}" fails its check digit`, "The last digit of a UPC is a checksum, and this one does not match the other eleven. One digit is probably wrong.");
      } else if (pt === "4") {
        if (!/^\d{13}$/.test(pid)) add("error", "ean", L, `EAN "${pid}" is not 13 digits`, "An EAN is exactly 13 digits.");
        else if (!gtinValid(pid)) add("error", "ean-check", L, `EAN "${pid}" fails its check digit`, "The last digit of an EAN is a checksum, and this one does not match the other twelve. One digit is probably wrong.");
      }
    }

    const price = g(r, "price").trim();
    if (idx.price !== undefined) {
      if (!price) { if (action !== "d" && action !== "x") add(idx.quantity === undefined ? "error" : "info", "price-blank", L, `${label} has no price`, idx.quantity === undefined ? "A price-only file needs a price on every row." : "A blank price leaves the current price unchanged. Fine if that is what you intend."); }
      else if (!isNum(price)) { const c = cleanPrice(price); add("error", "price-format", L, `price "${price}" is not a plain number`, isNum(c) ? `Amazon wants digits and a decimal point only. Use ${c}.` : "Amazon wants digits and a decimal point only, with no currency symbol, thousands separator or text."); }
      else if (Number(price) <= 0) add("error", "price-zero", L, `price ${price} is not above zero`, "A price of zero is rejected.");
    }
    const minP = g(r, "minimum-seller-allowed-price").trim(), maxP = g(r, "maximum-seller-allowed-price").trim();
    for (const [name, v] of [["minimum-seller-allowed-price", minP], ["maximum-seller-allowed-price", maxP]]) if (v && !isNum(v)) add("error", "price-format", L, `${name} "${v}" is not a plain number`, "Digits and a decimal point only.");
    if (isNum(minP) && isNum(maxP) && Number(minP) > Number(maxP)) add("error", "min-over-max", L, `Minimum price ${minP} is above maximum price ${maxP}`, "The allowed range is empty, so the row is rejected.");
    if (isNum(price) && isNum(minP) && Number(price) < Number(minP)) add("warning", "price-under-min", L, `price ${price} is below the minimum ${minP}`, "Amazon will not list the offer below your own minimum price.");
    if (isNum(price) && isNum(maxP) && Number(price) > Number(maxP)) add("warning", "price-over-max", L, `price ${price} is above the maximum ${maxP}`, "Amazon will not list the offer above your own maximum price.");

    const q = g(r, "quantity").trim();
    const fc = g(r, "fulfillment-center-id").trim() || g(r, "fulfillment-channel").trim();
    const fba = /^(AMAZON|AFN)/i.test(fc);
    if (idx.quantity !== undefined) {
      if (!q) { if (action !== "d" && action !== "x" && !fba && idx.price === undefined) add("error", "quantity-blank", L, `${label} has no quantity`, "A quantity-only file needs a quantity on every row."); else if (action === "a" && !fba && !price) add("warning", "quantity-blank", L, `${label} has no quantity`, "An offer added without a quantity is created out of stock."); }
      else if (!/^\d+$/.test(q)) add("error", "quantity", L, `quantity "${q}" is not a whole number`, /^-\d+$/.test(q) ? "A negative quantity is rejected. Use 0 to take an offer out of stock." : /^\d+\.\d+$/.test(q) ? "Quantities are whole units." : "Use digits only.");
      else if (fba) add("info", "fba-quantity", L, `${label} is fulfilled by Amazon but has a quantity`, "Amazon counts FBA stock itself; a quantity you upload for an FBA offer is ignored or rejected.");
    }

    const ic = g(r, "item-condition").trim(), ct = g(r, "condition-type").trim();
    if (ic && !CONDITION_CODES.includes(ic)) add("warning", "item-condition", L, `item-condition "${ic}" is not a code this tool knows`, "Codes read from memory: 11 New, 10 Refurbished, 1 to 4 Used (Like New to Acceptable), 5 to 8 Collectible. Check Amazon's current list.");
    if (ct) {
      const match = CONDITION_TYPES.find((x) => x.toLowerCase() === ct.toLowerCase());
      if (!match) add("error", "condition-type", L, `condition-type "${ct}" is not recognised`, `Use one of ${CONDITION_TYPES.join(", ")}.`);
      else if (match !== ct) add("warning", "condition-type-case", L, `condition-type "${ct}" is not capitalised like the template`, `Use ${match}.`);
    }
    const used = USED_CODES.includes(ic) || /^(used|collectible)$/i.test(ct);
    if (used && !g(r, "item-note").trim() && !g(r, "condition-note").trim()) add("warning", "condition-note", L, `${label} is not new and has no condition note`, "Amazon expects a note describing a used or collectible item.");
    for (const n of ["item-note", "condition-note"]) if (g(r, n).length > LIMITS.note) add("error", "note-length", L, `${n} is ${g(r, n).length} characters`, `Limited to ${LIMITS.note} characters (from memory).`);

    for (const n of ["leadtime-to-ship", "handling-time"]) {
      const v = g(r, n).trim();
      if (!v) continue;
      if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > LIMITS.handling) add("warning", "handling", L, `${n} "${v}" is not a whole number from 1 to ${LIMITS.handling}`, "Handling time is counted in days, up to thirty (from memory).");
    }
    summary.groups.push({ handle: sku, line: L, title: price, variants: q });
  }
  findings.sort((a, b) => (SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity)) || (a.line - b.line));
  return { findings, summary };
}

// Safe fixes only: things with exactly one reasonable reading. Never edits a
// SKU's characters, a product id's digits (beyond a check-digit-verified leading
// zero), a note, or any number besides reformatting a price.
export function repair(input) {
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const changes = [];
  if (!text.trim()) return { text: "", changes, error: "The file is empty." };
  const delim = detectDelim(text);
  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) return { text: "", changes, error: `A quote opened on line ${parsed.unterminated} is never closed; fix that first.` };
  const rows = parsed.rows.map((r) => r.cells.slice());
  if (delim !== "\t") changes.push(`Converted the ${delimName(delim)} delimiter to tabs.`);
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
  const c = Object.fromEntries(["sku", "product-id", "price", "minimum-seller-allowed-price", "maximum-seller-allowed-price", "quantity", "add-delete", "condition-type", "product-id-type"].map((n) => [n, col(n)]));
  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri];
    if (r.every((x) => x.trim() === "")) continue;
    for (const n of ["sku", "product-id"]) if (c[n] >= 0 && r[c[n]] !== undefined && r[c[n]] !== r[c[n]].trim()) edit(ri, c[n], r[c[n]].trim(), "stray spaces");
    if (c["product-id"] >= 0 && c["product-id-type"] >= 0 && r[c["product-id"]] !== undefined && r[c["product-id-type"]]?.trim() === "3") {
      const pad = paddedUpc(r[c["product-id"]].trim());
      if (pad) edit(ri, c["product-id"], pad, "leading zero restored, check digit verified");
    }
    for (const n of ["price", "minimum-seller-allowed-price", "maximum-seller-allowed-price"]) if (c[n] >= 0 && r[c[n]] !== undefined) { const v = r[c[n]].trim(); if (v && !isNum(v)) { const p = cleanPrice(v); if (isNum(p)) edit(ri, c[n], p, "plain number"); } }
    if (c.quantity >= 0 && r[c.quantity] !== undefined && /^\d+\.0+$/.test(r[c.quantity].trim())) edit(ri, c.quantity, r[c.quantity].trim().replace(/\.0+$/, ""), "whole number");
    if (c["add-delete"] >= 0 && r[c["add-delete"]] !== undefined && /^[ADXadx]$/.test(r[c["add-delete"]].trim())) edit(ri, c["add-delete"], r[c["add-delete"]].trim().toLowerCase(), "lowercase code");
    if (c["condition-type"] >= 0 && r[c["condition-type"]] !== undefined) {
      const m = CONDITION_TYPES.find((x) => x.toLowerCase() === r[c["condition-type"]].trim().toLowerCase());
      if (m) edit(ri, c["condition-type"], m, "template capitalisation");
    }
  }
  return { text: toCsv(rows), changes, error: null };
}

export function findingsCsv(result) {
  return toCsv([["severity", "line", "code", "title", "detail"], ...result.findings.map((f) => [f.severity, String(f.line || ""), f.code, f.title, f.detail])], ",");
}

const COLS = ["sku", "product-id", "product-id-type", "price", "quantity", "item-condition", "add-delete", "item-note", "leadtime-to-ship"];
const build = (rows) => toCsv([COLS, ...rows.map((o) => COLS.map((h) => o[h] ?? ""))]);

export function sampleFile() {
  return build([
    { sku: "CAN-8-AMB", "product-id": "012345678905", "product-id-type": "3", price: "18.00", quantity: "40", "item-condition": "11", "add-delete": "a", "leadtime-to-ship": "2" },
    { sku: "TOW-2-LIN", "product-id": "4006381333931", "product-id-type": "4", price: "26.50", quantity: "25", "item-condition": "11", "add-delete": "a", "leadtime-to-ship": "2" },
    { sku: "STK-6-BRS", "product-id": "B00EXAMPL1", "product-id-type": "1", price: "14.00", quantity: "60", "item-condition": "11", "add-delete": "a" },
  ]);
}

export function sampleBrokenFile() {
  return build([
    { sku: "CAN-8-AMB ", "product-id": "012345678906", "product-id-type": "3", price: "$18.00", quantity: "40", "item-condition": "11", "add-delete": "A" },
    { sku: "1.23457E+12", "product-id": "12345678905", "product-id-type": "3", price: "26,50", quantity: "-3", "item-condition": "11", "add-delete": "a" },
    { sku: "STK-6-BRS", "product-id": "B00EXAMPL", "product-id-type": "1", price: "0", quantity: "2.5", "item-condition": "3", "add-delete": "a", "leadtime-to-ship": "45" },
    { sku: "STK-6-BRS", "product-id": "4006381333932", "product-id-type": "4", price: "14.00", quantity: "60", "item-condition": "99", "add-delete": "z" },
  ]);
}
