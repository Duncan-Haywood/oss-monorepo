// Times orient.mjs minPlusStep on random rounds of 10 and 12 matches (20 and 24 teams), and checks
// that a second copy of the module (`--against <path to another orient.mjs>`) returns the same
// tables. README "A backward table".
//
//   node eval/minplus-bench.mjs [--against path] [--reps 400]
import { minPlusStep } from "../orient.mjs";
import { mulberry32 } from "../calc.mjs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const opt = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const reps = +opt("--reps", 400), against = opt("--against", null);
const other = against ? (await import(pathToFileURL(resolve(against)).href)).minPlusStep : null;
const rand = mulberry32(24);
const round = (N) => {
  const t = [...Array(N).keys()];
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; }
  const ms = [];
  for (let i = 0; i < N; i += 2) ms.push(t[i] < t[i + 1] ? [t[i], t[i + 1]] : [t[i + 1], t[i]]);
  return ms.sort((a, b) => a[0] - b[0]);
};
const time = (fn, cases) => { const t0 = process.hrtime.bigint(); for (const [fr, A, B] of cases) fn(fr, A, B); return Number(process.hrtime.bigint() - t0) / 1e6 / cases.length; };
const out = [];
for (const N of [20, 24]) {
  const cases = [];
  for (let i = 0; i < reps; i++) {
    const A = round(N), B = round(N), fr = new Int32Array(1 << A.length);
    for (let x = 0; x < fr.length; x++) fr[x] = Math.floor(rand() * 40);
    cases.push([fr, A, B]);
  }
  let same = null;
  if (other) same = cases.every(([fr, A, B]) => { const a = minPlusStep(fr, A, B), b = other(fr, A, B); return a.length === b.length && a.every((v, i) => v === b[i]); });
  // warm both, then time alternately, best of three
  time(minPlusStep, cases); if (other) time(other, cases);
  const ms = [], os = [];
  for (let k = 0; k < 3; k++) { ms.push(time(minPlusStep, cases)); if (other) os.push(time(other, cases)); }
  out.push({ teams: N, matches: N / 2, reps, msPerStep: +Math.min(...ms).toFixed(3), againstMsPerStep: other ? +Math.min(...os).toFixed(3) : null, same });
}
console.log(JSON.stringify(out));
