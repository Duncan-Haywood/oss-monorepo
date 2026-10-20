// Rental-property Schedule E categorizer: reads a bank or credit-card CSV export,
// sorts every transaction into an IRS Schedule E (Form 1040), Part I line
// (rents received, advertising, repairs, insurance, ...) or into a bucket that is
// NOT a Schedule E expense (mortgage principal, capital improvements, transfers,
// security deposits, owner draws), assigns it to a property, and reports totals
// per property, what could not be categorised, and what looks wrong (repairs that
// may be improvements, months with no rent, duplicate rows). Column names are
// matched by alias and no real bank export was available when this was written.
// Pure functions, no DOM, no network.

export const DEFAULT_SAFE_HARBOR = 2500;
export const DEFAULT_PROPERTY = "All properties";

// Schedule E, Part I, expense lines. `line` is the printed line number on the
// 2024-era form; check the form for the year you file.
export const CATEGORIES = {
  rent: { label: "Rents received", line: "3", kind: "income" },
  other_income: { label: "Other rental income (late fees, pet rent, laundry)", line: "3", kind: "income" },
  advertising: { label: "Advertising", line: "5", kind: "expense" },
  auto_travel: { label: "Auto and travel", line: "6", kind: "expense" },
  cleaning_maintenance: { label: "Cleaning and maintenance", line: "7", kind: "expense" },
  commissions: { label: "Commissions", line: "8", kind: "expense" },
  insurance: { label: "Insurance", line: "9", kind: "expense" },
  legal_professional: { label: "Legal and other professional fees", line: "10", kind: "expense" },
  management: { label: "Management fees", line: "11", kind: "expense" },
  mortgage_interest: { label: "Mortgage interest paid to banks", line: "12", kind: "expense" },
  other_interest: { label: "Other interest", line: "13", kind: "expense" },
  repairs: { label: "Repairs", line: "14", kind: "expense" },
  supplies: { label: "Supplies", line: "15", kind: "expense" },
  taxes: { label: "Taxes (property taxes)", line: "16", kind: "expense" },
  utilities: { label: "Utilities", line: "17", kind: "expense" },
  other: { label: "Other expenses (HOA, software, licences, pest control)", line: "19", kind: "expense" },
  mortgage_payment: { label: "Mortgage payment (needs a principal/interest split)", line: null, kind: "split" },
  capital: { label: "Capital improvement (depreciate, not deduct now)", line: null, kind: "excluded" },
  security_deposit: { label: "Security deposit in or out (not income or expense)", line: null, kind: "excluded" },
  transfer: { label: "Transfer between your own accounts", line: null, kind: "excluded" },
  owner: { label: "Owner draw or personal", line: null, kind: "excluded" },
  uncategorised: { label: "Not categorised", line: null, kind: "unknown" },
};

const LABEL_TO_KEY = Object.fromEntries(Object.entries(CATEGORIES).flatMap(([k, v]) => [[k, k], [v.label.toLowerCase(), k], ...(v.line && v.kind === "expense" ? [[`line ${v.line}`, k]] : [])]));
LABEL_TO_KEY["mortgage interest"] = "mortgage_interest";
LABEL_TO_KEY["property tax"] = "taxes";
LABEL_TO_KEY["property taxes"] = "taxes";
LABEL_TO_KEY["maintenance"] = "cleaning_maintenance";
LABEL_TO_KEY["cleaning"] = "cleaning_maintenance";
LABEL_TO_KEY["legal"] = "legal_professional";
LABEL_TO_KEY["professional"] = "legal_professional";
LABEL_TO_KEY["rents"] = "rent";
LABEL_TO_KEY["deposit"] = "security_deposit";
LABEL_TO_KEY["improvement"] = "capital";
LABEL_TO_KEY["capex"] = "capital";
LABEL_TO_KEY["personal"] = "owner";
LABEL_TO_KEY["hoa"] = "other";
export const categoryKey = (s) => LABEL_TO_KEY[String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ")] ?? null;

// Built-in keyword rules, tried in order after the user's own rules. Deliberately
// conservative: a keyword that would fit two lines is left out and the row goes
// to "not categorised" rather than being guessed.
const DEFAULT_RULES = [
  ["security_deposit", /security dep|deposit refund|dep(osit)? return|move.?in dep/],
  ["transfer", /\btransfer\b|xfer|online transfer|zelle to (self|me)|to savings|from savings|to checking|from checking/],
  ["mortgage_payment", /mortgage|mtg pmt|home loan|loan pmt|loan payment|rocket mortgage|mr\.? cooper|nationstar|pennymac|wells fargo home|chase mtg|servicing/],
  ["taxes", /property tax|county tax|treasurer|tax collector|tax assessor|city tax|school tax/],
  ["insurance", /insurance|state farm|allstate|geico|farmers ins|liberty mutual|progressive|lemonade|steadily|hippo|landlord policy|\bins prem/],
  ["management", /property manag|management fee|mgmt fee|\bpm fee|buildium|appfolio|rentredi|avail\b|turbotenant|innago|cozy/],
  ["advertising", /zillow|apartments\.com|trulia|hotpads|facebook ads|craigslist|listing fee|rent\.com|yard sign/],
  ["commissions", /leasing fee|leasing commission|tenant placement|placement fee|realtor comm|broker comm/],
  ["legal_professional", /attorney|law office|legal|cpa\b|accountant|bookkeep|tax prep|turbotax|h&r block|eviction|court fee|filing fee|screening|transunion|smartmove|tenant screening/],
  ["utilities", /electric|water|sewer|\bgas co|natural gas|trash|garbage|waste manage|republic services|comcast|xfinity|spectrum|internet|utility|utilities|pge|con ?ed|duke energy/],
  ["cleaning_maintenance", /clean|janitor|lawn|landscap|snow|mow|pest|exterminat|turnover|maid|gutter|pressure wash|trash out|junk/],
  ["repairs", /repair|plumb|electrician|hvac|handyman|locksmith|appliance|roofer|drywall|painter|paint (?:crew|service)|carpet repair|fix\b|service call/],
  ["supplies", /home depot|lowe'?s|lowes|ace hardware|menards|harbor freight|true value|amazon|walmart|supply|hardware|sherwin|benjamin moore|grainger/],
  ["auto_travel", /mileage|fuel|shell oil|chevron|exxon|parking|toll|uber|lyft|airline|hotel|marriott|hilton/],
  ["other", /\bhoa\b|homeowners assoc|condo assoc|association dues|license|permit|registration|software|dues|subscription|rental registry|inspection fee/],
];

const CAPEX_HINT = /\b(new roof|roof replace|re-?roof|replace(?:ment)? (?:of )?(?:hvac|furnace|water heater|windows|roof|flooring|siding|deck)|new (?:hvac|furnace|water heater|windows|flooring|siding|deck|fence|appliances?)|remodel|renovat|addition|kitchen (?:reno|remodel)|bath(?:room)? (?:reno|remodel)|foundation|repave|driveway replace|central air)\b/i;

const ALIASES = {
  date: ["date", "transaction date", "posted date", "post date", "posting date", "trans date", "booking date", "effective date"],
  desc: ["description", "transaction description", "payee", "merchant", "name", "details", "original description", "memo", "narrative"],
  amount: ["amount", "transaction amount", "amt", "value"],
  debit: ["debit", "debits", "withdrawal", "withdrawals", "money out", "paid out", "amount debit"],
  credit: ["credit", "credits", "deposit", "deposits", "money in", "paid in", "amount credit"],
  property: ["property", "property name", "unit", "class", "tag", "account name"],
  category: ["category", "bank category"],
  balance: ["balance", "running balance", "running bal."],
};

export function parseNumber(v, decimalComma = false) {
  let s = String(v ?? "").trim();
  if (s === "" || /^[-–—\s]+$/.test(s)) return 0;
  const neg = /^\(.*\)$/.test(s) || /^[-−]/.test(s) || /^\$?\s*[-−]/.test(s) || /-\s*$/.test(s);
  s = s.replace(/[^0-9.,]/g, "");
  s = decimalComma ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s);
  if (!s || !Number.isFinite(n)) return NaN;
  return neg ? -n : n;
}

export function decodeBuffer(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder("utf-16le").decode(u8);
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder("utf-16be").decode(u8);
  return new TextDecoder("utf-8").decode(u8);
}

export function detectDelimiter(text) {
  const head = String(text ?? "").split(/\r?\n/).filter((l) => l.trim()).slice(0, 8).join("\n");
  const n = (c) => head.split(c).length - 1;
  const best = [["\t", n("\t")], [";", n(";")], [",", n(",")]].sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ",";
}

export function parseCsv(text, delim = ",") {
  const rows = [];
  let row = [], field = "", quoted = false;
  const src = String(text ?? "").replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const r2 = (n) => Math.round(n * 100) / 100;
export const money = (n) => (n < 0 ? "-" : "") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isBlank = (s) => s === "" || /^[-–—\s]+$/.test(s);

export function findColumns(header, aliases) {
  const norm = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, " "));
  const cols = {};
  for (const [field, names] of Object.entries(aliases)) {
    for (const n of names) {
      const at = norm.indexOf(n);
      if (at !== -1 && !Object.values(cols).includes(at)) { cols[field] = at; break; }
    }
  }
  return cols;
}

// "2024-03-05", "03/05/2024", "3/5/24", "5 Mar 2024" -> "YYYY-MM-DD" or null.
export function parseDate(v, dayFirst = false) {
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  let y, mo, d;
  if (m) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/))) {
    let a = +m[1], b = +m[2];
    y = +m[3]; if (y < 100) y += 2000;
    if (dayFirst || a > 12) { d = a; mo = b; } else { mo = a; d = b; }
  } else if ((m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})/))) {
    mo = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ").indexOf(m[2].toLowerCase()) + 1; d = +m[1]; y = +m[3];
  } else if ((m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/))) {
    mo = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ").indexOf(m[1].toLowerCase()) + 1; d = +m[2]; y = +m[3];
  } else return null;
  if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function findHeader(table) {
  for (let i = 0; i < Math.min(table.length, 15); i++) {
    const cols = findColumns(table[i], ALIASES);
    if (cols.date !== undefined && cols.desc !== undefined && (cols.amount !== undefined || cols.debit !== undefined || cols.credit !== undefined)) return { h: i, cols };
  }
  return null;
}

const isTotal = (s) => /^(total|totals|subtotal|grand total|opening balance|closing balance|beginning balance|ending balance)\b/i.test(s.trim());

// Bank table -> { txns, skipped, columns, error }. Each txn is
// { line, date, desc, amount, property, bankCategory } with amount signed from the
// OWNER's side: money in is positive, money out negative. A card export that lists
// charges as positive numbers needs `invertSign`.
export function normalizeBank(table, { decimalComma = false, invertSign = false, dayFirst = false } = {}) {
  const empty = { txns: [], skipped: [], columns: {} };
  if (!table.length) return { ...empty, error: "The bank file is empty." };
  const found = findHeader(table);
  if (!found) return { ...empty, error: "No header row found. Expected a date, a description and an amount (or debit and credit) column, as in a bank or card CSV export." };
  const { h, cols } = found;
  const get = (line, f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
  const columns = {};
  for (const [f, at] of Object.entries(cols)) columns[f] = table[h][at].trim();
  const txns = [], skipped = [];
  for (let i = h + 1; i < table.length; i++) {
    const line = table[i], lineNo = i + 1;
    const desc = get(line, "desc").replace(/\s+/g, " ");
    if (isTotal(desc) || isTotal(get(line, "date"))) { skipped.push({ line: lineNo, reason: "total or balance row" }); continue; }
    const date = parseDate(get(line, "date"), dayFirst);
    if (!date) { skipped.push({ line: lineNo, reason: "date not readable" }); continue; }
    let amount;
    if (cols.amount !== undefined && !isBlank(get(line, "amount"))) amount = parseNumber(get(line, "amount"), decimalComma);
    else {
      const dr = isBlank(get(line, "debit")) ? 0 : parseNumber(get(line, "debit"), decimalComma);
      const cr = isBlank(get(line, "credit")) ? 0 : parseNumber(get(line, "credit"), decimalComma);
      amount = Number.isFinite(dr) && Number.isFinite(cr) ? Math.abs(cr) - Math.abs(dr) : NaN;
    }
    if (!Number.isFinite(amount)) { skipped.push({ line: lineNo, reason: "amount not readable" }); continue; }
    if (amount === 0) { skipped.push({ line: lineNo, reason: "zero amount" }); continue; }
    txns.push({ line: lineNo, date, desc: desc || "(no description)", amount: r2(invertSign ? -amount : amount), property: get(line, "property"), bankCategory: get(line, "category") });
  }
  return { txns, skipped, columns };
}

// "keyword => Category" lines, one per line; # starts a comment.
export function parseRules(text) {
  const rules = [], skipped = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) return;
    const at = line.indexOf("=>");
    if (at === -1) { skipped.push({ line: i + 1, reason: "expected “keyword => category”" }); return; }
    const kw = line.slice(0, at).trim().toLowerCase(), target = line.slice(at + 2).trim();
    const key = categoryKey(target);
    if (!kw || !key) { skipped.push({ line: i + 1, reason: key ? "empty keyword" : `unknown category “${target}”` }); return; }
    rules.push({ kw, key });
  });
  return { rules, skipped };
}

// "keyword => Property name" lines, matched against the description.
export function parsePropertyRules(text) {
  const rules = [], skipped = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) return;
    const at = line.indexOf("=>");
    const kw = at === -1 ? "" : line.slice(0, at).trim().toLowerCase(), name = at === -1 ? "" : line.slice(at + 2).trim();
    if (!kw || !name) { skipped.push({ line: i + 1, reason: "expected “keyword => property name”" }); return; }
    rules.push({ kw, name });
  });
  return { rules, skipped };
}

// "Property name, interest" lines from the lender's year-end statement (Form 1098).
export function parseInterest(text) {
  const map = {}, skipped = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) return;
    const at = line.lastIndexOf(",");
    const name = at === -1 ? "" : line.slice(0, at).trim(), n = at === -1 ? NaN : parseNumber(line.slice(at + 1));
    if (!name || !Number.isFinite(n) || n < 0) { skipped.push({ line: i + 1, reason: "expected “property, interest amount”" }); return; }
    map[name] = (map[name] ?? 0) + n;
  });
  return { map, skipped };
}

function categorise(t, userRules) {
  const d = t.desc.toLowerCase();
  for (const r of userRules) if (d.includes(r.kw)) return { key: r.key, source: "your rule" };
  const income = t.amount > 0;
  if (income) {
    if (/security dep|deposit/.test(d) && /security/.test(d)) return { key: "security_deposit", source: "built-in" };
    if (/\btransfer\b|xfer/.test(d)) return { key: "transfer", source: "built-in" };
    if (/late fee|pet rent|pet fee|laundry|application fee|app fee|parking rent/.test(d)) return { key: "other_income", source: "built-in" };
    if (/\brent\b|rental|lease|tenant|zelle|venmo|apartment|unit\s?\w+|cash app|paypal|deposit/.test(d)) return { key: "rent", source: "built-in" };
    return { key: "uncategorised", source: "none" };
  }
  for (const [key, re] of DEFAULT_RULES) if (re.test(d)) return { key, source: "built-in" };
  return { key: "uncategorised", source: "none" };
}

const dayNum = (iso) => Math.round(Date.parse(iso + "T00:00:00Z") / 86400000);
const monthKey = (iso) => iso.slice(0, 7);

export function analyze(txns, opts = {}) {
  const { userRules = [], propertyRules = [], interestByProperty = {}, safeHarbor = DEFAULT_SAFE_HARBOR, year = NaN, defaultProperty = DEFAULT_PROPERTY } = opts;
  if (!txns.length) return { invalid: "No transactions to analyse." };
  if (!Number.isFinite(safeHarbor) || safeHarbor < 0) return { invalid: "The repair threshold must be zero or more." };
  const inYear = Number.isFinite(year) ? txns.filter((t) => t.date.startsWith(String(year))) : txns.slice();
  const outOfYear = txns.length - inYear.length;
  if (!inYear.length) return { invalid: `No transactions dated ${year}.` };

  const rows = inYear.map((t) => {
    const c = categorise(t, userRules);
    let property = t.property || "";
    const d = t.desc.toLowerCase();
    let propSource = t.property ? "column" : "";
    for (const r of propertyRules) if (d.includes(r.kw)) { property = r.name; propSource = "your rule"; break; }
    if (!property) { property = defaultProperty; propSource = "none"; }
    return { ...t, key: c.key, source: c.source, property, propSource, flags: [] };
  });

  // Pair up uncategorised money-out with an equal and opposite row within 3 days:
  // a transfer between two of the owner's accounts, if both files are loaded.
  const open = rows.filter((r) => r.key === "uncategorised");
  const used = new Set();
  for (const a of open) {
    if (used.has(a)) continue;
    const b = open.find((x) => x !== a && !used.has(x) && Math.abs(x.amount + a.amount) < 0.005 && Math.abs(dayNum(x.date) - dayNum(a.date)) <= 3);
    if (b) { a.key = b.key = "transfer"; a.source = b.source = "paired"; used.add(a); used.add(b); }
  }

  const dupSeen = new Map(), dups = [];
  for (const r of rows) {
    const k = `${r.date}|${r.desc.toLowerCase()}|${r.amount}`;
    if (dupSeen.has(k)) { r.flags.push("possible duplicate"); dups.push(r); dupSeen.get(k).flags.includes("possible duplicate") || dupSeen.get(k).flags.push("possible duplicate"); }
    else dupSeen.set(k, r);
  }

  const capexCandidates = [];
  for (const r of rows) {
    if (r.amount >= 0) continue;
    const out = -r.amount;
    const spendKey = ["repairs", "cleaning_maintenance", "supplies", "uncategorised", "other"].includes(r.key);
    if (spendKey && (CAPEX_HINT.test(r.desc) || out > safeHarbor)) {
      r.flags.push(CAPEX_HINT.test(r.desc) ? "may be an improvement" : `over ${usd(safeHarbor)}`);
      capexCandidates.push(r);
    }
  }

  const props = [...new Set(rows.map((r) => r.property))].sort((a, b) => a.localeCompare(b));
  const lineKeys = Object.keys(CATEGORIES);
  const byProp = {};
  for (const p of props) byProp[p] = Object.fromEntries(lineKeys.map((k) => [k, 0]));
  for (const r of rows) byProp[r.property][r.key] += r.amount;

  const interestNotes = [];
  const propsAll = props.map((p) => {
    const t = byProp[p];
    const paid = -t.mortgage_payment;
    const typed = Object.entries(interestByProperty).find(([n]) => n.toLowerCase() === p.toLowerCase());
    const expensesBefore = lineKeys.filter((k) => CATEGORIES[k].kind === "expense").reduce((s, k) => s + -t[k], 0);
    let interest = -t.mortgage_interest, principalEscrow = null, interestSource = interest ? "your rule" : "none";
    if (typed) {
      interest += typed[1];
      interestSource = "typed from lender statement";
      principalEscrow = paid - typed[1];
      if (principalEscrow < -0.005) interestNotes.push(`${p}: the interest you typed (${usd(typed[1])}) is more than the mortgage payments found (${usd(paid)}). Check the property name or the year.`);
    }
    const income = t.rent + t.other_income;
    const lines = lineKeys.filter((k) => CATEGORIES[k].kind === "expense").map((k) => ({ key: k, label: CATEGORIES[k].label, line: CATEGORIES[k].line, amount: r2(k === "mortgage_interest" ? interest : -t[k]) }));
    const expenses = lines.reduce((s, l) => s + l.amount, 0);
    return {
      property: p, rents: r2(t.rent), otherIncome: r2(t.other_income), income: r2(income), lines, expenses: r2(expenses), net: r2(income - expenses),
      mortgagePaid: r2(paid), interest: r2(interest), interestSource, principalEscrow: principalEscrow === null ? null : r2(principalEscrow),
      capitalExcluded: r2(-t.capital), depositsNet: r2(t.security_deposit), transfers: r2(t.transfer), ownerDraws: r2(-t.owner), uncategorised: r2(t.uncategorised),
      needsSplit: paid > 0.005 && !typed, expensesBefore: r2(expensesBefore),
    };
  });

  const propsOut = propsAll.filter((p) => p.property !== defaultProperty || p.income || p.expenses || p.mortgagePaid || p.capitalExcluded || p.uncategorised);

  // Rent that should have arrived: months with no rent deposit between a property's first and last one.
  const missing = [];
  for (const p of props) {
    const months = [...new Set(rows.filter((r) => r.property === p && r.key === "rent").map((r) => monthKey(r.date)))].sort();
    if (months.length < 2) continue;
    const have = new Set(months);
    let [y, m] = months[0].split("-").map(Number);
    const [ey, em] = months[months.length - 1].split("-").map(Number);
    while (y < ey || (y === ey && m <= em)) {
      const k = `${y}-${String(m).padStart(2, "0")}`;
      if (!have.has(k)) missing.push({ property: p, month: k });
      if (++m > 12) { m = 1; y++; }
    }
  }

  const uncategorised = rows.filter((r) => r.key === "uncategorised").sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const totals = {
    txns: rows.length,
    income: r2(propsOut.reduce((s, p) => s + p.income, 0)),
    expenses: r2(propsOut.reduce((s, p) => s + p.expenses, 0)),
    net: r2(propsOut.reduce((s, p) => s + p.net, 0)),
    uncategorisedCount: uncategorised.length,
    uncategorisedAmount: r2(uncategorised.reduce((s, r) => s + r.amount, 0)),
    categorisedPct: rows.length ? r2(((rows.length - uncategorised.length) / rows.length) * 100) : 0,
    from: rows.map((r) => r.date).sort()[0],
    to: rows.map((r) => r.date).sort().slice(-1)[0],
    outOfYear,
  };

  const findings = [];
  if (uncategorised.length) findings.push({ severity: "high", title: `${uncategorised.length} transaction(s), ${usd(uncategorised.reduce((s, r) => s + Math.abs(r.amount), 0))} moved, not categorised`, detail: "Add a “keyword => category” rule for each and run it again. Nothing is guessed: a row with no clear category stays out of the totals until you say where it goes." });
  const split = propsOut.filter((p) => p.needsSplit);
  if (split.length) findings.push({ severity: "high", title: `Mortgage payments on ${split.map((p) => p.property).join(", ")} are not on Schedule E yet`, detail: "Only the interest part of a mortgage payment is deductible. Principal is not an expense and escrow is split into taxes and insurance. Type the year's interest from your lender's Form 1098 for each property to include it." });
  for (const n of interestNotes) findings.push({ severity: "high", title: "Interest amount does not fit the payments", detail: n });
  if (capexCandidates.length) findings.push({ severity: "medium", title: `${capexCandidates.length} repair-like item(s) that may have to be capitalised`, detail: "Items over your threshold or worded like a replacement or remodel are listed below. Repairs keep property in working order and are deducted now; betterments, restorations and adaptations are capitalised and depreciated. A safe-harbor election may allow deducting items up to a per-item limit. A preparer decides which applies." });
  if (missing.length) findings.push({ severity: "medium", title: `${missing.length} month(s) with no rent deposit between a property's first and last rent`, detail: missing.slice(0, 8).map((x) => `${x.property} ${x.month}`).join("; ") + (missing.length > 8 ? "; …" : "") + ". A vacancy, a late payer, or a deposit that landed in an account not in this file." });
  if (dups.length) findings.push({ severity: "medium", title: `${dups.length} possible duplicate row(s)`, detail: "Same date, description and amount appear more than once. Two identical real payments are possible, and overlapping exports are common. Duplicates are flagged, not removed." });
  if (props.length === 1 && props[0] === defaultProperty && propsOut.length) findings.push({ severity: "info", title: "Everything is under one property", detail: "Schedule E reports each property separately. Add a property column or “keyword => property name” rules to split them." });
  if (outOfYear) findings.push({ severity: "info", title: `${outOfYear} transaction(s) outside ${year} were left out`, detail: "Change or clear the tax year to include them." });
  const negIncome = rows.filter((r) => r.key === "rent" && r.amount < 0);
  if (negIncome.length) findings.push({ severity: "info", title: `${negIncome.length} negative rent row(s)`, detail: "A refunded or returned payment nets against rent. Check they are what you expect." });

  const categoryTotals = lineKeys.map((k) => ({ key: k, label: CATEGORIES[k].label, line: CATEGORIES[k].line, kind: CATEGORIES[k].kind, count: rows.filter((r) => r.key === k).length, amount: r2(rows.filter((r) => r.key === k).reduce((s, r) => s + r.amount, 0)) })).filter((c) => c.count);

  return { rows, properties: propsOut, totals, findings, uncategorised, capexCandidates, missing, categoryTotals, safeHarbor };
}

const csvCell = (v) => { const s = String(v ?? ""); return /[",\n\r]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const guard = (v) => (/^[=+\-@\t\r]/.test(String(v)) ? "'" + v : v);

export function reportCsv(a) {
  const out = [["Date", "Description", "Amount", "Property", "Category", "Schedule E line", "Decided by", "Flags"]];
  for (const r of a.rows) out.push([r.date, guard(r.desc), r.amount.toFixed(2), r.property, CATEGORIES[r.key].label, CATEGORIES[r.key].line ?? "", r.source, r.flags.join("; ")]);
  return out.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export function summaryText(a) {
  const t = a.totals, out = [];
  out.push(`Rental income and expenses ${t.from} to ${t.to}: ${t.txns} transaction(s), ${t.categorisedPct}% categorised. Income ${usd(t.income)}, expenses ${usd(t.expenses)}, net ${usd(t.net)} before depreciation.`);
  for (const p of a.properties) {
    out.push("");
    out.push(`${p.property}: rents ${usd(p.income)}, expenses ${usd(p.expenses)}, net ${usd(p.net)} before depreciation`);
    for (const l of p.lines) if (l.amount) out.push(`  Line ${l.line} ${l.label}: ${usd(l.amount)}`);
    if (p.needsSplit) out.push(`  Mortgage payments ${usd(p.mortgagePaid)} NOT included: type the year's interest from Form 1098.`);
    else if (p.principalEscrow !== null) out.push(`  Mortgage payments ${usd(p.mortgagePaid)} = interest ${usd(p.interest)} + principal and escrow ${usd(p.principalEscrow)} (the last part is not on line 12).`);
    if (p.capitalExcluded) out.push(`  Capital improvements ${usd(p.capitalExcluded)} excluded (depreciate).`);
  }
  if (a.uncategorised.length) out.push("", `Not categorised: ${a.uncategorised.length} row(s), net ${usd(a.totals.uncategorisedAmount)}.`);
  out.push("", "Estimate from a bank file and your rules. Not tax advice. Have a preparer confirm the lines, repairs versus improvements, and depreciation.");
  return out.join("\n");
}

export function sampleCsv() {
  const bank = [
    "Date,Description,Amount",
    "01/03/2024,ZELLE FROM JORDAN LEE RENT 12 OAK ST,1650.00",
    "01/05/2024,ROCKET MORTGAGE 12 OAK ST,-1120.40",
    "01/09/2024,STATE FARM LANDLORD POLICY 12 OAK ST,-142.00",
    "01/12/2024,HOME DEPOT #4821 12 OAK ST,-86.13",
    "01/15/2024,ZELLE FROM SAM PATEL RENT 8 ELM AVE UNIT B,1200.00",
    "01/20/2024,ACE PLUMBING SERVICE CALL 8 ELM AVE,-215.00",
    "02/01/2024,ZELLE FROM JORDAN LEE RENT 12 OAK ST,1650.00",
    "02/05/2024,ROCKET MORTGAGE 12 OAK ST,-1120.40",
    "02/14/2024,ZELLE FROM SAM PATEL RENT 8 ELM AVE UNIT B,1200.00",
    "02/18/2024,TOP ROOF CO NEW ROOF 12 OAK ST,-8400.00",
    "03/01/2024,ZELLE FROM JORDAN LEE RENT 12 OAK ST,1650.00",
    "03/05/2024,ROCKET MORTGAGE 12 OAK ST,-1120.40",
    "03/05/2024,ROCKET MORTGAGE 12 OAK ST,-1120.40",
    "03/22/2024,COUNTY TREASURER PROPERTY TAX 8 ELM AVE,-1310.55",
    "03/25/2024,ONLINE TRANSFER TO SAVINGS,-500.00",
    "03/26/2024,SQ *KEYS AND LOCKS,-64.00",
  ].join("\n");
  return { bank, rules: "", properties: "12 oak => 12 Oak St\n8 elm => 8 Elm Ave (Unit B)", interest: "12 Oak St, 3980.25" };
}
