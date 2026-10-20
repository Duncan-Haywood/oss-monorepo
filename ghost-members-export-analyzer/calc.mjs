// Member, conversion, engagement and list-cost analysis from a Ghost "members"
// export CSV. Ghost's export has one row per member: email, name, note,
// subscribed_to_emails, complimentary_plan, stripe_customer_id, created_at,
// deleted_at, labels, tiers, email_count, email_opened_count, email_open_rate.
// Column names are matched by alias from memory of Ghost exports; no real export
// was available when this was written. The export carries no prices and no
// billing history, so revenue and savings use figures the user types. Pure
// functions, no DOM, no network.

const ALIASES = {
  email: ["email", "email address"],
  name: ["name"],
  subscribed: ["subscribed_to_emails", "subscribed to emails", "subscribed", "email subscribed"],
  comp: ["complimentary_plan", "complimentary plan", "complimentary", "comped"],
  stripe: ["stripe_customer_id", "stripe customer id", "stripe customer"],
  created: ["created_at", "created", "created at", "signup date", "joined", "subscribed at", "subscribed_at"],
  deleted: ["deleted_at", "deleted", "deleted at"],
  labels: ["labels", "label"],
  tiers: ["tiers", "tier", "products", "product"],
  sent: ["email_count", "email count", "emails sent", "emails received"],
  opened: ["email_opened_count", "email opened count", "emails opened"],
  rate: ["email_open_rate", "email open rate", "open rate"],
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
export const MIN_GROUP = 5;
export const DEFAULT_ASSUMPTIONS = Object.freeze({
  monthlyPrice: 8, processingPct: 2.9, processingFixed: 0.3,
  minSends: 10, quietDays: 90, sendsPerMonth: 4, costPer1000Emails: 1, planCostPerMonth: 0, planMemberLimit: 0,
});

const isBlank = (s) => s === "" || /^[-–—\s]+$/.test(s);
const truthy = (s) => /^(true|yes|y|1|t)$/i.test(String(s ?? "").trim());
const falsy = (s) => /^(false|no|n|0|f)$/i.test(String(s ?? "").trim());
const ym = (t) => new Date(t).toISOString().slice(0, 7);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

// Returns { members, skipped, columns, dmy, error }. A member is { line, comp, paid,
// tiers[], labels[], subscribed (true/false/null), created, deleted, sent, opened,
// openRate (0..1 or null) }. Emails and names are read only to drop empty rows and
// are not kept.
export function normalizeRows(table) {
  const empty = { members: [], skipped: [], columns: {}, dmy: false };
  if (!table.length) return { ...empty, error: "The file is empty." };
  let h = -1;
  for (let i = 0; i < Math.min(table.length, 10); i++) {
    const c = findColumns(table[i]);
    if (c.email !== undefined && (c.created !== undefined || c.stripe !== undefined || c.sent !== undefined || c.subscribed !== undefined)) { h = i; break; }
  }
  if (h < 0) return { ...empty, error: "No header row found. Expected the Ghost members export columns, such as “email”, “created_at”, “subscribed_to_emails”, “stripe_customer_id”, “labels”, “email_count” and “email_opened_count”. Export from Ghost Admin (Members, the export button) or make a sheet with those headers." };
  const cols = findColumns(table[h]);
  const get = (line, f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
  const dmy = detectDmy(table.slice(h + 1).flatMap((l) => [get(l, "created"), get(l, "deleted")]));
  const members = [], skipped = [];
  for (let i = h + 1; i < table.length; i++) {
    const line = table[i];
    const lineNo = i + 1;
    const first = String(line[0] ?? "").trim().toLowerCase();
    if (/^(total|totals|subtotal|grand total|summary)\b/.test(first)) { skipped.push({ line: lineNo, reason: "total row" }); continue; }
    if (!get(line, "email") && !get(line, "created")) { skipped.push({ line: lineNo, reason: "empty row" }); continue; }
    const comp = get(line, "comp");
    const isComp = !isBlank(comp) && !falsy(comp);
    const tiers = get(line, "tiers").split(/[,;|]/).map((t) => t.trim()).filter(Boolean);
    const paid = !isComp && (!isBlank(get(line, "stripe")) || tiers.length > 0);
    const labels = get(line, "labels").split(/[,;|]/).map((t) => t.trim()).filter(Boolean);
    const sub = get(line, "subscribed");
    const sentN = parseNumber(get(line, "sent"));
    const openedN = parseNumber(get(line, "opened"));
    const rateN = parseNumber(get(line, "rate"));
    const sent = Number.isFinite(sentN) && !isBlank(get(line, "sent")) ? sentN : null;
    const opened = Number.isFinite(openedN) && !isBlank(get(line, "opened")) ? openedN : null;
    // Prefer counts. A bare rate is a percentage in Ghost's export; a value of 1 or
    // below with a decimal point is read as a fraction.
    let openRate = null;
    if (sent !== null && sent > 0 && opened !== null) openRate = Math.min(1, opened / sent);
    else if (!isBlank(get(line, "rate")) && Number.isFinite(rateN)) openRate = /\./.test(get(line, "rate")) && rateN <= 1 ? rateN : Math.min(1, rateN / 100);
    members.push({
      line: lineNo, comp: isComp, paid, tiers, labels,
      subscribed: truthy(sub) ? true : falsy(sub) ? false : null,
      created: parseWhen(get(line, "created"), dmy), deleted: parseWhen(get(line, "deleted"), dmy),
      sent, opened, openRate,
    });
  }
  if (!members.length) return { ...empty, columns: cols, dmy, skipped, error: "No usable rows: every row was skipped." };
  return { members, skipped, columns: cols, dmy };
}

export const ENGAGEMENT_BANDS = [
  { key: "never", label: "Never opened" },
  { key: "low", label: "Low (under 20%)" },
  { key: "mid", label: "Some (20% to 59%)" },
  { key: "high", label: "Engaged (60% or more)" },
];

const bandOf = (rate) => (rate <= 0 ? "never" : rate < 0.2 ? "low" : rate < 0.6 ? "mid" : "high");

export function analyze(members, opts = {}) {
  const a = { ...DEFAULT_ASSUMPTIONS };
  for (const k of Object.keys(a)) if (opts[k] !== undefined && opts[k] !== null && opts[k] !== "") a[k] = Number(opts[k]);
  if (Object.values(a).some((v) => !Number.isFinite(v) || v < 0) || a.processingPct >= 100) return { invalid: "Prices, costs and counts must be non-negative numbers, with the processing fee under 100%." };

  const dated = members.flatMap((m) => [m.created, m.deleted]).filter((t) => t !== null);
  const asOf = opts.asOf ?? (dated.length ? Math.max(...dated) : Date.now());
  const removed = members.filter((m) => m.deleted !== null && m.deleted <= asOf);
  const live = members.filter((m) => !(m.deleted !== null && m.deleted <= asOf));
  const paid = live.filter((m) => m.paid), comp = live.filter((m) => m.comp), free = live.filter((m) => !m.paid && !m.comp);
  const counts = { total: live.length, paid: paid.length, comp: comp.length, free: free.length, removed: removed.length };
  const nonComp = live.length - comp.length;

  // Revenue: the export has no prices, so one typed monthly price applies to every paid member.
  const mrr = paid.length * a.monthlyPrice;
  const processing = mrr * a.processingPct / 100 + (paid.length ? a.processingFixed * paid.length : 0);
  const net = mrr - processing;
  const tierMap = new Map();
  for (const m of paid) for (const t of (m.tiers.length ? m.tiers : ["(paid, no tier named)"])) tierMap.set(t, (tierMap.get(t) ?? 0) + 1);
  const byTier = [...tierMap.entries()].map(([tier, members]) => ({ tier, members })).sort((x, y) => y.members - x.members || x.tier.localeCompare(y.tier));

  // Engagement: only members who were sent at least minSends emails can be judged.
  const judged = live.filter((m) => m.openRate !== null && (m.sent === null || m.sent >= a.minSends));
  const bandCounts = ENGAGEMENT_BANDS.map((b) => ({ ...b, count: 0, paid: 0 }));
  for (const m of judged) { const b = bandCounts.find((x) => x.key === bandOf(m.openRate)); b.count += 1; if (m.paid) b.paid += 1; }
  const unsubscribed = live.filter((m) => m.subscribed === false);
  const unsubFree = unsubscribed.filter((m) => !m.paid && !m.comp);

  // Prune candidates: free members sent plenty of email who never opened one, joined
  // more than quietDays ago, plus free members who unsubscribed from email. Paid and comp
  // members are never listed.
  const quiet = free.filter((m) => m.subscribed !== false && m.sent !== null && m.sent >= a.minSends && m.openRate !== null && m.openRate <= 0 && (m.created === null || asOf - m.created > a.quietDays * DAY));
  const prune = quiet.length + unsubFree.length;
  const emailsWasted = quiet.length * a.sendsPerMonth;
  const emailSavings = emailsWasted / 1000 * a.costPer1000Emails;
  const perMember = a.planMemberLimit > 0 ? a.planCostPerMonth / a.planMemberLimit : 0;
  const planSavings = prune * perMember;

  // Paid prospects: free, still subscribed, opening most of what they are sent.
  const prospects = free.filter((m) => m.subscribed !== false && m.openRate !== null && m.openRate >= 0.6 && (m.sent === null || m.sent >= a.minSends));
  const perPercent = a.monthlyPrice * prospects.length / 100;

  // Growth by signup month, last 12 months with data; removals when the file has them.
  const months = new Map();
  const bump = (t, k) => { if (t === null) return; const key = ym(t); const g = months.get(key) ?? { month: key, joined: 0, paid: 0, removed: 0 }; g[k] += 1; months.set(key, g); };
  for (const m of members) { if (!m.comp) bump(m.created, "joined"); if (m.paid) bump(m.created, "paid"); if (m.deleted !== null) bump(m.deleted, "removed"); }
  const growth = [...months.values()].sort((x, y) => x.month.localeCompare(y.month)).slice(-12);

  // Labels usually record where a member came from, so conversion and engagement by label
  // show which sources are worth more. Groups under MIN_GROUP are shown but marked small.
  const labelMap = new Map();
  for (const m of live) for (const l of new Set(m.labels)) {
    const g = labelMap.get(l) ?? { label: l, members: 0, paid: 0, judged: 0, never: 0 };
    g.members += 1; if (m.paid) g.paid += 1;
    if (judged.includes(m)) { g.judged += 1; if (m.openRate <= 0) g.never += 1; }
    labelMap.set(l, g);
  }
  const byLabel = [...labelMap.values()].map((g) => ({ ...g, conversion: g.members ? g.paid / g.members : null, neverShare: g.judged ? g.never / g.judged : null, enough: g.members >= MIN_GROUP })).sort((x, y) => y.members - x.members || x.label.localeCompare(y.label)).slice(0, 12);

  const summary = {
    asOf, counts, mrr, arr: mrr * 12, net, processing,
    conversion: nonComp ? paid.length / nonComp : null,
    judged: judged.length, unjudged: live.length - judged.length,
    unsubscribed: unsubscribed.length, quiet: quiet.length, unsubFree: unsubFree.length, prune,
    emailsWasted, emailSavings, planSavings, perMember,
    prospects: prospects.length, perPercent,
    undated: live.filter((m) => m.created === null).length,
    hasEngagement: judged.length > 0, hasDeleted: removed.length > 0,
  };
  const result = { summary, byTier, bands: bandCounts, growth, byLabel, assumptions: a };
  result.findings = findings(result);
  return result;
}

function findings(r) {
  const out = [];
  const s = r.summary, c = s.counts, a = r.assumptions;
  const add = (severity, title, detail) => out.push({ severity, title, detail });
  const $ = (n) => "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const p = (n) => (n * 100).toFixed(0) + "%";
  if (!s.hasEngagement) add("medium", "This file has no email open data", "Ghost only records opens when email open tracking is on. Without email_count and email_opened_count the tool cannot tell active members from inactive ones, so the engagement and clean-up sections are empty.");
  const never = r.bands.find((b) => b.key === "never");
  if (s.hasEngagement && s.judged >= 20 && never.count / s.judged >= 0.25) add("high", `${p(never.count / s.judged)} of judged members have never opened an email`, `${never.count} of ${s.judged} members sent at least ${a.minSends} emails have opened none. They still count toward your member total, and mail that nobody opens can push your sending reputation down and more of your real readers into spam. Open tracking can undercount (some mail apps block it), so email them once before removing anyone.`);
  if (s.quiet > 0) add("medium", `${s.quiet} free member(s) look safe to remove after a re-engagement email`, `Free, still subscribed, sent at least ${a.minSends} emails, opened none, joined over ${a.quietDays} days before the file's latest date. Cutting them saves about ${s.emailsWasted.toLocaleString("en-US")} sends a month (${$(s.emailSavings)} at ${$(a.costPer1000Emails)} per 1,000)${s.perMember > 0 ? ` and, at ${$(s.perMember)} per member on your plan, about ${$(s.planSavings)} a month in member-based pricing` : ""}. Paid and complimentary members are never listed.`);
  if (s.unsubFree > 0) add("info", `${s.unsubFree} free member(s) have unsubscribed from email`, "They cannot be reached by newsletter and still count as members. Ghost keeps them so their account, comments and sign-in still work; removing them is your call.");
  if (s.prospects > 0) add("info", `${s.prospects} highly engaged free member(s) are your best paid prospects`, `They open 60% or more of what they are sent. Every 1% of them who upgrade at ${$(a.monthlyPrice)} a month is about ${$(s.perPercent)} a month.`);
  if (c.total >= 20 && s.conversion !== null && s.conversion < 0.03) add("medium", `Free-to-paid conversion is ${(s.conversion * 100).toFixed(1)}%`, `${c.paid} of ${c.total - c.comp} members pay. Rates around 5 to 10% are commonly quoted for paid newsletters, though that varies a great deal by niche and this file cannot tell you yours is low.`);
  const best = r.byLabel.filter((g) => g.enough && g.conversion !== null).sort((x, y) => y.conversion - x.conversion)[0];
  const worst = r.byLabel.filter((g) => g.enough && g.judged >= MIN_GROUP && g.neverShare !== null).sort((x, y) => y.neverShare - x.neverShare)[0];
  if (best && best.paid > 0 && s.conversion !== null && best.conversion > s.conversion * 1.5) add("info", `Members labelled “${best.label}” convert best: ${p(best.conversion)}`, `${best.paid} of ${best.members} pay, against ${p(s.conversion)} overall. If the label records where they signed up, that source is worth more of your effort.`);
  if (worst && worst.neverShare >= 0.4) add("info", `${p(worst.neverShare)} of members labelled “${worst.label}” have never opened`, `${worst.never} of ${worst.judged} judged members with this label. If it marks an import or a signup source, the list may be stale or low-intent.`);
  if (s.mrr > 0) add("info", `About ${$(s.mrr)} a month from ${c.paid} paid member(s)`, `Uses the single monthly price you typed for every paid member, so treat it as a rough figure. After Stripe processing (${a.processingPct}% plus ${$(a.processingFixed)}) about ${$(s.net)} remains before tax. Ghost itself takes no cut of membership revenue.`);
  if (c.comp > 0) add("info", `${c.comp} complimentary member(s) are excluded from revenue and conversion`, "They count as members but not as paid.");
  if (s.undated > 0) add("info", `${s.undated} row(s) have no usable signup date`, "They are left out of the growth table and are never treated as recent signups.");
  if (!out.length || (out.length === 1 && out[0].severity === "info")) add("info", "Nothing stands out", "No inactive-list or conversion problem was found in this file.");
  return out;
}

export const money = (n) => (Number.isFinite(n) ? (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–");
export const pct = (n) => (Number.isFinite(n) && n !== null ? (n * 100).toFixed(0) + "%" : "–");
export const dateStr = (t) => new Date(t).toISOString().slice(0, 10);

// Synthetic members for the "Load an example" button: not a real publication.
export function sampleCsv() {
  const lines = ["id,email,name,note,subscribed_to_emails,complimentary_plan,stripe_customer_id,created_at,deleted_at,labels,tiers,email_count,email_opened_count,email_open_rate"];
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const asOf = Date.UTC(2026, 8, 1);
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const sources = ["twitter", "search", "referral", "import", "podcast"];
  for (let i = 1; i <= 500; i++) {
    const agoDays = Math.floor(rnd() * 800) + 1;
    const src = sources[Math.floor(rnd() * sources.length)];
    const r = rnd();
    const sent = Math.min(80, Math.floor(agoDays / 7));
    const paid = r < (src === "referral" ? 0.16 : src === "import" ? 0.01 : 0.06);
    const comp = !paid && r > 0.995;
    const base = src === "import" ? 0.05 : paid ? 0.85 : 0.35;
    const rate = Math.min(1, Math.max(0, base + (rnd() - 0.5) * 0.7 - (rnd() < 0.25 && !paid ? base : 0)));
    const opened = Math.round(sent * rate);
    const subscribed = paid || rnd() > 0.06 ? "true" : "false";
    lines.push(`m${i},reader${i}@example.org,,,${subscribed},${comp ? "true" : "false"},${paid ? "cus_" + i : ""},${iso(asOf - agoDays * DAY)},,${src},${paid ? "Supporter" : comp ? "Supporter" : ""},${sent},${opened},${sent ? Math.round(opened / sent * 100) : 0}`);
  }
  return lines.join("\n") + "\n";
}
