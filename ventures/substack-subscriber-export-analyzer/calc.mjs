// Subscriber, conversion, churn and revenue analysis from a Substack "subscribers"
// export CSV. Column names are matched by alias from memory of Substack exports; no
// real export was available when this was written. The export carries no prices, so
// revenue uses prices the user types. Pure functions, no DOM, no network.

const ALIASES = {
  email: ["email", "email address", "subscriber email"],
  active: ["active_subscription", "active subscription", "active", "is_active", "subscription active", "is paid"],
  expiry: ["expiry", "expires", "expiry date", "subscription expiry", "expires_at", "subscription_expires_at", "current period end"],
  plan: ["plan", "subscription plan", "plan type", "tier"],
  type: ["type", "subscription type", "subscriber type", "status"],
  emailDisabled: ["email_disabled", "email disabled", "unsubscribed", "emails disabled"],
  created: ["created_at", "created", "signup date", "subscribed", "subscribed at", "date subscribed", "subscribed_at", "joined", "created at"],
  firstPayment: ["first_payment_at", "first payment", "first payment date", "first_payment", "became paid", "upgraded_at", "subscription_created_at", "paid since"],
  activity: ["activity_rating", "activity rating", "activity", "engagement"],
  country: ["country"],
};

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

// "$5.00", "1,234.50", "5.00 USD", "(5)", "-5" and blanks (0). NaN for non-numbers.
export function parseNumber(v, decimalComma = false) {
  let s = String(v ?? "").trim();
  if (s === "" || /^[-–—\s]+$/.test(s)) return 0;
  const neg = /^\(.*\)$/.test(s) || /^[-−]/.test(s);
  const m = s.match(/\d[\d.,]*/);
  if (!m) return NaN;
  s = m[0];
  s = decimalComma ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  return neg ? -n : n;
}

// Calendar dates. Returns UTC ms or null. `dmy` is decided once per file.
export function parseWhen(v, dmy = false) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  let y, mo, d;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else {
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (!m) return null;
    const a = +m[1], b = +m[2];
    y = +m[3]; if (y < 100) y += 2000;
    if (dmy) { d = a; mo = b; } else { mo = a; d = b; }
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, mo - 1, d);
  return new Date(t).getUTCDate() === d ? t : null;
}

// Day-first only when unambiguous: some first part above 12, no second above 12.
export function detectDmy(values) {
  let first = false, second = false;
  for (const v of values) {
    const m = String(v ?? "").trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/);
    if (!m) continue;
    if (+m[1] > 12) first = true;
    if (+m[2] > 12) second = true;
  }
  return first && !second;
}


function findColumns(header) {
  const norm = header.map((h) => h.trim().toLowerCase());
  const cols = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      const at = norm.indexOf(n);
      if (at !== -1 && !Object.values(cols).includes(at)) { cols[field] = at; break; }
    }
  }
  return cols;
}

const DAY = 86400000;
const MONTH_DAYS = 30.4375;
export const MIN_GROUP = 5;
export const DEFAULT_ASSUMPTIONS = Object.freeze({ monthlyPrice: 8, annualPrice: 80, foundingPrice: 200, platformPct: 10, processingPct: 2.9, processingFixed: 0.3, conversionTest: 1 });

const isBlank = (s) => s === "" || /^[-–—\s]+$/.test(s);
const truthy = (s) => /^(true|yes|y|1|t)$/i.test(String(s ?? "").trim());
const falsy = (s) => /^(false|no|n|0|f)$/i.test(String(s ?? "").trim());

// Plan wording -> monthly | annual | founding | comp | other.
export function classifyPlan(s) {
  const t = String(s ?? "").toLowerCase();
  if (/comp|gift|complimentary/.test(t)) return "comp";
  if (/found/.test(t)) return "founding";
  if (/year|annual/.test(t)) return "annual";
  if (/month/.test(t)) return "monthly";
  return t.trim() ? "other" : "none";
}

// Returns { members, skipped, columns, dmy, error }. A member is { line, plan,
// paidEver, activeFlag (true/false/null), created, firstPayment, expiry,
// emailDisabled, activity }. Emails are read only to drop empty rows and are not kept.
export function normalizeRows(table) {
  const empty = { members: [], skipped: [], columns: {}, dmy: false };
  if (!table.length) return { ...empty, error: "The file is empty." };
  let h = -1;
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    const c = findColumns(table[i]);
    if (c.email !== undefined && (c.created !== undefined || c.active !== undefined || c.plan !== undefined || c.type !== undefined)) { h = i; break; }
  }
  if (h < 0) return { ...empty, error: "No header row found. Expected the Substack subscribers export columns, such as “email”, “created_at”, “active_subscription”, “plan”, “expiry” and “first_payment_at”. Export from Substack (Subscribers, Export) or make a sheet with those headers." };
  const cols = findColumns(table[h]);
  const get = (line, f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
  const dates = (f) => table.slice(h + 1).map((l) => get(l, f));
  const dmy = detectDmy([...dates("created"), ...dates("firstPayment"), ...dates("expiry")]);
  const members = [], skipped = [];
  for (let i = h + 1; i < table.length; i++) {
    const line = table[i];
    const lineNo = i + 1;
    const first = String(line[0] ?? "").trim().toLowerCase();
    if (/^(total|totals|subtotal|grand total|summary)\b/.test(first)) { skipped.push({ line: lineNo, reason: "total row" }); continue; }
    if (!get(line, "email") && !get(line, "created")) { skipped.push({ line: lineNo, reason: "empty row" }); continue; }
    const plan = classifyPlan(get(line, "plan"));
    const type = get(line, "type").toLowerCase();
    const created = parseWhen(get(line, "created"), dmy);
    const firstPayment = parseWhen(get(line, "firstPayment"), dmy);
    const expiry = parseWhen(get(line, "expiry"), dmy);
    const a = get(line, "active");
    const activeFlag = truthy(a) ? true : falsy(a) ? false : /paid|comp|founding|premium/.test(type) && !/former|cancel|lapsed/.test(type) ? true : /former|cancel|lapsed/.test(type) ? false : null;
    const comp = plan === "comp" || /comp|gift/.test(type);
    const paidEver = !comp && (firstPayment !== null || ["monthly", "annual", "founding", "other"].includes(plan) || /paid|founding|premium/.test(type));
    const ad = get(line, "emailDisabled");
    const act = get(line, "activity");
    const activity = isBlank(act) ? null : parseNumber(act);
    members.push({ line: lineNo, plan: comp ? "comp" : plan, comp, paidEver, activeFlag, created, firstPayment, expiry, emailDisabled: truthy(ad), activity: Number.isFinite(activity) ? activity : null });
  }
  if (!members.length) return { ...empty, columns: cols, dmy, skipped, error: "No usable rows: every row was skipped." };
  return { members, skipped, columns: cols, dmy };
}

export const SURVIVAL_MONTHS = [1, 3, 6, 12];
export const LAG_BUCKETS = [
  { label: "Same week", to: 7 }, { label: "Within a month", to: 30 }, { label: "1 to 3 months", to: 91 },
  { label: "3 to 12 months", to: 365 }, { label: "Over a year", to: Infinity },
];

const monthsBetween = (a, b) => Math.max(0, (b - a) / DAY / MONTH_DAYS);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const ym = (t) => new Date(t).toISOString().slice(0, 7);

// Status at the as-of date: paid | comp | free | former | unsubscribed-free is still free.
export function statusOf(m, asOf) {
  if (m.comp) return m.activeFlag === false ? "free" : "comp";
  if (!m.paidEver) return "free";
  const live = m.activeFlag !== null ? m.activeFlag : (m.expiry === null || m.expiry >= asOf);
  return live ? "paid" : "former";
}

// Monthly-equivalent revenue and charges per month for a paying subscriber.
export function revenueOf(plan, a) {
  if (plan === "annual") return { monthly: a.annualPrice / 12, charges: 1 / 12 };
  if (plan === "founding") return { monthly: a.foundingPrice / 12, charges: 1 / 12 };
  return { monthly: a.monthlyPrice, charges: 1 };
}

export function analyze(members, opts = {}) {
  const a = { ...DEFAULT_ASSUMPTIONS };
  for (const k of Object.keys(a)) if (opts[k] !== undefined && opts[k] !== null && opts[k] !== "") a[k] = Number(opts[k]);
  if (Object.values(a).some((v) => !Number.isFinite(v) || v < 0) || a.platformPct + a.processingPct >= 100) return { invalid: "Prices and fee assumptions must be non-negative numbers, with fees adding up to under 100%." };

  const dated = members.flatMap((m) => [m.created, m.firstPayment]).filter((t) => t !== null);
  const asOf = opts.asOf ?? (dated.length ? Math.max(...dated) : Date.now());
  const tagged = members.map((m) => ({ ...m, status: statusOf(m, asOf) }));
  const by = (s) => tagged.filter((m) => m.status === s);
  const paid = by("paid"), comp = by("comp"), free = by("free"), former = by("former");
  const counts = { total: tagged.length, paid: paid.length, comp: comp.length, free: free.length, former: former.length };
  const paidEver = paid.length + former.length;
  const nonComp = tagged.length - comp.length;

  // Revenue by plan.
  const plans = new Map();
  for (const m of paid) {
    const r = revenueOf(m.plan, a);
    const p = plans.get(m.plan) ?? { plan: m.plan, subscribers: 0, mrr: 0, charges: 0 };
    p.subscribers += 1; p.mrr += r.monthly; p.charges += r.charges; plans.set(m.plan, p);
  }
  const byPlan = [...plans.values()].sort((x, y) => y.mrr - x.mrr || x.plan.localeCompare(y.plan));
  const mrr = sum(byPlan.map((p) => p.mrr));
  const charges = sum(byPlan.map((p) => p.charges));
  const platform = mrr * a.platformPct / 100;
  const processing = mrr * a.processingPct / 100 + a.processingFixed * charges;
  const fees = { platform, processing, total: platform + processing, assumptions: a, takePct: mrr > 0 ? (platform + processing) / mrr : 0 };
  const net = mrr - fees.total;

  // Growth: signups and first payments by calendar month, last 12 months with data.
  const months = new Map();
  const bump = (t, k) => { if (t === null) return; const key = ym(t); const g = months.get(key) ?? { month: key, joined: 0, upgraded: 0 }; g[k] += 1; months.set(key, g); };
  for (const m of tagged) { if (!m.comp) { bump(m.created, "joined"); } if (m.paidEver) bump(m.firstPayment, "upgraded"); }
  const growth = [...months.values()].sort((x, y) => x.month.localeCompare(y.month)).slice(-12);

  // Time from signup to first payment.
  const lags = tagged.filter((m) => m.paidEver && m.created !== null && m.firstPayment !== null).map((m) => Math.max(0, (m.firstPayment - m.created) / DAY));
  const lagBuckets = LAG_BUCKETS.map((b) => ({ label: b.label, count: 0 }));
  for (const d of lags) lagBuckets[LAG_BUCKETS.findIndex((b) => d < b.to)].count += 1;
  const medianLagDays = median(lags);

  // Paid survival: of subscribers who first paid at least N months ago, how many paid for N months.
  const paidLife = [...paid, ...former].filter((m) => m.firstPayment !== null).map((m) => {
    const end = m.status === "former" ? (m.expiry ?? null) : asOf;
    return { m, t: end === null ? null : monthsBetween(m.firstPayment, Math.max(end, m.firstPayment)) };
  }).filter((x) => x.t !== null);
  const survival = SURVIVAL_MONTHS.map((n) => {
    let eligible = 0, kept = 0;
    for (const { m, t } of paidLife) {
      if (monthsBetween(m.firstPayment, asOf) < n) continue;
      eligible += 1;
      if (m.status !== "former" || t >= n) kept += 1;
    }
    return { months: n, eligible, kept, rate: eligible ? kept / eligible : null, enough: eligible >= MIN_GROUP };
  });

  // Annual and founding renewals coming due, and how much revenue rides on them.
  const renewals = [30, 60, 90].map((days) => {
    const list = paid.filter((m) => (m.plan === "annual" || m.plan === "founding") && m.expiry !== null && m.expiry >= asOf && m.expiry < asOf + days * DAY);
    return { days, count: list.length, amount: sum(list.map((m) => (m.plan === "founding" ? a.foundingPrice : a.annualPrice))) };
  });

  // Engagement of free subscribers: the pool a paid push should aim at.
  const rated = free.filter((m) => m.activity !== null);
  const dist = new Map();
  for (const m of rated) dist.set(m.activity, (dist.get(m.activity) ?? 0) + 1);
  const activityDist = [...dist.entries()].sort((x, y) => y[0] - x[0]).map(([rating, count]) => ({ rating, count }));
  const top = rated.length ? Math.max(...rated.map((m) => m.activity)) : 0;
  const engaged = top > 0 ? rated.filter((m) => m.activity >= Math.max(1, Math.ceil(top * 0.6))).length : 0;
  const perPercent = a.monthlyPrice * (engaged / 100);
  const activeBase = paid.length + free.length;
  const summary = {
    asOf, counts, paidEver, mrr, arr: mrr * 12, arpu: paid.length ? mrr / paid.length : 0,
    paidShare: activeBase ? paid.length / activeBase : null,
    conversion: nonComp ? paidEver / nonComp : null,
    churnRate: paidEver ? former.length / paidEver : null,
    medianLagDays, disabled: tagged.filter((m) => m.emailDisabled).length,
    engaged, ratedFree: rated.length, perPercent, topRating: top,
    undated: tagged.filter((m) => m.created === null).length,
  };
  const result = { summary, byPlan, growth, lagBuckets, survival, renewals, activityDist, fees, net };
  result.findings = findings(result);
  return result;
}

function findings(r) {
  const out = [];
  const s = r.summary, c = s.counts;
  const add = (severity, title, detail) => out.push({ severity, title, detail });
  const $ = (n) => "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const p = (n) => (n * 100).toFixed(0) + "%";
  const s3 = r.survival.find((x) => x.months === 3 && x.enough);
  if (s3 && s3.rate < 0.8) add("high", `Only ${p(s3.rate)} of paid subscribers stay past three months`, `Of ${s3.eligible} who first paid at least three months before the file's latest date, ${s3.kept} paid for three months or longer. Early cancellations usually mean the paid promise was unclear at signup; a welcome email to new paid subscribers and a paid-only post in the first week are the usual fixes.`);
  const s12 = r.survival.find((x) => x.months === 12 && x.enough);
  if (s12 && s12.rate < 0.5) add("high", `Fewer than half of paid subscribers reach a year: ${p(s12.rate)}`, `${s12.kept} of ${s12.eligible} eligible subscribers paid for 12 months or longer. Annual plans lock in a year; check the share of annual against monthly below.`);
  const soon = r.renewals[0];
  if (soon.count > 0) add("medium", `${soon.count} annual or founding plan(s) expire in the next 30 days`, `About ${$(soon.amount)} of revenue comes up for renewal. Substack emails them, and a personal note a week before is the cheapest retention there is. ${r.renewals[2].count} expire within 90 days (${$(r.renewals[2].amount)}).`);
  if (c.total >= 20 && s.conversion !== null && s.conversion < 0.03) add("medium", `Free-to-paid conversion is ${(s.conversion * 100).toFixed(1)}%`, `${s.paidEver} of ${c.total - c.comp} subscribers have ever paid. Rates around 5 to 10% are commonly quoted for newsletters, though that varies a great deal by niche and this file cannot tell you yours is low. The engaged free readers below are where a paid push starts.`);
  if (s.engaged > 0) add("info", `${s.engaged} engaged free subscriber(s) are the best paid prospects`, `They rate at or near the top of the activity scale in this file (top rating ${s.topRating}). Every 1% of them who upgrade at ${$(r.fees.assumptions.monthlyPrice)} a month is about ${$(s.perPercent)} a month.`);
  const annual = r.byPlan.filter((x) => x.plan === "annual" || x.plan === "founding").reduce((t, x) => t + x.subscribers, 0);
  if (c.paid >= 10 && annual / c.paid < 0.2) add("info", `Only ${p(annual / c.paid)} of paid subscribers are on an annual or founding plan`, "Annual plans cancel far less often than monthly ones in most subscription businesses. An annual discount offered to your monthly payers is a common lever.");
  if (s.mrr > 0) add("info", `Fees take about ${p(r.fees.takePct)} of monthly revenue`, `Estimated ${$(r.fees.total)} a month on ${$(s.mrr)}, leaving ${$(r.net)} before tax, currency conversion and payouts. This uses the fee and price assumptions you can edit above; check them against your own Substack payout statement.`);
  if (s.disabled > 0) add("info", `${s.disabled} subscriber(s) have emails disabled`, "They are on the list but not receiving posts, so they will not convert or renew from your newsletter alone.");
  if (c.comp > 0) add("info", `${c.comp} complimentary or gift subscription(s) are excluded from revenue`, "They count as subscribers but not as paid, and not in the conversion rate.");
  if (s.undated > 0) add("info", `${s.undated} row(s) have no usable signup date`, "They are left out of the growth table.");
  if (!out.length || (out.length === 1 && out[0].severity === "info")) add("info", "Nothing stands out", "No early-churn, renewal or conversion problem was found in this file.");
  return out;
}

export const money = (n) => (Number.isFinite(n) ? (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–");
export const pct = (n) => (Number.isFinite(n) && n !== null ? (n * 100).toFixed(0) + "%" : "–");
export const dateStr = (t) => new Date(t).toISOString().slice(0, 10);

// Synthetic subscribers for the "Load an example" button: not a real publication.
export function sampleCsv() {
  const lines = ["email,active_subscription,expiry,plan,email_disabled,created_at,first_payment_at,activity_rating"];
  let seed = 11;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const asOf = Date.UTC(2026, 8, 1);
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  for (let i = 1; i <= 400; i++) {
    const agoDays = Math.floor(rnd() * 700) + 1;
    const created = asOf - agoDays * DAY;
    const r = rnd();
    let active = "true", expiry = "", plan = "", first = "", disabled = "false", activity = String(Math.floor(rnd() * 4));
    if (r < 0.09) {
      const lag = Math.floor(rnd() * Math.min(agoDays, 120));
      const pf = created + lag * DAY;
      const annual = rnd() < 0.3;
      plan = annual ? "yearly" : "monthly"; first = iso(pf); activity = String(2 + Math.floor(rnd() * 3));
      const stayedMonths = annual ? 12 : Math.ceil(rnd() * 8);
      const end = pf + stayedMonths * 30.4375 * DAY;
      if (rnd() < 0.32 && end < asOf) { active = "false"; expiry = iso(end); }
      else { expiry = iso(annual ? pf + 365 * DAY * Math.ceil(((asOf - pf) / DAY + 1) / 365) : asOf + Math.floor(rnd() * 28 + 1) * DAY); }
    } else if (r < 0.1) { plan = "comp"; }
    else if (r < 0.13) { active = "false"; disabled = "true"; activity = "0"; }
    lines.push(`reader${i}@example.org,${active},${expiry},${plan},${disabled},${iso(created)},${first},${activity}`);
  }
  return lines.join("\n") + "\n";
}
