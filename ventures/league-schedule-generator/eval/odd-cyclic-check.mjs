// Waits before and after the cyclic odd designs (eval/odd-cyclic.py), seeds 1 to 3, through the
// tool's own buildSchedule: `waitFree: false` is the plain layout the page used before.
//   node eval/odd-cyclic-check.mjs 21:4:9 [n:courts:times ...]
import { buildSchedule, validateSchedule, nightWaits, parseDate } from "../calc.mjs";

const names = (n) => Array.from({ length: n }, (_, i) => `T${i + 1}`);
const times = (k) => Array.from({ length: k }, (_, i) => `${String(9 + i).padStart(2, "0")}:00`);
const courts = (k) => Array.from({ length: k }, (_, i) => `C${i + 1}`);
for (const arg of process.argv.slice(2)) {
  const [n, c, t] = arg.split(":").map(Number);
  let before = 0, after = 0, ms = 0;
  for (const seed of [1, 2, 3]) {
    const spec = { teams: names(n), start: parseDate("2026-01-06"), weekdays: [2], courts: courts(c), times: times(t), gamesPerNight: 3, seed };
    before += nightWaits(buildSchedule({ ...spec, waitFree: false })).idle;
    const t0 = Date.now();
    const s = buildSchedule(spec);
    ms += Date.now() - t0;
    if (!validateSchedule(s).ok) throw new Error(`${arg} seed ${seed}: ${validateSchedule(s).errors.join("; ")}`);
    after += nightWaits(s).idle;
  }
  console.log(`${n} teams on ${c} x ${t}: waits ${before} -> ${after} (seeds 1-3), ${Math.round(ms / 3)} ms a build`);
}
