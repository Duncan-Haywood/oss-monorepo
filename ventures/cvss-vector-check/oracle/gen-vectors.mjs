// Writes N random CVSS v3 vectors (seeded, so the file is reproducible) for
// score-with-oracle.py to score with an independent implementation.
//   node oracle/gen-vectors.mjs 3.1 2000 1 > /tmp/v31.txt
import { METRICS } from "../cvss.mjs";

const [version = "3.1", n = "1000", seedArg = "1"] = process.argv.slice(2);
let seed = Number(seedArg) >>> 0 || 1;
// mulberry32: a tiny seeded PRNG, so a rerun reproduces the committed fixture.
const rand = () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (a) => a[Math.floor(rand() * a.length)];
const out = [];
for (let i = 0; i < Number(n); i++) {
  // A third base-only, a third with temporal, a third with everything.
  const kind = i % 3;
  const parts = [];
  for (const [key, group, , values] of METRICS) {
    if (group === "temporal" && kind === 0) continue;
    if (group === "environmental" && kind < 2) continue;
    const v = pick(values)[0];
    if (group !== "base" && v === "X" && rand() < 0.5) continue;
    parts.push(`${key}:${v}`);
  }
  out.push(`CVSS:${version}/${parts.join("/")}`);
}
process.stdout.write(out.join("\n") + "\n");
