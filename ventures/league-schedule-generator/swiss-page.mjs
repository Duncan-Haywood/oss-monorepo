// The state behind swiss-pairing.html: a club's Swiss event run round by round from one phone.
// The pairing itself is swiss.mjs (FIDE Dutch, bracket by bracket); this file reads the player
// list (optionally with ratings), turns a round's board results into result lines the pairer
// reads (calc.mjs parseSwissResults), and pairs the next round with the checks the page shows.
import { parseSwissResults, validateSwiss, swissRounds } from "./swiss-system.mjs";
import { swissPairings, swissStandings } from "./swiss.mjs";

/**
 * Players, one per line, strongest first, or with a rating after a comma, tab or two spaces
 * ("Ana Petrova, 1874"). When any line has a rating, players are sorted by rating, highest first
 * (unrated players after, in the order typed), which is the starting order FIDE's Dutch rules pair
 * on. Returns { players, ratings, errors }.
 */
export function parsePlayerLines(text) {
  const rows = [];
  const errors = [];
  const seen = new Set();
  for (const [i, raw] of String(text ?? "").split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(.*?)(?:\s*[,\t]\s*|\s{2,})(\d{3,4})$/);
    const name = (m ? m[1] : line).replace(/\s+/g, " ").trim();
    const rating = m ? Number(m[2]) : null;
    if (!name) { errors.push(`Player line ${i + 1} has no name.`); continue; }
    const key = name.toLowerCase();
    if (seen.has(key)) { errors.push(`"${name}" is listed twice.`); continue; }
    seen.add(key);
    rows.push({ name, rating, at: rows.length });
  }
  if (rows.some((r) => r.rating !== null)) {
    rows.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.at - b.at);
  }
  if (rows.length < 2) errors.push("List at least two players, one per line.");
  return { players: rows.map((r) => r.name), ratings: rows.map((r) => r.rating), errors };
}

/** The result choices a board offers, as the page's select values. */
export const RESULTS = [
  ["", "–"],
  ["1-0", "1-0"],
  ["d", "½-½"],
  ["0-1", "0-1"],
  ["+-", "+/− black forfeits"],
  ["-+", "−/+ white forfeits"],
];

/**
 * Result lines for one finished round, in the syntax parseSwissResults reads. `round` is a pairing
 * ({ pairs: [{white, black}], bye }); `results[k]` is board k's choice from RESULTS. Returns
 * { text, missing } where `missing` lists the boards (1-based) still without a result.
 */
export function roundResultLines(players, round, results, roundNumber) {
  const lines = [`# Round ${roundNumber}`];
  const missing = [];
  round.pairs.forEach((p, k) => {
    const w = players[p.white], b = players[p.black];
    const r = results[k] ?? "";
    if (r === "1-0") lines.push(`${w} 1 - 0 ${b}`);
    else if (r === "0-1") lines.push(`${w} 0 - 1 ${b}`);
    else if (r === "d") lines.push(`${w} 1 - 1 ${b}`);
    else if (r === "+-") lines.push(`${b} forfeits to ${w}`);
    else if (r === "-+") lines.push(`${w} forfeits to ${b}`);
    else missing.push(k + 1);
  });
  if (round.bye !== null && round.bye !== undefined) lines.push(`${players[round.bye]} bye`);
  return { text: lines.join("\n"), missing };
}

/**
 * Pair the next round of an event. Returns { round, roundNumber, totalRounds, standings, notes,
 * parsed } or { error }. `seedOrder` (default true) pairs each score group in starting order, as
 * the Dutch rules do; false orders by Buchholz, then Sonneborn-Berger. `initialColour` ("W" or "B")
 * is the colour drawn for the top seed in round 1 (FIDE C.04.3 E.5); it also settles later boards
 * where neither player has a colour claim.
 */
export function pairNext(players, resultsText, { seedOrder = true, totalRounds = null, initialColour = "W" } = {}) {
  const parsed = parseSwissResults(resultsText, players);
  if (parsed.errors.length) return { error: parsed.errors.join(" ") };
  let round;
  try {
    round = swissPairings(players, parsed.games, parsed.byes, parsed.withdrawn, { ...parsed, groupOrder: seedOrder ? "seed" : "buchholz", initialColour });
  } catch (e) {
    return { error: e.message };
  }
  const problems = validateSwiss(players, parsed.games, parsed.byes.concat(parsed.byeBlocked), round, parsed.withdrawn.concat(parsed.absent));
  if (problems.length) return { error: problems.join(" ") };
  const notes = [];
  if (round.floaters) notes.push(`${round.floaters === 1 ? "1 board pairs" : `${round.floaters} boards pair`} players on different scores (no closer round exists).`);
  const rep = round.repeats ? round.repeats.down + round.repeats.up : 0;
  if (rep) notes.push(`${rep === 1 ? "1 player floats" : `${rep} players float`} the same way as last round.`);
  if (round.clashes?.absolute) notes.push(`${round.clashes.absolute} board${round.clashes.absolute === 1 ? "" : "s"} could not give both players their due colour: every possible round needs it.`);
  return {
    round,
    roundNumber: parsed.rounds + 1,
    totalRounds: totalRounds || swissRounds(players.length - parsed.withdrawn.length),
    standings: swissStandings(players, parsed.games, parsed.byes, { extra: parsed.extra }),
    notes,
    parsed,
  };
}

/** Standings after the results so far (no pairing). Returns rows or { error }. */
export function standingsNow(players, resultsText) {
  const parsed = parseSwissResults(resultsText, players);
  if (parsed.errors.length) return { error: parsed.errors.join(" ") };
  return { rows: swissStandings(players, parsed.games, parsed.byes, { extra: parsed.extra }), rounds: parsed.rounds };
}
