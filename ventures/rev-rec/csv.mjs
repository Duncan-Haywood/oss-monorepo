// Invoice-line CSV -> lines, for the browser demo. Columns by header name, any
// order, amounts in major units, scaled by the row currency's minor unit
// (minorExponent). Needs amount, period start and a billing date.
import { minorExponent } from "./revrec.mjs";

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
  id: ["id", "invoice id", "invoice", "line id"],
  amount: ["amount", "line amount", "total", "net amount"],
  billed: ["date", "paid", "paid at", "billed", "invoice date", "created", "date utc", "invoice date utc"],
  start: ["period start", "service start", "start", "period start utc"],
  end: ["period end", "service end", "end", "period end utc"],
  currency: ["currency"],
  credits: ["credits", "credits line", "invoice line item", "credited line"],
};
// Major-unit amount -> number. "1,234.50" and "1.234,50" both read 1234.5: a comma
// followed by one or two final digits is a decimal comma (a thousands group is
// always three digits), so a European export is not read 100 times too large.
// Any currency sign (\p{Sc}: ¥, ₹, ₩, R$ ...) and a currency code or abbreviation
// on either side ("USD 100", "100 CHF", "kr 99") are dropped; only $, £, € and a
// trailing code were, so a yen or rupee export was skipped row by row (red team
// 2026-11-18, second run). Letters inside the number still make it NaN.
const plainAmount = (v) => {
  const x = String(v).replace(/[\p{Sc}()\s]/gu, "").replace(/^([+-]?)\p{L}{1,3}(?=[\d.,+-])/u, "$1").replace(/(?<=[\d.,])\p{L}{2,3}$/u, "");
  return /,\d{1,2}$/.test(x) ? x.replace(/\./g, "").replace(",", ".") : x.replace(/,/g, "");
};
export function parseAmount(v) {
  const x = plainAmount(v);
  return x ? Number(x) : NaN;
}
// True when the amount is written with more decimals than the currency has and
// they could matter: a non-zero extra digit ("100.5" yen), or exactly three
// ("1.000", which a European export means as a thousand). Padding zeros such
// as "5000.00" yen are fine.
export function tooPrecise(v, exponent) {
  const f = /\.(\d+)$/.exec(plainAmount(v))?.[1] ?? "";
  const extra = f.slice(exponent);
  return extra !== "" && (f.length === 3 || /[^0]/.test(extra));
}
const toMs = (v) => {
  const x = String(v || "").trim();
  if (!x) return null;
  // Date.parse rolls 2026-02-30 into 2 March: check the day exists (red team 2026-11-18).
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(x);
  if (ymd && +ymd[3] > new Date(Date.UTC(+ymd[1], +ymd[2], 0)).getUTCDate()) return null;
  const t = Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(x) ? x : `${x.replace(" ", "T")}${x.includes(":") ? "Z" : "T00:00:00Z"}`);
  return Number.isFinite(t) ? t : null;
};

export function linesFromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { lines: [], skipped: [], missing: ["header and at least one row"] };
  const head = rows[0].map(norm), col = {};
  for (const [k, names] of Object.entries(ALIASES)) col[k] = (names.map((n) => head.indexOf(n)).find((i) => i >= 0) ?? -1);
  const missing = ["amount", "billed", "start"].filter((k) => col[k] < 0);
  if (missing.length) return { lines: [], skipped: [], missing };
  const lines = [], skipped = [];
  rows.slice(1).forEach((r, i) => {
    const get = (k) => (col[k] >= 0 ? (r[col[k]] ?? "").trim() : "");
    if (!get("amount")) return skipped.push({ line: i + 2, why: "amount is blank" });
    const neg = /\([^()]*\d[^()]*\)/.test(get("amount")); // "($5)", "$(5)" (Excel accounting) and "(5) USD" alike
    const raw = parseAmount(get("amount"));
    const billedAt = toMs(get("billed")), start = toMs(get("start"));
    if (!Number.isFinite(raw)) return skipped.push({ line: i + 2, why: "amount is not a number" });
    if (billedAt === null) return skipped.push({ line: i + 2, why: "billing date is not a date" });
    if (start === null) return skipped.push({ line: i + 2, why: "period start is not a date" });
    // A blank end is a one-off charge; a typo in a filled-in end must not be one,
    // or a year's term is recognised on day one with nothing flagged.
    const end = get("end") ? toMs(get("end")) : start;
    if (end === null) return skipped.push({ line: i + 2, why: "period end is not a date" });
    if (end < start) return skipped.push({ line: i + 2, why: "period end is before period start" });
    const currency = (get("currency") || "usd").toLowerCase();
    // More decimals than the currency has ("€ 1.000", a European thousand) would be
    // rounded away silently, so flag the row instead of guessing (red team 2026-11-18).
    if (tooPrecise(get("amount"), minorExponent(currency))) return skipped.push({ line: i + 2, why: `amount has more decimals than ${currency.toUpperCase()} allows (is . a thousands separator?)` });
    lines.push({ id: get("id") || `row${i + 2}`, billedAt, start, end, amount: Math.round((neg ? -raw : raw) * 10 ** minorExponent(currency)), currency, ...(get("credits") ? { credits: get("credits") } : {}) });
  });
  return { lines, skipped, missing: [] };
}

// One currency per schedule, like the server: keep the most common one and count
// the lines left out, so a mixed export never sums dollars and euros together.
export function oneCurrency(lines) {
  const counts = {};
  for (const l of lines) counts[l.currency] = (counts[l.currency] || 0) + 1;
  const currency = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "usd";
  const left = Object.fromEntries(Object.entries(counts).filter(([c]) => c !== currency));
  return { currency, lines: lines.filter((l) => l.currency === currency), left };
}

// Deterministic demo: monthly and annual plans over ~18 months, one refund.
export function sampleCsv(now = Date.UTC(2026, 9, 15)) {
  const f = (t) => new Date(t).toISOString().slice(0, 10);
  const out = ["id,date,period start,period end,amount"];
  const DAY = 86400000; let n = 0;
  for (let i = 0; i < 40; i++) {
    const start = now - (30 + ((i * 53) % 480)) * DAY, annual = i % 4 === 0, price = annual ? 290 : [29, 79, 249][i % 3];
    // Bill on the start date's day each period, clamped to short months the way Stripe anchors a
    // subscription (31 Jan, 28 Feb, 31 Mar), so no period is "31 Jan to 3 Mar".
    const s0 = new Date(start), step = annual ? 12 : 1;
    const at = (k) => {
      const y = s0.getUTCFullYear(), mo = s0.getUTCMonth() + k * step;
      return Date.UTC(y, mo, Math.min(s0.getUTCDate(), new Date(Date.UTC(y, mo + 1, 0)).getUTCDate()));
    };
    for (let k = 0, t = start; t < now; k++) {
      const next = at(k + 1);
      out.push(`il_${++n},${f(t)},${f(t)},${f(next)},${price}`); t = next;
    }
  }
  out.push(`il_${++n},${f(now - 20 * DAY)},${f(now - 20 * DAY)},${f(now - 20 * DAY)},(79)`);
  return out.join("\n");
}
