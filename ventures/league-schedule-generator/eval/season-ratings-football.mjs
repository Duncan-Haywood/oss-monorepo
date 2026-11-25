// Season ratings checked on real scored matches: every men's international football result
// since 1872 (martj42/international_results, CC0 1.0). Each method predicts every match from the
// ratings it held before that match's rating period; parameters are tuned on 1990-2009 and the
// held-out score is 2010 onwards.
//
//   curl -sLo /tmp/results.csv https://raw.githubusercontent.com/martj42/international_results/master/results.csv
//   node eval/season-ratings-football.mjs /tmp/results.csv > eval/season-ratings-football.txt
//
// Not a rec league: national teams play a few times a year, at home or away, and football has
// draws. It tests the parts a club table needs too: inactivity, unequal schedules, score margin
// and home advantage, on results nobody chose for this check.

import { readFileSync } from "node:fs";
import { createRater, createElo, eloratingsMargin, periodKey } from "../season-ratings.mjs";

const path = process.argv[2];
if (!path) { console.error("usage: node eval/season-ratings-football.mjs results.csv"); process.exit(2); }
const rows = readFileSync(path, "utf8").trim().split(/\r?\n/).slice(1).map((l) => {
  // No quoted commas in the columns we read (date, teams, scores, tournament, neutral is last).
  const c = l.split(",");
  return { date: c[0], home: c[1], away: c[2], hs: +c[3], as: +c[4], tournament: c[5], neutral: c[c.length - 1] === "TRUE" };
}).filter((r) => Number.isFinite(r.hs) && Number.isFinite(r.as) && r.date);
rows.sort((a, b) => a.date.localeCompare(b.date));

const TUNE = ["1990-01-01", "2010-01-01"];
const TEST = ["2010-01-01", "9999"];

function score(preds, [from, to]) {
  let n = 0, brier = 0, dec = 0, hit = 0, ll = 0;
  for (const { r, p } of preds) {
    if (r.date < from || r.date >= to) continue;
    const s = r.hs > r.as ? 1 : r.hs < r.as ? 0 : 0.5;
    n++; brier += (s - p) ** 2;
    if (s !== 0.5) {
      dec++;
      if ((p > 0.5) === (s === 1)) hit++;
      const q = Math.min(1 - 1e-9, Math.max(1e-9, p));
      ll -= s === 1 ? Math.log(q) : Math.log(1 - q);
    }
  }
  return { n, brier: brier / n, acc: hit / dec, logloss: ll / dec, decisive: dec };
}

function runGlicko(opts, period) {
  const rater = createRater(opts);
  const preds = [];
  let key = null, batch = [];
  rows.forEach((r, i) => {
    const k = periodKey(r.date, i, period);
    if (k !== key && batch.length) { rater.period(batch); batch = []; }
    key = k;
    preds.push({ r, p: rater.predict([r.home], [r.away], { home: !r.neutral }) });
    batch.push({ a: [r.home], b: [r.away], sa: r.hs, sb: r.as, home: !r.neutral });
  });
  return preds;
}

function runElo({ k, home, margin, tournamentK }) {
  const elo = createElo({ k, home, marginMultiplier: margin ? eloratingsMargin : null });
  return rows.map((r) => {
    const p = elo.predict(r.home, r.away, { home: !r.neutral });
    elo.game(r.home, r.away, r.hs, r.as, { home: !r.neutral, kScale: tournamentK ? tournamentK(r.tournament) / k : 1 });
    return { r, p };
  });
}

// eloratings.net weights ("About the ratings"): 60 World Cup finals; 50 continental championship
// finals and major intercontinental tournaments; 40 World Cup and continental qualifiers and major
// tournaments; 30 all other tournaments; 20 friendlies. The name mapping below is ours (approximate).
function eloratingsK(t) {
  if (t === "FIFA World Cup") return 60;
  if (/qualification/i.test(t)) return 40;
  if (/^(UEFA Euro|Copa América|African Cup of Nations|AFC Asian Cup|Gold Cup|CONCACAF Championship|Confederations Cup|Oceania Nations Cup)$/.test(t)) return 50;
  if (/Nations League/.test(t)) return 40;
  if (t === "Friendly") return 20;
  return 30;
}

const out = [];
const log = (s = "") => out.push(s);
const fmt = (m) => `Brier ${m.brier.toFixed(4)}  log loss ${m.logloss.toFixed(4)}  accuracy ${(100 * m.acc).toFixed(1)}%`;

log(`International football results: ${rows.length} matches, ${rows[0].date} to ${rows.at(-1).date}.`);
log(`Tuned on ${TUNE[0]}..${TUNE[1]}; held out from ${TEST[0]}. Every prediction uses only earlier results.`);
log("Brier: squared error of the home side's expected score (win 1, draw 0.5, loss 0), all matches.");
log("Log loss and accuracy: decisive matches only (the favourite named by p > 0.5).");
log();

// Base rate: the home side's mean score in the tuning years, by neutral or not.
const base = {};
for (const nb of [true, false]) {
  const xs = rows.filter((r) => r.date >= TUNE[0] && r.date < TUNE[1] && r.neutral === nb).map((r) => (r.hs > r.as ? 1 : r.hs < r.as ? 0 : 0.5));
  base[nb] = xs.reduce((a, b) => a + b, 0) / xs.length;
}
const results = [];
results.push(["Base rate (home side's average score, no ratings)", {}, rows.map((r) => ({ r, p: base[r.neutral] }))]);

function best(label, grid, run) {
  let top = null;
  for (const params of grid) {
    const preds = run(params);
    const m = score(preds, TUNE);
    if (!top || m.brier < top.m.brier) top = { params, m, preds };
  }
  results.push([label, top.params, top.preds]);
  return top;
}
const cross = (o) => Object.entries(o).reduce((acc, [k, vs]) => acc.flatMap((a) => vs.map((v) => ({ ...a, [k]: v }))), [{}]);

best("Elo, win/draw/loss (K and home tuned)", cross({ k: [10, 20, 30, 40, 60], home: [0, 50, 100, 150] }), (p) => runElo(p));
results.push(["World Football Elo constants (K by tournament, goal margin, home 100; untuned)", { k: 20, home: 100 }, runElo({ k: 20, home: 100, margin: true, tournamentK: eloratingsK })]);
best("Elo + goal margin + K by tournament (scale and home tuned)", cross({ k: [20], home: [50, 100, 150], scale: [0.5, 0.75, 1, 1.5] }), (p) => runElo({ k: 20, home: p.home, margin: true, tournamentK: (t) => eloratingsK(t) * p.scale }));
for (const period of ["month", "date"]) {
  const w = best(`Glicko-2, win/draw/loss, period ${period} (tau, RD, home tuned)`, cross({ tau: [0.3, 0.6, 1.0, 1.5, 2.5], rd: [200, 350], home: [0, 50, 100, 150], margin: [0] }), (p) => runGlicko(p, period));
  best(`Glicko-2 + score margin, period ${period} (margin, tau, RD, home tuned)`, cross({ tau: [0.6, 1.0, 1.5, 2.5], rd: [200, 350], home: [50, 100, 150], margin: [0.25, 0.5, 0.75, 1] }), (p) => runGlicko(p, period));
  if (period === "month") {
    log(`Score margin sweep, Glicko-2 period month at the tuned win-only params (${JSON.stringify({ ...w.params, margin: undefined })}):`);
    for (const margin of [0, 0.25, 0.5, 0.75, 1]) {
      const preds = runGlicko({ ...w.params, margin }, period);
      log(`  margin ${margin}: tune ${fmt(score(preds, TUNE))} | held out ${fmt(score(preds, TEST))}`);
    }
    log();
  }
}

for (const [label, params, preds] of results) {
  const t = score(preds, TUNE);
  const h = score(preds, TEST);
  log(label);
  if (Object.keys(params).length) log(`  params: ${JSON.stringify(params)}`);
  log(`  tune ${TUNE[0].slice(0, 4)}-2009 (${t.n}): ${fmt(t)}`);
  log(`  held out 2010- (${h.n}): ${fmt(h)}`);
  log();
}
// Paired bootstrap on held-out matches: Brier and log loss differences, 2,000 resamples, fixed seed.
function paired(label, pa, pb) {
  const idx = []; pa.forEach(({ r }, i) => { if (r.date >= TEST[0]) idx.push(i); });
  const s = (r) => (r.hs > r.as ? 1 : r.hs < r.as ? 0 : 0.5);
  const lossB = (p, r) => (s(r) - p) ** 2;
  const lossL = (p, r) => { const q = Math.min(1 - 1e-9, Math.max(1e-9, p)); return s(r) === 0.5 ? 0 : -(s(r) === 1 ? Math.log(q) : Math.log(1 - q)); };
  const dB = idx.map((i) => lossB(pa[i].p, pa[i].r) - lossB(pb[i].p, pb[i].r));
  const dL = idx.map((i) => lossL(pa[i].p, pa[i].r) - lossL(pb[i].p, pb[i].r));
  const dec = idx.map((i) => s(pa[i].r) !== 0.5);
  let rs = 12345 >>> 0; const rnd = () => { rs = (rs + 0x6d2b79f5) >>> 0; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const bs = [], bl = [];
  for (let b = 0; b < 2000; b++) {
    let sb = 0, sl = 0, nd = 0;
    for (let j = 0; j < idx.length; j++) { const k = Math.floor(rnd() * idx.length); sb += dB[k]; if (dec[k]) { sl += dL[k]; nd++; } }
    bs.push(sb / idx.length); bl.push(sl / nd);
  }
  const ci = (xs) => { xs.sort((a, b) => a - b); return `[${xs[50].toFixed(4)}, ${xs[1949].toFixed(4)}]`; };
  const mean = (xs, w) => { let t = 0, n = 0; xs.forEach((x, i) => { if (!w || w[i]) { t += x; n++; } }); return (t / n).toFixed(4); };
  log(`${label}: Brier diff ${mean(dB)} 95% CI ${ci(bs)}; log loss diff ${mean(dL, dec)} 95% CI ${ci(bl)} (negative = first is better)`);
}
const byLabel = (re) => results.find(([l]) => re.test(l))[2];
log("Paired bootstrap, held out 2010- (2,000 resamples):");
paired("Glicko-2 month vs Elo tuned", byLabel(/^Glicko-2, win\/draw\/loss, period month/), byLabel(/^Elo, win/));
paired("Glicko-2 month vs World Football Elo", byLabel(/^Glicko-2, win\/draw\/loss, period month/), byLabel(/^World Football Elo/));
paired("Glicko-2 month + margin vs win only", byLabel(/^Glicko-2 \+ score margin, period month/), byLabel(/^Glicko-2, win\/draw\/loss, period month/));
console.log(out.join("\n"));
