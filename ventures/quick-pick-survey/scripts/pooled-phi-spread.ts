/**
 * How far does the pooled Gaussian prior sd wander from panel to panel, and is
 * its pull toward the floor explained by the answers themselves? For each of
 * several independent panels (40 respondents each, as the interval sweeps
 * pool), prints the pooled sd, the log-evidence drop from its best phi to phi
 * 1.2 (near the true spread 1.155), the observed share of upsets (the truly
 * lower item picked) and the share the true gaps predict.
 * (docs/INFORMATION-GAIN-SELECTOR.md, "Why the pooled sd collapsed".)
 *
 * --bases lists panel seed bases explicitly (150000 is the panel that collapsed
 * to 0.33 in the t-prior sweep at --seed-base 50000). --truth normal draws
 * normal likes with the same sd (the Gaussian prior then matches the truth).
 *
 *   npx tsx scripts/pooled-phi-spread.ts [--items 15] [--per-item 8] [--panels 12] [--bases 150000,...] [--truth uniform|normal] [--selectors staged,shipped] [--jsonl out.jsonl]
 */
import { appendFileSync } from "node:fs";
import { selectNextPair, selectNextPairHybrid } from "../src/lib/pairing";
import { simulate, type Policy } from "../src/lib/infoGainSim";
import { pooledPriorPhi, sampledEvidence, type RefitAnswer } from "../src/lib/btRefit";

const argv = process.argv;
const opt = (name: string, d: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
const items = Number(opt("--items", "15"));
const k = Number(opt("--per-item", "8"));
const nPanels = Number(opt("--panels", "12"));
const selectors = opt("--selectors", "staged,shipped").split(",");
const jsonl = argv.includes("--jsonl") ? opt("--jsonl", "") : "";
const SELECTORS: Record<string, Policy> = {
  shipped: (i) => selectNextPair({ ...i, answerAgreement: undefined }),
  staged: (i) => selectNextPairHybrid({ ...i, answerAgreement: undefined }),
};
const truthKind = opt("--truth", "uniform");
/** Normal truth with the same sd as the uniform draw, from the same uniform as a quantile (as scripts/t-prior-interval-sweep.ts). */
function normalQuantile(p: number): number {
  // Acklam's rational approximation (as scripts/t-prior-interval-sweep.ts).
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  if (p < 0.02425) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - 0.02425) return -normalQuantile(1 - p);
  const q = p - 0.5, r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
const truthFor = truthKind === "normal" ? (_i: number, drawn: number) => normalQuantile(Math.min(Math.max((drawn + 1) / 2, 1e-12), 1 - 1e-12)) / Math.sqrt(3) : undefined;
const bases = argv.includes("--bases") ? opt("--bases", "").split(",").map(Number) : Array.from({ length: nPanels }, (_, b) => 200000 + b * 1000);
const sig = (x: number) => 1 / (1 + Math.exp(-x));
for (const sel of selectors) {
  for (const base of bases) {
    let up = 0, exp = 0, n = 0;
    const panel = Array.from({ length: 40 }, (_, i) => {
      const r = simulate(SELECTORS[sel], items, k * items, base + i * 7, 0, 0, 0, false, undefined, 0, undefined, truthFor);
      for (const { picked, other } of r.history) {
        const g = 2 * (r.truth.get(picked)! - r.truth.get(other)!);
        up += +(g < 0);
        exp += sig(-Math.abs(g));
        n++;
      }
      const ids = [...r.truth.keys()];
      const answers: RefitAnswer[] = r.history.map(({ picked, other }) => ({ winner: picked, loser: other }));
      return { ids, answers };
    });
    const phi = pooledPriorPhi(panel);
    const ev = (f: number) => panel.reduce((s, p) => s + sampledEvidence(p.ids, p.answers, f), 0);
    const drop = ev(phi) - ev(1.2);
    const row = { truth: truthKind, selector: sel, items, perItem: k, panelBase: base, phi: +phi.toFixed(3), dropTo1_2: +drop.toFixed(2), upsetObserved: +(up / n).toFixed(4), upsetExpected: +(exp / n).toFixed(4) };
    console.log(JSON.stringify(row));
    if (jsonl) appendFileSync(jsonl, JSON.stringify(row) + "\n");
  }
}
