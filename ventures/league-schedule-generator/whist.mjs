// Whist designs for rotating-partner doubles (Americano nights).
//
// A whist tournament on m players (m = 4k or 4k+1) is a set of rounds of k tables, each table
// a&b vs x&y, in which every pair of players partners exactly once and plays against each other
// exactly twice. These are built cyclically from one stored base round (eval/whist-search.mjs
// found them; eval/whist-search.txt has the run): for m = 4k+1 the players are the elements of an
// abelian group G of order m and round g is the base round with g added to every entry (the
// player 0 + g sits out); for m = 4k the players are G (order m-1) plus a fixed player "infinity",
// stored as -1, who never moves.
//
// For 4k+2 players no whist design exists ((4k+2)(4k+1)/2 pairs is odd, and a game uses two), so
// they play a "near-whist" design on Z_{4k+2} (NEAR_WHIST_BASES, eval/near-whist-search.mjs): every
// pair partners exactly once except a perfect matching of 2k+1 pairs {x, x+2k+1}, who never partner
// but face each other twice; every other pair faces each other once or twice; 2 sit out each round.
// For 4k+3 players the next design up is played with one "ghost" seat: the table holding it sits out
// that round. Every real pair still partners at most once and games stay within one of each other.
import { WHIST_BASES } from "./whist-bases.mjs";
import { NEAR_WHIST_BASES } from "./near-whist-bases.mjs";
import { orbitDesign, orbitSizes } from "./whist-orbits.mjs";

function groupOps(mods) {
  const co = (x) => mods.map((m) => { const c = x % m; x = Math.floor(x / m); return c; });
  const enc = (c) => c.reduceRight((acc, ci, i) => acc * mods[i] + ci, 0);
  return { add: (a, b) => { const ca = co(a), cb = co(b); return enc(ca.map((x, i) => (x + cb[i]) % mods[i])); } };
}

/** The sizes with a stored design. */
export function whistSizes() {
  return [...new Set([...Object.keys(WHIST_BASES).map(Number), ...orbitSizes()])].sort((a, b) => a - b);
}

/** The 4k+2 sizes with a stored near-whist design. */
export function nearWhistSizes() {
  return Object.keys(NEAR_WHIST_BASES).map(Number).sort((a, b) => a - b);
}

/**
 * Develop the stored base round for m players into its full set of rounds.
 * Returns an array of rounds; a round is { tables: [[a, b, x, y], ...], out: [i...] } with players
 * numbered 0..m-1 (infinity is m-1). Null when no design for m is stored.
 */
export function whistDesign(m) {
  const base = m % 4 === 2 ? NEAR_WHIST_BASES[m] : WHIST_BASES[m];
  if (!base) return m % 4 === 2 ? null : orbitDesign(m); // several base rounds (whist-orbits.mjs)
  const v = base.mods.reduce((a, b) => a * b, 1);
  const { add } = groupOps(base.mods);
  const inf = m % 4 === 0 ? m - 1 : null;
  const rounds = [];
  for (let g = 0; g < v; g++) {
    const map = (p) => (p === -1 ? inf : add(p, g));
    const tables = base.tables.map((t) => t.map(map));
    const seated = new Set(tables.flat());
    const out = [...Array(m).keys()].filter((i) => !seated.has(i));
    rounds.push({ tables, out });
  }
  return rounds;
}

/** Check a developed design: each pair partners exactly once and opposes exactly twice. */
export function checkWhist(m, rounds) {
  const P = Array.from({ length: m }, () => new Array(m).fill(0));
  const O = Array.from({ length: m }, () => new Array(m).fill(0));
  for (const r of rounds) {
    const seen = new Set();
    for (const [a, b, x, y] of r.tables) {
      for (const i of [a, b, x, y]) { if (seen.has(i) || i < 0 || i >= m) return false; seen.add(i); }
      P[a][b]++; P[b][a]++; P[x][y]++; P[y][x]++;
      for (const [p, q] of [[a, x], [a, y], [b, x], [b, y]]) { O[p][q]++; O[q][p]++; }
    }
  }
  for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) if (P[i][j] !== 1 || O[i][j] !== 2) return false;
  return true;
}

/**
 * Check a developed near-whist design on m = 4k+2 players: 4k+2 rounds of k tables; everyone sits
 * out exactly twice; no pair partners twice; the pairs who never partner form a perfect matching
 * (each player misses exactly one partner) and face each other exactly twice; every other pair
 * faces each other once or twice.
 */
export function checkNearWhist(m, rounds) {
  if (m % 4 !== 2 || rounds.length !== m) return false;
  const P = Array.from({ length: m }, () => new Array(m).fill(0));
  const O = Array.from({ length: m }, () => new Array(m).fill(0));
  const games = new Array(m).fill(0);
  for (const r of rounds) {
    if (r.tables.length !== (m - 2) / 4) return false;
    const seen = new Set();
    for (const [a, b, x, y] of r.tables) {
      for (const i of [a, b, x, y]) { if (seen.has(i) || i < 0 || i >= m) return false; seen.add(i); games[i]++; }
      P[a][b]++; P[b][a]++; P[x][y]++; P[y][x]++;
      for (const [p, q] of [[a, x], [a, y], [b, x], [b, y]]) { O[p][q]++; O[q][p]++; }
    }
  }
  if (games.some((g) => g !== m - 2)) return false;
  for (let i = 0; i < m; i++) {
    let missed = 0;
    for (let j = 0; j < m; j++) {
      if (i === j) continue;
      if (P[i][j] > 1) return false;
      if (P[i][j] === 0) { missed++; if (O[i][j] !== 2) return false; } else if (O[i][j] < 1 || O[i][j] > 2) return false;
    }
    if (missed !== 1) return false;
  }
  return true;
}

/**
 * A rotation for n real players from a whist design, or null when none fits.
 * Picks n itself when a design for n is stored (4k, 4k+1, or a near-whist design for 4k+2), else
 * the smallest stored size m in n+1..n+3; seats n..m-1 are ghosts and any table holding one
 * sits out. `order` maps seat -> player (a seeded shuffle, so different seeds give different
 * sheets with the same guarantees).
 * When every design round fits the courts, each design round is one round on the sheet. When it
 * does not (more tables than courts), the design's games are dealt into rounds of at most `courts`
 * games, each round taking the queued games whose players have played least so far; every pair
 * still partners once and opposes twice over the full evening, it just takes more rounds.
 * With `rounds` set, the first `rounds` rounds are used if games stay within one of each other.
 * Returns { rounds: [{ matches, byes }], design: { size, ghosts, packed, fullRounds } }.
 */
export function whistRotation(n, { courts, rounds = null, order = null } = {}) {
  for (let m = n; m <= n + 3; m++) {
    if (m % 4 !== 0 && m % 4 !== 1 && !(m === n && m % 4 === 2)) continue;
    const design = whistDesign(m);
    if (!design) continue;
    const seatToPlayer = (s) => (s >= n ? -1 : order ? order[s] : s);
    const playingRounds = design.map((r) => r.tables.filter((t) => t.every((s) => s < n)).map((t) => t.map(seatToPlayer)));
    const packed = playingRounds.some((r) => r.length > courts);
    let slots;
    if (!packed) slots = playingRounds;
    else {
      const queue = playingRounds.flat();
      const games = new Array(n).fill(0);
      slots = [];
      while (queue.length) {
        const idx = queue.map((_, i) => i)
          .sort((i, j) => queue[i].reduce((s, p) => s + games[p], 0) - queue[j].reduce((s, p) => s + games[p], 0) || i - j);
        const used = new Set();
        const pick = [];
        for (const i of idx) {
          if (pick.length === courts) break;
          if (queue[i].some((p) => used.has(p))) continue;
          pick.push(i);
          for (const p of queue[i]) used.add(p);
        }
        slots.push(pick.map((i) => queue[i]));
        for (const t of slots[slots.length - 1]) for (const p of t) games[p]++;
        for (const i of pick.sort((a, b) => b - a)) queue.splice(i, 1);
      }
    }
    const take = rounds ?? slots.length;
    if (take > slots.length) return null;
    const games = new Array(n).fill(0);
    const out = slots.slice(0, take).map((tables) => {
      const matches = tables.map(([a, b, x, y], i) => ({ court: i + 1, a: [a, b].sort((p, q) => p - q), b: [x, y].sort((p, q) => p - q) }));
      const busy = new Set(matches.flatMap((mm) => [...mm.a, ...mm.b]));
      for (const i of busy) games[i]++;
      return { matches, byes: [...Array(n).keys()].filter((i) => !busy.has(i)) };
    });
    if (Math.max(...games) - Math.min(...games) > 1) continue;
    return { rounds: out, design: { size: m, ghosts: m - n, near: m % 4 === 2, packed, fullRounds: slots.length } };
  }
  return null;
}
