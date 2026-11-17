// In-time placebos on real series (eval/known-date-prereg-placebo-2026-11-17.md), the named-date test and the placebo
// check with the shipped settings, 999 replicates for the named date and 199 for each placebo date, seed 1.
// node eval/known-date-placebo-real.mjs
import { readFileSync } from 'node:fs';
import { knownDateTest, placeboCheck } from '../known-date.mjs';
const read = (f) => { const [h, ...rows] = readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8').trim().split('\n'); return { head: h.split(','), rows: rows.map((l) => l.split(',')) }; };
const col = (f, name) => { const d = read(f), j = d.head.indexOf(name); return { labels: d.rows.map((r) => r[0]), values: d.rows.map((r) => +r[j]) }; };
const ratio = (a, b) => ({ labels: a.labels, values: a.values.map((v, t) => v / b.values[t]) });
const out = {};
function run(tag, { labels, values }, date, { log = false, period = 0 } = {}) {
  const k = labels.indexOf(date), x = log ? values.map(Math.log) : values;
  const h = knownDateTest(x, k, { period, reps: 999, seed: 1, rhoGenMethod: 'gated', gateRho: 0.5 });
  const pc = placeboCheck(x, k, { period, reps: 199, seed: 1 });
  const named = h.refused ? `named date refused (${h.reason.slice(0, 70)}...)` : `named date ${date}: joint p ${h.p.toFixed(3)}, step ${h.step.toFixed(3)} p ${h.pStep.toFixed(3)}${h.admittedByCut ? ' (cut-admitted)' : ''}`;
  const pl = pc.dates.map((d) => `${labels[d.k]} ${d.refused ? 'refused' : `p ${d.p.toFixed(3)}`}`).join('; ');
  console.log(`${tag}: ${named}\n  placebos (before-period ${labels[0]} to ${labels[k - 1]}): ${pl || 'none (too short)'} -> ${pc.fired} of ${pc.tested} fired, ${pc.warn ? 'WARN' : 'no warning'}`);
  out[tag] = pc.warn;
  return pc;
}
console.log('# seen in development (README "A control series"): the seat-belt law, 1983-02, logs, 12 seasons');
run('R1 drivers', col('uk-driver-deaths.csv', 'deaths'), '1983-02', { log: true, period: 12 });
run('R2 front passengers', col('uk-road-casualties.csv', 'front'), '1983-02', { log: true, period: 12 });
run('R3 rear passengers', col('uk-road-casualties.csv', 'rear'), '1983-02', { log: true, period: 12 });
run('R4 drivers / rear (the ratio whose placebos fired)', ratio(col('uk-road-casualties.csv', 'drivers'), col('uk-road-casualties.csv', 'rear')), '1983-02', { log: true, period: 12 });
run('R5 Nile', col('nile.csv', 'volume'), '1899');
console.log('# not run through --known-date before: the GST of 1 July 2000, and Nottingham temperatures (no event)');
run('F1 Australian cement, quarterly', col('qcement.csv', 'cement'), '2000Q3', { log: true, period: 4 });
run('F2 Australian cafe turnover, monthly', col('auscafe.csv', 'turnover'), '2000-07', { log: true, period: 12 });
run('F3 Nottingham temperatures, 1935-01', col('nottem.csv', 'temp_f'), '1935-01', { period: 12 });
run('F4 Nottingham temperatures, 1930-01', col('nottem.csv', 'temp_f'), '1930-01', { period: 12 });
console.log(JSON.stringify(out));
