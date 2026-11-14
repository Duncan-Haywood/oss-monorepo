/**
 * A slot run and a fast block in the same person (flagship item d9;
 * docs/INFORMATION-GAIN-SELECTOR.md, "A slot run and a fast block in the same person").
 *
 * A bored respondent often does two things at once: they turn quick and they
 * click one screen position. The ranking's default reads only the slots
 * (slotFlags: a late run, Bonferroni over every start, a 70% share floor); the
 * time reading (fastBlockStarts) is a comparison behind ?drop=fast-blocks,
 * because under a wandering pace it flags some honest people. This asks whether
 * either reading finds such a person sooner when the other has, and measures one
 * way to let the default use the timing: test the slots from the fast turn on
 * as a single named candidate (slotRunsAtTurns), whose honest flag rate stays
 * bounded by alpha because the shuffle makes slots a fair coin whatever the
 * times were.
 *
 * Panels are the slot-block sweep's (common truth uniform on [-1, 1], personal
 * N(0, 0.25) deviation, the staged selector behind the route's slot shuffle),
 * timed as the answer-time sweep times them (person pace 2500 * exp(0.4 N);
 * honest answers slower on pairs close in their own taste, gamma 0.6; noise
 * exp(0.35 N); `--walk sd` adds a random walk of N(0, sd) log per answer to
 * everyone's pace). A share `--careless` of people answer honestly up to
 * `--onset` of their answers, then answer at `--ratio` x their pace; their slot
 * run starts `--lag` (share of the session; negative = before the speed-up)
 * after that, and in it they click the first slot on a share `--q` of answers.
 * Their other careless answers are a coin (`--rest random`, a bored person) or
 * honest (`--rest honest`, as the slot-block sweep had it).
 *
 * Schemes (Spearman with the truth, paired difference from `slot`, the default):
 *
 *   slot        the ranking's default today (slotFlags)
 *   fast        ?drop=fast-blocks: slotFlags, plus fastBlockStarts' cut
 *   gated       the default plus slotRunsAtTurns at fastBlockStarts' turns (cut from the turn)
 *   oracle      leave out exactly what the careless answered carelessly (from the earlier onset)
 *
 *   npx tsx scripts/slot-fast-joint-sweep.ts [--items 15,30] [--per-item 4] [--respondents 20] [--careless 0.25] [--onset 0.5] [--lag 0] [--q 1,0.6] [--ratio 0.4,0.7] [--rest random] [--walk 0,0.08] [--surveys 30] [--seed-base 9100]
 */
import { selectNextPairHybrid, type PairingInput } from "../src/lib/pairing";
import { simulate, spearman, type Chooser, type Policy } from "../src/lib/infoGainSim";
import { fastBlockStarts, groupRanking, ratingsWithoutAnswers, slotFlags, slotRunsAtTurns, type ParticipantRatingRow, type ReplayAnswer } from "../src/lib/groupRanking";

const argv = process.argv;
const opt = (name: string, d: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
const nums = (s: string) => s.split(",").map(Number);
const itemCounts = nums(opt("--items", "15,30"));
const perItem = nums(opt("--per-item", "4"));
const panels = nums(opt("--respondents", "20"));
const shares = nums(opt("--careless", "0.25"));
const onsets = nums(opt("--onset", "0.5"));
const lags = nums(opt("--lag", "0"));
const qs = nums(opt("--q", "1,0.6"));
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
    const det = { slot: 0, fast: 0, gated: 0, either: 0, gatedNew: 0, n: 0, hSlot: 0, hFast: 0, hGated: 0, hn: 0 };
    const lead: number[] = []; // answers kept by gated beyond slot's own cut, per careless person both flagged
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
      const atTurn = slotRunsAtTurns(kept, turns);
      const cutAt = (...maps: Map<string, number>[]) => (a: ReplayAnswer, i: number) => maps.some((m) => i >= (m.get(a.participantId) ?? Infinity));
      const play = (list: ReplayAnswer[], drop: (a: ReplayAnswer, i: number) => boolean) => ratingsWithoutAnswers(list, drop).rows;
      const add = (name: string, rows: ParticipantRatingRow[]) => (acc[name] ??= []).push(rank(ids, rows, common));
      add("slot", play(kept, cutAt(flags.from)));
      add("fast", play(kept, cutAt(flags.from, turns)));
      add("gated", play(kept, cutAt(flags.from, atTurn)));
      add("oracle", play(answers, cutAt(carelessFrom)));
      for (let r = 0; r < nResp; r++) {
        const pid = `p${r}`;
        const s = flags.whole.has(pid) || flags.from.has(pid), f = turns.has(pid), g = atTurn.has(pid);
        if (carelessFrom.has(pid)) {
          det.n++;
          if (s) det.slot++;
          if (f) det.fast++;
          if (s || g) det.gated++;
          if (s || f) det.either++;
          if (g && !s) det.gatedNew++;
          if (g && flags.from.has(pid)) lead.push(flags.from.get(pid)! - Math.min(flags.from.get(pid)!, atTurn.get(pid)!));
        } else {
          det.hn++;
          if (s) det.hSlot++;
          if (f) det.hFast++;
          if (g && !s) det.hGated++;
        }
      }
    }
    const cell: Record<string, unknown> = { walk, q, ratio, lag, onset, rest, items, perItem: k, answers: budget, respondents: nResp, careless: share, surveys: nSurveys };
    const base = acc["slot"];
    for (const [name, v] of Object.entries(acc)) {
      const d = v.map((x, i) => x - base[i]);
      const md = mean(d);
      const se = d.length > 1 ? Math.sqrt(d.reduce((s2, x) => s2 + (x - md) ** 2, 0) / (d.length - 1) / d.length) : NaN;
      cell[name] = { rho: Number(mean(v).toFixed(4)), vsSlot: Number(md.toFixed(4)), se: Number(se.toFixed(4)) };
    }
    const r3 = (x: number, n: number) => (n ? Number((x / n).toFixed(3)) : null);
    cell.detect = {
      carelessSlot: r3(det.slot, det.n), carelessFast: r3(det.fast, det.n), carelessGated: r3(det.gated, det.n), carelessEither: r3(det.either, det.n), gatedNew: r3(det.gatedNew, det.n),
      earlierBy: lead.length ? Number(mean(lead).toFixed(1)) : null,
      honestSlot: r3(det.hSlot, det.hn), honestFast: r3(det.hFast, det.hn), honestGatedAdded: r3(det.hGated, det.hn), honestPeople: det.hn,
    };
    console.log(JSON.stringify(cell));
  }
}
