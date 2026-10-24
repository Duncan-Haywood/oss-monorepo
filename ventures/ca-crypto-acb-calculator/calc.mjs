// Canadian crypto capital gains: adjusted cost base (ACB) by average cost, and
// the superficial loss rule, applied to cryptocurrency.
//
// The CRA treats cryptocurrency as a commodity, so each coin is "identical
// property": every unit of one coin is averaged into a single adjusted cost
// base, across all of your wallets and exchanges. Each disposition uses a share
// of that average, in proportion to the units sold. (There is no FIFO and no
// choosing lots.) A loss is denied, in whole or in part, when the same coin was
// bought in the 61-day window around the sale and some of it is still held at
// the end of the 30th day after. The denied loss is added to the ACB of what
// was bought instead of being lost.
//
// Everything here is arithmetic on figures the user types, in Canadian dollars.
// No prices are fetched and nothing is sent anywhere.

const EPS = 1e-9;

/** Share of a net capital gain that is taxable. The proposed increase to two thirds was cancelled in March 2025. */
export const INCLUSION_RATE = 0.5;

/** Canadian personal tax year: the calendar year. */
export const taxYearOf = (date) => date.slice(0, 4);

export const round2 = (n) => Math.round((n + Number.EPSILON * Math.sign(n)) * 100) / 100;

const dayDiff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

export const fmtQty = (n) => (+n.toFixed(8)).toString();

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
  value: ["cad value", "value cad", "value", "total cad", "total", "cad", "proceeds", "cost", "price cad total"],
  fee: ["fee", "fee cad", "fees", "cad fee", "fees cad"],
  toAsset: ["to asset", "received asset", "buy asset", "to coin", "to currency"],
  toQuantity: ["to quantity", "received quantity", "to amount", "received amount", "buy amount"],
};

const BUY = ["buy", "purchase", "bought", "acquire"];
const SELL = ["sell", "sale", "sold", "dispose", "disposal", "spend", "payment"];
const INCOME = ["income", "staking", "reward", "airdrop", "mining", "interest", "earn", "cashback"];
const SWAP = ["swap", "trade", "convert", "exchange"];
const TRANSFER = ["transfer", "withdrawal", "deposit", "send", "receive"];

function kindOf(type) {
  const t = norm(type);
  if (BUY.includes(t)) return "buy";
  if (SELL.includes(t)) return "sell";
  if (INCOME.includes(t)) return "income";
  if (SWAP.includes(t)) return "swap";
  if (TRANSFER.includes(t)) return "transfer";
  return null;
}

export function parseNumber(v) {
  if (v === undefined || v === null) return NaN;
  let s = String(v).trim();
  if (s === "") return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/^(ca|c)?\$/i, "").replace(/[$,\s]/g, "");
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  if (!/^\d*\.?\d+(e[+-]?\d+)?$|^\d+\.$/i.test(s)) return NaN;
  const n = Number(s);
  return neg ? -n : n;
}

/**
 * ISO date from 2024-03-05, 2024/03/05 or 2024-03-05T10:00:00Z. Null if
 * unreadable. Slash dates with the year last are refused, because 03/05/2024 is
 * March 5 in some exports and 3 May in others and a guess would move a sale
 * across a tax year or a 30-day window.
 */
export function parseDate(v) {
  const m = String(v ?? "").trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?!\d)/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const t = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

export const SAMPLE_CSV = `date,type,asset,quantity,cad value,fee,to asset,to quantity
2023-03-10,buy,BTC,0.5,15000,20,,
2023-09-05,buy,BTC,0.3,9600,15,,
2024-02-14,income,ETH,1.2,3900,,,
2024-05-02,sell,BTC,0.4,16000,25,,
2024-11-04,sell,BTC,0.2,5400,18,,
2024-11-20,buy,BTC,0.15,4050,12,,
2025-01-15,swap,ETH,0.7,3200,6,SOL,15
2025-03-03,sell,SOL,5,1100,4,,
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
    if (col[need] === undefined) return { transactions: [], warnings: [`Missing a "${need}" column. Expected: date, type, asset, quantity, CAD value (fee, to asset, to quantity optional).`] };
  }
  const transactions = [];
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    const get = (k) => (col[k] === undefined ? "" : (r[col[k]] ?? "").trim());
    const kind = kindOf(get("type"));
    if (kind === "transfer") return warnings.push(`Line ${line}: a transfer between your own wallets is not a disposition and does not change your ACB. Skipped.`);
    const date = parseDate(get("date"));
    const asset = get("asset").toUpperCase();
    const quantity = Math.abs(parseNumber(get("quantity")));
    const value = Math.abs(parseNumber(get("value")));
    const feeRaw = get("fee");
    const fee = feeRaw === "" ? 0 : Math.abs(parseNumber(feeRaw));
    if (!date) return warnings.push(`Line ${line}: unreadable date "${get("date")}" (use YYYY-MM-DD). Skipped.`);
    if (!kind) return warnings.push(`Line ${line}: unknown type "${get("type")}" (use buy, sell, income or swap). Skipped.`);
    if (!asset) return warnings.push(`Line ${line}: no asset. Skipped.`);
    if (!(quantity > 0)) return warnings.push(`Line ${line}: quantity must be above zero. Skipped.`);
    if (Number.isNaN(value)) return warnings.push(`Line ${line}: no CAD value, and none is guessed. Skipped.`);
    if (Number.isNaN(fee)) return warnings.push(`Line ${line}: unreadable fee. Skipped.`);
    const t = { date, kind, asset, quantity, value, fee, line };
    if (kind === "swap") {
      t.toAsset = get("toAsset").toUpperCase();
      t.toQuantity = Math.abs(parseNumber(get("toQuantity")));
      if (!t.toAsset || !(t.toQuantity > 0)) return warnings.push(`Line ${line}: a swap needs "to asset" and "to quantity". Skipped.`);
      if (t.toAsset === t.asset) return warnings.push(`Line ${line}: a swap into the same coin is not a disposition. Skipped.`);
    }
    transactions.push(t);
  });
  return { transactions, warnings };
}

// ---------------------------------------------------------------------------
// ACB and the superficial loss rule

/**
 * Turn transactions into acquisitions and dispositions. `amount` is the cost
 * added to the ACB for an acquisition (fees included) and the proceeds net of
 * outlays for a disposition. Order within a day is file order.
 */
function toEvents(transactions) {
  const ev = [];
  let seq = 0;
  const add = (e) => ev.push({ ...e, seq: seq++ });
  for (const t of transactions) {
    if (t.kind === "buy") add({ asset: t.asset, date: t.date, side: "acq", qty: t.quantity, amount: t.value + t.fee, line: t.line });
    else if (t.kind === "income") add({ asset: t.asset, date: t.date, side: "acq", qty: t.quantity, amount: t.value + t.fee, income: true, line: t.line });
    else if (t.kind === "sell") add({ asset: t.asset, date: t.date, side: "disp", qty: t.quantity, amount: t.value - t.fee, line: t.line });
    else if (t.kind === "swap") {
      add({ asset: t.asset, date: t.date, side: "disp", qty: t.quantity, amount: t.value - t.fee, line: t.line, swap: true });
      add({ asset: t.toAsset, date: t.date, side: "acq", qty: t.toQuantity, amount: t.value, line: t.line, swap: true });
    }
  }
  return ev.sort((a, b) => (a.date === b.date ? a.seq - b.seq : a.date < b.date ? -1 : 1));
}

/**
 * Walk one coin's events in date order. Returns { rows, pool, snapshots, warnings }.
 * rows: one per disposition: { date, asset, quantity, proceeds, acb, gain,
 *   denied, allowedGain, superficial: null | { acquiredInWindow, heldAtEnd, share } }.
 */
function walkAsset(asset, events) {
  const rows = [];
  const warnings = [];
  const snapshots = [];
  let qty = 0, cost = 0, pending = 0;

  const heldAtEndOf = (date) => events.reduce((s, e) => (e.date <= date ? s + (e.side === "acq" ? e.qty : -e.qty) : s), 0);

  for (const e of events) {
    if (e.side === "acq") {
      qty += e.qty;
      cost += e.amount + pending;
      pending = 0;
    } else {
      const covered = Math.min(e.qty, qty);
      const acb = qty > EPS ? (cost * covered) / qty : 0;
      if (e.qty > qty + EPS) warnings.push(`${asset}: ${e.date} disposes of ${fmtQty(e.qty - qty)} more than you held. That part has no cost on record, so the gain is overstated. Add the missing purchase or income row (a transfer in from another wallet keeps its original cost).`);
      const gain = e.amount - acb;
      let denied = 0, superficial = null;
      if (gain < -0.005) {
        // Superficial loss: S units sold, P bought in the 61-day window, B still held at the end of the 30th day after.
        const acquiredInWindow = events.reduce((s, x) => (x.side === "acq" && Math.abs(dayDiff(e.date, x.date)) <= 30 ? s + x.qty : s), 0);
        const lastDay = new Date(Date.parse(`${e.date}T00:00:00Z`) + 30 * 864e5).toISOString().slice(0, 10);
        const heldAtEnd = Math.max(0, heldAtEndOf(lastDay));
        const share = Math.min(e.qty, acquiredInWindow, heldAtEnd) / e.qty;
        if (share > EPS) {
          denied = -gain * share;
          superficial = { acquiredInWindow, heldAtEnd, share };
        }
      }
      qty -= covered;
      cost -= acb;
      if (qty < EPS) { qty = 0; if (Math.abs(cost) < 0.005) cost = 0; }
      if (denied > 0) {
        // The denied loss becomes part of the ACB of the units that were bought instead.
        if (qty > EPS) cost += denied;
        else pending += denied;
      }
      rows.push({ date: e.date, asset, quantity: e.qty, proceeds: e.amount, acb, gain, denied, allowedGain: gain + denied, superficial, swap: Boolean(e.swap), line: e.line });
    }
    snapshots.push({ date: e.date, quantity: qty, cost });
  }
  if (pending > 0.005) warnings.push(`${asset}: a superficial loss of ${round2(pending).toFixed(2)} was denied but no later purchase is in the file to carry it. It is shown as denied, not added to any cost.`);
  return { rows, pool: { quantity: qty, cost }, snapshots, warnings };
}

/**
 * Run the full calculation. Returns { dispositions, pools, poolsByYear, income, warnings }.
 */
export function analyse(transactions) {
  const events = toEvents(transactions);
  const assets = [...new Set(events.map((e) => e.asset))].sort();
  const dispositions = [];
  const pools = {};
  const snapshotsByAsset = {};
  const warnings = [];
  for (const a of assets) {
    const r = walkAsset(a, events.filter((e) => e.asset === a));
    dispositions.push(...r.rows);
    if (r.pool.quantity > EPS) pools[a] = { quantity: r.pool.quantity, cost: r.pool.cost };
    snapshotsByAsset[a] = r.snapshots;
    warnings.push(...r.warnings);
  }
  dispositions.sort((x, y) => (x.date === y.date ? x.asset.localeCompare(y.asset) || x.line - y.line : x.date < y.date ? -1 : 1));
  for (const d of dispositions) d.taxYear = taxYearOf(d.date);

  const years = new Set(dispositions.map((d) => d.taxYear));
  for (const ev of events) years.add(taxYearOf(ev.date));
  const poolsByYear = {};
  for (const y of years) {
    poolsByYear[y] = {};
    for (const a of assets) {
      const snap = snapshotsByAsset[a].filter((s) => s.date <= `${y}-12-31`).pop();
      if (snap && snap.quantity > EPS) poolsByYear[y][a] = { quantity: snap.quantity, cost: snap.cost };
    }
  }
  const income = events
    .filter((e) => e.income)
    .map((e) => ({ date: e.date, asset: e.asset, quantity: e.qty, value: e.amount, taxYear: taxYearOf(e.date) }));
  return { dispositions, pools, poolsByYear, income, warnings };
}

// ---------------------------------------------------------------------------
// Year summary and estimate

/**
 * Summarise one calendar year. `opts.inclusionRate` defaults to 50%;
 * `opts.netCapitalLossesBroughtForward` is unused net capital losses (already
 * at the inclusion rate, as on your Notice of Assessment) from earlier years;
 * `opts.marginalRate` is your combined federal and provincial rate on the
 * extra income, as a fraction, for the optional tax estimate.
 */
export function summarise(dispositions, year, opts = {}) {
  const rate = opts.inclusionRate ?? INCLUSION_RATE;
  const rows = dispositions.filter((d) => d.taxYear === year);
  const proceeds = rows.reduce((s, r) => s + r.proceeds, 0);
  const acb = rows.reduce((s, r) => s + r.acb, 0);
  const gains = rows.reduce((s, r) => s + Math.max(0, r.allowedGain), 0);
  const losses = rows.reduce((s, r) => s + Math.max(0, -r.allowedGain), 0);
  const denied = rows.reduce((s, r) => s + r.denied, 0);
  const net = gains - losses;
  const bf = Math.max(0, opts.netCapitalLossesBroughtForward ?? 0);
  const taxableGain = Math.max(0, net) * rate;
  const netCapitalLoss = Math.max(0, -net) * rate;
  const bfUsed = Math.min(bf, taxableGain);
  const taxableAfterLosses = taxableGain - bfUsed;
  const lossCarried = bf - bfUsed + netCapitalLoss;
  const tax = opts.marginalRate === undefined ? null : taxableAfterLosses * opts.marginalRate;
  return {
    year, rows: rows.length, proceeds, acb, gains, losses, denied, net, inclusionRate: rate,
    taxableGain, bfUsed, taxableAfterLosses, netCapitalLoss, lossCarried, tax,
  };
}

export function overview(transactions, opts = {}) {
  const a = analyse(transactions);
  const years = [...new Set(a.dispositions.map((d) => d.taxYear))].sort();
  let carried = opts.netCapitalLossesBroughtForward ?? 0;
  const summaries = [];
  for (const y of years) {
    const s = summarise(a.dispositions, y, { ...opts, netCapitalLossesBroughtForward: carried });
    summaries.push(s);
    carried = s.lossCarried;
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

/** One row per disposition: the working to keep with your records. */
export function toDispositionsCsv(dispositions) {
  const head = ["year", "date", "coin", "units", "proceeds CAD (after outlays)", "ACB CAD", "gain or loss CAD", "superficial loss denied CAD", "gain or loss claimed CAD", "note"];
  const lines = [head.join(",")];
  for (const d of dispositions) {
    const note = d.superficial
      ? `superficial loss: ${fmtQty(d.superficial.acquiredInWindow)} bought in the 61-day window, ${fmtQty(d.superficial.heldAtEnd)} held after day 30, ${round2(d.superficial.share * 100)}% of the loss denied and added to ACB`
      : d.swap ? "coin-for-coin swap" : "";
    lines.push([d.taxYear, d.date, d.asset, fmtQty(d.quantity), round2(d.proceeds).toFixed(2), round2(d.acb).toFixed(2), round2(d.gain).toFixed(2), round2(d.denied).toFixed(2), round2(d.allowedGain).toFixed(2), note].map(csvCell).join(","));
  }
  return lines.join("\n") + "\n";
}

export function toPoolCsv(pools) {
  const lines = ["coin,units held,total ACB CAD,ACB per unit CAD"];
  for (const [a, p] of Object.entries(pools)) lines.push([a, fmtQty(p.quantity), round2(p.cost).toFixed(2), round2(p.cost / p.quantity).toFixed(2)].map(csvCell).join(","));
  return lines.join("\n") + "\n";
}
