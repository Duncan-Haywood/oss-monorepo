/**
 * Why a pooled spread fit that models each person's lapse cannot narrow the
 * prior (docs/INFORMATION-GAIN-SELECTOR.md, "A pooled spread that models the
 * lapse"): prints, on a grid of phi, the panel's log evidence three ways from
 * the same per-person grids (src/lib/lapsePool.ts lapseEvidenceGrid):
 * profiled over the panel's lapse weights (EM), under a fixed Beta(1, 19) prior
 * on each person's lapse (beta19Weights), and at each fixed lapse share.
 * A flat profiled row is the ridge: spread and lapse trade off.
 *
 *   npx tsx scripts/lapse-ridge.ts [--selector staged|shipped] [--lapse 0] [--people 20] [--items 15] [--per-item 8]
 */
import { simulate } from "../src/lib/infoGainSim";
import { selectNextPair, selectNextPairHybrid } from "../src/lib/pairing";
import { beta19Weights, LAPSE_POOL_GRID, lapseEvidenceGrid, profiledPanelEvidence } from "../src/lib/lapsePool";

const argv = process.argv;
const opt = (name: string, d: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
const sel = opt("--selector", "staged") === "staged" ? selectNextPairHybrid : selectNextPair;
const lapse = Number(opt("--lapse", "0"));
const nPeople = Number(opt("--people", "20"));
const items = Number(opt("--items", "15"));
const perItem = Number(opt("--per-item", "8"));
const people = Array.from({ length: nPeople }, (_, i) => {
  const r = simulate((x) => sel({ ...x, answerAgreement: undefined }), items, items * perItem, 5000 + 7 * i, lapse);
  return { ids: [...r.truth.keys()], answers: r.history.map(({ picked, other }) => ({ winner: picked, loser: other })) };
});
const fixed = beta19Weights();
console.log(`phi | profiled (EM weights) | Beta(1,19) prior | fixed e = ${LAPSE_POOL_GRID.join(", ")}`);
for (const phi of [0.3, 0.5, 0.8, 1.0, 1.2, 1.5, 2.0]) {
  const gs = people.map((p) => lapseEvidenceGrid(p.ids, p.answers, phi));
  const prof = profiledPanelEvidence(gs);
  const pri = profiledPanelEvidence(gs, { fixed });
  const at = (k: number) => gs.reduce((s, g) => s + g[k], 0);
  console.log(`${phi} | ${prof.evidence.toFixed(1)} (w ${prof.weights.map((w) => w.toFixed(2)).join(",")}) | ${pri.evidence.toFixed(1)} | ${LAPSE_POOL_GRID.map((_, k) => at(k).toFixed(1)).join(" ")}`);
}
