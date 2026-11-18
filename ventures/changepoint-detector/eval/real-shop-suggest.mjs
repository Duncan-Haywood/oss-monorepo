// A real shop's daily series through the watch's "How eager" replay, with and without a weekly cycle.
// Pre-registered in eval/real-shop-suggest.prereg.md before any run. Output: eval/real-shop-suggest.out.txt
//   node eval/real-shop-suggest.mjs > eval/real-shop-suggest.out.txt
import { readFileSync } from 'node:fs';
import { parseSeries } from '../engine.mjs';
import { replayWatch, eagerSettings, suggestFor, HINT_BUDGET } from '../watch-core.mjs';

const csv = readFileSync(new URL('../data/online-retail-daily.csv', import.meta.url), 'utf8');
const COLS = [['orders', 'poisson'], ['revenue', 'mean'], ['cancellations', 'poisson'], ['new_customers', 'poisson']];
const HOLIDAYS = ['2011-04-22', '2011-04-25', '2011-04-29', '2011-05-02', '2011-05-30', '2011-08-29'];
const day = (s) => Date.parse(s + 'T00:00:00Z') / 86400000;
const nearHoliday = (lab) => HOLIDAYS.some((h) => Math.abs(day(h) - day(lab)) <= 1);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const MONTHLY = 100 * 12 / 365;

const tally = {};
for (const period of [null, 7]) {
  console.log(`\n######## ${period ? '--period 7' : 'no period'} ########`);
  for (const [col, model] of COLS) {
    const { labels, values } = parseSeries(csv, col, null);
    const opts = { model, ...(period ? { period } : {}) };
    const settings = [];
    for (const { key, detector } of eagerSettings(model)) {
      const r = replayWatch(values, labels, { ...opts, detector });
      const daily = r.n - r.from;
      settings.push({ key, detector, per100: (100 * r.alerts.length) / daily, r });
    }
    const pick2 = suggestFor(settings, HINT_BUDGET, values.length), pickM = suggestFor(settings, MONTHLY, values.length);
    console.log(`\n== ${col} (${model}); watch starts ${labels[settings[0].r.from]}; suggested: ${pick2} at 2/100, ${pickM} at 1/month`);
    for (const s of settings) {
      tally[`${period ?? 0}|${col}|${s.key}`] = s.r.alerts.length;
      console.log(`  ${s.key} (${s.detector}): ${s.r.alerts.length} alerts, ${s.per100.toFixed(1)} per 100 checks`);
      for (const a of s.r.alerts) {
        const i = labels.indexOf(String(a.label));
        const before = mean(values.slice(Math.max(0, i - 28), i)), after = mean(values.slice(i, i + 28));
        const flag = nearHoliday(String(a.label)) ? '  <- within 1 day of a bank holiday' : '';
        console.log(`    change dated ${a.label} (${new Date(day(a.label) * 864e5).toUTCString().slice(0, 3)}), sent ${a.reportedAtLabel}; 28-day mean ${before.toFixed(1)} -> ${after.toFixed(1)}${flag}`);
      }
    }
    for (const [pk, budget] of [[pick2, '2/100'], [pickM, '1/month']]) {
      const s = settings.find((x) => x.key === pk);
      const h = s.r.alerts.filter((a) => nearHoliday(String(a.label))).length;
      tally[`B3|${period ?? 0}|${col}|${budget}`] = h;
    }
  }
}

console.log('\n######## Bars ########');
const q = (p, c) => tally[`${p}|${c}|quiet`];
const b1 = COLS.map(([c]) => [c, (100 * q(0, c)) / 300]);
console.log(`B1 (Quiet <= 2 per 100 checks on each column, no period): ${b1.map(([c, r]) => `${c} ${r.toFixed(1)}`).join(', ')} -> ${b1.every(([, r]) => r <= 2) ? 'PASS' : 'FAIL'}`);
const s0 = COLS.reduce((t, [c]) => t + q(0, c), 0), s7 = COLS.reduce((t, [c]) => t + q(7, c), 0);
const rise = COLS.filter(([c]) => q(7, c) > q(0, c)).map(([c]) => `${c} ${q(0, c)} -> ${q(7, c)}`);
console.log(`B2 (period 7: Quiet's sum falls >= 25%, no column rises): ${s0} -> ${s7} (${(100 * (s7 - s0) / s0).toFixed(0)}%); rises: ${rise.join(', ') || 'none'} -> ${s7 <= 0.75 * s0 && !rise.length ? 'PASS' : 'FAIL'}`);
const b3 = Object.entries(tally).filter(([k]) => k.startsWith('B3|'));
console.log(`B3 (no alert within 1 day of a one-day bank holiday at the suggested setting): ${b3.filter(([, v]) => v).map(([k, v]) => `${k.slice(3)}: ${v}`).join('; ') || 'none'} -> ${b3.every(([, v]) => !v) ? 'PASS' : 'FAIL'}`);
