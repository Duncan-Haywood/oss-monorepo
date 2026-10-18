// UK crypto capital gains: HMRC share-matching rules applied to cryptoassets.
//
// HMRC's Cryptoassets Manual (CRYPTO22200 onwards) matches each day's disposals
// of one asset against, in this order:
//   1. acquisitions of the same asset on the same day,
//   2. acquisitions in the following 30 days ("bed and breakfasting"), earliest first,
//   3. the Section 104 pool: one running total of units and allowable cost per asset.
// Everything here is arithmetic on figures the user types. No prices are fetched.

const EPS = 1e-9;

/**
 * Rates and allowances per UK tax year (6 April to 5 April). `bands` are the
 * rate periods inside the year: the main rates for 2024-25 changed on 30 October
 * 2024, so that year has two. `aea` is the annual exempt amount; `basic` is the
 * basic-rate band that gains share with taxable income.
 */
export const TAX_YEARS = {
  "2021-22": { start: "2021-04-06", end: "2022-04-05", aea: 12300, basic: 37700, bands: [{ from: "2021-04-06", basic: 0.1, higher: 0.2 }] },
  "2022-23": { start: "2022-04-06", end: "2023-04-05", aea: 12300, basic: 37700, bands: [{ from: "2022-04-06", basic: 0.1, higher: 0.2 }] },
  "2023-24": { start: "2023-04-06", end: "2024-04-05", aea: 6000, basic: 37700, bands: [{ from: "2023-04-06", basic: 0.1, higher: 0.2 }] },
  "2024-25": {
    start: "2024-04-06", end: "2025-04-05", aea: 3000, basic: 37700,
    bands: [{ from: "2024-04-06", basic: 0.1, higher: 0.2 }, { from: "2024-10-30", basic: 0.18, higher: 0.24 }],
  },
  "2025-26": { start: "2025-04-06", end: "2026-04-05", aea: 3000, basic: 37700, bands: [{ from: "2025-04-06", basic: 0.18, higher: 0.24 }] },
  // Assumes the 2025-26 rules carry over; check HMRC before relying on it.
  "2026-27": { start: "2026-04-06", end: "2027-04-05", aea: 3000, basic: 37700, bands: [{ from: "2026-04-06", basic: 0.18, higher: 0.24 }] },
};

export function taxYearOf(date) {
  for (const [name, y] of Object.entries(TAX_YEARS)) if (date >= y.start && date <= y.end) return name;
  const yr = Number(date.slice(0, 4));
  const y = date >= `${yr}-04-06` ? yr : yr - 1;
  return `${y}-${String(y + 1).slice(2)}`;
}

export const round2 = (n) => Math.round((n + Number.EPSILON * Math.sign(n)) * 100) / 100;

const dayDiff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

// ---------------------------------------------------------------------------
// CSV in

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  const s = String(text ?? "").replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

const norm = (h) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const ALIASES = {
  date: ["date", "timestamp", "time", "datetime", "date utc", "transaction date"],
  type: ["type", "transaction type", "operation", "action", "side"],
  asset: ["asset", "coin", "currency", "token", "symbol", "from asset", "sent asset"],
  quantity: ["quantity", "amount", "qty", "units", "from amount", "sent amount"],
  value: ["gbp value", "value gbp", "value", "total gbp", "total", "gbp", "proceeds", "cost", "price gbp total"],
  fee: ["fee", "fee gbp", "fees", "gbp fee", "fees gbp"],
  toAsset: ["to asset", "received asset", "buy asset", "to coin", "to currency"],
  toQuantity: ["to quantity", "received quantity", "to amount", "received amount", "buy amount"],
};

const BUY = ["buy", "purchase", "bought", "acquire", "deposit buy"];
const SELL = ["sell", "sale", "sold", "dispose", "disposal", "spend", "payment"];
const INCOME = ["income", "staking", "reward", "airdrop", "mining", "interest", "earn", "cashback"];
const SWAP = ["swap", "trade", "convert", "exchange"];
const DONATE = ["donate", "donation", "charity", "gift to charity"];

function kindOf(type) {
  const t = norm(type);
  if (BUY.includes(t)) return "buy";
  if (SELL.includes(t)) return "sell";
  if (INCOME.includes(t)) return "income";
  if (SWAP.includes(t)) return "swap";
  if (DONATE.includes(t)) return "donate";
  return null;
}

export function parseNumber(v) {
  if (v === undefined || v === null) return NaN;
  let s = String(v).trim();
  if (s === "") return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[£$,\s]/g, "");
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  if (!/^\d*\.?\d+(e[+-]?\d+)?$|^\d+\.$/i.test(s)) return NaN;
  const n = Number(s);
  return neg ? -n : n;
}

/** ISO date from 2024-03-05, 2024-03-05T10:00:00Z or UK 05/03/2024 (day first). Null if unreadable. */
export function parseDate(v) {
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let y, mo, d;
  if (m) [, y, mo, d] = m;
  else if ((m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/))) [, d, mo, y] = m;
  else return null;
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const t = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

export const SAMPLE_CSV = `date,type,asset,quantity,gbp value,fee,to asset,to quantity
2021-06-10,buy,BTC,0.5,15000,20,,
2022-01-20,buy,BTC,0.3,10500,15,,
2023-02-14,income,ETH,1.2,1800,,,
2024-05-02,sell,BTC,0.4,19200,25,,
2024-05-02,buy,BTC,0.1,6200,10,,
2024-11-11,sell,BTC,0.2,14000,18,,
2024-11-25,buy,BTC,0.15,10200,12,,
2025-01-15,swap,ETH,0.7,2100,6,SOL,15
2025-03-03,sell,SOL,5,900,4,,
`;

/**
 * Read CSV text into transactions. Returns { transactions, warnings }. Each
 * transaction: { date, kind, asset, quantity, value, fee, toAsset, toQuantity, line }.
 * A row that cannot be read is skipped with a warning, never guessed.
 */
export function parseTransactions(text) {
  const rows = parseCsv(text);
  const warnings = [];
  if (rows.length < 2) return { transactions: [], warnings: ["No data rows found."] };
  const heads = rows[0].map(norm);
  const col = {};
  for (const [key, names] of Object.entries(ALIASES)) {
    const i = heads.findIndex((h) => names.includes(h));
    if (i >= 0) col[key] = i;
  }
  for (const need of ["date", "type", "asset", "quantity", "value"]) {
    if (col[need] === undefined) return { transactions: [], warnings: [`Missing a "${need}" column. Expected: date, type, asset, quantity, GBP value (fee, to asset, to quantity optional).`] };
  }
  const transactions = [];
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const get = (k) => (col[k] === undefined ? "" : (r[col[k]] ?? "").trim());
    const date = parseDate(get("date"));
    const kind = kindOf(get("type"));
    const asset = get("asset").toUpperCase();
    const quantity = Math.abs(parseNumber(get("quantity")));
    const value = Math.abs(parseNumber(get("value")));
    const feeRaw = get("fee");
    const fee = feeRaw === "" ? 0 : Math.abs(parseNumber(feeRaw));
    if (!date) return warnings.push(`Line ${line}: unreadable date "${get("date")}" (use YYYY-MM-DD or DD/MM/YYYY). Skipped.`);
    if (!kind) return warnings.push(`Line ${line}: unknown type "${get("type")}" (use buy, sell, income, swap or donate). Skipped.`);
    if (!asset) return warnings.push(`Line ${line}: no asset. Skipped.`);
    if (!(quantity > 0)) return warnings.push(`Line ${line}: quantity must be above zero. Skipped.`);
    if (kind !== "donate" && Number.isNaN(value)) return warnings.push(`Line ${line}: no GBP value, and none is guessed. Skipped.`);
    if (Number.isNaN(fee)) return warnings.push(`Line ${line}: unreadable fee. Skipped.`);
    const t = { date, kind, asset, quantity, value: Number.isNaN(value) ? 0 : value, fee, line };
    if (kind === "swap") {
      t.toAsset = get("toAsset").toUpperCase();
      t.toQuantity = Math.abs(parseNumber(get("toQuantity")));
      if (!t.toAsset || !(t.toQuantity > 0)) return warnings.push(`Line ${line}: a swap needs "to asset" and "to quantity". Skipped.`);
    }
    transactions.push(t);
  });
  return { transactions, warnings };
}

// ---------------------------------------------------------------------------
// Matching

/** Turn transactions into per-asset acquisitions and disposals. */
function toEvents(transactions) {
  const ev = [];
  for (const t of transactions) {
    if (t.kind === "buy") ev.push({ asset: t.asset, date: t.date, side: "acq", qty: t.quantity, amount: t.value + t.fee, line: t.line });
    else if (t.kind === "income") ev.push({ asset: t.asset, date: t.date, side: "acq", qty: t.quantity, amount: t.value + t.fee, income: true, line: t.line });
    else if (t.kind === "sell") ev.push({ asset: t.asset, date: t.date, side: "disp", qty: t.quantity, amount: t.value - t.fee, line: t.line });
    else if (t.kind === "donate") ev.push({ asset: t.asset, date: t.date, side: "donate", qty: t.quantity, amount: 0, line: t.line });
    else if (t.kind === "swap") {
      ev.push({ asset: t.asset, date: t.date, side: "disp", qty: t.quantity, amount: t.value - t.fee, line: t.line, swap: true });
      ev.push({ asset: t.toAsset, date: t.date, side: "acq", qty: t.toQuantity, amount: t.value, line: t.line, swap: true });
    }
  }
  return ev;
}

/**
 * Match one asset's events. Returns { rows, pool, snapshots, warnings }.
 * rows: one per (disposal day, matching rule): { date, asset, rule, quantity, proceeds, cost, gain }.
 */
function matchAsset(asset, events) {
  const days = new Map();
  const day = (d) => {
    if (!days.has(d)) days.set(d, { date: d, aq: 0, ac: 0, dq: 0, dp: 0, nq: 0, income: 0 });
    return days.get(d);
  };
  for (const e of events) {
    const d = day(e.date);
    if (e.side === "acq") { d.aq += e.qty; d.ac += e.amount; if (e.income) d.income += e.amount; }
    else if (e.side === "disp") { d.dq += e.qty; d.dp += e.amount; }
    else d.nq += e.qty;
  }
  const order = [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const d of order) {
    d.aRem = d.aq; d.dRem = d.dq;
    d.aUnit = d.aq > 0 ? d.ac / d.aq : 0;
    d.dUnit = d.dq > 0 ? d.dp / d.dq : 0;
  }
  const rows = [];
  const warnings = [];
  const push = (d, rule, qty, cost, matchedWith) => {
    rows.push({ date: d.date, asset, rule, quantity: qty, proceeds: qty * d.dUnit, cost, gain: qty * d.dUnit - cost, matchedWith });
  };

  // 1. same day
  for (const d of order) {
    const m = Math.min(d.aRem, d.dRem);
    if (m > EPS) { push(d, "same-day", m, m * d.aUnit, d.date); d.aRem -= m; d.dRem -= m; }
  }
  // 2. the next 30 days
  for (const d of order) {
    if (d.dRem <= EPS) continue;
    for (const e of order) {
      const gap = dayDiff(d.date, e.date);
      if (gap < 1 || gap > 30 || e.aRem <= EPS) continue;
      const m = Math.min(d.dRem, e.aRem);
      push(d, "30-day", m, m * e.aUnit, e.date);
      d.dRem -= m; e.aRem -= m;
      if (d.dRem <= EPS) break;
    }
  }
  // 3. the Section 104 pool
  let pq = 0, pc = 0;
  const snapshots = [];
  for (const d of order) {
    if (d.aRem > EPS) { pq += d.aRem; pc += d.aRem * d.aUnit; }
    if (d.dRem > EPS) {
      const covered = Math.min(d.dRem, pq);
      const cost = pq > EPS ? (pc * covered) / pq : 0;
      push(d, "pool", d.dRem, cost, null);
      if (d.dRem > pq + EPS) warnings.push(`${asset}: ${d.date} disposes of ${fmtQty(d.dRem - pq)} more than the pool held. That part has no cost on record, so the gain is overstated. Add the missing purchase or transfer-in.`);
      pc -= cost; pq -= covered;
    }
    if (d.nq > EPS) {
      const covered = Math.min(d.nq, pq);
      const cost = pq > EPS ? (pc * covered) / pq : 0;
      pc -= cost; pq -= covered;
      if (d.nq > covered + EPS) warnings.push(`${asset}: ${d.date} donates more than the pool held.`);
    }
    if (pq < EPS) { pq = 0; if (Math.abs(pc) < 0.005) pc = 0; }
    snapshots.push({ date: d.date, quantity: pq, cost: pc });
  }
  return { rows, pool: { quantity: pq, cost: pc }, snapshots, warnings };
}

export const fmtQty = (n) => {
  const s = (+n.toFixed(8)).toString();
  return s;
};

/**
 * Run the full matching. Returns
 * { disposals, pools, poolsByYear, income, warnings }.
 */
export function analyse(transactions) {
  const events = toEvents(transactions);
  const assets = [...new Set(events.map((e) => e.asset))].sort();
  const disposals = [];
  const pools = {};
  const snapshotsByAsset = {};
  const warnings = [];
  for (const a of assets) {
    const r = matchAsset(a, events.filter((e) => e.asset === a));
    disposals.push(...r.rows);
    if (r.pool.quantity > EPS) pools[a] = { quantity: r.pool.quantity, cost: r.pool.cost };
    snapshotsByAsset[a] = r.snapshots;
    warnings.push(...r.warnings);
  }
  disposals.sort((x, y) => (x.date === y.date ? x.asset.localeCompare(y.asset) : x.date < y.date ? -1 : 1));
  for (const d of disposals) d.taxYear = taxYearOf(d.date);

  const poolsByYear = {};
  const years = new Set(disposals.map((d) => d.taxYear));
  for (const ev of events) years.add(taxYearOf(ev.date));
  for (const y of years) {
    const end = TAX_YEARS[y]?.end ?? `${Number("20" + y.slice(5)) }-04-05`;
    poolsByYear[y] = {};
    for (const a of assets) {
      const snap = snapshotsByAsset[a].filter((s) => s.date <= end).pop();
      if (snap && snap.quantity > EPS) poolsByYear[y][a] = { quantity: snap.quantity, cost: snap.cost };
    }
  }
  const income = events
    .filter((e) => e.income)
    .map((e) => ({ date: e.date, asset: e.asset, quantity: e.qty, value: e.amount, taxYear: taxYearOf(e.date) }));
  return { disposals, pools, poolsByYear, income, warnings };
}

// ---------------------------------------------------------------------------
// Tax-year summary and estimate

/**
 * Summarise one tax year. `opts.income` is taxable income after the personal
 * allowance; `opts.lossesBroughtForward` is the unused losses from earlier
 * years you have already reported to HMRC. Either may be omitted.
 */
export function summarise(disposals, year, opts = {}) {
  const rules = TAX_YEARS[year];
  const rows = disposals.filter((d) => d.taxYear === year);
  const proceeds = rows.reduce((s, r) => s + r.proceeds, 0);
  const cost = rows.reduce((s, r) => s + r.cost, 0);
  const gains = rows.reduce((s, r) => s + Math.max(0, r.gain), 0);
  const losses = rows.reduce((s, r) => s + Math.max(0, -r.gain), 0);
  const net = gains - losses;
  const bf = Math.max(0, opts.lossesBroughtForward ?? 0);
  const out = { year, rows: rows.length, proceeds, cost, gains, losses, net, disposalCount: new Set(rows.map((r) => `${r.date}|${r.asset}`)).size };
  if (!rules) return { ...out, estimate: null };

  const aea = rules.aea;
  const bfUsed = Math.min(bf, Math.max(0, net - aea));
  const aeaUsed = Math.min(aea, Math.max(0, net - bfUsed));
  const taxable = Math.max(0, net - bfUsed - aeaUsed);
  const lossCarried = net < 0 ? bf + -net : bf - bfUsed;

  // Split positive gains by rate period, then take the year's losses, brought-forward
  // losses and the exempt amount off the highest-rated period first.
  const periods = rules.bands.map((b, i) => ({ ...b, to: rules.bands[i + 1] ? rules.bands[i + 1].from : "9999", gain: 0 }));
  for (const r of rows) {
    if (r.gain <= 0) continue;
    const p = [...periods].reverse().find((x) => r.date >= x.from);
    p.gain += r.gain;
  }
  let relief = losses + bfUsed + aeaUsed;
  for (const p of [...periods].reverse()) {
    const take = Math.min(p.gain, relief);
    p.gain -= take; relief -= take;
  }
  const income = Math.max(0, opts.income ?? 0);
  let room = opts.income === undefined ? rules.basic : Math.max(0, rules.basic - income);
  let tax = 0;
  // Basic-rate room goes to the period where it saves the most.
  for (const p of [...periods].sort((a, b) => (b.higher - b.basic) - (a.higher - a.basic))) {
    const inBasic = Math.min(p.gain, room);
    room -= inBasic;
    tax += inBasic * p.basic + (p.gain - inBasic) * p.higher;
  }
  return {
    ...out,
    estimate: { aea, aeaUsed, bfUsed, taxable, lossCarried, tax, assumedIncome: opts.income === undefined, bands: rules.bands },
  };
}

export function overview(transactions, opts = {}) {
  const a = analyse(transactions);
  const years = [...new Set(a.disposals.map((d) => d.taxYear))].sort();
  // Carry unused losses forward year by year when the caller supplies none.
  let carried = opts.lossesBroughtForward ?? 0;
  const summaries = [];
  for (const y of years) {
    const s = summarise(a.disposals, y, { income: opts.incomeByYear?.[y] ?? opts.income, lossesBroughtForward: carried });
    summaries.push(s);
    if (s.estimate) carried = s.estimate.lossCarried;
  }
  return { ...a, years, summaries };
}

// ---------------------------------------------------------------------------
// CSV out

const csvCell = (v) => {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per disposal and matching rule: the working to keep with your records. */
export function toDisposalsCsv(disposals) {
  const head = ["tax year", "disposal date", "asset", "rule", "quantity", "proceeds GBP", "allowable cost GBP", "gain or loss GBP", "matched with"];
  const lines = [head.join(",")];
  for (const d of disposals) {
    lines.push([d.taxYear, d.date, d.asset, d.rule, fmtQty(d.quantity), round2(d.proceeds).toFixed(2), round2(d.cost).toFixed(2), round2(d.gain).toFixed(2), d.matchedWith ?? "Section 104 pool"].map(csvCell).join(","));
  }
  return lines.join("\n") + "\n";
}

export function toPoolCsv(pools) {
  const lines = ["asset,pool quantity,pool allowable cost GBP"];
  for (const [a, p] of Object.entries(pools)) lines.push([a, fmtQty(p.quantity), round2(p.cost).toFixed(2)].map(csvCell).join(","));
  return lines.join("\n") + "\n";
}
