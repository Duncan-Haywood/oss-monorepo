// League schedule generator, americano.mjs: Americano and Mexicano: rotations (whist designs), stats, score parsing, standings and the next round.
// Split out of calc.mjs on 2026-11-23 (quality audit round 87); calc.mjs re-exports every public name.

import { whistRotation } from "./whist.mjs";
import { mulberry32 } from "./rng.mjs";

// ---------------------------------------------------------------- Americano

/**
 * Whether a whist rotation is worth using over the greedy one. Ghost seats sit out whole tables,
 * so a design can leave courts idle: use it only when its rounds fill, on average, at least 90% of
 * the courts the greedy search fills (min(courts, floor(n/4))). One ghost (4k+3 players) passes;
 * two ghosts cost each player 2-3 games over the evening and fall back to greedy
 * (eval/whist-vs-greedy.txt). 4k+2 players with a stored near-whist design (whist.mjs) use it with
 * no ghost.
 */
/** Lower is better: repeat partnerships first, then the most times one pair meets as opponents, then how many pairs do. */
function americanoScore(plan) {
  const n = plan.partner.length;
  let rep = 0, maxOpp = 0, atMax = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (plan.partner[i][j] > 1) rep += plan.partner[i][j] - 1;
    const o = plan.opponent[i][j];
    if (o > maxOpp) { maxOpp = o; atMax = 1; } else if (o === maxOpp) atMax++;
  }
  return rep * 1e6 + maxOpp * 1e4 + atMax;
}

function whistWorthIt(n, courts, w) {
  if (w.design.ghosts >= 2) return false;
  const full = Math.min(courts, Math.floor(n / 4));
  const games = w.rounds.reduce((s, r) => s + r.matches.length, 0) / w.rounds.length;
  return games >= 0.9 * full;
}

/**
 * Rotating-partner doubles ("Americano", social padel / pickleball / badminton nights): every round
 * players are re-paired into teams of two and teams into matches, so each person partners and
 * opposes as many different people as the round count allows. Greedy by round: byes go to whoever
 * has sat out least-recently-fewest, then a seeded random search with swap moves minimises repeat
 * partners (heavily), then repeat opponents. Deterministic for a given seed.
 * Returns { rounds: [{ matches: [{ court, a: [i, j], b: [k, l] }], byes: [i] }], partner, opponent }.
 */
export function americano(players, { courts = 1, rounds = null, seed = 1, whist = true } = {}) {
  const n = players.length;
  if (n < 4) throw new Error("Americano needs at least 4 players.");
  if (n > 64) throw new Error("Americano supports up to 64 players.");
  if (!(courts >= 1)) throw new Error("Americano needs at least 1 court.");
  let whistHint = null;
  if (whist) {
    // A whist design (whist.mjs): every pair partners exactly once and opposes exactly twice over
    // the full evening, where the greedy search below repeats partners from 20 players and never
    // evens out opponents (eval/whist-vs-greedy.txt).
    const r0 = mulberry32(seed);
    const order = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(r0() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    let w = whistRotation(n, { courts, rounds, order });
    // Fewer courts than tables ("packed"): the whole design runs 2-3x the usual evening, and a
    // prefix of it measured no better than the greedy search (eval/whist-vs-greedy.txt, 3 courts),
    // so it is used only when the round count asked for is the whole design; otherwise the plan
    // says how many rounds the whole design takes (whistHint) and the greedy search runs.
    if (w && w.design.packed && rounds !== w.design.fullRounds) {
      const whole = whistRotation(n, { courts, rounds: w.design.fullRounds, order });
      if (whole && whistWorthIt(n, courts, whole)) whistHint = { rounds: w.design.fullRounds };
      w = null;
    }
    if (w && whistWorthIt(n, courts, w)) {
      const partner = Array.from({ length: n }, () => new Array(n).fill(0));
      const opponent = Array.from({ length: n }, () => new Array(n).fill(0));
      for (const round of w.rounds) for (const m of round.matches) {
        const [a, b] = m.a, [x, y] = m.b;
        partner[a][b]++; partner[b][a]++; partner[x][y]++; partner[y][x]++;
        for (const [p, q] of [[a, x], [a, y], [b, x], [b, y]]) { opponent[p][q]++; opponent[q][p]++; }
      }
      const plan = { rounds: w.rounds, partner, opponent, design: w.design };
      // A short night (a prefix of the design) measured no better than the greedy search, and at
      // 28 players over 6 rounds slightly worse (eval/whist-vs-greedy.txt, "short nights"), so
      // below the whole design both are built and the better one kept.
      if (w.rounds.length < w.design.fullRounds) {
        const g = americano(players, { courts, rounds: w.rounds.length, seed, whist: false });
        if (americanoScore(g) < americanoScore(plan)) return g;
      }
      return plan;
    }
  }
  const roundCount = rounds ?? Math.max(1, n % 4 === 0 && n / 4 <= courts ? n - 1 : n);
  const rng = mulberry32(seed);
  const partner = Array.from({ length: n }, () => new Array(n).fill(0));
  const opponent = Array.from({ length: n }, () => new Array(n).fill(0));
  const played = new Array(n).fill(0);
  const sat = new Array(n).fill(0);
  const lastSat = new Array(n).fill(-1);
  const out = [];
  const seats = Math.min(Math.floor(n / 4), courts) * 4;
  for (let r = 0; r < roundCount; r++) {
    // byes: most games played first, then sat out longest ago; random tie-break
    const order = [...Array(n).keys()].sort((x, y) => played[y] - played[x] || lastSat[x] - lastSat[y] || rng() - 0.5);
    const byes = order.slice(0, n - seats).sort((x, y) => x - y);
    const byeSet = new Set(byes);
    const active = [...Array(n).keys()].filter((i) => !byeSet.has(i));
    const cost = (arr) => {
      let c = 0;
      for (let m = 0; m < arr.length; m += 4) {
        const [a, b, x, y] = arr.slice(m, m + 4);
        c += 100 * partner[a][b] * partner[a][b] + 100 * partner[x][y] * partner[x][y];
        for (const [p, q] of [[a, x], [a, y], [b, x], [b, y]]) c += 10 * opponent[p][q];
      }
      return c;
    };
    let best = null;
    let bestCost = Infinity;
    for (let t = 0; t < 40 && bestCost > 0; t++) {
      const arr = active.slice();
      for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
      let c = cost(arr);
      for (let it = 0; it < 150 && c > 0; it++) {
        const i = Math.floor(rng() * arr.length);
        const j = Math.floor(rng() * arr.length);
        if (Math.floor(i / 4) === Math.floor(j / 4) && ((i % 4 < 2) === (j % 4 < 2))) continue;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        const c2 = cost(arr);
        if (c2 < c) c = c2; else [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      if (c < bestCost) { bestCost = c; best = arr.slice(); }
    }
    const matches = [];
    for (let m = 0; m < best.length; m += 4) {
      const [a, b, x, y] = best.slice(m, m + 4);
      matches.push({ court: m / 4 + 1, a: [a, b].sort((p, q) => p - q), b: [x, y].sort((p, q) => p - q) });
      partner[a][b]++; partner[b][a]++; partner[x][y]++; partner[y][x]++;
      for (const [p, q] of [[a, x], [a, y], [b, x], [b, y]]) { opponent[p][q]++; opponent[q][p]++; }
      for (const i of [a, b, x, y]) played[i]++;
    }
    for (const i of byes) { sat[i]++; lastSat[i] = r; }
    out.push({ matches, byes });
  }
  return whistHint ? { rounds: out, partner, opponent, whistHint } : { rounds: out, partner, opponent };
}

/** Check an Americano plan: nobody twice in a round, byes and games within one of even. Returns problems. */
export function validateAmericano(players, plan) {
  const n = players.length;
  const problems = [];
  const played = new Array(n).fill(0);
  for (const [r, round] of plan.rounds.entries()) {
    const seen = new Set();
    const mark = (i) => { if (seen.has(i)) problems.push(`${players[i]} appears twice in round ${r + 1}.`); seen.add(i); };
    for (const m of round.matches) for (const i of [...m.a, ...m.b]) { mark(i); played[i]++; }
    for (const i of round.byes) mark(i);
    if (seen.size !== n) problems.push(`Round ${r + 1} does not place every player.`);
  }
  if (Math.max(...played) - Math.min(...played) > 1) problems.push("Games played differ by more than one.");
  return problems;
}

/** Summary: repeat partners/opponents, games and byes per person. */
export function americanoStats(players, plan) {
  const n = players.length;
  let repeatPartners = 0;
  let maxPartner = 0;
  let unmetPartners = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const c = plan.partner[i][j];
    maxPartner = Math.max(maxPartner, c);
    if (c > 1) repeatPartners += c - 1;
    if (c === 0) unmetPartners++;
  }
  const games = players.map(() => 0);
  const byes = players.map(() => 0);
  for (const round of plan.rounds) {
    for (const m of round.matches) for (const i of [...m.a, ...m.b]) games[i]++;
    for (const i of round.byes) byes[i]++;
  }
  return { repeatPartners, maxPartner, unmetPartners, games, byes };
}

/** Plain-text rotation sheet for a group chat. */
export function americanoText(players, plan) {
  const lines = [];
  plan.rounds.forEach((round, r) => {
    lines.push(`Round ${r + 1}`);
    for (const m of round.matches) lines.push(`  Court ${m.court}: ${players[m.a[0]]} & ${players[m.a[1]]} vs ${players[m.b[0]]} & ${players[m.b[1]]}`);
    if (round.byes.length) lines.push(`  Sitting out: ${round.byes.map((i) => players[i]).join(", ")}`);
  });
  return lines.join("\n");
}

/**
 * Mexicano scores: one finished doubles game per line, `Ana & Ben 21-17 Cy & Dee`. Players are matched
 * to the list case-insensitively. Returns { games: [{ a: [i, j], b: [k, l], sa, sb }], errors }.
 */
export function parseMexicanoScores(text, players) {
  const index = new Map(players.map((p, i) => [p.trim().toLowerCase(), i]));
  const games = [];
  const errors = [];
  const re = /^(.+?)\s*&\s*(.+?)\s+(\d+)\s*[-\u2013:]\s*(\d+)\s+(.+?)\s*&\s*(.+)$/;
  String(text || "").split(/\r?\n/).forEach((raw, ln) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const m = re.exec(line);
    if (!m) { errors.push(`Line ${ln + 1}: write it as "Ana & Ben 21-17 Cy & Dee".`); return; }
    const ids = [m[1], m[2], m[5], m[6]].map((nm) => index.get(nm.trim().toLowerCase()));
    const bad = [m[1], m[2], m[5], m[6]].filter((_, k) => ids[k] === undefined);
    if (bad.length) { errors.push(`Line ${ln + 1}: ${bad.map((b) => `"${b.trim()}"`).join(", ")} not in the player list.`); return; }
    if (new Set(ids).size !== 4) { errors.push(`Line ${ln + 1}: a player appears twice in one game.`); return; }
    games.push({ a: [ids[0], ids[1]], b: [ids[2], ids[3]], sa: Number(m[3]), sb: Number(m[4]) });
  });
  return { games, errors };
}

/**
 * Mexicano table: each player is credited with their side's points, so a good partner never costs you.
 * Ranked by points for, then points difference, then wins. Returns rows with rank, name, played, wins,
 * draws, losses, pf, pa, diff.
 */
export function mexicanoStandings(players, games) {
  const rows = players.map((name, i) => ({ i, name, played: 0, wins: 0, draws: 0, losses: 0, pf: 0, pa: 0, diff: 0 }));
  for (const g of games) {
    for (const [side, mine, theirs] of [[g.a, g.sa, g.sb], [g.b, g.sb, g.sa]]) {
      for (const i of side) {
        const r = rows[i];
        r.played++; r.pf += mine; r.pa += theirs; r.diff += mine - theirs;
        if (mine > theirs) r.wins++; else if (mine === theirs) r.draws++; else r.losses++;
      }
    }
  }
  rows.sort((x, y) => y.pf - x.pf || y.diff - x.diff || y.wins - x.wins || x.i - y.i);
  rows.forEach((r, k) => { r.rank = k + 1; });
  return rows;
}

/**
 * Next Mexicano round: players are ranked on points so far, sitting out goes to whoever has played the
 * most (random tie-break), the rest are cut into fours in rank order, and each four plays 1&4 against 2&3,
 * or a split that repeats fewer partnerships when it would otherwise repeat one. Round one, with no
 * scores yet, is a seeded random draw. Returns { matches: [{ court, a, b }], byes, repeatPartners }.
 */
export function mexicanoNextRound(players, games, { courts = 1, seed = 1 } = {}) {
  const n = players.length;
  if (n < 4) throw new Error("Mexicano needs at least 4 players.");
  if (!(courts >= 1)) throw new Error("Mexicano needs at least 1 court.");
  const rng = mulberry32(seed + games.length * 7919);
  const table = mexicanoStandings(players, games);
  const partner = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const g of games) { partner[g.a[0]][g.a[1]]++; partner[g.a[1]][g.a[0]]++; partner[g.b[0]][g.b[1]]++; partner[g.b[1]][g.b[0]]++; }
  const seats = Math.min(Math.floor(n / 4), courts) * 4;
  const played = new Array(n).fill(0);
  for (const r of table) played[r.i] = r.played;
  const jitter = players.map(() => rng());
  const byeOrder = [...Array(n).keys()].sort((x, y) => played[y] - played[x] || jitter[x] - jitter[y]);
  const byes = byeOrder.slice(0, n - seats).sort((x, y) => x - y);
  const byeSet = new Set(byes);
  let active;
  if (games.length === 0) {
    active = [...Array(n).keys()].filter((i) => !byeSet.has(i)).sort((x, y) => jitter[x] - jitter[y]);
  } else {
    active = table.map((r) => r.i).filter((i) => !byeSet.has(i));
  }
  const matches = [];
  let repeatPartners = 0;
  for (let m = 0; m < active.length; m += 4) {
    const [p1, p2, p3, p4] = active.slice(m, m + 4);
    const options = [[[p1, p4], [p2, p3]], [[p1, p3], [p2, p4]], [[p1, p2], [p3, p4]]];
    let best = options[0];
    let bestRep = Infinity;
    for (const o of options) {
      const rep = partner[o[0][0]][o[0][1]] + partner[o[1][0]][o[1][1]];
      if (rep < bestRep) { bestRep = rep; best = o; }
    }
    repeatPartners += bestRep;
    matches.push({ court: m / 4 + 1, a: best[0].slice().sort((x, y) => x - y), b: best[1].slice().sort((x, y) => x - y) });
  }
  return { matches, byes, repeatPartners };
}

/** Plain-text next-round sheet plus the table, for a group chat. */
export function mexicanoText(players, round, table, roundNumber) {
  const lines = [`Round ${roundNumber}`];
  for (const m of round.matches) lines.push(`  Court ${m.court}: ${players[m.a[0]]} & ${players[m.a[1]]} vs ${players[m.b[0]]} & ${players[m.b[1]]}`);
  if (round.byes.length) lines.push(`  Sitting out: ${round.byes.map((i) => players[i]).join(", ")}`);
  if (table.some((r) => r.played)) {
    lines.push("", "Standings");
    for (const r of table) lines.push(`  ${r.rank}. ${r.name}  ${r.pf} pts  (${r.diff >= 0 ? "+" : ""}${r.diff})  ${r.played} played`);
  }
  return lines.join("\n");
}
