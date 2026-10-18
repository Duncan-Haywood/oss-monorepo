// Crypto cost-basis lot matcher. Pure functions, no I/O, no dependencies.
//
// Input is a CSV of the user's own transactions. Every row is a buy, an income
// receipt, a sale/spend, or a transfer (ignored). A coin-for-coin swap is entered
// as two rows: a sale of what was given up and a buy of what was received, each at
// its USD value that day. The module matches each disposal to earlier acquisition
// lots under FIFO, LIFO, HIFO, LOFO or a tax-aware greedy rule, splits every
// disposal into Form 8949-style rows with short/long-term holding periods, and
// compares the methods on the chosen tax year. It prices nothing and fetches
// nothing: every figure comes from the rows the user supplies.

export const METHODS = ["FIFO", "LIFO", "HIFO", "LOFO", "TAXMIN"];
export const METHOD_LABELS = {
  FIFO: "First in, first out",
  LIFO: "Last in, first out",
  HIFO: "Highest cost first",
  LOFO: "Lowest cost first",
  TAXMIN: "Tax-aware greedy (lowest tax per coin first)",
};

const EPS = 1e-9;
const cents = (n) => Math.round((n + Number.EPSILON * Math.sign(n)) * 100) / 100;

// ---- CSV ---------------------------------------------------------------

export function parseCsv(text) {
  const src = String(text ?? "").replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] || "";
  const delim = firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",";
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim()));
}

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const HEADER_ALIASES = {
  date: ["date", "time", "timestamp", "datetime", "date utc", "transaction date", "date time", "date and time"],
  type: ["type", "side", "transaction type", "operation", "action", "kind"],
  asset: ["asset", "currency", "coin", "symbol", "token", "ticker", "base asset"],
  quantity: ["quantity", "amount", "qty", "size", "quantity transacted", "units"],
  total: ["total", "total usd", "usd value", "value", "value usd", "proceeds", "subtotal", "total value", "usd"],
  price: ["price", "price per unit", "spot price", "unit price", "price usd", "rate"],
  fee: ["fee", "fees", "fee usd", "fees usd", "commission"],
  wallet: ["wallet", "account", "exchange", "platform", "source"],
  toWallet: ["to wallet", "to account", "to", "destination", "destination wallet", "to exchange"],
};

export function mapHeaders(headerRow) {
  const map = {};
  const names = headerRow.map(norm);
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    for (const a of aliases) {
      const idx = names.indexOf(a);
      if (idx >= 0) { map[field] = idx; break; }
    }
  }
  return map;
}

const TYPE_WORDS = {
  buy: ["buy", "purchase", "bought", "advanced trade buy", "market buy", "limit buy"],
  income: ["income", "reward", "rewards", "staking", "staking reward", "airdrop", "mining", "interest", "earn", "learning reward", "referral", "payment received"],
  sell: ["sell", "sale", "sold", "spend", "market sell", "limit sell", "advanced trade sell", "payment sent", "convert out"],
  transfer: ["transfer", "send", "receive", "deposit", "withdrawal", "withdraw", "move"],
};

export function normalizeType(raw) {
  const t = norm(raw);
  for (const [kind, words] of Object.entries(TYPE_WORDS)) if (words.includes(t)) return kind;
  return null;
}

export function parseDate(raw) {
  const s = String(raw ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  let y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else {
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[T\s].*)?$/);
    if (!m) return null;
    mo = +m[1]; d = +m[2]; y = +m[3];
  }
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

function parseNumber(raw) {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// ---- rows --------------------------------------------------------------

// Returns { transactions, skipped, errors }. A transaction is
// { line, date, kind: 'buy'|'income'|'sell', asset, qty, usd, fee, wallet }.
export function parseTransactions(text) {
  const grid = parseCsv(text);
  const out = { transactions: [], skipped: [], errors: [] };
  if (grid.length === 0) return out;
  const map = mapHeaders(grid[0]);
  const missing = ["date", "type", "asset", "quantity"].filter((f) => map[f] === undefined);
  if (map.total === undefined && map.price === undefined) missing.push("total or price");
  if (missing.length) {
    out.errors.push(`Header row is missing: ${missing.join(", ")}. Expected columns like date, type, asset, quantity, total (USD), fee, wallet.`);
    return out;
  }
  for (let i = 1; i < grid.length; i++) {
    const r = grid[i];
    const line = i + 1;
    const get = (f) => (map[f] === undefined ? "" : (r[map[f]] ?? ""));
    const kind = normalizeType(get("type"));
    if (kind === null) { out.errors.push(`Line ${line}: unrecognised type "${get("type")}" (use buy, sell, income or transfer).`); continue; }
    const toWallet = map.toWallet === undefined ? "" : (r[map.toWallet] ?? "");
    if (kind === "transfer" && !toWallet) { out.skipped.push(`Line ${line}: transfer ignored (not a taxable event; add a "to wallet" column to move its lots in per-wallet mode).`); continue; }
    const date = parseDate(get("date"));
    if (!date) { out.errors.push(`Line ${line}: unreadable date "${get("date")}" (use YYYY-MM-DD or MM/DD/YYYY).`); continue; }
    const asset = get("asset").toUpperCase();
    if (!asset) { out.errors.push(`Line ${line}: missing asset.`); continue; }
    const qty = Math.abs(parseNumber(get("quantity")));
    if (!(qty > 0)) { out.errors.push(`Line ${line}: quantity must be a positive number.`); continue; }
    if (kind === "transfer") {
      const from = get("wallet");
      if (!from) { out.errors.push(`Line ${line}: a transfer needs a wallet to move the coins out of.`); continue; }
      if (from === toWallet) { out.skipped.push(`Line ${line}: transfer from and to the same wallet ignored.`); continue; }
      out.transactions.push({ line, date, kind, asset, qty, usd: 0, fee: 0, wallet: from, toWallet });
      continue;
    }
    const totalRaw = map.total === undefined ? null : parseNumber(get("total"));
    const priceRaw = map.price === undefined ? null : parseNumber(get("price"));
    let usd = totalRaw !== null && !Number.isNaN(totalRaw) ? Math.abs(totalRaw) : null;
    if (usd === null && priceRaw !== null && !Number.isNaN(priceRaw)) usd = Math.abs(priceRaw) * qty;
    if (usd === null) { out.errors.push(`Line ${line}: no USD total or price.`); continue; }
    const feeRaw = map.fee === undefined ? 0 : parseNumber(get("fee"));
    const fee = Number.isNaN(feeRaw) || feeRaw === null ? 0 : Math.abs(feeRaw);
    const wallet = get("wallet") || "";
    out.transactions.push({ line, date, kind, asset, qty, usd, fee, wallet });
  }
  return out;
}

// ---- lot matching ------------------------------------------------------

function addOneYear(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y + 1, m - 1, d));
  // Feb 29 acquisition: Date rolls to Mar 1, which is the day after the anniversary.
  if (m === 2 && d === 29) return `${y + 1}-02-28`;
  return dt.toISOString().slice(0, 10);
}

// Long-term means held for MORE than one year: the sale date must fall after the
// first anniversary of the acquisition date.
export function holdingTerm(acquired, sold) {
  return sold > addOneYear(acquired) ? "Long" : "Short";
}

function rateOf(term, rates) {
  return term === "Long" ? rates.longRate : rates.shortRate;
}

function orderLots(lots, method, sale, unitProceeds, rates) {
  const byAcq = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.seq - b.seq);
  const unitBasis = (l) => l.basis / l.qtyOriginal;
  const arr = lots.slice();
  switch (method) {
    case "FIFO": return arr.sort(byAcq);
    case "LIFO": return arr.sort((a, b) => -byAcq(a, b));
    case "HIFO": return arr.sort((a, b) => unitBasis(b) - unitBasis(a) || byAcq(a, b));
    case "LOFO": return arr.sort((a, b) => unitBasis(a) - unitBasis(b) || byAcq(a, b));
    case "TAXMIN": {
      const tax = (l) => (unitProceeds - unitBasis(l)) * rateOf(holdingTerm(l.date, sale.date), rates);
      return arr.sort((a, b) => tax(a) - tax(b) || byAcq(a, b));
    }
    default: throw new Error(`Unknown method ${method}`);
  }
}

const PRIORITY = { buy: 0, income: 0, transfer: 1, sell: 2 };

// Runs one method over every transaction. Returns pieces (one per lot consumed)
// and the lots still open at the end.
export function matchLots(transactions, { method = "FIFO", perWallet = false, shortRate = 0.24, longRate = 0.15 } = {}) {
  const rates = { shortRate, longRate };
  const ordered = transactions
    .map((t, i) => ({ ...t, seq: i }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : PRIORITY[a.kind] - PRIORITY[b.kind] || a.seq - b.seq));
  const books = new Map();
  const bookKey = (t) => `${t.asset}\u0000${perWallet ? t.wallet : ""}`;
  const pieces = [];
  const shortfalls = [];
  for (const t of ordered) {
    if (t.kind === "transfer") {
      // Moving coins between your own wallets is not a sale. With one pool there is nothing to move;
      // per wallet, the chosen lots keep their purchase date and basis in the new wallet.
      if (!perWallet) continue;
      const from = books.get(bookKey(t)) || [];
      const dest = bookKey({ asset: t.asset, wallet: t.toWallet });
      if (!books.has(dest)) books.set(dest, []);
      let left = t.qty;
      const order = method === "TAXMIN" ? "FIFO" : method;
      for (const lot of orderLots(from.filter((l) => l.qty > EPS), order, t, 0, rates)) {
        if (left <= EPS) break;
        const take = Math.min(lot.qty, left);
        const basis = (lot.basis / lot.qtyOriginal) * take;
        books.get(dest).push({ ...lot, wallet: t.toWallet, qty: take, qtyOriginal: take, basis });
        lot.qty -= take;
        left -= take;
      }
      if (left > EPS) shortfalls.push({ asset: t.asset, wallet: t.wallet, line: t.line, date: t.date, qty: left, transfer: true });
      continue;
    }
    const key = bookKey(t);
    if (!books.has(key)) books.set(key, []);
    const lots = books.get(key);
    if (t.kind === "buy" || t.kind === "income") {
      const basis = t.kind === "buy" ? t.usd + t.fee : t.usd;
      lots.push({ date: t.date, seq: t.seq, line: t.line, kind: t.kind, asset: t.asset, wallet: t.wallet, qty: t.qty, qtyOriginal: t.qty, basis });
      continue;
    }
    // sale: fee reduces proceeds
    const netProceeds = t.usd - t.fee;
    const unitProceeds = netProceeds / t.qty;
    let remaining = t.qty;
    const open = lots.filter((l) => l.qty > EPS);
    for (const lot of orderLots(open, method, t, unitProceeds, rates)) {
      if (remaining <= EPS) break;
      const take = Math.min(lot.qty, remaining);
      const share = take / t.qty;
      pieces.push({
        asset: t.asset, wallet: t.wallet, qty: take, saleLine: t.line, lotLine: lot.line,
        acquired: lot.date, sold: t.date,
        proceeds: netProceeds * share,
        basis: (lot.basis / lot.qtyOriginal) * take,
        term: holdingTerm(lot.date, t.date),
        missingBasis: false,
      });
      lot.qty -= take;
      remaining -= take;
    }
    if (remaining > EPS) {
      const share = remaining / t.qty;
      shortfalls.push({ asset: t.asset, wallet: t.wallet, line: t.line, date: t.date, qty: remaining });
      pieces.push({
        asset: t.asset, wallet: t.wallet, qty: remaining, saleLine: t.line, lotLine: null,
        acquired: null, sold: t.date, proceeds: netProceeds * share, basis: 0, term: "Short", missingBasis: true,
      });
    }
  }
  const openLots = [];
  for (const lots of books.values()) for (const l of lots) if (l.qty > EPS) openLots.push({ ...l });
  return { pieces, openLots, shortfalls };
}

// ---- reporting ---------------------------------------------------------

export function toRow(p) {
  const proceeds = cents(p.proceeds);
  const basis = cents(p.basis);
  return {
    description: `${trimQty(p.qty)} ${p.asset}`,
    asset: p.asset,
    wallet: p.wallet,
    acquired: p.acquired,
    sold: p.sold,
    proceeds,
    basis,
    gain: cents(proceeds - basis),
    term: p.term,
    missingBasis: p.missingBasis,
  };
}

function trimQty(q) {
  return String(Number(q.toFixed(8)));
}

export function summarize(rows) {
  const s = { shortGain: 0, longGain: 0, shortProceeds: 0, longProceeds: 0, shortBasis: 0, longBasis: 0 };
  for (const r of rows) {
    const k = r.term === "Long" ? "long" : "short";
    s[`${k}Gain`] += r.gain;
    s[`${k}Proceeds`] += r.proceeds;
    s[`${k}Basis`] += r.basis;
  }
  for (const k of Object.keys(s)) s[k] = cents(s[k]);
  s.totalGain = cents(s.shortGain + s.longGain);
  return s;
}

// Column totals for each part of Form 8949 (Part I short-term, Part II
// long-term) and the combined figure, the numbers that carry to Schedule D.
// Sums the already-rounded rows, so the totals equal what the rows add up to on
// paper. `noBasis` counts rows with no purchase on record, whose zero basis
// overstates the gain until the missing buy is added.
export function form8949Totals(rows) {
  const blank = () => ({ rows: 0, proceeds: 0, basis: 0, gain: 0, noBasis: 0 });
  const t = { short: blank(), long: blank() };
  for (const r of rows) {
    const part = t[r.term === "Long" ? "long" : "short"];
    part.rows += 1;
    part.proceeds += r.proceeds;
    part.basis += r.basis;
    part.gain += r.gain;
    if (r.missingBasis) part.noBasis += 1;
  }
  for (const part of [t.short, t.long]) {
    for (const k of ["proceeds", "basis", "gain"]) part[k] = cents(part[k]);
  }
  t.total = {
    rows: t.short.rows + t.long.rows,
    proceeds: cents(t.short.proceeds + t.long.proceeds),
    basis: cents(t.short.basis + t.long.basis),
    gain: cents(t.short.gain + t.long.gain),
    noBasis: t.short.noBasis + t.long.noBasis,
  };
  return t;
}

// Federal-style netting of short and long results, ignoring NIIT, the $3,000
// ordinary-income loss deduction and carryforwards. A net loss costs nothing here.
export function estimateTax(summary, { shortRate, longRate }) {
  const st = summary.shortGain;
  const lt = summary.longGain;
  let tax;
  if (st >= 0 && lt >= 0) tax = st * shortRate + lt * longRate;
  else if (st < 0 && lt > 0) tax = Math.max(0, lt + st) * longRate;
  else if (st > 0 && lt < 0) tax = Math.max(0, st + lt) * shortRate;
  else tax = 0;
  return cents(tax);
}

// Capital-loss netting with the $3,000 annual limit and indefinite carryforward
// (Schedule D and its Capital Loss Carryover Worksheet, simplified): short-term
// and long-term results net within their own bucket, then against each other; a
// net loss is deductible up to `limit` ($3,000, or $1,500 married filing
// separately) and the rest carries to next year keeping its character, with the
// deduction taken from the short-term loss first. Tax on a net gain uses the
// short and long rates on whatever remains of each bucket. Ignores NIIT, state
// tax and the effect of the deduction on ordinary tax (`deduction` is reported,
// not valued).
export function netCapital(shortGain, longGain, { carryShort = 0, carryLong = 0, limit = 3000, shortRate = 0.24, longRate = 0.15 } = {}) {
  const s = cents(shortGain - Math.abs(carryShort));
  const l = cents(longGain - Math.abs(carryLong));
  const total = cents(s + l);
  let deduction = 0, outShort = 0, outLong = 0, tax = 0;
  if (total < 0) {
    deduction = Math.min(limit, -total);
    const rest = cents(-total - deduction);
    if (s < 0 && l < 0) { outShort = Math.max(0, cents(-s - deduction)); outLong = cents(rest - outShort); }
    else if (s < 0) outShort = rest;
    else outLong = rest;
  } else if (s >= 0 && l >= 0) tax = s * shortRate + l * longRate;
  else if (s < 0) tax = total * longRate;
  else tax = total * shortRate;
  return { shortNet: s, longNet: l, totalNet: total, deduction: cents(deduction), carryShortOut: cents(outShort), carryLongOut: cents(outLong), tax: cents(tax) };
}

// Net investment income tax (IRC section 1411, Form 8960): 3.8% of the smaller of
// net investment income and the amount modified AGI exceeds a threshold that is not
// indexed for inflation. `magi` is the user's income for the year EXCLUDING these
// crypto results (include wages and any staking or mining income); `otherNii` is
// other net investment income (interest, dividends, other gains). The crypto
// result enters both at its netted amount, a net loss only by the allowed
// deduction. Whether staking or mining income is net investment income depends on
// facts (a trade or business is excluded), so it is left to the user via `otherNii`.
export const NIIT_THRESHOLDS = { single: 200000, hoh: 200000, mfj: 250000, qw: 250000, mfs: 125000 };
export const NIIT_RATE = 0.038;
export function niit(netting, { magi, otherNii = 0, status = "single" } = {}) {
  const threshold = NIIT_THRESHOLDS[status];
  if (threshold === undefined || !Number.isFinite(magi) || magi < 0 || !Number.isFinite(otherNii)) return null;
  const crypto = netting.totalNet >= 0 ? netting.totalNet : -netting.deduction;
  const nii = cents(Math.max(0, crypto + otherNii));
  const totalMagi = cents(magi + crypto);
  const over = cents(Math.max(0, totalMagi - threshold));
  const base = Math.min(nii, over);
  const tax = cents(base * NIIT_RATE);
  // What the crypto result alone adds: the same calculation without it.
  const without = cents(Math.min(Math.max(0, otherNii), Math.max(0, magi - threshold)) * NIIT_RATE);
  return { status, threshold, totalMagi, nii, over, base, tax, fromCrypto: cents(tax - without) };
}

// Chains `netCapital` over several years: [{ year, shortGain, longGain }] in
// any order, years with no sales between them carry through unchanged.
export function carryoverChain(yearSummaries, opts = {}) {
  let carryShort = Math.abs(opts.carryShort || 0), carryLong = Math.abs(opts.carryLong || 0);
  const out = [];
  for (const y of [...yearSummaries].sort((a, b) => a.year - b.year)) {
    const r = netCapital(y.shortGain, y.longGain, { ...opts, carryShort, carryLong });
    out.push({ year: y.year, carryShortIn: cents(carryShort), carryLongIn: cents(carryLong), shortGain: y.shortGain, longGain: y.longGain, ...r });
    carryShort = r.carryShortOut; carryLong = r.carryLongOut;
  }
  return out;
}

export function yearOf(iso) {
  return Number(iso.slice(0, 4));
}

// Ordinary income received (staking, mining, airdrops, rewards) in a tax year, by coin and
// by month, valued at the USD amounts the user entered. Each row is also a lot, so the
// same figures are the basis of the coins when they are later sold.
export function incomeReport(txs, year = null) {
  const rows = txs.filter((t) => t.kind === "income" && (year === null || yearOf(t.date) === year));
  const byAsset = new Map(), byMonth = new Map();
  for (const t of rows) {
    const a = byAsset.get(t.asset) || { asset: t.asset, count: 0, qty: 0, usd: 0, first: t.date, last: t.date };
    a.count++; a.qty += t.qty; a.usd += t.usd;
    if (t.date < a.first) a.first = t.date;
    if (t.date > a.last) a.last = t.date;
    byAsset.set(t.asset, a);
    const m = t.date.slice(0, 7);
    byMonth.set(m, (byMonth.get(m) || 0) + t.usd);
  }
  const assets = [...byAsset.values()].map((a) => ({ ...a, qty: Number(a.qty.toFixed(8)), usd: cents(a.usd) })).sort((a, b) => b.usd - a.usd);
  const months = [...byMonth].map(([month, usd]) => ({ month, usd: cents(usd) })).sort((a, b) => (a.month < b.month ? -1 : 1));
  return { year, count: rows.length, total: cents(rows.reduce((n, t) => n + t.usd, 0)), assets, months };
}

export function toIncomeCsv(report) {
  const lines = [["Asset", "Receipts", "Quantity", "First received", "Last received", "Fair market value (USD)"].join(",")];
  for (const a of report.assets) lines.push([a.asset, a.count, a.qty, a.first, a.last, a.usd.toFixed(2)].map(q).join(","));
  lines.push(["Total", report.count, "", "", "", report.total.toFixed(2)].map(q).join(","));
  return lines.join("\n") + "\n";
}

export function analyze(text, options = {}) {
  const { method = "FIFO", year = null, perWallet = false, shortRate = 0.24, longRate = 0.15, carryShort = 0, carryLong = 0, lossLimit = 3000, magi = null, otherNii = 0, filing = "single" } = options;
  const parsed = parseTransactions(text);
  const result = {
    errors: parsed.errors, skipped: parsed.skipped, warnings: [], years: [], year: null,
    rows: [], summary: null, tax: null, netting: null, niit: null, carryChain: [], comparison: [], holdings: [], openLots: [], income: 0, incomeReport: null, method, count: parsed.transactions.length,
  };
  if (parsed.errors.length && parsed.transactions.length === 0) return result;
  const txs = parsed.transactions;
  if (txs.length === 0) { result.errors.push("No transactions found."); return result; }

  const saleYears = [...new Set(txs.filter((t) => t.kind === "sell").map((t) => yearOf(t.date)))].sort();
  result.years = saleYears;
  const chosen = year ?? saleYears[saleYears.length - 1] ?? null;
  result.year = chosen;
  const rates = { shortRate, longRate };

  const run = (m) => {
    const { pieces, openLots, shortfalls } = matchLots(txs, { method: m, perWallet, shortRate, longRate });
    const rows = pieces.map(toRow).filter((r) => chosen === null || yearOf(r.sold) === chosen)
      .sort((a, b) => (a.sold < b.sold ? -1 : a.sold > b.sold ? 1 : (a.acquired || "") < (b.acquired || "") ? -1 : 1));
    const summary = summarize(rows);
    return { rows, summary, tax: estimateTax(summary, rates), openLots, shortfalls };
  };

  const main = run(method);
  result.rows = main.rows;
  result.summary = main.summary;
  result.tax = main.tax;
  for (const m of METHODS) {
    const r = m === method ? main : run(m);
    result.comparison.push({
      method: m, label: METHOD_LABELS[m], shortGain: r.summary.shortGain, longGain: r.summary.longGain,
      totalGain: r.summary.totalGain, tax: r.tax,
    });
  }
  {
    const { pieces } = matchLots(txs, { method, perWallet, shortRate, longRate });
    const byYear = new Map();
    for (const p of pieces) {
      const row = toRow(p), y = yearOf(row.sold);
      const a = byYear.get(y) || [];
      a.push(row);
      byYear.set(y, a);
    }
    const sums = [...byYear].map(([y, rs]) => { const sm = summarize(rs); return { year: y, shortGain: sm.shortGain, longGain: sm.longGain }; });
    result.carryChain = carryoverChain(sums, { carryShort, carryLong, limit: lossLimit, shortRate, longRate });
    result.netting = result.carryChain.find((c) => c.year === chosen) || null;
    if (magi !== null && result.netting) result.niit = niit(result.netting, { magi, otherNii, status: filing });
    // The same year under every method, so a method that lowers income tax but
    // raises the 3.8% surtax (or the reverse) shows up in the comparison.
    if (magi !== null && chosen !== null) {
      for (const c of result.comparison) {
        const { pieces: mp } = matchLots(txs, { method: c.method, perWallet, shortRate, longRate });
        const byY = new Map();
        for (const p of mp) { const row = toRow(p), y = yearOf(row.sold); byY.set(y, [...(byY.get(y) || []), row]); }
        const ms = [...byY].map(([y, rs]) => { const sm = summarize(rs); return { year: y, shortGain: sm.shortGain, longGain: sm.longGain }; });
        const n = carryoverChain(ms, { carryShort, carryLong, limit: lossLimit, shortRate, longRate }).find((x) => x.year === chosen);
        const nn = n ? niit(n, { magi, otherNii, status: filing }) : null;
        c.niit = nn ? nn.tax : 0;
      }
    }
  }
  const best = result.comparison.reduce((a, b) => (b.tax < a.tax || (b.tax === a.tax && b.totalGain < a.totalGain) ? b : a));
  result.bestMethod = best.method;

  for (const s of main.shortfalls) {
    if (s.transfer) { result.warnings.push(`Line ${s.line} (${s.date}): transferred ${trimQty(s.qty)} ${s.asset} more than the lots on record in wallet "${s.wallet}". Only the coins on record were moved; add the missing buy, income or transfer-in history.`); continue; }
    result.warnings.push(`Line ${s.line} (${s.date}): sold ${trimQty(s.qty)} ${s.asset} more than the lots on record${perWallet && s.wallet ? ` in wallet "${s.wallet}"` : ""}. That part is shown with zero basis; add the missing buy, income or transfer-in history.`);
  }
  const holdings = new Map();
  for (const l of main.openLots) {
    const k = l.asset;
    const h = holdings.get(k) || { asset: k, qty: 0, basis: 0 };
    h.qty += l.qty;
    h.basis += (l.basis / l.qtyOriginal) * l.qty;
    holdings.set(k, h);
  }
  result.holdings = [...holdings.values()].map((h) => ({ asset: h.asset, qty: Number(h.qty.toFixed(8)), basis: cents(h.basis) })).sort((a, b) => b.basis - a.basis);
  result.openLots = main.openLots.map((l) => ({
    asset: l.asset, wallet: l.wallet, acquired: l.date, qty: Number(l.qty.toFixed(8)), basis: cents((l.basis / l.qtyOriginal) * l.qty),
  }));
  result.income = cents(txs.filter((t) => t.kind === "income" && (chosen === null || yearOf(t.date) === chosen)).reduce((a, t) => a + t.usd, 0));
  result.incomeReport = incomeReport(txs, chosen);
  return result;
}

// "BTC=65000, ETH 3200" or one per line -> { BTC: 65000, ETH: 3200 }. Bad entries are reported, never guessed.
export function parsePrices(text) {
  const prices = {};
  const errors = [];
  for (const part of String(text || "").split(/[\n;]+|,(?=\s*[A-Za-z])/)) {
    const t = part.trim();
    if (!t) continue;
    const m = t.match(/^([A-Za-z0-9.\-]+)\s*[=:\s]\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)$/);
    if (!m) { errors.push(`Could not read "${t}". Write it as BTC=65000.`); continue; }
    const v = Number(m[2].replace(/,/g, ""));
    if (!(v > 0)) { errors.push(`Price for ${m[1]} must be above zero.`); continue; }
    prices[m[1].toUpperCase()] = v;
  }
  return { prices, errors };
}

// Tax-loss harvesting view of the lots still open. For each lot with a price you
// typed: unrealized gain or loss and its term if sold on `asOf`. Then the tax
// saved by selling every losing lot against the year's realized result
// (`summary` from analyze, already net of the chosen method). Biggest tax saved
// per lot first. No wash-sale rule is applied; see the page for why that is a
// question of current law, not of arithmetic.
export function harvestPlan(openLots, prices, { asOf, summary = null, shortRate = 0.24, longRate = 0.15 } = {}) {
  const base = summary || { shortGain: 0, longGain: 0 };
  const lots = [];
  const unpriced = new Set();
  for (const l of openLots) {
    const price = prices[l.asset];
    if (!price) { unpriced.add(l.asset); continue; }
    const value = cents(l.qty * price);
    const gain = cents(value - l.basis);
    const term = holdingTerm(l.acquired, asOf);
    lots.push({ asset: l.asset, wallet: l.wallet, acquired: l.acquired, qty: l.qty, basis: l.basis, value, gain, term });
  }
  const losers = lots.filter((l) => l.gain < 0);
  const net = (extraShort, extraLong) => estimateTax({ shortGain: base.shortGain + extraShort, longGain: base.longGain + extraLong }, { shortRate, longRate });
  const shortLoss = cents(losers.filter((l) => l.term === "Short").reduce((a, l) => a + l.gain, 0));
  const longLoss = cents(losers.filter((l) => l.term === "Long").reduce((a, l) => a + l.gain, 0));
  const taxBefore = net(0, 0);
  const taxAfter = net(shortLoss, longLoss);
  // Standalone saving per lot (against the current result), for ranking only.
  for (const l of losers) l.taxSaved = cents(taxBefore - (l.term === "Short" ? net(l.gain, 0) : net(0, l.gain)));
  losers.sort((a, b) => b.taxSaved - a.taxSaved || a.gain - b.gain);
  return {
    asOf, lots, losers, unpriced: [...unpriced].sort(),
    unrealizedGain: cents(lots.reduce((a, l) => a + l.gain, 0)),
    shortLoss, longLoss, taxBefore, taxAfter, taxSaved: cents(taxBefore - taxAfter),
    unusedLoss: cents(Math.max(0, -(base.shortGain + shortLoss + base.longGain + longLoss))),
  };
}

function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Wait-for-long-term view: lots you hold at a gain that are still short-term on `asOf` but
// turn long-term within `windowDays`. A lot is long-term from the day after its first
// anniversary (holdingTerm). For each: the first long-term sale date, days to wait, the
// estimated tax saved by selling then instead of on `asOf` at the same price (against the
// year's result in `summary`), and `breakEvenFall`, how far the lot's value can drop while
// waiting before waiting leaves you with less cash after tax than selling now. Prices are
// yours; fees, state tax and the year the sale lands in are not modelled.
export function waitPlan(openLots, prices, { asOf, windowDays = 90, summary = null, shortRate = 0.24, longRate = 0.15 } = {}) {
  const base = summary || { shortGain: 0, longGain: 0 };
  const rates = { shortRate, longRate };
  const unpriced = new Set();
  const lots = [];
  for (const l of openLots) {
    const price = prices[l.asset];
    if (!price) { unpriced.add(l.asset); continue; }
    if (holdingTerm(l.acquired, asOf) !== "Short") continue;
    const longFrom = addDays(addOneYear(l.acquired), 1);
    const days = Math.round((Date.parse(longFrom) - Date.parse(asOf)) / 86400000);
    if (days > windowDays) continue;
    const value = cents(l.qty * price);
    const gain = cents(value - l.basis);
    if (gain <= 0) continue;
    const taxNow = estimateTax({ shortGain: base.shortGain + gain, longGain: base.longGain }, rates) - estimateTax(base, rates);
    const taxLater = estimateTax({ shortGain: base.shortGain, longGain: base.longGain + gain }, rates) - estimateTax(base, rates);
    const taxSaved = cents(taxNow - taxLater);
    if (taxSaved <= 0) continue;
    const fall = cents(Math.max(0, gain * (shortRate - longRate) / (1 - longRate)));
    lots.push({ asset: l.asset, wallet: l.wallet, acquired: l.acquired, qty: l.qty, basis: l.basis, value, gain, longFrom, days, taxSaved, breakEvenFall: fall, breakEvenFallPct: value > 0 ? Number((fall / value * 100).toFixed(1)) : 0 });
  }
  lots.sort((a, b) => a.days - b.days || b.taxSaved - a.taxSaved);
  return { asOf, windowDays, lots, unpriced: [...unpriced].sort(), taxSaved: cents(lots.reduce((a, l) => a + l.taxSaved, 0)) };
}

// Sell planner: which of the lots you still hold to sell for `asset` at a price you typed,
// under each method, and what each choice adds to the year's estimated tax. Give `qty`
// (coins) or `cash` (dollars of proceeds wanted, before the fee). `summary` is the year's
// realized result so far, so a sale of losing lots can offset it and a sale of gains stacks on it.
// A request larger than the holding is cut to the holding and flagged, never invented.
export function planSale(openLots, { asset, price, asOf, qty = null, cash = null, feeRate = 0, summary = null, shortRate = 0.24, longRate = 0.15 }) {
  const rates = { shortRate, longRate };
  const base = summary || { shortGain: 0, longGain: 0 };
  const held = openLots.filter((l) => l.asset === asset && l.qty > EPS)
    .map((l, i) => ({ date: l.acquired, seq: i, wallet: l.wallet, qty: l.qty, qtyOriginal: l.qty, basis: l.basis }));
  const heldQty = held.reduce((a, l) => a + l.qty, 0);
  const wanted = qty !== null ? qty : cash !== null ? cash / (price * (1 - feeRate)) : 0;
  const target = Math.min(wanted, heldQty);
  const taxBefore = estimateTax(base, rates);
  const sale = { date: asOf };
  const options = METHODS.map((method) => {
    const lots = held.map((l) => ({ ...l }));
    let left = target;
    const taken = [];
    for (const lot of orderLots(lots, method, sale, price * (1 - feeRate), rates)) {
      if (left <= EPS) break;
      const take = Math.min(lot.qty, left);
      const proceeds = take * price * (1 - feeRate);
      const basis = (lot.basis / lot.qtyOriginal) * take;
      taken.push({ wallet: lot.wallet, acquired: lot.date, qty: Number(take.toFixed(8)), proceeds: cents(proceeds), basis: cents(basis), gain: cents(proceeds - basis), term: holdingTerm(lot.date, asOf) });
      left -= take;
    }
    const sum = (term) => cents(taken.filter((t) => t.term === term).reduce((a, t) => a + t.gain, 0));
    const shortGain = sum("Short"), longGain = sum("Long");
    const proceeds = cents(taken.reduce((a, t) => a + t.proceeds, 0));
    const extraTax = cents(estimateTax({ shortGain: base.shortGain + shortGain, longGain: base.longGain + longGain }, rates) - taxBefore);
    return { method, label: METHOD_LABELS[method], lots: taken, proceeds, basis: cents(taken.reduce((a, t) => a + t.basis, 0)), shortGain, longGain, gain: cents(shortGain + longGain), extraTax, keep: cents(proceeds - extraTax) };
  });
  const best = options.reduce((a, b) => (b.extraTax < a.extraTax ? b : a));
  return { asset, price, asOf, requested: Number(wanted.toFixed(8)), qty: Number(target.toFixed(8)), heldQty: Number(heldQty.toFixed(8)), capped: wanted > heldQty + EPS, taxBefore, options, bestMethod: best.method };
}

const q = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// CSV in Form 8949 column order, ready to paste into tax software or hand to a preparer.
export function toForm8949Csv(rows) {
  const head = ["Description of property", "Date acquired", "Date sold", "Proceeds", "Cost or other basis", "Gain or loss", "Term", "Note"];
  const lines = [head.join(",")];
  for (const r of rows) {
    lines.push([
      r.description, r.acquired || "VARIOUS", r.sold, r.proceeds.toFixed(2), r.basis.toFixed(2), r.gain.toFixed(2), r.term,
      r.missingBasis ? "No basis on record" : "",
    ].map(q).join(","));
  }
  return lines.join("\n") + "\n";
}

export const SAMPLE_CSV = `date,type,asset,quantity,total,fee,wallet
2023-01-10,buy,BTC,0.50,10000,10,Exchange A
2023-06-15,buy,BTC,0.50,15000,15,Exchange A
2024-02-01,buy,BTC,0.25,12000,12,Exchange A
2024-03-05,income,ETH,2,5000,0,Exchange A
2024-09-20,sell,BTC,0.60,36000,36,Exchange A
2024-11-02,sell,ETH,1,3300,3,Exchange A
`;
