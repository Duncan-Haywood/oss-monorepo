// Branch and bound over every split of the 32 NFL towns into 8 divisions of 4, to prove (or refute) the search's best.
// Bound: each team still unplaced needs 3 rivals among the unplaced, so it adds at least half the sum of its 3 nearest
// unplaced distances (each pair is counted from both ends). Groups are built lowest-unplaced-team first, so no split is
// visited twice. node eval/nfl-divisions-proof.mjs [upperBoundKm]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { haversineKm, splitByLocation } from "../regions.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const rows = readFileSync(here + "nfl-stadium-towns.txt", "utf8").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => {
  const m = l.split("|")[0].trim().match(/^(.+?) @ (-?[\d.]+), (-?[\d.]+)$/);
  return { name: m[1], p: [Number(m[2]), Number(m[3])] };
});
const n = rows.length, S = 4;
const D = rows.map((a) => rows.map((b) => haversineKm(a.p, b.p)));
const heur = splitByLocation(rows.map((r) => r.p), { divisions: n / S, starts: 400, kicks: 60, seed: 1 });
let best = Number(process.argv[2]) || heur.km + 1e-6, bestGroups = null;
const near = D.map((row, i) => row.map((d, j) => [d, j]).filter(([, j]) => j !== i).sort((a, b) => a[0] - b[0]));
const used = new Uint8Array(n);
function bound() {
  let s = 0;
  for (let i = 0; i < n; i++) if (!used[i]) {
    let c = 0, k = 0;
    for (const [d, j] of near[i]) { if (!used[j]) { c += d; if (++k === S - 1) break; } }
    s += c;
  }
  return s / 2;
}
let nodes = 0;
const cur = [];
const t0 = Date.now();
function rec(acc) {
  nodes++;
  const first = used.indexOf(0);
  if (first < 0) { if (acc < best) { best = acc; bestGroups = cur.map((g) => g.slice()); } return; }
  if (acc + bound() >= best) return;
  used[first] = 1;
  const cand = near[first].map(([, j]) => j).filter((j) => !used[j]);
  for (let x = 0; x < cand.length; x++) { const a = cand[x]; used[a] = 1;
    for (let y = x + 1; y < cand.length; y++) { const b = cand[y]; used[b] = 1;
      const ab = D[first][a] + D[first][b] + D[a][b];
      for (let z = y + 1; z < cand.length; z++) { const c = cand[z];
        const add = ab + D[first][c] + D[a][c] + D[b][c];
        if (acc + add >= best) continue;
        used[c] = 1; cur.push([first, a, b, c]); rec(acc + add); cur.pop(); used[c] = 0;
      }
      used[b] = 0; }
    used[a] = 0; }
  used[first] = 0;
}
rec(0);
const secs = ((Date.now() - t0) / 1000).toFixed(1);
if (bestGroups) console.log(`Found a split under the search's ${heur.km.toFixed(1)} km: ${best.toFixed(1)} km (${nodes} nodes, ${secs} s)`);
else console.log(`No split of the 32 towns into 8 divisions of 4 is below the search's ${heur.km.toFixed(1)} km: it is the least (${nodes.toLocaleString("en-US")} nodes, ${secs} s).`);
