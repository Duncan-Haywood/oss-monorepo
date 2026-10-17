// 1099-NEC vendor CSV checker. Pure functions, no I/O, no network.

// Reporting threshold for nonemployee compensation by the year the payment was
// made: $600 through 2025, $2,000 for payments made after 2025 (indexed from 2027).
export const NEC_THRESHOLD = { 2024: 600, 2025: 600, 2026: 2000 };
export const BACKUP_WITHHOLDING_RATE = 0.24;
const NEAR_THRESHOLD = 0.9;

export const STATES = new Set(
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY AS GU MP PR VI AA AE AP".split(" "),
);

const ALIASES = {
  name: ["name", "vendor", "vendor name", "payee", "payee name", "legal name", "business name", "company"],
  tin: ["tin", "ein", "ssn", "tax id", "taxid", "tax id number", "ein/ssn", "ssn/ein", "federal id", "w9 tin", "taxpayer id"],
  address: ["address", "street", "street address", "address 1", "address1", "address line 1"],
  city: ["city", "town"],
  state: ["state", "st", "province"],
  zip: ["zip", "zip code", "zipcode", "postal code", "postal"],
  amount: ["amount", "total", "total paid", "paid", "payments", "nec", "nonemployee compensation", "box 1", "ytd", "ytd paid"],
  card: ["paid by card", "card", "credit card", "paid by credit card", "payment method", "method"],
  corp: ["corporation", "corp", "entity type", "type", "tax classification", "classification"],
};

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9/ ]+/g, " ").replace(/\s+/g, " ").trim();

export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const src = String(text ?? "").replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

export function mapColumns(header) {
  const map = {};
  header.forEach((h, i) => {
    const n = norm(h);
    for (const [key, names] of Object.entries(ALIASES)) {
      if (map[key] === undefined && names.includes(n)) map[key] = i;
    }
  });
  return map;
}

export function parseMoney(raw) {
  let s = String(raw ?? "").trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[$,\s]/g, "");
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  const cents = Math.round(parseFloat(s) * 100);
  return neg ? -cents : cents;
}

export const dollars = (cents) =>
  (cents < 0 ? "-" : "") + "$" + (Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const maskTin = (digits) => (digits && digits.length === 9 ? "***-**-" + digits.slice(5) : digits ? "(" + digits.length + " digits)" : "(none)");

const SAMPLE_TINS = new Set(["078051120", "219099999", "457555462"]);

// Returns null when the TIN is plausible, else a reason. EINs and SSNs share nine
// digits, so only rules that hold for both are strict; an SSN-only rule fires when
// the entry is formatted with the SSN dash pattern.
export function tinProblem(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return "missing";
  const digits = text.replace(/\D/g, "");
  if (/[A-Za-z]/.test(text)) return "contains letters";
  if (digits.length !== 9) return `has ${digits.length} digits, not 9`;
  if (/^(\d)\1{8}$/.test(digits)) return "is one repeated digit";
  if (SAMPLE_TINS.has(digits) || digits === "123456789") return "is a well-known sample number";
  if (digits === "000000000") return "is all zeros";
  const ssnShaped = /^\d{3}-\d{2}-\d{4}$/.test(text);
  if (ssnShaped) {
    const area = +digits.slice(0, 3);
    if (area === 0 || area === 666 || area >= 900) return "has an area number (first three digits) that SSA does not issue";
    if (digits.slice(3, 5) === "00") return "has group 00";
    if (digits.slice(5) === "0000") return "has serial 0000";
  }
  if (/^\d{2}-\d{7}$/.test(text) && digits.startsWith("00")) return "has an EIN prefix of 00";
  return null;
}

const CORP_WORDS = /\b(inc|incorporated|corp|corporation|co|company|pc|p c|pa|plc|ltd|limited)\b\.?$/i;
const LLC_WORDS = /\bllc\b|\bl l c\b|\blp\b|\bllp\b/i;
const truthy = (v) => { const t = String(v ?? "").trim(); return t !== "" && !/^(n|no|false|0|check|cheque|ach|wire|cash|eft|direct deposit)$/i.test(t); };
const corpFlag = (v) => /\b(c[- ]?corp|s[- ]?corp|corporation|corp|inc)\b/i.test(String(v ?? ""));

export function analyze(text, opts = {}) {
  const year = Number(opts.year) || 2026;
  const threshold = (NEC_THRESHOLD[year] ?? 2000) * 100;
  const findings = [];
  const add = (severity, title, detail, line) => findings.push({ severity, title, detail, line: line || null });
  const rows = parseCsv(text);
  const out = { year, threshold, findings, vendors: [], summary: { rows: 0, vendors: 0, needing1099: 0, totalNEC: 0, missingTin: 0 }, columns: {} };
  if (rows.length < 2) {
    add("error", "No data rows", "Expected a header row and at least one vendor row.", 1);
    return out;
  }
  const cols = mapColumns(rows[0]);
  out.columns = cols;
  for (const key of ["name", "tin", "amount"]) {
    if (cols[key] === undefined) add("error", `No ${key} column found`, `The header row needs a column for ${key}. Recognised names: ${ALIASES[key].join(", ")}.`, 1);
  }
  for (const key of ["address", "city", "state", "zip"]) {
    if (cols[key] === undefined) add("warning", `No ${key} column found`, `A 1099-NEC needs the payee's full mailing address; without a ${key} column no row can be checked for it.`, 1);
  }
  if (findings.some((f) => f.severity === "error")) return out;

  const get = (r, k) => (cols[k] === undefined ? "" : String(r[cols[k]] ?? "").trim());
  const byTin = new Map(), byName = new Map();
  const entries = [];
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    out.summary.rows++;
    const name = get(r, "name");
    const tinRaw = get(r, "tin");
    const money = parseMoney(get(r, "amount"));
    const e = { line, name, tinRaw, tin: tinRaw.replace(/\D/g, ""), cents: money, card: truthy(get(r, "card")), corpHint: corpFlag(get(r, "corp")), r };
    if (!name) add("error", "Vendor name is blank", "A 1099 needs the payee's name exactly as on their W-9.", line);
    if (money === null) { add("error", "Amount is blank", `${name || "This row"} has no amount, so it cannot be tested against the ${dollars(threshold)} threshold.`, line); e.cents = 0; }
    else if (Number.isNaN(money)) { add("error", "Amount is not a number", `"${get(r, "amount")}" is not a dollar amount.`, line); e.cents = 0; }
    else if (money < 0) add("warning", "Negative amount", `${name || "This row"} has ${dollars(money)}; confirm refunds are netted against the right year.`, line);
    entries.push(e);
    if (e.tin.length === 9) {
      if (!byTin.has(e.tin)) byTin.set(e.tin, []);
      byTin.get(e.tin).push(e);
    }
    const nk = norm(name);
    if (nk) { if (!byName.has(nk)) byName.set(nk, []); byName.get(nk).push(e); }
  });

  // Aggregate: payments to one TIN (or, with none, one name) are one payee.
  const payees = new Map();
  for (const e of entries) {
    const key = e.tin.length === 9 ? "t" + e.tin : "n" + norm(e.name) + "|" + e.tin;
    if (!payees.has(key)) payees.set(key, { name: e.name, tin: e.tin, tinRaw: e.tinRaw, lines: [], cents: 0, cardCents: 0, rows: [], corpHint: false });
    const p = payees.get(key);
    p.lines.push(e.line);
    p.rows.push(e);
    if (e.card) p.cardCents += e.cents || 0; else p.cents += e.cents || 0;
    p.corpHint = p.corpHint || e.corpHint;
  }

  for (const [tin, list] of byTin) {
    const names = new Set(list.map((x) => norm(x.name)).filter(Boolean));
    if (names.size > 1) add("warning", "One TIN, different names", `${maskTin(tin)} appears as ${[...names].map((n) => `"${n}"`).join(", ")}. The name on the 1099 must match the TIN on the W-9; the IRS name/TIN match fails otherwise.`, list[0].line);
    if (list.length > 1 && names.size === 1) add("info", "Vendor listed more than once", `${list[0].name} (${maskTin(tin)}) appears on lines ${list.map((x) => x.line).join(", ")}; the amounts are added together before the threshold test.`, list[0].line);
  }
  for (const [, list] of byName) {
    const tins = new Set(list.map((x) => x.tin).filter(Boolean));
    if (tins.size > 1) add("warning", "One name, different TINs", `${list[0].name} appears with ${tins.size} different TINs on lines ${list.map((x) => x.line).join(", ")}; one of them is probably a typo, or they are different payees.`, list[0].line);
  }

  for (const p of payees.values()) {
    const line = p.lines[0];
    const reportable = p.cents >= threshold && p.cents > 0;
    const near = !reportable && p.cents >= threshold * NEAR_THRESHOLD;
    const v = { name: p.name, tin: p.tin, tinRaw: p.tinRaw, lines: p.lines, cents: p.cents, cardCents: p.cardCents, needs1099: reportable, ready: false, problems: [] };
    out.summary.vendors++;
    out.summary.totalNEC += reportable ? p.cents : 0;
    if (p.cardCents > 0) add("info", "Card payments excluded", `${p.name || "A vendor"} was paid ${dollars(p.cardCents)} by card or a payment network. Those are reported by the processor on a 1099-K, not by you on a 1099-NEC, so they are left out of the total.`, line);
    if (near) add("info", "Just under the threshold", `${p.name} is at ${dollars(p.cents)}, within 10% of the ${dollars(threshold)} limit. Late invoices paid before year end could tip it over.`, line);
    if (reportable) {
      out.summary.needing1099++;
      const tp = p.rows.map((x) => tinProblem(x.tinRaw)).find(Boolean) || (p.tin.length === 9 ? null : tinProblem(p.tinRaw));
      if (tp) {
        v.problems.push("TIN " + tp);
        if (tp === "missing") {
          out.summary.missingTin++;
          add("error", "No TIN on a reportable vendor", `${p.name} was paid ${dollars(p.cents)} and has no TIN. Ask for a Form W-9. Without one you may need to withhold ${Math.round(BACKUP_WITHHOLDING_RATE * 100)}% backup withholding (${dollars(Math.round(p.cents * BACKUP_WITHHOLDING_RATE))} on this amount) and report it on the 1099.`, line);
        } else add("error", "TIN does not look valid", `${p.name}: the TIN "${maskTin(p.tin)}" ${tp}. A bad TIN triggers an IRS CP2100 notice and backup withholding.`, line);
      }
      for (const f of ["address", "city", "state", "zip"]) {
        const missing = p.rows.every((x) => cols[f] === undefined || !String(x.r[cols[f]] ?? "").trim());
        if (cols[f] !== undefined && missing) { v.problems.push(`${f} missing`); add("error", `${f[0].toUpperCase() + f.slice(1)} is blank`, `${p.name} needs a mailing ${f} for the 1099 recipient copy and the IRS file.`, line); }
      }
      const st = (p.rows.map((x) => get(x.r, "state")).find(Boolean) || "").toUpperCase();
      if (st && !STATES.has(st)) { v.problems.push("state invalid"); add("error", "State is not a USPS code", `${p.name}: "${st}" is not a two-letter state or territory code.`, line); }
      const zip = p.rows.map((x) => get(x.r, "zip")).find(Boolean) || "";
      if (zip && !/^\d{5}(-\d{4})?$/.test(zip)) { v.problems.push("zip invalid"); add("warning", "ZIP looks wrong", `${p.name}: "${zip}" is not 5 digits or ZIP+4. Spreadsheets drop leading zeros (New England ZIPs start with 0).`, line); }
      if (p.corpHint || CORP_WORDS.test(String(p.name).trim())) add("warning", "Possible corporation", `${p.name} looks like a C or S corporation. Payments to corporations generally do not need a 1099-NEC, except attorneys' fees and some medical payments. Check the entity box on their W-9.`, line);
      else if (LLC_WORDS.test(p.name)) add("info", "LLC: check the tax classification", `An LLC is taxed as a sole proprietor, partnership or corporation depending on its election; the W-9 line 3 box decides whether a 1099 is due.`, line);
      v.ready = v.problems.length === 0;
    }
    out.vendors.push(v);
  }
  out.vendors.sort((a, b) => b.cents - a.cents);
  out.summary.totalNEC = out.vendors.filter((v) => v.needs1099).reduce((s, v) => s + v.cents, 0);
  const order = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || (a.line || 0) - (b.line || 0));
  return out;
}

const csvCell = (s) => (/[",\n]/.test(String(s)) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s));

// Vendors that need a 1099-NEC, aggregated, with the full TIN: this is the user's own
// data going back to the user, for their filing software.
export function readyCsv(result) {
  const head = ["name", "tin", "box1_nonemployee_compensation", "source_lines", "status"];
  const rows = result.vendors.filter((v) => v.needs1099).map((v) => [v.name, v.tin, (v.cents / 100).toFixed(2), v.lines.join(" "), v.ready ? "ready" : "fix: " + v.problems.join("; ")]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

export function maskedFindingsCsv(result) {
  const head = ["severity", "line", "title", "detail"];
  const rows = result.findings.map((f) => [f.severity, f.line ?? "", f.title, f.detail]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

export function sampleCsv() {
  return [
    "Vendor Name,EIN/SSN,Address,City,State,ZIP,Total Paid,Paid by Card",
    "Maple Street Design,84-3456789,14 Maple St,Burlington,VT,05401,8450.00,",
    "Jordan Reyes,412-55-1928,882 Oak Ave,Austin,TX,78704,3200.00,",
    "Northwind Web Services LLC,98-7654321,300 Pine Rd,Denver,CO,80203,2150.00,",
    "Acme Office Supply Inc,45-1112223,9 Commerce Dr,Columbus,OH,43215,5100.00,",
    "Pat Lin Photography,623-41-7706,51 Elm Ct,Portland,OR,97205,2495.00,",
    "Cloud Hosting Co,31-4455667,1 Data Way,Ashburn,VA,20147,4000.00,yes",
  ].join("\n") + "\n";
}

export function sampleBrokenCsv() {
  return [
    "Vendor Name,EIN/SSN,Address,City,State,ZIP,Total Paid,Paid by Card",
    "Maple Street Design,84-3456789,14 Maple St,Burlington,VT,5401,8450.00,",
    "Maple Street Design,84-3456789,14 Maple St,Burlington,VT,5401,1200.00,",
    "Jordan Reyes,,882 Oak Ave,Austin,TX,78704,3200.00,",
    "Northwind Web Services LLC,98-765432,,Denver,Colorado,80203,2150.00,",
    "Acme Office Supply Inc,45-1112223,9 Commerce Dr,Columbus,OH,43215,5100.00,",
    "Pat Lin Photography,623-41-7706,51 Elm Ct,Portland,OR,97205,2495.00,",
    "Pat Lin Photo,623-41-7706,51 Elm Ct,Portland,OR,97205,300.00,",
  ].join("\n") + "\n";
}

export function decodeBuffer(buf) {
  return new TextDecoder("utf-8").decode(buf);
}
