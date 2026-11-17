// Prints every CVSS v3 base+temporal vector (2,592 base x 100 temporal = 259,200)
// for one version, so score-with-oracle.py can score the whole space.
//   node oracle/all-base-temporal.mjs 3.1 | python3 oracle/score-with-oracle.py > /tmp/all.json
import { METRICS } from "../cvss.mjs";
const version = process.argv[2] || "3.1";
const groups = METRICS.filter((m) => m[1] !== "environmental");
const out = [];
const walk = (i, parts) => {
  if (i === groups.length) return void out.push(`CVSS:${version}/${parts.join("/")}`);
  for (const [v] of groups[i][3]) walk(i + 1, [...parts, `${groups[i][0]}:${v}`]);
};
walk(0, []);
process.stdout.write(out.join("\n") + "\n");
