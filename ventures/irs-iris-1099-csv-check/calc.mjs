// IRS IRIS 1099-NEC / 1099-MISC bulk-upload CSV checker. Pure functions, no DOM, no network.
// UNVERIFIED: every column name, limit and threshold below is from memory of public IRS IRIS
// template / Pub 5717-style guidance. No IRS template or IRIS account was available when this
// was built. Treat each rule as a prompt to look at the row, not as the IRS's rule.

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
const NEC_BOXES = ["NEC Box 1 Nonemployee Compensation"];
const MISC_BOXES = [
  "MISC Box 1 Rents", "MISC Box 2 Royalties", "MISC Box 3 Other Income", "MISC Box 5 Fishing Boat Proceeds",
  "MISC Box 6 Medical and Health Care Payments", "MISC Box 8 Substitute Payments", "MISC Box 9 Crop Insurance Proceeds",
  "MISC Box 10 Gross Proceeds to an Attorney",
];
const WITHHELD = "Box 4 Federal Income Tax Withheld";
export const MONEY = [...NEC_BOXES, ...MISC_BOXES, WITHHELD, "State Tax Withheld", "State Income"];
// Per-box "reporting starts at" amounts for MISC (memory; unverified). Box 4 and 5 report from the first cent.
const MISC_MIN = {
  "MISC Box 1 Rents": 600, "MISC Box 2 Royalties": 10, "MISC Box 3 Other Income": 600, "MISC Box 5 Fishing Boat Proceeds": 0.01,
  "MISC Box 6 Medical and Health Care Payments": 600, "MISC Box 8 Substitute Payments": 10, "MISC Box 9 Crop Insurance Proceeds": 600,
  "MISC Box 10 Gross Proceeds to an Attorney": 600,
};
const NORM = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const CANON = new Map(COLUMNS.map((c) => [NORM(c), c]));

export const STATES = new Set(("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY " +
  "AS GU MP PR VI AA AE AP").split(" "));
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
export function closestColumn(name) {
  const n = NORM(name);
  let best = null, bestD = 99;
  for (const c of COLUMNS) {
    const d = distance(n, NORM(c));
    if (d < bestD) { bestD = d; best = c; }
  }
  return bestD <= Math.max(2, Math.floor(n.length / 5)) ? best : null;
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
  const idx = {};
  header.forEach((h, i) => {
    const canon = CANON.get(NORM(h));
    if (canon) {
      if (idx[canon] !== undefined) add("error", "dup-header", 1, `Column "${canon}" appears twice`, `Columns ${idx[canon] + 1} and ${i + 1} are both "${canon}". Delete one.`);
      else idx[canon] = i;
      if (h !== canon) add("warning", "header-case", 1, `Column "${h}" is not spelled like the template`, `Use "${canon}" exactly. The safe fixes can rename it.`);
    } else if (h === "") add("warning", "blank-header", 1, `Column ${i + 1} has no name`, "An unnamed column is usually a stray trailing delimiter.");
    else {
      const near = closestColumn(h);
      add("warning", "unknown-header", 1, `Unknown column "${h}"`, near ? `Did you mean "${near}"? Unrecognised columns may be ignored or rejected.` : "Unrecognised columns may be ignored or rejected.");
    }
  });
  const missing = REQUIRED.filter((c) => idx[c] === undefined);
  for (const c of missing) add("error", "missing-column", 1, `Required column "${c}" is missing`, "The layout this tool expects has this column in every file. Compare your header with the list on this page.");
  if (idx["Form Type"] === undefined) return { findings, summary };

  const g = (r, name) => (idx[name] === undefined ? "" : (r.cells[idx[name]] ?? ""));
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
    if (tt && !["SSN", "EIN", "ITIN", "ATIN", "UNKNOWN", "NONE"].includes(tt)) add("warning", "tin-type", line, `Recipient TIN Type "${g(r, "Recipient TIN Type").trim()}" is not SSN, EIN, ITIN or ATIN`, "");
    const rt = tinShape(rawTin);
    let rdigits = "";
    if (rt.problem && !(tt === "UNKNOWN" || tt === "NONE") ) add("error", "recipient-tin", line, `Recipient TIN ${rt.problem}`, `Value: ${maskTin(rawTin)}. Dashes are fine; the safe fixes remove them.`);
    else if (!rt.problem) {
      rdigits = rt.digits;
      if (/-/.test(rawTin.trim()) || /\s/.test(rawTin.trim())) add("info", "tin-dashes", line, "Recipient TIN contains dashes or spaces", "Upload files usually want nine plain digits. The safe fixes remove them.");
      const looksEin = /^\d{2}-\d{7}$/.test(rawTin.trim());
      const looksSsn = /^\d{3}-\d{2}-\d{4}$/.test(rawTin.trim());
      const kind = tt || (looksEin ? "EIN" : looksSsn ? "SSN" : "");
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
    const st = g(r, "Recipient State").trim();
    if (!st) add("error", "state", line, "Recipient State is blank", "");
    else if (!STATES.has(st.toUpperCase())) add("error", "state", line, `Recipient State "${st}" is not a two-letter USPS code`, "Spell-out and Canadian provinces are not accepted for US addresses.");
    else if (st !== st.toUpperCase()) add("info", "state-case", line, `State "${st}" is not upper case`, "The safe fixes can change it.");
    const zip = g(r, "Recipient ZIP").trim();
    if (!zip) add("error", "zip", line, "Recipient ZIP is blank", "");
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
        if (v > 0 && v < MISC_MIN[col] && withheld === 0) add("warning", "below-threshold", line, `${col} ${fmt(v)} is under its ${fmt(MISC_MIN[col])} reporting amount`, "From memory of the 1099-MISC instructions; unverified.");
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
  const idx = {};
  head.forEach((h, i) => {
    const canon = CANON.get(NORM(h));
    if (canon && idx[canon] === undefined) { idx[canon] = i; if (h !== canon) { changes.push(`Line 1: renamed header "${h}" to "${canon}".`); rows[0].cells[i] = canon; } }
    else if (rows[0].cells[i] !== h) { changes.push(`Line 1: trimmed spaces around header "${h}".`); rows[0].cells[i] = h; }
  });
  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri], line = r.line;
    if (r.cells.length !== head.length) continue;
    const set = (col, next, why) => {
      if (idx[col] === undefined) return;
      const old = r.cells[idx[col]];
      if (old === next) return;
      r.cells[idx[col]] = next;
      changes.push(`Line ${line}: ${col} ${JSON.stringify(old)} -> ${JSON.stringify(next)} (${why}).`);
    };
    const val = (col) => (idx[col] === undefined ? "" : r.cells[idx[col]]);
    // Trim: only leading/trailing spaces; names are trimmed but never otherwise touched.
    for (const col of COLUMNS) { const v = val(col); if (v !== v.trim() && v.trim() !== "") set(col, v.trim(), "stray spaces trimmed"); }
    const ft = val("Form Type").trim();
    if (ft && ft !== ft.toUpperCase() && ["1099-NEC", "1099-MISC"].includes(ft.toUpperCase())) set("Form Type", ft.toUpperCase(), "upper case");
    for (const col of ["Payer TIN", "Recipient TIN"]) {
      const v = val(col).trim();
      if (/[-\s]/.test(v) && /^[\d\-\s]+$/.test(v)) {
        const d = v.replace(/[-\s]/g, "");
        if (d.length === 9) set(col, d, "dashes and spaces removed");
      }
    }
    for (const col of ["Payer State", "Recipient State"]) {
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

const row = (o) => COLUMNS.map((c) => o[c] ?? "");
const payer = { "Tax Year": "2025", "Payer TIN": "123456780", "Payer Name": "Northwind Sample Co", "Payer Address": "100 Example Way", "Payer City": "Austin", "Payer State": "TX", "Payer ZIP": "78701" };
export function sampleFile() {
  const nec = (o) => row({ "Form Type": "1099-NEC", ...payer, "Recipient TIN Type": "SSN", ...o });
  return toCsv([
    COLUMNS,
    nec({ "Recipient TIN": "412345678", "Recipient Name": "Jordan Sample", "Recipient Address": "12 Maple St", "Recipient City": "Dallas", "Recipient State": "TX", "Recipient ZIP": "75201", "NEC Box 1 Nonemployee Compensation": "4200.00" }),
    nec({ "Recipient TIN": "456789012", "Recipient TIN Type": "EIN", "Recipient Name": "Blue Door Design LLC", "Recipient Address": "9 Harbor Rd", "Recipient City": "Portland", "Recipient State": "ME", "Recipient ZIP": "04101", "NEC Box 1 Nonemployee Compensation": "1250.50", "Box 4 Federal Income Tax Withheld": "300.12" }),
    row({ "Form Type": "1099-MISC", ...payer, "Recipient TIN Type": "EIN", "Recipient TIN": "551234567", "Recipient Name": "Oak Row Properties", "Recipient Address": "400 Main St", "Recipient City": "Houston", "Recipient State": "TX", "Recipient ZIP": "77002", "MISC Box 1 Rents": "9600.00" }),
  ]);
}
export function sampleBrokenFile() {
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
