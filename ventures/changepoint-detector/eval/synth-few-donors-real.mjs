// The shipped synthetic control on two real few-donor panels (pre-registration eval/synth-few-donors-prereg-2026-11-18.md):
// West Germany 1990 against 16 OECD countries, the Basque Country 1970 against 16 Spanish regions.
// node eval/synth-few-donors-real.mjs > eval/synth-few-donors-real.out.txt
import { readFileSync } from 'node:fs';
import { synthResult } from '../synth-cli.mjs';

const read = (f) => readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8');
const PANELS = {
  G: { name: 'West Germany 1990', csv: read('oecd-gdp-per-capita-1960-2003.csv'), cov: read('oecd-covariates-1989.csv'), column: 'WestGermany', date: 1990, window: '1960:2003', fake: { window: '1960:1989', date: 1975 }, paper: ['Austria', 'USA', 'Japan', 'Switzerland', 'Netherlands'] },
  B: { name: 'Basque Country 1970', csv: read('spain-regions-gdp-per-capita.csv'), cov: read('spain-regions-covariates-1969.csv'), column: 'BAS', date: 1970, window: '1955:1997', fake: { window: '1955:1969', date: 1965 }, paper: ['CAT', 'MAD'] },
};
const f = (v, d = 3) => Number(v).toFixed(d);
const all = (csv, column) => csv.split('\n')[0].split(',').slice(1).filter((c) => c !== column);
const res = {};
for (const [tag, P] of Object.entries(PANELS)) {
  const pool = all(P.csv, P.column);
  const r = synthResult({ csv: P.csv, column: P.column, date: P.date, donors: ['all'], window: P.window, covariatesCsv: P.cov });
  const paperW = r.weights.filter((w) => P.paper.includes(w.name)).reduce((s, w) => s + w.weight, 0);
  console.log(`== ${tag}: ${P.name}, ${r.donors} donors, ${r.from}-${r.to}`);
  console.log(`weights: ${r.weights.filter((w) => w.weight >= 0.005).map((w) => `${w.name} ${f(w.weight)}`).join(', ')}; on the paper's units ${f(paperW)}`);
  console.log(`before RMSPE ${f(r.preRmspe)}, placebos fitting better ${f(100 * r.preFitShare, 0)}%${r.fitWarning ? ' FIT WARNING' : ''}`);
  console.log(`gap mean ${f(r.effectAverage)}, at end ${f(r.effectAtEnd)}; floored rank ${r.rank} of ${r.donors + 1}, p ${f(r.p)} (min ${f(r.minP)}); ratio rank ${r.tests.ratio.rank}; post-only rank ${r.tests.post.rank}`);
  console.log('gap by year: ' + r.labels.map((l, i) => `${l} ${f(r.gap[i], 2)}`).filter((_, i) => i >= r.labels.indexOf(String(P.date)) - 2).join(', '));
  for (const c of r.balance) console.log(`  balance ${c.name}: treated ${f(c.treated)}, synthetic ${f(c.synthetic)}, std gap ${f(c.stdGap, 2)}, placebos better ${f(100 * c.placeboShare, 0)}%${c.placeboWarning ? ' WARNING' : ''}`);
  const fake = synthResult({ csv: P.csv, column: P.column, date: P.fake.date, donors: ['all'], window: P.fake.window });
  console.log(`in-time placebo, window ${P.fake.window}, fake date ${P.fake.date}: gap mean ${f(fake.effectAverage)}, floored rank ${fake.rank} of ${fake.donors + 1}, p ${f(fake.p)}`);
  const loo = r.weights.filter((w) => w.weight >= 0.05).map((w) => {
    const q = synthResult({ csv: P.csv, column: P.column, date: P.date, donors: pool.filter((d) => d !== w.name), window: P.window });
    console.log(`leave out ${w.name} (${f(w.weight)}): gap mean ${f(q.effectAverage)}, at end ${f(q.effectAtEnd)}, floored rank ${q.rank} of ${q.donors + 1}; new weights ${q.weights.filter((x) => x.weight >= 0.05).map((x) => `${x.name} ${f(x.weight, 2)}`).join(', ')}`);
    return q;
  });
  res[tag] = { r, paperW, fake, loo };
  console.log('');
}
const G = res.G, B = res.B;
const bars = [
  ['1 G estimate: mean gap -2500..-800, at 2003 < 0, >= 60% weight on the paper\'s five', G.r.effectAverage >= -2500 && G.r.effectAverage <= -800 && G.r.effectAtEnd < 0 && G.paperW >= 0.6],
  ['2 G test: floored rank 1 of 17', G.r.rank === 1],
  ['3 B estimate: mean gap in (-1.5, 0), >= 60% weight on CAT + MAD', B.r.effectAverage < 0 && B.r.effectAverage > -1.5 && B.paperW >= 0.6],
  ['4 B test: floored rank <= 3 of 17', B.r.rank <= 3],
  ['5 in-time placebos: neither ranks 1', G.fake.rank > 1 && B.fake.rank > 1],
  ['6 leave-one-out: every refit keeps a negative mean gap', [...G.loo, ...B.loo].every((q) => q.effectAverage < 0)],
];
for (const [b, ok] of bars) console.log(`${ok ? 'holds' : 'FAILS'}  bar ${b}`);
