/**
 * Per-person intervals from a Bradley-Terry refit (src/lib/btRefit.ts) against
 * the one-game-at-a-time Glicko-2 rd the routes store. Synthetic respondent of
 * src/lib/infoGainSim.ts. For each list length, true lapse rate and budget
 * (answers per item), prints for each selector, mean over respondents:
 *
 *   acc   rank accuracy (Spearman, every item) of Glicko ratings / refit means
 *   cov   95% pairwise coverage: Glicko rd, refit marginal sd (rd_a, rd_b as if
 *         independent, what a stored per-item rd can carry), refit full
 *         covariance (Var(a - b) with the cross term)
 *   w     mean half-width of those intervals, internal scale (narrower at equal
 *         coverage is better)
 *   asked coverage restricted to pairs the respondent was actually asked
 *   top   the insights screen's "clear top pick" rule (leader ahead by more than
 *         half its rd) and src/lib/clearPick.ts (beats every item by 1.645 sd of
 *         the difference), each on Glicko and on the refit: share of respondents
 *         it fires for, and share of those claims that name the wrong item
 *
 * --couple-bar prints, instead, the median / p90 answer count at which
 * min(8, items) items first have rd under 200, for Glicko and for the refit's
 * marginal sd (refit each answer; the couple screen's bar, src/lib/couples.ts).
 *
 *   npx tsx scripts/refit-coverage-sweep.ts [--seeds 40] [--seed-base 1000] [--items 8,15,30] [--lapses 0,0.1,0.2,0.35] [--per-item 2,4,8] [--selectors shipped,staged,random] [--couple-bar] [--jsonl out.jsonl]
 */
import { appendFileSync } from "node:fs";
import { selectNextPair, selectNextPairHybrid, pairKey } from "../src/lib/pairing";
import { simulate, spearman, type Policy } from "../src/lib/infoGainSim";
import { GLICKO_SCALE, ratingToLogit } from "../src/lib/glicko2";
import { refitRatings } from "../src/lib/btRefit";
import { clearPick } from "../src/lib/clearPick";

const argv = process.argv;
const opt = (name: string, d: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
const nSeeds = Number(opt("--seeds", "40"));
const seedBase = Number(opt("--seed-base", "1000"));
const itemCounts = opt("--items", "8,15,30").split(",").map(Number);
const lapses = opt("--lapses", "0,0.1,0.2,0.35").split(",").map(Number);
const perItem = opt("--per-item", "2,4,8").split(",").map(Number);
const selectorNames = opt("--selectors", "shipped,staged,random").split(",");
const jsonl = argv.includes("--jsonl") ? opt("--jsonl", "") : "";
const seeds = Array.from({ length: nSeeds }, (_, i) => seedBase + i * 7);
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const r3 = (x: number) => Number(x.toFixed(3));
const q = (v: number[], p: number) => [...v].sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(p * v.length))];

const SELECTORS: Record<string, Policy> = {
  shipped: (i) => selectNextPair({ ...i, answerAgreement: undefined }),
  staged: (i) => selectNextPairHybrid({ ...i, answerAgreement: undefined }),
  random: ({ items, rand }) => {
    const r = rand ?? Math.random;
    const a = Math.floor(r() * items.length);
    let b = Math.floor(r() * (items.length - 1));
    if (b >= a) b++;
    return [items[a].id, items[b].id];
  },
};

if (argv.includes("--couple-bar")) {
  for (const items of itemCounts) {
    const need = Math.min(8, items);
    const cap = Math.max(300, 8 * items);
    const cell: Record<string, unknown> = { items };
    for (const sel of selectorNames) {
      const glicko: number[] = [], refit: number[] = [];
      for (const s of seeds) {
        let atG = Infinity;
        const r = simulate(SELECTORS[sel], items, cap, s, 0, 0, 0, false, (answered, rds) => {
          if (atG === Infinity && rds.filter((rd) => rd < 200).length >= need) atG = answered;
        });
        glicko.push(atG);
        const ids = [...r.truth.keys()];
        let atR = Infinity;
        for (let n = need / 2; n <= r.history.length; n++) {
          const fit = refitRatings(ids, r.history.slice(0, n).map(({ picked, other }) => ({ winner: picked, loser: other })));
          if ([...fit.rd.values()].filter((rd) => rd < 200).length >= need) {
            atR = n;
            break;
          }
        }
        refit.push(atR);
      }
      const show = (v: number[]) => [q(v, 0.5), q(v, 0.9)].map((x) => (x === Infinity ? `>${cap}` : x));
      cell[sel] = { glicko: show(glicko), refit: show(refit) };
    }
    console.log(JSON.stringify(cell));
  }
  process.exit(0);
}

for (const items of itemCounts) {
  for (const lapse of lapses) {
    for (const k of perItem) {
      const cell: Record<string, unknown> = { items, lapse, perItem: k };
      for (const sel of selectorNames) {
        const acc = { g: [] as number[], r: [] as number[] };
        const cov = { g: [] as number[], rm: [] as number[], rf: [] as number[] };
        const wid = { g: [] as number[], rm: [] as number[], rf: [] as number[] };
        const asked = { g: [] as number[], rf: [] as number[] };
        // The insights screen's "top pick" claim. Rules: half = the leader is ahead of the runner-up
        // by more than half its own rd (the route until 2026-11-12); z = the leader beats every other
        // item by more than 1.645 sd of the difference (src/lib/clearPick.ts). Glicko's sd of a
        // difference is hypot(rd_a, rd_b); the refit's has the covariance term.
        const RULES = ["g-half", "r-half", "g-z", "r-z"] as const;
        const claim = Object.fromEntries(RULES.map((k) => [k, { n: 0, wrong: 0 }])) as Record<(typeof RULES)[number], { n: number; wrong: number }>;
        for (const s of seeds) {
          const r = simulate(SELECTORS[sel], items, k * items, s, lapse);
          const ids = [...r.truth.keys()];
          const fit = refitRatings(ids, r.history.map(({ picked, other }) => ({ winner: picked, loser: other })));
          const askedKeys = new Set(r.history.map(({ picked, other }) => pairKey(picked, other)));
          const truth = ids.map((id) => 2 * r.truth.get(id)!);
          acc.g.push(spearman(truth, ids.map((id) => r.states.get(id)!.rating)));
          acc.r.push(spearman(truth, fit.mu));
          const n = ids.length;
          const trueTop = ids[truth.indexOf(Math.max(...truth))];
          const gC = ids.map((id) => ({ key: id, rating: r.states.get(id)!.rating, rd: r.states.get(id)!.rd }));
          const rC = ids.map((id, i) => ({ key: id, rating: fit.rating.get(id)!, rd: fit.rd.get(id)!, i }));
          const half = <T extends { key: string; rating: number; rd: number }>(c: T[]) => {
            const order = [...c].sort((a, b) => b.rating - a.rating);
            return order[0].rating - order[1].rating > 0.5 * order[0].rd ? order[0].key : undefined;
          };
          const viaZ = <T extends { key: string; rating: number }>(c: T[], sd: (a: T, b: T) => number) => {
            const p = clearPick(c, sd);
            return p?.clear ? p.leader.key : undefined;
          };
          const got: Record<(typeof RULES)[number], string | undefined> = {
            "g-half": half(gC),
            "r-half": half(rC),
            "g-z": viaZ(gC, (a, b) => Math.hypot(a.rd, b.rd)),
            "r-z": viaZ(rC, (a, b) => GLICKO_SCALE * Math.sqrt(Math.max(0, fit.cov[a.i * n + a.i] + fit.cov[b.i * n + b.i] - 2 * fit.cov[a.i * n + b.i]))),
          };
          for (const k of RULES) if (got[k]) { claim[k].n++; if (got[k] !== trueTop) claim[k].wrong++; }
          let pairs = 0, hg = 0, hrm = 0, hrf = 0, wg = 0, wrm = 0, wrf = 0, ap = 0, ahg = 0, ahrf = 0;
          for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
              const real = truth[i] - truth[j];
              const sa = r.states.get(ids[i])!, sb = r.states.get(ids[j])!;
              const eg = ratingToLogit(sa.rating) - ratingToLogit(sb.rating);
              const halfG = (1.96 * Math.hypot(sa.rd, sb.rd)) / GLICKO_SCALE;
              const er = fit.mu[i] - fit.mu[j];
              const halfRm = 1.96 * Math.sqrt(fit.cov[i * n + i] + fit.cov[j * n + j]);
              const halfRf = 1.96 * Math.sqrt(Math.max(0, fit.cov[i * n + i] + fit.cov[j * n + j] - 2 * fit.cov[i * n + j]));
              const okG = Math.abs(eg - real) <= halfG, okRf = Math.abs(er - real) <= halfRf;
              pairs++;
              hg += +okG;
              hrm += +(Math.abs(er - real) <= halfRm);
              hrf += +okRf;
              wg += halfG; wrm += halfRm; wrf += halfRf;
              if (askedKeys.has(pairKey(ids[i], ids[j]))) {
                ap++;
                ahg += +okG;
                ahrf += +okRf;
              }
            }
          }
          cov.g.push(hg / pairs); cov.rm.push(hrm / pairs); cov.rf.push(hrf / pairs);
          wid.g.push(wg / pairs); wid.rm.push(wrm / pairs); wid.rf.push(wrf / pairs);
          if (ap > 0) {
            asked.g.push(ahg / ap);
            asked.rf.push(ahrf / ap);
          }
        }
        cell[sel] = {
          acc: [r3(mean(acc.g)), r3(mean(acc.r))],
          cov: [r3(mean(cov.g)), r3(mean(cov.rm)), r3(mean(cov.rf))],
          w: [r3(mean(wid.g)), r3(mean(wid.rm)), r3(mean(wid.rf))],
          asked: [r3(mean(asked.g)), r3(mean(asked.rf))],
          top: Object.fromEntries(RULES.map((k) => [k, [r3(claim[k].n / seeds.length), r3(claim[k].n ? claim[k].wrong / claim[k].n : 0)]])),
        };
      }
      console.log(JSON.stringify(cell));
      if (jsonl) appendFileSync(jsonl, JSON.stringify({ seedBase, seeds: nSeeds, ...cell }) + "\n");
    }
  }
}
