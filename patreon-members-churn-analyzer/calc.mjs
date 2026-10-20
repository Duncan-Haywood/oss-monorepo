// Churn, MRR and fee analysis from a Patreon "Members" export CSV. Column names
// are matched by alias from memory of Patreon exports; no real export was
// available when this was written. Pure functions, no DOM, no network.

const ALIASES = {
  name: ["name", "patron name", "full name", "member"],
  email: ["email", "email address", "patron email"],
  status: ["patron status", "status", "member status", "membership status"],
  followsYou: ["follows you", "follower", "follows"],
  lifetime: ["lifetime $", "lifetime", "lifetime amount", "lifetime total", "lifetime support", "lifetime pledged", "lifetime value"],
  paying: ["currently paying $", "currently paying", "current pledge paid", "paying"],
  tier: ["tier", "tier name", "reward", "membership tier", "current tier"],
  pledge: ["pledge", "pledge amount", "pledge $", "monthly pledge", "amount", "pledge amount $", "current pledge"],
  freeTrial: ["free trial", "trial"],
  addressed: ["addressed"],
  maxPosts: ["max posts", "max charge amount"],
  since: ["patronage since date", "patronage since", "patron since", "member since", "joined", "join date", "start date", "pledge start", "first pledge date"],
  lastCharge: ["last charge date", "last charged", "last payment date", "last charge"],
  lastStatus: ["last charge status", "last payment status", "last charge result"],
  frequency: ["charge frequency", "billing frequency", "frequency", "billing cycle", "billing"],
  nextCharge: ["next charge date", "next charge", "next payment date"],
  country: ["country", "billing country"],
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
export const DEFAULT_ASSUMPTIONS = Object.freeze({ platformPct: 10, processingPct: 2.9, processingFixed: 0.3 });

const isBlank = (s) => s === "" || /^[-–—\s]+$/.test(s);

// "Active patron" -> active, "Declined patron" -> declined, "Former patron" ->
// former. Anything else (free members, followers, unknown wording) -> other.
export function classifyStatus(s) {
  const t = String(s ?? "").toLowerCase();
  if (/declin|fail|past due|payment issue/.test(t)) return "declined";
  if (/former|cancel|lapsed|deleted|inactive|ended/.test(t)) return "former";
  if (/active|current|paid/.test(t)) return "active";
  return "other";
}

// Charge frequency -> { months per charge or 0 when not calendar billed }.
export function classifyFrequency(s) {
  const t = String(s ?? "").toLowerCase();
  if (/creation|post|per\s*item|per\s*work/.test(t)) return { kind: "creation", perCharge: 0 };
  if (/year|annual/.test(t)) return { kind: "annual", perCharge: 12 };
  if (/quarter/.test(t)) return { kind: "quarterly", perCharge: 3 };
  return { kind: "monthly", perCharge: 1 };
}

// Returns { members, skipped, columns, dmy, statusSource, error }. A member is
// { line, name, status, tier, pledge, paying, monthly, perCreation, chargesPerMonth,
//   since, lastCharge, nextCharge, lastStatus, lifetime }. `pledge` is what one
// charge is; `monthly` is the monthly-equivalent (annual / 12), or 0 for a
// per-creation pledge, whose monthly amount depends on how much you post.
export function normalizeRows(table, { decimalComma = false } = {}) {
  const empty = { members: [], skipped: [], columns: {}, dmy: false, statusSource: "none" };
  if (!table.length) return { ...empty, error: "The file is empty." };
  let h = -1;
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    const c = findColumns(table[i]);
    if ((c.status !== undefined || c.pledge !== undefined || c.paying !== undefined) && (c.since !== undefined || c.status !== undefined)) { h = i; break; }
  }
  if (h < 0) return { ...empty, error: "No header row found. Expected the Patreon Members export columns, such as “Patron Status”, “Pledge” (or “Currently Paying $”) and “Patronage Since Date”, plus ideally “Tier”, “Last Charge Date”, “Last Charge Status” and “Charge Frequency”. Export from Patreon (Audience, Members, Export) or make a sheet with those headers." };
  const cols = findColumns(table[h]);
  const get = (line, f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
  const dates = (f) => table.slice(h + 1).map((l) => get(l, f));
  const dmy = detectDmy([...dates("since"), ...dates("lastCharge"), ...dates("nextCharge")]);
  const statusSource = cols.status !== undefined ? "column" : "inferred";
  const members = [], skipped = [];
  for (let i = h + 1; i < table.length; i++) {
    const line = table[i];
    const lineNo = i + 1;
    const first = String(line[0] ?? "").trim().toLowerCase();
    if (/^(total|totals|subtotal|grand total|summary)\b/.test(first)) { skipped.push({ line: lineNo, reason: "total row" }); continue; }
    const num = (f) => (cols[f] === undefined || isBlank(get(line, f)) ? 0 : parseNumber(get(line, f), decimalComma));
    const pledge = num("pledge"), paying = num("paying"), lifetime = num("lifetime");
    if ([pledge, paying, lifetime].some(Number.isNaN)) { skipped.push({ line: lineNo, reason: "amount not a number" }); continue; }
    const since = parseWhen(get(line, "since"), dmy);
    const lastCharge = parseWhen(get(line, "lastCharge"), dmy);
    const nextCharge = parseWhen(get(line, "nextCharge"), dmy);
    const lastStatus = get(line, "lastStatus");
    let status;
    if (statusSource === "column") status = classifyStatus(get(line, "status"));
    else if (/declin|fail/i.test(lastStatus)) status = "declined";
    else status = Math.max(pledge, paying) > 0 ? "active" : "former";
    if (statusSource === "column" && !get(line, "status") && !get(line, "name") && !get(line, "email")) { skipped.push({ line: lineNo, reason: "empty row" }); continue; }
    const freq = classifyFrequency(get(line, "frequency"));
    const charge = pledge > 0 ? pledge : paying;
    const monthly = freq.kind === "creation" ? 0 : charge / freq.perCharge;
    members.push({
      line: lineNo, name: get(line, "name"), status, tier: get(line, "tier") || "No tier",
      pledge: charge, paying, monthly, perCreation: freq.kind === "creation",
      chargesPerMonth: freq.kind === "creation" ? 0 : 1 / freq.perCharge,
      since, lastCharge, nextCharge, lastStatus, lifetime,
      freeTrial: /^(yes|true|1)$/i.test(get(line, "freeTrial")),
    });
  }
  if (!members.length) return { ...empty, columns: cols, dmy, skipped, error: "No usable rows: every row was skipped." };
  return { members, skipped, columns: cols, dmy, statusSource };
}

export const TENURE_BUCKETS = [
  { label: "Under 3 months", from: 0, to: 3 },
  { label: "3 to 6 months", from: 3, to: 6 },
  { label: "6 to 12 months", from: 6, to: 12 },
  { label: "1 to 2 years", from: 12, to: 24 },
  { label: "2 years or more", from: 24, to: Infinity },
];
export const SURVIVAL_MONTHS = [1, 3, 6, 12];

const monthsBetween = (a, b) => Math.max(0, (b - a) / DAY / MONTH_DAYS);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const bucketOf = (m) => TENURE_BUCKETS.findIndex((b) => m >= b.from && m < b.to);

// Fee model for one monthly-equivalent stream of charges: platform percentage of
// the amount, plus processing percentage and a fixed amount per charge.
export function feesFor(members, a) {
  let platform = 0, processing = 0;
  for (const m of members) {
    if (m.monthly <= 0) continue;
    platform += m.monthly * a.platformPct / 100;
    processing += m.monthly * a.processingPct / 100 + a.processingFixed * m.chargesPerMonth;
  }
  return { platform, processing, total: platform + processing };
}

export function analyze(members, opts = {}) {
  const a = { ...DEFAULT_ASSUMPTIONS };
  for (const k of Object.keys(a)) if (opts[k] !== undefined && opts[k] !== null && opts[k] !== "") a[k] = Number(opts[k]);
  if (Object.values(a).some((v) => !Number.isFinite(v) || v < 0) || a.platformPct + a.processingPct >= 100) return { invalid: "Fee assumptions must be non-negative numbers that add up to under 100%." };

  const dated = members.flatMap((m) => [m.since, m.lastCharge]).filter((t) => t !== null);
  const asOf = opts.asOf ?? (dated.length ? Math.max(...dated) : Date.now());
  const active = members.filter((m) => m.status === "active");
  const declined = members.filter((m) => m.status === "declined");
  const former = members.filter((m) => m.status === "former");
  const other = members.filter((m) => m.status === "other");
  const paying = [...active, ...declined];
  const counts = { active: active.length, declined: declined.length, former: former.length, other: other.length, total: members.length };
  const everPaid = active.length + declined.length + former.length;

  const mrr = sum(active.map((m) => m.monthly));
  const atRisk = sum(declined.map((m) => m.monthly));
  const perCreation = active.filter((m) => m.perCreation).length;

  // By tier (active patrons).
  const tierMap = new Map();
  for (const m of active) {
    const t = tierMap.get(m.tier) ?? { tier: m.tier, patrons: 0, mrr: 0, declined: 0, former: 0 };
    t.patrons += 1; t.mrr += m.monthly; tierMap.set(m.tier, t);
  }
  for (const m of declined) { const t = tierMap.get(m.tier) ?? { tier: m.tier, patrons: 0, mrr: 0, declined: 0, former: 0 }; t.declined += 1; tierMap.set(m.tier, t); }
  for (const m of former) { const t = tierMap.get(m.tier) ?? { tier: m.tier, patrons: 0, mrr: 0, declined: 0, former: 0 }; t.former += 1; tierMap.set(m.tier, t); }
  const byTier = [...tierMap.values()].map((t) => ({
    ...t, share: mrr > 0 ? t.mrr / mrr : 0,
    churn: t.patrons + t.declined + t.former ? t.former / (t.patrons + t.declined + t.former) : null,
    enough: t.patrons + t.declined + t.former >= MIN_GROUP,
  })).sort((x, y) => y.mrr - x.mrr || x.tier.localeCompare(y.tier));

  // Tenure. Active and declined run to asOf; former patrons to their last charge.
  const tenureOf = (m) => {
    if (m.since === null) return null;
    const end = m.status === "former" ? (m.lastCharge ?? null) : asOf;
    return end === null ? null : monthsBetween(m.since, Math.max(end, m.since));
  };
  const withTenure = [...active, ...declined, ...former].map((m) => ({ m, t: tenureOf(m) }));
  const known = withTenure.filter((x) => x.t !== null);
  const distribution = TENURE_BUCKETS.map((b) => ({ label: b.label, active: 0, declined: 0, former: 0 }));
  for (const { m, t } of known) { const i = bucketOf(t); if (i >= 0) distribution[i][m.status] += 1; }
  const medianActive = median(known.filter((x) => x.m.status === "active").map((x) => x.t));
  const medianFormer = median(known.filter((x) => x.m.status === "former").map((x) => x.t));

  // Cohorts by how long ago the patron joined; churn = former share of the cohort.
  const cohorts = TENURE_BUCKETS.map((b) => ({ label: b.label, joined: 0, former: 0, declined: 0, rate: null, enough: false }));
  for (const m of [...active, ...declined, ...former]) {
    if (m.since === null) continue;
    const i = bucketOf(monthsBetween(m.since, asOf));
    if (i < 0) continue;
    cohorts[i].joined += 1;
    if (m.status === "former") cohorts[i].former += 1;
    if (m.status === "declined") cohorts[i].declined += 1;
  }
  for (const c of cohorts) { c.enough = c.joined >= MIN_GROUP; c.rate = c.joined ? c.former / c.joined : null; }

  // Survival: of patrons who joined at least N months ago, how many paid for N months.
  const survival = SURVIVAL_MONTHS.map((n) => {
    let eligible = 0, kept = 0;
    for (const { m, t } of known) {
      if (monthsBetween(m.since, asOf) < n) continue;
      eligible += 1;
      if (m.status !== "former" || t >= n) kept += 1;
    }
    return { months: n, eligible, kept, rate: eligible ? kept / eligible : null, enough: eligible >= MIN_GROUP };
  });

  // Concentration among active, monthly-billed patrons.
  const billed = active.filter((m) => m.monthly > 0).sort((x, y) => y.monthly - x.monthly);
  const topShare = (n) => (mrr > 0 ? sum(billed.slice(0, n).map((m) => m.monthly)) / mrr : 0);
  const topN = Math.max(1, Math.ceil(billed.length * 0.1));
  const concentration = { top1: topShare(1), top5: topShare(5), top10pct: topShare(topN), top10pctCount: topN, topTier: byTier.find((t) => t.mrr > 0) ?? null };

  // Fees.
  const fees = feesFor(active, a);
  const net = mrr - fees.total;
  const takePct = mrr > 0 ? fees.total / mrr : 0;

  const summary = { asOf, counts, everPaid, mrr, arr: mrr * 12, atRisk, atRiskShare: mrr + atRisk > 0 ? atRisk / (mrr + atRisk) : 0, mrrIfRecovered: mrr + atRisk, perCreation,
    arpp: active.length ? mrr / active.length : 0, lifetime: sum(members.map((m) => m.lifetime)),
    churnRate: everPaid ? former.length / everPaid : null, medianActive, medianFormer, undated: members.length - known.length - other.length };
  const result = { summary, byTier, distribution, cohorts, survival, concentration, fees: { ...fees, assumptions: a, takePct }, net, atRiskMembers: declined.map((m) => ({ name: m.name, tier: m.tier, monthly: m.monthly, lastCharge: m.lastCharge, lastStatus: m.lastStatus })).sort((x, y) => y.monthly - x.monthly) };
  result.findings = findings(result);
  return result;
}

function findings(r) {
  const out = [];
  const s = r.summary, c = s.counts;
  const add = (severity, title, detail) => out.push({ severity, title, detail });
  const $ = (n) => "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const p = (n) => (n * 100).toFixed(0) + "%";
  if (c.declined > 0) {
    add(s.atRiskShare >= 0.05 ? "high" : "medium", `${c.declined} declined payment(s) put ${$(s.atRisk)} a month at risk`,
      `That is ${p(s.atRiskShare)} of what you would earn if they all recovered (${$(s.mrrIfRecovered)}). Patreon retries a failed card for a while and emails the patron; a personal note asking them to update the card is the cheapest recovery there is. Recovered payments need no new patron.`);
  }
  const weak = r.cohorts.filter((x) => x.enough).sort((x, y) => y.rate - x.rate)[0];
  if (weak && weak.rate >= 0.3) add("high", `Cohort “${weak.label}” has lost ${p(weak.rate)} of its patrons`, `${weak.former} of ${weak.joined} patrons who joined that long ago have left. Look at what happened to them in their first months: no post, a price change, or a perk that arrived late.`);
  const s3 = r.survival.find((x) => x.months === 3 && x.enough);
  if (s3 && s3.rate < 0.75) add("high", `Only ${p(s3.rate)} of patrons stay past three months`, `Of ${s3.eligible} who joined at least three months before the file's latest date, ${s3.kept} paid for three months or longer. A welcome post and an early exclusive are the usual fixes for an early drop-off.`);
  const cc = r.concentration;
  if (s.mrr > 0 && cc.top1 >= 0.2) add("high", `One patron is ${p(cc.top1)} of your monthly income`, "If that patron leaves, income drops by that share. Talk to them like the customer they are and look for a second tier at a similar price.");
  else if (s.mrr > 0 && cc.top5 >= 0.4) add("medium", `Your top 5 patrons are ${p(cc.top5)} of monthly income`, "Income is concentrated in a few patrons; a single cancellation is noticeable.");
  if (cc.topTier && cc.topTier.share >= 0.6 && r.byTier.filter((t) => t.mrr > 0).length > 1) add("info", `“${cc.topTier.tier}” brings in ${p(cc.topTier.share)} of monthly income`, `${cc.topTier.patrons} patrons pay it. Changes to that tier matter far more than changes to any other.`);
  const highTier = r.byTier.filter((t) => t.enough && t.churn !== null).sort((x, y) => y.churn - x.churn)[0];
  if (highTier && highTier.churn >= 0.4) add("medium", `Tier “${highTier.tier}” has the highest churn: ${p(highTier.churn)}`, `${highTier.former} of ${highTier.patrons + highTier.declined + highTier.former} patrons who chose it have left.`);
  if (s.mrr > 0) add("info", `Fees take about ${p(r.fees.takePct)} of monthly income`, `Estimated ${$(r.fees.total)} a month on ${$(s.mrr)}, leaving ${$(r.net)} before tax and currency conversion. This uses the fee assumptions you can edit above; check them against your own payout statement.`);
  if (s.perCreation > 0) add("info", `${s.perCreation} active patron(s) are billed per creation`, "Their monthly amount depends on what you post, so they are left out of monthly income and the fee estimate.");
  if (c.other > 0) add("info", `${c.other} row(s) are free members or have an unrecognised status`, "They are counted but not used in any paying-patron figure.");
  if (s.undated > 0) add("info", `${s.undated} paying or former patron(s) have no usable date`, "They are left out of tenure, cohort and survival figures.");
  if (!out.length || (out.length === 1 && out[0].severity === "info")) add("info", "Nothing stands out", "No declined payments, weak cohorts or concentration were found in this file.");
  return out;
}

export const money = (n) => (Number.isFinite(n) ? (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–");
export const pct = (n) => (Number.isFinite(n) && n !== null ? (n * 100).toFixed(0) + "%" : "–");
export const dateStr = (t) => new Date(t).toISOString().slice(0, 10);

// Synthetic members for the "Load an example" button: not a real account.
export function sampleCsv() {
  const lines = ["Name,Email,Patron Status,Follows You,Lifetime $,Currently Paying $,Tier,Pledge,Free Trial,Addressed,Max Posts,Patronage Since Date,Last Charge Date,Last Charge Status,Charge Frequency,Next Charge Date,Country"];
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const tiers = [["Supporter", 3, 0.6], ["Insider", 8, 0.28], ["Producer", 25, 0.1], ["Patron Saint", 100, 0.02]];
  const asOf = Date.UTC(2026, 8, 1);
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  for (let i = 1; i <= 120; i++) {
    let r = rnd(), tier = tiers[0];
    for (const t of tiers) { if (r < t[2]) { tier = t; break; } r -= t[2]; }
    const joinedMonthsAgo = Math.floor(rnd() * 30) + 1;
    const since = asOf - joinedMonthsAgo * 30.4375 * DAY;
    const early = joinedMonthsAgo > 3 && rnd() < 0.3;
    const roll = rnd();
    let status = "Active patron", last = asOf - Math.floor(rnd() * 25) * DAY, lastStatus = "Successful", paying = tier[1];
    if (roll > 0.94) { status = "Declined patron"; lastStatus = "Declined"; paying = 0; }
    else if (early || roll > 0.72) {
      status = "Former patron"; paying = 0;
      const stayed = early ? 1 + Math.floor(rnd() * 2) : 1 + Math.floor(rnd() * Math.max(1, joinedMonthsAgo - 1));
      last = since + Math.min(stayed, joinedMonthsAgo - 1) * 30.4375 * DAY;
    }
    const next = status === "Active patron" ? iso(last + 30 * DAY) : "";
    lines.push(`Patron ${i},patron${i}@example.org,${status},No,${(tier[1] * Math.min(joinedMonthsAgo, 12)).toFixed(2)},${paying.toFixed(2)},${tier[0]},${tier[1].toFixed(2)},No,No,,${iso(since)},${iso(last)},${lastStatus},Monthly,${next},US`);
  }
  return lines.join("\n") + "\n";
}
