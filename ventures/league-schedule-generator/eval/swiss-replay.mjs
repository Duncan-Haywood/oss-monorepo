// Replay helper for eval/swiss-vs-published.mjs: pair one round of a parsed TRF from the rounds
// before it, as the page would after opening the file.
import { trfToResults } from "../trf.mjs";
import { parseSwissResults, swissPairings } from "../calc.mjs";
import { swissStandings } from "../swiss.mjs";

/** Pair round k (1-based) of a parsed TRF, using only rounds before k; `absentIds` sit out round k. */
export function pairRound(trf, k, absentIds = [], opts = {}) {
  const absent = new Set(absentIds);
  const t = {
    ...trf,
    players: trf.players.map((p) => {
      const rounds = p.rounds.slice(0, k - 1).map((b) => (b ? { ...b } : null));
      while (rounds.length < k - 1) rounds.push(null);
      if (absent.has(p.id)) rounds[k - 1] = { opponent: null, colour: null, result: "Z" };
      // A pre-entered requested bye for round k in the file stays (trfToResults reads it).
      else if (p.rounds[k - 1] && p.rounds[k - 1].opponent == null && /[FHZ]/.test(p.rounds[k - 1].result)) rounds[k - 1] = { ...p.rounds[k - 1] };
      while (rounds.length && rounds[rounds.length - 1] === null) rounds.pop();
      return { ...p, rounds };
    }),
  };
  const box = trfToResults(t);
  if (box.errors.length) throw new Error(box.errors.join("; "));
  const p = parseSwissResults(box.results, box.players);
  if (p.errors.length) throw new Error(p.errors.slice(0, 3).join("; "));
  const round = swissPairings(box.players, p.games, p.byes, p.withdrawn, { ...p, groupOrder: "seed", ...opts });
  const id = (i) => trf.players[i].id;
  const out = { boards: round.pairs.map((b) => [id(b.white), id(b.black)]), bye: round.bye == null ? null : id(round.bye), method: round.method };
  if (opts.withScores) {
    // Pre-round score by TRF id, as the pairer ranks it (for eval/swiss-miss-brackets.mjs).
    const table = swissStandings(box.players, p.games, p.byes, { extra: p.extra ?? null });
    out.scores = new Map(table.map((r) => [id(r.index), r.score]));
  }
  return out;
}

