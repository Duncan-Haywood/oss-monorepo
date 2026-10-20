// Freelancer Schedule C categorizer: reads a bank or credit-card CSV export and
// sorts every transaction into an IRS Schedule C (Form 1040) line -- gross
// receipts, advertising, car and truck, contract labor, supplies, meals at 50%,
// and so on -- or into a bucket that is NOT a Schedule C expense (owner draws,
// transfers, estimated-tax payments, sales tax collected, loan principal, health
// insurance and retirement contributions, equipment that may need depreciating).
// It reports totals per business, what could not be categorised, and what looks
// wrong (processor payouts that are net of fees, equipment over the threshold,
// duplicates). Column names are matched by alias and no real bank export was
// available when this was written. Pure functions, no DOM, no network.

export const DEFAULT_SAFE_HARBOR = 2500;
export const DEFAULT_BUSINESS = "My business";
export const MEALS_DEDUCTIBLE = 0.5;

// Schedule C, Part I (income) and Part II (expenses). `line` is the printed line
// number on the 2024-era form; check the form for the year you file.
export const CATEGORIES = {
  receipts: { label: "Gross receipts or sales", line: "1", kind: "income" },
  other_income: { label: "Other business income (interest, refunds of expenses)", line: "6", kind: "income" },
  advertising: { label: "Advertising", line: "8", kind: "expense" },
  car_truck: { label: "Car and truck expenses (actual costs)", line: "9", kind: "expense" },
  commissions: { label: "Commissions and fees", line: "10", kind: "expense" },
  contract_labor: { label: "Contract labor", line: "11", kind: "expense" },
  insurance: { label: "Insurance (other than health)", line: "15", kind: "expense" },
  interest: { label: "Interest (business loans and cards)", line: "16b", kind: "expense" },
  legal_professional: { label: "Legal and professional services", line: "17", kind: "expense" },
  office: { label: "Office expense (software, postage, small tools)", line: "18", kind: "expense" },
  rent: { label: "Rent or lease (equipment, coworking, office)", line: "20b", kind: "expense" },
  repairs: { label: "Repairs and maintenance", line: "21", kind: "expense" },
  supplies: { label: "Supplies", line: "22", kind: "expense" },
  taxes_licenses: { label: "Taxes and licences", line: "23", kind: "expense" },
  travel: { label: "Travel", line: "24a", kind: "expense" },
  meals: { label: "Deductible meals (50% of what you spent)", line: "24b", kind: "meals" },
  utilities: { label: "Utilities (phone, internet)", line: "25", kind: "expense" },
  wages: { label: "Wages (employees)", line: "26", kind: "expense" },
  other: { label: "Other expenses (Part V: bank fees, dues, education, web hosting)", line: "27a", kind: "expense" },
  equipment: { label: "Equipment or a big purchase (depreciate or elect to expense, not a plain expense)", line: null, kind: "excluded" },
  est_tax: { label: "Estimated tax payment (IRS or state; not an expense)", line: null, kind: "excluded" },
  sales_tax: { label: "Sales tax collected or remitted (not income or expense)", line: null, kind: "excluded" },
  health_insurance: { label: "Health insurance (Schedule 1, not Schedule C)", line: null, kind: "excluded" },
  retirement: { label: "Retirement contribution (SEP, solo 401(k), IRA; not Schedule C)", line: null, kind: "excluded" },
  loan_principal: { label: "Loan or card payment (principal is not an expense)", line: null, kind: "excluded" },
  transfer: { label: "Transfer between your own accounts", line: null, kind: "excluded" },
  owner: { label: "Owner draw or personal", line: null, kind: "excluded" },
  investment_income: { label: "Bank interest or dividends (Schedule B, not Schedule C)", line: null, kind: "excluded" },
  uncategorised: { label: "Not categorised", line: null, kind: "unknown" },
};

const LABEL_TO_KEY = Object.fromEntries(Object.entries(CATEGORIES).flatMap(([k, v]) => [[k, k], [v.label.toLowerCase(), k], ...(v.line ? [[`line ${v.line}`, k]] : [])]));
const ALIAS_LABELS = {
  income: "receipts", sales: "receipts", revenue: "receipts", "gross receipts": "receipts", "line 1": "receipts",
  ads: "advertising", marketing: "advertising", "car and truck": "car_truck", car: "car_truck", mileage: "car_truck", vehicle: "car_truck",
  fees: "commissions", commission: "commissions", "processing fees": "commissions", contractor: "contract_labor", "contract labour": "contract_labor", freelancers: "contract_labor",
  software: "office", "office expense": "office", postage: "office", "professional fees": "legal_professional", legal: "legal_professional", professional: "legal_professional", accounting: "legal_professional",
  coworking: "rent", lease: "rent", maintenance: "repairs", "licenses": "taxes_licenses", licences: "taxes_licenses", license: "taxes_licenses", taxes: "taxes_licenses",
  phone: "utilities", internet: "utilities", meal: "meals", "meals and entertainment": "meals", "bank fees": "other", education: "other", dues: "other",
  capex: "equipment", asset: "equipment", "estimated tax": "est_tax", "estimated taxes": "est_tax", "sales tax": "sales_tax", health: "health_insurance", "health insurance": "health_insurance", "sep ira": "retirement", "solo 401k": "retirement",
  loan: "loan_principal", "bank interest": "investment_income", dividends: "investment_income",
  personal: "owner", draw: "owner",
};
for (const [alias, key] of Object.entries(ALIAS_LABELS)) LABEL_TO_KEY[alias] = key;
export const categoryKey = (s) => LABEL_TO_KEY[String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ")] ?? null;

// Built-in keyword rules for MONEY OUT, tried in order after the user's own rules.
// Deliberately conservative: a keyword that would fit two lines is left out and the
// row goes to "not categorised" rather than being guessed. Order matters: the
// not-an-expense buckets come first so a "TAX PAYMENT" never lands on line 23.
const DEFAULT_RULES = [
  ["transfer", /\btransfer\b|xfer|online transfer|to savings|from savings|to checking|from checking|zelle to (self|me)|venmo cashout|paypal transfer to bank/],
  ["est_tax", /usataxpymt|irs treas|irs usataxpymt|eftps|direct pay.*irs|estimated tax|franchise tax board.*(est|payment)|state tax payment|dept of revenue.*(est|payment)/],
  ["sales_tax", /sales tax|use tax|dept of revenue.*sales|comptroller.*sales|cdtfa|streamlined sales/],
  ["health_insurance", /health ?insur|blue cross|bcbs|aetna|cigna|united ?healthcare|kaiser|oscar health|ambetter|healthcare\.gov|covered ca|obamacare/],
  ["retirement", /\bsep\b|sep ira|solo 401|solo ?k|fidelity.*(ira|401)|vanguard.*(ira|401)|schwab.*ira|ira contribution|roth ira/],
  ["loan_principal", /loan pmt|loan payment|credit card payment|autopay.*(card|visa|mastercard|amex)|amex epayment|chase card pmt|payment thank you|capital one.*(pmt|payment)|sba loan|student loan/],
  ["owner", /owner draw|personal|atm withdrawal|cash withdrawal|netflix|spotify|hulu|disney|grocery|kroger|safeway|trader joe|whole foods|target\b|costco|walgreens|cvs|rent payment|mortgage/],
  ["advertising", /google ads|facebook ads|meta ads|fb ads|instagram ads|linkedin ads|tiktok ads|yelp ads|mailchimp|constant contact|canva|vistaprint|business cards|billboard|sponsor/],
  ["contract_labor", /upwork|fiverr|toptal|freelancer\.com|contractor pay|1099 pay|subcontract|zelle to .*(design|editor|va\b|assistant)/],
  ["commissions", /stripe fee|paypal fee|square fee|processing fee|merchant fee|payoneer fee|gumroad fee|etsy fee|shopify fee|transaction fee|commission/],
  ["insurance", /insurance|hiscox|next insurance|thimble|state farm|geico.*(commercial|business)|liberty mutual|progressive.*(commercial|business)|liability policy|e&o|errors and omissions/],
  ["legal_professional", /attorney|law office|legal|cpa\b|accountant|bookkeep|tax prep|turbotax|h&r block|bench\b|legalzoom|incfile|northwest registered|registered agent/],
  ["rent", /wework|regus|coworking|office rent|storage unit|public storage|equipment rental|lease pmt|craftsman coworking/],
  ["utilities", /verizon|at&t|att\*|t-mobile|comcast|xfinity|spectrum|internet|cox comm|frontier comm|mint mobile|google fi|phone bill|electric bill|utility/],
  ["taxes_licenses", /business licen[cs]e|permit|secretary of state|annual report|registered business|city of .*license|professional licen[cs]e|state license/],
  ["travel", /airline|delta air|united air|american air|southwest|jetblue|airbnb|hotel|marriott|hilton|hyatt|expedia|booking\.com|amtrak|greyhound|uber\b|lyft|taxi|parking|toll|rental car|hertz|enterprise rent|avis/],
  ["meals", /restaurant|cafe|coffee|starbucks|doordash|uber eats|grubhub|chipotle|panera|mcdonald|pizza|bistro|diner|grill|kitchen\b|taqueria|sushi|bar & |tavern/],
  ["car_truck", /shell oil|chevron|exxon|mobil|bp\b|gas station|fuel|jiffy lube|car wash|oil change|tire|autozone|o'?reilly|napa auto|dmv|vehicle registration/],
  ["repairs", /repair|service call|fix\b|maintenance|handyman|appliance/],
  ["equipment", /apple store|apple\.com\/us|best buy|b&h photo|adorama|dell\b|lenovo|newegg|micro center|macbook|laptop|camera|lens\b|dji|vehicle purchase|equipment purchase|machinery|furniture|standing desk|ikea/],
  ["office", /quickbooks|freshbooks|xero|wave apps|adobe|microsoft|google workspace|gsuite|g suite|dropbox|notion|slack|zoom|figma|github|atlassian|jetbrains|1password|lastpass|openai|anthropic|chatgpt|midjourney|zapier|airtable|squarespace|wix|godaddy|namecheap|cloudflare|aws|amazon web|digitalocean|heroku|vercel|netlify|usps|stamps\.com|pirate ship|fedex|ups store|staples|office depot|office supply|printer ink|software|saas|subscription/],
  ["supplies", /home depot|lowe'?s|lowes|ace hardware|menards|harbor freight|michaels|hobby lobby|joann|uline|grainger|amazon|walmart|supply|supplies|hardware|materials/],
  ["other", /bank fee|monthly fee|service charge|wire fee|overdraft|nsf fee|dues|association|membership|conference|udemy|coursera|skillshare|masterclass|education|tuition|course|webinar|book\b|ebook|hosting|domain|bank service/],
];

const EQUIPMENT_HINT = /\b(macbook|laptop|computer|camera|lens|drone|vehicle|truck|van\b|trailer|machinery|equipment|furniture|desk|monitor|server|printer|kiln|espresso machine|tool ?set)\b/i;

const ALIASES = {
  date: ["date", "transaction date", "posted date", "post date", "posting date", "trans date", "booking date", "effective date"],
  desc: ["description", "transaction description", "payee", "merchant", "name", "details", "original description", "memo", "narrative"],
  amount: ["amount", "transaction amount", "amt", "value"],
  debit: ["debit", "debits", "withdrawal", "withdrawals", "money out", "paid out", "amount debit"],
  credit: ["credit", "credits", "deposit", "deposits", "money in", "paid in", "amount credit"],
  business: ["business", "business name", "client", "class", "tag", "account name", "project"],
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
// { line, date, desc, amount, business, bankCategory } with amount signed from the
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
    txns.push({ line: lineNo, date, desc: desc || "(no description)", amount: r2(invertSign ? -amount : amount), business: get(line, "business"), bankCategory: get(line, "category") });
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

// "keyword => Business name" lines, matched against the description. Only needed
// when one file holds more than one Schedule C business.
export function parseBusinessRules(text) {
  const rules = [], skipped = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) return;
    const at = line.indexOf("=>");
    const kw = at === -1 ? "" : line.slice(0, at).trim().toLowerCase(), name = at === -1 ? "" : line.slice(at + 2).trim();
    if (!kw || !name) { skipped.push({ line: i + 1, reason: "expected “keyword => business name”" }); return; }
    rules.push({ kw, name });
  });
  return { rules, skipped };
}

const PROCESSOR = /stripe|paypal|square|shopify|etsy|gumroad|payoneer|paddle|lemon ?squeezy|amazon (?:payments|seller)|doordash|uber|lyft|instacart|patreon|substack|adsense|youtube|twitch|kdp/;

function categorise(t, userRules) {
  const d = t.desc.toLowerCase();
  for (const r of userRules) if (d.includes(r.kw)) return { key: r.key, source: "your rule" };
  if (t.amount > 0) {
    if (/\btransfer\b|xfer|from savings|from checking/.test(d)) return { key: "transfer", source: "built-in" };
    if (/loan proceeds|sba|line of credit|loc advance|kabbage|bluevine|fundbox|loan disbursement/.test(d)) return { key: "loan_principal", source: "built-in" };
    if (/owner contribution|capital contribution|personal deposit|owner deposit/.test(d)) return { key: "owner", source: "built-in" };
    if (/interest (?:paid|earned|payment|credit)|dividend|apy earned|interest\b.*\byield/.test(d)) return { key: "investment_income", source: "built-in" };
    if (/sales tax/.test(d)) return { key: "sales_tax", source: "built-in" };
    if (PROCESSOR.test(d) || /invoice|\binv\b|inv#|client|consult|services|retainer|payment from|ach credit|direct dep|wire in|incoming wire|zelle from|venmo|cash app|deposit from|payout/.test(d)) return { key: "receipts", source: "built-in" };
    return { key: "uncategorised", source: "none" };
  }
  for (const [key, re] of DEFAULT_RULES) if (re.test(d)) return { key, source: "built-in" };
  return { key: "uncategorised", source: "none" };
}

const dayNum = (iso) => Math.round(Date.parse(iso + "T00:00:00Z") / 86400000);

export function analyze(txns, opts = {}) {
  const { userRules = [], businessRules = [], safeHarbor = DEFAULT_SAFE_HARBOR, year = NaN, defaultBusiness = DEFAULT_BUSINESS } = opts;
  if (!txns.length) return { invalid: "No transactions to analyse." };
  if (!Number.isFinite(safeHarbor) || safeHarbor < 0) return { invalid: "The equipment threshold must be zero or more." };
  const inYear = Number.isFinite(year) ? txns.filter((t) => t.date.startsWith(String(year))) : txns.slice();
  const outOfYear = txns.length - inYear.length;
  if (!inYear.length) return { invalid: `No transactions dated ${year}.` };

  const rows = inYear.map((t) => {
    const c = categorise(t, userRules);
    let business = t.business || "", bizSource = business ? "column" : "";
    const d = t.desc.toLowerCase();
    for (const r of businessRules) if (d.includes(r.kw)) { business = r.name; bizSource = "your rule"; break; }
    if (!business) { business = defaultBusiness; bizSource = "none"; }
    return { ...t, key: c.key, source: c.source, business, bizSource, flags: [] };
  });

  // Equal and opposite uncategorised rows within 3 days: a transfer between two of
  // the owner's accounts, when both files are loaded.
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

  // Purchases that may be equipment: held-out rows are already equipment; rows put on
  // an expense line but big enough or worded like equipment are flagged, never moved.
  const equipmentRows = rows.filter((r) => r.key === "equipment" && r.amount < 0);
  const bigCandidates = [];
  for (const r of rows) {
    if (r.amount >= 0) continue;
    if (!["office", "supplies", "repairs", "other", "uncategorised", "rent"].includes(r.key)) continue;
    const hint = EQUIPMENT_HINT.test(r.desc);
    if (hint || -r.amount > safeHarbor) { r.flags.push(hint ? "may be equipment" : `over ${usd(safeHarbor)}`); bigCandidates.push(r); }
  }
  const capexCandidates = [...equipmentRows, ...bigCandidates];
  for (const r of equipmentRows) r.flags.push(-r.amount > safeHarbor ? `over ${usd(safeHarbor)}: depreciate` : `at or under ${usd(safeHarbor)}: may qualify for de minimis`);

  const businesses = [...new Set(rows.map((r) => r.business))].sort((a, b) => a.localeCompare(b));
  const keys = Object.keys(CATEGORIES);
  const byBiz = {};
  for (const b of businesses) byBiz[b] = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const r of rows) byBiz[r.business][r.key] += r.amount;

  const all = businesses.map((b) => {
    const t = byBiz[b];
    const lines = keys.filter((k) => CATEGORIES[k].kind === "expense" || CATEGORIES[k].kind === "meals").map((k) => ({
      key: k, label: CATEGORIES[k].label, line: CATEGORIES[k].line,
      amount: r2(CATEGORIES[k].kind === "meals" ? -t[k] * MEALS_DEDUCTIBLE : -t[k]),
      spent: CATEGORIES[k].kind === "meals" ? r2(-t[k]) : null,
    }));
    const income = t.receipts + t.other_income;
    const expenses = lines.reduce((s, l) => s + l.amount, 0);
    return {
      business: b, receipts: r2(t.receipts), otherIncome: r2(t.other_income), income: r2(income), lines, expenses: r2(expenses), net: r2(income - expenses),
      mealsSpent: r2(-t.meals), estTaxPaid: r2(-t.est_tax), salesTax: r2(t.sales_tax), healthInsurance: r2(-t.health_insurance), retirement: r2(-t.retirement),
      equipmentHeldOut: r2(-t.equipment), loanPayments: r2(-t.loan_principal), transfers: r2(t.transfer), ownerDraws: r2(-t.owner), investmentIncome: r2(t.investment_income), uncategorised: r2(t.uncategorised),
    };
  });
  const propsOut = all.filter((p) => p.business !== defaultBusiness || p.income || p.expenses || p.equipmentHeldOut || p.uncategorised || p.estTaxPaid);

  const uncategorised = rows.filter((r) => r.key === "uncategorised").sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const dates = rows.map((r) => r.date).sort();
  const totals = {
    txns: rows.length,
    income: r2(propsOut.reduce((s, p) => s + p.income, 0)),
    expenses: r2(propsOut.reduce((s, p) => s + p.expenses, 0)),
    net: r2(propsOut.reduce((s, p) => s + p.net, 0)),
    estTaxPaid: r2(propsOut.reduce((s, p) => s + p.estTaxPaid, 0)),
    uncategorisedCount: uncategorised.length,
    uncategorisedAmount: r2(uncategorised.reduce((s, r) => s + r.amount, 0)),
    categorisedPct: rows.length ? r2(((rows.length - uncategorised.length) / rows.length) * 100) : 0,
    from: dates[0], to: dates[dates.length - 1], outOfYear,
  };

  const processorRows = rows.filter((r) => r.key === "receipts" && r.amount > 0 && PROCESSOR.test(r.desc.toLowerCase()));
  const processorTotal = r2(processorRows.reduce((s, r) => s + r.amount, 0));
  const mixed = rows.filter((r) => ["utilities", "car_truck", "supplies", "travel"].includes(r.key) && r.amount < 0);
  const personalLooking = rows.filter((r) => r.key === "owner" && r.amount < 0 && r.source === "built-in");

  const findings = [];
  if (uncategorised.length) findings.push({ severity: "high", title: `${uncategorised.length} transaction(s), ${usd(uncategorised.reduce((s, r) => s + Math.abs(r.amount), 0))} moved, not categorised`, detail: "Add a “keyword => category” rule for each and run it again. Nothing is guessed: a row with no clear category stays out of the totals until you say where it goes." });
  if (processorRows.length) findings.push({ severity: "high", title: `${processorRows.length} deposit(s), ${usd(processorTotal)}, look like payouts from a payment platform`, detail: "Stripe, PayPal, Square, Etsy, Shopify and similar pay out after taking their fee and any refunds, so gross receipts on line 1 are higher than the deposits and the fees are an expense on line 10. Use the platform's own annual gross-sales report for line 1, and compare it with any Form 1099-K or 1099-NEC you received; the IRS has those." });
  if (totals.income > 0 && !processorRows.length) findings.push({ severity: "info", title: "Compare receipts with your 1099s", detail: "Clients that paid you $600 or more may have sent a Form 1099-NEC and payment apps a 1099-K. Income counts even without a form, and the IRS receives those forms, so the two should reconcile or you should know why not." });
  if (capexCandidates.length) findings.push({ severity: "medium", title: `${capexCandidates.length} purchase(s) that may be equipment rather than a plain expense`, detail: "Computers, cameras, vehicles and other items over your threshold are usually depreciated, or deducted in full through a de minimis safe-harbor or Section 179 election, not simply listed as supplies. Items already sorted to equipment are held out of the totals. A preparer decides how each is treated." });
  if (totals.estTaxPaid > 0) findings.push({ severity: "info", title: `${usd(totals.estTaxPaid)} of estimated tax payments found`, detail: "These are payments toward your bill, not a Schedule C expense. They belong on Form 1040-ES records and the payments line of your return." });
  const held = propsOut.reduce((s, p) => s + p.healthInsurance + p.retirement, 0);
  if (held > 0) findings.push({ severity: "info", title: `${usd(held)} of health insurance and retirement contributions held out`, detail: "Self-employed health insurance and SEP or solo 401(k) contributions are deducted on Schedule 1, not on Schedule C, so they are kept out of your business expenses here." });
  if (mixed.length) findings.push({ severity: "medium", title: "Phone, internet, car, supplies and travel are often part personal", detail: `${mixed.length} such row(s) are counted at 100%. Only the business share is deductible; a business-use percentage, a mileage log, and a home-office calculation are outside this tool.` });
  const meals = propsOut.reduce((s, p) => s + p.mealsSpent, 0);
  if (meals > 0) findings.push({ severity: "info", title: `Meals: ${usd(meals)} spent, ${usd(meals * MEALS_DEDUCTIBLE)} counted`, detail: "Business meals are generally 50% deductible, so half is counted on line 24b. Only meals with a business purpose belong here; keep the who and why with your records." });
  if (dups.length) findings.push({ severity: "medium", title: `${dups.length} possible duplicate row(s)`, detail: "Same date, description and amount appear more than once. Two identical real payments are possible, and overlapping exports are common. Duplicates are flagged, not removed." });
  if (personalLooking.length) findings.push({ severity: "info", title: `${personalLooking.length} row(s) look personal and were held out`, detail: "Groceries, streaming, rent and cash withdrawals are not business expenses. If one is, add a rule that says so." });
  if (businesses.length === 1 && businesses[0] === defaultBusiness && propsOut.length) findings.push({ severity: "info", title: "Everything is under one business", detail: "One Schedule C covers one business. If you run more than one, add a business column or “keyword => business name” rules." });
  if (outOfYear) findings.push({ severity: "info", title: `${outOfYear} transaction(s) outside ${year} were left out`, detail: "Change or clear the tax year to include them." });

  const categoryTotals = keys.map((k) => ({ key: k, label: CATEGORIES[k].label, line: CATEGORIES[k].line, kind: CATEGORIES[k].kind, count: rows.filter((r) => r.key === k).length, amount: r2(rows.filter((r) => r.key === k).reduce((s, r) => s + r.amount, 0)) })).filter((c) => c.count);

  return { rows, businesses: propsOut, totals, findings, uncategorised, capexCandidates, processorTotal, categoryTotals, safeHarbor };
}

const csvCell = (v) => { const s = String(v ?? ""); return /[",\n\r]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const guard = (v) => (/^[=+\-@\t\r]/.test(String(v)) ? "'" + v : v);

export function reportCsv(a) {
  const out = [["Date", "Description", "Amount", "Business", "Category", "Schedule C line", "Counted on the line", "Decided by", "Flags"]];
  for (const r of a.rows) {
    const c = CATEGORIES[r.key];
    const counted = c.kind === "meals" ? (-r.amount * MEALS_DEDUCTIBLE) : c.kind === "expense" ? -r.amount : c.kind === "income" ? r.amount : "";
    out.push([r.date, guard(r.desc), r.amount.toFixed(2), r.business, c.label, c.line ?? "", counted === "" ? "" : r2(counted).toFixed(2), r.source, r.flags.join("; ")]);
  }
  return out.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export function summaryText(a) {
  const t = a.totals, out = [];
  out.push(`Business income and expenses ${t.from} to ${t.to}: ${t.txns} transaction(s), ${t.categorisedPct}% categorised. Income ${usd(t.income)}, expenses ${usd(t.expenses)}, net profit before home office, depreciation and self-employment tax ${usd(t.net)}.`);
  for (const p of a.businesses) {
    out.push("");
    out.push(`${p.business}: receipts ${usd(p.income)}, expenses ${usd(p.expenses)}, net ${usd(p.net)}`);
    for (const l of p.lines) if (l.amount) out.push(`  Line ${l.line} ${l.label}: ${usd(l.amount)}${l.spent !== null ? ` (of ${usd(l.spent)} spent)` : ""}`);
    if (p.equipmentHeldOut) out.push(`  Equipment and big purchases ${usd(p.equipmentHeldOut)} held out (depreciate or elect to expense).`);
    if (p.estTaxPaid) out.push(`  Estimated tax payments ${usd(p.estTaxPaid)} (not an expense).`);
  }
  if (a.uncategorised.length) out.push("", `Not categorised: ${a.uncategorised.length} row(s), net ${usd(a.totals.uncategorisedAmount)}.`);
  out.push("", "Estimate from a bank file and your rules. Not tax advice. Have a preparer confirm the lines, gross receipts against your 1099s, business-use shares, equipment and depreciation.");
  return out.join("\n");
}

export function sampleCsv() {
  const bank = [
    "Date,Description,Amount",
    "01/04/2024,STRIPE PAYOUT ACME DESIGN,3820.10",
    "01/08/2024,ADOBE CREATIVE CLOUD,-59.99",
    "01/10/2024,ZELLE FROM BRIGHTLINE LLC INVOICE 1042,2400.00",
    "01/15/2024,GOOGLE ADS,-210.00",
    "01/18/2024,STARBUCKS CLIENT MEETING,-18.40",
    "01/22/2024,VERIZON WIRELESS,-84.20",
    "02/02/2024,APPLE STORE MACBOOK PRO,-2899.00",
    "02/05/2024,UPWORK CONTRACTOR PAY EDITOR,-650.00",
    "02/09/2024,ZELLE FROM BRIGHTLINE LLC INVOICE 1051,2400.00",
    "02/14/2024,IRS USATAXPYMT,-1500.00",
    "02/20/2024,BLUE CROSS HEALTH INSURANCE,-412.00",
    "02/26/2024,SHELL OIL 5521,-46.12",
    "03/03/2024,NETFLIX,-15.49",
    "03/06/2024,QUICKBOOKS ONLINE,-35.00",
    "03/06/2024,QUICKBOOKS ONLINE,-35.00",
    "03/11/2024,TRANSFER TO SAVINGS,-1000.00",
    "03/15/2024,SQ *MYSTERY VENDOR 8821,-72.00",
  ].join("\n");
  return { bank, rules: "", businesses: "" };
}
