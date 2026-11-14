/**
 * The other direction (flagship item d10; docs/INFORMATION-GAIN-SELECTOR.md,
 * "A slot run's cut moved back to an earlier fast turn").
 *
 * Since d9 the default ranking tests each fast turn's slots as one pre-named
 * candidate (slotRunsAtTurns). Its honest bound holds however wrong the turn is
 * (the shuffle makes honest slots a fair coin whatever the times were), yet the
 * turns it reads still pass fastBlockStarts' wander bar, which under a wandering
 * pace throws out real turns. This measures two ways to use the timing more:
 *
 *   slot        slotFlags alone (the default before d9)
 *   gated       the default today: slotFlags plus slotRunsAtTurns at fastBlockStarts' turns
 *   loose       slotFlags plus slotRunsAtTurns at turns found with the wander bar off (walkQ 0)
 *   back        gated, and a slot run found by slotBlockStarts is cut from the loose turn
 *               when that turn comes before the run (the speed-up named as the run's start)
 *   looseBack   loose and back together
 *   oracle      leave out exactly what the careless answered carelessly
 *
 * `loose` adds at most alpha honest flags by d9's argument. `back` moves the cut
 * only for people the slot test already flagged (0.01-0.16% of honest people in
 * the slot-block sweep), so it cannot flag anyone new; what it risks is cutting a
 * careless person's honest answers when the loose turn is a wander step.
 *
 * Panels and the careless model are slot-fast-joint-sweep.ts's (same seeds).
 *
 *   npx tsx scripts/slot-turn-back-sweep.ts [--items 15,30] [--q 1,0.6,0.3] [--ratio 0.4,0.7] [--lag 0.25] [--walk 0,0.08] [--careless 0.25] [--surveys 30] [--seed-base 9100]
 */
import { selectNextPairHybrid, type PairingInput } from "../src/lib/pairing";
import { simulate, spearman, type Chooser, type Policy } from "../src/lib/infoGainSim";
import { FAST_BLOCK_CURVE_Q, FAST_BLOCK_LATER_Q, FAST_BLOCK_NET_SHARE, FAST_BLOCK_TREND_F, fastBlockStarts, groupRanking, ratingsWithoutAnswers, slotFlags, slotRunsAtTurns, type ParticipantRatingRow, type ReplayAnswer } from "../src/lib/groupRanking";

const argv = process.argv;
const opt = (name: string, d: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
const nums = (s: string) => s.split(",").map(Number);
const itemCounts = nums(opt("--items", "15,30"));
const perItem = nums(opt("--per-item", "4"));
const panels = nums(opt("--respondents", "20"));
const shares = nums(opt("--careless", "0.25"));
const onsets = nums(opt("--onset", "0.5"));
const lags = nums(opt("--lag", "0.25"));
const qs = nums(opt("--q", "1,0.6,0.3"));
const ratios = nums(opt("--ratio", "0.4,0.7"));
const rest = opt("--rest", "random");
if (rest !== "random" && rest !== "honest") throw new Error(`--rest must be random or honest, got ${rest}`);
const walks = nums(opt("--walk", "0,0.08"));
const nSurveys = Number(opt("--surveys", "30"));
const seedBase = Number(opt("--seed-base", "9100"));
const spread = 0.25, personSd = 0.4, gamma = 0.6;

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function normal(rand: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

const routeStaged: Policy = (input: PairingInput) => {
  const [a, b] = selectNextPairHybrid({ ...input, answerAgreement: undefined });
  return (input.rand ?? Math.random)() < 0.5 ? [a, b] : [b, a];
};

function rank(items: string[], rows: ParticipantRatingRow[], target: number[]): number {
  const ranked = groupRanking(items.map((id) => ({ id, label: id })), rows, "overlap", { answeredOnly: true });
  const by = new Map(ranked.map((r) => [r.itemId, r.rating]));
  return spearman(target, items.map((id) => by.get(id)!));
}

for (const walk of walks) for (const q of qs) for (const ratio of ratios) for (const lag of lags) for (const onset of onsets) {
  for (const items of itemCounts) for (const k of perItem) for (const nResp of panels) for (const share of shares) {
    if (share === 0 && (q !== qs[0] || ratio !== ratios[0] || lag !== lags[0] || onset !== onsets[0])) continue;
    const budget = items * k;
    const nCareless = Math.round(share * nResp);
    const acc: Record<string, number[]> = {};
    const det = { n: 0, hn: 0, slot: 0, gated: 0, loose: 0, hLooseAdded: 0, hGatedAdded: 0, backMoved: 0, backWrong: 0, hBackMoved: 0 };
    const backGain: number[] = []; // careless answers newly cut by back, per person whose cut moved
    const backLoss: number[] = []; // honest answers (before the true onset) newly cut, same people
    for (let sv = 0; sv < nSurveys; sv++) {
      const svSeed = seedBase + sv * 104729 + items * 31 + k;
      const sr = mulberry32(svSeed);
      const common = Array.from({ length: items }, () => sr() * 2 - 1);
      const ids = common.map((_, i) => `item-${String(i).padStart(3, "0")}`);
      const idx = new Map(ids.map((id, i) => [id, i]));
      const answers: ReplayAnswer[] = [];
      const carelessFrom = new Map<string, number>();
      for (let r = 0; r < nResp; r++) {
        const seed = svSeed + r * 7919;
        const pr = mulberry32(seed ^ 0x5bd1e995);
        const tr = mulberry32(seed ^ 0x2545f491);
        const wr = mulberry32(seed ^ 0x3c6ef372);
        const pid = `p${r}`;
        const careless = r < nCareless;
        const own = common.map((m) => m + spread * normal(pr));
        const base = 2500 * Math.exp(personSd * normal(tr));
        const fastFrom = careless ? Math.round(onset * budget) : Infinity;
        const slotFrom = careless ? Math.max(0, Math.min(budget, Math.round((onset + lag) * budget))) : Infinity;
        if (careless) carelessFrom.set(pid, Math.min(fastFrom, slotFrom));
        let n = 0, myWalk = 0;
        const slots: string[] = [];
        const ms: number[] = [];
        const chooser: Chooser = (a, b, _p, rand) => {
          slots.push(a);
          const i = n++;
          if (walk > 0 && i > 0) myWalk += walk * normal(wr);
          const quick = i >= fastFrom;
          const close = Math.exp(-Math.abs(own[idx.get(a)!] - own[idx.get(b)!]) / 0.25);
          ms.push((quick ? base * ratio : base * (1 + gamma * close)) * Math.exp(0.35 * normal(tr) + myWalk));
          let out: boolean | undefined;
          if (i >= slotFrom && rand() < q) out = true;
          else if (i >= Math.min(fastFrom, slotFrom) && rest === "random") out = rand() < 0.5;
          return out;
        };
        const res = simulate(routeStaged, items, budget, seed, 0, 0, 0, false, undefined, 0, undefined, (i) => own[i], chooser);
        answers.push(...res.history.map((h, i) => ({ participantId: pid, itemAId: slots[i], itemBId: slots[i] === h.picked ? h.other : h.picked, result: h.picked === slots[i] ? "A" : "B", ms: ms[i] })));
      }
      const counts = new Map<string, { participantId: string; first: number; second: number }>();
      for (const a of answers) {
        const c = counts.get(a.participantId) ?? counts.set(a.participantId, { participantId: a.participantId, first: 0, second: 0 }).get(a.participantId)!;
        if (a.result === "A") c.first++; else c.second++;
      }
      // What the route does: whole clickers out, then slot blocks; fastBlockStarts reads everyone not left out whole.
      const flags = slotFlags(answers, [...counts.values()]);
      const kept = answers.filter((a) => !flags.whole.has(a.participantId));
      const turns = fastBlockStarts(kept);
      const looseTurns = fastBlockStarts(kept, FAST_BLOCK_CURVE_Q, "auto", FAST_BLOCK_TREND_F, FAST_BLOCK_LATER_Q, FAST_BLOCK_NET_SHARE, 0);
      const atTurn = slotRunsAtTurns(kept, turns);
      const atLoose = slotRunsAtTurns(kept, looseTurns);
      const backFrom = new Map<string, number>();
      for (const [id, at] of flags.from) { const t = looseTurns.get(id); if (t !== undefined && t < at) backFrom.set(id, t); }
      const cutAt = (...maps: Map<string, number>[]) => (a: ReplayAnswer, i: number) => maps.some((m) => i >= (m.get(a.participantId) ?? Infinity));
      const play = (list: ReplayAnswer[], drop: (a: ReplayAnswer, i: number) => boolean) => ratingsWithoutAnswers(list, drop).rows;
      const add = (name: string, rows: ParticipantRatingRow[]) => (acc[name] ??= []).push(rank(ids, rows, common));
      add("slot", play(kept, cutAt(flags.from)));
      add("gated", play(kept, cutAt(flags.from, atTurn)));
      add("loose", play(kept, cutAt(flags.from, atLoose)));
      add("back", play(kept, cutAt(flags.from, atTurn, backFrom)));
      add("looseBack", play(kept, cutAt(flags.from, atLoose, backFrom)));
      add("oracle", play(answers, cutAt(carelessFrom)));
      for (let r = 0; r < nResp; r++) {
        const pid = `p${r}`;
        const s = flags.whole.has(pid) || flags.from.has(pid);
        if (carelessFrom.has(pid)) {
          det.n++;
          if (s) det.slot++;
          if (s || atTurn.has(pid)) det.gated++;
          if (s || atLoose.has(pid)) det.loose++;
          if (backFrom.has(pid)) {
            det.backMoved++;
            const on = carelessFrom.get(pid)!, from = backFrom.get(pid)!, was = flags.from.get(pid)!;
            if (from < on) det.backWrong++;
            backGain.push(Math.max(0, was - Math.max(from, on)));
            backLoss.push(Math.max(0, Math.min(on, was) - from));
          }
        } else {
          det.hn++;
          if (!s && atLoose.has(pid)) det.hLooseAdded++;
          if (!s && atTurn.has(pid)) det.hGatedAdded++;
          if (backFrom.has(pid)) det.hBackMoved++;
        }
      }
    }
    const cell: Record<string, unknown> = { seedBase, walk, q, ratio, lag, onset, rest, items, perItem: k, answers: budget, respondents: nResp, careless: share, surveys: nSurveys };
    const base = acc["slot"];
    for (const [name, v] of Object.entries(acc)) {
      const d = v.map((x, i) => x - base[i]);
      const md = mean(d);
      const se = d.length > 1 ? Math.sqrt(d.reduce((s2, x) => s2 + (x - md) ** 2, 0) / (d.length - 1) / d.length) : NaN;
      const g = acc["gated"], dg = v.map((x, i) => x - g[i]), mg = mean(dg);
      const seG = dg.length > 1 ? Math.sqrt(dg.reduce((s2, x) => s2 + (x - mg) ** 2, 0) / (dg.length - 1) / dg.length) : NaN;
      cell[name] = { rho: Number(mean(v).toFixed(4)), vsSlot: Number(md.toFixed(4)), se: Number(se.toFixed(4)), vsGated: Number(mg.toFixed(4)), seGated: Number(seG.toFixed(4)) };
    }
    const r3 = (x: number, n: number) => (n ? Number((x / n).toFixed(3)) : null);
    cell.detect = {
      carelessSlot: r3(det.slot, det.n), carelessGated: r3(det.gated, det.n), carelessLoose: r3(det.loose, det.n),
      backMoved: r3(det.backMoved, det.n), backBeforeOnset: r3(det.backWrong, det.backMoved),
      backGain: backGain.length ? Number(mean(backGain).toFixed(1)) : null, backLoss: backLoss.length ? Number(mean(backLoss).toFixed(1)) : null,
      honestGatedAdded: r3(det.hGatedAdded, det.hn), honestLooseAdded: r3(det.hLooseAdded, det.hn), honestBackMoved: r3(det.hBackMoved, det.hn), honestPeople: det.hn,
    };
    console.log(JSON.stringify(cell));
  }
}
