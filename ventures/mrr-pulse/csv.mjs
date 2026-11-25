// Subscription CSV -> subs, for the browser demo.
// Reads the columns of Stripe's Subscriptions export (Dashboard > Billing >
// Subscriptions > Export) by header name, in any order, and amounts in major
// units (dollars), as that export writes them.
import { monthlyAmount, minorExponent, PER_MONTH } from "./metrics.mjs";

export function parseCsv(text) {
  const rows = []; let row = [], cur = "", q = false;
  const s = String(text).replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(cur); if (row.some((x) => x.trim())) rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  row.push(cur); if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const norm = (h) => String(h).toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const ALIASES = {
  id: ["id", "subscription id", "subscription"],
  customer: ["customer id", "customer", "customer email"],
  status: ["status"],
  amount: ["amount", "plan amount", "price", "unit amount"],
  interval: ["interval", "plan interval", "billing interval"],
  intervalCount: ["interval count", "plan interval count"],
  quantity: ["quantity", "plan quantity", "seats"],
  currency: ["currency", "plan currency"],
  created: ["created", "start date", "start", "created utc"],
  trialEnd: ["trial end", "trial ends", "trial end utc", "trial end date"],
  endedAt: ["ended at", "ended", "canceled at", "cancelled at", "end date", "ended utc", "canceled at utc"],
};

const STATUSES = new Set(["active", "past_due", "unpaid", "canceled", "incomplete", "incomplete_expired", "trialing", "paused"]);

// Dates without a zone (Stripe exports write UTC) are read as UTC.
const toMs = (v) => {
  const x = String(v || "").trim();
  if (!x) return null;
  // Date.parse rolls 2026-02-30 into 2 March: check the day exists (red team 2026-11-18).
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(x);
  if (ymd && +ymd[3] > new Date(Date.UTC(+ymd[1], +ymd[2], 0)).getUTCDate()) return null;
  const t = Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(x) ? x : `${x.replace(" ", "T")}${x.includes(":") ? "Z" : "T00:00:00Z"}`);
  return Number.isFinite(t) ? t : null;
};

// A money cell in major units. Commas in groups of three are thousands
// (1,200.50); a comma with one or two digits after it and no dot after it is a
// decimal comma (29,99 or 1.234,56, as an EU-locale sheet writes them). Any
// other comma is ambiguous and reads as NaN, so the row is skipped with a
// reason: stripping every comma read 29,99 as 2,999 (red team 2026-11-20).
const toAmount = (v) => {
  const x = String(v).replace(/[$£€\s]/g, "");
  if (!x.includes(",")) return x === "" ? NaN : Number(x);
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(x)) return Number(x.replace(/,/g, ""));
  if (/^-?(\d+|\d{1,3}(\.\d{3})+),\d{1,2}$/.test(x)) return Number(x.replace(/\./g, "").replace(",", "."));
  return NaN;
};

// Returns {subs, skipped:[{line, why}], missing:[...], currency}. Like the
// server, it keeps one currency, the most common (a tie goes to the first
// row's): adding yen to cents gave a headline in neither (red team 2026-11-19).
export function subsFromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { subs: [], skipped: [], missing: ["header and at least one row"], currency: "usd" };
  const head = rows[0].map(norm);
  const col = {};
  for (const [k, names] of Object.entries(ALIASES)) col[k] = (names.map((n) => head.indexOf(n)).find((i) => i >= 0) ?? -1);
  const missing = ["amount", "interval", "created"].filter((k) => col[k] < 0);
  if (missing.length) return { subs: [], skipped: [], missing, currency: "usd" };
  const subs = [], skipped = [], byId = new Map(), lineOf = new Map();
  rows.slice(1).forEach((r, i) => {
    const get = (k) => (col[k] >= 0 ? (r[col[k]] ?? "").trim() : "");
    const amount = toAmount(get("amount"));
    const created = toMs(get("created"));
    const interval = get("interval").toLowerCase();
    if (get("amount") === "") return skipped.push({ line: i + 2, why: "amount is empty" });
    if (!Number.isFinite(amount) || amount < 0) return skipped.push({ line: i + 2, why: "amount is not a number" });
    if (created === null) return skipped.push({ line: i + 2, why: "created is not a date" });
    const quantity = get("quantity") === "" ? 1 : Number(get("quantity"));
    if (!Number.isFinite(quantity) || quantity < 0) return skipped.push({ line: i + 2, why: "quantity is not a number" });
    // "3 months" or 0 fell back to 1, so a quarterly price read as monthly,
    // three times its MRR (red team 2026-11-20).
    const intervalCount = get("intervalCount") === "" ? 1 : Number(get("intervalCount"));
    if (!Number.isInteger(intervalCount) || intervalCount < 1) return skipped.push({ line: i + 2, why: "interval count is not a whole number" });
    const currency = (get("currency") || "usd").toLowerCase();
    const mrr = monthlyAmount(Math.round(amount * 10 ** minorExponent(currency)), interval, intervalCount, quantity);
    if (!Object.hasOwn(PER_MONTH, interval) && amount > 0) return skipped.push({ line: i + 2, why: `unknown interval "${interval}"` });
    // A filled-in date that does not parse must not read as "never ended" or
    // "no trial", and a canceled row with no end date cannot be placed in the
    // history (it would count as alive every month): flag both (red team 2026-11-18).
    const endedAt = toMs(get("endedAt"));
    if (get("endedAt") && endedAt === null) return skipped.push({ line: i + 2, why: "ended at is not a date" });
    if (get("trialEnd") && toMs(get("trialEnd")) === null) return skipped.push({ line: i + 2, why: "trial end is not a date" });
    // Stripe's statuses, read the way a hand-made sheet or another billing
    // tool writes them ("Cancelled", "Past due"). Any other word is skipped
    // with a reason: it matched no rule downstream, so the row vanished from
    // every month, its churn uncounted (red team 2026-11-19, second pass).
    const rawStatus = get("status").toLowerCase().replace(/[\s-]+/g, "_");
    const status = rawStatus ? (rawStatus === "cancelled" ? "canceled" : rawStatus) : endedAt ? "canceled" : "active";
    if (!STATUSES.has(status)) return skipped.push({ line: i + 2, why: `unknown status "${get("status")}"` });
    if (status === "canceled" && endedAt === null) return skipped.push({ line: i + 2, why: "canceled with no end date" });
    const sub = { id: get("id") || `row${i + 2}`, customer: get("customer") || null, mrr, status, created, endedAt: status === "canceled" ? endedAt : null, trialEnd: toMs(get("trialEnd")), currency };
    // A repeated id is another price line of the same subscription (an export
    // or a hand-made sheet with one row per item): add its MRR to the first
    // row's. Keyed maps downstream kept only the last line, so the headline
    // dropped money the plan breakdown still counted (red team 2026-11-19).
    // A repeat that disagrees on dates, status or currency cannot be merged.
    const first = byId.get(sub.id);
    if (first) {
      if (["status", "created", "endedAt", "trialEnd", "currency", "customer"].some((k) => first[k] !== sub[k])) return skipped.push({ line: i + 2, why: `repeats subscription ${sub.id} with a different start, end, trial, status, currency or customer` });
      first.mrr += sub.mrr;
      return;
    }
    byId.set(sub.id, sub);
    lineOf.set(sub, i + 2);
    subs.push(sub);
  });
  const counts = new Map();
  for (const s of subs) counts.set(s.currency, (counts.get(s.currency) || 0) + 1);
  let currency = "usd", best = 0;
  for (const [c, n] of counts) if (n > best) { currency = c; best = n; }
  for (const s of subs) if (s.currency !== currency) skipped.push({ line: lineOf.get(s), why: `in ${s.currency.toUpperCase()}, not ${currency.toUpperCase()} (one currency at a time)` });
  skipped.sort((a, b) => a.line - b.line);
  return { subs: subs.filter((s) => s.currency === currency), skipped, missing: [], currency };
}

// Deterministic demo data: a small SaaS that grew for 18 months with some churn.
export function sampleCsv(now = Date.UTC(2026, 9, 15)) {
  let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) % 10000) / 10000;
  const lines = ["id,status,amount,interval,created,ended at"];
  const plans = [[29, "month"], [79, "month"], [249, "month"], [290, "year"]];
  for (let i = 0; i < 160; i++) {
    const start = now - Math.floor(rnd() * 540) * 86400000;
    const [amt, iv] = plans[Math.floor(rnd() ** 2 * plans.length)];
    const churned = rnd() < 0.28 && now - start > 60 * 86400000;
    const end = churned ? start + Math.floor((60 + rnd() * (now - start - 59 * 86400000) / 86400000) * 86400000 * 0.9) : null;
    const f = (t) => new Date(t).toISOString().slice(0, 10);
    lines.push(`sub_demo${i},${churned ? "canceled" : "active"},${amt},${iv},${f(start)},${end ? f(end) : ""}`);
  }
  return lines.join("\n");
}
