// SAFE and priced-round dilution model. Pure functions, no I/O.
//
// One priced equity round converts every SAFE outstanding. The three quantities
// that define the round -- the price per share, the number of shares each SAFE
// becomes, and the size of the option-pool top-up -- each depend on the other
// two, so there is no closed form. solveRound() iterates them to a fixed point
// and reports whether it converged rather than returning a half-answer.
//
// Conventions (Y Combinator SAFE, post-money and pre-money forms):
//   * post-money cap price = cap / (all shares + option pool + every SAFE's
//     converted shares). It excludes the round's own pool top-up.
//   * pre-money cap price  = cap / (all shares + option pool), SAFEs excluded.
//   * discount price       = round price x (1 - discount).
//   * a SAFE converts at the lowest of those prices that apply, and never above
//     the round price.
//   * the round's price = pre-money / (existing shares + SAFE shares + pool
//     top-up), i.e. the new investors' pre-money is fully diluted.

export const MAX_ITERATIONS = 5000;
const TOLERANCE = 1e-12;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function money(value) {
  if (!Number.isFinite(value)) return "n/a";
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.round(Math.abs(value)).toLocaleString("en-US")}`;
}

export function percent(fraction, digits = 1) {
  if (!Number.isFinite(fraction)) return "n/a";
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function shares(value) {
  if (!Number.isFinite(value)) return "n/a";
  return Math.round(value).toLocaleString("en-US");
}

function cleanSafe(safe, index) {
  const cap = num(safe.cap);
  return {
    name: String(safe.name || `SAFE ${index + 1}`),
    amount: Math.max(0, num(safe.amount)),
    cap: cap > 0 ? cap : null,
    discount: Math.min(0.99, Math.max(0, num(safe.discount))),
    kind: safe.kind === "pre" ? "pre" : "post",
  };
}

function cleanInput(input) {
  const founders = (input.founders || [])
    .map((f, i) => ({ name: String(f.name || `Founder ${i + 1}`), shares: Math.max(0, num(f.shares)) }))
    .filter((f) => f.shares > 0);
  return {
    founders,
    issuedOptions: Math.max(0, num(input.issuedOptions)),
    unissuedPool: Math.max(0, num(input.unissuedPool)),
    otherShares: Math.max(0, num(input.otherShares)),
    safes: (input.safes || []).map(cleanSafe).filter((s) => s.amount > 0),
    preMoney: Math.max(0, num(input.preMoney)),
    raise: Math.max(0, num(input.raise)),
    poolTarget: Math.min(0.5, Math.max(0, num(input.poolTarget))),
    liqMultiple: Math.max(0, num(input.liqMultiple ?? 1)),
    poolGranted: input.poolGranted !== false,
  };
}

// Returns { ok, error?, ... }. Never throws on user input.
export function solveRound(rawInput) {
  const c = cleanInput(rawInput);
  const founderShares = c.founders.reduce((a, f) => a + f.shares, 0);
  const B = founderShares + c.issuedOptions + c.unissuedPool + c.otherShares;
  if (B <= 0) return { ok: false, error: "Enter at least one founder with shares." };
  if (c.preMoney <= 0) return { ok: false, error: "Enter the pre-money valuation of the priced round." };

  const k = (c.preMoney + c.raise) / c.preMoney;
  if (c.poolTarget * k >= 1) return { ok: false, error: "The pool target is too large for this round size." };

  // A stack of post-money SAFEs can only claim what exists.
  const postClaim = c.safes.filter((s) => s.cap && s.kind === "post").reduce((a, s) => a + s.amount / s.cap, 0);
  if (postClaim >= 1) {
    return { ok: false, error: "Post-money SAFE amounts divided by their caps add up to 100% or more of the company, which is not possible. Check the amounts and caps." };
  }

  let S = c.safes.map(() => 0);
  let P = c.preMoney / B;
  let N = 0;
  let converged = false;
  let iterations = 0;
  for (; iterations < MAX_ITERATIONS; iterations++) {
    const sumS = S.reduce((a, b) => a + b, 0);
    N = c.poolTarget > 0 ? Math.max(0, (c.poolTarget * k * (B + sumS) - c.unissuedPool) / (1 - c.poolTarget * k)) : 0;
    P = c.preMoney / (B + sumS + N);
    const cPost = B + sumS;
    const next = c.safes.map((s) => {
      const capPrice = s.cap ? (s.kind === "post" ? s.cap / cPost : s.cap / B) : Infinity;
      const price = Math.min(capPrice, P * (1 - s.discount), P);
      return s.amount / price;
    });
    let delta = 0;
    for (let i = 0; i < next.length; i++) delta = Math.max(delta, Math.abs(next[i] - S[i]) / Math.max(1, next[i]));
    S = next.map((v, i) => 0.5 * v + 0.5 * S[i]);
    if (delta < TOLERANCE) { converged = true; break; }
  }
  if (c.safes.length === 0) converged = true;
  if (!converged) return { ok: false, error: "The conversion did not settle on a single answer. Check for a cap far below the round valuation combined with a large discount." };

  const sumS = S.reduce((a, b) => a + b, 0);
  const cPost = B + sumS;
  N = c.poolTarget > 0 ? Math.max(0, (c.poolTarget * k * (B + sumS) - c.unissuedPool) / (1 - c.poolTarget * k)) : 0;
  P = c.preMoney / (B + sumS + N);
  const I = c.raise / P;
  const T = B + sumS + N + I;

  const safeRows = c.safes.map((s, i) => {
    const capPrice = s.cap ? (s.kind === "post" ? s.cap / cPost : s.cap / B) : Infinity;
    const discPrice = P * (1 - s.discount);
    const price = S[i] > 0 ? s.amount / S[i] : P;
    let boundBy = "round price";
    if (price < P * (1 - 1e-9)) boundBy = capPrice <= discPrice ? "valuation cap" : "discount";
    return {
      name: s.name,
      kind: s.kind,
      amount: s.amount,
      shares: S[i],
      price,
      ownership: S[i] / T,
      boundBy,
      // What the SAFE holder effectively paid for the company, post-money, at conversion.
      effectiveValuation: price * cPost,
      discountToRound: 1 - price / P,
    };
  });

  const rows = [];
  for (const f of c.founders) rows.push({ name: f.name, group: "founder", shares: f.shares });
  if (c.issuedOptions) rows.push({ name: "Issued options / employee shares", group: "employee", shares: c.issuedOptions });
  if (c.otherShares) rows.push({ name: "Other existing shares", group: "other", shares: c.otherShares });
  if (c.unissuedPool) rows.push({ name: "Unissued option pool", group: "pool", shares: c.unissuedPool });
  for (const s of safeRows) rows.push({ name: s.name, group: "safe", shares: s.shares });
  if (N > 0) rows.push({ name: "Option pool top-up", group: "pool", shares: N });
  if (I > 0) rows.push({ name: "New investors", group: "investor", shares: I });
  for (const r of rows) r.ownership = r.shares / T;

  const founderOwnership = founderShares / T;
  const founderBefore = founderShares / B;
  const result = {
    ok: true,
    iterations,
    price: P,
    totalShares: T,
    baseShares: B,
    postMoney: P * T,
    rows,
    safeRows,
    newPoolShares: N,
    investorShares: I,
    investorOwnership: I / T,
    safeOwnership: sumS / T,
    poolOwnership: (c.unissuedPool + N) / T,
    founderShares,
    founderBefore,
    founderOwnership,
    founderDilution: founderBefore > 0 ? 1 - founderOwnership / founderBefore : 0,
    founders: c.founders.map((f) => ({ name: f.name, before: f.shares / B, after: f.shares / T })),
    inputs: c,
  };
  result.findings = findingsFor(result);
  return result;
}

function findingsFor(r) {
  const out = [];
  const c = r.inputs;
  if (r.safeRows.length) {
    out.push({
      severity: "info",
      title: `Your SAFEs convert into ${percent(r.safeOwnership)} of the company`,
      detail: `${money(r.safeRows.reduce((a, s) => a + s.amount, 0))} of SAFE money becomes ${shares(r.safeRows.reduce((a, s) => a + s.shares, 0))} shares at the priced round. Your ownership goes from ${percent(r.founderBefore)} to ${percent(r.founderOwnership)} once the SAFEs, the new pool and the new investors are all in.`,
    });
  }
  for (const s of r.safeRows) {
    if (s.boundBy === "valuation cap" && s.discountToRound > 0.25) {
      out.push({
        severity: "high",
        title: `${s.name}: the cap is doing a lot of work`,
        detail: `It converts at ${money(s.price)} a share, ${percent(s.discountToRound, 0)} below the round price of ${money(r.price)}. The cap acts as an effective valuation of about ${money(s.effectiveValuation)}, against ${money(c.preMoney)} pre-money for the round. The bigger that gap, the more of the company this SAFE takes.`,
      });
    } else if (s.boundBy === "round price") {
      out.push({
        severity: "info",
        title: `${s.name}: converts at the round price`,
        detail: `Its cap and discount are not better than the round price of ${money(r.price)}, so it behaves like ordinary new money in this round.`,
      });
    }
  }
  if (r.newPoolShares > 0) {
    out.push({
      severity: "medium",
      title: `The pool top-up comes out of existing holders, not the new investors`,
      detail: `Investors usually ask for the pool to be sized before their money, so the ${shares(r.newPoolShares)} new pool shares dilute you and the SAFE holders and not them. That costs you about ${percent(r.newPoolShares / r.totalShares)} of the company at this valuation.`,
    });
  }
  if (r.founderOwnership < 0.5 && r.founderBefore >= 0.5) {
    out.push({ severity: "medium", title: "Founders drop below 50% in this round", detail: `Combined founder ownership is ${percent(r.founderOwnership)} after the round. Control also depends on board seats and voting terms, which this tool does not model.` });
  }
  const conflicting = r.safeRows.filter((s) => s.kind === "post");
  if (conflicting.length > 1) {
    out.push({ severity: "info", title: "Post-money SAFEs stack on each other", detail: "Each post-money SAFE is a fixed percentage of the company measured after all SAFEs convert, so adding one takes ownership from you and not from earlier SAFE holders." });
  }
  return out;
}

// Founders' ownership across a range of round valuations. Same model, re-solved.
export function valuationSweep(input, multiples = [0.5, 0.75, 1, 1.5, 2, 3]) {
  const base = cleanInput(input);
  return multiples.map((m) => {
    const r = solveRound({ ...input, preMoney: base.preMoney * m });
    return r.ok
      ? { multiple: m, preMoney: base.preMoney * m, price: r.price, founderOwnership: r.founderOwnership, safeOwnership: r.safeOwnership, investorOwnership: r.investorOwnership }
      : { multiple: m, preMoney: base.preMoney * m, error: r.error };
  });
}

// What the next priced round does to the cap table this round produced.
export function followOnRound(result, { raise, preMoney, poolTarget = 0 } = {}) {
  const pre = num(preMoney), add = Math.max(0, num(raise));
  if (!result?.ok || pre <= 0) return null;
  const k = (pre + add) / pre;
  const t = Math.min(0.5, Math.max(0, num(poolTarget)));
  if (t * k >= 1) return null;
  const T = result.totalShares;
  const U = result.rows.filter((r) => r.group === "pool").reduce((a, r) => a + r.shares, 0);
  const N = t > 0 ? Math.max(0, (t * k * T - U) / (1 - t * k)) : 0;
  const total = (T + N) * k;
  return { totalShares: total, price: pre / (T + N), founderOwnership: result.founderShares / total, newInvestorOwnership: 1 - (T + N) / total };
}

// Exit waterfall. Every preferred class is 1x (or liqMultiple) non-participating and
// pari passu: each takes its preference or converts to common, whichever pays more.
export function exitWaterfall(result, exitValue) {
  if (!result?.ok) return null;
  const c = result.inputs;
  const X = Math.max(0, num(exitValue));
  const classes = result.safeRows.map((s) => ({ name: s.name, group: "safe", shares: s.shares, pref: s.amount }));
  if (result.investorShares > 0) classes.push({ name: "New investors", group: "investor", shares: result.investorShares, pref: c.raise * c.liqMultiple });
  const commonRows = result.rows.filter((r) => ["founder", "employee", "other"].includes(r.group) || (c.poolGranted && r.group === "pool"));
  const commonShares = commonRows.reduce((a, r) => a + r.shares, 0);

  const sorted = classes.filter((k) => k.shares > 0).sort((a, b) => a.pref / a.shares - b.pref / b.shares);
  const payoutFor = (m) => {
    const converting = sorted.slice(0, m), holding = sorted.slice(m);
    const owed = holding.reduce((a, k) => a + k.pref, 0);
    const paidPrefs = Math.min(X, owed);
    const residual = Math.max(0, X - owed);
    const denom = commonShares + converting.reduce((a, k) => a + k.shares, 0);
    return { converting, holding, owed, paidPrefs, perShare: denom > 0 ? residual / denom : 0 };
  };
  let m = 0;
  for (let i = 1; i <= sorted.length; i++) {
    const trial = payoutFor(i);
    const threshold = sorted[i - 1].pref / sorted[i - 1].shares;
    if (trial.perShare >= threshold) m = i; else break;
  }
  const outcome = payoutFor(m);
  const holders = [];
  for (const r of commonRows) holders.push({ name: r.name, group: r.group, payout: r.shares * outcome.perShare, converted: null });
  for (const k of outcome.converting) holders.push({ name: k.name, group: k.group, payout: k.shares * outcome.perShare, converted: true });
  for (const k of outcome.holding) {
    const share = outcome.owed > 0 ? outcome.paidPrefs * (k.pref / outcome.owed) : 0;
    holders.push({ name: k.name, group: k.group, payout: share, converted: false });
  }
  const founderPayout = holders.filter((h) => h.group === "founder").reduce((a, h) => a + h.payout, 0);
  return { exitValue: X, holders, founderPayout, founderShareOfExit: X > 0 ? founderPayout / X : 0, perCommonShare: outcome.perShare, total: holders.reduce((a, h) => a + h.payout, 0) };
}
