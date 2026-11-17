// IRS IRIS 1099-NEC / 1099-MISC bulk-upload CSV checker. Pure functions, no DOM, no network.
// The IRIS template's column names (TEMPLATE_NEC, TEMPLATE_MISC, 2026-11-10) are cross-checked in
// four open-source copies of the template; see the note above TEMPLATE_NEC. UNVERIFIED: every
// limit, threshold and accepted value below is from memory of public IRS guidance, and the older
// COLUMNS layout is this tool's own. Treat each rule as a prompt to look at the row.

export const COLUMNS = [
  "Form Type", "Tax Year", "Corrected", "Payer TIN", "Payer Name", "Payer Address", "Payer City", "Payer State", "Payer ZIP",
  "Recipient TIN", "Recipient TIN Type", "Recipient Name", "Recipient Name 2", "Recipient Address", "Recipient City",
  "Recipient State", "Recipient ZIP", "Account Number", "Second TIN Notice",
  "NEC Box 1 Nonemployee Compensation", "MISC Box 1 Rents", "MISC Box 2 Royalties", "MISC Box 3 Other Income",
  "Box 4 Federal Income Tax Withheld", "MISC Box 5 Fishing Boat Proceeds", "MISC Box 6 Medical and Health Care Payments",
  "MISC Box 8 Substitute Payments", "MISC Box 9 Crop Insurance Proceeds", "MISC Box 10 Gross Proceeds to an Attorney",
  "State Tax Withheld", "State ID", "State Income",
];
export const REQUIRED = [
  "Form Type", "Tax Year", "Payer TIN", "Payer Name", "Recipient TIN", "Recipient Name",
  "Recipient Address", "Recipient City", "Recipient State", "Recipient ZIP",
];
const NEC_BOXES = ["NEC Box 1 Nonemployee Compensation", "NEC Box 3 Excess Golden Parachute Payments"];
const MISC_BOXES = [
  "MISC Box 1 Rents", "MISC Box 2 Royalties", "MISC Box 3 Other Income", "MISC Box 5 Fishing Boat Proceeds",
  "MISC Box 6 Medical and Health Care Payments", "MISC Box 8 Substitute Payments", "MISC Box 9 Crop Insurance Proceeds",
  "MISC Box 10 Gross Proceeds to an Attorney", "MISC Box 11 Fish Purchased for Resale", "MISC Box 12 Section 409A Deferrals",
  "MISC Box 14 Excess Golden Parachute Payments", "MISC Box 15 Nonqualified Deferred Compensation",
];
const WITHHELD = "Box 4 Federal Income Tax Withheld";
export const MONEY = [...NEC_BOXES, ...MISC_BOXES, WITHHELD, "State Tax Withheld", "State Income"];
// Per-box "reporting starts at" amounts for MISC (memory; unverified). Box 4 and 5 report from the first cent.
const MISC_MIN = {
  "MISC Box 1 Rents": 600, "MISC Box 2 Royalties": 10, "MISC Box 3 Other Income": 600, "MISC Box 5 Fishing Boat Proceeds": 0.01,
  "MISC Box 6 Medical and Health Care Payments": 600, "MISC Box 8 Substitute Payments": 10, "MISC Box 9 Crop Insurance Proceeds": 600,
  "MISC Box 10 Gross Proceeds to an Attorney": 600, "MISC Box 11 Fish Purchased for Resale": 600,
  "MISC Box 12 Section 409A Deferrals": 0.01, "MISC Box 14 Excess Golden Parachute Payments": 0.01, "MISC Box 15 Nonqualified Deferred Compensation": 0.01,
};
// From 2026 (tax years beginning after 2025) the Instructions for Forms 1099-MISC and 1099-NEC
// (Rev. December 2026, read on irs.gov 2026-11-11) list: at least $10 in royalties (box 2) or
// substitute payments (box 8); any fishing boat proceeds (box 5); at least $600 in gross proceeds
// paid to an attorney (box 10) and in cash for fish for resale (box 11); and at least $2,000 in
// rents (1), other income (3), medical and health care payments (6), crop insurance proceeds (9),
// section 409A deferrals (12) and nonqualified deferred compensation (15).
const MISC_MIN_2026 = {
  ...MISC_MIN, "MISC Box 1 Rents": 2000, "MISC Box 3 Other Income": 2000, "MISC Box 6 Medical and Health Care Payments": 2000,
  "MISC Box 9 Crop Insurance Proceeds": 2000, "MISC Box 12 Section 409A Deferrals": 2000, "MISC Box 15 Nonqualified Deferred Compensation": 2000,
};
const miscMin = (yr) => (yr >= 2026 ? MISC_MIN_2026 : MISC_MIN);
const NORM = (s) => String(s).toLowerCase().replace(/\(surname\)/g, "").replace(/[^a-z0-9]/g, "");

// The IRS IRIS Taxpayer Portal CSV template layout, tax year 2025: columns A-BB for the 1099-NEC
// and A-BL for the 1099-MISC. NOT read on irs.gov (blocked from where this was written, 2026-11-10).
// The header text below is the same in four independent open-source projects that write or check
// these files and say they follow the IRS's template or its "template formatting guidelines":
// ubukhari/iris-1099 (src/iris.ts), christcr2012/appliance-desk (iris_csv_nec_header.csv,
// iris_csv_misc_header.csv), techmore/rupert (iris_csv.rb) and Tyler-LeDuc/leducsystems
// (iris-1099-nec-csv-template). Spellings they disagree on are all accepted: "Last Name" with or
// without "(Surname)", a trailing "*" on required columns, and the 1099-MISC "FATCA Filing
// Requirements" and "Box 14" columns (each appears in one source, not the other).
const T_HEAD = [
  "Form Type", "Tax Year", "Payer TIN Type", "Payer Taxpayer ID Number", "Payer Name Type",
  "Payer Business or Entity Name Line 1", "Payer Business or Entity Name Line 2", "Payer First Name", "Payer Middle Name",
  "Payer Last Name (Surname)", "Payer Suffix", "Payer Country", "Payer Address Line 1", "Payer Address Line 2", "Payer City/Town",
  "Payer State/Province/Territory", "Payer ZIP/Postal Code", "Payer Phone Type", "Payer Phone",
  "Recipient TIN Type", "Recipient Taxpayer ID Number", "Recipient Name Type", "Recipient Business or Entity Name Line 1",
  "Recipient Business or Entity Name Line 2", "Recipient First Name", "Recipient Middle Name", "Recipient Last Name (Surname)",
  "Recipient Suffix", "Recipient Country", "Recipient Address Line 1", "Recipient Address Line 2", "Recipient City/Town",
  "Recipient State/Province/Territory", "Recipient ZIP/Postal Code", "Office Code", "Form Account Number",
];
const T_STATES = [1, 2].flatMap((n) => [`State ${n}`, `State ${n} - State Tax Withheld`, `State ${n} - State/Payer state number`, `State ${n} - State income`, `State ${n} - Local income tax withheld`, `State ${n} - Special Data Entries`]);
const T_NEC_BOX2 = "Box 2 - Payer made direct sales totaling $5,000 or more of consumer products to a recipient for resale";
const T_MISC_BOX7 = "Box 7 - Direct sales of $5,000 or more of consumer products to a recipient for resale";
const T_MISC_BOX7_ALT = "Box 7 - Payer made direct sales totaling $5,000 or more of consumer products to a recipient for resale";
export const TEMPLATE_NEC = [...T_HEAD, "2nd TIN Notice", "Box 1 - Nonemployee Compensation", T_NEC_BOX2,
  "Box 3 - Excess golden parachute payments", "Box 4 - Federal income tax withheld", "Combined Federal/State Filing (CF/SF)", ...T_STATES];
export const TEMPLATE_MISC = [...T_HEAD, "FATCA Filing Requirements", "2nd TIN Notice", "Box 1 - Rents", "Box 2 - Royalties", "Box 3 - Other income",
  "Box 4 - Federal income tax withheld", "Box 5 - Fishing boat proceeds", "Box 6 - Medical and health care payments", T_MISC_BOX7,
  "Box 8 - Substitute payments in lieu of dividends or interest", "Box 9 - Crop insurance proceeds", "Box 10 - Gross proceeds paid to an attorney",
  "Box 11 - Fish purchased for resale", "Box 12 - Section 409A deferrals", "Box 15 - Nonqualified deferred compensation",
  "Combined Federal/State Filing (CF/SF)", ...T_STATES];
const T_OPTIONAL = new Set(["FATCA Filing Requirements", "Box 14 - Excess golden parachute payments"].map((c) => NORM(c)));
// Template column -> the name this file's checks use. Columns not listed keep their own name.
const T_ALIAS = {
  "Payer Taxpayer ID Number": "Payer TIN", "Payer Address Line 1": "Payer Address", "Payer City/Town": "Payer City",
  "Payer State/Province/Territory": "Payer State", "Payer ZIP/Postal Code": "Payer ZIP",
  "Recipient Taxpayer ID Number": "Recipient TIN", "Recipient Business or Entity Name Line 2": "Recipient Name 2",
  "Recipient Address Line 1": "Recipient Address", "Recipient City/Town": "Recipient City",
  "Recipient State/Province/Territory": "Recipient State", "Recipient ZIP/Postal Code": "Recipient ZIP",
  "Form Account Number": "Account Number", "2nd TIN Notice": "Second TIN Notice", "Box 4 - Federal income tax withheld": "Box 4 Federal Income Tax Withheld",
  "Box 1 - Nonemployee Compensation": "NEC Box 1 Nonemployee Compensation", "Box 3 - Excess golden parachute payments": "NEC Box 3 Excess Golden Parachute Payments",
  "Box 1 - Rents": "MISC Box 1 Rents", "Box 2 - Royalties": "MISC Box 2 Royalties", "Box 3 - Other income": "MISC Box 3 Other Income",
  "Box 5 - Fishing boat proceeds": "MISC Box 5 Fishing Boat Proceeds", "Box 6 - Medical and health care payments": "MISC Box 6 Medical and Health Care Payments",
  "Box 8 - Substitute payments in lieu of dividends or interest": "MISC Box 8 Substitute Payments", "Box 9 - Crop insurance proceeds": "MISC Box 9 Crop Insurance Proceeds",
  "Box 10 - Gross proceeds paid to an attorney": "MISC Box 10 Gross Proceeds to an Attorney", "Box 11 - Fish purchased for resale": "MISC Box 11 Fish Purchased for Resale",
  "Box 12 - Section 409A deferrals": "MISC Box 12 Section 409A Deferrals", "Box 14 - Excess golden parachute payments": "MISC Box 14 Excess Golden Parachute Payments",
  "Box 15 - Nonqualified deferred compensation": "MISC Box 15 Nonqualified Deferred Compensation",
  "State 1 - State Tax Withheld": "State Tax Withheld", "State 1 - State/Payer state number": "State ID", "State 1 - State income": "State Income",
};
// Columns only the template has; two or more of them in a header mean the file is in the template layout.
const T_ONLY = new Set([...TEMPLATE_NEC, ...TEMPLATE_MISC, T_MISC_BOX7_ALT, "Box 14 - Excess golden parachute payments"].filter((c) => !COLUMNS.some((l) => NORM(l) === NORM(c))).map(NORM));
// Display name for a check's internal column name, in template files.
const T_LABEL = Object.fromEntries(Object.entries(T_ALIAS).map(([t, l]) => [l, t]));
T_LABEL["Recipient Name"] = "Recipient name (Business or Entity Name Line 1, or First and Last Name)";
T_LABEL["Payer Name"] = "Payer name (Business or Entity Name Line 1, or First and Last Name)";
T_LABEL["NEC Box 1"] = "Box 1 - Nonemployee Compensation";
const LCANON = new Map(COLUMNS.map((c) => [NORM(c), c]));
const TCANON = new Map([...TEMPLATE_NEC, ...TEMPLATE_MISC, T_MISC_BOX7_ALT, "Box 14 - Excess golden parachute payments"].map((c) => [NORM(c), c]).reverse());
// The spelling a header should have, in the layout the file is in.
const canonFor = (h, tmpl) => (tmpl ? TCANON.get(NORM(h)) ?? LCANON.get(NORM(h)) : LCANON.get(NORM(h)) ?? TCANON.get(NORM(h)));
const CANON = { get: (n) => LCANON.get(n) ?? TCANON.get(n) };
const internal = (canon) => T_ALIAS[canon] ?? canon;
// "Payer Last Name" for "Payer Last Name (Surname)" and a trailing "*" are spelled as the template allows.
const spelledOk = (h, canon) => { const b = h.replace(/\*+$/, "").trim(); return b === canon || b === canon.replace(/ \(Surname\)$/, ""); };
export const isTemplateHeader = (cells) => cells.filter((h) => T_ONLY.has(NORM(h))).length >= 2;
// Rewrites a finding's column names into the template's, longest first so "Recipient TIN Type" survives.
function relabel(text) {
  let out = text;
  for (const l of Object.keys(T_LABEL).sort((a, b) => b.length - a.length)) out = out.replace(new RegExp(`(?<![A-Za-z])${l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z]| Type| 2)`, "g"), T_LABEL[l]);
  return out;
}

export const STATES = new Set(("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY " +
  "AS FM GU MH MP PR PW VI AA AE AP").split(" "));
// States whose ZIP codes begin with 0, where Excel drops the zero.
const ZERO_ZIP_STATES = new Set(["CT", "MA", "ME", "NH", "NJ", "PR", "RI", "VT", "VI"]);
const EIN_PREFIXES = new Set(("01 02 03 04 05 06 10 11 12 13 14 15 16 20 21 22 23 24 25 26 27 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 50 51 52 53 54 55 56 57 58 59 60 61 62 63 64 65 66 67 68 71 72 73 74 75 76 77 80 81 82 83 84 85 86 87 88 90 91 92 93 94 95 98 99").split(" "));
const NAME_OK = /^[A-Za-z0-9 &\-.,'/]+$/;
export const NAME_MAX = 40;
export const ADDRESS_MAX = 40;
export const SEVERITIES = ["error", "warning", "info"];

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
export function closestColumn(name, tmpl = false) {
  const n = NORM(name);
  let best = null, bestD = 99;
  for (const c of tmpl ? [...TEMPLATE_NEC, ...TEMPLATE_MISC] : COLUMNS) {
    const d = distance(n, NORM(c));
    if (d < bestD) { bestD = d; best = c; }
  }
  return bestD <= Math.max(2, Math.floor(n.length / 5)) ? best : null;
}

// IRIS template formatting guidelines, TY2025 (1099-NEC and 1099-MISC, columns D and U):
// EIN and QI-EIN as XX-XXXXXXX; SSN, ITIN and ATIN as XXX-XX-XXXX; UND (undeterminable) as nine plain digits.
// Returns the required form of nine digits for an explicit type, or null when the type does not fix one.
export function tinFormat(digits, type) {
  const t = String(type ?? "").trim().toUpperCase();
  if (!/^\d{9}$/.test(digits)) return null;
  if (t === "EIN" || t === "QI-EIN") return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  if (t === "SSN" || t === "ITIN" || t === "ATIN") return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  if (t === "UND") return digits;
  return null;
}
export const maskTin = (s) => {
  const d = String(s).replace(/\D/g, "");
  return d.length === 9 ? `***-**-${d.slice(5)}` : "(not nine digits)";
};

// Returns a problem string for an SSN-shaped number, or null.
export function ssnProblem(d) {
  const area = d.slice(0, 3), group = d.slice(3, 5), serial = d.slice(5);
  if (area === "000" || area === "666" || area[0] === "9") return `starts with ${area}, an area number SSA does not issue to SSNs (9xx numbers are ITINs)`;
  if (group === "00") return "has group number 00";
  if (serial === "0000") return "has serial number 0000";
  return null;
}
export function itinProblem(d) {
  if (d[0] !== "9") return "does not start with 9, which ITINs do";
  const g = Number(d.slice(3, 5));
  const ok = (g >= 50 && g <= 65) || (g >= 70 && g <= 88) || (g >= 90 && g <= 92) || (g >= 94 && g <= 99);
  return ok ? null : `has middle digits ${d.slice(3, 5)}, outside the ranges ITINs use`;
}
const WELL_KNOWN = new Set(["123456789", "987654321", "078051120", "219099999", "111223333", "012345678"]);

// Common to every TIN: nine digits after removing dashes/spaces. Returns {digits, problem}.
export function tinShape(raw) {
  const t = String(raw).trim();
  if (t === "") return { digits: "", problem: "is blank" };
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(t)) return { digits: "", problem: "looks like Excel scientific notation, so its digits are lost" };
  const d = t.replace(/[-\s]/g, "");
  if (!/^\d+$/.test(d)) return { digits: "", problem: "contains characters other than digits and dashes" };
  if (d.length === 8) return { digits: d, problem: "has 8 digits, so a leading zero was probably lost" };
  if (d.length !== 9) return { digits: d, problem: `has ${d.length} digits instead of 9` };
  return { digits: d, problem: null };
}

const moneyOk = (v) => /^\d+(\.\d{1,2})?$/.test(v);
const cleanMoney = (v) => {
  const t = v.trim().replace(/^\$\s*/, "").replace(/,(?=\d{3}(\D|$))/g, "");
  return moneyOk(t) ? t : null;
};
const num = (v) => (moneyOk(v.trim()) ? Number(v.trim()) : 0);
export const fmt = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Filing threshold for NEC box 1 by payment year (memory; unverified): $600 through 2025, $2,000 for payments made in 2026 on.
export function necThreshold(year) {
  return Number(year) >= 2026 ? 2000 : 600;
}

function detectDelim(text) {
  const first = text.split("\n", 1)[0];
  const count = (c) => first.split(c).length - 1;
  if (count(",") === 0 && count(";") > 0) return ";";
  if (count(",") === 0 && count("\t") > 0) return "\t";
  return ",";
}

export function validate(input, opts = {}) {
  const findings = [];
  const add = (severity, code, line, title, detail) => findings.push({ severity, code, line, title, detail });
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const summary = { rows: 0, records: 0, columns: 0, delimiter: ",", taxYears: [], byForm: {}, totals: {}, recipients: [] };
  if (!text.trim()) { add("error", "empty", 0, "The file is empty", "Paste or choose an IRIS bulk-upload CSV."); return { findings, summary }; }
  if (text.includes("�")) add("warning", "encoding", 0, "The file contains replacement characters", "Characters such as � mean the file was saved in a legacy encoding. Re-export as CSV UTF-8 or names with accents may upload damaged.");

  const delim = detectDelim(text);
  summary.delimiter = delim;
  if (delim !== ",") add("error", "delimiter", 1, `The file is ${delim === ";" ? "semicolon" : "tab"}-separated`, "The IRIS CSV template is comma-separated. Re-save as CSV (comma delimited), or use the safe fixes below.");
  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) {
    add("error", "quote", parsed.unterminated, "A quoted cell is never closed", `A cell opened with a double quote on line ${parsed.unterminated} has no closing quote, so the rest of the file reads as one cell.`);
    return { findings, summary };
  }
  const rows = parsed.rows;
  const header = rows[0].cells.map((h) => h.trim());
  summary.columns = header.length;
  const tmpl = isTemplateHeader(header);
  summary.layout = tmpl ? "iris-template" : "legacy";
  const idx = {};
  header.forEach((h, i) => {
    const canon = canonFor(h, tmpl);
    if (canon) {
      const key = tmpl ? internal(canon) : canon;
      if (idx[key] !== undefined) add("error", "dup-header", 1, `Column "${canon}" appears twice`, `Columns ${idx[key] + 1} and ${i + 1} are both "${canon}". Delete one.`);
      else idx[key] = i;
      if (!(tmpl ? spelledOk(h, canon) : h === canon)) add("warning", "header-case", 1, `Column "${h}" is not spelled like the template`, `Use "${canon}" exactly. The safe fixes can rename it.`);
    } else if (h === "") add("warning", "blank-header", 1, `Column ${i + 1} has no name`, "An unnamed column is usually a stray trailing delimiter.");
    else {
      const near = closestColumn(h, tmpl);
      add("warning", "unknown-header", 1, `Unknown column "${h}"`, near ? `Did you mean "${near}"? Unrecognised columns may be ignored or rejected.` : "Unrecognised columns may be ignored or rejected.");
    }
  });
  if (tmpl) {
    // IRIS "validates the CSV column header descriptions" (as quoted in ubukhari/iris-1099), so a
    // template column that is missing is likely a rejected file even when the row data are fine.
    const have = new Set(header.map(NORM));
    const isMisc = have.has(NORM("Box 1 - Rents")), isNecT = have.has(NORM("Box 1 - Nonemployee Compensation"));
    const want = isMisc && !isNecT ? TEMPLATE_MISC : TEMPLATE_NEC;
    const core = new Set(["Form Type", "Tax Year", "Payer Taxpayer ID Number", "Recipient TIN Type", "Recipient Taxpayer ID Number", "Recipient Address Line 1", "Recipient City/Town", "Recipient State/Province/Territory", "Recipient ZIP/Postal Code"]);
    const gone = want.filter((c) => !have.has(NORM(c)) && !T_OPTIONAL.has(NORM(c)) && !(c === T_MISC_BOX7 && have.has(NORM(T_MISC_BOX7_ALT))));
    for (const c of gone.filter((c) => core.has(c))) add("error", "missing-column", 1, `Required column "${c}" is missing`, "The IRIS template has this column and every record needs a value in it.");
    const rest = gone.filter((c) => !core.has(c));
    if (rest.length) add("warning", "template-columns", 1, `${rest.length} column${rest.length === 1 ? "" : "s"} of the IRIS ${want === TEMPLATE_MISC ? "1099-MISC" : "1099-NEC"} template ${rest.length === 1 ? "is" : "are"} missing`, `Missing: ${rest.join("; ")}. IRIS checks the header row against its template, so keep every template column even when it is empty. (Column list cross-checked in open-source copies of the template, not on irs.gov.)`);
    const order = header.map((h) => want.findIndex((c) => NORM(c) === NORM(h))).filter((i) => i >= 0);
    if (order.some((v, k) => k > 0 && v < order[k - 1])) add("warning", "template-order", 1, "Columns are not in the template's order", "The tool reads columns by name, but the IRIS upload may expect the template's own order. Paste your data into a fresh copy of the template downloaded from the IRIS portal.");
    if (isMisc && isNecT) add("error", "template-mixed", 1, "The header has both 1099-NEC and 1099-MISC box columns", "IRIS takes one template per form. Split the rows into a 1099-NEC file and a 1099-MISC file.");
  } else {
    const missing = REQUIRED.filter((c) => idx[c] === undefined);
    for (const c of missing) add("error", "missing-column", 1, `Required column "${c}" is missing`, "The layout this tool expects has this column in every file. Compare your header with the list on this page.");
  }
  if (idx["Form Type"] === undefined) return { findings, summary };

  const raw = (r, name) => (idx[name] === undefined ? "" : (r.cells[idx[name]] ?? ""));
  // A template row splits a name into a business line or first/middle/last; the checks read one name.
  const fullName = (r, who) => {
    const biz = raw(r, `${who} Business or Entity Name Line 1`).trim();
    const person = ["First Name", "Middle Name", "Last Name (Surname)", "Suffix"].map((p) => raw(r, `${who} ${p}`).trim()).filter(Boolean).join(" ");
    return raw(r, `${who} Name Type`).trim().toUpperCase() === "I" ? person || biz : biz || person;
  };
  const g = (r, name) => (tmpl && (name === "Recipient Name" || name === "Payer Name") ? fullName(r, name.split(" ")[0]) : raw(r, name));
  const years = new Map(), payerTins = new Map(), seenRow = new Map(), seenKey = new Map(), tinNames = new Map();
  const totals = {};
  let blankLines = 0;

  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri], line = r.line;
    if (r.cells.every((c) => c.trim() === "")) { blankLines++; continue; }
    if (/^\s*(total|totals|grand total)\b/i.test(r.cells[0] || "")) {
      add("error", "total-row", line, "A totals row is inside the data", "A summary row such as \"Total\" is read as a recipient. Delete it before uploading.");
      continue;
    }
    summary.rows++;
    if (r.cells.length !== header.length) {
      add("error", "cell-count", line, `Row has ${r.cells.length} cells, header has ${header.length}`, "An unquoted comma in a name or address shifts every later cell. Quote the cell.");
      if (r.cells.length < header.length) continue;
    }
    const form = g(r, "Form Type").trim().toUpperCase();
    if (!["1099-NEC", "1099-MISC"].includes(form)) {
      add("error", "form-type", line, `Form Type "${g(r, "Form Type").trim()}" is not 1099-NEC or 1099-MISC`, "This tool checks those two forms only.");
      continue;
    }
    if (g(r, "Form Type").trim() !== form) add("warning", "form-type-case", line, `Form Type "${g(r, "Form Type").trim()}" is not upper case`, `Use "${form}". The safe fixes can change it.`);
    summary.records++;
    summary.byForm[form] = (summary.byForm[form] || 0) + 1;
    const isNec = form === "1099-NEC";

    // Tax year
    const yr = g(r, "Tax Year").trim();
    if (!/^\d{4}$/.test(yr)) add("error", "tax-year", line, `Tax Year "${yr}" is not a four-digit year`, "Use a year such as 2025.");
    else {
      years.set(yr, (years.get(yr) || 0) + 1);
      const y = Number(yr);
      if (y < 2021) add("warning", "tax-year-old", line, `Tax Year ${yr} is an old year`, "Late or prior-year filings may follow different rules; check the current IRIS guidance for the year.");
      if (y > 2026) add("warning", "tax-year-future", line, `Tax Year ${yr} is in the future`, "Check the year for a typo.");
    }
    const corr = g(r, "Corrected").trim();
    if (corr && !/^(y|n|yes|no|true|false|x)$/i.test(corr)) add("warning", "corrected", line, `Corrected value "${corr}" is not Y or N`, "Use Y for a corrected return, or leave it blank.");

    // Payer
    const pt = tinShape(g(r, "Payer TIN"));
    if (pt.problem) add("error", "payer-tin", line, `Payer TIN ${pt.problem}`, `Value: ${maskTin(g(r, "Payer TIN"))}. A payer TIN is the nine-digit EIN (or SSN for a sole proprietor).`);
    else {
      if (/^(\d)\1{8}$/.test(pt.digits) || WELL_KNOWN.has(pt.digits)) add("error", "payer-tin", line, "Payer TIN is an obvious placeholder", "All-same-digit and sequential numbers are not real TINs.");
      else if (!EIN_PREFIXES.has(pt.digits.slice(0, 2))) add("warning", "payer-tin-prefix", line, `Payer TIN prefix ${pt.digits.slice(0, 2)} is not one the IRS assigns to EINs`, "From memory of the published prefix list; check against your IRS notice (an SSN is acceptable for a sole proprietor).");
      payerTins.set(pt.digits, (payerTins.get(pt.digits) || 0) + 1);
    }
    if (!g(r, "Payer Name").trim()) add("error", "payer-name", line, "Payer Name is blank", "Every record needs the payer's name.");
    for (const col of ["Payer Address", "Payer City"]) if (idx[col] !== undefined && !g(r, col).trim()) add("warning", "payer-address", line, `${col} is blank`, "IRIS asks for the payer's address.");
    if (idx["Payer State"] !== undefined) {
      const ps = g(r, "Payer State").trim();
      if (!ps) add("warning", "payer-address", line, "Payer State is blank", "IRIS asks for the payer's state.");
      else if (!STATES.has(ps.toUpperCase())) add("error", "payer-state", line, `Payer State "${ps}" is not a two-letter USPS code`, "Use codes such as TX, DC, PR.");
    }
    if (idx["Payer ZIP"] !== undefined && g(r, "Payer ZIP").trim() && !/^\d{5}(-?\d{4})?$/.test(g(r, "Payer ZIP").trim())) add("warning", "payer-zip", line, `Payer ZIP "${g(r, "Payer ZIP").trim()}" is not 5 or 9 digits`, "");

    // Recipient TIN
    const rawTin = g(r, "Recipient TIN");
    const tt = g(r, "Recipient TIN Type").trim().toUpperCase();
    if (tt && !["SSN", "EIN", "QI-EIN", "ITIN", "ATIN", "UND", "UNKNOWN", "NONE"].includes(tt)) add("warning", "tin-type", line, `Recipient TIN Type "${g(r, "Recipient TIN Type").trim()}" is not SSN, EIN, QI-EIN, ITIN, ATIN or UND`, "");
    const rt = tinShape(rawTin);
    let rdigits = "";
    if (rt.problem && !(tt === "UNKNOWN" || tt === "NONE") ) add("error", "recipient-tin", line, `Recipient TIN ${rt.problem}`, `Value: ${maskTin(rawTin)}. IRIS wants XX-XXXXXXX for an EIN and XXX-XX-XXXX for an SSN, ITIN or ATIN.`);
    else if (!rt.problem) {
      rdigits = rt.digits;
      const wantR = tinFormat(rdigits, tt);
      if (wantR !== null && rawTin.trim() !== wantR) add("warning", "tin-format", line, `Recipient TIN is not in the IRS format for type ${tt}`, "The IRIS template guidelines (TY2025, column U) ask for XX-XXXXXXX for an EIN or QI-EIN, XXX-XX-XXXX for an SSN, ITIN or ATIN, and nine plain digits for UND. The safe fixes rewrite it in that format.");
      const looksEin = /^\d{2}-\d{7}$/.test(rawTin.trim());
      const looksSsn = /^\d{3}-\d{2}-\d{4}$/.test(rawTin.trim());
      const kind = tt === "QI-EIN" ? "EIN" : tt === "UND" ? "" : tt || (looksEin ? "EIN" : looksSsn ? "SSN" : "");
      if (/^(\d)\1{8}$/.test(rdigits)) add("error", "recipient-tin", line, "Recipient TIN is one digit repeated nine times", `Value: ${maskTin(rdigits)}. A placeholder TIN will draw a CP2100 notice.`);
      else if (WELL_KNOWN.has(rdigits)) add("error", "recipient-tin", line, "Recipient TIN is a well-known sample number", `Value: ${maskTin(rdigits)}.`);
      else if (kind === "EIN") {
        if (!EIN_PREFIXES.has(rdigits.slice(0, 2))) add("warning", "recipient-ein-prefix", line, `EIN prefix ${rdigits.slice(0, 2)} is not one the IRS assigns`, "From memory of the published prefix list; check the number with the recipient's W-9.");
      } else if (kind === "ITIN") {
        const p = itinProblem(rdigits); if (p) add("error", "recipient-itin", line, `ITIN ${p}`, `Value: ${maskTin(rdigits)}.`);
      } else if (kind === "SSN" || kind === "ATIN" || !kind) {
        const p = ssnProblem(rdigits);
        if (p) add(kind === "SSN" ? "error" : "warning", "recipient-ssn", line, `Recipient TIN ${p}`, `Value: ${maskTin(rdigits)}.${kind ? "" : " If this is an EIN, set Recipient TIN Type to EIN or write it as 12-3456789."}`);
        if (!kind && !p) add("info", "tin-type-blank", line, "Recipient TIN Type is blank and the TIN has no dashes", "The tool read it as an SSN. An EIN written without its dash cannot be told apart; set the type column.");
      }
      if (kind === "SSN" && looksEin) add("warning", "tin-type-mismatch", line, "TIN is written like an EIN but typed SSN", "");
      if (kind === "EIN" && looksSsn) add("warning", "tin-type-mismatch", line, "TIN is written like an SSN but typed EIN", "");
    }

    if (tmpl) {
      // Template-only columns. Accepted values are those the open-source writers above use
      // (name type B or I, TIN types SSN/EIN/ITIN/ATIN, Y/N flags); unverified on irs.gov.
      const ptt = raw(r, "Payer TIN Type").trim().toUpperCase();
      const pd = tinShape(g(r, "Payer TIN"));
      const wantP = pd.problem ? null : tinFormat(pd.digits, ptt === "EIN" || ptt === "SSN" ? ptt : "");
      if (wantP !== null && g(r, "Payer TIN").trim() !== wantP) add("warning", "payer-tin-format", line, `Payer TIN is not in the IRS format for type ${ptt}`, "The IRIS template guidelines (TY2025, column D) ask for XX-XXXXXXX for an EIN and XXX-XX-XXXX for an SSN. The safe fixes rewrite it in that format.");
      if (idx["Payer TIN Type"] !== undefined && !ptt) add("error", "payer-tin-type", line, "Payer TIN Type is blank", "Use EIN, or SSN for a sole proprietor filing under their own number.");
      else if (ptt && !["EIN", "SSN", "ITIN", "ATIN"].includes(ptt)) add("warning", "payer-tin-type", line, `Payer TIN Type "${raw(r, "Payer TIN Type").trim()}" is not EIN, SSN, ITIN or ATIN`, "");
      if (idx["Recipient TIN Type"] !== undefined && !tt) add("error", "tin-type", line, "Recipient TIN Type is blank", "The template asks for the type of every TIN: SSN, EIN, ITIN or ATIN, as on the W-9.");
      for (const who of ["Payer", "Recipient"]) {
        const col = `${who} Name Type`;
        if (idx[col] === undefined) continue;
        const nt = raw(r, col).trim().toUpperCase();
        const biz = raw(r, `${who} Business or Entity Name Line 1`).trim();
        const first = raw(r, `${who} First Name`).trim(), last = raw(r, `${who} Last Name (Surname)`).trim();
        if (!nt) add("error", "name-type", line, `${col} is blank`, "Use B when the name is in Business or Entity Name Line 1, or I when it is in First and Last Name.");
        else if (nt === "B" && !biz) add("error", "name-type", line, `${col} is B but ${who} Business or Entity Name Line 1 is blank`, first || last ? "The name is in the first/last columns, so the type is I." : "");
        else if (nt === "I" && (!first || !last)) add("error", "name-type", line, `${col} is I but the ${!first ? "first" : "last"} name is blank`, biz ? "The name is in Business or Entity Name Line 1, so the type is B." : "An individual's name needs both first and last name.");
        else if (nt !== "B" && nt !== "I") add("warning", "name-type", line, `${col} "${raw(r, col).trim()}" is not B or I`, "B for a business or entity name, I for an individual's first and last name.");
      }
      const flags = isNec ? ["Second TIN Notice", T_NEC_BOX2, "Combined Federal/State Filing (CF/SF)"] : ["Second TIN Notice", "FATCA Filing Requirements", T_MISC_BOX7, T_MISC_BOX7_ALT, "Combined Federal/State Filing (CF/SF)"];
      for (const col of flags) {
        const v = raw(r, col).trim();
        if (v && !/^(y|n|yes|no|x|true|false)$/i.test(v)) add("warning", "flag-value", line, `${T_LABEL[col] ?? col} "${v}" is not a yes or no`, "These columns are check boxes: Y or N (or blank).");
      }
      if (!isNec && raw(r, "Box 1 - Nonemployee Compensation").trim()) add("error", "wrong-form-box", line, "A 1099-MISC row in a 1099-NEC template", "Each form has its own IRIS template.");
      for (const n of [1, 2]) {
        const sc = raw(r, `State ${n}`).trim();
        if (sc && !STATES.has(sc.toUpperCase())) add("error", "state", line, `State ${n} "${sc}" is not a two-letter USPS code`, "");
      }
      const amt2 = raw(r, "State 2 - State Tax Withheld").trim() || raw(r, "State 2 - State income").trim();
      if (amt2 && !raw(r, "State 2").trim()) add("warning", "state-id", line, "State 2 amounts with no State 2 code", "Name the second state, or move the amounts to State 1.");
    }

    // Name and address
    const name = g(r, "Recipient Name").trim();
    if (!name) add("error", "recipient-name", line, "Recipient Name is blank", "Every record needs a name that matches the recipient's W-9 and TIN.");
    else {
      if (!NAME_OK.test(name)) add("warning", "name-chars", line, "Recipient Name has characters the name line may reject", `"${name}": the IRS name line is generally limited to letters, digits, spaces and & - . , ' /. Review it; this tool will not edit names.`);
      if (name.length > NAME_MAX) add("warning", "name-length", line, `Recipient Name is ${name.length} characters`, `The name line is limited to about ${NAME_MAX}; put the overflow in Recipient Name 2.`);
      if (/\s{2,}/.test(g(r, "Recipient Name"))) add("info", "name-space", line, "Recipient Name has doubled spaces", "");
    }
    const addr = g(r, "Recipient Address").trim();
    if (!addr) add("error", "address", line, "Recipient Address is blank", "A street address is required.");
    else if (addr.length > ADDRESS_MAX) add("warning", "address-length", line, `Recipient Address is ${addr.length} characters`, `Street lines are limited to about ${ADDRESS_MAX}.`);
    if (!g(r, "Recipient City").trim()) add("error", "city", line, "Recipient City is blank", "");
    const country = raw(r, "Recipient Country").trim().toUpperCase();
    const foreign = tmpl && country !== "" && !["US", "USA", "UNITED STATES"].includes(country);
    const st = foreign ? "" : g(r, "Recipient State").trim();
    if (foreign) { /* a foreign address: state and ZIP rules below are for US addresses */ }
    else if (!st) add("error", "state", line, "Recipient State is blank", "");
    else if (!STATES.has(st.toUpperCase())) add("error", "state", line, `Recipient State "${st}" is not a two-letter USPS code`, "Spell-out and Canadian provinces are not accepted for US addresses.");
    else if (st !== st.toUpperCase()) add("info", "state-case", line, `State "${st}" is not upper case`, "The safe fixes can change it.");
    const zip = foreign ? "" : g(r, "Recipient ZIP").trim();
    if (foreign) { /* see above */ }
    else if (!zip) add("error", "zip", line, "Recipient ZIP is blank", "");
    else if (/^\d{4}$/.test(zip)) {
      if (ZERO_ZIP_STATES.has(st.toUpperCase())) add("warning", "zip-zero", line, `ZIP ${zip} has 4 digits in ${st.toUpperCase()}`, `A leading zero was probably dropped; it would be 0${zip}. The safe fixes pad it.`);
      else add("error", "zip", line, `ZIP ${zip} has 4 digits`, "ZIP codes have 5 digits.");
    } else if (!/^\d{5}(-?\d{4})?$/.test(zip)) add("error", "zip", line, `ZIP "${zip}" is not 5 or 9 digits`, "");

    // Money
    const amt = {};
    let badMoney = false;
    for (const col of MONEY) {
      if (idx[col] === undefined) continue;
      const v = g(r, col).trim();
      if (v === "") continue;
      if (moneyOk(v)) { amt[col] = Number(v); continue; }
      badMoney = true;
      if (/^\(.*\)$|^-/.test(v)) add("error", "money-negative", line, `${col} is negative`, `"${v}". Amounts are reported as positive numbers; use a corrected return, not a negative.`);
      else if (cleanMoney(v) !== null) add("warning", "money-format", line, `${col} "${v}" has a currency symbol or thousands separator`, `Plain digits with a decimal point are expected: ${cleanMoney(v)}. The safe fixes strip them.`);
      else if (/^\d+\.\d{3,}$/.test(v)) add("error", "money-decimals", line, `${col} "${v}" has more than two decimals`, "Amounts are whole cents. Round on your side so you decide how.");
      else add("error", "money-format", line, `${col} "${v}" is not a number`, "Use digits and an optional decimal point, e.g. 1500.00.");
    }
    const ownBoxes = isNec ? NEC_BOXES : MISC_BOXES;
    const otherBoxes = isNec ? MISC_BOXES : NEC_BOXES;
    for (const col of otherBoxes) if (amt[col] > 0) add("error", "wrong-form-box", line, `${col} has an amount on a ${form} row`, `That box belongs to the other form.`);
    const reportable = ownBoxes.reduce((s, c) => s + (amt[c] || 0), 0);
    const withheld = amt[WITHHELD] || 0;
    const key = `${form}|${yr}`;
    totals[key] ??= { form, year: yr, records: 0, sums: {} };
    totals[key].records++;
    for (const col of [...ownBoxes, WITHHELD, "State Tax Withheld", "State Income"]) if (amt[col] !== undefined) totals[key].sums[col] = Math.round(((totals[key].sums[col] || 0) + amt[col]) * 100) / 100;
    if (reportable === 0 && withheld === 0 && !badMoney) add("error", "no-amount", line, "No reportable amount on this record", "Every form needs an amount in a box. Remove the row if nothing is owed.");
    if (isNec) {
      const th = necThreshold(yr);
      const v = amt["NEC Box 1 Nonemployee Compensation"] || 0;
      if (v > 0 && v < th && withheld === 0) add("warning", "below-threshold", line, `NEC Box 1 ${fmt(v)} is under the ${fmt(th)} filing threshold`, `From memory: a 1099-NEC is required at ${fmt(th)} or more for payments in ${yr || "that year"}, or when any federal tax was withheld. Filing below it is allowed; check you meant to.`);
    } else {
      for (const col of ownBoxes) {
        const v = amt[col];
        const min = miscMin(yr)[col];
        if (v > 0 && v < min && withheld === 0) add("warning", "below-threshold", line, `${col} ${fmt(v)} is under its ${fmt(min)} reporting amount`, yr >= 2026 ? "From the Instructions for Forms 1099-MISC and 1099-NEC (Rev. December 2026). Filing below it is allowed; check you meant to." : "From memory of the 1099-MISC instructions; unverified.");
      }
    }
    if (withheld > reportable && reportable > 0) add("error", "withheld-exceeds", line, "Federal tax withheld is more than the amount paid", `Withheld ${fmt(withheld)} against ${fmt(reportable)} reported.`);
    if (withheld > 0 && !(idx[WITHHELD] === undefined)) add("info", "backup-withholding", line, `Federal tax withheld ${fmt(withheld)}`, "Backup withholding is normally 24% of the payment. Check the figure against your deposits.");
    const stw = amt["State Tax Withheld"] || 0;
    if (stw > 0 && !g(r, "State ID").trim()) add("warning", "state-id", line, "State tax withheld but State ID is blank", "The state needs the payer's state number to credit the withholding.");
    if (stw > 0 && stw > reportable && reportable > 0) add("warning", "state-withheld", line, "State tax withheld is more than the amount paid", "");
    if (idx["Second TIN Notice"] !== undefined && g(r, "Second TIN Notice").trim() && !/^(y|n|yes|no|true|false|x)$/i.test(g(r, "Second TIN Notice").trim())) add("warning", "second-tin", line, "Second TIN Notice is not Y or N", "");

    // Duplicates
    const fullKey = r.cells.map((c) => c.trim().toLowerCase()).join("\u0001");
    const isDupRow = seenRow.has(fullKey);
    if (isDupRow) add("error", "dup-row", line, `Identical to line ${seenRow.get(fullKey)}`, "A repeated row would be filed twice and double the amount paid.");
    else seenRow.set(fullKey, line);
    if (rdigits) {
      const k2 = `${form}|${yr}|${rdigits}|${g(r, "Account Number").trim().toLowerCase()}`;
      if (seenKey.has(k2) && !isDupRow) add("warning", "dup-recipient", line, `Same recipient TIN as line ${seenKey.get(k2)} on the same form`, `${maskTin(rdigits)} appears twice for ${form} ${yr}. Combine the amounts on one row, or give each an Account Number if they are separate filings.`);
      else if (!seenKey.has(k2)) seenKey.set(k2, line);
      const prev = tinNames.get(rdigits);
      if (prev && prev.name.toLowerCase() !== name.toLowerCase() && name) add("warning", "tin-two-names", line, `TIN ${maskTin(rdigits)} appears with a different name on line ${prev.line}`, `"${prev.name}" and "${name}". A TIN and name that do not match produce a TIN-mismatch notice.`);
      else if (!prev) tinNames.set(rdigits, { name, line });
    }
    summary.recipients.push({ line, form, name, tin: rdigits ? maskTin(rdigits) : "", amount: reportable, withheld });
  }

  if (blankLines) add("info", "blank-lines", 0, `${blankLines} blank line${blankLines === 1 ? "" : "s"} in the file`, "Blank rows are usually ignored; delete them anyway.");
  summary.taxYears = [...years.keys()].sort();
  if (years.size > 1) add("warning", "mixed-years", 0, `The file mixes tax years ${summary.taxYears.join(", ")}`, "One upload normally holds one tax year. Split the file if these are separate filings.");
  if (payerTins.size > 1) add("warning", "mixed-payers", 0, `The file has ${payerTins.size} different payer TINs`, "One upload per payer is the usual shape; confirm this is a deliberate multi-payer file.");
  summary.totals = totals;
  if (summary.records === 0) add("error", "no-records", 0, "No 1099-NEC or 1099-MISC records found", "");
  if (opts.expectedRecords !== undefined && opts.expectedRecords !== null && opts.expectedRecords !== "" && Number(opts.expectedRecords) !== summary.records) add("error", "record-count", 0, `Record count is ${summary.records}, you expected ${opts.expectedRecords}`, "Compare with your payment list; a missing or extra row is usually a blank line, a totals row or a split cell.");
  if (opts.expectedTotal !== undefined && opts.expectedTotal !== null && opts.expectedTotal !== "") {
    const sum = Object.values(totals).reduce((s, t) => s + Object.entries(t.sums).filter(([c]) => c !== WITHHELD && c !== "State Tax Withheld" && c !== "State Income").reduce((a, [, v]) => a + v, 0), 0);
    const want = Number(String(opts.expectedTotal).replace(/[$,\s]/g, ""));
    if (Number.isFinite(want) && Math.abs(sum - want) > 0.005) add("error", "total-mismatch", 0, `Reportable total is ${fmt(sum)}, you expected ${fmt(want)}`, `Difference ${fmt(sum - want)}.`);
  }
  if (tmpl && summary.records > 100) add("warning", "record-limit", 0, `${summary.records} records in one file`, "The IRIS FAQ, as quoted by open-source IRIS tools, allowed 100 records per Taxpayer Portal upload, with 250 announced from tax year 2025. Split the file if the portal refuses it.");
  if (tmpl && Object.keys(summary.byForm).length > 1) add("error", "template-mixed", 0, "The file mixes 1099-NEC and 1099-MISC rows", "IRIS takes one template per form. Split the rows into two files.");
  if (tmpl) for (const f of findings) { f.title = relabel(f.title); f.detail = relabel(f.detail); }
  const order = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || a.line - b.line);
  return { findings, summary };
}

// Safe fixes only. Never changes a name, address text, or an amount's value; every change is listed.
export function repair(input) {
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const changes = [];
  if (!text.trim()) return { text: "", changes, error: "The file is empty." };
  const delim = detectDelim(text);
  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) return { text: "", changes, error: `A quote opened on line ${parsed.unterminated} is never closed; fix that first.` };
  const rows = parsed.rows.map((r) => ({ cells: r.cells.slice(), line: r.line }));
  const head = rows[0].cells.map((h) => h.trim());
  if (!head.some((h) => NORM(h) === NORM("Form Type"))) return { text: "", changes, error: 'There is no "Form Type" column; nothing can be repaired.' };
  if (delim !== ",") changes.push(`Converted the ${delim === ";" ? "semicolon" : "tab"} delimiter to commas.`);
  const tmpl = isTemplateHeader(head);
  const idx = {};
  head.forEach((h, i) => {
    const canon = canonFor(h, tmpl);
    const key = canon && (tmpl ? internal(canon) : canon);
    if (canon && idx[key] === undefined) { idx[key] = i; if (!(tmpl ? spelledOk(h, canon) : h === canon)) { changes.push(`Line 1: renamed header "${h}" to "${canon}".`); rows[0].cells[i] = canon; } else if (rows[0].cells[i] !== h) { changes.push(`Line 1: trimmed spaces around header "${h}".`); rows[0].cells[i] = h; } }
    else if (rows[0].cells[i] !== h) { changes.push(`Line 1: trimmed spaces around header "${h}".`); rows[0].cells[i] = h; }
  });
  const label = (col) => rows[0].cells[idx[col]];
  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri], line = r.line;
    if (r.cells.length !== head.length) continue;
    const set = (col, next, why) => {
      if (idx[col] === undefined) return;
      const old = r.cells[idx[col]];
      if (old === next) return;
      r.cells[idx[col]] = next;
      changes.push(`Line ${line}: ${label(col)} ${JSON.stringify(old)} -> ${JSON.stringify(next)} (${why}).`);
    };
    const val = (col) => (idx[col] === undefined ? "" : r.cells[idx[col]]);
    // Trim: only leading/trailing spaces; names are trimmed but never otherwise touched.
    for (const col of Object.keys(idx)) { const v = val(col); if (v !== v.trim() && v.trim() !== "") set(col, v.trim(), "stray spaces trimmed"); }
    const ft = val("Form Type").trim();
    if (ft && ft !== ft.toUpperCase() && ["1099-NEC", "1099-MISC"].includes(ft.toUpperCase())) set("Form Type", ft.toUpperCase(), "upper case");
    // TINs are written in the format the IRIS guidelines require for the row's explicit TIN type; with no type, they are left alone.
    for (const [col, typeCol] of [["Payer TIN", "Payer TIN Type"], ["Recipient TIN", "Recipient TIN Type"]]) {
      const v = val(col).trim();
      if (!/^[\d\-\s]+$/.test(v)) continue;
      const want = tinFormat(v.replace(/[-\s]/g, ""), val(typeCol));
      if (want !== null && want !== v) set(col, want, `written in the IRS format for ${val(typeCol).trim().toUpperCase()}`);
    }
    for (const col of ["Payer State", "Recipient State", "State 1", "State 2"]) {
      const v = val(col).trim();
      if (v && v !== v.toUpperCase() && STATES.has(v.toUpperCase())) set(col, v.toUpperCase(), "upper case");
    }
    for (const col of ["Payer ZIP", "Recipient ZIP"]) {
      const v = val(col).trim();
      const stCol = col.startsWith("Payer") ? "Payer State" : "Recipient State";
      if (/^\d{4}$/.test(v) && ZERO_ZIP_STATES.has(val(stCol).trim().toUpperCase())) set(col, "0" + v, "leading zero restored for a state whose ZIPs start with 0");
      else if (/^\d{5}-\d{4}$/.test(v)) { /* left as is: the accepted 9-digit form is unverified */ }
    }
    for (const col of MONEY) {
      const v = val(col).trim();
      if (v === "" || moneyOk(v)) continue;
      const c = cleanMoney(v);
      if (c !== null) set(col, c, "currency symbol or thousands separator removed; value unchanged");
    }
  }
  return { text: toCsv(rows.map((r) => r.cells)), changes, error: null };
}

export function findingsCsv(result) {
  return toCsv([["severity", "line", "code", "title", "detail"], ...result.findings.map((f) => [f.severity, String(f.line || ""), f.code, f.title, f.detail])]);
}

const trow = (o) => TEMPLATE_NEC.map((c) => o[c] ?? "");
const tpayer = { "Form Type": "1099-NEC", "Tax Year": "2025", "Payer TIN Type": "EIN", "Payer Taxpayer ID Number": "12-3456780", "Payer Name Type": "B",
  "Payer Business or Entity Name Line 1": "Northwind Sample Co", "Payer Country": "US", "Payer Address Line 1": "100 Example Way", "Payer City/Town": "Austin",
  "Payer State/Province/Territory": "TX", "Payer ZIP/Postal Code": "78701", "Recipient Country": "US", "2nd TIN Notice": "N", [T_NEC_BOX2]: "N" };
// A 1099-NEC file in the IRIS template layout (TEMPLATE_NEC). Made-up payer and recipients.
export function sampleFile() {
  const nec = (o) => trow({ ...tpayer, ...o });
  return toCsv([
    TEMPLATE_NEC,
    nec({ "Recipient TIN Type": "SSN", "Recipient Taxpayer ID Number": "412-34-5678", "Recipient Name Type": "I", "Recipient First Name": "Jordan", "Recipient Last Name (Surname)": "Sample", "Recipient Address Line 1": "12 Maple St", "Recipient City/Town": "Dallas", "Recipient State/Province/Territory": "TX", "Recipient ZIP/Postal Code": "75201", "Box 1 - Nonemployee Compensation": "4200.00" }),
    nec({ "Recipient TIN Type": "EIN", "Recipient Taxpayer ID Number": "45-6789012", "Recipient Name Type": "B", "Recipient Business or Entity Name Line 1": "Blue Door Design LLC", "Recipient Address Line 1": "9 Harbor Rd", "Recipient City/Town": "Portland", "Recipient State/Province/Territory": "ME", "Recipient ZIP/Postal Code": "04101", "Box 1 - Nonemployee Compensation": "2250.50", "Box 4 - Federal income tax withheld": "540.12" }),
    nec({ "Recipient TIN Type": "EIN", "Recipient Taxpayer ID Number": "55-1234567", "Recipient Name Type": "B", "Recipient Business or Entity Name Line 1": "Oak Row Consulting", "Recipient Address Line 1": "400 Main St", "Recipient City/Town": "Houston", "Recipient State/Province/Territory": "TX", "Recipient ZIP/Postal Code": "77002", "Box 1 - Nonemployee Compensation": "9600.00" }),
  ]);
}
export function sampleBrokenFile() {
  const nec = (o) => trow({ ...tpayer, "Recipient TIN Type": "SSN", "Recipient Name Type": "I", ...o });
  return toCsv([
    TEMPLATE_NEC,
    nec({ "Recipient Taxpayer ID Number": "412-34-5678", "Recipient First Name": "Jordan", "Recipient Last Name (Surname)": "Sample", "Recipient Address Line 1": "12 Maple St", "Recipient City/Town": "Dallas", "Recipient State/Province/Territory": "tx", "Recipient ZIP/Postal Code": "75201", "Box 1 - Nonemployee Compensation": "$4,200.00" }),
    nec({ "Recipient Taxpayer ID Number": "666-12-3456", "Recipient First Name": "Riley", "Recipient Last Name (Surname)": "Placeholder", "Recipient Address Line 1": "5 Elm St", "Recipient City/Town": "Plano", "Recipient State/Province/Territory": "TX", "Recipient ZIP/Postal Code": "75024", "Box 1 - Nonemployee Compensation": "350.00" }),
    nec({ "Recipient Taxpayer ID Number": "111111111", "Recipient Name Type": "B", "Recipient Business or Entity Name Line 1": "Sam #7 Landscaping", "Recipient Address Line 1": "7 Pine St", "Recipient City/Town": "Portland", "Recipient State/Province/Territory": "ME", "Recipient ZIP/Postal Code": "4101", "Box 1 - Nonemployee Compensation": "1,800.5" }),
    nec({ "Recipient Taxpayer ID Number": "412345678", "Recipient First Name": "Jordan", "Recipient Last Name (Surname)": "Sample", "Recipient Address Line 1": "12 Maple St", "Recipient City/Town": "Dallas", "Recipient State/Province/Territory": "TX", "Recipient ZIP/Postal Code": "75201", "Box 1 - Nonemployee Compensation": "900.00" }),
    nec({ "Recipient Taxpayer ID Number": "98765", "Recipient Name Type": "B", "Recipient Address Line 1": "1 Oak St", "Recipient City/Town": "Waco", "Recipient State/Province/Territory": "Texas", "Recipient ZIP/Postal Code": "76701", "Box 1 - Nonemployee Compensation": "12O0.00" }),
  ]);
}

// The layout this tool used before 2026-11-10, written from memory; still read, as a fallback.
const row = (o) => COLUMNS.map((c) => o[c] ?? "");
const payer = { "Tax Year": "2025", "Payer TIN": "123456780", "Payer Name": "Northwind Sample Co", "Payer Address": "100 Example Way", "Payer City": "Austin", "Payer State": "TX", "Payer ZIP": "78701" };
export function sampleLegacyFile() {
  const nec = (o) => row({ "Form Type": "1099-NEC", ...payer, "Recipient TIN Type": "SSN", ...o });
  return toCsv([
    COLUMNS,
    nec({ "Recipient TIN": "412-34-5678", "Recipient Name": "Jordan Sample", "Recipient Address": "12 Maple St", "Recipient City": "Dallas", "Recipient State": "TX", "Recipient ZIP": "75201", "NEC Box 1 Nonemployee Compensation": "4200.00" }),
    nec({ "Recipient TIN": "45-6789012", "Recipient TIN Type": "EIN", "Recipient Name": "Blue Door Design LLC", "Recipient Address": "9 Harbor Rd", "Recipient City": "Portland", "Recipient State": "ME", "Recipient ZIP": "04101", "NEC Box 1 Nonemployee Compensation": "1250.50", "Box 4 Federal Income Tax Withheld": "300.12" }),
    row({ "Form Type": "1099-MISC", ...payer, "Recipient TIN Type": "EIN", "Recipient TIN": "55-1234567", "Recipient Name": "Oak Row Properties", "Recipient Address": "400 Main St", "Recipient City": "Houston", "Recipient State": "TX", "Recipient ZIP": "77002", "MISC Box 1 Rents": "9600.00" }),
  ]);
}
export function sampleLegacyBrokenFile() {
  const nec = (o) => row({ "Form Type": "1099-NEC", ...payer, "Recipient TIN Type": "SSN", ...o });
  return toCsv([
    COLUMNS,
    nec({ "Recipient TIN": "412-34-5678", "Recipient Name": "Jordan Sample", "Recipient Address": "12 Maple St", "Recipient City": "Dallas", "Recipient State": "tx", "Recipient ZIP": "75201", "NEC Box 1 Nonemployee Compensation": "$4,200.00" }),
    nec({ "Recipient TIN": "666-12-3456", "Recipient Name": "Riley Placeholder", "Recipient Address": "5 Elm St", "Recipient City": "Plano", "Recipient State": "TX", "Recipient ZIP": "75024", "NEC Box 1 Nonemployee Compensation": "350.00" }),
    nec({ "Recipient TIN": "111111111", "Recipient Name": "Sam #7 Landscaping", "Recipient Address": "7 Pine St", "Recipient City": "Portland", "Recipient State": "ME", "Recipient ZIP": "4101", "NEC Box 1 Nonemployee Compensation": "1,800.5" }),
    nec({ "Recipient TIN": "412345678", "Recipient Name": "Jordan Sample", "Recipient Address": "12 Maple St", "Recipient City": "Dallas", "Recipient State": "TX", "Recipient ZIP": "75201", "NEC Box 1 Nonemployee Compensation": "900.00" }),
    nec({ "Recipient TIN": "98765", "Recipient Name": "", "Recipient Address": "1 Oak St", "Recipient City": "Waco", "Recipient State": "Texas", "Recipient ZIP": "76701", "NEC Box 1 Nonemployee Compensation": "12O0.00" }),
  ]);
}
