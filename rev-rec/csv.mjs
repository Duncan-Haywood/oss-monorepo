// Invoice-line CSV -> lines, for the browser demo. Columns by header name, any
// order, amounts in major units. Needs amount, period start and a billing date.
export function parseCsv(text) {
  const rows = []; let row = [], cur = "", q = false;
  const s = String(text).replace(/^﻿/, "");
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
  id: ["id", "invoice id", "invoice", "line id"],
  amount: ["amount", "line amount", "total", "net amount"],
  billed: ["date", "paid", "paid at", "billed", "invoice date", "created", "date utc", "invoice date utc"],
  start: ["period start", "service start", "start", "period start utc"],
  end: ["period end", "service end", "end", "period end utc"],
  currency: ["currency"],
};
const toMs = (v) => {
  const x = String(v || "").trim();
  if (!x) return null;
  const t = Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(x) ? x : `${x.replace(" ", "T")}${x.includes(":") ? "Z" : "T00:00:00Z"}`);
  return Number.isFinite(t) ? t : null;
};

export function linesFromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { lines: [], skipped: [], missing: ["header and at least one row"] };
  const head = rows[0].map(norm), col = {};
  for (const [k, names] of Object.entries(ALIASES)) col[k] = head.findIndex((h) => names.includes(h));
  const missing = ["amount", "billed", "start"].filter((k) => col[k] < 0);
  if (missing.length) return { lines: [], skipped: [], missing };
  const lines = [], skipped = [];
  rows.slice(1).forEach((r, i) => {
    const get = (k) => (col[k] >= 0 ? (r[col[k]] ?? "").trim() : "");
    const neg = /^\(.*\)$/.test(get("amount"));
    const raw = Number(get("amount").replace(/[$,£€()\s]/g, ""));
    const billedAt = toMs(get("billed")), start = toMs(get("start"));
    if (!Number.isFinite(raw)) return skipped.push({ line: i + 2, why: "amount is not a number" });
    if (billedAt === null) return skipped.push({ line: i + 2, why: "billing date is not a date" });
    if (start === null) return skipped.push({ line: i + 2, why: "period start is not a date" });
    const end = toMs(get("end")) ?? start;
    if (end < start) return skipped.push({ line: i + 2, why: "period end is before period start" });
    lines.push({ id: get("id") || `row${i + 2}`, billedAt, start, end, amount: Math.round((neg ? -raw : raw) * 100), currency: (get("currency") || "usd").toLowerCase() });
  });
  return { lines, skipped, missing: [] };
}

// Deterministic demo: monthly and annual plans over ~18 months, one refund.
export function sampleCsv(now = Date.UTC(2026, 9, 15)) {
  const f = (t) => new Date(t).toISOString().slice(0, 10);
  const out = ["id,date,period start,period end,amount"];
  const DAY = 86400000; let n = 0;
  for (let i = 0; i < 40; i++) {
    const start = now - (30 + ((i * 53) % 480)) * DAY, annual = i % 4 === 0, price = annual ? 290 : [29, 79, 249][i % 3];
    for (let t = start; t < now; ) {
      const d = new Date(t), next = annual ? Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()) : Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
      out.push(`il_${++n},${f(t)},${f(t)},${f(next)},${price}`); t = next;
    }
  }
  out.push(`il_${++n},${f(now - 20 * DAY)},${f(now - 20 * DAY)},${f(now - 20 * DAY)},(79)`);
  return out.join("\n");
}
