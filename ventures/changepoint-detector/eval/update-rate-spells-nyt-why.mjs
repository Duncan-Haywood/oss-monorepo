// POST HOC (written after eval/update-rate-spells-nyt.mjs failed N1 and N2; not pre-registered, decides nothing about
// the search): why the two N1 misses, and what the restated "edge spell" line (update-rate.mjs edgeSpellsOf, the
// default update-rate line's own fewer-then-more pair of changes within EDGE_SPELL_MAX_STEPS) says on both providers.
//   1. Published days per weekday, month by month, for Alaska (May-Sep 2021) and Nebraska (Jul-Oct 2021, Apr-Nov
//      2022), JHU beside NYT.
//   2. Alaska on both providers: the default line's cuts, the spell search at m 3.5, 3 and 2.5.
//   3. Every edge spell on the 35 states, both providers, with the documented event nearest either end.
// usage: sh eval/covid-schedules-fetch.sh covid-data && sh eval/nyt-states-fetch.sh nyt-data &&
//        node eval/update-rate-spells-nyt-why.mjs covid-data nyt-data > eval/update-rate-spells-nyt-why.out.txt
import { readNyt, STATES, daysApart, TOL } from './update-rate-spells-nyt.mjs';
import { readStates, PRIMARY, SECONDARY } from './update-rate-covid-schedules.mjs';
import { shortSpells, daysFromDates, updateRateChanges, edgeSpellsOf } from '../update-rate.mjs';
import { join } from 'node:path';

const jhu = readStates(join(process.argv[2] || 'covid-data', 'time_series_covid19_confirmed_US.csv'));
const nyt = readNyt(join(process.argv[3] || 'nyt-data', 'us-states.csv'));
const P = [['JHU', jhu], ['NYT', nyt]];
const W = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const pct = (v) => `${(100 * v).toFixed(0)}%`;

console.log('1. Published days (value moved) by weekday, of the days in the month');
for (const [st, a, b] of [['Alaska', '2021-05-01', '2021-09-30'], ['Nebraska', '2021-07-01', '2021-10-31'], ['Nebraska', '2022-04-01', '2022-11-30']]) {
  for (const [name, by] of P) {
    const x = by.get(st), m = new Map();
    for (let i = 1; i < x.dates.length; i++) {
      const d = x.dates[i]; if (d < a || d > b) continue;
      const k = d.slice(0, 7), w = new Date(`${d}T00:00:00Z`).getUTCDay();
      if (!m.has(k)) m.set(k, { r: 0, n: 0, pub: new Array(7).fill(0), days: new Array(7).fill(0) });
      const o = m.get(k), moved = x.values[i] !== x.values[i - 1];
      o.n++; o.r += moved ? 0 : 1; o.days[w]++; o.pub[w] += moved ? 1 : 0;
    }
    console.log(`  ${st} ${name}`);
    for (const [k, o] of m) console.log(`    ${k} repeats ${pct(o.r / o.n).padStart(4)}  ${[1, 2, 3, 4, 5, 6, 0].map((w) => `${W[w]} ${o.pub[w]}/${o.days[w]}`).join('  ')}`);
  }
}

console.log('\n2. Alaska: the default line\'s cuts and the spell search');
for (const [name, by] of P) {
  const x = by.get('Alaska'), u = updateRateChanges(x.values);
  console.log(`  ${name} n ${x.values.length} from ${x.dates[0]}; cuts ${u.changes.map((c) => `${x.dates[c.index]} ${c.direction} ${pct(c.shareBefore)}->${pct(c.shareAfter)}`).join(', ')}`);
  for (const m of [3.5, 3, 2.5]) {
    const r = shortSpells(x.values, { days: daysFromDates(x.dates), mult: m, u });
    console.log(`    m ${m} (penalty ${r.penalty.toFixed(1)}): ${r.spells.length ? r.spells.map((s) => `${x.dates[s.from]}..${x.dates[s.to]} gain ${s.gain.toFixed(1)}`).join('; ') : 'none'}`);
  }
}

console.log(`\n3. Edge spells (default line: fewer, then more within 120 steps) on the 35 states; documented event within +-${TOL} days of either end`);
for (const [name, by] of P) {
  let n = 0, doc = 0;
  for (const st of STATES) {
    const x = by.get(st); if (!x) continue;
    for (const e of edgeSpellsOf(updateRateChanges(x.values))) {
      n++; const f = x.dates[e.from], t = x.dates[e.to];
      const ev = [...PRIMARY, ...SECONDARY].find((v) => v.state === st && (daysApart(v.date, f) <= TOL || daysApart(v.date, t) <= TOL));
      if (ev) doc++;
      console.log(`  ${name} ${st.padEnd(21)} ${f}..${t} (${e.steps} steps) ${pct(e.shareInside)} inside, ${pct(e.shareBefore)} before, ${pct(e.shareAfter)} after -> ${ev ? `${ev.date} ${ev.what}` : 'no documented event'}`);
    }
  }
  console.log(`  ${name}: ${n} edge spells, ${doc} next to a documented event`);
}
