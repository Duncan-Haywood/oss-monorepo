// The NFL's eight divisions against the least-travel split of the same 32 teams, as a real-data check of regions.mjs.
// node eval/nfl-divisions.mjs   (reads eval/nfl-stadium-towns.txt; prints the table written to eval/nfl-divisions.txt)
// Division travel per season: every pair of division rivals plays twice, each side driving or flying to the other once,
// so the season's division-game travel is 4 x the sum of rival-pair distances (great-circle, town centre to town centre).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { haversineKm, splitByLocation, splitCost, describeSplit } from "../regions.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const rows = readFileSync(here + "nfl-stadium-towns.txt", "utf8").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => {
  const [head, division, town] = l.split("|").map((s) => s.trim());
  const m = head.match(/^(.+?) @ (-?[\d.]+), (-?[\d.]+)$/);
  return { name: m[1], lat: Number(m[2]), lon: Number(m[3]), division, town, conf: division.slice(0, 3) };
});
const pts = rows.map((t) => [t.lat, t.lon]);
const D = pts.map((p) => pts.map((q) => haversineKm(p, q)));
const season = (km) => Math.round(4 * km).toLocaleString("en-US");
const show = (title, groups, names) => {
  console.log(`\n${title}: rival pairs ${Math.round(splitCost(groups, D)).toLocaleString("en-US")} km, division-game travel ${season(splitCost(groups, D))} km a season`);
  for (const d of describeSplit(groups, rows, names)) console.log(`  ${d.name.padEnd(12)} ${d.teams.map((t) => t.name).join(", ").padEnd(46)} longest ${d.longest.a}-${d.longest.b} ${Math.round(d.longest.km)} km`);
};

const actualNames = [...new Set(rows.map((t) => t.division))];
const actual = actualNames.map((n) => rows.map((t, i) => (t.division === n ? i : -1)).filter((i) => i >= 0));
show("Actual divisions (2025)", actual, actualNames);

const t0 = Date.now();
const free = splitByLocation(pts, { divisions: 8, starts: 400, kicks: 60, seed: 1 });
show(`Least travel, any 4 teams (search: ${free.startsAtBest} of ${free.starts} starts reached it, ${((Date.now() - t0) / 1000).toFixed(1)} s)`, free.groups);

// conferences kept: 16 teams into 4 divisions of 4 has 2,627,625 splits, few enough to check every one
function exhaustive16(idx) {
  const n = idx.length, used = new Array(n).fill(false), cur = [];
  let best = Infinity, bestGroups = null;
  const sub = idx.map((a) => idx.map((b) => D[a][b]));
  const rec = (acc) => {
    const first = used.indexOf(false);
    if (first < 0) { if (acc < best) { best = acc; bestGroups = cur.map((g) => g.map((i) => idx[i])); } return; }
    used[first] = true;
    for (let a = first + 1; a < n; a++) if (!used[a]) { used[a] = true;
      for (let b = a + 1; b < n; b++) if (!used[b]) { used[b] = true;
        for (let c = b + 1; c < n; c++) if (!used[c]) {
          const add = sub[first][a] + sub[first][b] + sub[first][c] + sub[a][b] + sub[a][c] + sub[b][c];
          if (acc + add < best) { used[c] = true; cur.push([first, a, b, c]); rec(acc + add); cur.pop(); used[c] = false; }
        }
        used[b] = false; }
      used[a] = false; }
    used[first] = false;
  };
  rec(0);
  return { best, groups: bestGroups };
}
const confGroups = [];
for (const conf of ["AFC", "NFC"]) {
  const idx = rows.map((t, i) => (t.conf === conf ? i : -1)).filter((i) => i >= 0);
  const ex = exhaustive16(idx);
  const s = splitByLocation(idx.map((i) => pts[i]), { divisions: 4, starts: 64, seed: 1 });
  console.log(`\n${conf}: exhaustive best ${Math.round(ex.best)} km over every split; search ${Math.round(s.km)} km (${s.startsAtBest} of ${s.starts} starts)${Math.abs(ex.best - s.km) < 1e-6 ? " - same" : " - DIFFERENT"}`);
  confGroups.push(...ex.groups);
}
show("Least travel, conferences kept (proved by checking every split)", confGroups);
