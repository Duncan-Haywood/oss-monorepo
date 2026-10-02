// Zero-dependency, deterministic client-concentration analyzer. One row per
// invoice (client, optional date, amount) in; per-client revenue share, the
// top-1/3/5 shares, the Herfindahl index and "effective number of clients",
// what happens to revenue if the biggest client leaves, whether concentration
// is rising, and a list of findings out.
//
// What is arithmetic and what is a rule of thumb. Arithmetic: every share,
// the Herfindahl index (sum of squared shares x 10,000) and the effective
// client count (1 / sum of squared shares). Rules of thumb, NOT facts about
// your business: the 25% / 40% single-client and 60% / 80% top-three levels at
// which findings fire. Lenders, buyers and insurers each use their own lines;
// the levels here are common starting points and are inputs you can change.

export const MODEL_NOTE = "Shares are your own invoice totals; the warning levels (25% / 40% for one client, 60% / 80% for the top three) are common rules of thumb, not a standard any lender or buyer is bound by; invoice date, not payment date, is used; contract length, churn risk and how easily a client could be replaced are not modelled";
export const DEFAULTS = { warnTop1: 0.25, errorTop1: 0.4, warnTop3: 0.6, errorTop3: 0.8, monthlyCosts: null, windowMonths: 12, minRisePoints: 0.1 };

const toAmount = (s) => {
  const t = String(s ?? "").trim().replace(/^\(\s*(.*)\)$/, "-$1").replace(/^\$|^-\$/, (m) => (m === "-$" ? "-" : "")).replace(/,/g, "");
  const n = Number(t);
  return t !== "" && Number.isFinite(n) ? n : NaN;
};
const toDate = (s) => {
  const t = String(s ?? "").trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  let y, mo, d;
  if (m) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t))) [y, mo, d] = [+m[3], +m[1], +m[2]];
  else return null;
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  return back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d ? ms : null;
};
const HEADERS = { client: /^(client|customer|name|account|bill.?to|company)/i, amount: /^(amount|total|revenue|invoice.?amount|net|subtotal|value|paid)/i, date: /^(date|invoice.?date|issued|issue.?date|created)/i };

function splitLine(line) {
  const cells = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i += 1; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === "," || c === "\t") { cells.push(cur.trim()); cur = ""; } else cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

/** Parses `client,amount` or `client,date,amount`; a header row maps columns by name. */
export function parseInvoices(text) {
  const rows = [];
  let skipped = 0;
  let col = null;
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const cells = splitLine(line);
    if (!col && cells.some((c) => HEADERS.client.test(c)) && cells.some((c) => HEADERS.amount.test(c))) {
      col = { client: cells.findIndex((c) => HEADERS.client.test(c)), amount: cells.findIndex((c) => HEADERS.amount.test(c)), date: cells.findIndex((c) => HEADERS.date.test(c)) };
      continue;
    }
    if (!col) col = cells.length >= 3 ? { client: 0, date: 1, amount: 2 } : { client: 0, date: -1, amount: 1 };
    const client = (cells[col.client] ?? "").replace(/\s+/g, " ");
    const amount = toAmount(cells[col.amount]);
    if (!client || !Number.isFinite(amount) || amount === 0) { skipped += 1; continue; }
    const date = col.date >= 0 ? toDate(cells[col.date]) : null;
    rows.push({ client, key: client.toLowerCase(), amount, date });
  }
  rows.skipped = skipped;
  return rows;
}

const pct = (x) => `${(x * 100).toFixed(0)}%`;
const usd = (n) => {
  const format = (n) => `$${Math.round(n).toLocaleString("en-US")}`;
  const text = format(Math.abs(n));
  return n < 0 && /[1-9]/.test(text) ? `-${text}` : text;
};

function shares(rows) {
  const by = new Map();
  for (const r of rows) {
    const e = by.get(r.key) || { key: r.key, client: r.client, total: 0, invoices: 0 };
    e.total += r.amount;
    e.invoices += 1;
    by.set(r.key, e);
  }
  const list = [...by.values()].filter((e) => e.total > 0).sort((a, b) => b.total - a.total || a.client.localeCompare(b.client));
  const total = list.reduce((s, e) => s + e.total, 0);
  for (const e of list) e.share = total > 0 ? e.total / total : 0;
  return { list, total };
}

export function analyze(allRows, userOpts = {}) {
  const options = { ...DEFAULTS, ...userOpts };
  const skipped = allRows.skipped || 0;
  const dated = allRows.filter((r) => r.date !== null);
  let rows = allRows;
  let months = null;
  let windowNote = "all rows (no dates)";
  if (dated.length === rows.length && dated.length) {
    const last = Math.max(...dated.map((r) => r.date));
    const lastD = new Date(last);
    const start = Date.UTC(lastD.getUTCFullYear(), lastD.getUTCMonth() - options.windowMonths, lastD.getUTCDate() + 1);
    rows = rows.filter((r) => r.date >= start && r.date <= last);
    const first = Math.min(...rows.map((r) => r.date));
    months = Math.max(1, Math.min(options.windowMonths, ((last - first) / 86400000 + 1) / 30.44));
    windowNote = `last ${options.windowMonths} months up to ${new Date(last).toISOString().slice(0, 10)}`;
  }
  const { list, total } = shares(rows);
  const result = { options, skipped, count: rows.length, clients: list.length, total, list, months, windowNote, findings: [] };
  if (!list.length || total <= 0) { result.count = 0; return result; }

  const topN = (n) => list.slice(0, n).reduce((s, e) => s + e.share, 0);
  result.top1 = topN(1);
  result.top3 = topN(3);
  result.top5 = topN(5);
  const sumSq = list.reduce((s, e) => s + e.share * e.share, 0);
  result.hhi = Math.round(sumSq * 10000);
  result.effective = 1 / sumSq;
  result.monthlyRevenue = months ? total / months : null;

  // Revenue left if the largest client goes.
  result.withoutTop = total - list[0].total;
  result.withoutTopMonthly = months ? result.withoutTop / months : null;

  // Is concentration rising? Compare the largest client's share in the older
  // and newer half of the window, split at the date midpoint.
  if (months && months >= 4) {
    const ds = rows.map((r) => r.date);
    const mid = (Math.min(...ds) + Math.max(...ds)) / 2;
    const half = (pick) => {
      const part = rows.filter(pick);
      const t = part.reduce((s, r) => s + r.amount, 0);
      const top = part.filter((r) => r.key === list[0].key).reduce((s, r) => s + r.amount, 0);
      return t > 0 ? top / t : null;
    };
    const older = half((r) => r.date <= mid), newer = half((r) => r.date > mid);
    if (older !== null && newer !== null) result.trend = { older, newer, change: newer - older };
  }

  const f = result.findings;
  const o = options;
  const top = list[0];
  if (result.top1 >= o.errorTop1) f.push({ rule: "single-client-dependence", severity: "error", message: `${top.client} is ${pct(result.top1)} of revenue (${usd(top.total)} of ${usd(total)}). At or above ${pct(o.errorTop1)} one client leaving can end the business; lenders and buyers usually price this in.` });
  else if (result.top1 >= o.warnTop1) f.push({ rule: "single-client-dependence", severity: "warn", message: `${top.client} is ${pct(result.top1)} of revenue (${usd(top.total)} of ${usd(total)}), above the ${pct(o.warnTop1)} level most lenders and buyers start to ask about.` });
  if (result.clients >= 3) {
    if (result.top3 >= o.errorTop3) f.push({ rule: "top-three-dependence", severity: "error", message: `Your three largest clients are ${pct(result.top3)} of revenue, at or above ${pct(o.errorTop3)}.` });
    else if (result.top3 >= o.warnTop3) f.push({ rule: "top-three-dependence", severity: "warn", message: `Your three largest clients are ${pct(result.top3)} of revenue, above ${pct(o.warnTop3)}.` });
  }
  if (result.clients < 4 || result.effective < 3) f.push({ rule: "few-effective-clients", severity: result.effective < 2 ? "error" : "warn", message: `${result.clients} client(s) in the window, equivalent to ${result.effective.toFixed(1)} equally sized clients (Herfindahl index ${result.hhi}).` });
  if (o.monthlyCosts > 0 && result.withoutTopMonthly !== null) {
    const gap = o.monthlyCosts - result.withoutTopMonthly;
    if (gap > 0) f.push({ rule: "loses-money-without-top-client", severity: "error", message: `Without ${top.client}, average monthly revenue falls to ${usd(result.withoutTopMonthly)} against ${usd(o.monthlyCosts)} of monthly costs: a gap of ${usd(gap)} a month.` });
    else f.push({ rule: "covers-costs-without-top-client", severity: "info", message: `Without ${top.client}, average monthly revenue of ${usd(result.withoutTopMonthly)} still covers ${usd(o.monthlyCosts)} of monthly costs, with ${usd(-gap)} a month to spare.` });
  }
  if (result.trend && result.trend.change >= o.minRisePoints) f.push({ rule: "concentration-rising", severity: "warn", message: `${top.client}'s share rose from ${pct(result.trend.older)} to ${pct(result.trend.newer)} between the older and newer half of the window; you are getting more dependent, not less.` });
  const tail = list.filter((e) => e.share < 0.02).length;
  if (tail >= 3) f.push({ rule: "long-tail", severity: "info", message: `${tail} clients are each under 2% of revenue; together ${pct(list.filter((e) => e.share < 0.02).reduce((s, e) => s + e.share, 0))}. Often small jobs that cost as much to serve as they earn.` });
  return result;
}

export function summarize(report) {
  if (!report.count) return { status: "none", errors: 0, warns: 0, text: "No invoice rows could be read. Use client,amount or client,date,amount per line." };
  const errors = report.findings.filter((x) => x.severity === "error").length;
  const warns = report.findings.filter((x) => x.severity === "warn").length;
  const head = `${report.clients} client(s), ${usd(report.total)} over ${report.windowNote}: top client ${pct(report.top1)}, top three ${pct(report.top3)}, effective ${report.effective.toFixed(1)} equal clients.`;
  if (errors) return { status: "error", errors, warns, text: `${head} ${errors} serious concentration finding(s).` };
  if (warns) return { status: "warn", errors, warns, text: `${head} ${warns} concentration warning(s).` };
  return { status: "ok", errors, warns, text: `${head} No concentration warnings at the levels used.` };
}

export const INPUT_NOTES = [
  { what: "client,amount", detail: "One invoice per line; amounts for the same client name (case-insensitive) are added together." },
  { what: "client,date,amount", detail: "Dates as 2026-03-14 or 3/14/2026. With dates the last 12 months are used and a rising-dependence check runs." },
  { what: "header row", detail: "Columns found by name (client/customer/name, date, amount/total/revenue), so an accounting export can be pasted as it is." },
  { what: "negative amounts", detail: "Credit notes reduce a client's total; zero and unreadable lines are skipped and counted." },
];
