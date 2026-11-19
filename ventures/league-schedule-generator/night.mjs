// Americano / Mexicano night scorer: the state behind americano-night.html.
//
// calc.mjs already builds the rotation (americano(), with the stored whist designs) and draws a
// Mexicano round from the scores (mexicanoNextRound()). What an organiser standing at the courts
// still needs is somewhere to type each game's score and a table that is right after every game:
// points credited to both partners, games played, sit-outs, and an optional sit-out credit so a
// player who sat out more rounds is not ranked down for it. This module is that state, kept as
// plain JSON so the page can store it in localStorage and put a read-only copy in a link.
//
// Nothing here touches the DOM, storage or the network.

import { americano, mexicanoNextRound, parseTeams } from "./calc.mjs";

export const SIT_OUT_RULES = ["none", "average", "half"];
export const MAX_PLAYERS = 64;
export const MAX_POINTS = 999;

const clampInt = (v, lo, hi, dflt) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

/** Player names from a pasted list (one per line or comma-separated), duplicates refused. */
export function parsePlayersList(text) {
  const { teams, errors: dup } = parseTeams(text);
  const errors = dup.filter((e) => /listed twice/.test(e)).map((e) => e.replace("listed twice.", "listed twice; add an initial to tell them apart."));
  const players = teams.map((t) => t.slice(0, 80));
  if (players.length < 4) errors.push("A doubles night needs at least 4 players.");
  if (players.length > MAX_PLAYERS) errors.push(`Up to ${MAX_PLAYERS} players.`);
  return { players, errors };
}

/**
 * Start a night. mode "americano" fixes every round now (whist design where one exists);
 * mode "mexicano" draws round one at random and each later round from the table.
 * target: points per game when games are played to a total (e.g. 24 in padel Americano, where the
 * two scores add up to 24); 0 means any score.
 */
export function newNight({ players, courts = 1, rounds = null, mode = "americano", target = 0, sitOut = "average", seed = 1 } = {}) {
  if (!Array.isArray(players) || players.length < 4) throw new Error("A doubles night needs at least 4 players.");
  if (players.length > MAX_PLAYERS) throw new Error(`Up to ${MAX_PLAYERS} players.`);
  if (!["americano", "mexicano"].includes(mode)) throw new Error("Mode is americano or mexicano.");
  courts = clampInt(courts, 1, 16, 1);
  target = clampInt(target, 0, MAX_POINTS, 0);
  if (!SIT_OUT_RULES.includes(sitOut)) sitOut = "average";
  seed = clampInt(seed, 1, 2 ** 31 - 1, 1);
  const night = { v: 1, mode, players: players.slice(), courts, target, sitOut, seed, rounds: [], scores: {} };
  if (mode === "americano") {
    const r = rounds == null || rounds === "" ? null : clampInt(rounds, 1, 200, null);
    const plan = americano(players, { courts, rounds: r, seed });
    night.rounds = plan.rounds.map(slimRound);
    if (plan.design) night.design = { whist: true };
  } else {
    night.plannedRounds = rounds == null || rounds === "" ? null : clampInt(rounds, 1, 200, null);
    night.rounds = [slimRound(mexicanoNextRound(players, [], { courts, seed }))];
  }
  return night;
}

function slimRound(r) {
  return { matches: r.matches.map((m) => ({ court: m.court, a: m.a.slice(), b: m.b.slice() })), byes: r.byes.slice() };
}

const key = (r, court) => `${r}-${court}`;

/** The score of round r (0-based), court c, or null. */
export function getScore(night, r, court) {
  const s = night.scores[key(r, court)];
  return s ? s.slice() : null;
}

/** The other side's score when games are played to a total, else null. */
export function otherSide(night, mine) {
  const n = Number(mine);
  if (!night.target || !Number.isInteger(n) || n < 0 || n > night.target) return null;
  return night.target - n;
}

/**
 * Record (or clear, with sa === "" / null) a score. Returns { night, error, warning }: the input
 * night is never changed. Scores are whole numbers 0-999; with a target, a pair that does not add
 * up to it is kept but warned about (a game stopped by the clock is common).
 */
export function setScore(night, r, court, sa, sb) {
  const round = night.rounds[r];
  if (!round || !round.matches.some((m) => m.court === court)) return { night, error: "No such game." };
  const next = { ...night, scores: { ...night.scores } };
  const blank = (x) => x === "" || x === null || x === undefined;
  if (blank(sa) && blank(sb)) { delete next.scores[key(r, court)]; return { night: next }; }
  const a = Number(sa), b = Number(sb);
  if (![a, b].every((x) => Number.isInteger(x) && x >= 0 && x <= MAX_POINTS)) return { night, error: "Scores are whole numbers from 0 to 999." };
  next.scores[key(r, court)] = [a, b];
  const warning = night.target && a + b !== night.target ? `${a} + ${b} is not ${night.target}; kept as typed.` : undefined;
  return { night: next, warning };
}

/** True when every game of round r has a score. */
export function roundDone(night, r) {
  const round = night.rounds[r];
  return !!round && round.matches.every((m) => night.scores[key(r, m.court)]);
}

/** Index of the first round with a game still to score (rounds.length when all are scored). */
export function currentRound(night) {
  for (let r = 0; r < night.rounds.length; r++) if (!roundDone(night, r)) return r;
  return night.rounds.length;
}

/** Finished games in calc.mjs's Mexicano shape: [{ a, b, sa, sb, round, court }]. */
export function finishedGames(night) {
  const out = [];
  night.rounds.forEach((round, r) => {
    for (const m of round.matches) {
      const s = night.scores[key(r, m.court)];
      if (s) out.push({ a: m.a, b: m.b, sa: s[0], sb: s[1], round: r, court: m.court });
    }
  });
  return out;
}

/**
 * Mexicano: draw the next round from the table. Refused until the last round is fully scored (the
 * draw depends on it) or once the planned number of rounds is reached. Returns { night, error }.
 */
export function drawNextRound(night) {
  if (night.mode !== "mexicano") return { night, error: "Americano rounds are fixed at the start." };
  const last = night.rounds.length - 1;
  if (last >= 0 && !roundDone(night, last)) return { night, error: `Score every game of round ${last + 1} first.` };
  if (night.plannedRounds && night.rounds.length >= night.plannedRounds) return { night, error: `All ${night.plannedRounds} planned rounds are drawn.` };
  const r = mexicanoNextRound(night.players, finishedGames(night), { courts: night.courts, seed: night.seed });
  return { night: { ...night, rounds: [...night.rounds, slimRound(r)] } };
}

/**
 * The table after every scored game. Each player gets their side's points (pf), the other side's (pa),
 * and a win, draw or loss. A sit-out counts once its round is fully scored, and earns a credit by
 * night.sitOut: "none"; "average" (the player's own points per game so far, rounded to 0.1); "half"
 * (half the target, when games go to a total, else nothing). Ranked by total (points + credit), then
 * points difference, then wins, then list order.
 */
export function leaderboard(night) {
  const n = night.players.length;
  const rows = night.players.map((name, i) => ({ i, name, played: 0, wins: 0, draws: 0, losses: 0, pf: 0, pa: 0, diff: 0, satOut: 0, credit: 0, total: 0, avg: 0 }));
  for (const g of finishedGames(night)) {
    for (const [side, mine, theirs] of [[g.a, g.sa, g.sb], [g.b, g.sb, g.sa]]) {
      for (const i of side) {
        const r = rows[i];
        r.played++; r.pf += mine; r.pa += theirs; r.diff += mine - theirs;
        if (mine > theirs) r.wins++; else if (mine === theirs) r.draws++; else r.losses++;
      }
    }
  }
  night.rounds.forEach((round, r) => { if (roundDone(night, r)) for (const i of round.byes) rows[i].satOut++; });
  for (const row of rows) {
    row.avg = row.played ? Math.round((row.pf / row.played) * 10) / 10 : 0;
    // From the unrounded average: 63 points in 4 games, 2 sit-outs is 31.5, not 15.8 x 2 = 31.6.
    if (night.sitOut === "average") row.credit = row.played ? Math.round((row.pf / row.played) * row.satOut * 10) / 10 : 0;
    else if (night.sitOut === "half" && night.target) row.credit = (night.target / 2) * row.satOut;
    row.total = Math.round((row.pf + row.credit) * 10) / 10;
  }
  rows.sort((x, y) => y.total - x.total || y.diff - x.diff || y.wins - x.wins || x.i - y.i);
  let rank = 0;
  rows.forEach((row, k) => {
    const prev = rows[k - 1];
    if (!prev || prev.total !== row.total || prev.diff !== row.diff || prev.wins !== row.wins) rank = k + 1;
    row.rank = rank;
  });
  if (rows.length !== n) throw new Error("internal: table size");
  return rows;
}

const fmt = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
const signed = (x) => (x > 0 ? `+${x}` : String(x));

/** Plain-text standings for the group chat. */
export function leaderboardText(night, title = "") {
  const rows = leaderboard(night);
  const done = finishedGames(night).length;
  const total = night.rounds.reduce((s, r) => s + r.matches.length, 0);
  const lines = [];
  if (title) lines.push(title);
  const label = night.mode === "mexicano" ? "Mexicano" : "Americano";
  lines.push(`${label} standings after ${done} of ${total}${night.mode === "mexicano" && !night.plannedRounds ? " drawn" : ""} games`);
  const credit = rows.some((r) => r.credit);
  for (const r of rows) {
    lines.push(`${r.rank}. ${r.name}  ${fmt(r.total)} pts${credit && r.credit ? ` (incl. ${fmt(r.credit)} sit-out)` : ""}  ${signed(r.diff)}  ${r.wins}W ${r.played} played`);
  }
  return lines.join("\n");
}

const csvCell = (v) => {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; // spreadsheet formula guard; plain numbers pass
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Standings CSV, then every game. */
export function nightCsv(night) {
  const rows = leaderboard(night);
  const out = [["Rank", "Player", "Total", "Points for", "Points against", "Difference", "Sit-out credit", "Played", "Won", "Drawn", "Lost", "Sat out", "Average per game"].join(",")];
  for (const r of rows) out.push([r.rank, r.name, r.total, r.pf, r.pa, r.diff, r.credit, r.played, r.wins, r.draws, r.losses, r.satOut, r.avg].map(csvCell).join(","));
  out.push("", ["Round", "Court", "Side A", "Score A", "Score B", "Side B"].join(","));
  const p = night.players;
  night.rounds.forEach((round, r) => {
    for (const m of round.matches) {
      const s = night.scores[key(r, m.court)];
      out.push([r + 1, m.court, `${p[m.a[0]]} & ${p[m.a[1]]}`, s ? s[0] : "", s ? s[1] : "", `${p[m.b[0]]} & ${p[m.b[1]]}`].map(csvCell).join(","));
    }
  });
  return out.join("\n") + "\n";
}

/** Check a night read back from storage or a link: shape, indices, scores. Returns problems ([] = fine). */
export function checkNight(night) {
  const problems = [];
  if (!night || night.v !== 1) return ["Not a saved night from this page."];
  const n = Array.isArray(night.players) ? night.players.length : 0;
  if (n < 4 || n > MAX_PLAYERS || !night.players.every((p) => typeof p === "string" && p.length <= 80)) problems.push("Player list is not valid.");
  if (!["americano", "mexicano"].includes(night.mode)) problems.push("Unknown mode.");
  if (!Array.isArray(night.rounds) || night.rounds.length > 200) return [...problems, "Rounds are not valid."];
  night.rounds.forEach((round, r) => {
    const seen = new Set();
    const mark = (i) => { if (!Number.isInteger(i) || i < 0 || i >= n || seen.has(i)) problems.push(`Round ${r + 1} places a player wrongly.`); seen.add(i); };
    for (const m of round.matches || []) [...m.a, ...m.b].forEach(mark);
    (round.byes || []).forEach(mark);
  });
  for (const [k, s] of Object.entries(night.scores || {})) {
    const [r, c] = k.split("-").map(Number);
    const ok = night.rounds[r]?.matches.some((m) => m.court === c) && Array.isArray(s) && s.length === 2 && s.every((x) => Number.isInteger(x) && x >= 0 && x <= MAX_POINTS);
    if (!ok) problems.push(`Score ${k} is not valid.`);
  }
  return [...new Set(problems)];
}

/** Compact, URL-safe text of a night for a read-only link (#night=...). */
export function encodeNight(night) {
  const json = JSON.stringify(night);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Inverse of encodeNight; returns { night } or { error }. */
export function decodeNight(text) {
  try {
    const b64 = String(text).replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
    const night = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    const problems = checkNight(night);
    return problems.length ? { error: problems[0] } : { night };
  } catch {
    return { error: "This link is damaged or cut short." };
  }
}
