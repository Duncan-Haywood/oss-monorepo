// The --consensus panel on real series with a documented break (README, "--consensus on real series").
// usage: node eval/consensus-real.mjs
import { readFileSync } from 'node:fs';
import { consensus } from '../consensus.mjs';
const load = (f, col) => {
  const rows = readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
  return { labels: rows.map((r) => r[0]), values: rows.map((r) => +r[col]) };
};
const SERIES = [
  ['UK drivers killed or seriously injured (log, period 12); seat-belt law 1983-01-31', 'uk-driver-deaths.csv', 1, { log: true, period: 12 }, '1983-02'],
  ['Lake Huron level, 1875-1972; a level drop near 1920 (recalled, no paper read)', 'lake-huron.csv', 1, {}, '1925'],
  ['Nile annual flow, 1871-1970; published 1898 change (Cobb 1978)', 'nile.csv', 1, {}, '1899'],
  ['Global temperature, annual; the 1946 step the earlier trials dated', 'global-temp-annual.csv', 1, {}, '1946'],
  // Added 2026-11-10 (second batch): series where `--ar1` keeps its cuts, or the break is documented outside this repo.
  ['US CPI inflation, quarterly annualised; 1973Q3 (Arab oil embargo, Oct 1973) and 1981Q4 (Volcker disinflation, 1979-82)', 'us-inflation.csv', 1, {}, ['1973Q3', '1981Q4']],
  ['US real 3-month T-bill rate, quarterly; the Volcker rise of 1980-81 and the 1970s negative rates', 'us-real-interest.csv', 1, {}, ['1973Q3', '1980Q4']],
  ['Saudi oil production, 1965-2013; the 1982 collapse after OPEC output cuts', 'saudi-oil.csv', 1, {}, '1982'],
  ['Lakes Michigan-Huron level, 1918-2009; the late-1990s drop (recalled, no paper read)', 'michigan-huron.csv', 1, {}, '1999'],
  // Third batch (2026-11-10): drifting or short series, the case the earlier batches lacked.
  ['US airline passenger miles, 1937-1960 (log, 24 years); first peacetime year 1946', 'airmiles.csv', 1, { log: true }, '1946'],
  ['UK gas consumption, quarterly 1960-1986 (log, period 4); North Sea gas era from about 1970 (recalled, no paper read)', 'uk-gas.csv', 1, { log: true, period: 4 }, '1970'],
  ['US personal saving rate, monthly 1967-2015; the 2008 financial-crisis jump (recalled, no paper read)', 'us-saving-rate.csv', 1, {}, '2008'],
  // Added 2026-11-10 (fourth batch): a count shock, a hyperinflation and a change from before 1900.
  ['Puerto Rico daily deaths, 2015-2018; Hurricane Maria landfall 2017-09-20', 'puerto-rico-daily-deaths.csv', 1, {}, '2017-09-20'],
  ['Argentina quarterly log CPI change; the May 1989 hyperinflation peak and the April 1991 Convertibility Law', 'argentina-inflation.csv', 1, {}, ['1989Q2', '1991Q2']],
  ['British coal-mining disasters per year, 1851-1962; Coal Mines Regulation Act 1887 (recalled, no paper read)', 'coal-mining-disasters.csv', 1, {}, '1887'],
  // Fifth batch (2026-11-10): a seasonal series with two dated events, a border rule and a short annual series.
  ['Australian short-term arrivals from the US, quarterly 1981-2012 (log, period 4); Sydney Olympics 2000Q3 and 11 September 2001 (recalled, no source read)', 'au-arrivals-us.csv', 1, { log: true, period: 4 }, ['2000Q3', '2001Q3']],
  ['Peace Bridge monthly traffic, 2003-2015 (log, period 12); US land-border passport rule (WHTI) of 2009-06-01 (data/SOURCE.md) and the 2008-09 recession', 'peace-bridge.csv', 1, { log: true, period: 12 }, ['2008-11', '2009-06']],
  ['Australian air passengers, annual 1970-2016 (log); the 2001 Ansett collapse and 11 September (recalled), dated 2002 by three models earlier', 'ausair.csv', 1, { log: true }, '2002'],
];
for (const [title, file, col, base, truth] of SERIES) {
  const { labels, values } = load(file, col);
  const c = consensus({ values, labels, ...base });
  console.log(`\n${title}`);
  console.log(`  n ${values.length}, tolerance ${c.tolerance}, settings ${c.settings.length}; cuts per setting: ${c.settings.map((s) => s.changes).join(', ')}`);
  for (const t of [].concat(truth)) {
    const hit = c.changes.find((x) => x.label === t || String(x.label).startsWith(t)) ?? c.changes.find((x) => String(x.from) <= t && t <= String(x.to));
    console.log(`  documented ${t}: ${hit ? `${hit.label} found by ${hit.support}/${hit.of} (${hit.tier})` : 'not in the list'}`);
  }
  for (const x of c.changes.filter((y) => y.tier !== 'few')) console.log(`  ${x.label}  ${x.support}/${x.of}  ${x.direction}  ${x.tier}`);
}
