// Fisher's g test for a periodic component in the residuals of the fitted steps: a cycle read as steps leaves a
// spectral peak that the lag-1 correlation can miss (treering rho 0.16). Run: node eval/spectral-peak.mjs
import { readFileSync } from 'node:fs';
import { analyze, stepResiduals, fisherG } from '../engine.mjs';

export { stepResiduals, fisherG };

const load = (f) => {
  const rows = readFileSync(new URL(`../data/${f}.csv`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
  return { labels: rows.map((r) => r[0]), values: rows.map((r) => +r[1]) };
};
export function check(d, o = {}) {
  const a = analyze({ ...d, ...o });
  return { steps: a.pelt.changepoints.length, ...fisherG(stepResiduals(d.values, a.pelt.changepoints.map((c) => c.index))) };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  for (const f of ['lynx', 'sunspot-year', 'treering', 'lh', 'us-inflation', 'nile', 'lake-huron', 'nhtemp', 'great-discoveries', 'us-accidental-deaths', 'www-usage', 'dax-returns']) {
    let d; try { d = load(f); } catch { continue; }
    const r = check(d);
    console.log(f.padEnd(22), `n=${d.values.length}`.padEnd(8), `steps ${r.steps}`.padEnd(10), `g=${r.g.toFixed(3)} p=${r.p.toExponential(1)} period≈${r.period?.toFixed(1)}`);
  }
}
