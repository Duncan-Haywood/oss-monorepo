// A/B test analysis: pooled two-proportion z-test, Katz relative-lift interval,
// sample-ratio-mismatch check, Bayesian Beta-Binomial comparison (seeded Monte
// Carlo), always-valid mSPRT p-value and interval, sample-size planning and the
// false-positive cost of peeking. Pure functions, no imports, no I/O.

export function normCdf(x) {
  // West (2005) double-precision approximation of the standard normal CDF.
  const a = Math.abs(x);
  let c;
  if (a > 37) c = 0;
  else {
    const e = Math.exp(-a * a / 2);
    if (a < 7.07106781186547) {
      let b = 3.52624965998911e-02 * a + 0.700383064443688;
      b = b * a + 6.37396220353165;
      b = b * a + 33.912866078383;
      b = b * a + 112.079291497871;
      b = b * a + 221.213596169931;
      b = b * a + 220.206867912376;
      c = e * b;
      b = 8.83883476483184e-02 * a + 1.75566716318264;
      b = b * a + 16.064177579207;
      b = b * a + 86.7807322029461;
      b = b * a + 296.564248779674;
      b = b * a + 637.333633378831;
      b = b * a + 793.826512519948;
      b = b * a + 440.413735824752;
      c = c / b;
    } else {
      let b = a + 0.65;
      b = a + 4 / b; b = a + 3 / b; b = a + 2 / b; b = a + 1 / b;
      c = e / b / 2.506628274631;
    }
  }
  return x > 0 ? 1 - c : c;
}

export function normInv(p) {
  if (!(p > 0 && p < 1)) return NaN;
  let lo = -40, hi = 40;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (normCdf(mid) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

const twoSided = (z) => 2 * normCdf(-Math.abs(z));

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalDraw(rand) {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

function gammaDraw(shape, rand) {
  // Marsaglia-Tsang; shape >= 1 always holds for a Beta(1+x, 1+y) posterior.
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const x = normalDraw(rand), v = (1 + c * x) ** 3;
    if (v <= 0) continue;
    const u = rand();
    if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
  }
}

function betaDraw(a, b, rand) {
  const x = gammaDraw(a, rand), y = gammaDraw(b, rand);
  return x / (x + y);
}

export function srmCheck(n1, n2, controlShare = 0.5) {
  const total = n1 + n2;
  const e1 = total * controlShare, e2 = total * (1 - controlShare);
  const chi2 = (n1 - e1) ** 2 / e1 + (n2 - e2) ** 2 / e2;
  return { chi2, p: twoSided(Math.sqrt(chi2)), expected: [e1, e2] };
}

// Per-arm sample size for a two-sided two-proportion test.
export function sampleSize({ baseline, mde, mode = "relative", alpha = 0.05, power = 0.8 }) {
  if (!(baseline > 0 && baseline < 1)) return { error: "Baseline conversion rate must be between 0% and 100%." };
  if (!(mde > 0)) return { error: "Minimum detectable effect must be greater than zero." };
  const p1 = baseline;
  const p2 = mode === "absolute" ? baseline + mde : baseline * (1 + mde);
  if (!(p2 > 0 && p2 < 1)) return { error: "That effect pushes the variant rate outside 0%–100%." };
  const za = normInv(1 - alpha / 2), zb = normInv(power);
  const pbar = (p1 + p2) / 2;
  const num = (za * Math.sqrt(2 * pbar * (1 - pbar)) + zb * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2;
  const perArm = Math.ceil(num / (p2 - p1) ** 2);
  return { perArm, total: perArm * 2, p1, p2, absoluteEffect: p2 - p1 };
}

export function daysToRun(total, dailyVisitors) {
  if (!(dailyVisitors > 0)) return null;
  const days = Math.ceil(total / dailyVisitors);
  return { days, weeks: Math.ceil(days / 7) };
}

// Always-valid inference for a mean difference (Johari et al. mSPRT, normal
// mixture with prior variance tau^2). Valid at every look, unlike a fixed-n p.
export function mixtureSequential(diff, variance, tau, alpha = 0.05) {
  const t2 = tau * tau;
  const lambda = Math.sqrt(variance / (variance + t2)) * Math.exp((t2 * diff * diff) / (2 * variance * (variance + t2)));
  const p = Math.min(1, 1 / lambda);
  const radius = Math.sqrt(((2 * variance * (variance + t2)) / t2) * (Math.log(1 / alpha) + 0.5 * Math.log((variance + t2) / variance)));
  return { p, low: diff - radius, high: diff + radius, significant: p < alpha };
}

// True false-positive rate if you test at `alpha` at each of `looks` equally
// spaced looks and stop the first time it is significant. Seeded simulation.
export function peekingInflation(looks, alpha = 0.05, reps = 20000, seed = 7) {
  if (looks <= 1) return alpha;
  const rand = rng(seed), z = normInv(1 - alpha / 2);
  let hits = 0;
  for (let r = 0; r < reps; r++) {
    let s = 0, hit = false;
    for (let j = 1; j <= looks; j++) {
      s += normalDraw(rand);
      if (Math.abs(s) / Math.sqrt(j) > z) { hit = true; break; }
    }
    if (hit) hits++;
  }
  return hits / reps;
}

export function bayes(c1, n1, c2, n2, draws = 20000, seed = 11) {
  const rand = rng(seed);
  let wins = 0, loss = 0, gain = 0;
  const lifts = new Float64Array(draws);
  for (let i = 0; i < draws; i++) {
    const a = betaDraw(1 + c1, 1 + n1 - c1, rand), b = betaDraw(1 + c2, 1 + n2 - c2, rand);
    if (b > a) wins++;
    loss += Math.max(a - b, 0);
    gain += Math.max(b - a, 0);
    lifts[i] = b / a - 1;
  }
  lifts.sort();
  const q = (f) => lifts[Math.min(draws - 1, Math.floor(f * draws))];
  return { probBBeatsA: wins / draws, expectedLossChoosingB: loss / draws, expectedLossChoosingA: gain / draws, liftLow: q(0.025), liftMedian: q(0.5), liftHigh: q(0.975) };
}

const isCount = (x) => Number.isInteger(x) && x >= 0;

// Price test: two fixed prices, so revenue per visitor (RPV) is conversion rate
// times price. Compares RPV, not conversion -- a price rise that loses 8% of
// buyers can still win -- and gives the conversion drop that breaks even.
export function priceTest({ n1, c1, price1, n2, c2, price2, alpha = 0.05, monthlyVisitors, draws = 20000, seed = 13 } = {}) {
  if (![n1, c1, n2, c2].every(isCount)) return { error: "Visitors and conversions must be whole numbers, zero or more." };
  if (n1 < 1 || n2 < 1) return { error: "Each price needs at least one visitor." };
  if (c1 > n1 || c2 > n2) return { error: "Conversions cannot exceed visitors." };
  if (!(price1 > 0 && price2 > 0)) return { error: "Both prices must be greater than zero." };
  if (price1 === price2) return { error: "The two prices are the same, so this is an ordinary conversion test; use the A/B panel." };
  const p1 = c1 / n1, p2 = c2 / n2;
  const rpv1 = p1 * price1, rpv2 = p2 * price2, diff = rpv2 - rpv1;
  // Delta-method variance of RPV with a fixed price: price^2 * p(1-p) / n.
  const se = Math.sqrt((price1 ** 2 * p1 * (1 - p1)) / n1 + (price2 ** 2 * p2 * (1 - p2)) / n2);
  const z = se > 0 ? diff / se : (diff === 0 ? 0 : Math.sign(diff) * Infinity);
  const p = Number.isFinite(z) ? twoSided(z) : 0;
  const zc = normInv(1 - alpha / 2);
  const ci = { low: diff - zc * se, high: diff + zc * se };
  // Posterior over RPV: Beta conversion draws times the price.
  const rand = rng(seed);
  const lifts = new Float64Array(draws);
  let wins = 0, lossB = 0, lossA = 0;
  for (let i = 0; i < draws; i++) {
    const a = betaDraw(1 + c1, 1 + n1 - c1, rand) * price1;
    const b = betaDraw(1 + c2, 1 + n2 - c2, rand) * price2;
    if (b > a) wins++;
    lossB += Math.max(a - b, 0);
    lossA += Math.max(b - a, 0);
    lifts[i] = b / a - 1;
  }
  lifts.sort();
  const q = (f) => lifts[Math.min(draws - 1, Math.floor(f * draws))];
  // Break-even: the variant converts at least p1*price1/price2 to match control RPV.
  const breakEvenRate = Math.min(1, (p1 * price1) / price2);
  const breakEvenRelativeDrop = 1 - price1 / price2; // positive for a price rise
  const conversionChange = p1 > 0 ? p2 / p1 - 1 : NaN;
  const monthly = monthlyVisitors > 0 ? { visitors: monthlyVisitors, revenueDelta: diff * monthlyVisitors } : null;
  const findings = [];
  const raise = price2 > price1;
  if (c1 < 10 || c2 < 10) findings.push({ severity: "medium", title: "Few buyers at one price", detail: "Fewer than 10 conversions at a price makes the normal approximation shaky and the Bayesian interval wide. Keep the test running." });
  if (raise && p2 < p1 && diff > 0) findings.push({ severity: "info", title: "Fewer buyers, more revenue", detail: `Conversion fell ${signedPct(conversionChange)} but revenue per visitor rose ${money(diff)}. The higher price wins on revenue as long as conversion stays above ${pct(breakEvenRate)}.` });
  if (raise && diff <= 0) findings.push({ severity: "medium", title: "The higher price lost revenue so far", detail: `At ${money(price2)} revenue per visitor is ${money(rpv2)} against ${money(rpv1)}. It would need conversion of ${pct(breakEvenRate)} to break even; it has ${pct(p2)}.` });
  if (!raise && diff > 0) findings.push({ severity: "info", title: "The lower price won on volume", detail: `More buyers at ${money(price2)} outweighed the lower price: ${money(rpv2)} per visitor against ${money(rpv1)}.` });
  if (p < alpha && diff < 0) findings.push({ severity: "high", title: "Variant price is significantly worse", detail: `Revenue per visitor is lower by ${money(-diff)} and the gap is unlikely to be chance (p = ${p.toFixed(4)}).` });
  findings.push({ severity: "info", title: "Revenue per visitor ignores retention", detail: "This compares first-purchase revenue at fixed prices. A higher price can change churn, refunds and who you attract; check those before rolling out." });
  return { n1, c1, price1, n2, c2, price2, p1, p2, rpv1, rpv2, diff, relative: rpv1 > 0 ? rpv2 / rpv1 - 1 : NaN, se, z, p, alpha, significant: p < alpha, ci, conversionChange, breakEvenRate, breakEvenRelativeDrop, monthly,
    bayes: { probBBeatsA: wins / draws, expectedLossChoosingB: lossB / draws, expectedLossChoosingA: lossA / draws, liftLow: q(0.025), liftMedian: q(0.5), liftHigh: q(0.975) }, findings };
}

// A/B/n: every variant against one control, with Holm step-down adjusted p-values
// so testing several variants does not inflate the chance of a false winner, plus
// the Bayesian chance each arm (control included) is the best.
export function multiTest({ arms, alpha = 0.05, draws = 20000, seed = 17 } = {}) {
  if (!Array.isArray(arms) || arms.length < 3) return { error: "Enter a control and at least two variants. For one variant use the A/B panel." };
  if (arms.length > 10) return { error: "At most 10 arms (a control and nine variants)." };
  for (const a of arms) {
    if (!isCount(a.n) || !isCount(a.c)) return { error: `${a.name}: visitors and conversions must be whole numbers, zero or more.` };
    if (a.n < 1) return { error: `${a.name}: needs at least one visitor.` };
    if (a.c > a.n) return { error: `${a.name}: conversions cannot exceed visitors.` };
  }
  const ctl = arms[0];
  const rows = arms.slice(1).map((a) => {
    const p1 = ctl.c / ctl.n, p2 = a.c / a.n, pool = (ctl.c + a.c) / (ctl.n + a.n);
    const se = Math.sqrt(pool * (1 - pool) * (1 / ctl.n + 1 / a.n));
    const z = se > 0 ? (p2 - p1) / se : 0;
    return { name: a.name, n: a.n, c: a.c, rate: p2, lift: p1 > 0 ? p2 / p1 - 1 : NaN, z, p: twoSided(z) };
  });
  const m = rows.length;
  const order = rows.map((_, i) => i).sort((x, y) => rows[x].p - rows[y].p);
  let run = 0;
  order.forEach((i, k) => {
    run = Math.max(run, Math.min(1, (m - k) * rows[i].p));
    rows[i].pHolm = run;
    rows[i].significant = run < alpha;
  });
  const rand = rng(seed);
  const best = new Array(arms.length).fill(0);
  for (let d = 0; d < draws; d++) {
    let top = -1, bi = 0;
    for (let i = 0; i < arms.length; i++) {
      const v = betaDraw(1 + arms[i].c, 1 + arms[i].n - arms[i].c, rand);
      if (v > top) { top = v; bi = i; }
    }
    best[bi]++;
  }
  rows.forEach((r, i) => { r.probBest = best[i + 1] / draws; });
  const control = { name: ctl.name, n: ctl.n, c: ctl.c, rate: ctl.c / ctl.n, probBest: best[0] / draws };
  const winners = rows.filter((r) => r.significant && r.lift > 0).sort((a, b) => b.rate - a.rate);
  const findings = [];
  if (arms.some((a) => a.c < 10)) findings.push({ severity: "medium", title: "Few conversions in an arm", detail: "An arm with fewer than 10 conversions makes the normal approximation shaky. Keep the test running." });
  if (!winners.length) findings.push({ severity: "info", title: "No variant beats control after correction", detail: `With ${m} variants tested, a variant must clear a stricter bar than a single A/B test. None does at ${(alpha * 100).toFixed(0)}%.` });
  else findings.push({ severity: "info", title: `${winners[0].name} beats control`, detail: `Lift ${signedPct(winners[0].lift)}, Holm-adjusted p = ${winners[0].pHolm.toFixed(4)}.` });
  const losers = rows.filter((r) => r.significant && r.lift < 0);
  if (losers.length) findings.push({ severity: "high", title: `${losers.map((r) => r.name).join(", ")} significantly worse than control`, detail: "Consider stopping these arms." });
  findings.push({ severity: "info", title: "Variants are compared with control only", detail: "Differences between variants are not tested here, and unequal traffic splits are not checked for sample ratio mismatch." });
  return { control, rows, alpha, winners, findings };
}

export function multiSampleText() {
  return "Control, 5000, 250\nNew headline, 5000, 290\nNew button, 5000, 262\nShort form, 5000, 305";
}

// "name, visitors, conversions" per line; the first line is the control.
export function parseArms(text) {
  const arms = [];
  for (const [i, line] of String(text || "").split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const parts = line.split(/[,\t]/).map((x) => x.trim());
    if (parts.length < 3) return { error: `Line ${i + 1}: use "name, visitors, conversions".` };
    const n = Number(parts[parts.length - 2].replace(/_/g, "")), c = Number(parts[parts.length - 1].replace(/_/g, ""));
    arms.push({ name: parts.slice(0, -2).join(", ") || `Arm ${arms.length + 1}`, n, c });
  }
  return { arms };
}

export const money = (x) => (Number.isFinite(x) ? (x < 0 ? "-" : "") + "$" + Math.abs(x).toFixed(Math.abs(x) < 10 ? 3 : 2) : "n/a");

export function priceSampleText() {
  return { n1: 4000, c1: 160, price1: 29, n2: 4000, c2: 138, price2: 39 };
}


export function analyze({ n1, c1, n2, c2, alpha = 0.05, controlShare = 0.5, tau, looks = 1 } = {}) {
  if (![n1, c1, n2, c2].every(isCount)) return { error: "Enter whole numbers for visitors and conversions in both groups." };
  if (n1 < 1 || n2 < 1) return { error: "Each group needs at least one visitor." };
  if (c1 > n1 || c2 > n2) return { error: "Conversions cannot exceed visitors in a group." };
  if (!(alpha > 0 && alpha < 0.5)) return { error: "Significance level must be between 0 and 0.5." };
  if (!(controlShare > 0 && controlShare < 1)) return { error: "Planned control share must be between 0 and 1." };

  const p1 = c1 / n1, p2 = c2 / n2, diff = p2 - p1;
  const pool = (c1 + c2) / (n1 + n2);
  const sePool = Math.sqrt(pool * (1 - pool) * (1 / n1 + 1 / n2));
  const z = sePool > 0 ? diff / sePool : 0;
  const p = sePool > 0 ? twoSided(z) : 1;
  const seDiff = Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2);
  const zc = normInv(1 - alpha / 2);
  const ci = { low: diff - zc * seDiff, high: diff + zc * seDiff };
  let relative = null, relativeCi = null;
  if (c1 > 0 && c2 > 0) {
    const r = p2 / p1, se = Math.sqrt((1 - p1) / c1 + (1 - p2) / c2);
    relative = r - 1;
    relativeCi = { low: Math.exp(Math.log(r) - zc * se) - 1, high: Math.exp(Math.log(r) + zc * se) - 1 };
  }
  const srm = srmCheck(n1, n2, controlShare);
  const bay = bayes(c1, n1, c2, n2);
  // Default prior sd: 10% of the control rate, but never below the standard error;
  // a prior far tighter than the data makes the mixture interval absurdly wide.
  const priorSd = tau > 0 ? tau : Math.max(0.1 * p1, seDiff, 1e-4);
  const seq = seDiff > 0 ? mixtureSequential(diff, seDiff * seDiff, priorSd, alpha) : { p: 1, low: NaN, high: NaN, significant: false };
  const inflated = looks > 1 ? peekingInflation(looks, alpha) : alpha;

  const findings = [];
  if (srm.p < 0.001) findings.push({ severity: "high", title: "Sample ratio mismatch: do not trust this result", detail: `You planned a ${(controlShare * 100).toFixed(0)}/${((1 - controlShare) * 100).toFixed(0)} split but got ${n1} vs ${n2} visitors (p = ${srm.p.toExponential(1)}). A split this lopsided almost never happens by chance; it usually means a bug in assignment, redirects, bot filtering or tracking, and any difference in conversion may be an artifact.` });
  else if (srm.p < 0.01) findings.push({ severity: "medium", title: "Possible sample ratio mismatch", detail: `Split ${n1} vs ${n2} against a planned ${(controlShare * 100).toFixed(0)}/${((1 - controlShare) * 100).toFixed(0)} (p = ${srm.p.toFixed(4)}). Check assignment and tracking before acting on the result.` });
  if (c1 < 25 || c2 < 25) findings.push({ severity: "medium", title: "Few conversions", detail: "With fewer than about 25 conversions in a group the normal approximation is rough; treat the p-value and intervals as indicative and keep the test running." });
  if (looks > 1) findings.push({ severity: "medium", title: `Checking ${looks} times inflates false positives`, detail: `A fixed-sample p-value is only valid if you look once. Stopping the first time p < ${alpha} across ${looks} evenly spaced looks gives a real false-positive rate of about ${(inflated * 100).toFixed(1)}%, not ${(alpha * 100).toFixed(0)}%. Use the always-valid result below, which stays valid at every look.` });
  if (p < alpha && !seq.significant && looks > 1) findings.push({ severity: "info", title: "Fixed-sample significant, always-valid not", detail: "The ordinary p-value crosses your threshold but the always-valid one does not. If you peeked, the honest reading is: not yet conclusive." });
  findings.push({ severity: "info", title: p < alpha ? "Difference is statistically significant" : "No statistically significant difference", detail: `Variant ${(p2 * 100).toFixed(2)}% vs control ${(p1 * 100).toFixed(2)}% (difference ${(diff * 100).toFixed(2)} points, p = ${p.toFixed(4)}). Statistical significance is not the same as a difference big enough to matter to revenue.` });

  return { n1, c1, n2, c2, p1, p2, diff, relative, relativeCi, ci, z, p, alpha, significant: p < alpha, srm, bayes: bay, sequential: seq, priorSd, looks, inflated, findings };
}

export function sampleText() {
  return { n1: 10000, c1: 520, n2: 10000, c2: 578 };
}

export const pct = (x, d = 2) => (Number.isFinite(x) ? (x * 100).toFixed(d) + "%" : "n/a");
export const signedPct = (x, d = 1) => (Number.isFinite(x) ? (x >= 0 ? "+" : "") + (x * 100).toFixed(d) + "%" : "n/a");

export function reportCsv(a) {
  const rows = [
    ["metric", "value"],
    ["control_visitors", a.n1], ["control_conversions", a.c1], ["control_rate", a.p1],
    ["variant_visitors", a.n2], ["variant_conversions", a.c2], ["variant_rate", a.p2],
    ["absolute_difference", a.diff], ["relative_lift", a.relative ?? ""],
    ["ci_low", a.ci.low], ["ci_high", a.ci.high],
    ["z", a.z], ["p_value", a.p], ["alpha", a.alpha],
    ["srm_p_value", a.srm.p],
    ["prob_variant_beats_control", a.bayes.probBBeatsA],
    ["expected_loss_choosing_variant", a.bayes.expectedLossChoosingB],
    ["always_valid_p", a.sequential.p],
    ["always_valid_ci_low", a.sequential.low], ["always_valid_ci_high", a.sequential.high],
  ];
  return rows.map((r) => r.join(",")).join("\n") + "\n";
}
