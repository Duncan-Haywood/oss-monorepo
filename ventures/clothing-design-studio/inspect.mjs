/**
 * Final-inspection sampling for a garment order: what a pass means, and what
 * a sample is worth. A brand ordering 1,200 hoodies cannot open every carton
 * abroad, so a third-party inspector pulls n pieces and the lot ships if at most
 * c are defective. This module does the exact arithmetic behind that rule,
 * with the hypergeometric distribution (sampling without replacement), so no
 * copyrighted AQL table is needed and small lots are handled exactly.
 *
 *  - acceptProb: chance the lot passes if a share p of it is defective
 *  - ocCurve: that chance across defect rates (the operating characteristic)
 *  - findPlan: the smallest sample (n, c) that passes a good lot (AQL, producer
 *    risk) and fails a bad one (rejectable quality, buyer risk)
 *  - verdict: given what the inspector found, pass or fail and the highest
 *    defect rate in the lot still consistent with it (one-sided 95%)
 *
 * The usual published plans (ISO 2859-1 / ANSI Z1.4, e.g. a lot of 1,000 at
 * level II, AQL 2.5: sample 80, accept 5) are lookups in a table; this is the
 * maths under such a plan, not a copy of the table. Check any contract's plan
 * against the standard. Not legal or QC advice.
 */

const lnFact = (() => {
  const t = [0];
  return k => { for (let i = t.length; i <= k; i++) t[i] = t[i - 1] + Math.log(i); return t[k]; };
})();
const lnC = (n, k) => (k < 0 || k > n ? -Infinity : lnFact(n) - lnFact(k) - lnFact(n - k));

function int(name, v, min) {
  if (!Number.isInteger(v) || v < min) throw new Error(`${name} must be a whole number of at least ${min}.`);
}

/** P(X = k) when n pieces are drawn from a lot of N holding D defective. */
export function hyperPmf(N, D, n, k) {
  return Math.exp(lnC(D, k) + lnC(N - D, n - k) - lnC(N, n));
}
/** P(X <= c). */
export function hyperCdf(N, D, n, c) {
  let s = 0;
  for (let k = 0; k <= Math.min(c, D, n); k++) s += hyperPmf(N, D, n, k);
  return Math.min(1, s);
}

/** Chance the lot is accepted when defect share `p` (0..1) of it is bad. */
export function acceptProb(N, n, c, p) {
  int("Lot size", N, 1); int("Sample size", n, 1); int("Accept number", c, 0);
  if (n > N) throw new Error("The sample cannot be larger than the lot.");
  if (typeof p !== "number" || !(p >= 0 && p <= 1)) throw new Error("Defect rate must be between 0 and 1.");
  return hyperCdf(N, Math.round(p * N), n, c);
}

export function ocCurve(N, n, c, rates = [0.005, 0.01, 0.015, 0.025, 0.04, 0.065, 0.1, 0.15]) {
  return rates.map(p => ({ p, accept: acceptProb(N, n, c, p) }));
}

/**
 * Smallest sample size n (then smallest c) with P(accept | p=aql) >= 1-alpha
 * and P(accept | p=rql) <= beta. Returns null if no plan inside the lot exists
 * (the answer is then to inspect every piece).
 */
export function findPlan({ lot, aqlPct = 2.5, rqlPct = 10, producerRisk = 0.05, buyerRisk = 0.1 } = {}) {
  int("Lot size", lot, 2);
  const aql = aqlPct / 100, rql = rqlPct / 100;
  if (!(aql > 0 && rql > aql && rql < 1)) throw new Error("Need 0 < good-lot rate < rejectable rate < 100%.");
  for (const [k, v] of [["producerRisk", producerRisk], ["buyerRisk", buyerRisk]]) if (!(v > 0 && v < 0.5)) throw new Error(`${k} must be between 0 and 0.5.`);
  for (let n = 1; n <= lot; n++) {
    for (let c = 0; c < n; c++) {
      const pa = acceptProb(lot, n, c, aql);
      if (pa < 1 - producerRisk) continue; // c too small: a good lot fails too often; a bigger c may fix it
      const pb = acceptProb(lot, n, c, rql);
      if (pb <= buyerRisk) return { lot, n, accept: c, reject: c + 1, passGoodLot: pa, passBadLot: pb, aqlPct, rqlPct };
      break; // larger c only raises both chances
    }
  }
  return null;
}

/**
 * The inspector found `found` defective pieces in a sample of `n`.
 * upperPct: highest lot defect rate with a chance of at least 5% of showing so
 * few defects (one-sided 95% upper bound, exact).
 */
export function verdict({ lot, n, accept, found }) {
  int("Lot size", lot, 1); int("Sample size", n, 1); int("Accept number", accept, 0); int("Defects found", found, 0);
  if (n > lot) throw new Error("The sample cannot be larger than the lot.");
  if (found > n) throw new Error("Cannot find more defects than pieces inspected.");
  let upper = lot; // defective pieces in the lot
  for (let D = 0; D <= lot; D++) if (hyperCdf(lot, D, n, found) < 0.05) { upper = D - 1; break; }
  const pass = found <= accept;
  return {
    pass, found, upperPct: Math.round((100 * upper) / lot * 10) / 10, upperPieces: upper,
    message: pass
      ? `Pass: ${found} found, ${accept} allowed. The lot could still hold up to about ${Math.round(100 * upper / lot * 10) / 10}% defective (${upper} of ${lot} pieces) and have shown this few.`
      : `Fail: ${found} found, ${accept} allowed. Ask for 100% sorting or rework, and reinspect a fresh sample before paying the balance.`,
  };
}

/** Inspector cost against the cost of shipping defects. */
export function inspectionValue({ lot, n, accept, unitCost, defectPct, inspectorFee = 0, reworkPerPiece = 0 }) {
  const p = defectPct / 100;
  const pa = acceptProb(lot, n, accept, p);
  const bad = Math.round(p * lot);
  return {
    acceptChance: pa,
    defectsShippedIfAccepted: bad,
    costOfShippedDefects: bad * unitCost,
    expectedSortingCost: (1 - pa) * lot * reworkPerPiece,
    inspectorFee,
  };
}
