// Post hoc, after round three's verdict (eval/update-rate-stale-lr.out.txt: K1 failed, R cells called
// stale 7.0% / 11.5% / 9.0%). Descriptive only, fresh seed 5, 80 series a cell, nothing ships from it.
// Asks where the false calls come from: the stretch the update-rate partition hands the test, the true
// slow half (steps 0-149, or 150-299 for R2), or the stretch trimmed by 15 steps on the side of the cut.
// usage: node eval/update-rate-stale-lr-why.mjs > eval/update-rate-stale-lr-why.out.txt
import { CELLS } from './update-rate-stale-lr.mjs';
import { makeRng } from './update-rate-sim.mjs';
import { updateRateChanges, smallestStep } from '../update-rate.mjs';
import { toTicks, staleLikelihoodRatio, staleTest } from '../rounded-walk.mjs';
const rnd = makeRng(5);
for (const name of ['R1','R2','R3','X1']) {
  let n=0, cut=0, pure=0, trim=0, overlap=0;
  for (let i = 0; i < 80; i++) {
    const v = CELLS[name](rnd);
    const u = updateRateChanges(v, { catchUp: { method: 'lr', lr: 5.41, test: staleTest } });
    if (!u.changes.length) continue;
    const c = u.changes.reduce((a, z) => (Math.abs(z.index - 150) < Math.abs(a.index - 150) ? z : a));
    if (!(c.rounding || c.catchUp)) continue; n++;
    if (c.catchUp) cut++;
    const slowFirst = name !== 'R2';
    const [a,b] = slowFirst ? [0,149] : [150,299];
    if (staleLikelihoodRatio(toTicks(v,a,b,0.1)).lr >= 5.41) pure++;
    // pipeline stretch trimmed by 15 steps at the change side
    const st = u.stretches.find(s => s.from <= (slowFirst?100:200) && s.to >= (slowFirst?100:200));
    if ((slowFirst && st.to > 150) || (!slowFirst && st.from < 150)) overlap++;
    const ta = slowFirst ? st.from-1 : st.from-1+15, tb = slowFirst ? st.to-15 : st.to;
    if (staleLikelihoodRatio(toTicks(v,ta,tb,0.1)).lr >= 5.41) trim++;
  }
  console.log(name, 'one-tick', n, 'called stale: pipeline stretch', cut, '| true slow half', pure, '| stretch trimmed 15 at the cut', trim, '| stretch runs past 150', overlap);
}
