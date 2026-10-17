// College financial-aid award letter comparator: pure arithmetic on the numbers
// a family types in. No imports, no storage, no network (page.test.mjs checks).
//
// What it does that a sticker price does not: counts only gift aid (grants and
// scholarships) as a price cut, treats loans as a cost that comes due with
// interest, treats work-study as hours of work, carries grants that do not
// renew into years 2+, and prices every offer as "what the family pays in
// total over the years, including loan repayment". Interest is simple interest
// and rates are the family's to edit; see README "Model" for every assumption.

export const LOAN_TYPES = ["sub", "unsub", "plus", "priv"];

// 2025-26 federal rates and fees, as a starting point only. The page says to
// replace them with the rates for the year of borrowing (studentaid.gov).
export const DEFAULT_SETTINGS = {
  years: 4,
  inflation: 3,        // % a year on every cost-of-attendance line
  repeat: true,        // loans and work-study repeat each year as written
  rateSub: 6.39, rateUnsub: 6.39, ratePlus: 8.94, ratePriv: 9,
  feeSub: 1.057, feeUnsub: 1.057, feePlus: 4.228, feePriv: 0,
  termYears: 10,       // repayment term
  graceYears: 0.5,     // interest-free-of-payments months after leaving (still accrues, except subsidized)
  salary: 0,           // expected first-year salary; 0 = not given
  wage: 15,            // work-study hourly wage
};

// Dependent undergraduate annual federal limits: [total, max subsidized].
export const FEDERAL_LIMITS = [[5500, 3500], [6500, 4500], [7500, 5500], [7500, 5500]];

const num = (v, d = 0) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : d;
};
export const round2 = (x) => Math.round(x * 100) / 100;
export function money(x) {
  const n = Math.round(Math.abs(x));
  return (x < 0 ? "-$" : "$") + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function normaliseSettings(raw = {}) {
  const s = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (raw[k] === undefined || raw[k] === "") continue;
    s[k] = k === "repeat" ? Boolean(raw[k]) : num(raw[k], DEFAULT_SETTINGS[k]);
  }
  s.years = Math.min(6, Math.max(1, Math.round(s.years)));
  s.termYears = Math.min(30, Math.max(1, s.termYears));
  s.graceYears = Math.min(2, Math.max(0, s.graceYears));
  for (const k of Object.keys(s)) if (typeof s[k] === "number" && s[k] < 0) s[k] = 0;
  return s;
}

// ---------- parsing ----------

const FIELD_RULES = [
  [/^(college|school|university|name|institution)$/, "name"],
  [/one[- ]?time|first[- ]year only|year ?1 only|year one only/, "oneTime"],
  [/work[- ]?study/, "workStudy"],
  [/unsub/, "unsub"],
  [/subsid/, "sub"],
  [/plus/, "plus"],
  [/private|bank|alternative/, "priv"],
  [/grant|scholar|gift|merit|aid/, "grants"],
  [/tuition/, "tuition"],
  [/housing|room|board|food|meal|dorm/, "housing"],
  [/book|other|personal|transport|misc|suppl|travel/, "books"],
  [/cost of attendance|coa|total cost|sticker|total/, "coa"],
];

const NUMERIC = ["tuition", "housing", "books", "coa", "grants", "oneTime", "workStudy", ...LOAN_TYPES];

export function parseColleges(text) {
  const colleges = [];
  const warnings = [];
  let cur = null;
  const flush = () => {
    if (!cur) return;
    if (cur.coa && !(cur.tuition || cur.housing || cur.books)) cur.tuition = cur.coa;
    delete cur.coa;
    if (!cur.name) cur.name = `College ${colleges.length + 1}`;
    const total = cur.tuition + cur.housing + cur.books;
    if (total > 0) colleges.push(cur);
    else warnings.push(`${cur.name}: no cost of attendance found, so it was skipped.`);
    cur = null;
  };
  const blank = () => ({ name: "", ...Object.fromEntries(NUMERIC.map((k) => [k, 0])) });
  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) { flush(); continue; }
    if (line.startsWith("#")) continue;
    const i = line.indexOf(":");
    if (i < 0) {
      if (!cur) { cur = blank(); cur.name = line; } else warnings.push(`Ignored the line "${line}" (expected "label: amount").`);
      continue;
    }
    const label = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    const rule = FIELD_RULES.find(([re]) => re.test(label));
    if (!rule) { warnings.push(`Ignored "${line}": not a label this tool knows.`); continue; }
    const field = rule[1];
    if (field === "name") { if (cur && cur.name) flush(); cur = cur || blank(); cur.name = value; continue; }
    cur = cur || blank();
    const n = num(value, NaN);
    if (!Number.isFinite(n) || n < 0) { warnings.push(`Ignored "${line}": "${value}" is not a dollar amount.`); continue; }
    cur[field] += n;
  }
  flush();
  return { colleges, warnings };
}

// ---------- the model ----------

function amortised(balance, annualRate, years) {
  const n = Math.round(years * 12);
  const r = annualRate / 100 / 12;
  if (balance <= 0) return 0;
  return r === 0 ? balance / n : (balance * r) / (1 - Math.pow(1 + r, -n));
}

/**
 * Prices one offer. `extraGrant` adds gift aid to every year and, with
 * `trimLoans`, drops loans (private, PLUS, unsubsidized, subsidized, in that
 * order) that the extra gift makes unnecessary; the "what would match" search
 * uses both, the page never does.
 */
export function priceCollege(college, rawSettings = {}, { extraGrant = 0, trimLoans = false } = {}) {
  const s = normaliseSettings(rawSettings);
  const rate = { sub: s.rateSub, unsub: s.rateUnsub, plus: s.ratePlus, priv: s.ratePriv };
  const fee = { sub: s.feeSub, unsub: s.feeUnsub, plus: s.feePlus, priv: s.feePriv };
  const rows = [];
  const flags = [];
  // Per loan type: gross disbursed and its accrued balance at graduation.
  const gross = Object.fromEntries(LOAN_TYPES.map((k) => [k, 0]));
  const atGrad = Object.fromEntries(LOAN_TYPES.map((k) => [k, 0]));
  let totalCash = 0, totalFees = 0, giftOverCoa = false, overborrow = 0;

  for (let t = 0; t < s.years; t++) {
    const infl = Math.pow(1 + s.inflation / 100, t);
    const coa = (college.tuition + college.housing + college.books) * infl;
    const gift = college.grants + (t === 0 ? college.oneTime : 0) + extraGrant;
    if (gift > coa) giftOverCoa = true;
    const netPrice = Math.max(0, coa - gift);
    const live = t === 0 || s.repeat;
    let loans = Object.fromEntries(LOAN_TYPES.map((k) => [k, live ? college[k] : 0]));
    let ws = live ? college.workStudy : 0;
    if (trimLoans) {
      let room = Math.max(0, netPrice - ws);
      for (const k of ["sub", "unsub", "plus", "priv"].reverse()) {
        // keep what fits, in the order a family would keep them: sub first
        const keep = Math.min(loans[k], room);
        loans[k] = keep; room -= keep;
      }
      loans = { sub: loans.sub, unsub: loans.unsub, plus: loans.plus, priv: loans.priv };
    }
    const loanTotal = LOAN_TYPES.reduce((a, k) => a + loans[k], 0);
    const fees = LOAN_TYPES.reduce((a, k) => a + loans[k] * fee[k] / 100, 0);
    const need = netPrice + fees - loanTotal - ws;
    const cash = Math.max(0, need);
    if (need < 0) overborrow += -need;
    for (const k of LOAN_TYPES) {
      gross[k] += loans[k];
      const accrueYears = k === "sub" ? 0 : (s.years - t) + s.graceYears;
      atGrad[k] += loans[k] * (1 + rate[k] / 100 * accrueYears);
    }
    totalCash += cash; totalFees += fees;
    rows.push({ year: t + 1, coa, gift, netPrice, loans: loanTotal, workStudy: ws, fees, cash });

    const [lim, subLim] = FEDERAL_LIMITS[Math.min(t, FEDERAL_LIMITS.length - 1)];
    if (!trimLoans && loans.sub + loans.unsub > lim + 0.5) flags.push(`Year ${t + 1}: subsidized plus unsubsidized loans of ${money(loans.sub + loans.unsub)} are above the ${money(lim)} federal limit for a dependent undergraduate. Check the letter (or whether you are an independent student).`);
    else if (!trimLoans && loans.sub > subLim + 0.5) flags.push(`Year ${t + 1}: a subsidized loan of ${money(loans.sub)} is above the ${money(subLim)} federal limit.`);
  }

  const monthly = Object.fromEntries(LOAN_TYPES.map((k) => [k, amortised(atGrad[k], rate[k], s.termYears)]));
  const repaid = LOAN_TYPES.reduce((a, k) => a + monthly[k] * Math.round(s.termYears * 12), 0);
  const borrowed = LOAN_TYPES.reduce((a, k) => a + gross[k], 0);
  const balance = LOAN_TYPES.reduce((a, k) => a + atGrad[k], 0);
  const studentMonthly = monthly.sub + monthly.unsub + monthly.priv;
  const parentMonthly = monthly.plus;
  const sticker = rows.reduce((a, r) => a + r.coa, 0);
  const gift = rows.reduce((a, r) => a + r.gift, 0);
  const netTotal = rows.reduce((a, r) => a + r.netPrice, 0);
  const wsTotal = rows.reduce((a, r) => a + r.workStudy, 0);
  const year1Net = rows[0].netPrice;
  const laterNet = rows.length > 1 ? rows.slice(1).reduce((a, r) => a + r.netPrice, 0) / (rows.length - 1) : year1Net;
  const hours = college.workStudy > 0 && s.wage > 0 ? college.workStudy / s.wage / 30 : 0;

  if (rows.length > 1 && laterNet > year1Net * 1.08 + 100) {
    const why = [];
    if (college.oneTime > 0) why.push(`${money(college.oneTime)} of the aid is first-year only`);
    if (s.inflation > 0) why.push(`costs grow ${s.inflation}% a year`);
    flags.push(`Net price rises from ${money(year1Net)} in year 1 to about ${money(laterNet)} a year after${why.length ? ", because " + why.join(" and ") : ""}.`);
  }
  if (!trimLoans && overborrow > 1) flags.push(`The loans and work-study are ${money(overborrow)} more than the bill over ${s.years} ${s.years === 1 ? "year" : "years"}: you would be borrowing money you do not need. Decline some of it.`);
  if (giftOverCoa) flags.push("Grants are larger than the cost of attendance in at least one year; check whether part of them is a refund you must apply elsewhere.");
  if (hours > 12) flags.push(`Work-study of ${money(college.workStudy)} is about ${hours.toFixed(1)} hours a week at ${money(s.wage)} an hour over 30 weeks; more than about 12 hours a week is hard alongside classes.`);
  if (s.salary > 0 && studentMonthly * 12 > s.salary * 0.1) flags.push(`Student loan payments of ${money(studentMonthly)} a month are ${(studentMonthly * 12 / s.salary * 100).toFixed(0)}% of a ${money(s.salary)} salary, above the 10% rule of thumb.`);
  if (s.salary > 0 && borrowed > s.salary) flags.push(`Total borrowed (${money(borrowed)}) is more than the expected first-year salary.`);

  return {
    name: college.name, rows, flags,
    sticker, gift, netTotal, cash: totalCash, fees: totalFees, borrowed, balance,
    studentMonthly, parentMonthly, repaid, interest: Math.max(0, repaid - borrowed),
    workStudyTotal: wsTotal, workHours: hours,
    year1Net, laterNet, giftShare: sticker > 0 ? gift / sticker : 0,
    totalCost: totalCash + repaid,
    perYearCost: (totalCash + repaid) / s.years,
  };
}

/** Prices every offer, cheapest total cost first, with the gap to the cheapest. */
export function compareColleges(colleges, rawSettings = {}) {
  const s = normaliseSettings(rawSettings);
  const priced = colleges.map((c) => ({ college: c, result: priceCollege(c, s) }));
  priced.sort((a, b) => a.result.totalCost - b.result.totalCost || a.result.name.localeCompare(b.result.name));
  const best = priced[0]?.result.totalCost ?? 0;
  return priced.map(({ college, result }, i) => {
    const gap = result.totalCost - best;
    return { ...result, rank: i + 1, gap, matchGrant: gap > 0.5 ? extraGrantToMatch(college, s, best) : 0 };
  });
}

/** Extra gift aid per year (rounded up to $50) that would bring an offer's total cost down to `target`. */
export function extraGrantToMatch(college, settings, target) {
  const cost = (g) => priceCollege(college, settings, { extraGrant: g, trimLoans: true }).totalCost;
  if (cost(0) <= target) return 0;
  let lo = 0, hi = Math.max(1000, (college.tuition + college.housing + college.books) * 2);
  if (cost(hi) > target) return Math.ceil(hi / 50) * 50;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (cost(mid) > target) lo = mid; else hi = mid;
  }
  return Math.ceil(hi / 50) * 50;
}

export function yearlyCsv(results) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [["college", "year", "cost_of_attendance", "grants", "net_price", "loans", "work_study", "loan_fees", "cash_due"].join(",")];
  for (const r of results) for (const y of r.rows) lines.push([q(r.name), y.year, ...[y.coa, y.gift, y.netPrice, y.loans, y.workStudy, y.fees, y.cash].map((v) => round2(v))].join(","));
  return lines.join("\n") + "\n";
}

export const SAMPLE = `# EXAMPLE numbers, not a real award letter. Replace them with yours.
College: State University (in state)
Tuition and fees: 11500
Housing and food: 12000
Books and other: 3500
Grants and scholarships: 4000
Work-study: 2000
Subsidized loan: 3500
Unsubsidized loan: 2000

College: Private College A
Tuition and fees: 46000
Housing and food: 15500
Books and other: 3000
Grants and scholarships: 28000
One-time first-year grant: 9000
Work-study: 2500
Subsidized loan: 3500
Unsubsidized loan: 2000
Parent PLUS: 8000

College: Regional University
Tuition and fees: 24000
Housing and food: 11500
Books and other: 3000
Grants and scholarships: 11000
Subsidized loan: 3500
Unsubsidized loan: 2000
`;
