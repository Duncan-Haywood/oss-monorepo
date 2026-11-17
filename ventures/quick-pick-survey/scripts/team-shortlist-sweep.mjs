// node scripts/team-shortlist-sweep.mjs [--runs 12] [--sizes 10,15,20] [--ks 3] [--teams 3,5,8] [--taus 0.5,1,2] [--out docs/team-shortlist-2026-11-14.jsonl]
//
// A team answers a shortlist link ("find my top k", site/rank.html) and pastes
// its codes back. Which k should the team take, and how far can the page's
// chances be trusted? (docs/RANK-PAGE.md, "A team's shortlist".)
//
// A wider group has true scores theta, evenly spaced over `spread` logits and
// shuffled. Each of m members likes theta plus their own N(0, tau^2) per
// option and answers the page's own top-k questions (nextPair mode "top"),
// P(i over j) = sigmoid(b_i - b_j), until topStopCheck says done or the cap.
// Then three ways to pick the team's k:
//   model     the group order's top k (groupFit: the page's team table)
//   approval  the k options most people put in their own top k (a show of
//             hands on everyone's shortlist), ties by the group order
//   wider     the population model's top k (populationFit)
// Each is scored against two truths: the members' own mean true scores
// ("this group") and theta ("the wider group"). Exact = the set is right;
// hits = how many of the k are truly in. Calibration: the page's mean chance
// for the shown k (group chance against the members' truth, wider chance
// against theta's) next to the share that really were in.
import { writeFileSync } from "node:fs";
import { fit, nextPair, suggestedMax, topStopCheck, personInfo, groupFit, populationFit, topK, approvalShortlist, teamShortlist } from "../site/rank-core.mjs";

const args = process.argv.slice(2);
const opt = (key, d) => (args.includes(key) ? args[args.indexOf(key) + 1] : d);
const RUNS = Number(opt("--runs", 12));
const SIZES = opt("--sizes", "10,15,20").split(",").map(Number);
const KS = opt("--ks", "3").split(",").map(Number);
const TEAMS = opt("--teams", "3,5,8").split(",").map(Number);
const TAUS = opt("--taus", "0.5,1,2").split(",").map(Number);
const SPREAD = Number(opt("--spread", 6));
const OUT = opt("--out", null);
const SEED0 = Number(opt("--seed", 5200));

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
const topOf = (s, k) => new Set(s.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, k).map(([, i]) => i));

function member(n, k, b, seed) {
  const r = mulberry32(seed);
  const cap = suggestedMax(n);
  const answers = [];
  let f = fit(n, answers);
  while (answers.length < cap) {
    const [i, j] = nextPair(f, answers, { mode: "top", k, seed });
    answers.push(r() < 1 / (1 + Math.exp(-(b[i] - b[j]))) ? [i, j, false] : [j, i, false]);
    f = fit(n, answers);
    if (topStopCheck(n, answers, k, { fixedFit: f }).done) break;
  }
  return answers;
}

export function runTeam(n, k, m, tau, seed) {
  const r = mulberry32(seed);
  const theta = Array.from({ length: n }, (_, i) => SPREAD * (0.5 - i / (n - 1)));
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [theta[i], theta[j]] = [theta[j], theta[i]]; }
  const bs = Array.from({ length: m }, () => theta.map((x) => x + tau * gauss(r)));
  const people = bs.map((b, p) => ({ answers: member(n, k, b, seed * 31 + p + 1) }));
  const membersMean = theta.map((_, i) => bs.reduce((a, b) => a + b[i], 0) / m);
  const truthGroup = topOf(membersMean, k), truthWide = topOf(theta, k);
  const infos = people.map((p) => personInfo(n, p.answers));
  const sl = teamShortlist(Array(n).fill(""), people, k);
  const picks = {
    model: sl.items,
    approval: approvalShortlist(n, infos, k),
    wider: topK(populationFit(n, infos), k),
  };
  const out = { picks: people.reduce((a, p) => a + p.answers.length, 0) / m };
  for (const [arm, set] of Object.entries(picks)) {
    const hg = set.filter((i) => truthGroup.has(i)).length, hw = set.filter((i) => truthWide.has(i)).length;
    out[arm] = { hitsGroup: hg, hitsWide: hw };
  }
  out.claimGroup = sl.items.reduce((a, i) => a + sl.group[i], 0) / k;
  out.claimWide = sl.items.reduce((a, i) => a + sl.wider[i], 0) / k;
  out.settled = sl.groupSettled;
  out.approvalDiffers = picks.approval.some((i) => !sl.items.includes(i));
  return out;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const rows = [];
  for (const n of SIZES) for (const k of KS) for (const m of TEAMS) for (const tau of TAUS) {
    if (k >= n) continue;
    const t0 = Date.now();
    const xs = [];
    for (let run = 0; run < RUNS; run++) xs.push(runTeam(n, k, m, tau, SEED0 + 7919 * run + 131 * n + 17 * m + Math.round(100 * tau)));
    const mean = (f) => +(xs.reduce((a, x) => a + f(x), 0) / xs.length).toFixed(3);
    const row = { n, k, m, tau, spread: SPREAD, runs: RUNS, picksPerPerson: mean((x) => x.picks) };
    for (const arm of ["model", "approval", "wider"]) {
      row[arm] = {
        exactGroup: xs.filter((x) => x[arm].hitsGroup === k).length,
        exactWide: xs.filter((x) => x[arm].hitsWide === k).length,
        shareGroup: mean((x) => x[arm].hitsGroup / k),
        shareWide: mean((x) => x[arm].hitsWide / k),
      };
    }
    row.claimGroup = mean((x) => x.claimGroup);
    row.claimWide = mean((x) => x.claimWide);
    row.settled = mean((x) => x.settled);
    row.approvalDiffers = xs.filter((x) => x.approvalDiffers).length;
    row.seconds = +((Date.now() - t0) / 1000).toFixed(1);
    rows.push(row);
    console.log(JSON.stringify(row));
  }
  if (OUT) writeFileSync(OUT, rows.map((r) => JSON.stringify({ run: "team-shortlist", seed0: SEED0, ...r })).join("\n") + "\n");
}
