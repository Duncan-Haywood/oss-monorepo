// Same answers, two builds of calc.mjs: the whole buildRoster result (minus timings) on the café samples and 80 seeded random
// weeks, old against new, with each side's solver time. Used by the 2026-11-12 perf pass (docs/history/ci-perf-2026-11-12-
// shift-roster-plateau-floor.md). Run: git show <base>:ventures/shift-roster-builder/calc.mjs > calc.old.tmp.mjs (next to calc.mjs,
// so its imports resolve), then node eval/same-answers.mjs calc.old.tmp.mjs [weeks], and delete the copy.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const here = new URL("../", import.meta.url);
const A = await import(pathToFileURL(resolve(process.argv[2] || "calc.old.tmp.mjs")).href), B = await import(new URL("calc.mjs", here).href);
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const D = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
function week(seed) {
  const r = rng(seed), P = 2 + Math.floor(r() * 9), S = 4 + Math.floor(r() * 30);
  const st = ["name, wage, max hours, min hours, availability"];
  for (let p = 0; p < P; p++) { const a = Math.floor(r() * 4), b = a + 2 + Math.floor(r() * 5); st.push(`P${p}, ${10 + Math.floor(r() * 12)}, ${8 + Math.floor(r() * 32)}, 0, ${r() < 0.3 ? "any" : `${D[a]}-${D[Math.min(6, b)]} ${6 + Math.floor(r() * 4)}-${16 + Math.floor(r() * 7)}`}`); }
  const sh = [];
  for (let s = 0; s < S; s++) { const a = 6 + Math.floor(r() * 10); sh.push(`${D[Math.floor(r() * 7)]},${a},${Math.min(23, a + 3 + Math.floor(r() * 6))},${1 + (r() < 0.25 ? 1 : 0)}`); }
  const opts = [{}, { balance: 60 }, { maxDailyHours: 8, minRestHours: 10 }, { exact: false, restarts: 2 }, { seed: 7, toughBalance: 30 }][seed % 5];
  return { st: st.join("\n"), sh: sh.join("\n"), opts };
}
const strip = (x) => JSON.stringify(x, (k, v) => (k === "timings" || /ms$/i.test(k) ? undefined : v));
let same = 0, diff = 0, ta = 0, tb = 0, open = 0;
const N = +process.argv[3] || 80;
const cases = [{ st: A.sampleStaff(), sh: A.sampleShifts(), opts: {} }, { st: A.sampleStaff(), sh: A.sampleShifts(), opts: { balance: 50 } }, { st: A.sampleStaff() + "\nHal, 15, 24, 0, any", sh: A.sampleShifts(), opts: {} }];
for (let s = 1; s <= N; s++) cases.push(week(s));
for (const c of cases) {
  const staff = A.parseStaff(c.st).staff, slots = A.parseShifts(c.sh).slots;
  if (!slots.length || !staff.length) continue;
  let t = performance.now(); const ra = A.buildRoster(staff, slots, c.opts); ta += performance.now() - t;
  t = performance.now(); const rb = B.buildRoster(staff, slots, c.opts); tb += performance.now() - t;
  if (ra.unfilledHours > 0) open++;
  if (strip(ra) === strip(rb)) same++; else { diff++; console.log("DIFF", c.opts, slots.length, ra.score, rb.score, ra.optimality?.status, rb.optimality?.status); }
}
console.log({ cases: cases.length, same, diff, withOpenHours: open, origMs: Math.round(ta), newMs: Math.round(tb) });
