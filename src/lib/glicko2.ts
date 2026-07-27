/**
 * Glicko-2 rating system (Glickman, "Example of the Glicko-2 system", 2012),
 * the algorithm chess.com's rating engine is built on. Ratings are updated
 * one comparison ("game") at a time rather than in batched rating periods,
 * which is the standard simplification for live, low-volume applications
 * like this one — mathematically it's just a rating period containing a
 * single game.
 */

const SCALE = 173.7178;
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
 * Updates one player's rating after a single game against one opponent.
 * Both players' "before" state must be used (not each other's "after"
 * state) since the update is simultaneous within the rating period.
 */
export function updateGlicko(
  player: GlickoState,
  opponent: GlickoState,
  score: Score
): GlickoState {
  const mu = toMu(player.rating);
  const phi = toPhi(player.rd);
  const sigma = player.volatility;

  const muOpp = toMu(opponent.rating);
  const phiOpp = toPhi(opponent.rd);

  const gOpp = g(phiOpp);
  const eVal = E(mu, muOpp, phiOpp);

  const v = 1 / (gOpp * gOpp * eVal * (1 - eVal));
  const delta = v * gOpp * (score - eVal);

  // Step 4: solve for new volatility via the Illinois algorithm.
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
  const newMu = mu + newPhi * newPhi * gOpp * (score - eVal);

  const newRating = SCALE * newMu + DEFAULT_RATING;
  const newRd = Math.max(MIN_RD, SCALE * newPhi);

  return { rating: newRating, rd: newRd, volatility: newSigma };
}

/** Applies one comparison to both items and returns their new states. */
export function applyComparison(
  itemA: GlickoState,
  itemB: GlickoState,
  result: "A" | "B" | "EQUAL"
): { a: GlickoState; b: GlickoState } {
  const scoreA: Score = result === "A" ? 1 : result === "B" ? 0 : 0.5;
  const scoreB: Score = result === "B" ? 1 : result === "A" ? 0 : 0.5;

  return {
    a: updateGlicko(itemA, itemB, scoreA),
    b: updateGlicko(itemB, itemA, scoreB),
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
