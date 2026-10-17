// QuickBooks Online import CSV checker (customers, vendors, products and services). Pure functions,
// no DOM, no network. Column names and limits are read from memory of Intuit's public import help
// pages; no QuickBooks import was available when this was built, so unknown columns are notes,
// never errors, and every limit is worded as "commonly documented".

export const KINDS = {
  customers: { name: "Customers", label: "customer" },
  vendors: { name: "Vendors", label: "vendor" },
  products: { name: "Products and services", label: "product or service" },
};

export const ROW_LIMIT = 1000;
export const NAME_LIMIT = 100;
const SIZE_LIMIT = 2 * 1024 * 1024;

// What a heading means, by squashed lower-case spelling.
const CONCEPTS = {
  name: ["name", "displayname", "customer", "customername", "vendor", "vendorname", "productname", "productservicename", "itemname", "productsandservices", "item"],
  company: ["company", "companyname", "businessname"],
  first: ["firstname", "first", "givenname"],
  last: ["lastname", "last", "surname", "familyname"],
  email: ["email", "emailaddress", "emails", "mail"],
  phone: ["phone", "phonenumber", "mobile", "mobilenumber", "fax", "telephone", "tel"],
  website: ["website", "web", "url"],
  zip: ["billingzip", "billingzipcode", "billingpostalcode", "shippingzip", "shippingzipcode", "shippingpostalcode", "zip", "zipcode", "postalcode"],
  balance: ["openingbalance", "balance", "openingbal"],
  asof: ["openingbalanceasof", "asof", "asofdate", "balanceasof", "openingbalancedate", "openingbalanceasofdate"],
  taxid: ["taxid", "businessidno", "businessidnumber", "ein", "ssn", "taxidentificationnumber", "taxpayerid"],
  track1099: ["trackpaymentsfor1099", "1099", "is1099", "track1099", "eligiblefor1099"],
  sku: ["sku", "productsku", "itemsku"],
  type: ["type", "itemtype", "producttype"],
  price: ["salesprice", "price", "salesratecost", "rate", "unitprice", "sellingprice", "salesamount"],
  cost: ["cost", "purchasecost", "unitcost", "purchaseprice"],
  qty: ["quantityonhand", "qtyonhand", "quantity", "qty", "onhand", "initialquantityonhand"],
  qtyasof: ["asofdate", "qtyasof", "quantityasof", "initialquantityasofdate"],
  income: ["incomeaccount", "salesaccount", "income"],
  expense: ["expenseaccount", "purchaseaccount", "cogsaccount", "costofgoodssoldaccount"],
  invasset: ["inventoryassetaccount", "assetaccount", "inventoryasset"],
};
const squash = (h) => String(h).toLowerCase().replace(/[^a-z0-9]/g, "");
const CONCEPT_OF = new Map();
for (const [k, list] of Object.entries(CONCEPTS)) for (const s of list) if (!CONCEPT_OF.has(s)) CONCEPT_OF.set(s, k);
// "As of" is ambiguous between the balance and the quantity; resolved by the kind in conceptOf().
export function conceptOf(heading, kind) {
  const s = squash(heading);
  if (kind === "products" && (s === "asofdate" || s === "asof")) return "qtyasof";
  if (kind !== "products" && s === "asofdate") return "asof";
  return CONCEPT_OF.get(s) || null;
}

const SCI = /^[+-]?\d(\.\d+)?E\+?\d+$/i;
const EXCEL_ERR = /^#(NAME\?|REF!|VALUE!|DIV\/0!|N\/A|NUM!|NULL!)$/i;
const MOJIBAKE = /Ã[\u0080-¿]|Â[ -¿]|â€[\u0080-¿™"]|Ã©|Ã¨|Ã¼|Ã¶|Ã¤|Ã±|�/;
const MAX_PER_CHECK = 40;
const ITEM_TYPES = new Map([["inventory", "Inventory"], ["noninventory", "Non-inventory"], ["service", "Service"], ["bundle", "Bundle"]]);
const num = (v) => /^-?\d+(\.\d+)?$/.test(v);

export function decodeBuffer(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8[0] === 0xff && u8[1] === 0xfe) return "﻿" + new TextDecoder("utf-16le").decode(u8.subarray(2));
  if (u8[0] === 0xfe && u8[1] === 0xff) return "﻿" + new TextDecoder("utf-16be").decode(u8.subarray(2));
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(u8);
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

function detectDelim(text) {
  const first = text.split(/\r?\n/, 1)[0] || "";
  const counts = [",", ";", "\t"].map((d) => [d, first.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

// Names are unique case-insensitively with runs of spaces ignored.
export const nameKey = (v) => String(v).trim().replace(/\s+/g, " ").toLowerCase();

export function cleanMoney(v) {
  let s = String(v).trim().replace(/^\((.*)\)$/, "-$1").replace(/[$£€\s]/g, "").replace(/^([A-Z]{3})(?=[\d-])/, "");
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  else if (/^-?\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  return s;
}

// null when the date reads one way only; otherwise the ambiguity ("dm" | "md") or "bad".
export function dateShape(v) {
  const s = v.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31 ? "iso" : "bad";
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (!m) return "bad";
  const a = +m[1], b = +m[2];
  if (a > 12 && b <= 12) return "dmy";
  if (b > 12 && a <= 12) return "mdy";
  if (a > 12 && b > 12) return "bad";
  return "either";
}

export function taxIdProblem(v) {
  const digits = v.replace(/[^\d]/g, "");
  if (SCI.test(v)) return "was turned into scientific notation by a spreadsheet";
  if (/[^\d\- ]/.test(v)) return "has letters or symbols";
  if (digits.length === 8) return "has 8 digits; a US tax ID has 9, so a leading zero was probably lost";
  if (digits.length !== 9) return `has ${digits.length} digits; a US EIN or SSN has 9`;
  return null;
}

const EMAIL = /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]{2,}$/;

export function validate(input, options = {}) {
  const findings = [];
  const add = (severity, code, line, title, detail) => findings.push({ severity, code, line: line || 0, title, detail });
  const kind = KINDS[options.kind] ? options.kind : "customers";
  const label = KINDS[kind].label;
  const summary = { rows: 0, records: 0, columns: 0, kind, delimiter: ",", chunks: 0, groups: [] };
  let text = String(input ?? "");
  if (new TextEncoder().encode(text).length > SIZE_LIMIT) add("warning", "size", 0, "File is over 2 MB", "Intuit's help pages describe a file size limit of about 2 MB for imports. Split the file and import in parts.");
  if (text.charCodeAt(0) === 0xfeff) { text = text.slice(1); add("info", "bom", 1, "File starts with a byte order mark", "Harmless to most readers; the cleaned copy drops it."); }
  if (!text.trim()) { add("error", "empty", 0, "The file is empty", "Paste the CSV text or choose a file."); return { findings, summary }; }

  const delim = detectDelim(text);
  summary.delimiter = delim;
  if (delim !== ",") add("error", "delimiter", 1, `File is ${delim === ";" ? "semicolon" : "tab"}-separated`, "QuickBooks reads comma-separated files. This happens when a spreadsheet in a comma-decimal locale saves \"CSV\". Apply safe fixes converts it.");
  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) { add("error", "quote", parsed.unterminated, "A quoted cell is never closed", `The quote opened on line ${parsed.unterminated} has no end, so everything after it reads as one cell.`); return { findings, summary }; }
  const rows = parsed.rows.filter((r, i) => i === 0 || r.cells.some((c) => c.trim() !== ""));
  if (!rows.length) { add("error", "empty", 0, "The file is empty", "No rows found."); return { findings, summary }; }

  const head = rows[0].cells.map((h) => h.trim());
  summary.columns = head.length;
  const idx = {};
  head.forEach((h, i) => {
    const c = conceptOf(h, kind);
    if (c && idx[c] === undefined) idx[c] = i;
    else if (c && idx[c] !== undefined) add("warning", "dup-header", rows[0].line, `Two columns both look like "${c}"`, `"${head[idx[c]]}" and "${h}" mean the same thing; the importer maps one column to one field.`);
  });
  head.forEach((h, i) => {
    if (!h) add("warning", "blank-header", rows[0].line, `Column ${i + 1} has no heading`, "A blank heading cannot be mapped to a QuickBooks field.");
    else if (!conceptOf(h, kind)) add("info", "unknown-header", rows[0].line, `Column "${h}" is not one this tool recognises`, "It may still be a valid QuickBooks field or one you map by hand in the import screen; nothing was checked in it.");
  });

  const hasName = idx.name !== undefined;
  const canDeriveName = idx.company !== undefined || (idx.first !== undefined && idx.last !== undefined);
  if (!hasName && kind === "products") { add("error", "no-name", rows[0].line, "No name column", "Each product or service needs a Name. Add a column headed Name."); return { findings, summary }; }
  if (!hasName && !canDeriveName) { add("error", "no-name", rows[0].line, `No column that can name a ${label}`, "QuickBooks needs a Display name, or a Company or First and Last name to build one from. Add a Name column."); return { findings, summary }; }
  if (!hasName) add("info", "derived-name", rows[0].line, "No Name column; names will be built from Company or First and Last", "Check the names QuickBooks shows on the mapping screen, and that they come out unique.");

  const body = rows.slice(1);
  summary.rows = body.length;
  summary.records = body.length;
  summary.chunks = Math.max(1, Math.ceil(body.length / ROW_LIMIT));
  if (body.length === 0) { add("error", "no-rows", 0, "The file has a header and no rows", "Nothing to import."); return { findings, summary }; }
  if (body.length > ROW_LIMIT) add("warning", "row-limit", 0, `${body.length} rows; the commonly documented limit is ${ROW_LIMIT} per import`, `Split into ${summary.chunks} files of up to ${ROW_LIMIT} rows. The tool can write them for you below. The 1,000-row figure is read from memory of Intuit's help pages; check the current limit.`);

  const caps = {};
  const cap = (code) => (caps[code] = (caps[code] || 0) + 1) <= MAX_PER_CHECK;
  const seen = new Map(), seenSku = new Map();
  const dateShapes = new Set();
  const get = (r, c) => (idx[c] === undefined ? "" : (r.cells[idx[c]] ?? ""));

  for (const r of body) {
    const L = r.line;
    if (r.cells.length > head.length) { if (cap("extra")) add("error", "extra-cells", L, `Row has ${r.cells.length} cells but the header has ${head.length}`, "Usually an unquoted comma inside a name or address that pushes every later cell one column right."); }
    else if (r.cells.length < head.length) { if (cap("short")) add("warning", "short-row", L, `Row has ${r.cells.length} cells; the header has ${head.length}`, "Missing trailing cells are read as blank."); }
    r.cells.forEach((c, i) => {
      const v = c.trim();
      if (EXCEL_ERR.test(v) && cap("excelerr")) add("error", "excel-error", L, `${head[i] || "Column " + (i + 1)} holds a spreadsheet error value`, `"${v}" came from a broken formula; fix it in the spreadsheet.`);
      if (MOJIBAKE.test(c) && cap("mojibake")) add("warning", "mojibake", L, `${head[i] || "Column " + (i + 1)} has garbled accented characters`, "Looks like UTF-8 text opened as Windows-1252 and saved again. Re-export from the source as UTF-8.");
      if (c !== v && cap("space") && i === idx.name) add("info", "space", L, `Name has spaces at the start or end`, "QuickBooks may treat \"Acme\" and \"Acme \" as different names, or trim one. Apply safe fixes trims it.");
    });

    // ----- name
    let nm = get(r, "name").trim();
    if (!nm && kind !== "products") {
      nm = get(r, "company").trim() || [get(r, "first").trim(), get(r, "last").trim()].filter(Boolean).join(" ");
    }
    if (!nm) { if (cap("noname")) add("error", "blank-name", L, `No name for this ${label}`, `Every ${label} needs a ${kind === "products" ? "Name" : "Display name"}; QuickBooks rejects a row without one.`); }
    else {
      summary.groups.push({ line: L, handle: nm, title: kind === "products" ? get(r, "type").trim() : get(r, "company").trim(), variants: 1 });
      if ([...nm].length > NAME_LIMIT && cap("longname")) add("error", "name-length", L, `Name is ${[...nm].length} characters; the limit is commonly documented as ${NAME_LIMIT}`, `"${nm.slice(0, 40)}…" will be rejected or cut. Shorten it.`);
      if (/:/.test(nm) && cap("colon")) add("warning", "colon", L, kind === "products" ? "Name contains a colon" : "Name contains a colon, which QuickBooks uses for sub-" + label + "s", kind === "products" ? "In QuickBooks a colon in a product name means a sub-item. If that is not intended, replace it." : `"${nm}" may be created as a sub-${label} of "${nm.split(":")[0].trim()}" or rejected. Replace the colon unless you mean a sub-${label}.`);
      if (/[\u0000-\u001f"\\]/.test(nm) && cap("badchar")) add("warning", "bad-char", L, "Name contains a tab, control character, quote or backslash", "These are commonly refused or stripped in QuickBooks names. Apply safe fixes does not change names; edit it yourself.");
      const k = nameKey(nm);
      if (seen.has(k)) { if (cap("dupname")) add("error", "dup-name", L, `"${nm}" repeats line ${seen.get(k)}`, kind === "products" ? "Product and service names must be unique." : "Display names are unique across customers, vendors and employees in one QuickBooks company, ignoring capitals and extra spaces. Add something to tell them apart (a town, a number)."); }
      else seen.set(k, L);
    }

    // ----- email
    const email = get(r, "email").trim();
    if (email) {
      for (const a of email.split(/[,;]\s*/).filter(Boolean)) {
        if (!EMAIL.test(a) && cap("email")) add("warning", "email", L, `Email "${a}" does not look like an address`, "QuickBooks skips or blanks an email it cannot read.");
      }
    }
    // ----- phone / zip / website
    for (const c of ["phone", "zip", "taxid"]) {
      const v = get(r, c).trim();
      if (v && SCI.test(v) && cap("sci" + c)) add("error", "sci-" + c, L, `${c === "zip" ? "ZIP" : c === "taxid" ? "Tax ID" : "Phone"} "${v}" is scientific notation`, "A spreadsheet rewrote a long number. Format the column as Text and re-enter it; the original digits are gone from this file.");
    }
    const zip = get(r, "zip").trim();
    if (zip && /^\d{4}$/.test(zip) && cap("zip")) add("warning", "zip-zero", L, `ZIP "${zip}" has 4 digits`, "A US ZIP code lost its leading zero when the column was read as a number (common in New England and New Jersey). Format as Text and restore it; the tool does not guess.");
    const web = get(r, "website").trim();
    if (web && /\s/.test(web) && cap("web")) add("warning", "website", L, `Website "${web}" contains a space`, "QuickBooks may drop a website it cannot read.");

    // ----- opening balance
    const bal = get(r, "balance").trim();
    if (bal) {
      const c = cleanMoney(bal);
      if (!num(c) && cap("balfmt")) add("error", "balance-format", L, `Opening balance "${bal}" is not a plain number`, "Use digits and a decimal point. A currency symbol, thousands comma or words are refused.");
      else if (bal !== c && !SCI.test(bal) && cap("balclean")) add("warning", "balance-clean", L, `Opening balance "${bal}" has a symbol or separator`, `Safe fixes writes it as "${c}".`);
      if (num(c) && +c !== 0 && !get(r, "asof").trim() && cap("noasof")) add("warning", "balance-no-date", L, "Opening balance without an \"as of\" date", "QuickBooks needs the date the balance was true on; without it the row can be skipped or dated today.");
    }
    const asof = get(r, "asof").trim();
    if (asof) {
      const s = dateShape(asof);
      if (s === "bad" && cap("asofbad")) add("error", "date-format", L, `Date "${asof}" is not one QuickBooks can read`, "Use month/day/year or year-month-day with a real month and day.");
      else dateShapes.add(s);
    }

    // ----- vendor 1099
    if (kind === "vendors") {
      const t = get(r, "taxid").trim();
      if (t && !SCI.test(t)) { const p = taxIdProblem(t); if (p && cap("taxid")) add("warning", "tax-id", L, `Tax ID "${t.length > 4 ? "…" + t.slice(-4) : t}" ${p}`, "Check it against the vendor's W-9. The tool shows only the last 4 characters."); }
      const f = get(r, "track1099").trim();
      if (f && !/^(yes|no|y|n|true|false|1|0)$/i.test(f) && cap("t1099")) add("warning", "track-1099", L, `"Track payments for 1099" value "${f}" is not Yes or No`, "Use Yes or No.");
      if (/^(yes|y|true|1)$/i.test(f) && !t && cap("t1099id")) add("info", "1099-no-id", L, "Marked for 1099 but no Tax ID", "You will need the vendor's taxpayer ID before filing; collect a W-9.");
    }

    // ----- products
    if (kind === "products") {
      const ty = get(r, "type").trim();
      const tk = ITEM_TYPES.get(squash(ty));
      if (ty && !tk && cap("type")) add("error", "type", L, `Type "${ty}" is not one QuickBooks knows`, "Use Inventory, Non-inventory, Service or Bundle (spelling as shown in QuickBooks).");
      else if (ty && tk !== ty && cap("typecase")) add("warning", "type-case", L, `Type "${ty}" should be written "${tk}"`, "Apply safe fixes rewrites it.");
      if (!ty && cap("notype")) add("warning", "no-type", L, "No Type", "QuickBooks needs to know if it is Inventory, Non-inventory or Service; a blank usually defaults to a Service or is skipped.");
      for (const c of ["price", "cost"]) {
        const v = get(r, c).trim();
        if (!v) continue;
        const cl = cleanMoney(v);
        if (!num(cl) && cap(c + "fmt")) add("error", c + "-format", L, `${c === "price" ? "Sales price" : "Cost"} "${v}" is not a plain number`, "Use digits and a decimal point.");
        else if (v !== cl && cap(c + "clean")) add("warning", c + "-clean", L, `${c === "price" ? "Sales price" : "Cost"} "${v}" has a symbol or separator`, `Safe fixes writes it as "${cl}".`);
        else if (+cl < 0 && cap(c + "neg")) add("warning", c + "-negative", L, `${c === "price" ? "Sales price" : "Cost"} is negative`, "Usually a typo or a refund line that should not be an item.");
      }
      const sku = get(r, "sku").trim();
      if (sku) {
        if (SCI.test(sku) && cap("scisku")) add("error", "sci-sku", L, `SKU "${sku}" is scientific notation`, "A spreadsheet rewrote a long number; the original digits are lost from this file.");
        const sk = sku.toLowerCase();
        if (seenSku.has(sk)) { if (cap("dupsku")) add("error", "dup-sku", L, `SKU "${sku}" repeats line ${seenSku.get(sk)}`, "SKUs should identify one product each."); }
        else seenSku.set(sk, L);
      }
      if (tk === "Inventory") {
        const q = get(r, "qty").trim();
        if (!q && cap("noqty")) add("warning", "inv-qty", L, "Inventory item with no quantity on hand", "Inventory items need an opening quantity and an as-of date, or they start at zero.");
        else if (q && !num(q) && cap("qtyfmt")) add("error", "qty-format", L, `Quantity "${q}" is not a number`, "Use whole or decimal digits.");
        else if (num(q) && +q < 0 && cap("qtyneg")) add("warning", "qty-negative", L, "Negative quantity on hand", "QuickBooks will not accept a negative opening quantity.");
        if (q && !get(r, "qtyasof").trim() && cap("qtyasof")) add("warning", "qty-no-date", L, "Quantity on hand without an as-of date", "The opening quantity needs the date it was counted.");
        if (!get(r, "invasset").trim() && idx.invasset !== undefined && cap("invasset")) add("warning", "inv-asset", L, "Inventory item with no Inventory asset account", "Inventory items need an inventory asset account.");
      }
      if (tk === "Service" && get(r, "qty").trim() && cap("svcqty")) add("warning", "service-qty", L, "A service with a quantity on hand", "Services are not stocked; the quantity will be ignored or rejected.");
      const qa = get(r, "qtyasof").trim();
      if (qa) { const s = dateShape(qa); if (s === "bad" && cap("qabad")) add("error", "date-format", L, `Date "${qa}" is not one QuickBooks can read`, "Use month/day/year or year-month-day."); else dateShapes.add(s); }
      if (!get(r, "income").trim() && idx.income !== undefined && tk !== undefined && cap("income")) add("info", "no-income", L, "No Income account", "QuickBooks will use its default sales account.");
    }
  }

  const shapes = [...dateShapes].filter((s) => s !== "bad");
  if (shapes.includes("dmy") && shapes.includes("mdy")) add("error", "date-mixed", 0, "Dates are written both day/month and month/day", "Some dates only read as day/month and others only as month/day, so the file mixes the two. QuickBooks will read the wrong ones or reject them. Settle on one.");
  else if (shapes.includes("either") && (shapes.includes("dmy") || shapes.includes("mdy"))) add("warning", "date-ambiguous", 0, "Some dates could be read as day/month or month/day", `Other dates in the file are ${shapes.includes("dmy") ? "day/month" : "month/day"}, so a date like 03/04/2026 may be read the other way. Write dates as year-month-day to remove the doubt.`);
  else if (shapes.length === 1 && shapes[0] === "either") add("info", "date-order", 0, "Dates could be day/month or month/day", "Every date has both parts 12 or under, so the file cannot say which; QuickBooks uses your company's region setting. Check one date after importing.");
  const clean = !findings.some((f) => f.severity !== "info");
  if (clean) add("info", "clean", 0, "Nothing found that would normally stop an import", "A clean result is not a promise of success: import a handful of rows first and look at them in QuickBooks.");
  return { findings, summary };
}

export function repair(input, options = {}) {
  let text = String(input ?? "");
  const kind = KINDS[options.kind] ? options.kind : "customers";
  const changes = [];
  if (text.charCodeAt(0) === 0xfeff) { text = text.slice(1); changes.push("Dropped the byte order mark."); }
  if (!text.trim()) return { text: "", changes, error: "The file is empty." };
  const delim = detectDelim(text);
  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) return { text: "", changes, error: "A quoted cell is never closed; fix the quote first." };
  const rows = parsed.rows.map((r) => r.cells.slice());
  const head = rows[0].map((h) => h.trim());
  if (delim !== ",") changes.push(`Converted the ${delim === ";" ? "semicolon" : "tab"} delimiter to commas.`);
  const find = (...cs) => head.map((h, i) => (cs.includes(conceptOf(h, kind)) ? i : -1)).filter((i) => i >= 0);
  const money = find("balance", "price", "cost");
  const nameCols = find("name");
  const typeCols = kind === "products" ? find("type") : [];
  const edit = (ri, ci, to, why) => {
    const from = rows[ri][ci];
    if (from === to) return;
    rows[ri][ci] = to;
    changes.push(`Line ${parsed.rows[ri].line}, ${head[ci] || "column " + (ci + 1)}: "${from}" → "${to}" (${why}).`);
  };
  for (let ri = 1; ri < rows.length; ri++) {
    if (rows[ri].every((c) => c.trim() === "")) continue;
    for (const ci of nameCols) if (rows[ri][ci] !== undefined && rows[ri][ci] !== rows[ri][ci].trim()) edit(ri, ci, rows[ri][ci].trim(), "stray spaces");
    for (const ci of money) {
      const v = rows[ri][ci];
      if (v === undefined) continue;
      const t = v.trim();
      if (t && !num(t) && !SCI.test(t)) { const c = cleanMoney(t); if (num(c)) edit(ri, ci, c, "plain number"); }
      else if (v !== t && t) edit(ri, ci, t, "stray spaces");
    }
    for (const ci of typeCols) {
      const v = rows[ri][ci];
      if (v === undefined) continue;
      const k = ITEM_TYPES.get(squash(v));
      if (k && k !== v) edit(ri, ci, k, "type as QuickBooks spells it");
    }
  }
  return { text: toCsv(rows), changes, error: null };
}

// Header plus up to `size` rows per file, for imports over the row limit.
export function splitRows(input, size = ROW_LIMIT) {
  const text = String(input ?? "").replace(/^\uFEFF/, "");
  const parsed = parseCsv(text, detectDelim(text));
  if (parsed.unterminated || !parsed.rows.length) return [];
  const rows = parsed.rows.map((r) => r.cells);
  const head = rows[0];
  const body = rows.slice(1).filter((r) => r.some((c) => c.trim() !== ""));
  const out = [];
  for (let i = 0; i < body.length; i += size) out.push({ name: `part-${out.length + 1}.csv`, rows: body.slice(i, i + size).length, text: toCsv([head, ...body.slice(i, i + size)]) });
  return out;
}

export function findingsCsv(result) {
  return toCsv([["severity", "line", "code", "title", "detail"], ...result.findings.map((f) => [f.severity, String(f.line || ""), f.code, f.title, f.detail])]);
}

const SAMPLES = {
  customers: [
    ["Display Name", "Company", "First Name", "Last Name", "Email", "Phone", "Billing Street", "Billing City", "Billing State", "Billing ZIP", "Opening Balance", "Opening Balance As Of"],
    ["Hartwell Bakery", "Hartwell Bakery LLC", "Dana", "Hartwell", "dana@hartwellbakery.example", "555-0142", "12 Mill St", "Lowell", "MA", "01852", "1250.00", "2026-01-01"],
    ["Northside Dental", "Northside Dental PC", "Priya", "Nair", "billing@northsidedental.example", "555-0177", "400 Elm Ave", "Salem", "OR", "97301", "0", ""],
    ["Okafor Landscaping", "", "Emeka", "Okafor", "emeka@okaforland.example", "555-0123", "9 Ridge Rd", "Hartford", "CT", "06103", "340.50", "2026-01-01"],
  ],
  vendors: [
    ["Display Name", "Company", "Email", "Phone", "Business ID No.", "Track Payments for 1099", "Opening Balance", "Opening Balance As Of"],
    ["Riverbend Printing", "Riverbend Printing Co", "ar@riverbendprint.example", "555-0188", "12-3456789", "No", "410.00", "2026-01-01"],
    ["Sam Ortiz Design", "", "sam@ortizdesign.example", "555-0150", "123-45-6789", "Yes", "0", ""],
  ],
  products: [
    ["Name", "SKU", "Type", "Sales Price", "Cost", "Quantity on Hand", "As of Date", "Income Account", "Inventory Asset Account"],
    ["Ceramic Mug", "MUG-01", "Inventory", "14.50", "5.20", "60", "2026-01-01", "Sales", "Inventory Asset"],
    ["Gift Wrap", "WRAP-01", "Non-inventory", "3.00", "", "", "", "Sales", ""],
    ["Consulting hour", "CONS-01", "Service", "95.00", "", "", "", "Services", ""],
  ],
};
const BROKEN = {
  customers: [
    SAMPLES.customers[0],
    ["Hartwell Bakery", "Hartwell Bakery LLC", "Dana", "Hartwell", "dana@hartwellbakery", "5.55E+09", "12 Mill St", "Lowell", "MA", "1852", "$1,250.00", ""],
    ["hartwell  bakery ", "", "", "", "dana@hartwellbakery.example", "555-0142", "", "", "", "", "0", ""],
    ["Okafor: Lawn Care", "", "Emeka", "Okafor", "emeka@okaforland.example", "555-0123", "", "", "CT", "06103", "340,50", "13/01/2026"],
    ["Northside Dental", "", "Priya", "Nair", "", "", "", "", "OR", "97301", "20", "03/04/2026"],
  ],
  vendors: [
    SAMPLES.vendors[0],
    ["Riverbend Printing", "", "ar@riverbendprint.example", "555-0188", "12-345678", "No", "410.00", "2026-01-01"],
    ["riverbend printing", "", "ar@riverbendprint", "555-0188", "1.23E+08", "Maybe", "$410", "2026-01-01"],
    ["Sam Ortiz Design", "", "sam@ortizdesign.example", "555-0150", "", "Yes", "0", ""],
  ],
  products: [
    SAMPLES.products[0],
    ["Ceramic Mug", "1.23457E+12", "inventory", "$14.50", "5,20", "", "", "Sales", ""],
    ["Ceramic Mug", "MUG-01", "Inventory", "14.50", "5.20", "-4", "2026-01-01", "Sales", ""],
    ["Gift Wrap: Large", "WRAP-01", "Service", "3.00", "", "5", "", "Sales", ""],
    ["Gift Wrap Small", "WRAP-01", "Stuff", "free", "", "", "", "", ""],
  ],
};
export function sampleFile(kind = "customers") { return toCsv(SAMPLES[kind] || SAMPLES.customers); }
export function sampleBrokenFile(kind = "customers") { return toCsv(BROKEN[kind] || BROKEN.customers); }
