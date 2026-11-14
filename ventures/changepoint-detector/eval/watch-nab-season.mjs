// Round 11 of the watch: the daily cycle removed, on NAB's 47 real series. Pre-registered 2026-11-13: this header, the
// rules and the code below were written and committed before any run that printed a score (a timing-only pilot on 100
// checks of nyc_taxi, printing milliseconds per check and nothing else, showed the period settings cost no more than
// round 10's, so the round runs at every point as round 10 did).
//
//   sh eval/nab-fetch.sh nab-data
//   node eval/watch-nab-season.mjs nab-data > eval/watch-nab-season.out.txt
//
// Why (README "Round 10"): on NAB's hourly series the three level settings' alerts sat inside an anomaly window barely
// more often than chance (Quiet 13.7%, Middle 12.5%, Eager 12.9%, against 11.8%), while "Wandering level" (drift) was at
// 20.5% with half Quiet's alerts. Round 10 ran with no seasonal period, as pre-registered, although NAB's server, traffic,
// taxi and Twitter series cycle daily, and the level settings take `--period`. So round 10's own conclusion was that the
// next round should remove the season before judging the level settings against drift. This is that round. The 47
// series are now seen (round 10), so this is a second look at a seen set, not a fresh one; the rules below are about
// what the page and CLI tell a person who watches hourly metrics, not about the default.
//
// Data and design: round 10's (watch-nab.mjs: loadNab, clock-hour buckets, each series cut at h = floor(n/2), the watch
// replayed after every point under the shipped policy: window 1,000, confirm 5, tolerance 5, hold history, persist 2;
// level model, raw values, no log), with two changes. (i) Five settings: quiet (bocpd-ar1-window, the default, no
// period), drift (no period; the drift watch takes none), and quiet24, middle24, eager24 (bocpd-ar1-window, bocpd, pelt,
// each with period 24: the engine's seasonalAdjust over the watch window). (ii) Every setting starts at
// start = max(48, floor(0.2 h)), because a period of 24 needs two full cycles; round 10 started at max(20, ...), so
// quiet's and drift's rows here are close to round 10's but not identical (25 of 47 series start later). The hourly
// buckets skip empty hours, as round 10's did; on the 18 series with missing hours the 24-point phase slips at each gap,
// as it would for a person who pasted the same sheet. The 29 gap-free series are reported apart, deciding nothing.
//
// Scores, future halves only, as round 10: alerts; share "at a window" (the alerted change's index inside any labelled
// window); per 1,000 hourly checks; future windows reached (some future alert's change index inside it). Chance rate
// printed beside. Also reported, deciding nothing: per NAB folder, and hint3 over the period ladder (the most eager of
// eager24 > middle24 > quiet24 whose history rate is at most 2 per 100, else quiet24).
//
// Rules, written before the run. Ties in a "more" or "higher" part fail; "at least" and "at most" include ties.
//  T4, the season helps the default on hourly metrics: quiet24 against quiet. (a) at least quiet's future windows
//      reached, less 1; (b) per 1,000 checks at most quiet's; (c) share at a window at least quiet's + 2 points.
//      Pass: the watch's help on the page, `watch.mjs --help`, the standalone repository's README and the agent tool's
//      description say to set the period to 24 for hourly metrics with a daily cycle, citing this round. Fail: they
//      say nothing new, and the README records it.
//  T5, the level watch with the season against drift: quiet24 against drift. (a) at least drift's future windows
//      reached; (b) share at a window at least drift's; (c) per 1,000 checks at most quiet's (no period). Pass: the
//      advice in T4 (if it passes) names quiet + period 24 as the first thing to try on hourly metrics, ahead of
//      "Wandering level". Fail: the advice, if any, names both: drift has the higher share at a window or reaches
//      more, and says which on NAB.
//  Nothing in the default or the hint changes from this round either way.
//
// Predictions, written before the run. T4: removing the daily cycle takes away much of what Quiet alerts on in the
// traffic, taxi, Twitter and ad-exchange series, so quiet24 sends clearly fewer alerts (about two thirds of quiet's) and
// a higher share at a window (about 16-18%); it reaches a window or two fewer, within (a)'s allowance of 1, so T4 passes,
// narrowly, with (a) the part at risk. T5: drift's 20.5% is above what removing the season alone gives the level model,
// because NAB's anomalies include slow failures drift reads well (machine_temperature, ec2_request_latency), so T5
// fails on (b); it reaches about as many windows as drift.
import { readFileSync } from 'node:fs';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { replayWatch } from '../watch-core.mjs';
import { loadNab } from './watch-nab.mjs';

export const PERIOD = 24;
const B = 2;
/** [detector, period] per setting. */
export const SETTINGS = {
  quiet: ['bocpd-ar1-window', 0],
  drift: ['drift', 0],
  quiet24: ['bocpd-ar1-window', PERIOD],
  middle24: ['bocpd', PERIOD],
  eager24: ['pelt', PERIOD],
};
const KEYS = Object.keys(SETTINGS);
const LADDER24 = ['eager24', 'middle24', 'quiet24'];
const POLICY = { confirm: 5, tolerance: 5, holdHistory: true, persist: 2, window: 1000 };
export const startFor = (h) => Math.max(2 * PERIOD, Math.floor(0.2 * h));

if (!isMainThread) {
  parentPort.on('message', ({ id, values, start, detector, period }) => {
    const t = Date.now();
    const r = replayWatch(values, null, { ...POLICY, detector, ...(period ? { period } : {}), from: start, budget: Infinity });
    parentPort.postMessage({ id, step: r.step, checks: r.checks, secs: (Date.now() - t) / 1000, alerts: r.alerts.map((a) => ({ index: a.index, at: a.reportedAt })) });
  });
}

async function runAll(jobs) {
  const results = new Array(jobs.length);
  const k = Math.max(1, Math.min(jobs.length, availableParallelism()));
  let next = 0, done = 0;
  const order = jobs.map((_, i) => i).sort((a, b) => jobs[b].values.length - jobs[a].values.length);
  await new Promise((resolve, reject) => {
    for (let w = 0; w < k; w++) {
      const worker = new Worker(new URL(import.meta.url));
      const feed = () => { if (next < order.length) { const id = order[next++]; const j = jobs[id]; worker.postMessage({ id, values: j.values, start: j.start, detector: j.detector, period: j.period }); } else worker.terminate(); };
      worker.on('message', (m) => { results[m.id] = m; done++; if (done % 10 === 0) process.stderr.write(`${done}/${jobs.length}\n`); if (done === jobs.length) resolve(); feed(); });
      worker.on('error', reject);
      feed();
    }
  });
  return results;
}

/** True when a series' clock-hour buckets have no missing hour (so a 24-point phase never slips). */
export const gapFree = (t) => t.every((x, i) => i === 0 || x - t[i - 1] === 3600e3);

const inWin = (w, i) => i >= w.lo && i <= w.hi;
const reachedBy = (s, fut) => s.wins.filter((w) => w.future && fut.some((a) => inWin(w, a.index))).length;
export const hint24 = (ps, b = B) => LADDER24.find((k) => ps[k].histRate <= b) ?? 'quiet24';

function score(series, per, pick, keep = () => true) {
  const t = { alerts: 0, atWin: 0, points: 0, wins: 0, reached: 0, picks: {} };
  series.forEach((s, i) => {
    if (!keep(s)) return;
    const k = pick(per[i]);
    t.picks[k] = (t.picks[k] || 0) + 1;
    const { fut } = per[i][k];
    t.alerts += fut.length; t.points += s.n - s.h; t.wins += s.wins.filter((w) => w.future).length;
    t.atWin += fut.filter((a) => s.wins.some((w) => inWin(w, a.index))).length;
    t.reached += reachedBy(s, fut);
  });
  t.share = t.alerts ? (100 * t.atWin) / t.alerts : 0;
  t.per1000 = t.points ? (1000 * t.alerts) / t.points : 0;
  return t;
}

/** The two rules on scored totals (exported so the test can check them on made-up numbers). */
export function rules(T) {
  const q = T.quiet, q24 = T.quiet24, d = T.drift;
  const t4 = [q24.reached >= q.reached - 1, q24.per1000 <= q.per1000, q24.share >= q.share + 2];
  const t5 = [q24.reached >= d.reached, q24.share >= d.share, q24.per1000 <= q.per1000];
  return { t4, t5, T4: t4.every(Boolean), T5: t5.every(Boolean) };
}

if (isMainThread && process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] || 'nab-data';
  const t0 = Date.now();
  const series = loadNab(dir).map((s) => ({ ...s, start: startFor(s.h) }));
  // loadNab drops the bucket times; rebuild them once to mark gap-free series.
  const { hourly } = await import('./watch-nab.mjs');
  const ts = (x) => Date.parse(x.replace(' ', 'T').replace(/\.\d+$/, '') + 'Z');
  for (const s of series) {
    const rows = readFileSync(`${dir}/data/${s.name}`, 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
    s.gapFree = gapFree(hourly(rows.map((r) => [ts(r[0]), Number(r[1])]), s.name).t);
  }
  const jobs = [];
  series.forEach((s, si) => { for (const [k, [detector, period]] of Object.entries(SETTINGS)) jobs.push({ si, k, values: s.values, start: s.start, detector, period }); });
  const res = await runAll(jobs);
  const by = series.map(() => ({}));
  jobs.forEach((j, i) => { by[j.si][j.k] = res[i]; });
  const per = series.map((s, i) => Object.fromEntries(KEYS.map((k) => {
    const r = by[i][k];
    const hist = r.alerts.filter((a) => a.at < s.h), fut = r.alerts.filter((a) => a.at >= s.h);
    return [k, { histRate: (100 * hist.length) / (s.h - s.start), futRate: (100 * fut.length) / (s.n - s.h), fut, step: r.step }];
  })));
  const chance = series.reduce((a, s) => a + s.chance * (s.n - s.h), 0) / series.reduce((a, s) => a + (s.n - s.h), 0);

  console.log(`Round 11: an hourly watch on NAB's ${series.length} real series (${series.reduce((a, s) => a + s.n, 0)} hourly points, checked after every point), the daily cycle removed (period ${PERIOD}) from the level settings.\n`);
  console.log(`  series                                          n     h start gap-free  fut rate per 100: ${KEYS.join(' / ')}   future windows reached: ${KEYS.join(' / ')}`);
  series.forEach((s, i) => {
    const p = per[i], fw = s.wins.filter((w) => w.future).length;
    console.log(`  ${s.name.padEnd(45)} ${String(s.n).padStart(6)} ${String(s.h).padStart(5)} ${String(s.start).padStart(5)}  ${s.gapFree ? 'yes' : 'no '}   ${KEYS.map((k) => p[k].futRate.toFixed(2).padStart(6)).join(' ')}   ${fw}: ${KEYS.map((k) => reachedBy(s, p[k].fut)).join(' / ')}`);
  });
  console.log(`\n  Chance: ${(100 * chance).toFixed(1)}% of future points lie inside a labelled window.\n`);
  const row = (name, t) => console.log(`  ${name.padEnd(34)} ${String(t.alerts).padStart(6)}   ${String(t.atWin).padStart(5)} (${t.share.toFixed(1).padStart(4)}%)   ${t.per1000.toFixed(2).padStart(7)}   ${String(t.reached).padStart(3)}/${t.wins}   ${Object.entries(t.picks).map(([k, c]) => `${k} ${c}`).join(', ')}`);
  const head = (title) => console.log(`  ${title.padEnd(34)} alerts   at a window       per 1000   reached   picks`);
  head('policy (all 47)');
  const T = {};
  for (const k of KEYS) { T[k] = score(series, per, () => k); row(`fixed ${k}`, T[k]); }
  row('hint3 over the period ladder, B = 2', score(series, per, (p) => hint24(p)));
  const { t4, t5, T4, T5 } = rules(T);
  const v = (x) => (x ? 'PASS' : 'FAIL');
  const q = T.quiet, q24 = T.quiet24, d = T.drift;
  console.log(`\n  T4 quiet24 vs quiet: (a) ${q24.reached} vs ${q.reached} - 1 ${v(t4[0])}; (b) ${q24.per1000.toFixed(2)} vs ${q.per1000.toFixed(2)} ${v(t4[1])}; (c) ${q24.share.toFixed(1)}% vs ${q.share.toFixed(1)}% + 2 ${v(t4[2])}. ${T4 ? 'PASSES' : 'FAILS'}.`);
  console.log(`  T5 quiet24 vs drift: (a) ${q24.reached} vs ${d.reached} ${v(t5[0])}; (b) ${q24.share.toFixed(1)}% vs ${d.share.toFixed(1)}% ${v(t5[1])}; (c) ${q24.per1000.toFixed(2)} vs quiet ${q.per1000.toFixed(2)} ${v(t5[2])}. ${T5 ? 'PASSES' : 'FAILS'}.`);

  console.log('\n  Reported only, deciding nothing.\n');
  head(`gap-free series (${series.filter((s) => s.gapFree).length})`);
  for (const k of KEYS) row(`fixed ${k}`, score(series, per, () => k, (s) => s.gapFree));
  for (const folder of [...new Set(series.map((s) => s.name.split('/')[0]))]) {
    console.log('');
    head(`${folder} (${series.filter((s) => s.name.startsWith(folder + '/')).length})`);
    for (const k of KEYS) row(`fixed ${k}`, score(series, per, () => k, (s) => s.name.startsWith(folder + '/')));
  }
  const secs = res.reduce((a, r) => a + r.secs, 0);
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s wall, ${secs.toFixed(0)} s of replays on ${availableParallelism()} cores.`);
}
