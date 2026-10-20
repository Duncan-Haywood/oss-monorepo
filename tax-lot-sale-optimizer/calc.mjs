// Tax-lot sale optimizer for one security held in several purchase lots. Pure functions, no dependencies,
// nothing leaves the browser. It picks WHICH lots to sell (specific identification) to raise a cash amount
// or a share count at the lowest federal-plus-state tax on the sale, and compares that with FIFO, LIFO and
// highest-cost-first. Rates are typed by the user; this file embeds no tax table.
//
// Model:
//   gain per share   = price - cost per share, per lot
//   long-term        = sale date strictly after the first anniversary of the purchase date
//   tax on a year    = Schedule D netting of short-term and long-term totals (year-to-date amounts included):
//                      short with short, long with long, then net against each other; a remaining net gain is
//                      taxed at the rate of the character that survives; a remaining net loss offsets
//                      ordinary income up to $3,000 and the rest carries forward (reported, not valued)
//   tax of the sale  = tax(year with sale) - tax(year without it)
//   optimum          = within one holding-period pool, selling the highest-cost lots first always gives the
//                      lowest gain, and tax never falls as a gain rises, so the only free choice is how many
//                      shares come from the short-term pool; that is a one-variable problem searched exactly.

export const LOSS_DEDUCTION_CAP = 3000;

export const DEFAULTS = {
  price: 100,
  targetMode: "cash",
  target: 20000,
  saleDate: "2026-10-15",
  ordinaryRatePct: 32,
  ltRatePct: 15,
  stateRatePct: 5,
  niitPct: 0,
  ytdShort: 6000,
  ytdLong: 0,
  wholeShares: 1,
  lotsText: [
    "2021-03-10, 120, 38.50",
    "2022-11-02, 80, 142.00",
    "2023-06-15, 100, 61.25",
    "2024-02-20, 60, 118.40",
    "2025-10-28, 50, 74.00",
    "2026-03-12, 40, 131.75",
    "2026-09-25, 30, 109.10",
  ].join("\n"),
};

export function num(v) {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[$,%\s]/g, "");
  return s === "" ? NaN : Number(s);
}
const nz = (x) => (Number.isFinite(x) && x > 0 ? x : 0);
const DAY = 86400000;

export function money(x) {
  if (!Number.isFinite(x)) return "n/a";
  const n = Math.round(x);
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US");
}
export function pct(x, d = 1) {
  return Number.isFinite(x) ? (x * 100).toFixed(d) + "%" : "n/a";
}

// "2024-03-15" or "3/15/2024" -> UTC midnight in ms, or NaN.
export function parseDate(s) {
  const t = String(s ?? "").trim();
  let y, m, d;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (r) [y, m, d] = [r[1], r[2], r[3]];
  else if ((r = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t))) [m, d, y] = [r[1], r[2], r[3]];
  else return NaN;
  const ms = Date.UTC(+y, +m - 1, +d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== +y || back.getUTCMonth() !== +m - 1 || back.getUTCDate() !== +d) return NaN;
  return ms;
}
export function isoDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}
function anniversary(ms) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate());
}
// Held "more than one year": a sale ON the anniversary is still short-term.
export function isLongTerm(acquired, saleMs) {
  return saleMs > anniversary(acquired);
}
export function daysToLongTerm(acquired, saleMs) {
  return isLongTerm(acquired, saleMs) ? 0 : Math.round((anniversary(acquired) + DAY - saleMs) / DAY);
}

// Lines of: date, shares, cost per share. A first line that is a header is skipped.
export function parseLots(text) {
  const lots = [];
  const errors = [];
  const lines = String(text ?? "").split(/\r?\n/);
  let seenData = false;
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    let f = line.split(/[,\t;]/).map((x) => x.trim());
    if (f.length === 1) f = line.split(/\s+/);
    const acquired = parseDate(f[0]);
    if (!seenData && Number.isNaN(acquired) && /[a-z]/i.test(line)) return;
    seenData = true;
    const shares = num(f[1]);
    const cost = num(f[2]);
    if (f.length < 3 || Number.isNaN(acquired)) return errors.push(`Line ${i + 1}: expected date, shares, cost per share (date as 2024-03-15 or 3/15/2024).`);
    if (!(shares > 0)) return errors.push(`Line ${i + 1}: shares must be a positive number.`);
    if (!(cost >= 0)) return errors.push(`Line ${i + 1}: cost per share must be zero or more.`);
    lots.push({ id: lots.length + 1, acquired, shares, cost });
  });
  return { lots, errors };
}

function rates(o) {
  const state = nz(o.stateRatePct) / 100;
  const niit = nz(o.niitPct) / 100;
  return {
    st: nz(o.ordinaryRatePct) / 100 + state + niit,
    lt: nz(o.ltRatePct) / 100 + state + niit,
    ord: nz(o.ordinaryRatePct) / 100 + state,
  };
}

// Tax (negative = saving) on a year's net short-term and long-term totals, plus the loss carried forward.
export function yearTax(st, lt, r) {
  let tax;
  let carry = 0;
  if (st >= 0 && lt >= 0) tax = st * r.st + lt * r.lt;
  else if (st >= 0) {
    const net = st + lt; // long-term loss eats short-term gain first
    tax = net >= 0 ? net * r.st : 0;
    if (net < 0) ({ tax, carry } = lossCase(-net, r));
  } else if (lt >= 0) {
    const net = st + lt; // short-term loss eats long-term gain
    tax = net >= 0 ? net * r.lt : 0;
    if (net < 0) ({ tax, carry } = lossCase(-net, r));
  } else ({ tax, carry } = lossCase(-(st + lt), r));
  return { tax, carry };
}
function lossCase(loss, r) {
  const used = Math.min(loss, LOSS_DEDUCTION_CAP);
  return { tax: -used * r.ord, carry: loss - used };
}

// Take `want` shares from lots in the given order. Returns shares taken per lot id.
function take(ordered, want) {
  const out = new Map();
  let left = want;
  for (const l of ordered) {
    if (left <= 1e-9) break;
    const s = Math.min(l.shares, left);
    if (s > 0) out.set(l.id, s);
    left -= s;
  }
  return out;
}
const byBasisDesc = (a, b) => b.cost - a.cost || a.acquired - b.acquired;

function evaluate(alloc, lots, price, saleMs, base, r) {
  let stGain = 0, ltGain = 0, shares = 0;
  const rows = [];
  for (const l of lots) {
    const s = alloc.get(l.id) || 0;
    if (!s) continue;
    const gain = s * (price - l.cost);
    const lt = isLongTerm(l.acquired, saleMs);
    if (lt) ltGain += gain; else stGain += gain;
    shares += s;
    rows.push({ id: l.id, acquired: l.acquired, shares: s, cost: l.cost, gain, longTerm: lt });
  }
  const before = yearTax(base.st, base.lt, r);
  const after = yearTax(base.st + stGain, base.lt + ltGain, r);
  return { rows, shares, proceeds: shares * price, stGain, ltGain, tax: after.tax - before.tax, carry: after.carry };
}

// Lowest-tax allocation of `want` shares. `whole` restricts the short-term pool count to whole shares.
function optimal(lots, want, price, saleMs, base, r, whole) {
  const st = lots.filter((l) => !isLongTerm(l.acquired, saleMs)).sort(byBasisDesc);
  const lt = lots.filter((l) => isLongTerm(l.acquired, saleMs)).sort(byBasisDesc);
  const stTot = st.reduce((a, l) => a + l.shares, 0);
  const ltTot = lt.reduce((a, l) => a + l.shares, 0);
  const lo = Math.max(0, want - ltTot);
  const hi = Math.min(want, stTot);
  const build = (x) => {
    const a = take(st, x);
    for (const [k, v] of take(lt, want - x)) a.set(k, v);
    return a;
  };
  const cost = (x) => evaluate(build(x), lots, price, saleMs, base, r).tax;
  const cands = new Set([lo, hi]);
  // every lot boundary in either pool is a place the slope of the gain curve changes
  let run = 0;
  for (const l of st) { run += l.shares; cands.add(run); }
  run = 0;
  for (const l of lt) { run += l.shares; cands.add(want - run); }
  const G = 400;
  for (let i = 0; i <= G; i++) cands.add(lo + ((hi - lo) * i) / G);
  let list = [...cands].filter((x) => x >= lo - 1e-9 && x <= hi + 1e-9).map((x) => Math.min(hi, Math.max(lo, x)));
  if (whole) list = list.map((x) => Math.round(x));
  let best = list[0], bt = Infinity;
  for (const x of list) { const t = cost(x); if (t < bt - 1e-9) { bt = t; best = x; } }
  // local refinement between the best candidate's neighbours
  const step = whole ? 1 : Math.max((hi - lo) / G / 2, 1e-6);
  let span = Math.max(step * 3, 0);
  for (let k = 0; k < 40 && span > (whole ? 0.5 : 1e-7); k++) {
    for (const x0 of [best - span, best + span, best - span / 2, best + span / 2]) {
      let x = Math.min(hi, Math.max(lo, x0));
      if (whole) x = Math.round(x);
      const t = cost(x);
      if (t < bt - 1e-9) { bt = t; best = x; }
    }
    span /= 2;
  }
  return build(best);
}

export function plan(lots, want, price, saleMs, base, r, method, whole) {
  const order = {
    fifo: [...lots].sort((a, b) => a.acquired - b.acquired || a.id - b.id),
    lifo: [...lots].sort((a, b) => b.acquired - a.acquired || b.id - a.id),
    hifo: [...lots].sort(byBasisDesc),
  };
  const alloc = method === "optimal" ? optimal(lots, want, price, saleMs, base, r, whole) : take(order[method], want);
  return evaluate(alloc, lots, price, saleMs, base, r);
}

export const METHODS = [
  ["optimal", "Lowest tax (pick lots)"],
  ["hifo", "Highest cost first"],
  ["fifo", "FIFO (oldest first)"],
  ["lifo", "LIFO (newest first)"],
];

export function analyze(o) {
  const warnings = [];
  const { lots, errors } = parseLots(o.lotsText);
  warnings.push(...errors);
  const price = nz(num(o.price));
  const saleMs = parseDate(o.saleDate);
  if (!(price > 0)) warnings.push("Enter the sale price per share.");
  if (Number.isNaN(saleMs)) warnings.push("Enter the sale date as 2026-10-15 or 10/15/2026.");
  if (!lots.length) warnings.push("Paste at least one lot: date, shares, cost per share.");
  const held = lots.reduce((a, l) => a + l.shares, 0);
  let want = o.targetMode === "shares" ? nz(num(o.target)) : nz(num(o.target)) / (price || 1);
  if (!(want > 0)) warnings.push(o.targetMode === "shares" ? "Enter how many shares to sell." : "Enter the cash you need to raise.");
  if (warnings.length) return { warnings, rows: [] };
  const whole = Boolean(Number(o.wholeShares));
  // Whole shares: cash targets round up so the sale covers the need; share targets round to a count.
  if (whole) want = o.targetMode === "shares" ? Math.round(want) : Math.ceil(want - 1e-9);
  if (want > held + 1e-9) {
    warnings.push(`You hold ${held.toLocaleString("en-US")} shares, which raises ${money(held * price)}; the plan sells all of them.`);
    want = held;
  }
  const r = rates(o);
  const base = { st: Number.isFinite(num(o.ytdShort)) ? num(o.ytdShort) : 0, lt: Number.isFinite(num(o.ytdLong)) ? num(o.ytdLong) : 0 };
  const results = METHODS.map(([key, label]) => ({ key, label, ...plan(lots, want, price, saleMs, base, r, key, whole) }));
  const best = results[0];
  const fifo = results.find((x) => x.key === "fifo");
  const lotById = new Map(lots.map((l) => [l.id, l]));

  // Wash-sale risk: a lot sold at a loss while shares were bought in the 30 days up to the sale date.
  const recent = lots.filter((l) => l.acquired <= saleMs && saleMs - l.acquired <= 30 * DAY);
  const washRisk = best.rows.filter((x) => x.gain < 0).length > 0 && recent.some((l) => !best.rows.some((x) => x.id === l.id && x.shares >= l.shares - 1e-9));
  const washLots = washRisk ? best.rows.filter((x) => x.gain < 0).map((x) => x.id) : [];

  // If you waited: re-run the optimum on each date a short-term lot turns long-term (same price assumed).
  const flips = new Set();
  for (const l of lots) {
    if (!isLongTerm(l.acquired, saleMs)) {
      const d = daysToLongTerm(l.acquired, saleMs);
      if (d > 0 && d <= 90) flips.add(d);
    }
  }
  const waits = [...flips].sort((a, b) => a - b).slice(0, 6).map((d) => {
    const ms = saleMs + d * DAY;
    const p = plan(lots, want, price, ms, base, r, "optimal", whole);
    return { days: d, date: isoDate(ms), tax: p.tax, saving: best.tax - p.tax };
  });

  return { warnings, rows: best.rows, results, best, savingVsFifo: fifo.tax - best.tax, want, held, rates: r, lotById, washLots, waits, base };
}

export function toCsv(a) {
  const lines = ["lot,purchase_date,shares_to_sell,cost_per_share,term,gain_or_loss"];
  for (const x of a.best.rows) lines.push([x.id, isoDate(x.acquired), +x.shares.toFixed(4), x.cost.toFixed(4), x.longTerm ? "long" : "short", x.gain.toFixed(2)].join(","));
  return lines.join("\n") + "\n";
}
