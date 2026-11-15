// Three games a night: which settings can be wait-free at all, and how many waits the search leaves.
// node eval/three-game-nights.mjs > eval/three-game-nights.txt
//
// Part 1, settings: 6 to 24 teams, 3 games, 4 to 6 time slots, on the least courts the corrected
// bound (waitFreePossible with an odd league's g-1-game teams and even rows) allows, seeds 1 to 3.
// Part 2, proof by exhaustion: every night of 7 teams (three near-perfect matchings with three
// different byes) on 2 courts x 5 times, laid out by nightRowsExact with no node cap.
import { buildSchedule, validateSchedule, nightWaits, parseDate } from "../calc.mjs";
import { waitFreePossible, nightRowsExact, sessionBlocks } from "../nights.mjs";

const g = 3;
console.log("Part 1. teams times courts | least courts for a wait-free night: old bound / new bound | blocks | waits off (3 seeds) | waits on | ms on (avg) | valid");
let offTot = 0, onTot = 0, zeroOn = 0, zeroOff = 0, rows = 0, invalid = 0;
const oldNeed = (n, T) => { let c = 1; while (!waitFreePossible(n % 2 ? n - g : n, g, c, T)) c++; return c; };
const newNeed = (n, T) => { let c = 1; while (!waitFreePossible(n % 2 ? n - g : n, g, c, T, n % 2 ? g : 0)) c++; return c; };
for (const n of [6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24]) for (const T of [4, 5, 6]) {
  const C = Math.max(newNeed(n, T), Math.ceil((Math.floor(n / 2) * g) / T));
  const spec = (seed, waitFree) => ({ teams: Array.from({ length: n }, (_, i) => `T${i + 1}`), start: parseDate("2026-01-06"), weekdays: [6], courts: Array.from({ length: C }, (_, i) => `C${i + 1}`), times: Array.from({ length: T }, (_, i) => `${String(9 + i).padStart(2, "0")}:00`), gamesPerNight: g, seed, waitFree });
  let off = 0, on = 0, ms = 0, ok = true;
  for (const seed of [1, 2, 3]) {
    const a = buildSchedule(spec(seed, false));
    const t0 = performance.now();
    const b = buildSchedule(spec(seed, true));
    ms += performance.now() - t0;
    ok = ok && validateSchedule(a).ok && validateSchedule(b).ok;
    off += nightWaits(a).idle; on += nightWaits(b).idle;
  }
  rows++; offTot += off; onTot += on; if (on === 0) zeroOn++; if (off === 0) zeroOff++; if (!ok) invalid++;
  console.log(`${n} ${T} ${C} | ${oldNeed(n, T)} / ${newNeed(n, T)} | ${(sessionBlocks(n, g, C, T) || ["-"]).join("+")} | ${off} | ${on} | ${Math.round(ms / 3)} | ${ok}`);
}
console.log(`\n${rows} settings x 3 seeds: total waits ${offTot} -> ${onTot}; settings with no waits ${zeroOff} -> ${zeroOn}; invalid ${invalid}`);

// Part 2
const n = 7;
function pms(vs) { if (!vs.length) return [[]]; const [a, ...rest] = vs; const out = []; for (let i = 0; i < rest.length; i++) for (const m of pms(rest.filter((_, j) => j !== i))) out.push([[a, rest[i]], ...m]); return out; }
const all = [];
for (let b = 0; b < n; b++) for (const m of pms([...Array(n).keys()].filter((x) => x !== b))) all.push({ b, m, key: new Set(m.map(([x, y]) => x * 100 + y)) });
const disjoint = (p, q) => p.b !== q.b && p.m.every(([x, y]) => !q.key.has(x * 100 + y) && !q.key.has(y * 100 + x));
let nights = 0, packed = 0;
for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
  if (!disjoint(all[i], all[j])) continue;
  for (let k = j + 1; k < all.length; k++) {
    if (!disjoint(all[i], all[k]) || !disjoint(all[j], all[k])) continue;
    const edges = [...all[i].m.map((e) => [...e, 0]), ...all[j].m.map((e) => [...e, 1]), ...all[k].m.map((e) => [...e, 2])];
    nights++;
    if (nightRowsExact(edges, 2, 5, { nodes: 1e7 })) packed++;
  }
}
console.log(`\nPart 2. 7 teams, 3 games, 2 courts x 5 times: ${nights} distinct nights (unordered), ${packed} can be laid out with every team's games back to back. Old bound: ${waitFreePossible(4, 3, 2, 5) ? "possible" : "impossible"}; new bound: ${waitFreePossible(4, 3, 2, 5, 3) ? "possible" : "impossible"}.`);
