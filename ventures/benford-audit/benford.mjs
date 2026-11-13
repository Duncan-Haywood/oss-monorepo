// Benford's-law digit tests for forensic review of financial data.
//
// The test suite follows Mark Nigrini, "Benford's Law: Applications for
// Forensic Accounting, Auditing, and Fraud Detection" (Wiley, 2012): the
// first-digit, second-digit and first-two-digits tests with his Z statistic
// and mean-absolute-deviation (MAD) conformity bands, the summation test, the
// last-two-digits test and the number-duplication test. Two additions sit on
// top: a just-under-threshold test (are amounts piling up below an approval
// limit?) and a per-group ranking (which vendor, employee or card holder
// departs most from Benford), corrected for each group's sample size and for
// testing many groups at once.
//
// Everything is pure functions on plain arrays, so the page, the CLI and the
// tests share one implementation. No dependencies.

export const LOG10 = Math.log10;

// ---------------------------------------------------------------------------
// Expected distributions

/** P(first digit = d), d = 1..9. */
export function expectedFirst() {
  const out = {};
  for (let d = 1; d <= 9; d++) out[d] = LOG10(1 + 1 / d);
  return out;
}

/** P(second digit = d), d = 0..9: sum over first digits of P(first two = 10k+d). */
export function expectedSecond() {
  const out = {};
  for (let d = 0; d <= 9; d++) {
    let p = 0;
    for (let k = 1; k <= 9; k++) p += LOG10(1 + 1 / (10 * k + d));
    out[d] = p;
  }
  return out;
}

/** P(first two digits = dd), dd = 10..99. */
export function expectedFirstTwo() {
  const out = {};
  for (let dd = 10; dd <= 99; dd++) out[dd] = LOG10(1 + 1 / dd);
  return out;
}

/** Last two digits are expected to be uniform: 1/100 each, 00..99. */
export function expectedLastTwo() {
  const out = {};
  for (let d = 0; d <= 99; d++) out[d] = 0.01;
  return out;
}

// Nigrini (2012), table 7.1: MAD ranges for each conformity verdict.
export const MAD_BANDS = {
  first: [0.006, 0.012, 0.015],
  second: [0.008, 0.010, 0.012],
  firstTwo: [0.0012, 0.0018, 0.0022],
};
export const VERDICTS = ['close conformity', 'acceptable conformity', 'marginally acceptable conformity', 'nonconformity'];

export function madVerdict(test, mad) {
  const bands = MAD_BANDS[test];
  if (!bands) return null;
  for (let i = 0; i < bands.length; i++) if (mad <= bands[i]) return VERDICTS[i];
  return VERDICTS[3];
}

// ---------------------------------------------------------------------------
// Parsing amounts

/**
 * Parse a money-ish string into a number, or null.
 * Handles currency symbols and codes, thousands separators, accounting
 * parentheses for negatives, trailing minus, and European "1.234,56".
 */
export function parseAmount(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1).trim(); }
  if (/-$/.test(s)) { negative = !negative; s = s.slice(0, -1).trim(); }
  if (/^[A-Za-z]{3}\s/.test(s)) s = s.slice(3).trim();
  if (/\s[A-Za-z]{3}$/.test(s)) s = s.slice(0, -3).trim();
  s = s.replace(/[$€£¥₹₩₽¢]|CHF|kr/g, '').replace(/[\s  ']/g, '');
  if (s.startsWith('-')) { negative = !negative; s = s.slice(1); }
  else if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('-')) { negative = !negative; s = s.slice(1); }
  if (!/^[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // Whichever separator comes last is the decimal mark.
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const parts = s.split(',');
    // "1,234" or "1,234,567" is a thousands grouping; "12,5" or "1234,56" is a decimal comma.
    const grouped = parts.length > 1 && parts.slice(1).every((p) => p.length === 3) && parts[0].length <= 3 && parts[0].length > 0;
    s = grouped ? parts.join('') : (parts.length === 2 ? parts.join('.') : null);
    if (s === null) return null;
  } else if (lastDot >= 0) {
    const parts = s.split('.');
    if (parts.length > 2) {
      // "1.234.567" is a European thousands grouping.
      if (parts.slice(1).every((p) => p.length === 3)) s = parts.join('');
      else return null;
    }
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/**
 * Read a typed list of limits. "5,000, 10,000", "5000;10000" and "5000 10000"
 * all give [5000, 10000]: a comma followed by exactly three digits is a
 * thousands separator, any other comma, semicolon or space separates items.
 */
export function parseLimitList(text) {
  return String(text ?? '')
    .split(/;|\s+|,(?!\d{3}(?!\d))/)
    .map((part) => parseAmount(part))
    .filter((x) => x !== null && x > 0);
}

// ---------------------------------------------------------------------------
// Digits

/**
 * The significant digits of |x| as a string of `k` characters, read from
 * the decimal form at 13 significant figures so binary floating point never
 * leaks in (0.1 + 0.2 is 0.30000000000000004, whose first two digits are 30).
 */
export function significantDigits(x, k) {
  const a = Math.abs(x);
  if (!(a > 0) || !Number.isFinite(a)) return null;
  // Cut from 13 figures rather than asking for k, which would round
  // 1999.995 up to "20".
  const exp = a.toExponential(12); // "d.dddddddddddde±n"
  const mantissa = exp.split('e')[0].replace('.', '');
  return mantissa.slice(0, k);
}

export function firstDigit(x) {
  const s = significantDigits(x, 1);
  return s ? Number(s) : null;
}
export function secondDigit(x) {
  const s = significantDigits(x, 2);
  return s ? Number(s[1]) : null;
}
export function firstTwoDigits(x) {
  const s = significantDigits(x, 2);
  return s ? Number(s) : null;
}

/**
 * Last two digits. With `cents` true the last two digits are the cents
 * (amounts recorded to the cent); otherwise the last two whole-number digits,
 * for which Nigrini restricts the test to amounts of 100 or more.
 */
export function lastTwoDigits(x, cents) {
  const a = Math.abs(x);
  if (cents) return Math.round(a * 100) % 100;
  const whole = Math.round(a);
  if (whole < 100) return null;
  return whole % 100;
}

// ---------------------------------------------------------------------------
// Statistics

/** Nigrini's Z statistic for one digit, with the continuity correction. */
export function zStat(observedProp, expectedProp, n) {
  const diff = Math.abs(observedProp - expectedProp);
  const cc = 1 / (2 * n);
  const num = diff > cc ? diff - cc : diff;
  return num / Math.sqrt((expectedProp * (1 - expectedProp)) / n);
}

// Lanczos approximation of ln Γ(x).
function lnGamma(x) {
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularized upper incomplete gamma Q(s, x), by series or continued fraction. */
export function gammaQ(s, x) {
  if (x <= 0) return 1;
  if (x < s + 1) {
    let sum = 1 / s;
    let term = sum;
    for (let n = 1; n < 1000; n++) {
      term *= x / (s + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
    }
    return Math.max(0, 1 - sum * Math.exp(-x + s * Math.log(x) - lnGamma(s)));
  }
  // Lentz's continued fraction.
  let b = x + 1 - s;
  let c = 1 / 1e-300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - s);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-15) break;
  }
  return Math.min(1, Math.exp(-x + s * Math.log(x) - lnGamma(s)) * h);
}

/** Upper-tail p-value of a chi-square statistic. */
export function chiSquareP(stat, df) {
  return gammaQ(df / 2, stat / 2);
}

/** Standard normal upper-tail probability. */
export function normalUpper(z) {
  // Abramowitz-Stegun 7.1.26 via erfc is too coarse in the tail; use the
  // complementary error function from a continued fraction (W. J. Cody style).
  return 0.5 * erfc(z / Math.SQRT2);
}

function erfc(x) {
  if (x < 0) return 2 - erfc(-x);
  // Numerical Recipes erfc, fractional error < 1.2e-7.
  const t = 1 / (1 + 0.5 * x);
  const y = t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418
    + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587
    + t * (-0.82215223 + t * 0.17087277)))))))));
  return y;
}

/** One-sided binomial upper tail P(X >= k) for X ~ Bin(n, p), exact by log terms. */
export function binomialUpper(k, n, p) {
  if (k <= 0) return 1;
  if (k > n) return 0;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const lnFact = (m) => lnGamma(m + 1);
  let total = 0;
  for (let i = k; i <= n; i++) {
    total += Math.exp(lnFact(n) - lnFact(i) - lnFact(n - i) + i * Math.log(p) + (n - i) * Math.log(1 - p));
  }
  return Math.min(1, total);
}

/**
 * Expected MAD of a sample of size n drawn from the distribution itself
 * (E|p̂ - p| ≈ sqrt(2 p (1-p) / (π n)) per bin). Subtracting it gives an
 * "excess MAD" that does not punish small samples for their noise.
 */
export function expectedMad(expected, n) {
  const keys = Object.keys(expected);
  let sum = 0;
  for (const k of keys) {
    const p = expected[k];
    sum += Math.sqrt((2 * p * (1 - p)) / (Math.PI * n));
  }
  return sum / keys.length;
}

/** Benjamini-Hochberg q-values for an array of p-values (same order). */
export function bhQValues(ps) {
  const m = ps.length;
  const order = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  const q = new Array(m);
  let running = 1;
  for (let r = m - 1; r >= 0; r--) {
    const [p, i] = order[r];
    running = Math.min(running, (p * m) / (r + 1));
    q[i] = running;
  }
  return q;
}

// ---------------------------------------------------------------------------
// A digit test

/**
 * Run one digit test.
 * @param {number[]} keys digit value per record (null = excluded)
 * @param {Object<string, number>} expected probability per digit
 * @param {string} test one of first, second, firstTwo, lastTwo
 */
export function digitTest(keys, expected, test) {
  const counts = {};
  for (const k of Object.keys(expected)) counts[k] = 0;
  let n = 0;
  for (const k of keys) {
    if (k === null || k === undefined) continue;
    if (!(k in counts)) continue;
    counts[k]++;
    n++;
  }
  const rows = [];
  let madSum = 0;
  let chi = 0;
  for (const k of Object.keys(expected)) {
    const e = expected[k];
    const obs = counts[k];
    const p = n ? obs / n : 0;
    const z = n ? zStat(p, e, n) : 0;
    madSum += Math.abs(p - e);
    if (n) chi += ((obs - n * e) ** 2) / (n * e);
    rows.push({ digit: Number(k), count: obs, observed: p, expected: e, diff: p - e, z, significant: n > 0 && z > 1.96 });
  }
  const bins = rows.length;
  const mad = n ? madSum / bins : 0;
  const df = bins - 1;
  return {
    test,
    n,
    rows,
    mad,
    expectedMad: n ? expectedMad(expected, n) : null,
    verdict: n ? madVerdict(test, mad) : null,
    chiSquare: chi,
    df,
    p: n ? chiSquareP(chi, df) : null,
  };
}

// ---------------------------------------------------------------------------
// The full audit

export const DEFAULTS = {
  sign: 'positive', // 'positive' | 'negative' | 'both' (absolute values)
  minAmount: 10, // Nigrini drops amounts under 10 from the first-order tests
  thresholds: [], // approval limits for the just-under test
  thresholdBand: 0.1, // look 10% below and above each limit
  groupMin: 50, // smallest group ranked
  topDuplicates: 15,
};

/**
 * Select the records the tests read.
 * @param {{amount:number|null, group?:string, row:number}[]} records
 */
export function selectRecords(records, opts) {
  const o = { ...DEFAULTS, ...opts };
  const kept = [];
  let parsed = 0;
  let unparsed = 0;
  let zero = 0;
  let wrongSign = 0;
  let small = 0;
  for (const r of records) {
    if (r.amount === null || r.amount === undefined || Number.isNaN(r.amount)) { unparsed++; continue; }
    parsed++;
    if (r.amount === 0) { zero++; continue; }
    if (o.sign === 'positive' && r.amount < 0) { wrongSign++; continue; }
    if (o.sign === 'negative' && r.amount > 0) { wrongSign++; continue; }
    const value = Math.abs(r.amount);
    if (value < o.minAmount) { small++; continue; }
    kept.push({ ...r, value });
  }
  return { kept, counts: { total: records.length, parsed, unparsed, zero, wrongSign, small, kept: kept.length } };
}

/** Does the data look like something Benford's law should describe? */
export function applicability(values, counts) {
  const notes = [];
  const n = values.length;
  if (n === 0) return { ok: false, notes: ['No amounts left to test after the filters.'], spanDecades: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const q = (f) => sorted[Math.min(n - 1, Math.max(0, Math.floor(f * (n - 1))))];
  const spanDecades = LOG10(q(0.99) / q(0.01));
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const median = q(0.5);
  if (n < 300) notes.push(`Only ${n} amounts. The first-two-digits test needs about 1,000 to read reliably and the first-digit test about 300; treat every verdict below as a weak signal.`);
  else if (n < 1000) notes.push(`${n} amounts: enough for the first-digit test, thin for the first-two-digits test (Nigrini suggests 1,000 or more).`);
  if (spanDecades < 2) notes.push(`The middle 98% of amounts spans ${spanDecades.toFixed(1)} orders of magnitude. Benford's law describes data spread over several (ideally 4+); a narrow range such as fixed fees, a price list or capped reimbursements will not conform even when nothing is wrong.`);
  if (mean <= median) notes.push('The mean is not above the median. Benford-like data is right-skewed (many small amounts, few large ones); this file is not, so a misfit may be the data, not a problem.');
  if (counts && counts.unparsed > 0) notes.push(`${counts.unparsed} rows had no readable amount and were skipped.`);
  return { ok: n >= 300 && spanDecades >= 2, notes, spanDecades, mean, median };
}

/** Nigrini's summation test: sum of amounts per first-two-digits bin, expected equal. */
export function summationTest(kept) {
  const sums = {};
  for (let dd = 10; dd <= 99; dd++) sums[dd] = { sum: 0, count: 0, top: [] };
  let total = 0;
  for (const r of kept) {
    const dd = firstTwoDigits(r.value);
    if (dd === null || !(dd in sums)) continue;
    sums[dd].sum += r.value;
    sums[dd].count++;
    sums[dd].top.push(r);
    total += r.value;
  }
  const expected = 1 / 90;
  const rows = [];
  for (let dd = 10; dd <= 99; dd++) {
    const b = sums[dd];
    const share = total ? b.sum / total : 0;
    b.top.sort((x, y) => y.value - x.value);
    rows.push({ digits: dd, sum: b.sum, count: b.count, share, expected, ratio: share / expected, largest: b.top.slice(0, 3) });
  }
  const outliers = rows.filter((r) => r.ratio >= 2).sort((a, b) => b.ratio - a.ratio);
  return { total, rows, outliers };
}

/** The number-duplication test: the exact amounts that repeat most. */
export function duplicationTest(kept, top = DEFAULTS.topDuplicates) {
  const map = new Map();
  for (const r of kept) {
    const key = Math.round(r.value * 100);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  const rows = [...map.entries()]
    .filter(([, rs]) => rs.length > 1)
    .map(([key, rs]) => ({ amount: key / 100, count: rs.length, total: (key / 100) * rs.length, rows: rs.map((r) => r.row), groups: [...new Set(rs.map((r) => r.group).filter(Boolean))].slice(0, 5) }))
    .sort((a, b) => b.count - a.count || b.total - a.total);
  return { distinct: map.size, repeated: rows.length, rows: rows.slice(0, top) };
}

/** How many amounts are round: whole hundreds and whole thousands. */
export function roundNumberTest(kept) {
  let hundreds = 0;
  let thousands = 0;
  let whole = 0;
  for (const r of kept) {
    const cents = Math.round(r.value * 100);
    if (cents % 100 === 0) whole++;
    if (cents % 10000 === 0) hundreds++;
    if (cents % 100000 === 0) thousands++;
  }
  const n = kept.length;
  return { n, whole, hundreds, thousands, wholeShare: n ? whole / n : 0, hundredsShare: n ? hundreds / n : 0, thousandsShare: n ? thousands / n : 0 };
}

/**
 * Just-under-threshold test. Under a smooth 1/x (Benford) density, the share
 * of amounts in [T(1-b), T(1+b)) that fall below T is
 * ln(1/(1-b)) / (ln(1/(1-b)) + ln(1+b)), a little over half. An excess below
 * an approval limit is the classic sign of splitting or limit-shaving.
 */
export function thresholdTest(kept, thresholds, band = DEFAULTS.thresholdBand) {
  const out = [];
  for (const t of thresholds) {
    if (!(t > 0)) continue;
    const lo = t * (1 - band);
    const hi = t * (1 + band);
    const below = kept.filter((r) => r.value >= lo && r.value < t);
    const above = kept.filter((r) => r.value >= t && r.value < hi);
    const n = below.length + above.length;
    const a = Math.log(1 / (1 - band));
    const b = Math.log(1 + band);
    const pBelow = a / (a + b);
    const p = n ? binomialUpper(below.length, n, pBelow) : null;
    out.push({
      threshold: t, band, lo, hi,
      below: below.length, above: above.length,
      expectedBelow: n * pBelow,
      ratio: above.length ? below.length / above.length : (below.length ? Infinity : null),
      p,
      flagged: n >= 10 && p !== null && p < 0.01,
      rows: below.map((r) => r.row),
    });
  }
  return out;
}

/**
 * Per-group first-digit test, ranked. Each group (vendor, employee, card)
 * with at least `min` amounts gets a chi-square p-value, a Benjamini-Hochberg
 * q-value across all groups tested, and an excess MAD (MAD minus the MAD
 * expected from sampling noise at that size).
 */
export function groupTest(kept, min = DEFAULTS.groupMin) {
  const expected = expectedFirst();
  const byGroup = new Map();
  for (const r of kept) {
    if (!r.group) continue;
    if (!byGroup.has(r.group)) byGroup.set(r.group, []);
    byGroup.get(r.group).push(r);
  }
  const rows = [];
  for (const [group, rs] of byGroup) {
    if (rs.length < min) continue;
    const t = digitTest(rs.map((r) => firstDigit(r.value)), expected, 'first');
    const worst = [...t.rows].sort((a, b) => b.z - a.z)[0];
    rows.push({ group, n: t.n, mad: t.mad, expectedMad: t.expectedMad, excessMad: t.mad - t.expectedMad, chiSquare: t.chiSquare, p: t.p, worstDigit: worst.digit, worstDiff: worst.diff, total: rs.reduce((s, r) => s + r.value, 0) });
  }
  const q = bhQValues(rows.map((r) => r.p));
  rows.forEach((r, i) => { r.q = q[i]; r.flagged = q[i] < 0.05; });
  rows.sort((a, b) => a.q - b.q || b.excessMad - a.excessMad);
  return { groups: byGroup.size, tested: rows.length, min, rows };
}

/**
 * Run every test. `records` are {row, amount, group?}.
 */
export function audit(records, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const { kept, counts } = selectRecords(records, o);
  const values = kept.map((r) => r.value);
  const app = applicability(values, counts);
  const hasCents = kept.some((r) => Math.round(r.value * 100) % 100 !== 0);
  const first = digitTest(kept.map((r) => firstDigit(r.value)), expectedFirst(), 'first');
  const second = digitTest(kept.map((r) => secondDigit(r.value)), expectedSecond(), 'second');
  const firstTwo = digitTest(kept.map((r) => firstTwoDigits(r.value)), expectedFirstTwo(), 'firstTwo');
  const lastTwo = digitTest(kept.map((r) => lastTwoDigits(r.value, hasCents)), expectedLastTwo(), 'lastTwo');
  lastTwo.basis = hasCents ? 'cents' : 'whole-number digits of amounts of 100 or more';
  const summation = summationTest(kept);
  const duplication = duplicationTest(kept, o.topDuplicates);
  const round = roundNumberTest(kept);
  const thresholds = thresholdTest(kept, o.thresholds, o.thresholdBand);
  const groups = groupTest(kept, o.groupMin);
  const flagged = flagRecords(kept, { firstTwo, duplication, thresholds, summation });
  return { options: o, counts, applicability: app, first, second, firstTwo, lastTwo, summation, duplication, round, thresholds, groups, flagged };
}

/**
 * The drill-down list: every record caught by at least one test, with the
 * reasons, ordered by how many tests caught it and then by size.
 */
export function flagRecords(kept, { firstTwo, duplication, thresholds, summation }) {
  const spikes = new Set(firstTwo.rows.filter((r) => r.significant && r.diff > 0).map((r) => r.digit));
  const dupAmounts = new Map(duplication.rows.map((d) => [Math.round(d.amount * 100), d.count]));
  const sumBins = new Set(summation.outliers.map((s) => s.digits));
  const thresholdRows = new Map();
  for (const t of thresholds) if (t.flagged) for (const row of t.rows) thresholdRows.set(row, t.threshold);
  const out = [];
  for (const r of kept) {
    const reasons = [];
    const dd = firstTwoDigits(r.value);
    if (spikes.has(dd)) reasons.push(`first two digits ${dd} are over-represented`);
    const dup = dupAmounts.get(Math.round(r.value * 100));
    if (dup) reasons.push(`amount repeats ${dup} times`);
    if (thresholdRows.has(r.row)) reasons.push(`just under the ${formatMoney(thresholdRows.get(r.row))} limit`);
    if (sumBins.has(dd) && summation.rows.find((s) => s.digits === dd).largest.some((x) => x.row === r.row)) reasons.push(`one of the largest amounts in a ${dd}- bin whose total is out of line`);
    if (reasons.length) out.push({ row: r.row, amount: r.amount, group: r.group || '', reasons, score: reasons.length });
  }
  out.sort((a, b) => b.score - a.score || Math.abs(b.amount) - Math.abs(a.amount));
  return out;
}

export function formatMoney(x) {
  return Number(x).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(x) ? 0 : 2 });
}

/** A plain-English one-paragraph read of the headline tests. */
export function summarize(result) {
  const lines = [];
  const { first, firstTwo, applicability: app } = result;
  if (!first.n) return 'No amounts to test.';
  lines.push(`${first.n.toLocaleString('en-US')} amounts tested. First-digit MAD ${first.mad.toFixed(4)} (${first.verdict}); first-two-digits MAD ${firstTwo.mad.toFixed(4)} (${firstTwo.verdict}).`);
  const spikes = firstTwo.rows.filter((r) => r.significant && r.diff > 0).sort((a, b) => b.z - a.z).slice(0, 5);
  if (spikes.length) lines.push(`Most over-represented first-two digits: ${spikes.map((s) => `${s.digit} (z ${s.z.toFixed(1)})`).join(', ')}.`);
  const th = result.thresholds.filter((t) => t.flagged);
  if (th.length) lines.push(`Amounts pile up just under ${th.map((t) => formatMoney(t.threshold)).join(', ')}.`);
  if (result.duplication.rows.length) {
    const d = result.duplication.rows[0];
    lines.push(`Most repeated amount: ${formatMoney(d.amount)} (${d.count} times).`);
  }
  const g = result.groups.rows.filter((r) => r.flagged);
  if (g.length) lines.push(`${g.length} of ${result.groups.tested} groups depart from Benford after correcting for testing many groups (q < 0.05).`);
  if (!app.ok) lines.push('Read with care: the applicability checks below say this data may not be Benford-shaped to begin with.');
  return lines.join(' ');
}
