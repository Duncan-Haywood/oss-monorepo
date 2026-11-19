// Which ghost seats let n players play a stored whist design of size m > n with every real player
// within one game of the rest, and how many courts it keeps busy. Every set of m - n seats is tried.
// Usage: node eval/ghost-seats.mjs 60 3   (57 players on design 60; ~1 min)
import { whistDesign } from "../whist.mjs";
const [m, g] = process.argv.slice(2).map(Number);
const d = whistDesign(m);
const tablesPerRound = d[0].tables.length;
const byRange = {};
let best = null, sets = 0;
const G = [];
const evaluate = () => {
  const gs = new Set(G), games = new Array(m).fill(0);
  let live = 0;
  for (const r of d) for (const t of r.tables) if (!t.some((p) => gs.has(p))) { live++; for (const p of t) games[p]++; }
  const real = games.filter((_, i) => !gs.has(i));
  const k = Math.max(...real) - Math.min(...real);
  byRange[k] = (byRange[k] || 0) + 1; sets++;
  if (!best || live > best.live || (live === best.live && k < best.k)) best = { live, k, ghosts: [...G] };
};
const rec = (s) => { if (G.length === g) return evaluate(); for (let i = s; i < m; i++) { G.push(i); rec(i + 1); G.pop(); } };
rec(0);
console.log(JSON.stringify({ design: m, players: m - g, sets, gamesRangeCounts: byRange, mostLiveTables: best.live, perRound: +(best.live / d.length).toFixed(2), of: tablesPerRound, rounds: d.length, gamesRangeThere: best.k, ghosts: best.ghosts }));
