/**
 * Position bias that starts partway through a session (flagship item d3;
 * docs/INFORMATION-GAIN-SELECTOR.md, "Clicking one position from partway through").
 *
 * The ranking route leaves out slot clickers (groupRanking.ts slotClickers): a
 * first-slot share at or beyond 70% either way over the whole session. A person
 * who answers on the options for a while and then clicks one position is diluted
 * by their own honest start, and whatever they clicked after it still counts.
 * slotBlockStarts reads each person's slot sequence for a late run instead and
 * leaves out the answers from its start on.
 *
 * Panels are the careless-pattern sweep's (common truth uniform on [-1, 1], a
 * personal N(0, `--spread`) deviation, the staged selector behind the route's
 * slot shuffle). A share `--careless` of people answer honestly for their first
 * share `--onset` of answers and then, on a share `--q` of answers, pick the
 * slot named by `--slot` (first or second); f = 0 is a whole-session clicker.
 * `--onset-spread s` draws each careless person's onset uniformly within +-s of it.
 * `--careless 0` measures the cost on honest panels; `--dissent` adds a camp
 * (a second taste, honest on slots) of that share instead, scored against the
 * panel's average taste, which a slot test must leave alone.
 *
 * Schemes (Spearman with the truth, paired difference from shipped over surveys):
 *
 *   none           every answer counts
 *   shipped        slotClickers leaves people out (what ships today)
 *   blocks         shipped, then slotBlockStarts on everyone left (the candidate)
 *   blocks-only    slotBlockStarts alone, in place of slotClickers
 *   union          what the ranking route does (groupRanking.ts slotFlags): slotBlockStarts
 *                  where it finds a run starting after SLOT_BLOCK_MIN_KEPT answers (answers
 *                  from its start on left out); slotClickers' whole-person drop for the rest
 *   oracle-answers leave out exactly the careless answers' block (a ceiling)
 *   oracle-drop    leave out the careless people
 *
 * Detection: the share of careless people slotBlockStarts flags, how far its start
 * lands from the true onset (in answers, mean absolute), and the share of honest
 * people it flags (bounded by SLOT_BLOCK_ALPHA).
 *
 *   npx tsx scripts/slot-block-sweep.ts [--items 15,30] [--per-item 4] [--respondents 20] [--careless 0.1,0.25] [--onset 0,0.25,0.5,0.75] [--q 1,0.8] [--slot first] [--surveys 30] [--seed-base 7100] [--alpha 0.01] [--min-block 15] [--onset-spread 0] [--dissent]
 */
import { selectNextPairHybrid, type PairingInput } from "../src/lib/pairing";
import { simulate, spearman, type Chooser, type Policy } from "../src/lib/infoGainSim";
import { groupRanking, ratingsWithoutAnswers, slotBlockStarts, slotClickers, slotFlags, type ParticipantRatingRow, type ReplayAnswer } from "../src/lib/groupRanking";

const argv = process.argv;
const opt = (name: string, d: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : d);
const nums = (s: string) => s.split(",").map(Number);
const itemCounts = nums(opt("--items", "15,30"));
const perItem = nums(opt("--per-item", "4"));
const panels = nums(opt("--respondents", "20"));
const shares = nums(opt("--careless", "0.1,0.25"));
const onsets = nums(opt("--onset", "0,0.25,0.5,0.75"));
const qs = nums(opt("--q", "1,0.8"));
const slot = opt("--slot", "first");
if (slot !== "first" && slot !== "second") throw new Error(`--slot must be first or second, got ${slot}`);
const nSurveys = Number(opt("--surveys", "30"));
const seedBase = Number(opt("--seed-base", "7100"));
const alpha = Number(opt("--alpha", "0.01"));
const minBlock = Number(opt("--min-block", "15"));
const onsetSpread = Number(opt("--onset-spread", "0"));
const dissent = argv.includes("--dissent");
const spread = 0.25;

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

/** The staged selector with the route's slot shuffle (src/app/api/trials/next/route.ts). */
const routeStaged: Policy = (input: PairingInput) => {
  const [a, b] = selectNextPairHybrid({ ...input, answerAgreement: undefined });
  return (input.rand ?? Math.random)() < 0.5 ? [a, b] : [b, a];
};

function rank(items: string[], rows: ParticipantRatingRow[], target: number[]): number {
  const ranked = groupRanking(items.map((id) => ({ id, label: id })), rows, "overlap", { answeredOnly: true });
  const by = new Map(ranked.map((r) => [r.itemId, r.rating]));
  return spearman(target, items.map((id) => by.get(id)!));
}

let checked = false;
for (const q of qs) {
  for (const onset of onsets) {
    for (const items of itemCounts) {
      for (const k of perItem) {
        for (const nResp of panels) {
          for (const share of shares) {
            if (share === 0 && (onset !== onsets[0] || q !== qs[0])) continue; // honest panels do not depend on onset or q
            const budget = items * k;
            const nCareless = Math.round(share * nResp);
            const acc: Record<string, number[]> = {};
            let found = 0, nC = 0, flagH = 0, nH = 0, clickerC = 0, clickerH = 0;
            const startErr: number[] = [];
            for (let sv = 0; sv < nSurveys; sv++) {
              const svSeed = seedBase + sv * 104729 + items * 31 + k;
              const sr = mulberry32(svSeed);
              const common = Array.from({ length: items }, () => sr() * 2 - 1);
              const camp = Array.from({ length: items }, () => sr() * 2 - 1);
              const target = dissent ? common.map((m, i) => (1 - nCareless / nResp) * m + (nCareless / nResp) * camp[i]) : common;
              const ids = common.map((_, i) => `item-${String(i).padStart(3, "0")}`);
              const answers: ReplayAnswer[] = [];
              const carelessFrom = new Map<string, number>();
              for (let r = 0; r < nResp; r++) {
                const seed = svSeed + r * 7919;
                const pr = mulberry32(seed ^ 0x5bd1e995);
                const pid = `p${r}`;
                const special = r < nCareless;
                const careless = special && !dissent;
                const own = (special && dissent ? camp : common).map((m) => m + spread * normal(pr));
                const f = Math.min(1, Math.max(0, onset + (onsetSpread > 0 ? (pr() * 2 - 1) * onsetSpread : 0)));
                const from = careless ? Math.round(f * budget) : Infinity;
                if (careless) carelessFrom.set(pid, from);
                let n = 0;
                const slots: string[] = [];
                const chooser: Chooser = (a, _b, _p, rand) => {
                  slots.push(a);
                  const i = n++;
                  if (i < from) return undefined;
                  return rand() < q ? slot === "first" : undefined;
                };
                const res = simulate(routeStaged, items, budget, seed, 0, 0, 0, false, undefined, 0, undefined, (i) => own[i], chooser);
                const mine: ReplayAnswer[] = res.history.map((h, i) => ({ participantId: pid, itemAId: slots[i], itemBId: slots[i] === h.picked ? h.other : h.picked, result: h.picked === slots[i] ? "A" : "B", ms: null }));
                if (!checked) {
                  // The replay must rebuild exactly what the simulation stored.
                  const rows = ratingsWithoutAnswers(mine, () => false).rows;
                  for (const row of rows) {
                    const st = res.states.get(row.itemId)!;
                    if (Math.abs(st.rating - row.rating) > 1e-6 || Math.abs(st.rd - row.rd) > 1e-6) throw new Error("replay does not reproduce the simulation's states");
                  }
                  checked = true;
                }
                answers.push(...mine);
              }
              const counts = new Map<string, { participantId: string; first: number; second: number }>();
              for (const a of answers) {
                const c = counts.get(a.participantId) ?? counts.set(a.participantId, { participantId: a.participantId, first: 0, second: 0 }).get(a.participantId)!;
                if (a.result === "A") c.first++; else c.second++;
              }
              const clickers = slotClickers([...counts.values()]);
              const blocksAll = slotBlockStarts(answers, alpha, minBlock);
              const unclicked = answers.filter((a) => !clickers.has(a.participantId));
              const blocksRest = slotBlockStarts(unclicked, alpha, minBlock);
              for (let r = 0; r < nResp; r++) {
                const pid = `p${r}`;
                if (carelessFrom.has(pid)) {
                  nC++;
                  if (clickers.has(pid)) clickerC++;
                  if (blocksAll.has(pid)) { found++; startErr.push(Math.abs(blocksAll.get(pid)! - carelessFrom.get(pid)!)); }
                } else {
                  nH++;
                  if (clickers.has(pid)) clickerH++;
                  if (blocksAll.has(pid)) flagH++;
                }
              }
              const play = (list: ReplayAnswer[], drop: (a: ReplayAnswer, i: number) => boolean) => ratingsWithoutAnswers(list, drop).rows;
              const add = (name: string, rows: ParticipantRatingRow[]) => (acc[name] ??= []).push(rank(ids, rows, target));
              add("shipped", play(unclicked, () => false));
              add("none", play(answers, () => false));
              add("blocks", play(unclicked, (a, i) => i >= (blocksRest.get(a.participantId) ?? Infinity)));
              add("blocks-only", play(answers, (a, i) => i >= (blocksAll.get(a.participantId) ?? Infinity)));
              const flags = slotFlags(answers, [...counts.values()]); // what the ranking route does
              add("union", play(answers.filter((a) => !flags.whole.has(a.participantId)), (a, i) => i >= (flags.from.get(a.participantId) ?? Infinity)));
              add("oracle-answers", play(answers, (a, i) => i >= (carelessFrom.get(a.participantId) ?? Infinity)));
              add("oracle-drop", play(answers.filter((a) => !carelessFrom.has(a.participantId)), () => false));
            }
            const cell: Record<string, unknown> = { slot, q, onset, onsetSpread, items, perItem: k, answers: budget, respondents: nResp, careless: share, dissent, surveys: nSurveys, alpha, minBlock };
            const base = acc["shipped"];
            for (const [name, v] of Object.entries(acc)) {
              const d = v.map((x, i) => x - base[i]);
              const md = mean(d);
              const se = d.length > 1 ? Math.sqrt(d.reduce((s2, x) => s2 + (x - md) ** 2, 0) / (d.length - 1) / d.length) : NaN;
              cell[name] = { rho: Number(mean(v).toFixed(4)), vsShipped: Number(md.toFixed(4)), se: Number(se.toFixed(4)) };
            }
            cell.detect = {
              carelessFound: nC ? Number((found / nC).toFixed(3)) : null,
              startErrAnswers: startErr.length ? Number(mean(startErr).toFixed(1)) : null,
              honestFlagged: Number((flagH / Math.max(nH, 1)).toFixed(4)),
              honestFlags: flagH,
              honestPeople: nH,
              carelessClickers: nC ? Number((clickerC / nC).toFixed(3)) : null,
              honestClickers: Number((clickerH / Math.max(nH, 1)).toFixed(4)),
            };
            console.log(JSON.stringify(cell));
          }
        }
      }
    }
  }
}
