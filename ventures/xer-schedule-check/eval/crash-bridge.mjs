// Bridge networks (A -> C, A -> E -> D, B -> D: paths A-C, A-E-D, B-D), the shape
// where buying time on one activity can later become wasted, so the
// cheapest schedule gives it back (Phillips and Dessouky's un-crashing).
// Random durations, rooms and costs; the greedy cut with and without giving
// back time, against brute force over every whole-day combination.
//   node eval/crash-bridge.mjs [cases]
import { oracleCase } from "./crash-oracle.mjs";

export function bridgeRun(cases = 2000) {
  const out = { cases, withGiveBack: { optimalPoints: 0, points: 0, worst: 0, reachOk: 0, stepsGivingBack: 0 }, without: { optimalPoints: 0, points: 0, worst: 0, reachOk: 0 }, example: null };
  let s = 12345;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let k = 0; k < cases; k++) {
    const d = [0, 0, 0, 0, 0].map(() => 2 + Math.floor(rand() * 8));
    const room = d.map((x) => Math.min(x, Math.floor(rand() * 5)));
    const cost = d.map(() => 1 + Math.floor(rand() * 9));
    const preds = [[], [], [0], [0], [1, 2]]; // T0=A, T1=B, T2=E (the bridge), T3=C, T4=D
    for (const [key, gb] of [["withGiveBack", true], ["without", false]]) {
      const o = oracleCase({ d, room, cost, preds, giveBack: gb });
      const acc = out[key];
      acc.points += o.points; acc.optimalPoints += o.optimal; acc.worst = Math.max(acc.worst, o.worst); if (o.reachOk) acc.reachOk++;
      if (gb) acc.stepsGivingBack += o.givenBack;
      if (!gb && o.optimal < o.points && !out.example) out.example = { d, room, cost, greedyWithout: o.steps, greedyWith: oracleCase({ d, room, cost, preds, giveBack: true }).steps };
    }
  }
  for (const k of ["withGiveBack", "without"]) out[k].worst = Math.round(out[k].worst * 1000) / 1000;
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(bridgeRun(Number(process.argv[2]) || 2000), null, 1));
