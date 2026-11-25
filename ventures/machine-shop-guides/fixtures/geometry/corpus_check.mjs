// Compare part-geometry.mjs with the kernel truth from make_fixtures.py: node corpus_check.mjs <dir>
// "under" > 0 would mean a box smaller than the part (must never happen); "boxErr" is the overstatement.
import { readFileSync, existsSync } from "node:fs";
import { readPart, boxInFrame, stepPrimitives, roundEnvelopes } from "../../part-geometry.mjs";
const dir = process.argv[2];
const truth = JSON.parse(readFileSync(dir + "/truth.json", "utf8"));
let worst = 0, worstEnv = 0, exactN = 0, n = 0, volWorst = 0;
for (const [name, t] of Object.entries(truth)) {
  const prims = stepPrimitives(readFileSync(`${dir}/${name}.step`, "utf8"));
  const W = [[1,0,0],[0,1,0],[0,0,1]];
  const b = boxInFrame(prims, W);
  const err = Math.max(...[0,1,2].flatMap(i => [Math.abs(b.min[i]-t.min[i]), Math.abs(b.max[i]-t.max[i])]));
  const under = Math.max(...[0,1,2].flatMap(i => [b.min[i]-t.min[i], t.max[i]-b.max[i]]));
  const env = roundEnvelopes(prims, W, b);
  const envUnder = Math.max(...env.map((e,i)=> t.envelopeMeshLowerBound[i] - e));
  const envOver = Math.max(...env.map((e,i)=> e - t.envelopeMeshLowerBound[i]));
  const stl = `${dir}/${name}.stl`;
  const vErr = existsSync(stl) ? Math.abs(readPart(readFileSync(stl), name + ".stl").volume - t.volume) / t.volume : 0;
  n++; if (err < 1e-6) exactN++;
  worst = Math.max(worst, under); worstEnv = Math.max(worstEnv, envUnder); volWorst=Math.max(volWorst,vErr);
  console.log(name.padEnd(22), prims.units.name, "boxErr", err.toFixed(6), "under", under.toFixed(6), "envUnder", envUnder.toFixed(4), "envOver", envOver.toFixed(4), "stlVolErr%", (vErr*100).toFixed(3), prims.warnings.join(" | "));
}
console.log({ n, exactN, worstUnder: worst, worstEnvUnder: worstEnv, volWorst });
