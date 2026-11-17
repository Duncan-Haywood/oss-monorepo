/**
 * Glicko-2 rating system (Glickman, "Example of the Glicko-2 system", 2012),
 * a chess-style rating system designed by Mark Glickman. Ratings are updated
 * one comparison ("game") at a time rather than in batched rating periods,
 * which is the standard simplification for live, low-volume applications
 * like this one — mathematically it's just a rating period containing a
 * single game.
 */

const SCALE = 173.7178;
/** Rating points per unit of Glicko-2's internal logit scale. */
export const GLICKO_SCALE = SCALE;
const DEFAULT_RATING = 1500;
const DEFAULT_RD = 350;
const DEFAULT_VOLATILITY = 0.06;
const MIN_RD = 30; // floor so an item never reads as "fully certain"
const TAU = 0.5; // system constant; 0.3-1.2 is the recommended range
const EPSILON = 0.000001;

export type GlickoState = {
  rating: number;
  rd: number;
  volatility: number;
};

export const DEFAULT_GLICKO_STATE: GlickoState = {
  rating: DEFAULT_RATING,
  rd: DEFAULT_RD,
  volatility: DEFAULT_VOLATILITY,
};

/** Outcome from the perspective of the player being updated. */
export type Score = 0 | 0.5 | 1;

function toMu(rating: number): number {
  return (rating - DEFAULT_RATING) / SCALE;
}

function toPhi(rd: number): number {
  return rd / SCALE;
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function E(mu: number, muOpp: number, phiOpp: number): number {
  return 1 / (1 + Math.exp(-g(phiOpp) * (mu - muOpp)));
}

/**
 * Glickman's steps 5 to 8, shared by the single-game and rating-period
 * updates: given the estimated variance v and the score step
 * sum g(phi_j) (s_j - E_j), solve for the new volatility and return the new
 * state. Keeping one copy means the published period example
 * (updateGlickoPeriod, pinned in glicko2.test.ts) checks the arithmetic the
 * live single-game update runs.
 */
function finishUpdate(mu: number, phi: number, sigma: number, v: number, step: number): GlickoState {
  const delta = v * step;
  // Step 5: solve for new volatility via the Illinois algorithm.
  const a = Math.log(sigma * sigma);
  const f = (x: number) => {
    const ex = Math.exp(x);
    const num = ex * (delta * delta - phi * phi - v - ex);
    const den = 2 * Math.pow(phi * phi + v + ex, 2);
    return num / den - (x - a) / (TAU * TAU);
  };

  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0) k++;
    B = a - k * TAU;
  }

  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > EPSILON) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB < 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }

  const newSigma = Math.exp(A / 2);

  const phiStar = Math.sqrt(phi * phi + newSigma * newSigma);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * step;

  const newRating = SCALE * newMu + DEFAULT_RATING;
  const newRd = Math.max(MIN_RD, SCALE * newPhi);

  return { rating: newRating, rd: newRd, volatility: newSigma };
}

/**
 * Updates one player's rating after a single game against one opponent.
 * Both players' "before" state must be used (not each other's "after"
 * state) since the update is simultaneous within the rating period.
 */
export function updateGlicko(
  player: GlickoState,
  opponent: GlickoState,
  score: Score,
  lapse = 0
): GlickoState {
  if (!(lapse >= 0 && lapse < 1)) throw new RangeError("lapse must be in [0, 1)");
  const mu = toMu(player.rating);
  const phi = toPhi(player.rd);
  const sigma = player.volatility;

  const muOpp = toMu(opponent.rating);
  const phiOpp = toPhi(opponent.rd);

  const gOpp = g(phiOpp);
  const eVal = E(mu, muOpp, phiOpp);

  // With lapse e the answer is a coin flip with chance e, so the chance of
  // a win is q = e/2 + (1 - e) p. Glicko-2's v and delta are the inverse
  // Fisher information and the score step of the one-game log-likelihood;
  // with q in place of p they become info = (dq/dmu)^2 / (q(1 - q)) and
  // step = (s - q) dq/dmu / (q(1 - q)), dq/dmu = (1 - e) g p (1 - p). At
  // e = 0 both reduce to the published formulas, and that branch keeps the
  // published arithmetic exactly (pinned in glicko2.test.ts).
  let v: number;
  let step: number;
  if (lapse === 0) {
    v = 1 / (gOpp * gOpp * eVal * (1 - eVal));
    step = gOpp * (score - eVal);
  } else {
    const q = lapse / 2 + (1 - lapse) * eVal;
    const dq = (1 - lapse) * gOpp * eVal * (1 - eVal);
    v = (q * (1 - q)) / (dq * dq);
    step = ((score - q) * dq) / (q * (1 - q));
  }

  return finishUpdate(mu, phi, sigma, v, step);
}

/**
 * Glickman's full rating-period update: one player against several
 * opponents at once, all at their pre-period state (steps 3 and 4 summed
 * over the games, then the shared steps 5 to 8). The live survey applies one
 * comparison at a time (updateGlicko); this exists so the paper's worked
 * example can be checked against the same arithmetic.
 */
export function updateGlickoPeriod(
  player: GlickoState,
  games: { opponent: GlickoState; score: Score }[]
): GlickoState {
  if (games.length === 0) throw new RangeError("a rating period needs at least one game");
  const mu = toMu(player.rating);
  const phi = toPhi(player.rd);
  let info = 0;
  let step = 0;
  for (const { opponent, score } of games) {
    const gOpp = g(toPhi(opponent.rd));
    const eVal = E(mu, toMu(opponent.rating), toPhi(opponent.rd));
    info += gOpp * gOpp * eVal * (1 - eVal);
    step += gOpp * (score - eVal);
  }
  return finishUpdate(mu, phi, player.volatility, 1 / info, step);
}

/**
 * Applies one comparison to both items and returns their new states.
 * `lapse` (default 0, the published Glicko-2) is the assumed share of answers
 * given at random; see updateGlicko. The survey routes pass 0 (measured in
 * docs/INFORMATION-GAIN-SELECTOR.md, "A Glicko update with a lapse term").
 */
export function applyComparison(
  itemA: GlickoState,
  itemB: GlickoState,
  result: "A" | "B" | "EQUAL",
  lapse = 0
): { a: GlickoState; b: GlickoState } {
  const scoreA: Score = result === "A" ? 1 : result === "B" ? 0 : 0.5;
  const scoreB: Score = result === "B" ? 1 : result === "A" ? 0 : 0.5;

  return {
    a: updateGlicko(itemA, itemB, scoreA, lapse),
    b: updateGlicko(itemB, itemA, scoreB, lapse),
  };
}

/** 95% confidence interval around a rating, from its rating deviation. */
export function confidenceInterval95(rating: number, rd: number): [number, number] {
  return [rating - 1.96 * rd, rating + 1.96 * rd];
}

/**
 * Converts a Glicko-2 rating to the internal logit ("mu") scale, so it can
 * be used as a fixed feature in another logit-linked model (see the
 * CONJOINED survey in lib/conjoint.ts, which mixes this with financial
 * attributes via a learned weight).
 */
export function ratingToLogit(rating: number): number {
  return toMu(rating);
}
