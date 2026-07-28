import { DIMENSION_LABELS, Dimension } from "@/lib/surveyData";

export type HeadToHead = {
  aDimensions: string[];
  bDimensions: string[];
  /** "A" | "B" | "EQUAL" */
  result: string;
};

export type TradeOff = {
  winner: Dimension;
  winnerLabel: string;
  loser: Dimension;
  loserLabel: string;
  winnerWins: number;
  loserWins: number;
  ties: number;
  n: number;
  /** Share of decisive contests the winner took, 0.5..1. */
  rate: number;
  /** Wilson lower bound at 95% — how confident we are it's a real lean. */
  lowerBound: number;
};

/**
 * Wilson score interval lower bound. Used instead of the raw win rate
 * because 3/3 and 30/30 are both "100%" but mean very different things,
 * and ranking by raw rate would put a 3-observation fluke on top.
 */
function wilsonLower(wins: number, n: number, z = 1.96): number {
  if (n === 0) return 0;
  const p = wins / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return (centre - margin) / denom;
}

/**
 * Observed trade-offs: what actually wins when two dimensions collide.
 *
 * This counts real head-to-head choices rather than inferring from the
 * ranking. If someone rated "deeply kind" above "relentlessly hardworking"
 * that's one data point about warmth vs ambition — but only when those two
 * items were literally shown against each other did the person genuinely
 * trade one off against the other.
 *
 * Only an item's PRIMARY dimension counts. Items signal several, and
 * crediting all of them would double-count a single choice across pairs
 * that were never really in conflict.
 */
export function computeTradeOffs(rows: HeadToHead[], minObservations = 4): TradeOff[] {
  // key: "dimA|dimB" with dimA < dimB alphabetically, so each pairing has one bucket
  const buckets = new Map<string, { aWins: number; bWins: number; ties: number }>();

  for (const row of rows) {
    const da = row.aDimensions[0];
    const db = row.bDimensions[0];
    if (!da || !db || da === db) continue; // same dimension isn't a trade-off

    const [first, second] = da < db ? [da, db] : [db, da];
    const key = `${first}|${second}`;
    const b = buckets.get(key) ?? { aWins: 0, bWins: 0, ties: 0 };

    if (row.result === "EQUAL") {
      b.ties++;
    } else {
      const winnerDim = row.result === "A" ? da : db;
      if (winnerDim === first) b.aWins++;
      else b.bWins++;
    }
    buckets.set(key, b);
  }

  const out: TradeOff[] = [];
  for (const [key, b] of buckets) {
    const [first, second] = key.split("|") as [Dimension, Dimension];
    const decisive = b.aWins + b.bWins;
    if (decisive + b.ties < minObservations || decisive === 0) continue;

    const firstWon = b.aWins >= b.bWins;
    const winner = firstWon ? first : second;
    const loser = firstWon ? second : first;
    const winnerWins = firstWon ? b.aWins : b.bWins;
    const loserWins = firstWon ? b.bWins : b.aWins;

    out.push({
      winner,
      winnerLabel: DIMENSION_LABELS[winner],
      loser,
      loserLabel: DIMENSION_LABELS[loser],
      winnerWins,
      loserWins,
      ties: b.ties,
      n: decisive + b.ties,
      rate: winnerWins / decisive,
      lowerBound: wilsonLower(winnerWins, decisive),
    });
  }

  // Strongest, best-evidenced leans first.
  return out.sort((a, b) => b.lowerBound - a.lowerBound);
}

/** Plain-language read of the single clearest trade-off, or null if none is solid. */
export function describeTradeOff(t: TradeOff | undefined): string | null {
  if (!t) return null;
  // Below ~60% with confidence, it isn't a lean worth claiming.
  if (t.lowerBound < 0.55) return null;
  const pct = Math.round(t.rate * 100);
  return `When ${t.winnerLabel.toLowerCase()} and ${t.loserLabel.toLowerCase()} go head to head, you pick ${t.winnerLabel.toLowerCase()} ${pct}% of the time.`;
}
