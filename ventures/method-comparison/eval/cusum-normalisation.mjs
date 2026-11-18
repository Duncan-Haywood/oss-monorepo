// Why the CUSUM statistic is divided by sqrt(points off the line + 1) rather than
// sqrt(points below the line + 1): false-alarm rate of each under a straight-line truth.
// node eval/cusum-normalisation.mjs > eval/cusum-normalisation.json
import { passingBablok, cusumLinearity, rng } from "../engine.mjs";

const draw = rng(5);
const g = () => Math.sqrt(-2 * Math.log(draw() || 1e-12)) * Math.cos(2 * Math.PI * draw());
const rows = [];
for (const n of [30, 60, 200]) {
  let belowNorm = 0, allNorm = 0;
  const reps = 1000;
  for (let k = 0; k < reps; k++) {
    const x = [], y = [];
    for (let i = 0; i < n; i++) { const t = 20 + 180 * draw(); x.push(t + 4 * g()); y.push(2 + 1.05 * t + 4 * g()); }
    const pb = passingBablok(x, y);
    const c = cusumLinearity(x, y, pb.slope, pb.intercept);
    if (c.maxCusum / Math.sqrt(c.below + 1) > 1.358) belowNorm++;
    if (c.statistic > 1.358) allNorm++;
  }
  rows.push({ n, reps, falseAlarmPctBelowPlusOne: (100 * belowNorm) / reps, falseAlarmPctOffLinePlusOne: (100 * allNorm) / reps });
}
console.log(JSON.stringify({ note: "Straight-line truth, constant normal error SD 4; rejection at the Kolmogorov 5% point 1.358.", rows }, null, 1));
