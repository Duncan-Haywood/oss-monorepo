// Medical bill error checker: an itemized-bill CSV in, possible duplicate
// charges, quantity oddities, unbundled code pairs and arithmetic mismatches
// out, plus a draft billing-review request. Deterministic rules on the file
// only. No network, no storage, no DOM. It flags lines to ask about; it never
// says a bill is wrong.

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export const money = (n) => {
  const v = Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const [i, f] = Math.abs(v).toFixed(2).split(".");
  return (v < 0 ? "-" : "") + i.replace(/\B(?=(\d{3})+$)/g, ",") + "." + f;
};
const usd = (n) => (n < 0 ? "-$" : "$") + money(Math.abs(n));
const pct = (n, d) => (d > 0 ? (n / d) * 100 : null);

// ---------- text decoding and CSV ----------

// Bytes -> text. Honours UTF-8 and UTF-16 byte order marks; anything else is UTF-8.
export function decodeBuffer(buf) {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u.length >= 2 && u[0] === 0xff && u[1] === 0xfe) return new TextDecoder("utf-16le").decode(u.subarray(2));
  if (u.length >= 2 && u[0] === 0xfe && u[1] === 0xff) return new TextDecoder("utf-16be").decode(u.subarray(2));
  const t = new TextDecoder("utf-8").decode(u);
  return t.charCodeAt(0) === 0xfeff ? t.slice(1) : t;
}

// Comma, semicolon, tab or pipe: whichever appears most in the first non-empty
// line outside quotes.
export function detectDelimiter(text) {
  const first = String(text).replace(/^﻿/, "").split(/\r\n|\n|\r/).find((l) => l.trim()) || "";
  const counts = { ",": 0, ";": 0, "\t": 0, "|": 0 };
  let inQ = false;
  for (const ch of first) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch in counts) counts[ch]++;
  }
  let best = ",", n = 0;
  for (const [d, c] of Object.entries(counts)) if (c > n) { best = d; n = c; }
  return best;
}

// Quoted-field CSV parser: "" escapes, newlines inside quotes, CRLF, BOM.
// Blank lines are dropped. Returns { rows, lines } where lines[i] is the
// 1-based source line row i started on.
export function parseCsv(text, delimiter = ",") {
  const s = String(text).replace(/^﻿/, "");
  const rows = [], lines = [];
  let row = [], field = "", inQ = false, line = 1, rowLine = 1, touched = false;
  const endField = () => { row.push(field); field = ""; };
  const endRow = () => {
    endField();
    if (row.some((c) => c.trim() !== "")) { rows.push(row); lines.push(rowLine); }
    row = []; touched = false;
  };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else { if (ch === "\n") line++; field += ch; }
      continue;
    }
    if (ch === '"' && field === "") { inQ = true; touched = true; }
    else if (ch === delimiter) { endField(); touched = true; }
    else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      if (touched || field !== "" || row.length) endRow();
      line++; rowLine = line;
    } else { field += ch; touched = true; }
  }
  if (touched || field !== "" || row.length) endRow();
  return { rows, lines };
}

// ---------- columns ----------

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const ALIASES = {
  date: ["date of service", "service date", "dos", "date", "service dt", "posted date"],
  code: ["cpt", "cpt code", "cpt hcpcs", "hcpcs", "procedure code", "procedure", "code", "service code", "cpt/hcpcs", "rev code", "revenue code"],
  desc: ["description", "service description", "service", "item", "item description", "procedure description", "charge description"],
  qty: ["qty", "quantity", "units", "unit", "service units"],
  charge: ["charge", "charges", "amount", "billed", "billed amount", "total charge", "total charges", "gross charge", "amount billed", "price"],
  paid: ["insurance paid", "ins paid", "plan paid", "payer paid", "insurance payment", "insurance payments", "payments"],
  adj: ["adjustment", "adjustments", "contractual adjustment", "insurance adjustment", "write off", "allowed adjustment", "discount"],
  owed: ["patient responsibility", "patient owes", "patient balance", "balance", "you owe", "patient resp", "amount due", "balance due"],
};

function findColumns(header) {
  const cols = {};
  const names = header.map(norm);
  for (const [key, list] of Object.entries(ALIASES)) {
    for (const a of list) {
      const i = names.indexOf(a);
      if (i >= 0 && !Object.values(cols).some((c) => c.index === i)) { cols[key] = { index: i, name: header[i].trim() }; break; }
    }
  }
  return cols;
}

function parseMoney(text) {
  let s = String(text ?? "").trim();
  if (!s || s === "-") return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/-\s*$/.test(s)) { neg = true; s = s.replace(/-\s*$/, ""); }
  s = s.replace(/[$\s]/g, "");
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  if (/^\d{1,3}(,\d{3})*(\.\d+)?$|^\d+(\.\d+)?$/.test(s)) {
    const v = parseFloat(s.replace(/,/g, ""));
    return neg ? -v : v;
  }
  return NaN;
}

// A code is CPT (5 digits, or 4 digits plus F/T/U), HCPCS level II (letter plus
// 4 digits) or a 4-digit revenue code. Anything else is kept but not judged.
export function codeKind(code) {
  const c = String(code).trim().toUpperCase();
  if (!c) return "none";
  if (/^\d{5}$|^\d{4}[FTU]$/.test(c)) return "cpt";
  if (/^[A-V]\d{4}$/.test(c)) return "hcpcs";
  if (/^0?\d{3,4}$/.test(c)) return "revenue";
  return "other";
}
const cleanCode = (c) => String(c).trim().toUpperCase().replace(/\s+/g, "").replace(/-\d{2}$/, "");
const modifierOf = (c) => (String(c).trim().toUpperCase().match(/-(\d{2}|[A-Z]{2})$/) || [])[1] || "";

export function normalizeBill(parsed) {
  const { rows, lines } = parsed;
  if (rows.length < 2) return { error: "The file needs a header row and at least one line item." };
  const cols = findColumns(rows[0]);
  if (!cols.charge) return { error: "No charge column found. Expected a header like Charge, Charges, Amount or Billed Amount." };
  if (!cols.code && !cols.desc) return { error: "No code or description column found. Expected CPT, HCPCS, Procedure Code or Description." };
  const records = [], skipped = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (k) => (cols[k] ? String(row[cols[k].index] ?? "").trim() : "");
    const chargeRaw = get("charge");
    const charge = parseMoney(chargeRaw);
    if (chargeRaw === "" || charge === null) { skipped.push({ line: lines[r], reason: "no charge amount (a total or note row)" }); continue; }
    if (Number.isNaN(charge)) { skipped.push({ line: lines[r], reason: `charge "${chargeRaw}" is not a number` }); continue; }
    if (/^(sub)?total|^balance|^grand/i.test(get("desc")) || /^(sub)?total/i.test(get("code"))) { skipped.push({ line: lines[r], reason: "total row" }); continue; }
    const qtyRaw = get("qty");
    const qty = qtyRaw === "" ? 1 : parseFloat(qtyRaw.replace(/,/g, ""));
    const money2 = (k) => { const v = parseMoney(get(k)); return v === null || Number.isNaN(v) ? null : v; };
    records.push({
      line: lines[r], date: get("date"), rawCode: get("code"), code: cleanCode(get("code")), modifier: modifierOf(get("code")),
      desc: get("desc"), qty: Number.isFinite(qty) && qty > 0 ? qty : 1, qtyGiven: qtyRaw !== "" && Number.isFinite(qty),
      charge, paid: money2("paid"), adj: money2("adj"), owed: money2("owed"),
    });
  }
  if (!records.length) return { error: "No line items with a charge amount were found.", skipped };
  return { records, skipped, columns: Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, v.name])) };
}

// ---------- rule tables ----------

// Codes usually billed once per date of service. A second unit or line is a
// question, not an error: the modifier or a separate encounter may explain it.
const ONCE_PER_DAY = new Set([
  "99202", "99203", "99204", "99205", "99211", "99212", "99213", "99214", "99215",
  "99281", "99282", "99283", "99284", "99285", "36415", "93000", "93005", "93010", "80048", "80053", "80061", "85025", "85027", "84443",
]);

// Component -> panel or bundle that already contains it. Same date of service,
// both billed: the component is the line to ask about.
const PANEL_MAP = {
  "80053": ["82040", "82247", "82310", "82374", "82435", "82565", "82947", "84075", "84132", "84155", "84295", "84450", "84460", "84520"],
  "80048": ["82310", "82374", "82435", "82565", "82947", "84132", "84295", "84520"],
  "80061": ["82465", "83718", "84478"],
  "85025": ["85027", "85004"],
  "93000": ["93005", "93010"],
};
const PANEL_NAMES = { "80053": "comprehensive metabolic panel", "80048": "basic metabolic panel", "80061": "lipid panel", "85025": "CBC with differential", "93000": "ECG with interpretation" };

// Two codes of the same family billed the same day: pick the one visit level.
const FAMILIES = [
  { name: "emergency department visit levels", codes: ["99281", "99282", "99283", "99284", "99285"] },
  { name: "established-patient office visit levels", codes: ["99211", "99212", "99213", "99214", "99215"] },
  { name: "new-patient office visit levels", codes: ["99202", "99203", "99204", "99205"] },
  { name: "chest X-ray views", codes: ["71045", "71046", "71047", "71048"] },
];

const SEVERITY_ORDER = { high: 0, medium: 1, info: 2 };

// ---------- analysis ----------

export function analyze(records, opts = {}) {
  const tolerance = Number.isFinite(opts.tolerance) ? opts.tolerance : 0.01;
  const findings = [];
  const add = (severity, kind, title, detail, lines, amount) => findings.push({ severity, kind, title, detail, lines, amount: round2(amount || 0) });
  const lineLabel = (r) => `line ${r.line}: ${r.code || "no code"}${r.modifier ? "-" + r.modifier : ""} ${r.desc || ""} ${r.date ? "on " + r.date : ""} ${usd(r.charge)}`.replace(/\s+/g, " ").trim();
  const flagged = new Set();

  // 1. Possible duplicates: same date, code, description, quantity and charge.
  const seen = new Map();
  for (const r of records) {
    const key = [r.date, r.code, r.modifier, r.desc.toLowerCase(), r.qty, r.charge].join("|");
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(r);
  }
  for (const group of seen.values()) {
    if (group.length < 2 || group[0].charge <= 0) continue;
    const extra = group.slice(1);
    for (const r of extra) flagged.add(r.line);
    add("high", "duplicate", `${group.length} identical lines: ${group[0].code || group[0].desc}`,
      `Lines ${group.map((r) => r.line).join(", ")} match on date, code, description, quantity and charge. Repeats are sometimes real (a repeated test, two separate doses), so ask which one was performed twice. The repeats add up to ${usd(extra.reduce((s, r) => s + r.charge, 0))}.`,
      group.map((r) => r.line), extra.reduce((s, r) => s + r.charge, 0));
  }

  // 2. Same code more than once a day, or a quantity above one, for once-a-day codes.
  const byDayCode = new Map();
  for (const r of records) {
    if (!r.code) continue;
    const key = r.date + "|" + r.code;
    if (!byDayCode.has(key)) byDayCode.set(key, []);
    byDayCode.get(key).push(r);
  }
  for (const [key, group] of byDayCode) {
    const code = group[0].code;
    if (!ONCE_PER_DAY.has(code)) continue;
    const units = group.reduce((s, r) => s + r.qty, 0);
    const distinctCharges = new Set(group.map((r) => r.charge)).size;
    const alreadyDup = group.length > 1 && distinctCharges === 1 && group.every((r) => flagged.has(r.line) || r === group[0]) && group.every((r) => r.qty === group[0].qty);
    if (units > 1 && !alreadyDup) {
      const amt = group.reduce((s, r) => s + r.charge, 0) - Math.min(...group.map((r) => r.charge));
      for (const r of group) flagged.add(r.line);
      add("medium", "quantity", `${code} billed ${units} times on ${group[0].date || "one date"}`,
        `${code} is normally billed once per date of service. A second unit can be legitimate with a modifier or a separate encounter; it is worth asking. Up to ${usd(amt)} is in question.`,
        group.map((r) => r.line), amt);
    }
  }
  for (const r of records) {
    if (r.qty >= 10 && r.charge > 0 && !flagged.has(r.line)) {
      add("info", "quantity", `Quantity ${r.qty} on ${r.code || r.desc}`, `${lineLabel(r)}. Large unit counts are normal for supplies, drugs and minutes; check that the quantity matches what was used.`, [r.line], 0);
    }
  }

  // 3. Unbundling: components billed alongside the panel that contains them.
  const dates = new Set(records.map((r) => r.date));
  for (const date of dates) {
    const day = records.filter((r) => r.date === date && r.code);
    const have = new Map();
    for (const r of day) { if (!have.has(r.code)) have.set(r.code, []); have.get(r.code).push(r); }
    for (const [panel, parts] of Object.entries(PANEL_MAP)) {
      if (!have.has(panel)) continue;
      const hit = parts.filter((p) => have.has(p));
      if (!hit.length) continue;
      const lines = hit.flatMap((p) => have.get(p));
      const amt = lines.reduce((s, r) => s + r.charge, 0);
      for (const r of lines) flagged.add(r.line);
      const mod = lines.some((r) => ["59", "XE", "XS", "XP", "XU", "91"].includes(r.modifier));
      add(mod ? "info" : "high", "unbundling", `${hit.join(", ")} billed with ${panel} (${PANEL_NAMES[panel]})${date ? " on " + date : ""}`,
        `${panel} already includes ${hit.join(", ")}. Billing them again is called unbundling. ${mod ? "A distinct-service modifier is present, which can make separate billing legitimate; ask what it documents. " : ""}${usd(amt)} of charges are in question.`,
        [...have.get(panel).map((r) => r.line), ...lines.map((r) => r.line)], mod ? 0 : amt);
    }
    // 4. Two levels of the same visit family on one day.
    for (const fam of FAMILIES) {
      const present = fam.codes.filter((c) => have.has(c));
      if (present.length > 1) {
        const lines = present.flatMap((c) => have.get(c));
        const amt = lines.reduce((s, r) => s + r.charge, 0) - Math.max(...lines.map((r) => r.charge));
        add("medium", "family", `${present.join(" and ")} on one date${date ? " (" + date + ")" : ""}`,
          `These are different levels of ${fam.name}. One encounter is normally coded at one level, so ask which one applies. The lower-priced line is up to ${usd(amt)}.`, lines.map((r) => r.line), amt);
      }
    }
  }

  // 5. Arithmetic on the columns the bill gives: charge - paid - adjustment = patient owes.
  let arithChecked = 0;
  for (const r of records) {
    if (r.owed === null || (r.paid === null && r.adj === null)) continue;
    arithChecked++;
    const expected = r.charge - (r.paid || 0) - Math.abs(r.adj || 0);
    if (Math.abs(expected - r.owed) > tolerance + 1e-9) {
      add("medium", "arithmetic", `Line ${r.line} does not add up`,
        `${lineLabel(r)}: charge ${usd(r.charge)} less insurance paid ${usd(r.paid || 0)} less adjustment ${usd(Math.abs(r.adj || 0))} is ${usd(expected)}, but the bill shows ${usd(r.owed)} owed. Difference ${usd(r.owed - expected)}. Some bills carry deductibles or copays in other columns; ask what the difference is.`,
        [r.line], Math.max(0, r.owed - expected));
    }
  }

  // 6. Lines with no procedure code, zero or negative charges, odd codes.
  const uncoded = records.filter((r) => codeKind(r.rawCode) === "none" && r.charge > 0);
  if (uncoded.length) {
    add("info", "uncoded", `${uncoded.length} charge line(s) with no code`, `A summary bill lists no procedure codes. Ask for the itemized bill with CPT/HCPCS or revenue codes so each line can be checked. Lines: ${uncoded.slice(0, 8).map((r) => r.line).join(", ")}${uncoded.length > 8 ? ", …" : ""}. ${usd(uncoded.reduce((s, r) => s + r.charge, 0))} of charges cannot be checked without codes.`, uncoded.map((r) => r.line), 0);
  }
  const odd = records.filter((r) => codeKind(r.rawCode) === "other");
  if (odd.length) add("info", "code", `${odd.length} code(s) not in a recognised format`, `Codes read as ${[...new Set(odd.map((r) => r.rawCode))].slice(0, 6).join(", ")}. CPT is five digits, HCPCS is a letter and four digits, revenue codes are four digits. These lines were not checked against the rules.`, odd.map((r) => r.line), 0);
  const credits = records.filter((r) => r.charge < 0);
  if (credits.length) add("info", "credit", `${credits.length} credit or negative line(s)`, `Credits are counted in the totals: ${usd(credits.reduce((s, r) => s + r.charge, 0))}. Confirm each matches an insurance payment or a corrected charge.`, credits.map((r) => r.line), 0);

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.amount - a.amount);
  const total = round2(records.reduce((s, r) => s + r.charge, 0));
  const questioned = round2(findings.filter((f) => f.severity !== "info").reduce((s, f) => s + f.amount, 0));
  const patientOwed = records.some((r) => r.owed !== null) ? round2(records.reduce((s, r) => s + (r.owed || 0), 0)) : null;
  const rulesChecked = ["duplicate lines", "once-a-day codes", "panel unbundling", "same-day visit levels", "line arithmetic"];
  return {
    summary: { lines: records.length, total, questioned: Math.min(questioned, total), flaggedLines: new Set(findings.filter((f) => f.severity !== "info").flatMap((f) => f.lines)).size, patientOwed, arithChecked, coded: records.filter((r) => r.code).length },
    findings, rulesChecked,
  };
}

export function requestLetter(a, who = {}) {
  const items = a.findings.filter((f) => f.severity !== "info");
  const body = items.length
    ? items.map((f, i) => `${i + 1}. ${f.title}. ${f.detail}`).join("\n")
    : "I would like a coding and charge review of the enclosed itemized bill.";
  return [
    `Date: ${who.date || "[date]"}`,
    `To: Patient Billing / Billing Compliance, ${who.provider || "[provider name]"}`,
    `Re: Request for itemized bill review. Account ${who.account || "[account number]"}, patient ${who.patient || "[patient name]"}`,
    "",
    "I am writing to request a review of the charges on my bill and a written response. Please place my account on hold and do not send it to collections while the review is open.",
    "",
    "Lines I would like explained or corrected:",
    body,
    "",
    "Please send: (1) a fully itemized statement with CPT/HCPCS and revenue codes, modifiers and units; (2) the notes that support any repeated or same-day lines above; (3) a corrected bill if any line is removed. I will compare the corrected bill with my insurer's explanation of benefits.",
    "",
    "Sincerely,",
    who.patient || "[patient name]",
  ].join("\n");
}


export function summaryText(a) {
  const s = a.summary;
  return [
    `Medical bill review: ${s.lines} line(s), ${usd(s.total)} billed.`,
    `${a.findings.filter((f) => f.severity !== "info").length} item(s) worth asking about, up to ${usd(s.questioned)} in question (${s.flaggedLines} line(s)).`,
    "These are questions for the billing office, not findings that the bill is wrong.",
    "",
    ...a.findings.map((f) => `[${f.severity}] ${f.title}: ${f.detail}`),
  ].join("\n");
}

export function reportCsv(a) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  return ["severity,kind,title,amount_in_question,lines,detail", ...a.findings.map((f) => [f.severity, f.kind, q(f.title), f.amount.toFixed(2), q(f.lines.join(" ")), q(f.detail)].join(","))].join("\n") + "\n";
}

export function sampleCsv() {
  return [
    "Date of Service,CPT/HCPCS,Description,Qty,Charge,Insurance Paid,Adjustment,Patient Responsibility",
    "03/04/2026,99284,Emergency dept visit level 4,1,1850.00,600.00,900.00,350.00",
    "03/04/2026,99283,Emergency dept visit level 3,1,1240.00,0.00,0.00,1240.00",
    "03/04/2026,80053,Comprehensive metabolic panel,1,310.00,60.00,200.00,50.00",
    "03/04/2026,82947,Glucose blood,1,85.00,0.00,0.00,85.00",
    "03/04/2026,84520,BUN,1,74.00,0.00,0.00,74.00",
    "03/04/2026,85025,CBC with differential,1,190.00,40.00,110.00,40.00",
    "03/04/2026,36415,Venipuncture,1,45.00,10.00,25.00,10.00",
    "03/04/2026,36415,Venipuncture,1,45.00,10.00,25.00,10.00",
    "03/04/2026,71046,Chest X-ray 2 views,1,520.00,150.00,300.00,100.00",
    "03/04/2026,J1885,Ketorolac injection,1,68.00,10.00,30.00,60.00",
    "03/04/2026,,Supplies,1,132.00,0.00,0.00,132.00",
  ].join("\n") + "\n";
}
