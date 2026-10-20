// The parallel path of the in-browser trainer (train/panel.js runs folds in separate workers):
// folds computed independently, in any order, sent through structured cloning as postMessage
// does, then merged with mergeFolds() and scored with summarize(), give exactly the
// single-thread crossValidate() result, which matches scikit-learn (train/sklearn_reference.json).
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { strict as assert } from 'node:assert';
import * as F from '../train/fit.js';

const dir = new URL('../train/', import.meta.url);
const D = F.decode(JSON.parse(gunzipSync(readFileSync(new URL('nsfg_pooled_women.json.gz', dir)))));
const R = F.intervals(D);
const ref = JSON.parse(readFileSync(new URL('sklearn_reference.json', dir)));
const kinds = ['constant', 'duration_only', 'additive_spline', 'tree_depth4'];

const serial = F.crossValidate(D, R, kinds);
const folds = [3, 0, 4, 1, 2].map((f) => structuredClone(F.foldPredictions(D, R, kinds, f)));
// the page merges with only the sizes it learned from the worker's 'loaded' message
const parallel = F.summarize(D, R, kinds, F.mergeFolds({ n: D.n }, { n: R.n }, kinds, folds));
for (const k of kinds) {
  for (const key of ['heldout_mean_deviance', 'deviance_gain_percent', 'harrell_c', 'observed_expected']) {
    const a = serial[k][key], b = parallel[k][key];
    if (a == null) assert.equal(b, null, `${k} ${key}`);
    else assert.ok(Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a)), `${k} ${key}: ${a} vs ${b}`);
  }
  assert.deepEqual(parallel[k].calibration, serial[k].calibration, `${k} calibration`);
  assert.ok(Math.abs(parallel[k].deviance_gain_percent - ref.models[k].deviance_gain_percent) <= 1e-3, `${k} vs scikit-learn`);
}
// every held-out marriage-year and woman is covered exactly once
const seenRows = new Uint8Array(R.n), seenPeople = new Uint8Array(D.n);
for (const fold of folds) {
  for (const r of fold.constant.rows) seenRows[r]++;
  for (const i of fold.constant.people) seenPeople[i]++;
}
assert.ok(seenRows.every((c) => c === 1), 'each marriage-year is held out once');
assert.ok(seenPeople.every((c) => c === 1), 'each woman is held out once');
console.log(`train_parallel: 5 folds in any order merge to the single-thread result; GLM ${parallel.additive_spline.deviance_gain_percent.toFixed(3)}%, tree ${parallel.tree_depth4.deviance_gain_percent.toFixed(3)}%`);
