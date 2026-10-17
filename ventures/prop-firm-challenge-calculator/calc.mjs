// Prop-firm challenge calculator: Monte Carlo of an evaluation (profit target, daily loss limit, static or
// trailing max drawdown, optional time limit) plus a funded phase, from the trader's own win rate and reward:risk.
// Pure module, no DOM. Deterministic for a given seed. Bad input throws; nothing is silently clamped.

export const FIELDS = [
  'accountSize', 'profitTargetPct', 'maxLossPct', 'dailyLossPct', 'drawdownType', 'lockAtStart', 'minTradingDays', 'maxDays',
  'winRatePct', 'rewardRisk', 'riskPerTradePct', 'tradesPerDay',
  'fee', 'profitSplitPct', 'payoutTargetPct', 'fundedDays', 'sims', 'seed',
];

export const DEFAULTS = {
  accountSize: 100000, profitTargetPct: 8, maxLossPct: 10, dailyLossPct: 5, drawdownType: 'static', lockAtStart: 'yes',
  minTradingDays: 4, maxDays: 30, winRatePct: 45, rewardRisk: 1.5, riskPerTradePct: 0.5, tradesPerDay: 2,
  fee: 540, profitSplitPct: 80, payoutTargetPct: 4, fundedDays: 60, sims: 5000, seed: 12345,
};

const MAX_DAYS_CAP = 250;

function num(v, name, { min = -Infinity, max = Infinity, int = false, gt = null } = {}) {
  if (v === '' || v === null || v === undefined) throw new Error(`${name} is required.`);
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,$\s]/g, ''));
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number.`);
  if (int && !Number.isInteger(n)) throw new Error(`${name} must be a whole number.`);
  if (gt !== null && !(n > gt)) throw new Error(`${name} must be greater than ${gt}.`);
  if (n < min) throw new Error(`${name} must be at least ${min}.`);
  if (n > max) throw new Error(`${name} must be at most ${max}.`);
  return n;
}

export function parseInputs(raw) {
  const r = { ...DEFAULTS, ...raw };
  const p = {
    accountSize: num(r.accountSize, 'Account size', { gt: 0 }),
    profitTargetPct: num(r.profitTargetPct, 'Profit target %', { gt: 0, max: 100 }),
    maxLossPct: num(r.maxLossPct, 'Max drawdown %', { gt: 0, max: 100 }),
    dailyLossPct: num(r.dailyLossPct, 'Daily loss limit %', { min: 0, max: 100 }),
    drawdownType: String(r.drawdownType),
    lockAtStart: String(r.lockAtStart),
    minTradingDays: num(r.minTradingDays, 'Minimum trading days', { min: 0, max: MAX_DAYS_CAP, int: true }),
    maxDays: num(r.maxDays, 'Time limit (trading days)', { min: 0, max: MAX_DAYS_CAP, int: true }),
    winRatePct: num(r.winRatePct, 'Win rate %', { min: 0, max: 100 }),
    rewardRisk: num(r.rewardRisk, 'Average reward:risk', { gt: 0, max: 50 }),
    riskPerTradePct: num(r.riskPerTradePct, 'Risk per trade %', { gt: 0, max: 100 }),
    tradesPerDay: num(r.tradesPerDay, 'Trades per day', { min: 1, max: 50, int: true }),
    fee: num(r.fee, 'Challenge fee', { min: 0 }),
    profitSplitPct: num(r.profitSplitPct, 'Profit split %', { min: 0, max: 100 }),
    payoutTargetPct: num(r.payoutTargetPct, 'Payout target %', { gt: 0, max: 100 }),
    fundedDays: num(r.fundedDays, 'Funded-phase horizon (days)', { min: 0, max: MAX_DAYS_CAP, int: true }),
    sims: num(r.sims, 'Simulations', { min: 500, max: 50000, int: true }),
    seed: num(r.seed, 'Seed', { int: true }),
  };
  if (!['static', 'trailing'].includes(p.drawdownType)) throw new Error('Drawdown type must be static or trailing.');
  if (!['yes', 'no'].includes(p.lockAtStart)) throw new Error('Lock trailing floor must be yes or no.');
  if (p.riskPerTradePct > p.maxLossPct) throw new Error('Risk per trade cannot exceed the max drawdown: one loss would end the account.');
  if (p.minTradingDays > 0 && p.maxDays > 0 && p.minTradingDays > p.maxDays) throw new Error('Minimum trading days cannot exceed the time limit.');
  return p;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Percent math is done in units of the starting balance (1 = the whole account) so account size only scales dollars.
// One attempt of the evaluation. Returns { passed, reason, days, trades }.
export function runEvaluation(p, rand) {
  const win = p.winRatePct / 100, risk = p.riskPerTradePct / 100, gain = risk * p.rewardRisk;
  const target = p.profitTargetPct / 100, maxLoss = p.maxLossPct / 100, daily = p.dailyLossPct / 100;
  const limit = p.maxDays > 0 ? p.maxDays : MAX_DAYS_CAP;
  let eq = 0, high = 0, trades = 0;
  const floorOf = () => {
    if (p.drawdownType === 'static') return -maxLoss;
    const f = high - maxLoss;
    return p.lockAtStart === 'yes' ? Math.min(f, 0) : f;
  };
  for (let day = 1; day <= limit; day++) {
    const dayStart = eq;
    for (let t = 0; t < p.tradesPerDay; t++) {
      eq += rand() < win ? gain : -risk;
      trades++;
      if (eq > high) high = eq;
      if (eq <= floorOf() + 1e-12) return { passed: false, reason: 'drawdown', days: day, trades };
      if (daily > 0 && eq - dayStart <= -daily + 1e-12) return { passed: false, reason: 'daily', days: day, trades };
      if (eq >= target - 1e-12 && day >= p.minTradingDays) return { passed: true, reason: 'target', days: day, trades };
    }
  }
  return { passed: false, reason: 'time', days: limit, trades };
}

// Funded phase: the same strategy, paid out each time the account gains payoutTargetPct, until breach or the horizon.
// A payout resets the profit counter (not the drawdown floor reference) -- an approximation, stated on the page.
export function runFunded(p, rand) {
  if (p.fundedDays === 0) return { payouts: 0, breached: false };
  const win = p.winRatePct / 100, risk = p.riskPerTradePct / 100, gain = risk * p.rewardRisk;
  const maxLoss = p.maxLossPct / 100, daily = p.dailyLossPct / 100, cycle = p.payoutTargetPct / 100;
  let eq = 0, high = 0, base = 0, payouts = 0;
  for (let day = 1; day <= p.fundedDays; day++) {
    const dayStart = eq;
    for (let t = 0; t < p.tradesPerDay; t++) {
      eq += rand() < win ? gain : -risk;
      if (eq > high) high = eq;
      const floor = p.drawdownType === 'static' ? -maxLoss : (p.lockAtStart === 'yes' ? Math.min(high - maxLoss, 0) : high - maxLoss);
      if (eq <= floor + 1e-12) return { payouts, breached: true };
      if (daily > 0 && eq - dayStart <= -daily + 1e-12) return { payouts, breached: true };
      if (eq - base >= cycle - 1e-12) { payouts++; base = eq; }
    }
  }
  return { payouts, breached: false };
}

function simulate(p, sims, seed) {
  const rand = mulberry32(seed);
  let passed = 0, daysSum = 0, dd = 0, dl = 0, tm = 0, payoutsSum = 0, fundedBreached = 0;
  const passDays = [];
  for (let i = 0; i < sims; i++) {
    const e = runEvaluation(p, rand);
    if (e.passed) {
      passed++; daysSum += e.days; passDays.push(e.days);
      const f = runFunded(p, rand);
      payoutsSum += f.payouts; if (f.breached) fundedBreached++;
    } else if (e.reason === 'drawdown') dd++;
    else if (e.reason === 'daily') dl++;
    else tm++;
  }
  passDays.sort((a, b) => a - b);
  return { sims, passed, dd, dl, tm, daysSum, passDays, payoutsSum, fundedBreached };
}

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function summarise(p, s) {
  const passRate = s.passed / s.sims;
  const payoutEach = p.accountSize * (p.payoutTargetPct / 100) * (p.profitSplitPct / 100);
  const avgPayouts = s.passed ? s.payoutsSum / s.passed : 0;
  const expectedPayoutPerPass = avgPayouts * payoutEach;
  const evPerAttempt = passRate * expectedPayoutPerPass - p.fee;
  return {
    passRate, passRatePct: round(passRate * 100, 1),
    failDrawdownPct: round((s.dd / s.sims) * 100, 1), failDailyPct: round((s.dl / s.sims) * 100, 1), failTimePct: round((s.tm / s.sims) * 100, 1),
    avgDaysToPass: s.passed ? round(s.daysSum / s.passed, 1) : null,
    medianDaysToPass: s.passed ? s.passDays[Math.floor(s.passDays.length / 2)] : null,
    expectedAttempts: passRate > 0 ? round(1 / passRate, 2) : null,
    expectedCostToPass: passRate > 0 ? round(p.fee / passRate, 2) : null,
    avgPayoutsAfterPass: round(avgPayouts, 2),
    fundedBreachPct: s.passed ? round((s.fundedBreached / s.passed) * 100, 1) : null,
    expectedPayoutPerPass: round(expectedPayoutPerPass, 2),
    evPerAttempt: round(evPerAttempt, 2),
  };
}

export function expectancyR(p) {
  const w = p.winRatePct / 100;
  return round(w * p.rewardRisk - (1 - w), 4);
}

// Smallest win rate (to 0.5 point) at which EV per attempt reaches zero, by bisection with common random numbers.
export function breakEvenWinRate(p, sims = 2000) {
  const ev = (w) => summarise({ ...p, winRatePct: w }, simulate({ ...p, winRatePct: w }, sims, p.seed)).evPerAttempt;
  if (ev(100) < 0) return null; // even a perfect record does not pay for the fee under these rules
  let lo = 0, hi = 100;
  for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (ev(mid) >= 0) hi = mid; else lo = mid; }
  return round(hi, 1);
}

export const SWEEP_RISKS = [0.25, 0.5, 0.75, 1, 1.5, 2];

export function riskSweep(p, sims = 1500) {
  return SWEEP_RISKS.filter((r) => r <= p.maxLossPct).map((r) => {
    const q = { ...p, riskPerTradePct: r };
    const sum = summarise(q, simulate(q, sims, p.seed));
    return { riskPerTradePct: r, passRatePct: sum.passRatePct, evPerAttempt: sum.evPerAttempt, avgDaysToPass: sum.avgDaysToPass };
  });
}

export function analyse(raw, { sweep = true, breakEven = true } = {}) {
  const p = parseInputs(raw);
  const sum = summarise(p, simulate(p, p.sims, p.seed));
  const exp = expectancyR(p);
  const notes = [];
  if (exp <= 0) notes.push(`Your inputs give an expectancy of ${exp}R per trade. With zero or negative expectancy no challenge rule set fixes the odds; the pass rate you see is luck inside the limits, and the fee is the cost of the ticket.`);
  if (p.dailyLossPct > 0 && p.riskPerTradePct * p.tradesPerDay > p.dailyLossPct) notes.push('Your risk per trade times trades per day exceeds the daily loss limit, so a losing day can end the attempt even with no single big loss.');
  if (p.maxDays > 0 && sum.failTimePct >= 25) notes.push(`${sum.failTimePct}% of attempts ran out of time without hitting the target; a higher risk per trade shortens the path but raises breaches (see the table).`);
  if (sum.evPerAttempt < 0) notes.push('Expected value per attempt is negative: on average the payouts do not cover the fee under these inputs.');
  const result = { inputs: p, ...sum, expectancyR: exp, notes };
  if (breakEven) result.breakEvenWinRatePct = breakEvenWinRate(p);
  if (sweep) result.sweep = riskSweep(p);
  return result;
}

export function toCsv(r) {
  const rows = [['risk_per_trade_pct', 'pass_rate_pct', 'avg_days_to_pass', 'ev_per_attempt']];
  for (const s of r.sweep || []) rows.push([s.riskPerTradePct, s.passRatePct, s.avgDaysToPass ?? '', s.evPerAttempt]);
  return rows.map((x) => x.join(',')).join('\n') + '\n';
}

export function summaryText(r) {
  const p = r.inputs;
  return [
    `Prop-firm challenge simulation (${p.sims} runs, seed ${p.seed})`,
    `Account $${p.accountSize}, target ${p.profitTargetPct}%, max drawdown ${p.maxLossPct}% (${p.drawdownType}), daily limit ${p.dailyLossPct || 'none'}%`,
    `Strategy: ${p.winRatePct}% win rate, ${p.rewardRisk}R reward, ${p.riskPerTradePct}% risk, ${p.tradesPerDay} trades/day (expectancy ${r.expectancyR}R)`,
    `Pass rate ${r.passRatePct}%; fails: drawdown ${r.failDrawdownPct}%, daily limit ${r.failDailyPct}%, time ${r.failTimePct}%`,
    r.expectedCostToPass === null ? 'No simulated attempt passed.' : `Expected attempts ${r.expectedAttempts}, expected fees to pass $${r.expectedCostToPass}`,
    `Expected value per attempt $${r.evPerAttempt}`,
    'A simulation of assumed inputs, not a forecast. Not financial advice.',
  ].join('\n');
}

export function encodeState(values) {
  const q = new URLSearchParams();
  for (const k of FIELDS) if (values[k] !== undefined && values[k] !== '') q.set(k, String(values[k]));
  return q.toString();
}

export function decodeState(hash) {
  const out = {};
  const q = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  for (const k of FIELDS) if (q.has(k)) out[k] = q.get(k);
  return out;
}
