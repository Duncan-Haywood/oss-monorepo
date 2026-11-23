// League schedule generator, swiss-system.mjs: Swiss events on the page: rounds needed, results parsing, validation and text. The pairer is swiss.mjs.
// Split out of calc.mjs on 2026-11-23 (quality audit round 87); calc.mjs re-exports every public name.

import { teamIndex } from "./names.mjs";
import { parseResults } from "./standings.mjs";

// ---------------------------------------------------------------- swiss system

/** Rounds that decide a clear winner among n players: ceil(log2 n), at least 1. */
export function swissRounds(n) {
  return Math.max(1, Math.ceil(Math.log2(Math.max(2, n))));
}

/**
 * Read finished Swiss games, one per line, in round order:
 *   `Ana 1 - 0 Ben`   a played game, Ana white (equal numbers are a draw)
 *   `Cy bye`          the pairing bye (one point; a player gets it once)
 *   `Cy half bye`     a requested half-point bye; `Cy full bye` a requested full-point bye;
 *   `Cy zero bye`     or `Cy absent`, a round missed for no points
 *   `Ben forfeits to Ana` (or `Ana w/o Ben`)  Ana wins without playing
 *   `Dee out`         a player who has left (kept in the table, not paired again)
 *   `# Round 2`       a note, skipped
 * Unplayed rounds follow FIDE's handling as bbpPairings reads a TRF: they give no colour, a
 * forfeit does not stop the two players meeting later, and a forfeit win or full-point bye counts
 * as having had the pairing bye (2025 Dutch rules). A requested bye written one round ahead of the
 * rest (the round about to be paired) takes that player out of the next round.
 * Returns { games: [{a, b, ga, gb}], byes, byeRounds, withdrawn, errors } plus, for the pairer and
 * the TRF export, `gameRounds` (0-based round of each game), `extra` (points per player from
 * unplayed rounds), `extraRounds` ([{player, round, points}]), `byeBlocked`, `unplayed` (rounds
 * without a played game, per player), `absent` (sitting out the next round), `rounds` (rounds
 * done) and `events` (every line read, in order, with its round).
 */
export function parseSwissResults(text, players) {
  const games = [];
  const gameRounds = [];
  const byes = [];
  const byeRounds = [];
  const withdrawn = [];
  const errors = [];
  const events = [];
  const count = new Map();
  const at = (i) => count.get(i) ?? 0;
  const who = (name, n) => {
    const idx = teamIndex(players, name);
    if (idx < 0) errors.push(`Result line ${n}: "${name}" is not one of the players.`);
    return idx;
  };
  const requested = [
    [/^(.*?)\s+(?:half|half-point|half point|\u00bd)\s+bye$/i, "half", 0.5],
    [/^(.*?)\s+(?:full|full-point|full point)\s+bye$/i, "full", 1],
    [/^(.*?)\s+(?:(?:zero|zero-point|zero point)\s+bye|absent)$/i, "zero", 0],
  ];
  for (const [i, raw] of String(text ?? "").split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const n = i + 1;
    const w = line.match(/^(.*?)\s+(?:out|withdrawn|withdraws)$/i);
    if (w) {
      const idx = who(w[1], n);
      if (idx >= 0 && !withdrawn.includes(idx)) withdrawn.push(idx);
      continue;
    }
    const req = requested.find(([re]) => re.test(line));
    if (req) {
      const idx = who(line.match(req[0])[1], n);
      if (idx >= 0) { events.push({ kind: req[1], player: idx, points: req[2], round: at(idx) }); count.set(idx, at(idx) + 1); }
      continue;
    }
    const m = line.match(/^(.*?)\s+bye$/i);
    if (m) {
      const idx = who(m[1], n);
      if (idx >= 0) {
        byeRounds.push(at(idx));
        byes.push(idx);
        events.push({ kind: "bye", player: idx, round: at(idx) });
        count.set(idx, at(idx) + 1);
      }
      continue;
    }
    const f = line.match(/^(.*?)\s+forfeits?\s+(?:to|against|v|vs\.?)\s+(.*)$/i);
    let forfeit = null;
    if (f) {
      const loser = who(f[1], n);
      const winner = who(f[2], n);
      if (loser < 0 || winner < 0) continue;
      if (loser === winner) { errors.push(`Result line ${n}: a player cannot play themselves.`); continue; }
      forfeit = { winner, loser };
    } else {
      const parsed = parseResults(line, players);
      for (const e of parsed.errors) errors.push(e.replace(/^Result line \d+/, `Result line ${n}`).replace(/teams?\b/g, (t) => (t === "team" ? "player" : "players")));
      for (const g of parsed.results) {
        if (g.walkover) { forfeit = g.ga >= g.gb ? { winner: g.a, loser: g.b } : { winner: g.b, loser: g.a }; continue; }
        const r = Math.max(at(g.a), at(g.b));
        games.push({ a: g.a, b: g.b, ga: g.ga, gb: g.gb });
        gameRounds.push(r);
        events.push({ kind: "game", a: g.a, b: g.b, ga: g.ga, gb: g.gb, round: r });
        count.set(g.a, r + 1); count.set(g.b, r + 1);
      }
    }
    if (forfeit) {
      const r = Math.max(at(forfeit.winner), at(forfeit.loser));
      events.push({ kind: "forfeit", ...forfeit, round: r });
      count.set(forfeit.winner, r + 1); count.set(forfeit.loser, r + 1);
    }
  }
  // Rounds done: the last round anyone was paired in (a game, the bye or a forfeit). A requested
  // bye beyond it is for the round about to be paired.
  let rounds = 0;
  for (const e of events) if (e.kind === "game" || e.kind === "bye" || e.kind === "forfeit") rounds = Math.max(rounds, e.round + 1);
  const extra = players.map(() => 0);
  const extraRounds = [];
  const blocked = new Set();
  const absent = [];
  const playedGames = players.map(() => 0);
  for (const e of events) {
    if (e.kind === "game") { playedGames[e.a]++; playedGames[e.b]++; continue; }
    if (e.kind === "bye") continue;
    if (e.kind === "forfeit") {
      extra[e.winner] += 1;
      extraRounds.push({ player: e.winner, round: e.round, points: 1 });
      blocked.add(e.winner);
      continue;
    }
    if (e.round >= rounds) {
      if (e.round > rounds) errors.push(`${players[e.player]} has a bye listed more than one round ahead of the event.`);
      else if (!absent.includes(e.player)) absent.push(e.player);
      continue;
    }
    extra[e.player] += e.points;
    if (e.points) extraRounds.push({ player: e.player, round: e.round, points: e.points });
    if (e.kind === "full") blocked.add(e.player);
  }
  const unplayed = playedGames.map((g) => Math.max(0, rounds - g));
  return { games, byes, byeRounds, withdrawn, errors, gameRounds, extra, extraRounds, byeBlocked: [...blocked], unplayed, absent, rounds, events };
}

/** Check a pairing: everyone placed once, no rematches, bye unused. Returns a list of problems. */
export function validateSwiss(players, games, byes, round, withdrawn = []) {
  const problems = [];
  const seen = new Set();
  for (const { white, black } of round.pairs) {
    for (const i of [white, black]) { if (seen.has(i)) problems.push(`${players[i]} is paired twice.`); seen.add(i); }
    if (games.some((g) => (g.a === white && g.b === black) || (g.a === black && g.b === white))) problems.push(`${players[white]} and ${players[black]} already played.`);
  }
  if (round.bye !== null) { if (seen.has(round.bye)) problems.push(`${players[round.bye]} has a bye and a game.`); seen.add(round.bye); if (byes.includes(round.bye) && byes.length < players.length - withdrawn.length) problems.push(`${players[round.bye]} already had a bye.`); }
  for (const i of withdrawn) if (seen.has(i)) problems.push(`${players[i]} has left the event but is paired.`);
  if (seen.size !== players.length - withdrawn.length) problems.push("Not every player is paired.");
  return problems;
}

/** Plain-text pairing sheet for pasting into a group chat. */
export function swissText(players, round, roundNumber) {
  const lines = [`Round ${roundNumber}`];
  round.pairs.forEach((p, i) => lines.push(`  Board ${i + 1}: ${players[p.white]} (white) vs ${players[p.black]} (black)`));
  if (round.bye !== null) lines.push(`  Bye: ${players[round.bye]}`);
  return lines.join("\n");
}
