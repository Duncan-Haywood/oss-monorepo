// Three games a night: which settings can be wait-free at all, and how many waits the search leaves.
// node eval/three-game-nights.mjs > eval/three-game-nights.txt
//
// Part 1, settings: 6 to 24 teams, 3 games, 4 to 6 time slots, on the least courts the corrected
// bound (waitFreePossible with an odd league's g-1-game teams and even rows) allows, seeds 1 to 3.
// Part 2, proof by exhaustion: every night of 7 teams (three near-perfect matchings with three
// different byes) on 2 courts x 5 times, laid out by nightRowsExact with no node cap.
// Part 3 (2026-11-15, latest): 8 teams on 2 courts x 6 times. Every slot is booked, so row 1's four
// teams all start there and fill rows 1-3, and the other four fill rows 4-6: a wait-free night is
// two groups of four that each play all three of their group (two K4s). Checked: no two of the 35
// splits of 8 teams into two fours are edge-disjoint, so two such nights cannot both happen.
// Part 4: the designed round robin (designedRounds) at 22 to 48 teams, 3 games, 6 times; since
// 2026-11-15 (later) every even size has a design (the stored SAT ones, session-designs.mjs).
// Part 6 (2026-11-15, latest): odd leagues of 5 to 29 teams at 6 time slots on the least courts
// the bound and the proofs (PROVED_NO_WAIT_FREE: 5 teams on 1 court, 7 and 9 on 2) allow, against the
// stored odd designs (odd-designs.mjs, eval/odd-night-sat.py).
// Part 5 (2026-11-15, later): three sessions a night (9 time slots) on the least courts
// (ceil(n / 6)), every even size with session blocks, against the stored three-session designs.
import { buildSchedule, validateSchedule, nightWaits, parseDate } from "../calc.mjs";
import { waitFreePossible, nightRowsExact, sessionBlocks, designedRounds, designCandidates, waitFreeProvedImpossible, oddDesigns } from "../nights.mjs";
import { SESSION_DESIGNS } from "../session-designs.mjs";

const g = 3;
const only7 = process.argv.includes("--part") && process.argv[process.argv.indexOf("--part") + 1] === "7";
const oldNeed = (n, T) => { let c = 1; while (!waitFreePossible(n % 2 ? n - g : n, g, c, T)) c++; return c; };
const newNeed = (n, T) => { let c = 1; while (!waitFreePossible(n % 2 ? n - g : n, g, c, T, n % 2 ? g : 0)) c++; return c; };
if (!only7) {
console.log("Part 1. teams times courts | least courts for a wait-free night: old bound / new bound | blocks | waits off (3 seeds) | waits on | ms on (avg) | valid");
let offTot = 0, onTot = 0, zeroOn = 0, zeroOff = 0, rows = 0, invalid = 0;
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

// Part 3
{
  const splits = [];
  const rest = [1, 2, 3, 4, 5, 6, 7];
  for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) for (let c = b + 1; c < 7; c++) {
    const g1 = [0, rest[a], rest[b], rest[c]];
    const g2 = rest.filter((x) => !g1.includes(x));
    const pairs = new Set();
    for (const gr of [g1, g2]) for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) pairs.add(gr[i] * 10 + gr[j]);
    splits.push(pairs);
  }
  let disjoint = 0;
  for (let i = 0; i < splits.length; i++) for (let j = i + 1; j < splits.length; j++) if ([...splits[i]].every((p) => !splits[j].has(p))) disjoint++;
  console.log(`\nPart 3. 8 teams, 3 games, 2 courts x 6 times (every slot booked): ${splits.length} splits into two groups of four, ${disjoint} edge-disjoint pairs of splits, so at most one of the season's two three-game nights can be wait-free.`);
}

// Part 4
console.log("\nPart 4. teams times courts | blocks | designed | waits off (3 seeds) | waits on | ms on (avg) | valid");
for (const n of [22, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48]) {
  const T = 6, C = Math.ceil((n / 2) * g / T);
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
  console.log(`${n} ${T} ${C} | ${(sessionBlocks(n, g, C, T) || ["-"]).join("+")} | ${designedRounds(n, g) ? "yes" : "no"} | ${off} | ${on} | ${Math.round(ms / 3)} | ${ok}`);
}

// Part 5
console.log("\nPart 5. teams times courts | blocks | stored 3-session design | waits off (3 seeds) | waits on | ms on (avg) | valid");
for (let n = 12; n <= 48; n += 2) {
  const T = 9, C = Math.ceil(n / 6);
  if (!sessionBlocks(n, g, C, T)) continue;
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
  console.log(`${n} ${T} ${C} | ${sessionBlocks(n, g, C, T).join("+")} | ${SESSION_DESIGNS.some((d) => d.n === n && d.sessions === 3) ? "yes" : "no"} | ${off} | ${on} | ${Math.round(ms / 3)} | ${ok}`);
}

}
// Part 6, and Part 7 (2026-11-15, latest): the same at 9 time slots, where the 9-slot designs need
// fewer courts. `node eval/three-game-nights.mjs --part 7` prints Part 7 alone.
function oddPart(T, label) {
  console.log(`\n${label}. odd leagues at ${T} times: teams courts | least courts by the count bound | stored odd design (its courts x times) | waits off (3 seeds) | waits on | ms on (avg) | valid`);
  for (let n = 5; n <= 29; n += 2) {
    let C = Math.max(newNeed(n, T), Math.ceil((Math.floor(n / 2) * g) / T));
    const bound = C;
    while (waitFreeProvedImpossible(n, g, C, T)) C++;
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
    const d = oddDesigns(n, g);
    console.log(`${n} ${C} | ${bound} | ${d.length ? `yes (${d.map((x) => `${x.courts}x${x.times}`).join(", ")})` : "no"} | ${off} | ${on} | ${Math.round(ms / 3)} | ${ok}`);
  }
}
if (!only7) oddPart(6, "Part 6");
oddPart(9, "Part 7");
