/**
 * Whole-session coin flippers on real people's panels, and whether a pool
 * defence costs a real panel's own disagreement anything
 * (docs/INFORMATION-GAIN-SELECTOR.md, "Self-consistency: a coin-flip check
 * that does not tax camps").
 *
 * Each draw samples `n` real people from a PrefLib panel (scripts/preflib.ts),
 * replaces a share `--careless` of them (rounded) with whole-session coin
 * flippers, has everyone answer through the staged or standard selector
 * (realRankings.answerWithHistory), and pools. Real people carry whatever
 * camps the panel has, so the honest-only row (careless 0) is the cost of a
 * defence on real disagreement. Scored as Spearman against the mean positions
 * of the people not asked, paired with the plain pool:
 *
 *   shipped      groupRanking, everyone counted equally (what the report does)
 *   loo-drop     leave out people whose leave-one-out agreement
 *                (respondentAgreement) is under LOW_AGREEMENT
 *   gate-z<Z     leave them out only if their own answers are also inconsistent:
 *                selfConsistency z under Z (selfConsistency.ts)
 *   oracle-drop  leave out the coin flippers
 *
 *   npx tsx scripts/coin-flip-gate-real.ts [--seeds 40] [--selector staged|standard] [--careless 0,0.25,0.4,0.5] [--gate-z 0.5,1]
 */
import { groupRanking, LOW_AGREEMENT, respondentAgreement, type ParticipantRatingRow } from "../src/lib/groupRanking";
import { answerWithHistory, meanPositions, mulberry32, parseSoc, type Panel } from "../src/lib/realRankings";
import { selfConsistency } from "../src/lib/selfConsistency";
import { spearman } from "../src/lib/infoGainSim";
import { arg, DATASETS, load } from "./preflib";

const argv = process.argv;
const opt = (name: string, d: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
const seeds = arg("--seeds", 40);
const selector = opt("--selector", "staged");
if (selector !== "staged" && selector !== "shipped" && selector !== "standard") throw new Error("--selector takes staged or standard");
const sel = selector === "staged" ? "staged" : "shipped";
const shares = opt("--careless", "0,0.25,0.4,0.5").split(",").map(Number);
const gateZs = opt("--gate-z", "0.5,1").split(",").map(Number);

type Person = { id: string; rows: ParticipantRatingRow[]; coin: boolean; z: number };

function scoreDraw(panel: Panel, n: number, budget: number, share: number, seed: number) {
  const rand = mulberry32(seed);
  const shuffled = panel.orders.map((o, i) => ({ o, k: rand(), i })).sort((x, y) => x.k - y.k || x.i - y.i).map((x) => x.o);
  const pick = shuffled.slice(0, n);
  const whole = meanPositions(shuffled.slice(n), panel.names.length);
  const ids = panel.names.map((_, i) => `alt-${i}`);
  const nCoin = Math.round(share * n);
  const people: Person[] = pick.map((order, i) => {
    const coin = i < nCoin;
    const { rows, answers } = answerWithHistory(order, budget, sel, rand, coin ? 1 : 0);
    const sc = selfConsistency(ids, answers);
    return { id: `p${i}`, rows: rows.map((r) => ({ ...r, participantId: `p${i}` })), coin, z: sc?.z ?? NaN };
  });
  const loo = new Map(respondentAgreement(people.flatMap((p) => p.rows)).map((a) => [a.participantId, a.rho]));
  const low = (p: Person) => { const r = loo.get(p.id); return r !== null && r !== undefined && r < LOW_AGREEMENT; };
  const pool = (keep: (p: Person) => boolean) => {
    const kept = people.filter(keep);
    const ranked = groupRanking(panel.names.map((label, i) => ({ id: `alt-${i}`, label })), (kept.length ? kept : people).flatMap((p) => p.rows));
    const by = new Map(ranked.map((r) => [r.itemId, r.rating]));
    return spearman(whole, ids.map((id) => -by.get(id)!));
  };
  const out: Record<string, number> = { shipped: pool(() => true), "loo-drop": pool((p) => !low(p)), "oracle-drop": pool((p) => !p.coin) };
  for (const z of gateZs) out[`gate-z<${z}`] = pool((p) => !(low(p) && !(p.z >= z)));
  out.honestLow = people.filter((p) => !p.coin && low(p)).length;
  out.honestGated = people.filter((p) => !p.coin && low(p) && !(p.z >= gateZs[gateZs.length - 1])).length;
  out.honest = people.filter((p) => !p.coin).length;
  return out;
}

async function main() {
  console.log(`seeds ${seeds}, selector ${selector}`);
  for (const d of DATASETS) {
    const panel = parseSoc(await load(d.path, d.sha256));
    const n = d.key === "breakfast" ? 20 : 10;
    const budgets = d.key === "breakfast" ? [30, 60] : [20, 44];
    for (const budget of budgets) {
      for (const share of shares) {
        const acc: Record<string, number[]> = {};
        for (let s = 1; s <= seeds; s++) {
          const r = scoreDraw(panel, n, budget, share, s * 7919 + n * 31 + budget + Math.round(share * 1000));
          for (const [k, v] of Object.entries(r)) (acc[k] ??= []).push(v);
        }
        const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
        const row: Record<string, unknown> = { dataset: d.key, selector, people: n, answers: budget, careless: share, seeds, shipped: Number(mean(acc.shipped).toFixed(4)) };
        for (const k of Object.keys(acc)) {
          if (k === "shipped" || k.startsWith("honest")) continue;
          const diff = acc[k].map((v, i) => v - acc.shipped[i]);
          const md = mean(diff);
          const se = Math.sqrt(diff.reduce((s2, x) => s2 + (x - md) ** 2, 0) / (diff.length - 1) / diff.length);
          row[k] = { vsShipped: Number(md.toFixed(4)), se: Number(se.toFixed(4)) };
        }
        const honest = acc.honest.reduce((a, b) => a + b, 0);
        row.honestLowShare = Number((acc.honestLow.reduce((a, b) => a + b, 0) / Math.max(honest, 1)).toFixed(3));
        row.honestGatedShare = Number((acc.honestGated.reduce((a, b) => a + b, 0) / Math.max(honest, 1)).toFixed(3));
        console.log(JSON.stringify(row));
      }
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
