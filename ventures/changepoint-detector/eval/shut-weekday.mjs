// Revenue's slow climb on a shop shut every Saturday: the default Quiet watch (D) against the shut-weekday drop (T).
// Pre-registered in eval/shut-weekday.prereg.md. Output: eval/shut-weekday.out.txt
//   node eval/shut-weekday.mjs > eval/shut-weekday.out.txt
import { readFileSync } from 'node:fs';
import { parseSeries } from '../engine.mjs';
import { replayWatch, dropShutWeekdays } from '../watch-core.mjs';

const day = (s) => Date.parse(s + 'T00:00:00Z') / 864e5;
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
export function arms(values, labels) {
  const D = replayWatch(values, labels, { model: 'mean', period: 7 });
  const t = dropShutWeekdays(values, labels);
  const T = replayWatch(t.values, t.labels, { model: 'mean', period: 7 - t.dropped.length });
  return { D, T, t };
}

const out = {};
for (const [name, file] of [['design year 2010-12 to 2011-12', 'online-retail-daily.csv'], ['fresh year 2009-12 to 2010-12', 'online-retail-2009-daily.csv']]) {
  const csv = readFileSync(new URL('../data/' + file, import.meta.url), 'utf8');
  const { labels, values } = parseSeries(csv, 'revenue', null);
  const { D, T, t } = arms(values, labels);
  console.log(`\n== ${name}: revenue, Quiet; left out: ${t.dropped.join(', ') || 'none'} (${values.length - t.values.length} rows)`);
  for (const [k, r, v, l] of [['D (--period 7)', D, values, labels], [`T (drop, --period ${7 - t.dropped.length})`, T, t.values, t.labels]]) {
    console.log(`  ${k}: ${r.alerts.length} alerts in ${r.n - r.from} checks (${(100 * r.alerts.length / (r.n - r.from)).toFixed(2)} per 100), watch from ${l[r.from]}`);
    for (const a of r.alerts) {
      const i = l.indexOf(String(a.label));
      console.log(`    dated ${a.label}, sent ${a.reportedAtLabel} (${day(a.reportedAtLabel) - day(a.label)} days); mean of 24 rows before ${mean(v.slice(Math.max(0, i - 24), i)).toFixed(0)}, after ${mean(v.slice(i, i + 24)).toFixed(0)}`);
    }
  }
  out[file] = { D, T };
}

const T = out['online-retail-2009-daily.csv'].T;
const f1 = T.alerts.filter((a) => day(a.label) >= day('2010-08-15') && day(a.label) <= day('2010-11-30') && day(a.reportedAtLabel) - day(a.label) <= 14);
const rate = 100 * T.alerts.length / (T.n - T.from);
console.log('\n######## Bars (fresh year) ########');
console.log(`F1 (T: a revenue alert dated 2010-08-15..11-30 sent within 14 days): ${f1.map((a) => `${a.label} sent ${a.reportedAtLabel}`).join('; ') || 'none'} -> ${f1.length ? 'PASS' : 'FAIL'}`);
console.log(`F2 (T: at most 2 alerts per 100 checks): ${rate.toFixed(2)} -> ${rate <= 2 ? 'PASS' : 'FAIL'}`);
