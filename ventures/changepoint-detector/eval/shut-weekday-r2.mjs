// Round 2 of eval/shut-weekday.prereg.md: a weekday is shut when 0 on each of its last 8 occurrences.
// Output: eval/shut-weekday-r2.out.txt   node eval/shut-weekday-r2.mjs > eval/shut-weekday-r2.out.txt
import { readFileSync } from 'node:fs';
import { parseSeries } from '../engine.mjs';
import { replayWatch, dropShutWeekdays } from '../watch-core.mjs';

const day = (s) => Date.parse(s + 'T00:00:00Z') / 864e5;
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
let T = null;
for (const [name, file] of [['design year 2010-12 to 2011-12', 'online-retail-daily.csv'], ['fresh year 2009-12 to 2010-12', 'online-retail-2009-daily.csv']]) {
  const { labels, values } = parseSeries(readFileSync(new URL('../data/' + file, import.meta.url), 'utf8'), 'revenue', null);
  for (const recent of [0, 8]) {
    const t = dropShutWeekdays(values, labels, { recent });
    const r = replayWatch(t.values, t.labels, { model: 'mean', period: 7 - t.dropped.length });
    console.log(`\n== ${name}, rule ${recent ? 'round 2 (last 8)' : 'round 1 (every)'}: left out ${t.dropped.join(', ') || 'none'} (${values.length - t.values.length} rows); Quiet, --period ${7 - t.dropped.length}`);
    console.log(`  ${r.alerts.length} alerts in ${r.n - r.from} checks (${(100 * r.alerts.length / (r.n - r.from)).toFixed(2)} per 100), watch from ${t.labels[r.from]}`);
    for (const a of r.alerts) {
      const i = t.labels.indexOf(String(a.label));
      console.log(`    dated ${a.label}, sent ${a.reportedAtLabel} (${day(a.reportedAtLabel) - day(a.label)} days); mean of 24 rows before ${mean(t.values.slice(Math.max(0, i - 24), i)).toFixed(0)}, after ${mean(t.values.slice(i, i + 24)).toFixed(0)}`);
    }
    if (recent && file.includes('2009')) T = r;
  }
}
const f1 = T.alerts.filter((a) => day(a.label) >= day('2010-08-15') && day(a.label) <= day('2010-11-30') && day(a.reportedAtLabel) - day(a.label) <= 14);
const rate = 100 * T.alerts.length / (T.n - T.from);
console.log('\n######## Round 2 bars (fresh year) ########');
console.log(`F1 (a revenue alert dated 2010-08-15..11-30 sent within 14 days): ${f1.map((a) => `${a.label} sent ${a.reportedAtLabel}`).join('; ') || 'none'} -> ${f1.length ? 'PASS' : 'FAIL'}`);
console.log(`F2 (at most 2 alerts per 100 checks): ${rate.toFixed(2)} -> ${rate <= 2 ? 'PASS' : 'FAIL'}`);
