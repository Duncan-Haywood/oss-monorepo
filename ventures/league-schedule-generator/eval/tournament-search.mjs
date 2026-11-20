// What the restarts buy: random weekend tournaments built with one greedy pass (tries=1) and with
// the page's default search (tries=120) and a long one (tries=600). Reports games left out, the
// finish (minutes after the first day opens, last game's end on the last day used) and the longest
// wait any team has between two games on one day. Every result is re-checked by validateTournament.
// node eval/tournament-search.mjs [count] [seed]
import { tournamentFromText, validateTournament } from "../tournament.mjs";
import { mulberry32 } from "../calc.mjs";

const count = Number(process.argv[2] || 200), seed0 = Number(process.argv[3] || 1);
const rand = mulberry32(seed0);
const pick = (a) => a[Math.floor(rand() * a.length)];
const specs = [];
while (specs.length < count) {
  const nDays = pick([1, 2, 2]);
  const days = ["Sat 2027-05-15", "Sun 2027-05-16"].slice(0, nDays).map((d) => `${d} 08:00-${pick(["17:00", "19:00"])}`).join("\n");
  const nd = 2 + Math.floor(rand() * 3);
  const tags = ["7v7", "9v9", "11v11"];
  const nf = 4 + Math.floor(rand() * 5);
  const fields = Array.from({ length: nf }, (_, k) => `F${k + 1}: ${tags.filter(() => rand() < 0.55).join(", ") || tags[k % 3]}`).join("\n");
  const divs = [];
  for (let d = 0; d < nd; d++) {
    const n = 4 + Math.floor(rand() * 9);
    const top = pick([2, 4, Math.min(8, n - 1)]);
    divs.push([`D${d}: ${pick([50, 60, 70])} min, ${tags[d % 3]}, pools of ${pick([3, 4])}, top ${top}, rest ${pick([30, 60])}, max 3 a day`, ...Array.from({ length: n }, (_, k) => `T${k}`)].join("\n"));
  }
  const coaches = nd >= 3 ? "D0/T0, D1/T0\nD1/T1, D2/T1" : "D0/T0, D1/T0";
  specs.push({ days, fields, divisions: divs.join("\n\n"), coaches });
}
const rows = { 1: [], 120: [], 600: [] };
let skipped = 0, invalid = 0, warnedCount = 0, warnedPlaced = 0;
for (const s of specs) {
  const out = {};
  for (const tries of [1, 120, 600]) {
    const t = tournamentFromText({ ...s, tries, seed: 1 });
    if (t.errors) { out.err = true; break; }
    if (validateTournament(t).length) invalid++;
    const last = t.games.length ? t.games[t.games.length - 1] : null;
    const lastEnd = Math.max(...t.games.filter((g) => g.dayIndex === last.dayIndex).map((g) => g.endAbs));
    out.warned = t.warnings.length > 0;
    out[tries] = { unplaced: t.unplaced.length, finish: lastEnd - 480, maxWait: t.score.maxWait, totalWait: t.score.totalWait, games: t.games.length + t.unplaced.length };
  }
  if (out.err) { skipped++; continue; }
  if (out.warned) { warnedCount++; warnedPlaced += out[120].unplaced === 0 ? 1 : 0; continue; }
  for (const k of [1, 120, 600]) rows[k].push(out[k]);
}
const n = rows[1].length;
const mean = (a, f) => (a.reduce((s, x) => s + f(x), 0) / a.length);
console.log(`${n + warnedCount + skipped} weekends drawn, seed ${seed0}: ${skipped} rejected by the parser, ${warnedCount} warned up front (too little field time or too many games for the daily cap; ${warnedPlaced} of them still placed in full), ${n} with no warning (below); invalid results over all: ${invalid}`);
console.log(`games per weekend (no warning): ${mean(rows[1], (x) => x.games).toFixed(1)}`);
console.log("tries  all-placed  games-left-out  finish(min)  longest-wait(min)  total-wait(min)");
for (const k of [1, 120, 600]) {
  const r = rows[k];
  console.log(`${String(k).padStart(5)}  ${(100 * r.filter((x) => !x.unplaced).length / n).toFixed(1).padStart(9)}%  ${mean(r, (x) => x.unplaced).toFixed(2).padStart(14)}  ${mean(r, (x) => x.finish).toFixed(0).padStart(11)}  ${mean(r, (x) => x.maxWait).toFixed(0).padStart(17)}  ${mean(r, (x) => x.totalWait).toFixed(0).padStart(15)}`);
}
const better = (a, b) => a.unplaced < b.unplaced || (a.unplaced === b.unplaced && a.finish < b.finish);
console.log(`tries=120 strictly better than one pass (fewer left out, or same and earlier finish) on ${rows[1].filter((_, i) => better(rows[120][i], rows[1][i])).length} of ${n}; tries=600 better than 120 on ${rows[1].filter((_, i) => better(rows[600][i], rows[120][i])).length}`);
