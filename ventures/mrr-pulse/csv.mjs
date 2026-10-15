// Subscription CSV -> subs, for the browser demo and for `node import.mjs`.
// Reads the columns of Stripe's Subscriptions export (Dashboard > Billing >
// Subscriptions > Export) by header name, in any order, and amounts in major
// units (dollars), as that export writes them.
import { monthlyAmount } from "./metrics.mjs";

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
  status: ["status"],
  amount: ["amount", "plan amount", "price", "unit amount"],
  interval: ["interval", "plan interval", "billing interval"],
  intervalCount: ["interval count", "plan interval count"],
  quantity: ["quantity", "plan quantity", "seats"],
  currency: ["currency", "plan currency"],
  created: ["created", "start date", "start", "created utc"],
  endedAt: ["ended at", "ended", "canceled at", "cancelled at", "end date", "ended utc", "canceled at utc"],
};

// Dates without a zone (Stripe exports write UTC) are read as UTC.
const toMs = (v) => {
  const x = String(v || "").trim();
  if (!x) return null;
  const t = Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(x) ? x : `${x.replace(" ", "T")}${x.includes(":") ? "Z" : "T00:00:00Z"}`);
  return Number.isFinite(t) ? t : null;
};

// Returns {subs, skipped:[{line, why}], missing:[...]}.
export function subsFromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { subs: [], skipped: [], missing: ["header and at least one row"] };
  const head = rows[0].map(norm);
  const col = {};
  for (const [k, names] of Object.entries(ALIASES)) col[k] = head.findIndex((h) => names.includes(h));
  const missing = ["amount", "interval", "created"].filter((k) => col[k] < 0);
  if (missing.length) return { subs: [], skipped: [], missing };
  const subs = [], skipped = [];
  rows.slice(1).forEach((r, i) => {
    const get = (k) => (col[k] >= 0 ? (r[col[k]] ?? "").trim() : "");
    const amount = Number(get("amount").replace(/[$,£€\s]/g, ""));
    const created = toMs(get("created"));
    const interval = get("interval").toLowerCase();
    if (!Number.isFinite(amount) || amount < 0) return skipped.push({ line: i + 2, why: "amount is not a number" });
    if (created === null) return skipped.push({ line: i + 2, why: "created is not a date" });
    const mrr = monthlyAmount(Math.round(amount * 100), interval, Number(get("intervalCount")) || 1, get("quantity") === "" ? 1 : Number(get("quantity")));
    if (!mrr && amount > 0) return skipped.push({ line: i + 2, why: `unknown interval "${interval}"` });
    const endedAt = toMs(get("endedAt"));
    const status = (get("status") || (endedAt ? "canceled" : "active")).toLowerCase();
    subs.push({ id: get("id") || `row${i + 2}`, mrr, status, created, endedAt: status === "canceled" ? endedAt : null, currency: (get("currency") || "usd").toLowerCase() });
  });
  return { subs, skipped, missing: [] };
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
