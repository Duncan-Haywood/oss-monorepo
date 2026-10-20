// Self-employed Schedule C categorizer: reads a bank or credit-card CSV export,
// sorts every transaction into an IRS Schedule C (Form 1040) line (gross receipts,
// advertising, car and truck, contract labor, insurance, legal and professional,
// office, supplies, taxes and licences, travel, meals, utilities, other) or into a
// bucket that is NOT a Schedule C expense (your own estimated-tax payments, owner
// draws, transfers, loan principal, health insurance and retirement contributions
// that belong on Schedule 1), assigns it to a business, and reports totals per
// business, what could not be categorised, and what looks wrong (processor deposits
// that are net of fees, equipment over the de minimis limit, meals at 50 percent,
// duplicate rows). Column names are matched by alias and no real bank export was
// available when this was written. Pure functions, no DOM, no network.

export const DEFAULT_EQUIPMENT_LIMIT = 2500;
export const DEFAULT_BUSINESS = "All income";
export const MEALS_DEDUCTIBLE_SHARE = 0.5;

// Schedule C, Part I and Part II. `line` is the printed line number on the 2024-era
// form; check the form for the year you file.
export const CATEGORIES = {
  receipts: { label: "Gross receipts or sales", line: "1", kind: "income" },
  other_income: { label: "Other business income (interest on business account, refunds from vendors)", line: "6", kind: "income" },
  advertising: { label: "Advertising", line: "8", kind: "expense" },
  car_truck: { label: "Car and truck expenses", line: "9", kind: "expense" },
  fees: { label: "Commissions and fees (platform, payment processing)", line: "10", kind: "expense" },
  contract_labor: { label: "Contract labor", line: "11", kind: "expense" },
  insurance: { label: "Insurance (other than health)", line: "15", kind: "expense" },
  interest: { label: "Interest (business credit card or loan)", line: "16b", kind: "expense" },
  legal_professional: { label: "Legal and professional services", line: "17", kind: "expense" },
  office: { label: "Office expense", line: "18", kind: "expense" },
  rent_equipment: { label: "Rent or lease: equipment", line: "20a", kind: "expense" },
  rent_property: { label: "Rent or lease: other business property", line: "20b", kind: "expense" },
  repairs: { label: "Repairs and maintenance", line: "21", kind: "expense" },
  supplies: { label: "Supplies", line: "22", kind: "expense" },
  taxes_licenses: { label: "Taxes and licences", line: "23", kind: "expense" },
  travel: { label: "Travel", line: "24a", kind: "expense" },
  meals: { label: "Meals (50 percent deductible)", line: "24b", kind: "expense" },
  utilities: { label: "Utilities (phone, internet)", line: "25", kind: "expense" },
  wages: { label: "Wages (employees)", line: "26", kind: "expense" },
  other: { label: "Other expenses (software, subscriptions, education, bank fees)", line: "27a", kind: "expense" },
  equipment: { label: "Equipment or a large purchase (depreciate or elect to expense)", line: null, kind: "excluded" },
  estimated_tax: { label: "Your own estimated income or self-employment tax payments", line: null, kind: "excluded" },
  schedule_1: { label: "Health insurance or retirement contribution (Schedule 1, not Schedule C)", line: null, kind: "excluded" },
  loan: { label: "Loan proceeds or principal repayment", line: null, kind: "excluded" },
  transfer: { label: "Transfer between your own accounts", line: null, kind: "excluded" },
  owner: { label: "Owner draw or personal", line: null, kind: "excluded" },
  uncategorised: { label: "Not categorised", line: null, kind: "unknown" },
};

const LABEL_TO_KEY = Object.fromEntries(Object.entries(CATEGORIES).flatMap(([k, v]) => [[k, k], [v.label.toLowerCase(), k], ...(v.line && v.kind === "expense" ? [[`line ${v.line}`, k]] : [])]));
Object.assign(LABEL_TO_KEY, {
  "receipts": "receipts", "income": "receipts", "sales": "receipts", "revenue": "receipts", "gross receipts": "receipts",
  "car": "car_truck", "truck": "car_truck", "vehicle": "car_truck", "mileage": "car_truck",
  "fees": "fees", "commissions": "fees", "processing fees": "fees",
  "contractor": "contract_labor", "contractors": "contract_labor", "subcontractor": "contract_labor",
  "legal": "legal_professional", "professional": "legal_professional", "accounting": "legal_professional",
  "office expense": "office", "rent": "rent_property", "coworking": "rent_property",
  "repair": "repairs", "maintenance": "repairs", "tax": "taxes_licenses", "taxes": "taxes_licenses", "licenses": "taxes_licenses", "licences": "taxes_licenses",
  "phone": "utilities", "internet": "utilities", "software": "other", "subscriptions": "other", "bank fees": "other",
  "meal": "meals", "capex": "equipment", "estimated tax": "estimated_tax", "1040-es": "estimated_tax",
  "health insurance": "schedule_1", "retirement": "schedule_1", "sep": "schedule_1",
  "personal": "owner", "draw": "owner",
});
export const categoryKey = (s) => LABEL_TO_KEY[String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ")] ?? null;

// Built-in keyword rules for money OUT, tried in order after the user's own rules.
// Deliberately conservative: a keyword that would fit two lines is left out and the
// row goes to "not categorised" rather than being guessed. Order matters: the
// things that are NOT Schedule C expenses come first so a keyword like "insurance"
// cannot pull a health premium onto line 15.
const DEFAULT_RULES = [
  ["estimated_tax", /irs\s*(usataxpymt|treas|tax)|usataxpymt|eftps|1040-?es|estimated tax|dor\b.*(tax|est)|franchise tax board.*(est|pmt)|ftb.*est|state tax payment|treas 310 tax/],
  ["transfer", /\btransfer\b|xfer|online transfer|to savings|from savings|to checking|from checking|zelle to (self|me)/],
  ["schedule_1", /health insurance|blue cross|bcbs|aetna|cigna|kaiser|oscar health|ambetter|healthcare\.gov|covered ca|sep.?ira|solo 401|solo401|fidelity.*(ira|401)|vanguard.*(ira|401)|ira contribution|hsa contribution|healthequity/],
  ["loan", /loan pmt|loan payment|sba loan|principal|line of credit pmt|student loan|auto loan|car payment|mortgage/],
  ["fees", /stripe fee|paypal fee|square fee|merchant fee|processing fee|payment processing|etsy|ebay fee|shopify fee|upwork fee|fiverr|gumroad|paddle|lemon ?squeezy|marketplace fee|platform fee|amazon seller fee|app store fee/],
  ["advertising", /google ads|facebook ads|meta ads|fb ads|instagram ad|linkedin ads|tiktok ads|yelp ads|mailchimp|constant contact|vistaprint|business cards|canva|promo|sponsor|advertis|billboard|angi|thumbtack|nextdoor/],
  ["contract_labor", /contractor|freelancer|subcontract|upwork|fiverr|gusto contractor|deel|remote\.com|1099 pay|virtual assistant|\bva\b|paypal.*(contract|freelanc)/],
  ["wages", /payroll|gusto|adp\b|paychex|quickbooks payroll|justworks|trinet|wages/],
  ["legal_professional", /attorney|law office|legal|cpa\b|accountant|bookkeep|tax prep|turbotax|h&r block|freshbooks|quickbooks|wave app|bench\.co|legalzoom|incfile|northwest registered|registered agent|notary|consultant/],
  ["insurance", /insurance|state farm|allstate|geico|progressive|hiscox|next insurance|thimble|liability policy|professional liability|e&o|errors and omissions|hartford|liberty mutual/],
  ["taxes_licenses", /business license|license fee|permit|secretary of state|sos filing|annual report|franchise fee|sales tax|dept of revenue|department of revenue|state comptroller|city of .* (license|tax)|registration fee|llc fee/],
  ["rent_property", /coworking|wework|regus|industrious|office rent|studio rent|commercial lease|storage unit|public storage|extra space|cubesmart|shared office/],
  ["rent_equipment", /equipment rental|lens rental|lensrentals|rent-a-|sunbelt rental|united rentals|hertz equip/],
  ["car_truck", /shell oil|chevron|exxon|bp\b|mobil\b|sunoco|76\b|arco|gas station|fuel|parking|toll|ez ?pass|fastrak|car wash|jiffy lube|midas|autozone|o'?reilly auto|oil change|tire|auto repair|uber(?! eats)|lyft/],
  ["travel", /airline|delta air|united air|southwest|american air|jetblue|alaska air|frontier|spirit air|hotel|marriott|hilton|hyatt|airbnb|vrbo|expedia|booking\.com|amtrak|greyhound|hertz|avis|enterprise rent|national car/],
  ["meals", /restaurant|cafe|coffee|starbucks|doordash|uber eats|grubhub|chipotle|mcdonald|panera|diner|bistro|grill|pizza|bar & |taproom|catering/],
  ["utilities", /verizon|at&t|att\*|t-mobile|tmobile|comcast|xfinity|spectrum|cox comm|internet|phone bill|google fi|mint mobile|electric|utility|utilities|water bill|gas co/],
  ["repairs", /repair|handyman|computer repair|apple store repair|geek squad|plumb|hvac|locksmith|service call|maintenance/],
  ["supplies", /home depot|lowe'?s|lowes|staples|office depot|amazon|walmart|target|costco|michaels|hobby lobby|uline|grainger|supply|supplies|ace hardware|harbor freight|sherwin/],
  ["office", /usps|ups store|fedex|ups\b|stamps\.com|shippo|pirate ship|printing|fedex office|postage|zoom|office/],
  ["equipment", /apple\.com\/bill|apple store|best buy|b&h|adorama|dell|lenovo|macbook|laptop|monitor|camera|newegg|micro center|dji|sony|canon|nikon|fender|guitar center|sweetwater|generator|tools?\b/],
  ["other", /adobe|microsoft|google workspace|gsuite|dropbox|notion|slack|github|openai|anthropic|chatgpt|midjourney|figma|squarespace|wix|godaddy|namecheap|cloudflare|aws|amazon web|digitalocean|heroku|vercel|netlify|zapier|calendly|linktree|patreon|substack|udemy|coursera|masterclass|subscription|software|domain|hosting|membership|dues|conference|bank fee|monthly service fee|wire fee|overdraft|service charge/],
];

const EQUIPMENT_HINT = /\b(macbook|laptop|desktop|computer|monitor|camera|lens|drone|printer|server|equipment|machine|furniture|desk|generator|welder|mower|trailer|van|truck|vehicle|kiln|oven|espresso machine|tool ?set)\b/i;
const PERSONAL_HINT = /\b(netflix|hulu|disney\+?|spotify|apple music|amazon prime|grocery|kroger|safeway|whole foods|trader joe|aldi|publix|heb\b|walgreens|cvs|pharmacy|gym|planet fitness|peloton|onlyfans|steam games|playstation|xbox|nintendo|zelle to)\b/i;

const ALIASES = {
  date: ["date", "transaction date", "posted date", "post date", "posting date", "trans date", "booking date", "effective date"],
  desc: ["description", "transaction description", "payee", "merchant", "name", "details", "original description", "memo", "narrative"],
  amount: ["amount", "transaction amount", "amt", "value"],
  debit: ["debit", "debits", "withdrawal", "withdrawals", "money out", "paid out", "amount debit"],
  credit: ["credit", "credits", "deposit", "deposits", "money in", "paid in", "amount credit"],
  business: ["business", "business name", "class", "tag", "account name", "project", "client"],
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

// "keyword => Business name" lines, matched against the description.
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


function categorise(t, userRules) {
  const d = t.desc.toLowerCase();
  for (const r of userRules) if (d.includes(r.kw)) return { key: r.key, source: "your rule" };
  const income = t.amount > 0;
  if (income) {
    // "STRIPE TRANSFER" is a payout of sales, not a move between your own accounts.
    if (!PROCESSOR.test(d) && /\btransfer\b|xfer|from savings|from checking|online transfer/.test(d)) return { key: "transfer", source: "built-in" };
    if (/loan (proceeds|advance|disbursement)|sba|line of credit|kabbage|fundbox|bluevine|lendio|capital one spark/.test(d)) return { key: "loan", source: "built-in" };
    if (/irs treas|tax ref|state tax ref|dept of revenue ref|refund/.test(d) && /(irs|tax|treas|revenue)/.test(d)) return { key: "estimated_tax", source: "built-in" };
    if (/interest (paid|earned|payment)|dividend|cashback|cash back|rebate/.test(d)) return { key: "other_income", source: "built-in" };
    if (/stripe|paypal|square|shopify|etsy|venmo|cash app|zelle|payment from|invoice|inv\s?#|client|payout|deposit|ach credit|wire in|upwork|fiverr|gumroad|patreon|substack|paddle|lemon|amazon.*(payment|disburse)|ebay|doordash|uber|lyft|instacart|grubhub|turo|airbnb|thumbtack|angi|taskrabbit|shipt|amazon flex|payout/.test(d)) return { key: "receipts", source: "built-in" };
    return { key: "uncategorised", source: "none" };
  }
  for (const [key, re] of DEFAULT_RULES) if (re.test(d)) return { key, source: "built-in" };
  return { key: "uncategorised", source: "none" };
}

const dayNum = (iso) => Math.round(Date.parse(iso + "T00:00:00Z") / 86400000);
const PROCESSOR = /stripe|paypal|square|shopify|etsy|gumroad|paddle|lemon|venmo|cash app|doordash|uber|lyft|instacart|grubhub|amazon|ebay|airbnb|turo|upwork|fiverr|patreon|substack/i;

export function analyze(txns, opts = {}) {
  const { userRules = [], businessRules = [], equipmentLimit = DEFAULT_EQUIPMENT_LIMIT, year = NaN, reportedReceipts = NaN, defaultBusiness = DEFAULT_BUSINESS } = opts;
  if (!txns.length) return { invalid: "No transactions to analyse." };
  if (!Number.isFinite(equipmentLimit) || equipmentLimit < 0) return { invalid: "The equipment limit must be zero or more." };
  const inYear = Number.isFinite(year) ? txns.filter((t) => t.date.startsWith(String(year))) : txns.slice();
  const outOfYear = txns.length - inYear.length;
  if (!inYear.length) return { invalid: `No transactions dated ${year}.` };

  const rows = inYear.map((t) => {
    const c = categorise(t, userRules);
    let business = t.business || "";
    const d = t.desc.toLowerCase();
    let bizSource = t.business ? "column" : "";
    for (const r of businessRules) if (d.includes(r.kw)) { business = r.name; bizSource = "your rule"; break; }
    if (!business) { business = defaultBusiness; bizSource = "none"; }
    return { ...t, key: c.key, source: c.source, business, bizSource, flags: [] };
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

  // Large purchases and things that look personal: flagged, never decided.
  const bigItems = [], personalish = [];
  for (const r of rows) {
    if (r.amount >= 0) continue;
    const out = -r.amount;
    if (["supplies", "office", "other", "repairs", "uncategorised", "equipment"].includes(r.key) && (out > equipmentLimit || (EQUIPMENT_HINT.test(r.desc) && out > equipmentLimit / 5))) {
      r.flags.push(out > equipmentLimit ? `over ${usd(equipmentLimit)}` : "may be equipment");
      bigItems.push(r);
    }
    if (r.source !== "your rule" && PERSONAL_HINT.test(r.desc) && r.key !== "owner") { r.flags.push("looks personal"); personalish.push(r); }
  }

  const bizList = [...new Set(rows.map((r) => r.business))].sort((a, b) => a.localeCompare(b));
  const keys = Object.keys(CATEGORIES);
  const byBiz = {};
  for (const p of bizList) byBiz[p] = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const r of rows) byBiz[r.business][r.key] += r.amount;

  const businessesAll = bizList.map((p) => {
    const t = byBiz[p];
    const income = t.receipts + t.other_income;
    const lines = keys.filter((k) => CATEGORIES[k].kind === "expense").map((k) => {
      const spent = -t[k];
      return { key: k, label: CATEGORIES[k].label, line: CATEGORIES[k].line, spent: r2(spent), amount: r2(k === "meals" ? spent * MEALS_DEDUCTIBLE_SHARE : spent) };
    });
    const expenses = lines.reduce((s, l) => s + l.amount, 0);
    return {
      business: p, receipts: r2(t.receipts), otherIncome: r2(t.other_income), income: r2(income), lines, expenses: r2(expenses), net: r2(income - expenses),
      mealsSpent: r2(-t.meals), equipmentExcluded: r2(-t.equipment), estimatedTaxPaid: r2(-t.estimated_tax), scheduleOne: r2(-t.schedule_1),
      loans: r2(t.loan), transfers: r2(t.transfer), ownerDraws: r2(-t.owner), uncategorised: r2(t.uncategorised),
    };
  });
  const businesses = businessesAll.filter((p) => p.business !== defaultBusiness || p.income || p.expenses || p.equipmentExcluded || p.estimatedTaxPaid || p.uncategorised || p.mealsSpent);

  const uncategorised = rows.filter((r) => r.key === "uncategorised").sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const totals = {
    txns: rows.length,
    income: r2(businesses.reduce((s, p) => s + p.income, 0)),
    expenses: r2(businesses.reduce((s, p) => s + p.expenses, 0)),
    net: r2(businesses.reduce((s, p) => s + p.net, 0)),
    estimatedTaxPaid: r2(businesses.reduce((s, p) => s + p.estimatedTaxPaid, 0)),
    scheduleOne: r2(businesses.reduce((s, p) => s + p.scheduleOne, 0)),
    uncategorisedCount: uncategorised.length,
    uncategorisedAmount: r2(uncategorised.reduce((s, r) => s + r.amount, 0)),
    categorisedPct: rows.length ? r2(((rows.length - uncategorised.length) / rows.length) * 100) : 0,
    from: rows.map((r) => r.date).sort()[0],
    to: rows.map((r) => r.date).sort().slice(-1)[0],
    outOfYear,
  };

  const findings = [];
  if (uncategorised.length) findings.push({ severity: "high", title: `${uncategorised.length} transaction(s), ${usd(uncategorised.reduce((s, r) => s + Math.abs(r.amount), 0))} moved, not categorised`, detail: "Add a “keyword => category” rule for each and run it again. Nothing is guessed: a row with no clear category stays out of the totals until you say where it goes." });

  // Deposits from a payment processor or platform are normally paid out net of its
  // fees, so summing deposits understates Schedule C line 1 and hides the fee.
  const procDeposits = rows.filter((r) => r.key === "receipts" && PROCESSOR.test(r.desc));
  const procTotal = r2(procDeposits.reduce((s, r) => s + r.amount, 0));
  if (procDeposits.length) findings.push({ severity: "medium", title: `${usd(procTotal)} of receipts arrived through payment platforms, probably net of their fees`, detail: "Stripe, PayPal, Square, Etsy, marketplaces and gig apps usually pay out after taking their fee, so deposits understate gross receipts (line 1) and the fee is a missed deduction (line 10). Report gross receipts from the year-end report or Form 1099-K / 1099-NEC, and type that figure below to compare it with the deposits found." });
  if (Number.isFinite(reportedReceipts) && reportedReceipts > 0) {
    const found = totals.income - businesses.reduce((s, p) => s + p.otherIncome, 0);
    const gap = r2(reportedReceipts - found);
    if (Math.abs(gap) / reportedReceipts > 0.02) findings.push({ severity: "high", title: `Receipts in the file differ from your reported ${usd(reportedReceipts)} by ${usd(gap)}`, detail: gap > 0 ? "Deposits found are lower than the gross you reported. Typical causes: platform fees deducted before payout (deduct them on line 10), refunds, cash or checks deposited to another account, or a bank file that does not cover the whole year." : "Deposits found are higher than the gross you reported. Typical causes: transfers or loan proceeds counted as income, sales tax collected, or overlapping exports." });
  }
  if (totals.estimatedTaxPaid > 0) findings.push({ severity: "info", title: `${usd(totals.estimatedTaxPaid)} of tax payments to the IRS or a state were held out`, detail: "Your own estimated-tax payments are not a business expense. They are credited on Form 1040 (payments), so keep this total for Form 1040-ES reconciliation." });
  if (totals.scheduleOne > 0) findings.push({ severity: "info", title: `${usd(totals.scheduleOne)} of health insurance or retirement contributions were held out`, detail: "Self-employed health insurance and SEP or solo 401(k) contributions are adjustments on Schedule 1, not Schedule C expenses, and have their own limits. A preparer can enter them." });
  const meals = businesses.reduce((s, p) => s + p.mealsSpent, 0);
  if (meals > 0) findings.push({ severity: "info", title: `Meals of ${usd(meals)} counted at 50 percent`, detail: `Line 24b shows ${usd(r2(meals * MEALS_DEDUCTIBLE_SHARE))}. Only business meals are deductible and a record of who and why is expected; a coffee for yourself on an ordinary day is usually not.` });
  if (bigItems.length) findings.push({ severity: "medium", title: `${bigItems.length} purchase(s) that may be equipment rather than a current-year expense`, detail: "Items over your limit, or worded like a computer, camera or machine, are listed below. Small items can usually be deducted at once under the de minimis safe harbor; larger ones are depreciated or expensed by election (Section 179). A preparer decides which applies." });
  if (personalish.length) findings.push({ severity: "medium", title: `${personalish.length} row(s) look personal`, detail: "Groceries, streaming, gyms and pharmacies are marked so you can check they are not in your business totals. Move them to Owner draw or personal with a rule if they are personal." });
  if (dups.length) findings.push({ severity: "medium", title: `${dups.length} possible duplicate row(s)`, detail: "Same date, description and amount appear more than once. Two identical real payments are possible, and overlapping exports are common. Duplicates are flagged, not removed." });
  const mixed = rows.filter((r) => r.key === "utilities" || r.key === "car_truck");
  if (mixed.length) findings.push({ severity: "info", title: "Phone, internet and vehicle costs are usually only partly business", detail: "Line 25 and line 9 need the business-use share, and vehicles need a mileage log or actual-expense records. The totals here are the full amounts in your file." });
  if (bizList.length === 1 && bizList[0] === defaultBusiness && businesses.length) findings.push({ severity: "info", title: "Everything is under one business", detail: "Each Schedule C covers one business. If you run more than one, add a business column or “keyword => business name” rules." });
  if (outOfYear) findings.push({ severity: "info", title: `${outOfYear} transaction(s) outside ${year} were left out`, detail: "Change or clear the tax year to include them." });

  const categoryTotals = keys.map((k) => ({ key: k, label: CATEGORIES[k].label, line: CATEGORIES[k].line, kind: CATEGORIES[k].kind, count: rows.filter((r) => r.key === k).length, amount: r2(rows.filter((r) => r.key === k).reduce((s, r) => s + r.amount, 0)) })).filter((c) => c.count);

  return { rows, businesses, totals, findings, uncategorised, bigItems, personalish, categoryTotals, equipmentLimit };
}

const csvCell = (v) => { const s = String(v ?? ""); return /[",\n\r]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const guard = (v) => (/^[=+\-@\t\r]/.test(String(v)) ? "'" + v : v);

export function reportCsv(a) {
  const out = [["Date", "Description", "Amount", "Business", "Category", "Schedule C line", "Decided by", "Flags"]];
  for (const r of a.rows) out.push([r.date, guard(r.desc), r.amount.toFixed(2), r.business, CATEGORIES[r.key].label, CATEGORIES[r.key].line ?? "", r.source, r.flags.join("; ")]);
  return out.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export function summaryText(a) {
  const t = a.totals, out = [];
  out.push(`Self-employment income and expenses ${t.from} to ${t.to}: ${t.txns} transaction(s), ${t.categorisedPct}% categorised. Income ${usd(t.income)}, expenses ${usd(t.expenses)}, net profit ${usd(t.net)} before self-employment tax and any depreciation.`);
  for (const p of a.businesses) {
    out.push("");
    out.push(`${p.business}: income ${usd(p.income)}, expenses ${usd(p.expenses)}, net ${usd(p.net)}`);
    out.push(`  Line 1 Gross receipts: ${usd(p.receipts)}`);
    if (p.otherIncome) out.push(`  Line 6 Other income: ${usd(p.otherIncome)}`);
    for (const l of p.lines) if (l.amount) out.push(`  Line ${l.line} ${l.label}: ${usd(l.amount)}${l.key === "meals" ? ` (of ${usd(l.spent)} spent)` : ""}`);
    if (p.equipmentExcluded) out.push(`  Equipment and large purchases ${usd(p.equipmentExcluded)} held out (depreciate or elect to expense).`);
    if (p.estimatedTaxPaid) out.push(`  Estimated tax payments ${usd(p.estimatedTaxPaid)} held out (credited on Form 1040, not an expense).`);
  }
  if (a.uncategorised.length) out.push("", `Not categorised: ${a.uncategorised.length} row(s), net ${usd(a.totals.uncategorisedAmount)}.`);
  out.push("", "Estimate from a bank file and your rules. Not tax advice. Have a preparer confirm the lines, gross receipts against your 1099s, equipment, and business-use shares.");
  return out.join("\n");
}

export function sampleCsv() {
  const bank = [
    "Date,Description,Amount",
    "01/04/2024,STRIPE TRANSFER PAYOUT,4820.00",
    "01/06/2024,ADOBE CREATIVE CLOUD,-59.99",
    "01/09/2024,GOOGLE ADS,-310.00",
    "01/12/2024,ZELLE FROM ACME DESIGN CO INVOICE 1041,2500.00",
    "01/15/2024,CHIPOTLE 2210 CLIENT LUNCH,-42.18",
    "01/18/2024,VERIZON WIRELESS,-88.40",
    "01/22/2024,SHELL OIL 5731,-54.10",
    "02/02/2024,STRIPE TRANSFER PAYOUT,5310.00",
    "02/05/2024,APPLE STORE MACBOOK PRO,-2899.00",
    "02/08/2024,UPWORK CONTRACTOR PAYMENT JAMES,-1200.00",
    "02/14/2024,NEXT INSURANCE LIABILITY POLICY,-96.00",
    "02/20/2024,IRS USATAXPYMT 1040ES,-3000.00",
    "02/21/2024,KAISER HEALTH PLAN PREMIUM,-612.00",
    "02/25/2024,NETFLIX.COM,-15.49",
    "03/01/2024,PAYPAL TRANSFER FROM CLIENT,1800.00",
    "03/03/2024,WEWORK MEMBERSHIP,-350.00",
    "03/03/2024,WEWORK MEMBERSHIP,-350.00",
    "03/10/2024,ONLINE TRANSFER TO SAVINGS,-1000.00",
    "03/12/2024,SQ *MYSTERY VENDOR,-133.00",
  ].join("\n");
  return { bank, rules: "", businesses: "", reported: "16000" };
}
