/**
 * Answer times as a signal outside the answers: can they tell a careless block
 * from a genuine camp? (docs/INFORMATION-GAIN-SELECTOR.md, "Answer times:
 * telling a careless block from a camp").
 *
 * The careless-pattern sweep found that leave-one-out agreement cannot tell
 * people who pick by a shared wrong reason from a camp with a real second
 * taste (both score about the same), and that a careless majority is not
 * detectable from the answers at all. `Trial.msToAnswer` is stored for every
 * answer. This measures two timing signals, under timing assumptions that are
 * swept rather than trusted, and the pool schemes they would allow.
 *
 * Panels and patterns are the careless-pattern sweep's (common truth uniform on
 * [-1, 1], personal deviation N(0, `--spread`), salience independent of truth,
 * a share `--careless` answering by one pattern on every answer; `dissent` is a
 * camp with a second taste answering honestly).
 *
 * Timing model (milliseconds), all of it an assumption:
 *
 *   each person has a pace: base = 2500 * exp(`--person-sd` * N(0,1))
 *   honest answer   base * (1 + `--gamma` * exp(-|own[a] - own[b]| / 0.25)) * exp(0.35 N)
 *                   (slower on pairs that are close in their own taste; gamma 0
 *                   switches that off)
 *   careless answer base * `--ratio` * (1 + `--careless-gamma` * closeness) * exp(0.35 N)
 *                   closeness under the pattern's own key (salience for
 *                   salience pickers; none for random and first)
 *
 * Signals per person:
 *
 *   pace   their median time over the panel's median of medians
 *   slope  Spearman of their times with how close each pair is in the pool of
 *          everyone else's ratings (-|rating gap|); positive when they slow
 *          down where the panel finds the choice hard
 *
 * Pool schemes (each scored as the paired Spearman difference from shipped):
 *
 *   shipped      equal weights (what ships)
 *   loo-drop     leave out leave-one-out rho < 0.2 (the note's threshold)
 *   pace-drop    leave out pace < `--pace-min`
 *   loo-pace     leave out rho < 0.2 AND pace < `--pace-min`
 *   loo-slope    leave out rho < 0.2 AND slope < `--slope-min`
 *   oracle-drop  leave out the careless (for dissent: the camp; a ceiling only)
 *
 * Half-time carelessness (`--q` below 1, 2026-11-13): a careless person
 * answers by their pattern on a share q of picks and honestly on the rest
 * (the careless-pattern sweep's `--q`, same answer streams), with careless
 * answers timed as above and honest ones as an honest person's. Their median
 * time moves only part of the way, so two answer-level signals are added:
 *
 *   fastShare      share of their timed answers under `--fast-at` x the panel's median of medians
 *   selfFastShare  share under `--fast-at` x their own median
 *
 * and three schemes that leave out answers, not people (each person's Glicko
 * states replayed from the answers kept, as the route would have to):
 *
 *   share-drop       leave out people whose fastShare >= `--share-min`
 *   answer-drop      leave out every answer under `--fast-at` x the panel's median of medians
 *   self-answer-drop leave out every answer under `--fast-at` x the person's own median
 *   oracle-answers   leave out exactly the careless answers (a ceiling only)
 *
 * Carelessness that starts mid-session (`--onset f`, 2026-11-13, flagship item d):
 * a careless person answers honestly for their first share f of answers and by
 * their pattern (on a share q) from then on, as a bored or tired respondent
 * would. f = 0 draws nothing extra, so earlier rows reproduce. Honest people may
 * speed up as they learn the screen (`--drift d`: every answer's time is
 * multiplied by exp(-d * progress), progress 0 at the first answer and 1 at the
 * last; d = 0 by default), which is what a change-point cut must not mistake for
 * a block. Everyone's first `--warmup n` answers may take twice as long, as when
 * people read the instructions on the first few pairs (0 by default). Two schemes read each person's times as a sequence:
 *
 *   own-shift-drop find the one split of their log times that best separates an
 *                  earlier from a later mean (each side at least `--min-seg`
 *                  answers); when the later side is at least `--shift-min` faster
 *                  (log ratio) and the split's t statistic is over `--shift-t`,
 *                  leave out every answer after the split. Read against their
 *                  own start, so a shared warm-up looks like a block.
 *   shift-drop     what ships (groupRanking.ts fastBlockStarts): the same split,
 *                  with its fixed constants, on each answer's log time minus the
 *                  panel's log time at that position (the FAST_BLOCK_CURVE_Q
 *                  quantile, 0.5 until 2026-11-13 and 0.75 since; running median of 5; since 2026-11-13, last, passes after the first read the median of the people not yet flagged, `--later-q`).
 *                  Since 2026-11-13 later its gap threshold is per survey
 *                  (autoFastBlockMinLog) and a split must fit as a step, not a
 *                  line (stepOverTrend, FAST_BLOCK_TREND_F); rows before that
 *                  file (docs/fast-blocks-trend-2026-11-13.jsonl) used a fixed 0.5.
 *   shift-drop-qNN `--curve-q 0.NN`: the same against the 0.NN quantile, fixed 0.5 gap, no trend test
 *   shift-drop-auto-qNN-fNN[-cNN][-tfNN] `--auto q:floor[:cap[:trendF]]`: per-survey gap threshold
 *   shift-drop-tfNN `--trend-f f`: the fixed 0.5 gap with the step-over-line test at f
 *   `--person-drift sd`: each person's own speed-up or slow-down over the session, N(0, sd) log
 *   shift-drop-lNN `--later-q 0.NN`: the shipped reading with passes after the first at the 0.NN quantile
 *   shift-drop-nNN `--net-share 0.NN`: the shipped reading whose split must also leave a step net of the person's own line (stepNetOfTrend) of at least 0.NN x the gap threshold
 *   `--person-walk sd`: each person's pace also wanders as a random walk, N(0, sd) log per answer
 *
 * `--onset-spread s` (2026-11-13): each careless person's onset is drawn
 * uniform on onset +- s (clamped to 0.05-0.95), as real ones may be spread out.
 *   shift-or-fast  the union of shift-drop and answer-drop
 *
 *   npx tsx scripts/answer-time-sweep.ts [--onset 0] [--drift 0] [--warmup 0] [--min-seg 8] [--shift-min 0.5] [--shift-t 4] [--q 1] [--fast-at 0.5] [--share-min 0.3] [--items 15,30] [--per-item 4] [--respondents 20] [--careless 0.25,0.4,0.5] [--patterns salience,random,dissent] [--ratio 1,0.6,0.4] [--gamma 0.6] [--careless-gamma 0] [--person-sd 0.4] [--pace-min 0.6] [--slope-min 0.05] [--surveys 20] [--seed-base 4000] [--selector staged|standard]
 */
import { selectNextPair, selectNextPairHybrid, type PairingInput } from "../src/lib/pairing";
import { DEFAULT_GLICKO_STATE, applyComparison, type GlickoState } from "../src/lib/glicko2";
import { simulate, spearman, type Chooser, type Policy } from "../src/lib/infoGainSim";
import { autoFastBlockMinLog, FAST_BLOCK_LATER_Q, FAST_BLOCK_NET_SHARE, FAST_BLOCK_AUTO_CAP, FAST_BLOCK_AUTO_FLOOR, FAST_BLOCK_AUTO_Q, FAST_BLOCK_TREND_F, FAST_BLOCK_CURVE_Q, FAST_BLOCK_MIN_LOG, fastBlockSplit, fastBlockStarts, groupRanking, type RatingRow } from "../src/lib/groupRanking";

const argv = process.argv;
const opt = (name: string, d: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
const nums = (s: string) => (s === "" ? [] : s.split(",").map(Number));
const itemCounts = nums(opt("--items", "15,30"));
const perItem = nums(opt("--per-item", "4"));
const panels = nums(opt("--respondents", "20"));
const shares = nums(opt("--careless", "0.25,0.4,0.5"));
const patterns = opt("--patterns", "salience,random,dissent").split(",");
const ratios = nums(opt("--ratio", "1,0.6,0.4"));
const gammas = nums(opt("--gamma", "0.6"));
const carelessGamma = Number(opt("--careless-gamma", "0"));
const personSd = Number(opt("--person-sd", "0.4"));
const paceMin = Number(opt("--pace-min", "0.6"));
const slopeMin = Number(opt("--slope-min", "0.05"));
const nSurveys = Number(opt("--surveys", "20"));
const spread = Number(opt("--spread", "0.25"));
const seedBase = Number(opt("--seed-base", "4000"));
const qs = nums(opt("--q", "1"));
const fastAt = Number(opt("--fast-at", "0.5"));
const shareMin = Number(opt("--share-min", "0.3"));
const onsets = nums(opt("--onset", "0"));
const drift = Number(opt("--drift", "0"));
const warmup = Number(opt("--warmup", "0"));
const minSeg = Number(opt("--min-seg", "8"));
const shiftMin = Number(opt("--shift-min", "0.5"));
const shiftT = Number(opt("--shift-t", "4"));
const curveQs = nums(opt("--curve-q", "")).filter((x) => x > 0 && x < 1);
const onsetSpread = Number(opt("--onset-spread", "0"));
// `--auto q:floor[:cap],...` (2026-11-13, flagship item d2): a shift-drop-auto-qNN-fNN[-cNN] scheme per triple, reading fastBlockStarts
// with a per-survey gap threshold (autoFastBlockMinLog: the q quantile of the panel's mirrored slow-turn gaps, at least floor, at most
// cap, 0.5 unless given).
const autos = opt("--auto", "").split(",").filter(Boolean).map((x) => {
  const [q, f, c = FAST_BLOCK_MIN_LOG, tf = 0] = x.split(":").map(Number);
  if (!(q > 0 && q <= 1) || !(f > 0) || !(c >= f) || !(tf >= 0)) throw new Error(`--auto takes q:floor[:cap[:trendF]], got ${x}`);
  return { q, f, c, tf, key: `shift-drop-auto-q${Math.round(q * 100)}-f${Math.round(f * 100)}${c === FAST_BLOCK_MIN_LOG ? "" : `-c${Math.round(c * 100)}`}${tf ? `-tf${Math.round(tf * 10)}` : ""}` };
});
// `--person-drift sd`: each person also speeds up or slows down on their own over the session, by exp(-d x progress) with
// d ~ N(0, sd) per person (a stream of its own; 0 draws nothing). The panel curve cannot remove it; a fixed gap guards against it.
const personDrift = Number(opt("--person-drift", "0"));
// `--person-walk sd` (2026-11-13, flagship item d5): each person's pace also wanders as a random walk, adding N(0, sd) log
// at every answer (a stream of its own; 0 draws nothing). Unlike a straight-line drift it can hold a step of its own.
const personWalk = Number(opt("--person-walk", "0"));
// `--trend-f f,...`: a shift-drop-tfNN scheme per value, the shipped reading but a split must also fit as a step at least f
// (stepOverTrend) better than a straight line, so a steady personal speed-up is not taken for a block.
const trendFs = nums(opt("--trend-f", "")).filter((x) => x > 0);
// `--later-q q,...` (2026-11-13, flagship item d4): a shift-drop-lNN scheme per value, the shipped reading (0.75 curve, auto
// gap, step test) whose second and third passes read the q quantile of the people the last pass did not flag. 0.5 ships
// (FAST_BLOCK_LATER_Q), so shift-drop-l50 is shift-drop since; rows before it read 0.75 in every pass.
const laterQs = nums(opt("--later-q", "")).filter((x) => x > 0 && x < 1);
// `--net-share s,...` (2026-11-13, flagship item d5): a shift-drop-nNN scheme per value, the shipped reading whose split must
// also leave a step net of the person's own straight-line trend (stepNetOfTrend) of at least s x the gap threshold.
const netShares = nums(opt("--net-share", "")).filter((x) => x >= 0);
const LOO_MIN = 0.2;

/** Person-relative split (each person's log times against their own start), kept to show why the shipped rule reads against the panel. */
const ownBlockStart = (ms: number[]) => fastBlockSplit(ms.map((v) => Math.log(v)), minSeg, shiftMin, shiftT);

const variantKeys = [...curveQs.map((cq) => `shift-drop-q${Math.round(cq * 100)}`), ...autos.map((a) => a.key), ...trendFs.map((f) => `shift-drop-tf${Math.round(f * 10)}`), ...laterQs.map((lq) => `shift-drop-l${Math.round(lq * 100)}`), ...netShares.map((ns) => `shift-drop-n${Math.round(ns * 100)}`)];

/**
 * fastBlockStarts with a per-survey gap threshold, for people who all answered in order with every answer timed (as
 * here): the same curve, smoothing and passes, with each pass's threshold from autoFastBlockMinLog. Kept beside the
 * library's own "auto" so the sweep can try other q and floor values; with the shipped ones the two agree (checked below).
 */
function autoBlockStarts(seqs: number[][], q: number, floor: number, cap: number, trendF = 0): { at: (number | null)[]; minLog: number } {
  const longest = Math.max(...seqs.map((s) => s.length));
  const splits: (number | null)[] = seqs.map(() => null);
  let minLog = FAST_BLOCK_MIN_LOG;
  for (let pass = 0; pass < 3; pass++) {
    const atPos: number[] = [];
    for (let i = 0; i < longest; i++) {
      const v = seqs.filter((s, j) => s.length > i && i < (splits[j] ?? Infinity)).map((s) => Math.log(s[i])).sort((a, b) => a - b);
      const h = (v.length - 1) * (pass === 0 ? FAST_BLOCK_CURVE_Q : FAST_BLOCK_LATER_Q), lo = Math.floor(h);
      atPos.push(v.length ? (lo + 1 < v.length ? v[lo] + (h - lo) * (v[lo + 1] - v[lo]) : v[lo]) : NaN);
    }
    const curve = atPos.map((_, i) => median(atPos.slice(Math.max(0, i - 2), i + 3).filter(Number.isFinite)));
    const res = seqs.map((s) => s.map((ms, i) => Math.log(ms) - curve[i]));
    minLog = autoFastBlockMinLog(res, q, floor, cap) ?? FAST_BLOCK_MIN_LOG;
    const next = res.map((x) => fastBlockSplit(x, 8, minLog, 4, trendF, FAST_BLOCK_NET_SHARE));
    const same = next.every((k, j) => k === splits[j]);
    next.forEach((k, j) => (splits[j] = k));
    if (same) break;
  }
  return { at: splits, minLog };
}

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const median = (v: number[]) => {
  const s = v.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
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

/** `--selector staged|standard`: which pair selector everyone runs (staged unless named). */
const selectorName = opt("--selector", "staged");
if (selectorName !== "staged" && selectorName !== "standard") throw new Error(`--selector must be staged or standard, got ${selectorName}`);
const choose = selectorName === "standard" ? selectNextPair : selectNextPairHybrid;

/** The chosen selector with the route's slot shuffle (src/app/api/trials/next/route.ts). */
const routeStaged: Policy = (input: PairingInput) => {
  const [a, b] = choose({ ...input, answerAgreement: undefined });
  return (input.rand ?? Math.random)() < 0.5 ? [a, b] : [b, a];
};

type Shown = { a: string; b: string; ms: number; careless: boolean };
type Answer = { picked: string; other: string };
type Person = { qBlockAt: Record<string, number | null>; blockAt: number | null; ownBlockAt: number | null; careless: boolean; rows: RatingRow[]; shown: Shown[]; answers: Answer[]; loo: number; pace: number; slope: number; fastShare: number; selfFastShare: number; ownMedian: number };

/** Each item's Glicko state from the kept answers, replayed in order from the default (what the route stores, minus the dropped answers). */
function replay(ids: string[], answers: Answer[], keep: (i: number) => boolean): RatingRow[] {
  const st = new Map<string, GlickoState>(ids.map((id) => [id, { ...DEFAULT_GLICKO_STATE }]));
  answers.forEach((ans, i) => {
    if (!keep(i)) return;
    const { a, b } = applyComparison(st.get(ans.picked)!, st.get(ans.other)!, "A");
    st.set(ans.picked, a);
    st.set(ans.other, b);
  });
  return [...st].map(([itemId, s]) => ({ itemId, rating: s.rating, rd: s.rd }));
}

const answeredRows = (rows: RatingRow[]) => rows.filter((r) => r.rd < DEFAULT_GLICKO_STATE.rd - 1e-9);

function pooled(items: string[], people: { rows: RatingRow[]; keep: boolean }[]) {
  const rows: RatingRow[] = [];
  for (const p of people) if (p.keep) rows.push(...p.rows);
  return groupRanking(items.map((id) => ({ id, label: id })), rows);
}

function score(items: string[], truth: number[], ranked: ReturnType<typeof groupRanking>) {
  const byId = new Map(ranked.map((r) => [r.itemId, r]));
  let clear = 0, wrong = 0;
  for (let i = 0; i < items.length; i++) {
    for (let j = 0; j < items.length; j++) {
      if (i === j) continue;
      const a = byId.get(items[i])!, b = byId.get(items[j])!;
      if (a.low > b.high) {
        clear++;
        if (truth[i] < truth[j]) wrong++;
      }
    }
  }
  return { rho: spearman(truth, items.map((id) => byId.get(id)!.rating)), clear, wrong };
}

function auc(hi: number[], lo: number[]): number {
  if (!hi.length || !lo.length) return NaN;
  let s = 0;
  for (const h of hi) for (const c of lo) s += h > c ? 1 : h === c ? 0.5 : 0;
  return s / (hi.length * lo.length);
}
const share = (v: boolean[]) => (v.length ? Number((v.filter(Boolean).length / v.length).toFixed(3)) : null);

for (const onset of onsets) for (const q of qs) for (const pattern of patterns) {
  if (pattern === "dissent" && (q !== qs[0] || onset !== onsets[0])) continue; // q and onset have no meaning for a camp answering honestly
  for (const ratio of ratios) {
    for (const gamma of gammas) {
      for (const items of itemCounts) {
        for (const k of perItem) {
          for (const nResp of panels) {
            for (const frac of shares) {
              const budget = items * k;
              const nCareless = Math.round(frac * nResp);
              const acc: Record<string, { rho: number[]; clear: number; wrong: number }> = {};
              const sig = { paceH: [] as number[], paceC: [] as number[], slopeH: [] as number[], slopeC: [] as number[], shareH: [] as number[], shareC: [] as number[], selfH: [] as number[], selfC: [] as number[] };
              let replayMismatch = 0;
              const blocks = { h: [] as boolean[], c: [] as boolean[] };
              const qBlocks: Record<string, { h: boolean[]; c: boolean[] }> = {};
              const autoMinLogs: Record<string, number[]> = {};
              const answerFlags: Record<string, { h: number; hn: number; c: number; cn: number }> = {};
              const flags: Record<string, { h: boolean[]; c: boolean[] }> = {};
              for (let sv = 0; sv < nSurveys; sv++) {
                const svSeed = seedBase + sv * 104729 + items * 31 + k;
                const sr = mulberry32(svSeed);
                const common = Array.from({ length: items }, () => sr() * 2 - 1);
                const salience = Array.from({ length: items }, () => sr() * 2 - 1);
                const camp = Array.from({ length: items }, () => sr() * 2 - 1);
                const target = pattern === "dissent" ? common.map((m, i) => (1 - nCareless / nResp) * m + (nCareless / nResp) * camp[i]) : common;
                const ids = common.map((_, i) => `item-${String(i).padStart(3, "0")}`);
                const idx = new Map(ids.map((id, i) => [id, i]));
                const people: Person[] = [];
                for (let r = 0; r < nResp; r++) {
                  const seed = svSeed + r * 7919;
                  const pr = mulberry32(seed ^ 0x5bd1e995);
                  const tr = mulberry32(seed ^ 0x2545f491); // timing draws only, so answers match the careless-pattern sweep's streams
                  const careless = r < nCareless;
                  const isCareless = careless && pattern !== "dissent";
                  const own = (careless && pattern === "dissent" ? camp : common).map((m) => m + spread * normal(pr));
                  const base = 2500 * Math.exp(personSd * normal(tr));
                  const myDrift = personDrift > 0 ? personDrift * normal(mulberry32(seed ^ 0x68e31da4)) : 0;
                  const walkRand = personWalk > 0 ? mulberry32(seed ^ 0x3c6ef372) : null;
                  let myWalk = 0;
                  const shown: Shown[] = [];
                  const pick: Chooser | undefined = !isCareless
                    ? undefined
                    : pattern === "random"
                      ? (_a, _b, _p, rand) => rand() < 0.5
                      : pattern === "first"
                        ? () => true
                        : (a, b, _p, rand) => rand() < 1 / (1 + Math.exp(-2 * (salience[idx.get(a)!] - salience[idx.get(b)!])));
                  // q < 1 draws as the careless-pattern sweep's `--q` does; q = 1 draws nothing extra, so the 2026-11-12 rows reproduce.
                  const qChooser: Chooser | undefined = !pick ? undefined : q >= 1 ? pick : (a, b, p, rand) => (rand() < q ? pick(a, b, p, rand) : undefined);
                  // Onset: honest for the first share `onset` of answers (no draw, so onset 0 reproduces earlier rows).
                  // `--onset-spread s`: each person's onset drawn uniform on onset +- s (from a stream of its own, so s = 0 draws nothing).
                  const myOnset = onsetSpread > 0 && onset > 0 ? Math.min(0.95, Math.max(0.05, onset + onsetSpread * (2 * mulberry32(seed ^ 0x1b873593)() - 1))) : onset;
                  const careChooser: Chooser | undefined = !qChooser || myOnset <= 0 ? qChooser : (a, b, p, rand) => (shown.length < myOnset * budget ? undefined : qChooser(a, b, p, rand));
                  const chooser: Chooser = (a, b, p, rand) => {
                    const ia = idx.get(a)!, ib = idx.get(b)!;
                    const out = careChooser?.(a, b, p, rand);
                    let ms: number;
                    if (out === undefined) ms = base * (1 + gamma * Math.exp(-Math.abs(own[ia] - own[ib]) / 0.25));
                    else {
                      const close = pattern === "salience" ? Math.exp(-Math.abs(salience[ia] - salience[ib]) / 0.25) : 0;
                      ms = base * ratio * (1 + carelessGamma * close);
                    }
                    const progress = budget > 1 ? shown.length / (budget - 1) : 0;
                    const warm = shown.length < warmup ? 2 : 1; // the first `--warmup` answers take twice as long (reading the instructions)
                    if (walkRand && shown.length > 0) myWalk += personWalk * normal(walkRand);
                    shown.push({ a, b, ms: warm * ms * Math.exp(0.35 * normal(tr) - (drift + myDrift) * progress + myWalk), careless: out !== undefined });
                    return out;
                  };
                  const res = simulate(routeStaged, items, budget, seed, 0, 0, 0, false, undefined, 0, undefined, (i) => own[i], chooser);
                  const rows = [...res.states].map(([itemId, s]) => ({ itemId, rating: s.rating, rd: s.rd }));
                  const answers = res.history.map((h) => ({ picked: h.picked, other: h.other }));
                  if (sv === 0 && r < 3) {
                    // The replay must reproduce simulate's own states when every answer is kept.
                    const back = new Map(replay(ids, answers, () => true).map((x) => [x.itemId, x]));
                    if (rows.some((x) => Math.abs(back.get(x.itemId)!.rating - x.rating) > 1e-6)) replayMismatch++;
                  }
                  people.push({ qBlockAt: {}, blockAt: null, ownBlockAt: null, careless, rows, shown, answers, loo: NaN, pace: NaN, slope: NaN, fastShare: NaN, selfFastShare: NaN, ownMedian: NaN });
                }
                const medians = people.map((p) => median(p.shown.map((s) => s.ms)));
                // The shipped reading (groupRanking.ts fastBlockStarts): each answer against the panel's time at that point in the session.
                const starts = fastBlockStarts(people.flatMap((p, i) => p.shown.map((s) => ({ participantId: `p${i}`, ms: s.ms }))));
                people.forEach((p, i) => (p.blockAt = starts.get(`p${i}`) ?? null));
                // `--curve-q`: the same reading against an upper quantile of the panel's times at each position, which a
                // large share turning quick at once drags down less than the median.
                for (const cq of curveQs) {
                  const st = fastBlockStarts(people.flatMap((p, i) => p.shown.map((s) => ({ participantId: `p${i}`, ms: s.ms }))), cq, FAST_BLOCK_MIN_LOG, 0, cq, 0);
                  people.forEach((p, i) => (p.qBlockAt[`shift-drop-q${Math.round(cq * 100)}`] = st.get(`p${i}`) ?? null));
                }
                for (const f of trendFs) {
                  const st = fastBlockStarts(people.flatMap((p, i) => p.shown.map((s) => ({ participantId: `p${i}`, ms: s.ms }))), FAST_BLOCK_CURVE_Q, FAST_BLOCK_MIN_LOG, f, FAST_BLOCK_CURVE_Q, 0);
                  people.forEach((p, i) => (p.qBlockAt[`shift-drop-tf${Math.round(f * 10)}`] = st.get(`p${i}`) ?? null));
                }
                for (const lq of laterQs) {
                  const st = fastBlockStarts(people.flatMap((p, i) => p.shown.map((s) => ({ participantId: `p${i}`, ms: s.ms }))), FAST_BLOCK_CURVE_Q, "auto", FAST_BLOCK_TREND_F, lq, 0);
                  people.forEach((p, i) => (p.qBlockAt[`shift-drop-l${Math.round(lq * 100)}`] = st.get(`p${i}`) ?? null));
                }
                for (const ns of netShares) {
                  const st = fastBlockStarts(people.flatMap((p, i) => p.shown.map((s) => ({ participantId: `p${i}`, ms: s.ms }))), FAST_BLOCK_CURVE_Q, "auto", FAST_BLOCK_TREND_F, FAST_BLOCK_LATER_Q, ns);
                  people.forEach((p, i) => (p.qBlockAt[`shift-drop-n${Math.round(ns * 100)}`] = st.get(`p${i}`) ?? null));
                }
                for (const a of autos) {
                  const st = autoBlockStarts(people.map((p) => p.shown.map((s) => s.ms)), a.q, a.f, a.c, a.tf);
                  people.forEach((p, i) => (p.qBlockAt[a.key] = st.at[i]));
                  (autoMinLogs[a.key] ??= []).push(st.minLog);
                  if (a.q === FAST_BLOCK_AUTO_Q && a.f === FAST_BLOCK_AUTO_FLOOR && a.c === FAST_BLOCK_AUTO_CAP && a.tf === FAST_BLOCK_TREND_F) {
                    // With the shipped q and floor, this must agree with the library's own "auto" reading.
                    const lib = fastBlockStarts(people.flatMap((p, i) => p.shown.map((s) => ({ participantId: `p${i}`, ms: s.ms }))));
                    if (people.some((_, i) => (lib.get(`p${i}`) ?? null) !== st.at[i])) throw new Error(`autoBlockStarts disagrees with fastBlockStarts(..., "auto") in survey ${sv}`);
                  }
                }
                const panelPace = median(medians);
                for (let i = 0; i < people.length; i++) {
                  const p = people[i];
                  const others = pooled(ids, people.map((o, j) => ({ rows: o.rows, keep: j !== i })));
                  const oth = new Map(others.map((o) => [o.itemId, o.rating]));
                  const mine = answeredRows(p.rows);
                  p.loo = mine.length >= 3 ? spearman(mine.map((m) => m.rating), mine.map((m) => oth.get(m.itemId)!)) : 0;
                  if (!Number.isFinite(p.loo)) p.loo = 0;
                  p.pace = medians[i] / panelPace;
                  p.ownMedian = medians[i];
                  p.fastShare = p.shown.filter((s) => s.ms < fastAt * panelPace).length / p.shown.length;
                  p.selfFastShare = p.shown.filter((s) => s.ms < fastAt * medians[i]).length / p.shown.length;
                  (p.careless ? sig.shareC : sig.shareH).push(p.fastShare);
                  (p.careless ? sig.selfC : sig.selfH).push(p.selfFastShare);
                  p.slope = spearman(p.shown.map((s) => s.ms), p.shown.map((s) => -Math.abs(oth.get(s.a)! - oth.get(s.b)!)));
                  if (!Number.isFinite(p.slope)) p.slope = 0;
                  p.ownBlockAt = ownBlockStart(p.shown.map((s) => s.ms));
                  (p.careless ? sig.paceC : sig.paceH).push(p.pace);
                  (p.careless ? sig.slopeC : sig.slopeH).push(p.slope);
                }
                const rules: Record<string, (p: Person) => boolean> = {
                  "loo-drop": (p) => p.loo < LOO_MIN,
                  "pace-drop": (p) => p.pace < paceMin,
                  "loo-pace": (p) => p.loo < LOO_MIN && p.pace < paceMin,
                  "loo-slope": (p) => p.loo < LOO_MIN && p.slope < slopeMin,
                  "share-drop": (p) => p.fastShare >= shareMin,
                  "oracle-drop": (p) => p.careless,
                };
                // Answer-level schemes: keep every person, leave out some of their answers.
                const answerRules: Record<string, (p: Person, s: Shown) => boolean> = {
                  "answer-drop": (_p, s) => s.ms < fastAt * panelPace,
                  "self-answer-drop": (p, s) => s.ms < fastAt * p.ownMedian,
                  "own-shift-drop": (p, s) => p.ownBlockAt !== null && p.shown.indexOf(s) >= p.ownBlockAt,
                  "shift-drop": (p, s) => p.blockAt !== null && p.shown.indexOf(s) >= p.blockAt,
                  "shift-or-fast": (p, s) => s.ms < fastAt * panelPace || (p.blockAt !== null && p.shown.indexOf(s) >= p.blockAt),
                  "oracle-answers": (_p, s) => s.careless,
                };
                for (const key of variantKeys) {
                  answerRules[key] = (p, s) => p.qBlockAt[key] != null && p.shown.indexOf(s) >= p.qBlockAt[key]!;
                }
                for (const p of people) (p.careless ? blocks.c : blocks.h).push(p.blockAt !== null);
                for (const key of variantKeys) {
                  const b = (qBlocks[key] ??= { h: [], c: [] });
                  for (const p of people) (p.careless ? b.c : b.h).push(p.qBlockAt[key] != null);
                }
                const add = (name: string, s: { rho: number; clear: number; wrong: number }) => {
                  acc[name] ??= { rho: [], clear: 0, wrong: 0 };
                  acc[name].rho.push(s.rho);
                  acc[name].clear += s.clear;
                  acc[name].wrong += s.wrong;
                };
                add("shipped", score(ids, target, pooled(ids, people.map((p) => ({ rows: p.rows, keep: true })))));
                for (const [name, drop] of Object.entries(rules)) {
                  add(name, score(ids, target, pooled(ids, people.map((p) => ({ rows: p.rows, keep: !drop(p) })))));
                  flags[name] ??= { h: [], c: [] };
                  for (const p of people) (p.careless ? flags[name].c : flags[name].h).push(drop(p));
                }
                for (const [name, drop] of Object.entries(answerRules)) {
                  const rows = people.map((p) => ({ rows: replay(ids, p.answers, (i) => !drop(p, p.shown[i])), keep: true }));
                  add(name, score(ids, target, pooled(ids, rows)));
                  const f = (answerFlags[name] ??= { h: 0, hn: 0, c: 0, cn: 0 });
                  for (const p of people) for (const s of p.shown) {
                    // Answers, not people: an honest answer is any answer given honestly, including a half-time careless person's.
                    if (s.careless) { f.cn++; if (drop(p, s)) f.c++; } else { f.hn++; if (drop(p, s)) f.h++; }
                  }
                }
              }
              if (replayMismatch) throw new Error(`replay did not reproduce simulate's states (${replayMismatch} people)`);
              const cell: Record<string, unknown> = { pattern, q: pattern === "dissent" ? null : q, onset: pattern === "dissent" ? null : onset, ...(onsetSpread > 0 ? { onsetSpread } : {}), ...(personDrift > 0 ? { personDrift } : {}), ...(personWalk > 0 ? { personWalk } : {}), drift, warmup, ratio, gamma, carelessGamma, personSd, items, perItem: k, respondents: nResp, careless: frac, surveys: nSurveys };
              const base = acc["shipped"].rho;
              for (const [name, a] of Object.entries(acc)) {
                const d = a.rho.map((x, i) => x - base[i]);
                const md = mean(d);
                const se = d.length > 1 ? Math.sqrt(d.reduce((s2, x) => s2 + (x - md) ** 2, 0) / (d.length - 1) / d.length) : NaN;
                cell[name] = {
                  rho: Number(mean(a.rho).toFixed(4)),
                  vsShipped: Number(md.toFixed(4)),
                  se: Number(se.toFixed(4)),
                  wrongShare: Number((a.clear ? a.wrong / a.clear : 0).toFixed(4)),
                  ...(flags[name] ? { flagHonest: share(flags[name].h), flagCareless: share(flags[name].c) } : {}),
                  ...(answerFlags[name] ? { answersDroppedHonest: Number((answerFlags[name].h / Math.max(1, answerFlags[name].hn)).toFixed(3)), answersDroppedCareless: answerFlags[name].cn ? Number((answerFlags[name].c / answerFlags[name].cn).toFixed(3)) : null } : {}),
                };
              }
              cell.detect = {
                // Honest (or the majority, for dissent) over careless (or the camp): above 0.5 means the signal separates them.
                paceAuc: Number(auc(sig.paceH, sig.paceC).toFixed(3)),
                slopeAuc: Number(auc(sig.slopeH, sig.slopeC).toFixed(3)),
                // Fast-answer share: higher means faster, so careless over honest.
                blockFoundHonest: share(blocks.h),
                blockFoundCareless: share(blocks.c),
                ...Object.fromEntries(Object.entries(qBlocks).flatMap(([k, b]) => [[`${k}FoundHonest`, share(b.h)], [`${k}FoundCareless`, share(b.c)]])),
                ...Object.fromEntries(Object.entries(autoMinLogs).map(([k, v]) => [`${k}MinLog`, { median: Number(median(v).toFixed(3)), min: Number(Math.min(...v).toFixed(3)), max: Number(Math.max(...v).toFixed(3)) }])),
                fastShareAuc: Number(auc(sig.shareC, sig.shareH).toFixed(3)),
                selfFastShareAuc: Number(auc(sig.selfC, sig.selfH).toFixed(3)),
                fastShareHonestMedian: Number(median(sig.shareH).toFixed(3)),
                fastShareCarelessMedian: sig.shareC.length ? Number(median(sig.shareC).toFixed(3)) : null,
                paceHonestMedian: Number(median(sig.paceH).toFixed(3)),
                paceCarelessMedian: sig.paceC.length ? Number(median(sig.paceC).toFixed(3)) : null,
                slopeHonestMean: Number(mean(sig.slopeH).toFixed(3)),
                slopeCarelessMean: sig.slopeC.length ? Number(mean(sig.slopeC).toFixed(3)) : null,
              };
              console.log(JSON.stringify(cell));
            }
          }
        }
      }
    }
  }
}
