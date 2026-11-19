// How often seeding pool advancers by record alone (poolAdvancers) lets poolmates meet early, against
// poolPlayoffSeeds' crossover order. Random pool tables (points drawn per team, places kept in order),
// 500 draws per shape, seeded. Run: node eval/crossover-seeds.mjs > eval/crossover-seeds.txt
import { poolPlayoffSeeds, mulberry32 } from "../calc.mjs";
const rnd = mulberry32(2026);
const shapes = [[2, 2], [2, 3], [2, 4], [3, 2], [3, 4], [4, 1], [4, 2], [4, 3], [4, 4], [6, 2], [8, 1], [8, 2], [8, 4]];
const DRAWS = 500;
console.log("pools x advance | field | draws with poolmates in round 1: record order / crossover | in rounds 1-2 | mean ms");
for (const [k, adv] of shapes) {
  let r1p = 0, r1c = 0, r2p = 0, r2c = 0, ms = 0;
  for (let d = 0; d < DRAWS; d++) {
    const tables = Array.from({ length: k }, (_, p) => Array.from({ length: adv }, (_, i) => ({ name: `P${p}-${i + 1}`, points: 3 * (adv - i) * 3 + Math.floor(rnd() * 9), gd: Math.floor(rnd() * 11) - 5, gf: Math.floor(rnd() * 10) })).sort((x, y) => y.points - x.points));
    const t = performance.now();
    const r = poolPlayoffSeeds(tables, adv);
    ms += performance.now() - t;
    if (r.plain[0]) r1p++;
    if (r.meetings[0]) r1c++;
    if (r.plain[0] + (r.plain[1] || 0)) r2p++;
    if (r.meetings[0] + (r.meetings[1] || 0)) r2c++;
  }
  console.log(`${k} x ${adv} | ${k * adv} | ${r1p} / ${r1c} | ${r2p} / ${r2c} | ${(ms / DRAWS).toFixed(1)}`);
}
