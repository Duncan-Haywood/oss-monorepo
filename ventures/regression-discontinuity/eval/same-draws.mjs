// The engine on the draws eval/same_draws.py wrote: coverage at the automatic bandwidth.
//   node eval/same-draws.mjs /tmp/rd-draws
import { readFileSync } from "node:fs";
import { rdEstimate, selectBandwidth } from "../engine.mjs";

const dir = process.argv[2] || "/tmp/rd-draws";
const X = readFileSync(`${dir}/X.txt`, "utf8").trim().split("\n");
const Y = readFileSync(`${dir}/Y.txt`, "utf8").trim().split("\n");
let cc = 0, cr = 0, h = 0;
for (let r = 0; r < X.length; r++) {
  const x = X[r].split(" ").map(Number), y = Y[r].split(" ").map(Number);
  const bw = selectBandwidth({ x, y });
  const e = rdEstimate({ x, y, h: bw.h, b: bw.b });
  h += bw.h;
  if (e.conventional.ci[0] <= 0.04 && 0.04 <= e.conventional.ci[1]) cc++;
  if (e.robust.ci[0] <= 0.04 && 0.04 <= e.robust.ci[1]) cr++;
}
console.log(JSON.stringify({ conv: cc / X.length, robust: cr / X.length, meanH: h / X.length }));
