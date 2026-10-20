// Per-partner explanations: each perspective's contributions reproduce that row's prediction
// exactly, and the couple's rate is their average (the averaged bars are only approximate).
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { lensView, explain, coupleRate, adapterFor, scoringModels } from '../couple.js';
import { predict, valueFromContributions } from '../engine.js';

const dir = new URL('../models/', import.meta.url);
const load = (f) => lensView(JSON.parse(readFileSync(new URL(f, dir))));
const pre = { priorMarriage: false, intactFamily: 'Yes', raceEth: 'White', kidsBefore: '0', religionRaised: 'Catholic', school: '16–17 years', degree: 'Bachelor', wages: 52000, work: '2,000+ hours', religion: 'Less than weekly' };
const a = { ...pre, sex: 'Woman', age: 28, firstMarriageAge: 28 };
const b = { ...pre, sex: 'Man', age: 30, firstMarriageAge: 30, kidsBefore: '1', religionRaised: 'Baptist' };
const c = { yearsMarried: 0, cohabitedFirst: 'Yes', currentYear: 2026 };

for (const [file, couple] of [['prewedding_harmonized.json', c], ['nlsy79_couples.json', { yearsMarried: 0 }], ['nlsy79_individuals.json', { yearsMarried: 0 }]]) {
  test(`${file}: per-perspective bars are exact, and average to the couple's rate`, () => {
    const bundle = load(file);
    const A = file.startsWith('nlsy79') ? { ...a, age: 40 } : a;
    const B = file.startsWith('nlsy79') ? { ...b, age: 42 } : b;
    const rows = adapterFor(bundle).rows(bundle, A, B, couple, 0);
    assert.equal(rows.length, 2);
    for (const m of scoringModels(bundle).filter((x) => x.kind !== 'tree')) {
      const e = explain(bundle, m, A, B, couple, 0);
      assert.equal(e.perRow.length, 2);
      e.perRow.forEach((p, i) => {
        const want = predict(m, rows[i]);
        assert.ok(Math.abs(valueFromContributions(p) - want) / want < 1e-12, `${m.key} row ${i}`);
      });
      const mean = e.perRow.map(valueFromContributions).reduce((x, y) => x + y, 0) / 2;
      assert.ok(Math.abs(mean - coupleRate(bundle, m, A, B, couple, 0)) / mean < 1e-12);
    }
  });
}
