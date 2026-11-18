// Doubleheader nights: waits between a team's games with and without the wait-free search.
// node eval/doubleheader.mjs > eval/doubleheader.txt
import { buildSchedule, validateSchedule, nightWaits, parseDate } from "../calc.mjs";
import { waitFreePossible } from "../nights.mjs";

const cases = [];
for (const n of [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24]) for (const [g, T] of [[2, 3], [2, 4], [2, 5], [3, 4], [3, 5]]) cases.push([n, g, T]);
console.log("teams games times courts | possible | waits off (3 seeds) | waits on | time-row spread off / on | ms on (avg) | valid");
let offTot = 0, onTot = 0, zeroOff = 0, zeroOn = 0, rows = 0, invalid = 0;
for (const [n, g, T] of cases) {
  const C = Math.ceil((Math.floor(n / 2) * g) / T);
  const spec = (seed, waitFree) => ({ teams: Array.from({ length: n }, (_, i) => `T${i + 1}`), start: parseDate("2026-01-06"), weekdays: [2], courts: Array.from({ length: C }, (_, i) => `C${i + 1}`), times: Array.from({ length: T }, (_, i) => `${18 + i}:00`), gamesPerNight: g, seed, waitFree });
  let off = 0, on = 0, spOff = 0, spOn = 0, ms = 0, ok = true;
  for (const seed of [1, 2, 3]) {
    const a = buildSchedule(spec(seed, false));
    const t0 = performance.now();
    const b = buildSchedule(spec(seed, true));
    ms += performance.now() - t0;
    ok = ok && validateSchedule(a).ok && validateSchedule(b).ok;
    off += nightWaits(a).idle; on += nightWaits(b).idle;
    spOff += a.stats.timeSpread; spOn += b.stats.timeSpread;
  }
  const full = n % 2 ? n - g : n;
  rows++; offTot += off; onTot += on; if (off === 0) zeroOff++; if (on === 0) zeroOn++; if (!ok) invalid++;
  console.log(`${n} ${g} ${T} ${C} | ${waitFreePossible(full, g, C, T, n % 2 ? g : 0) ? "yes" : "no "} | ${off} | ${on} | ${spOff} / ${spOn} | ${Math.round(ms / 3)} | ${ok}`);
}
console.log(`\n${rows} settings x 3 seeds: total waits ${offTot} -> ${onTot}; settings with no waits ${zeroOff} -> ${zeroOn}; invalid ${invalid}`);
