// How often does each test cry "pattern" when there is none? Seeded simulation:
// values drawn independently of place (normal, and skewed lognormal) on two fixed maps
// (the 48-state queen contiguity and 120 random planar points with 6 nearest neighbours).
// Rejection rate at 0.05 for each global test; for local Moran, how many places per map
// come out "significant" and how many maps have at least one, with and without the FDR.
//   node eval/calibration.mjs > eval/calibration-output.txt   (about 20 s)
import { readFileSync } from "node:fs";
import { buildWeights, transformWeights, parseNeighbors, distanceMatrix, moran, geary, generalG, localMoran, fdrThreshold, rng } from "../engine.mjs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const REPS = 1000, PERMS = 199, ALPHA = 0.05, FDR_REPS = 200;
const rand = rng(20261118);
const gauss = () => { let u = 0; while (u === 0) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };

const ids = read("../data/us-state-neighbors.csv").trim().split("\n").slice(1).map((l) => l.split(",")[0]);
const queen = transformWeights(buildWeights({ kind: "list", ids, neighbors: parseNeighbors(read("../data/us-state-neighbors.csv")) }), "r");
const pts = Array.from({ length: 120 }, () => [100 * rand(), 100 * rand()]);
const knn = transformWeights(buildWeights({ kind: "knn", k: 6, D: distanceMatrix(pts.map((p) => p[0]), pts.map((p) => p[1]), false) }), "r");
const maps = [["48 states (queen)", queen], ["120 points (knn6)", knn]];
const draws = [["normal", () => gauss()], ["lognormal sd 1", () => Math.exp(gauss())]];

console.log(`reps ${REPS}, permutations ${PERMS}, alpha ${ALPHA}, seed 20261118; FDR columns: first ${FDR_REPS} reps, 2n/alpha permutations (as the engine uses)`);
console.log("map,values,moran_norm,moran_rand,moran_perm_two,moran_perm_one,geary_rand,geary_perm_two,geary_perm_one,G_norm,G_perm_two,local_mean_sig_two,local_mean_sig_one,local_maps_any_two,local_fdr_mean_sig,local_fdr_maps_any");
for (const [mname, W0] of maps) for (const [dname, draw] of draws) {
  const Wb = transformWeights(W0, "b");
  const c = { mn: 0, mr: 0, mp: 0, mo: 0, gr: 0, gp: 0, go: 0, Gn: 0, Gp: 0, ls: 0, lo: 0, la: 0, fs: 0, fa: 0 };
  const fdrPerms = Math.ceil((2 * W0.n) / ALPHA);
  for (let r = 0; r < REPS; r++) {
    const y = Array.from({ length: W0.n }, draw);
    const m = moran(y, W0, { permutations: PERMS, rand });
    const g = geary(y, W0, { permutations: PERMS, rand });
    c.mn += m.p_norm <= ALPHA; c.mr += m.p_rand <= ALPHA; c.mp += m.p_sim <= ALPHA; c.mo += m.p_sim_one <= ALPHA;
    c.gr += g.p_rand <= ALPHA; c.gp += g.p_sim <= ALPHA; c.go += g.p_sim_one <= ALPHA;
    if (dname !== "normal") { const G = generalG(y, Wb, { permutations: PERMS, rand }); c.Gn += G.p_norm <= ALPHA; c.Gp += G.p_sim <= ALPHA; }
    const lm = localMoran(y, W0, { permutations: PERMS, rand });
    const sig = lm.p_sim.filter((p) => p <= ALPHA).length;
    c.lo += lm.p_sim_one.filter((p) => p <= ALPHA).length;
    // the FDR run uses as many permutations as the engine does when FDR is on
    const lf = r < FDR_REPS ? localMoran(y, W0, { permutations: fdrPerms, rand }) : null;
    if (lf) {
      const t = fdrThreshold(lf.p_sim, ALPHA);
      const fsig = t > 0 ? lf.p_sim.filter((p) => p <= t).length : 0;
      c.fs += fsig; c.fa += fsig > 0;
    }
    c.ls += sig; c.la += sig > 0;
  }
  const pc = (v) => (100 * v / REPS).toFixed(1);
  const G = dname === "normal" ? "n/a,n/a" : `${pc(c.Gn)},${pc(c.Gp)}`;
  console.log([mname, dname, pc(c.mn), pc(c.mr), pc(c.mp), pc(c.mo), pc(c.gr), pc(c.gp), pc(c.go), G, (c.ls / REPS).toFixed(2), (c.lo / REPS).toFixed(2), pc(c.la), (c.fs / FDR_REPS).toFixed(2), (100 * c.fa / FDR_REPS).toFixed(1)].join(","));
}
