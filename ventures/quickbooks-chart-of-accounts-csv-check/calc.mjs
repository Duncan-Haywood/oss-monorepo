// QuickBooks Online import CSV checker (customers, vendors, products and services, chart of
// accounts). Pure functions, no DOM, no network. Field names and limits are read from memory of
// Intuit's public import help pages; no QuickBooks import was available when this was built, and
// QuickBooks lets you map columns by hand, so heading names are advisory, not required.

export const KINDS = ["customers", "vendors", "products", "accounts"];
export const KIND_LABEL = { customers: "Customers", vendors: "Vendors", products: "Products and services", accounts: "Chart of accounts" };
export const SEVERITIES = ["error", "warning", "info"];
export const ROW_LIMIT = 1000;

const addr = (p, al = true) => [
  { name: `${p}Address Line 1`, aliases: al ? ["street", "address", "addressline1", "street1", "streetaddress", "address1"] : [] },
  { name: `${p}Address Line 2`, aliases: al ? ["addressline2", "street2", "address2"] : [] },
  { name: `${p}City`, aliases: al ? ["town"] : [] },
  { name: `${p}State`, type: "state", aliases: al ? ["province", "stateprovince", "region"] : [] },
  { name: `${p}ZIP`, type: "zip", aliases: al ? ["zipcode", "postalcode", "postcode", "zippostal"] : [] },
  { name: `${p}Country`, aliases: [] },
];
const person = [
  { name: "Title" }, { name: "First Name", aliases: ["firstname", "given", "givenname"] }, { name: "Middle Name" },
  { name: "Last Name", aliases: ["surname", "familyname"] }, { name: "Suffix" },
];
const contact = [
  { name: "Email", type: "email", aliases: ["emailaddress", "mail", "email1"] },
  { name: "Phone", type: "phone", aliases: ["telephone", "phonenumber", "tel", "mainphone"] },
  { name: "Mobile", type: "phone", aliases: ["cell", "mobilephone", "cellphone"] },
  { name: "Fax", type: "phone" },
  { name: "Website", type: "url", aliases: ["web", "url", "site"] },
];
const dn = (extra = []) => ({ name: "Display Name", required: true, max: 100, aliases: ["name", "customer", "customername", "vendor", "vendorname", "fullname", "displayedname", ...extra] });

export const FIELDS = {
  customers: [
    dn(), ...person, { name: "Company", max: 100, aliases: ["companyname", "business"] }, ...contact,
    ...addr("Billing "), ...addr("Shipping ", false),
    { name: "Notes", max: 4000, aliases: ["note", "memo"] },
    { name: "Terms", type: "terms", aliases: ["paymentterms"] }, { name: "Payment Method" }, { name: "Delivery Method" },
    { name: "Opening Balance", type: "money", aliases: ["openingbal", "balance"] },
    { name: "Opening Balance As Of", type: "date", aliases: ["asof", "balanceasof", "openingbalancedate"] },
    { name: "Tax Resale Number", aliases: ["resalenumber", "resaleno"] },
  ],
  vendors: [
    dn(), ...person, { name: "Company", max: 100, aliases: ["companyname", "business"] }, { name: "Print On Check As", max: 110, aliases: ["printoncheckname", "checkname", "printname"] },
    ...contact, ...addr(""),
    { name: "Account Number", type: "digits", aliases: ["accountno", "vendoraccount", "acct"] },
    { name: "Tax ID", type: "taxid", aliases: ["businessidnumber", "businessid", "ein", "ssn", "taxpayerid", "tin", "federalid"] },
    { name: "Billing Rate", type: "money", aliases: ["billrate", "hourlyrate"] },
    { name: "Terms", type: "terms", aliases: ["paymentterms"] },
    { name: "Opening Balance", type: "money", aliases: ["openingbal", "balance"] },
    { name: "Opening Balance As Of", type: "date", aliases: ["asof", "balanceasof", "openingbalancedate"] },
    { name: "Track Payments For 1099", type: "yn", aliases: ["1099", "eligiblefor1099", "track1099"] },
  ],
  products: [
    { name: "Name", required: true, max: 100, aliases: ["productname", "itemname", "productservicename", "item", "product"] },
    { name: "SKU", type: "digits", aliases: ["sku", "itemcode", "partnumber"] },
    { name: "Type", type: "ptype", aliases: ["itemtype", "producttype"] },
    { name: "Description", max: 4000, aliases: ["salesdescription", "salesdesc"] },
    { name: "Price", type: "money", aliases: ["rate", "salesprice", "unitprice", "sellingprice"] },
    { name: "Income Account", aliases: ["incomeacct", "salesaccount"] },
    { name: "Expense Account", aliases: ["expenseacct", "cogsaccount", "purchaseaccount"] },
    { name: "Cost", type: "money", aliases: ["purchasecost", "unitcost"] },
    { name: "Taxable", type: "yn", aliases: ["istaxable", "salestaxable"] },
    { name: "Quantity On Hand", type: "num", aliases: ["qtyonhand", "quantity", "qty", "onhand"] },
    { name: "Reorder Point", type: "num", aliases: ["reorderlevel", "reorderqty"] },
    { name: "Inventory Asset Account", aliases: ["assetaccount", "inventoryaccount"] },
    { name: "Quantity As Of", type: "date", aliases: ["asofdate", "inventoryasofdate", "qtyasof", "asof"] },
    { name: "Purchase Description", max: 4000, aliases: ["purchasedesc", "purchasinginformation"] },
    { name: "Category", aliases: ["parentcategory", "productcategory"] },
  ],
  accounts: [
    { name: "Account Name", required: true, max: 100, aliases: ["name", "account", "accountfullname"] },
    { name: "Number", type: "digits", aliases: ["accountnumber", "acctno", "accountno", "acctnumber", "code"] },
    { name: "Type", required: true, type: "atype", aliases: ["accounttype"] },
    { name: "Detail Type", aliases: ["accountdetailtype", "subtype", "detailedtype"] },
    { name: "Description", max: 4000, aliases: ["desc"] },
    { name: "Balance", type: "money", aliases: ["openingbalance", "startingbalance"] },
    { name: "Balance As Of", type: "date", aliases: ["asof", "balancedate", "openingbalanceasof"] },
  ],
};

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

// Maps a heading to {field, exact}. exact: same letters as the canonical name, only case,
// spacing or punctuation differ, so renaming it is safe.
function mapHeading(kind, h) {
  const n = norm(h);
  if (!n) return null;
  for (const f of FIELDS[kind]) if (norm(f.name) === n) return { field: f, exact: true };
  for (const f of FIELDS[kind]) if ((f.aliases || []).includes(n)) return { field: f, exact: false };
  return null;
}

export function detectKind(headers) {
  const set = new Set(headers.map(norm));
  const has = (...k) => k.some((x) => set.has(x));
  if (has("detailtype", "accountdetailtype", "accounttype", "accountname")) return "accounts";
  if (has("incomeaccount", "quantityonhand", "qtyonhand", "inventoryassetaccount", "sku", "productname", "itemname", "purchasecost", "reorderpoint")) return "products";
  if (has("taxid", "businessidnumber", "ein", "billingrate", "printoncheckas", "track1099", "accountnumber", "vendor", "vendorname")) return "vendors";
  return "customers";
}

const US_STATES = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
  "district of columbia": "DC", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "puerto rico": "PR",
};
const STATE_CODES = new Set(Object.values(US_STATES));
const LEADING_ZERO_STATES = new Set(["CT", "MA", "ME", "NH", "NJ", "RI", "VT", "PR"]);
const US_COUNTRY = /^(|us|usa|u\.s\.a?\.?|united states( of america)?)$/i;

const TERMS = ["due on receipt", "net 15", "net 30", "net 60", "net 90", "net 10", "net 7", "net 45", "due on delivery", "due end of month", "due end of next month", "2% 10 net 30", "1% 10 net 30", "cod", "prepaid"];
const PTYPES = { inventory: "Inventory", noninventory: "Non-inventory", service: "Service", bundle: "Bundle", nonstock: "Non-inventory", services: "Service", inventoryitem: "Inventory", product: "Non-inventory" };
const ATYPES = {
  bank: "Bank", accountsreceivable: "Accounts receivable (A/R)", accountsreceivablear: "Accounts receivable (A/R)", ar: "Accounts receivable (A/R)",
  othercurrentassets: "Other Current Assets", othercurrentasset: "Other Current Assets", fixedassets: "Fixed Assets", fixedasset: "Fixed Assets",
  otherassets: "Other Assets", otherasset: "Other Assets", accountspayable: "Accounts payable (A/P)", accountspayableap: "Accounts payable (A/P)", ap: "Accounts payable (A/P)",
  creditcard: "Credit Card", othercurrentliabilities: "Other Current Liabilities", othercurrentliability: "Other Current Liabilities",
  longtermliabilities: "Long Term Liabilities", longtermliability: "Long Term Liabilities", equity: "Equity", income: "Income",
  costofgoodssold: "Cost of Goods Sold", cogs: "Cost of Goods Sold", expenses: "Expenses", expense: "Expenses", otherincome: "Other Income", otherexpense: "Other Expense", otherexpenses: "Other Expense",
};
const PNL_TYPES = new Set(["Income", "Cost of Goods Sold", "Expenses", "Other Income", "Other Expense"]);
const SCI = /^[+-]?\d(\.\d+)?e[+-]?\d+$/i;
const isNum = (v) => /^-?\d+(\.\d+)?$/.test(v);
const DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function decodeBuffer(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return new TextDecoder("utf-8").decode(u8);
}

// RFC 4180-ish: quoted fields, doubled quotes, newlines inside quotes. Tracks the physical
// line each record starts on so findings can name it.
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
  const firstLine = text.split("\n", 1)[0];
  const count = (c) => firstLine.split(c).length - 1;
  if (count(",") === 0 && count(";") > 0) return ";";
  if (count(",") === 0 && count("\t") > 0) return "\t";
  return ",";
}

export function cleanMoney(v) {
  let s = String(v).trim().replace(/[ \s]/g, "");
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/^-/.test(s)) { neg = true; s = s.slice(1); }
  s = s.replace(/^[$€£¥]/, "").replace(/(USD|EUR|GBP|CAD|AUD)$/i, "");
  if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  if (/^\d+(\.\d+)?-$/.test(s)) { neg = true; s = s.slice(0, -1); }
  return neg && isNum(s) && Number(s) !== 0 ? `-${s}` : s;
}

function parseDate(s) {
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (m) return { kind: "slash", a: +m[1], b: +m[2], y: m[3].length === 2 ? null : +m[3], short: m[3].length === 2 };
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return { kind: "iso", y: +m[1], mo: +m[2], d: +m[3] };
  if (/^[A-Za-z]{3,9}\.? \d{1,2},? \d{4}$/.test(s) || /^\d{1,2} [A-Za-z]{3,9}\.? \d{4}$/.test(s)) return { kind: "text" };
  if (/^\d{5}$/.test(s) && +s > 30000 && +s < 70000) return { kind: "serial" };
  return null;
}
const dayOk = (y, mo, d) => mo >= 1 && mo <= 12 && d >= 1 && d <= (mo === 2 && y !== null && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 28 : DAYS[mo - 1]);

function nearest(word, table) {
  const n = norm(word);
  let best = null, bestD = 99;
  for (const [k, v] of Object.entries(table)) {
    const m = k.length, w = n.length;
    let prev = Array.from({ length: w + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= w; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (k[i - 1] === n[j - 1] ? 0 : 1));
      prev = cur;
    }
    if (prev[w] < bestD) { bestD = prev[w]; best = v; }
  }
  return bestD <= Math.max(1, Math.floor(n.length / 4)) ? best : null;
}

const emailOk = (e) => /^[^\s@,;<>()"]+@[^\s@,;<>()"]+\.[A-Za-z]{2,}$/.test(e);

export function validate(input, kindArg = "auto") {
  const findings = [];
  const add = (severity, code, line, title, detail) => findings.push({ severity, code, line, title, detail });
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const summary = { rows: 0, kind: null, columns: 0, delimiter: ",", mapped: 0, groups: [] };
  if (!text.trim()) { add("error", "empty", 0, "The file is empty", "Paste or choose a QuickBooks import CSV."); return { findings, summary }; }

  if (text.includes("�")) add("warning", "encoding", 0, "The file contains replacement characters", "Characters such as � mean the file was saved in a legacy encoding and read as UTF-8. Re-export as CSV UTF-8, or accents in names will import damaged.");
  if (/Ã[\u0080-¿]|â€[™œ"˜]/.test(text)) add("warning", "mojibake", 0, "Text looks double-encoded", "Sequences like Ã© or â€™ usually mean UTF-8 was saved as Windows-1252 and re-read. Fix the encoding before importing.");

  const delim = detectDelim(text);
  summary.delimiter = delim;
  if (delim !== ",") add("error", "delimiter", 1, `The file is ${delim === ";" ? "semicolon" : "tab"}-separated`, 'QuickBooks reads a comma-separated file. Excel in many European locales saves CSV with semicolons. Re-save as "CSV UTF-8 (Comma delimited)" or use the safe fixes below.');

  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) {
    add("error", "quote", parsed.unterminated, "A quoted cell is never closed", `A cell opened with a double quote on line ${parsed.unterminated} has no closing quote, so everything after it is read as one cell. An unescaped quote inside a Notes or Description cell is the usual cause: inside a quoted cell a literal quote must be doubled ("").`);
    return { findings, summary };
  }
  const rows = parsed.rows;
  const header = rows[0].cells.map((h) => h.trim());
  summary.columns = header.length;
  const kind = KINDS.includes(kindArg) ? kindArg : detectKind(header);
  summary.kind = kind;
  const fields = FIELDS[kind];

  const colField = []; // per column: field or null
  const seen = new Map();
  header.forEach((h, i) => {
    if (h === "") { add("warning", "blank-header", 1, `Column ${i + 1} has no name`, "An unnamed column cannot be mapped and is ignored. Often a stray trailing comma."); colField[i] = null; return; }
    const m = mapHeading(kind, h);
    if (!m) {
      colField[i] = null;
      add("info", "unmapped-header", 1, `Column "${h}" does not match a ${KIND_LABEL[kind].toLowerCase()} field`, "QuickBooks will ask you to map it by hand in the import screen, or you can leave it unmapped and it is skipped. If this is the wrong kind of file, pick the right type above.");
      return;
    }
    if (seen.has(m.field.name)) { add("error", "dup-header", 1, `Two columns map to "${m.field.name}"`, `Columns ${seen.get(m.field.name) + 1} and ${i + 1} (${header[seen.get(m.field.name)]} and ${h}) both look like "${m.field.name}". QuickBooks maps only one of them; delete or rename the other.`); colField[i] = null; return; }
    seen.set(m.field.name, i);
    colField[i] = m.field;
    summary.mapped++;
    if (!m.exact) add("info", "alias-header", 1, `Column "${h}" will need mapping to "${m.field.name}"`, "The heading is a common variant. QuickBooks suggests a match in the import screen; check it points at the right field.");
  });
  const idx = Object.fromEntries([...seen.entries()]);
  for (const f of fields) if (f.required && idx[f.name] === undefined) add("error", "missing-required", 1, `There is no "${f.name}" column`, `QuickBooks needs ${f.name} to create each ${kind === "accounts" ? "account" : kind === "products" ? "product or service" : kind.slice(0, -1)}. Add the column or rename the one that holds it.`);
  if (idx[fields[0].name] === undefined && !(idx["First Name"] !== undefined || idx["Company"] !== undefined)) return { findings, summary };

  const get = (r, name) => (idx[name] === undefined ? "" : (r.cells[idx[name]] ?? ""));
  const data = [];
  let blank = 0;
  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri];
    summary.rows++;
    if (r.cells.every((c) => c.trim() === "")) { blank++; continue; }
    if (r.cells.length > header.length) add("error", "extra-cells", r.line, `Row has ${r.cells.length} cells but the header has ${header.length}`, "An unquoted comma in a company name, address or Notes pushed the following cells one column to the right. Quote the cell that contains the comma.");
    else if (r.cells.length < header.length) add("warning", "short-row", r.line, `Row has ${r.cells.length} cells but the header has ${header.length}`, "Missing trailing cells are read as blank. Check that no cell was lost.");
    data.push(r);
  }
  if (blank) add("info", "blank-rows", 0, `${blank} blank row${blank === 1 ? "" : "s"} skipped`, "Blank rows are harmless but usually mean a spreadsheet range was exported wider than the data.");
  if (data.length > ROW_LIMIT) add("warning", "row-limit", 0, `${data.length} rows is more than ${ROW_LIMIT}`, `QuickBooks Online imports about ${ROW_LIMIT} rows per file (from memory; check the current limit). Use the split button to get files of ${ROW_LIMIT} rows, each with the header.`);

  // Date convention across the file.
  let dmyEvidence = 0, mdyEvidence = 0, ambiguous = 0;
  const dateCols = fields.filter((f) => f.type === "date" && idx[f.name] !== undefined);
  for (const r of data) for (const f of dateCols) {
    const p = parseDate(get(r, f.name).trim());
    if (p && p.kind === "slash") { if (p.a > 12 && p.b <= 12) dmyEvidence++; else if (p.b > 12 && p.a <= 12) mdyEvidence++; else if (p.a !== p.b && p.a <= 12 && p.b <= 12) ambiguous++; }
  }
  const order = dmyEvidence && !mdyEvidence ? "dmy" : "mdy";
  if (dmyEvidence && mdyEvidence) add("error", "date-order-mixed", 0, "Dates mix day-first and month-first", `Some dates can only be day/month (first number above 12) and others only month/day. Pick one order for the whole column before importing.`);
  else if (!dmyEvidence && !mdyEvidence && ambiguous) add("info", "date-ambiguous", 0, `${ambiguous} date${ambiguous === 1 ? " is" : "s are"} readable as day/month or month/day`, "A date such as 03/04/2024 is March 4 in a US-region company and April 3 elsewhere. QuickBooks reads dates using the company's region setting, so check yours before importing.");

  const names = new Map(), numbers = new Map(), skus = new Map(), taxIds = new Map();
  const nameKey = kind === "accounts" ? "Account Name" : kind === "products" ? "Name" : "Display Name";
  const allNames = new Set(data.map((r) => get(r, nameKey).trim().toLowerCase()).filter(Boolean));
  const rowOfName = new Map();
  for (const r of data) {
    const L = r.line;
    const label = get(r, nameKey).trim() || (kind !== "accounts" && kind !== "products" ? [get(r, "First Name"), get(r, "Last Name")].filter((x) => x.trim()).join(" ") || get(r, "Company").trim() : "") || "this row";
    summary.groups.push({ line: L, name: label, detail: kind === "accounts" ? [get(r, "Type"), get(r, "Detail Type")].filter(Boolean).join(" / ") : kind === "products" ? get(r, "Type") : (get(r, "Email") || get(r, "Company")) });

    for (const f of fields) {
      if (idx[f.name] === undefined) continue;
      const raw = get(r, f.name);
      const v = raw.trim();
      if (raw !== v && v) add("warning", "whitespace", L, `${f.name} has spaces around it`, `"${raw.replace(/ /g, "[nbsp]")}" has leading or trailing spaces, which QuickBooks treats as part of the value. A duplicate check can miss a name that differs only by a trailing space.`);
      if (!v) { if (f.required) add("error", "required-blank", L, `${f.name} is blank`, `QuickBooks skips a row with no ${f.name}.`); continue; }
      if (f.max && v.length > f.max) add("warning", "too-long", L, `${f.name} is ${v.length} characters (limit about ${f.max})`, "QuickBooks cuts or rejects text over its limit (from memory; check the current limit).");
      if (["digits", "phone", "taxid", "zip"].includes(f.type) && SCI.test(v)) add("error", "sci", L, `${f.name} "${v}" is in scientific notation`, "Excel rewrote a long number and the original digits are gone. Format the column as Text in the spreadsheet and re-enter the values, or re-export without opening the file in Excel.");
      else if (f.type === "email") {
        if (/^mailto:/i.test(v)) add("warning", "email-mailto", L, `Email "${v.slice(0, 40)}" starts with mailto:`, "The prefix is removed by the safe fixes.");
        const parts = v.replace(/^mailto:/i, "").split(/[,;]/).map((x) => x.trim()).filter(Boolean);
        for (const p of parts) if (!emailOk(p)) add("error", "email", L, `Email "${p.slice(0, 50)}" is not a valid address`, "An address needs one @, no spaces and a dotted domain. QuickBooks rejects a row with a malformed email on some imports and silently drops it on others.");
      } else if (f.type === "phone") {
        const digits = v.replace(/\D/g, "");
        if (/[A-Za-z]/.test(v.replace(/\b(ext|x|extension)\b\.?\s*\d+$/i, ""))) add("warning", "phone-letters", L, `${f.name} "${v}" contains letters`, "Only digits, spaces, dashes, brackets and a leading + or an extension are expected.");
        else if (digits.length < 7 || digits.length > 15) add("warning", "phone-length", L, `${f.name} "${v}" has ${digits.length} digits`, "A usable number has 7 to 15 digits. A short one is often a lost area code or a number cut off by Excel.");
        if (v.length > 21) add("warning", "phone-long", L, `${f.name} is ${v.length} characters (limit about 21)`, "QuickBooks truncates long phone fields (from memory).");
      } else if (f.type === "url") {
        if (!/\./.test(v) || /\s/.test(v)) add("info", "website", L, `Website "${v.slice(0, 40)}" does not look like an address`, "Expected something like www.example.com.");
      } else if (f.type === "money") {
        if (!isNum(v)) { const c = cleanMoney(v); add("error", "money", L, `${f.name} "${v}" is not a plain number`, isNum(c) ? `QuickBooks wants digits, an optional minus sign and a decimal point. Use ${c}; the safe fixes do it.` : "QuickBooks wants digits, an optional minus sign and a decimal point, with no currency symbol, text or thousands separator."); }
      } else if (f.type === "num") {
        if (!isNum(v)) add("error", "number", L, `${f.name} "${v}" is not a number`, "Digits and a decimal point only.");
        else if (Number(v) < 0) add("warning", "negative-qty", L, `${f.name} is negative`, "A negative opening quantity puts stock below zero.");
      } else if (f.type === "digits") {
        if (/\s/.test(v) && f.name === "SKU") add("info", "sku-space", L, `SKU "${v}" contains a space`, "Spaces in a SKU make later lookups and exports easy to get wrong.");
      } else if (f.type === "taxid") {
        const d = v.replace(/[-\s]/g, "");
        if (!/^\d+$/.test(d)) add("warning", "taxid", L, `Tax ID "${v}" is not digits`, "A US EIN or SSN is nine digits, written 12-3456789 or 123-45-6789.");
        else if (d.length === 8) add("error", "taxid-zero", L, `Tax ID "${v}" has 8 digits`, "A US tax ID has nine digits. Excel drops a leading zero, so one has probably been lost. Format the column as Text and re-enter it.");
        else if (d.length !== 9) add("warning", "taxid", L, `Tax ID "${v}" has ${d.length} digits`, "A US EIN or SSN is nine digits.");
        else { const k = d; if (!taxIds.has(k)) taxIds.set(k, L); else add("warning", "dup-taxid", L, `Tax ID repeats line ${taxIds.get(k)}`, "Two vendor rows with the same tax ID are often the same business entered twice, which splits its 1099 totals."); }
      } else if (f.type === "state") {
        const country = get(r, f.name.replace("State", "Country")).trim();
        if (US_COUNTRY.test(country)) {
          const full = US_STATES[v.toLowerCase()];
          if (full) add("warning", "state-name", L, `${f.name} "${v}" is spelled out`, `Use the two-letter code ${full}; the safe fixes do it.`);
          else if (!STATE_CODES.has(v.toUpperCase()) && !/^(AA|AE|AP|AS|GU|MP|VI)$/i.test(v)) add("warning", "state", L, `${f.name} "${v}" is not a US state code`, "Expected a two-letter code such as CA. If the address is not in the US, fill the country column.");
          else if (v !== v.toUpperCase() && v.length === 2) add("info", "state-case", L, `${f.name} "${v}" is lower case`, "Written as a two-letter capital code by the safe fixes.");
        }
      } else if (f.type === "zip") {
        const stateName = f.name.replace("ZIP", "State");
        const stRaw = get(r, stateName).trim(), st = US_STATES[stRaw.toLowerCase()] || stRaw.toUpperCase(), country = get(r, f.name.replace("ZIP", "Country")).trim();
        const d = v.replace(/\D/g, "");
        if (US_COUNTRY.test(country)) {
          if (/^\d{4}$/.test(v) && (LEADING_ZERO_STATES.has(st) || !st)) add("error", "zip-zero", L, `${f.name} "${v}" has four digits`, `A US ZIP has five. Excel strips the leading zero from ZIP codes such as 02134 and 07030${st ? ` (${st} codes start with 0)` : ""}. Format the column as Text and re-enter it.`);
          else if (/^\d{4}$/.test(v)) add("warning", "zip-length", L, `${f.name} "${v}" has four digits`, "A US ZIP has five digits.");
          else if (/^\d{9}$/.test(v)) add("info", "zip-plus4", L, `${f.name} "${v}" is nine digits without a hyphen`, "Write ZIP+4 as 12345-6789.");
          else if (!/^\d{5}(-\d{4})?$/.test(v) && d.length !== 5) add("warning", "zip", L, `${f.name} "${v}" is not a US ZIP code`, "Expected 12345 or 12345-6789.");
        }
      } else if (f.type === "terms") {
        if (!TERMS.includes(v.toLowerCase())) add("info", "terms", L, `Terms "${v}" is not a standard term`, "QuickBooks uses a term only if one with exactly that name already exists in the company. Create it first, or the field is left blank.");
      } else if (f.type === "ptype") {
        const t = PTYPES[norm(v)];
        if (!t) { const n = nearest(v, PTYPES); add("error", "ptype", L, `Type "${v}" is not a product type`, `Use Inventory, Non-inventory, Service or Bundle.${n ? ` Did you mean ${n}?` : ""}`); }
        else if (t !== v) add("info", "ptype-case", L, `Type "${v}" is read as ${t}`, "Spelling differs from QuickBooks' own; it should still map, but check the preview.");
      } else if (f.type === "atype") {
        const t = ATYPES[norm(v)];
        if (!t) { const n = nearest(v, ATYPES); add("error", "atype", L, `Type "${v}" is not a QuickBooks account type`, `Use one of: Bank, Accounts receivable (A/R), Other Current Assets, Fixed Assets, Other Assets, Accounts payable (A/P), Credit Card, Other Current Liabilities, Long Term Liabilities, Equity, Income, Cost of Goods Sold, Expenses, Other Income, Other Expense.${n ? ` Did you mean ${n}?` : ""}`); }
      } else if (f.type === "yn") {
        if (!/^(y|yes|n|no|true|false|1|0)$/i.test(v)) add("warning", "yn", L, `${f.name} "${v}" is not Yes or No`, "Use Yes or No.");
      } else if (f.type === "date") {
        const p = parseDate(v);
        if (!p) add("error", "date", L, `${f.name} "${v}" is not a date`, "Use a date like 12/31/2023 in your company's order, or 2023-12-31.");
        else if (p.kind === "serial") add("error", "date-serial", L, `${f.name} "${v}" is an Excel date serial number`, "The cell lost its date format. Format the column as Date, or retype the dates.");
        else if (p.kind === "iso" && !dayOk(p.y, p.mo, p.d)) add("error", "date-invalid", L, `${f.name} "${v}" is not a real date`, "The month or day is out of range.");
        else if (p.kind === "slash") {
          const [d, mo] = order === "dmy" ? [p.a, p.b] : [p.b, p.a];
          if (!dayOk(p.y, mo, d)) add("error", "date-invalid", L, `${f.name} "${v}" is not a real date${order === "mdy" ? " (read month first)" : " (read day first)"}`, "The month or day is out of range for the order the rest of the file uses.");
          else if (p.short) add("info", "date-2digit", L, `${f.name} "${v}" has a two-digit year`, "Use a four-digit year; two-digit years are read as 19xx or 20xx depending on the importer.");
        }
      }
    }

    // Row-level rules per kind.
    if (kind === "customers" || kind === "vendors") {
      const name = get(r, "Display Name").trim();
      if (!name && idx["Display Name"] !== undefined) {
        const guess = [get(r, "First Name"), get(r, "Last Name")].map((x) => x.trim()).filter(Boolean).join(" ") || get(r, "Company").trim();
        if (guess) add("warning", "display-name-derived", L, `Display Name is blank but the row has "${guess}"`, "Fill Display Name. Depending on the import, QuickBooks skips the row or builds a name you did not choose.");
      }
      if (name) {
        const key = name.toLowerCase();
        if (names.has(key)) add("error", "dup-name", L, `Display Name "${name}" repeats line ${names.get(key)}`, "A display name must be unique across customers, vendors and employees. QuickBooks rejects or skips the second row.");
        else names.set(key, L);
        if (name.includes(":")) add("warning", "name-colon", L, `Display Name "${name.slice(0, 40)}" contains a colon`, "A colon marks a sub-customer (Parent:Child) in QuickBooks, so the part before it must already exist. If it is part of the real name, remove it.");
        if (/[\t\n]/.test(name)) add("error", "name-control", L, "Display Name contains a tab or line break", "Remove it; it breaks the name in lists and on forms.");
      }
      const bal = get(r, "Opening Balance").trim(), asOf = get(r, "Opening Balance As Of").trim();
      if (bal && Number(bal) !== 0 && !asOf && idx["Opening Balance As Of"] !== undefined) add("warning", "asof-missing", L, "Opening Balance has no As Of date", "QuickBooks needs the date the balance is as of; without it the balance is skipped or dated the import day.");
      if (asOf && !bal) add("info", "asof-no-balance", L, "As Of date given but no Opening Balance", "The date is ignored.");
      if (kind === "vendors" && get(r, "Track Payments For 1099").trim() && /^(y|yes|true|1)$/i.test(get(r, "Track Payments For 1099").trim()) && !get(r, "Tax ID").trim()) add("warning", "1099-no-taxid", L, "Vendor is set to track 1099 payments but has no Tax ID", "A 1099-NEC needs the payee's TIN. Collect a W-9 before year end.");
    }
    if (kind === "products") {
      const name = get(r, "Name").trim();
      if (name) {
        const key = name.toLowerCase();
        if (names.has(key)) add("error", "dup-name", L, `Name "${name}" repeats line ${names.get(key)}`, "Product and service names must be unique. QuickBooks skips the duplicate or updates the first.");
        else names.set(key, L);
      }
      const sku = get(r, "SKU").trim();
      if (sku) { if (skus.has(sku)) add("warning", "dup-sku", L, `SKU "${sku}" repeats line ${skus.get(sku)}`, "Two products with one SKU make scans and reports ambiguous."); else skus.set(sku, L); }
      const t = PTYPES[norm(get(r, "Type"))];
      if (t === "Inventory") {
        if (idx["Quantity On Hand"] !== undefined && !get(r, "Quantity On Hand").trim()) add("info", "qty-blank", L, `Inventory item "${label}" has no Quantity On Hand`, "QuickBooks starts it at zero.");
        if (get(r, "Quantity On Hand").trim() && !get(r, "Quantity As Of").trim() && idx["Quantity As Of"] !== undefined) add("warning", "qty-asof", L, `Inventory item "${label}" has a quantity but no As Of date`, "QuickBooks needs a date for the opening quantity.");
        if (idx["Inventory Asset Account"] !== undefined && !get(r, "Inventory Asset Account").trim()) add("warning", "asset-account", L, `Inventory item "${label}" has no Inventory Asset Account`, "Each inventory item needs an asset account to post its stock value to.");
      } else if (t && (get(r, "Quantity On Hand").trim() || get(r, "Reorder Point").trim())) add("warning", "qty-noninventory", L, `${t} item "${label}" has a stock quantity`, "Only Inventory items track quantities. The quantity is ignored.");
      if (idx["Income Account"] !== undefined && !get(r, "Income Account").trim()) add("warning", "income-blank", L, `"${label}" has no Income Account`, "Without one, QuickBooks assigns a default (usually Sales) which may not be the account you report on.");
      const price = get(r, "Price").trim(), cost = get(r, "Cost").trim();
      if (isNum(price) && isNum(cost) && Number(price) > 0 && Number(cost) > Number(price)) add("info", "negative-margin", L, `"${label}" costs more (${cost}) than it sells for (${price})`, "That is a negative margin. Fine for a loss leader, a typo otherwise.");
    }
    if (kind === "accounts") {
      const name = get(r, "Account Name").trim();
      if (name) {
        const key = name.toLowerCase();
        if (names.has(key)) add("error", "dup-name", L, `Account "${name}" repeats line ${names.get(key)}`, "Account names must be unique (a sub-account is written Parent:Child).");
        else names.set(key, L);
        rowOfName.set(key, L);
        if (name.includes(":")) {
          const parent = name.slice(0, name.lastIndexOf(":")).trim().toLowerCase();
          if (parent && !allNames.has(parent)) add("info", "parent-missing", L, `Sub-account "${name.slice(0, 50)}" has a parent that is not in this file`, "That is fine if the parent already exists in the company; otherwise add it, above this row.");
          else if (parent && rowOfName.get(parent) === undefined) add("warning", "parent-order", L, `Sub-account "${name.slice(0, 50)}" comes before its parent`, "Put the parent row first, or the child may be created with no parent.");
        }
      }
      const num = get(r, "Number").trim();
      if (num) { if (numbers.has(num)) add("error", "dup-number", L, `Account number ${num} repeats line ${numbers.get(num)}`, "Account numbers must be unique."); else numbers.set(num, L); }
      const at = ATYPES[norm(get(r, "Type"))];
      if (at && idx["Detail Type"] !== undefined && !get(r, "Detail Type").trim()) add("warning", "detail-blank", L, `Account "${label}" has no Detail Type`, "QuickBooks picks a default detail type, which may not be the one reports and tax mappings expect.");
      if (at && PNL_TYPES.has(at) && get(r, "Balance").trim() && Number(get(r, "Balance").trim()) !== 0) add("warning", "pnl-balance", L, `${at} account "${label}" has an opening balance`, "Only balance sheet accounts carry opening balances. Income and expense balances come from transactions.");
      if (get(r, "Balance").trim() && Number(get(r, "Balance").trim()) !== 0 && !get(r, "Balance As Of").trim() && idx["Balance As Of"] !== undefined) add("warning", "asof-missing", L, `Account "${label}" has a balance but no As Of date`, "QuickBooks needs the date the balance is as of.");
    }
  }
  findings.sort((a, b) => (SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity)) || (a.line - b.line));
  return { findings, summary };
}

// Safe fixes only: things with exactly one reasonable reading. Never edits a name, number, tax ID,
// SKU, balance sign, date, email local part or any text field other than stray outer spaces.
export function repair(input, kindArg = "auto") {
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const changes = [];
  if (!text.trim()) return { text: "", changes, error: "The file is empty." };
  const delim = detectDelim(text);
  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) return { text: "", changes, error: `A quote opened on line ${parsed.unterminated} is never closed; fix that first.` };
  const rows = parsed.rows.map((r) => r.cells.slice());
  const head = rows[0].map((h) => h.trim());
  const kind = KINDS.includes(kindArg) ? kindArg : detectKind(head);
  if (delim !== ",") changes.push(`Converted the ${delim === ";" ? "semicolon" : "tab"} delimiter to commas.`);
  const cf = head.map((h) => mapHeading(kind, h));
  cf.forEach((m, i) => {
    if (m && m.exact && rows[0][i] !== m.field.name) { changes.push(`Header "${rows[0][i]}" renamed to "${m.field.name}".`); rows[0][i] = m.field.name; }
  });
  const edit = (ri, ci, to, why) => {
    const from = rows[ri][ci];
    if (from === to) return;
    rows[ri][ci] = to;
    changes.push(`Line ${parsed.rows[ri].line}, ${head[ci] || `column ${ci + 1}`}: "${from.replace(/ /g, " ")}" → "${to}" (${why}).`);
  };
  const countryIdx = (name) => { const t = name.replace(/State$/, "Country"); return cf.findIndex((m) => m && m.field.name === t); };
  for (let ri = 1; ri < rows.length; ri++) {
    if (rows[ri].every((c) => c.trim() === "")) continue;
    cf.forEach((m, ci) => {
      if (!m || rows[ri][ci] === undefined) return;
      const f = m.field;
      const raw = rows[ri][ci];
      const t = raw.replace(/^[\s ]+|[\s ]+$/g, "");
      if (t !== raw && t) edit(ri, ci, t, "stray spaces");
      let v = rows[ri][ci];
      if (!v) return;
      if (f.type === "money" && !isNum(v)) { const c = cleanMoney(v); if (isNum(c)) edit(ri, ci, c, "plain number"); }
      else if (f.type === "email" && /^mailto:/i.test(v)) edit(ri, ci, v.replace(/^mailto:/i, ""), "mailto prefix removed");
      else if (f.type === "state") {
        const ci2 = countryIdx(f.name);
        const country = ci2 >= 0 ? (rows[ri][ci2] ?? "").trim() : "";
        if (US_COUNTRY.test(country)) {
          const code = US_STATES[v.toLowerCase()];
          if (code) edit(ri, ci, code, "two-letter state code");
          else if (v.length === 2 && v !== v.toUpperCase() && STATE_CODES.has(v.toUpperCase())) edit(ri, ci, v.toUpperCase(), "capital state code");
        }
      }
    });
  }
  return { text: toCsv(rows), changes, error: null };
}

// Splits a file into parts of at most `size` data rows, each with the header.
export function splitCsv(input, size = ROW_LIMIT) {
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const parsed = parseCsv(text, detectDelim(text));
  if (parsed.unterminated || !parsed.rows.length) return [];
  const head = parsed.rows[0].cells;
  const body = parsed.rows.slice(1).map((r) => r.cells).filter((c) => !c.every((x) => x.trim() === ""));
  const parts = [];
  for (let i = 0; i < body.length; i += size) parts.push(toCsv([head, ...body.slice(i, i + size)]));
  return parts;
}

export function findingsCsv(result) {
  return toCsv([["severity", "line", "code", "title", "detail"], ...result.findings.map((f) => [f.severity, String(f.line || ""), f.code, f.title, f.detail])]);
}

const build = (kind, rows) => { const H = FIELDS[kind].map((f) => f.name); return toCsv([H, ...rows.map((o) => H.map((h) => o[h] ?? ""))]); };

export function sampleFile(kind = "customers") {
  if (kind === "vendors") return build("vendors", [
    { "Display Name": "Northside Paper Supply", Company: "Northside Paper Supply LLC", Email: "ap@northsidepaper.example", Phone: "(555) 010-2200", "Address Line 1": "14 Mill Road", City: "Hartford", State: "CT", ZIP: "06103", Country: "USA", "Tax ID": "12-3456789", Terms: "Net 30", "Opening Balance": "450.00", "Opening Balance As Of": "12/31/2023", "Track Payments For 1099": "No" },
    { "Display Name": "Dana Whitfield", "First Name": "Dana", "Last Name": "Whitfield", Email: "dana@whitfield.example", Phone: "555-010-3344", "Address Line 1": "9 Elm Street", City: "Austin", State: "TX", ZIP: "78701", Country: "USA", "Tax ID": "987-65-4321", Terms: "Due on receipt", "Track Payments For 1099": "Yes" },
  ]);
  if (kind === "products") return build("products", [
    { Name: "Canvas Tote Bag", SKU: "TOTE-01", Type: "Inventory", Description: "Heavy cotton canvas", Price: "24.00", "Income Account": "Sales", "Expense Account": "Cost of Goods Sold", Cost: "9.50", Taxable: "Yes", "Quantity On Hand": "65", "Reorder Point": "20", "Inventory Asset Account": "Inventory Asset", "Quantity As Of": "12/31/2023" },
    { Name: "Delivery", Type: "Service", Price: "15.00", "Income Account": "Sales", Taxable: "No" },
  ]);
  if (kind === "accounts") return build("accounts", [
    { "Account Name": "Business Checking", Number: "1000", Type: "Bank", "Detail Type": "Checking", Balance: "12500.00", "Balance As Of": "12/31/2023" },
    { "Account Name": "Sales", Number: "4000", Type: "Income", "Detail Type": "Sales of Product Income" },
    { "Account Name": "Rent", Number: "6100", Type: "Expenses", "Detail Type": "Rent or Lease of Buildings" },
    { "Account Name": "Rent:Storage Unit", Number: "6110", Type: "Expenses", "Detail Type": "Rent or Lease of Buildings" },
  ]);
  return build("customers", [
    { "Display Name": "Harbor Cafe", Company: "Harbor Cafe Inc", Email: "owner@harborcafe.example", Phone: "(555) 010-9911", "Billing Address Line 1": "2 Pier Way", "Billing City": "Newark", "Billing State": "NJ", "Billing ZIP": "07102", "Billing Country": "USA", Terms: "Net 15", "Opening Balance": "1200.00", "Opening Balance As Of": "12/31/2023" },
    { "Display Name": "Maria Santos", "First Name": "Maria", "Last Name": "Santos", Email: "maria@santos.example", Mobile: "555-010-4410", "Billing Address Line 1": "77 Oak Lane", "Billing City": "Denver", "Billing State": "CO", "Billing ZIP": "80203", "Billing Country": "USA", Terms: "Due on receipt" },
  ]);
}

export function sampleBrokenFile(kind = "customers") {
  if (kind === "vendors") return build("vendors", [
    { "Display Name": "Northside Paper Supply", Email: "ap@northsidepaper,example", Phone: "5.55E+09", State: "Connecticut", ZIP: "6103", Country: "USA", "Tax ID": "1234567", "Opening Balance": "$1,450.00", Terms: "Net 30" },
    { "Display Name": "northside paper supply ", Email: "billing northside@paper.example", Phone: "555-0102", State: "TX", ZIP: "78701", Country: "USA", "Tax ID": "12345678", "Opening Balance": "(300.00)", "Opening Balance As Of": "31/12/2023", "Track Payments For 1099": "Yes" },
    { "Display Name": "Dana Whitfield", "Tax ID": "123-45-6789", "Opening Balance": "50", "Opening Balance As Of": "12/31/2023", "Track Payments For 1099": "Yes" },
  ]);
  if (kind === "products") return build("products", [
    { Name: "Canvas Tote Bag", SKU: "1.23457E+12", Type: "Inventry", Price: "$24.00", Cost: "9,50", "Quantity On Hand": "65" },
    { Name: "canvas tote bag", SKU: "TOTE-01", Type: "Service", Price: "24.00", "Quantity On Hand": "5", "Income Account": "Sales" },
    { Name: "Delivery", SKU: "TOTE-01", Type: "Service", Price: "twelve", "Income Account": "Sales" },
  ]);
  if (kind === "accounts") return build("accounts", [
    { "Account Name": "Rent:Storage Unit", Number: "6110", Type: "Expense", "Detail Type": "Rent or Lease of Buildings" },
    { "Account Name": "Rent", Number: "6110", Type: "Expenses", "Detail Type": "Rent or Lease of Buildings", Balance: "900" },
    { "Account Name": "Business Checking", Number: "1000", Type: "Bank", Balance: "12500.00" },
    { "Account Name": "Business Checking", Number: "1001", Type: "Checking", "Detail Type": "Checking" },
  ]);
  return build("customers", [
    { "Display Name": "Harbor Cafe", Email: "owner@harborcafe", Phone: "5.55E+09", "Billing State": "New Jersey", "Billing ZIP": "7102", "Billing Country": "USA", Terms: "Net30", "Opening Balance": "$1,200.00", "Opening Balance As Of": "13/31/2023" },
    { "Display Name": "Harbor Cafe ", Email: "owner@harborcafe.example", Phone: "555", "Billing State": "NJ", "Billing ZIP": "07102", "Billing Country": "USA", "Opening Balance": "50" },
    { "Display Name": "", "First Name": "Maria", "Last Name": "Santos", Email: "mailto:maria@santos.example", "Opening Balance": "25.00", "Opening Balance As Of": "12/31/2023" },
    { "Display Name": "Acme: East", "Billing State": "ZZ", "Billing Country": "USA" },
  ]);
}
