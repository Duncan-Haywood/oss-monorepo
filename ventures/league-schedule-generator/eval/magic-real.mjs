// Magic numbers on real seasons: replay 18 top-flight seasons (openfootball, CC0) date by date and, for
// every team still alive in three races (title, top four, safety = top n - 3), compare the old magic
// number (every rival wins out at once, rounded up to a total the team can score) with the exact one from
// race-exact.mjs. Checks:
//   - never wrong: whenever a team went on to take at least its magic number of points from its remaining
//     games, it finished inside the places on the final points table (ties counted against it)
//   - never above the old number, and set wherever the old one was
// Measures how much smaller the exact number is, how often a team that had no number gets one, and time.
//
//   node eval/magic-real.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { playoffRace } from "../standings.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, "data", "openfootball-results.json"), "utf8"));

const per = {};
let wrong = 0, above = 0, lost = 0, ms = 0, tables = 0, slowest = 0, unproved = 0;
for (const [key, L] of Object.entries(data.leagues)) {
  const n = L.teams.length;
  const matches = L.matches.slice().sort((x, y) => (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0));
  const dates = [...new Set(matches.map((m) => m[1]))];
  const fin = Array(n).fill(0);
  for (const m of matches) {
    if (m[4] > m[5]) fin[m[2]] += 3; else if (m[4] < m[5]) fin[m[3]] += 3; else { fin[m[2]]++; fin[m[3]]++; }
  }
  const rankLost = (i) => 1 + fin.filter((p, j) => j !== i && p >= fin[i]).length;
  for (const [race, spots] of [["title", 1], ["top four", 4], ["safety", n - 3]]) {
    const s = (per[race] ??= { rows: 0, both: 0, smaller: 0, saved: 0, most: 0, newNumber: 0, oldOnly: 0, reached: 0 });
    for (const d of dates) {
      const played = matches.filter((m) => m[1] <= d);
      const rest = matches.filter((m) => m[1] > d);
      if (!rest.length) continue;
      const results = played.map((m) => ({ a: m[2], b: m[3], ga: m[4], gb: m[5] }));
      const t0 = performance.now();
      const rows = playoffRace(L.teams, results, rest.map((m) => [m[2], m[3]]), spots);
      const dt = performance.now() - t0;
      ms += dt; tables++; slowest = Math.max(slowest, dt);
      const now = Array(n).fill(0);
      for (const m of played) { if (m[4] > m[5]) now[m[2]] += 3; else if (m[4] < m[5]) now[m[3]] += 3; else { now[m[2]]++; now[m[3]]++; } }
      for (const r of rows) {
        if (r.status !== "alive") continue;
        s.rows++;
        // the old number, rounded up to a total the team can score (3-1-0: any total but 3g-1)
        const g = r.left;
        const old = r.magicBound == null ? null : r.magicBound === 3 * g - 1 ? 3 * g : r.magicBound;
        if (old != null && r.magic == null) { s.oldOnly++; lost++; }
        if (old != null && r.magic != null && r.magic > old) above++;
        if (old != null && r.magic != null) { s.both++; if (r.magic < old) { s.smaller++; s.saved += old - r.magic; s.most = Math.max(s.most, old - r.magic); } }
        if (old == null && r.magic != null) s.newNumber++;
        // never wrong: took at least the magic number, so it must finish in the places
        if (r.magic != null && fin[r.index] - now[r.index] >= r.magic) { s.reached++; if (rankLost(r.index) > spots) wrong++; }
      }
    }
  }
}
console.log("Magic numbers on 18 real seasons (openfootball, CC0), every match date, alive teams in three races");
console.log("race       alive rows  both set  exact smaller  points saved (total, most)  new number where old had none  later took the number");
for (const [race, s] of Object.entries(per)) {
  console.log(`${race.padEnd(10)} ${String(s.rows).padStart(10)}  ${String(s.both).padStart(8)}  ${String(s.smaller).padStart(13)}  ${String(s.saved).padStart(18)}, ${String(s.most).padStart(3)}      ${String(s.newNumber).padStart(25)}  ${String(s.reached).padStart(20)}`);
}
console.log(`\nWrong (took its magic number of points, finished outside): ${wrong}`);
console.log(`Exact number above the old one: ${above}; old number set, exact missing: ${lost}`);
console.log(`Tables: ${tables}; ${(ms / tables).toFixed(1)} ms per table on average (race and magic together), slowest ${slowest.toFixed(0)} ms`);
process.exit(wrong || above || lost ? 1 : 0);
