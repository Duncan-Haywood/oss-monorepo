// Random practice leagues for eval/practice-exact.py: each case carries the windows, the teams, the
// options practiceOptions builds (so both sides see the same rules) and the search's own score.
// node eval/practice-exact.mjs <cases> <seed> [tight|loose] > cases.json
import { practiceOptions, buildPractices, soloBest } from "../practice.mjs";

const n = Number(process.argv[2] || 40), seed0 = Number(process.argv[3] || 1), mode = process.argv[4] || "tight";
let s = seed0 >>> 0;
const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const cases = [];
for (let c = 0; c < n; c++) {
  const nf = 2 + Math.floor(rnd() * 3);
  const windows = [];
  for (let f = 0; f < nf; f++) {
    const units = pick([1, 2, 4]);
    const days = [1, 2, 3, 4].filter(() => rnd() < 0.8);
    if (rnd() < 0.3) days.push(5);
    if (rnd() < 0.3) days.push(6);
    const start = pick([16 * 60, 17 * 60, 17 * 60 + 30]), end = pick([19 * 60, 20 * 60, 21 * 60]);
    for (const d of days.length ? days : [2]) windows.push({ field: `F${f + 1}`, day: d, start: d === 6 ? 9 * 60 : start, end: d === 6 ? 12 * 60 : end, units });
  }
  const capUnits = windows.reduce((a, w) => a + w.units * Math.floor((w.end - w.start) / 60), 0);
  const want = capUnits * (mode === "tight" ? 0.75 + rnd() * 0.3 : 0.4 + rnd() * 0.3);
  const teams = [];
  let demand = 0, coachN = 0;
  while (demand < want && teams.length < 40) {
    const maxU = Math.max(...windows.map((w) => w.units));
    const units = pick([1, 1, 2, 2, 4].filter((u) => u <= maxU)), times = pick([1, 2, 2]);
    const t = { name: `T${teams.length + 1}`, coach: "", units, times, not: [], games: [], preferDays: [], preferTime: null, earliest: 0, latest: 1440 };
    if (rnd() < 0.5) t.preferDays = [1, 2, 3, 4, 5].filter(() => rnd() < 0.45);
    if (rnd() < 0.4) t.preferTime = pick([{ start: 1020, end: 1140 }, { start: 1080, end: 1260 }, { start: 960, end: 1080 }]);
    if (rnd() < 0.3) t.not = [pick([1, 2, 3, 4, 5])];
    if (rnd() < 0.3) t.games = [6];
    if (units === 1 && rnd() < 0.5) t.latest = 19 * 60;
    if (rnd() < 0.25 && teams.length && !teams[teams.length - 1].coach) { const prev = teams[teams.length - 1]; prev.coach = t.coach = `C${++coachN}`; }
    teams.push(t);
    demand += units * times;
  }
  const t0 = Date.now();
  const r = buildPractices(windows, teams, { minutes: 60, seed: 1 });
  const ms = Date.now() - t0;
  const { blocks, options } = practiceOptions(windows, teams, 60);
  cases.push({ id: c, windows, teams, blocks, options, search: r.score, bound: r.bound, ms, unplaced: r.unplaced.reduce((a, u) => a + u.missing, 0) });
}
console.log(JSON.stringify(cases));
