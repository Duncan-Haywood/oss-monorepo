// The over-cut warning: the plain level model cuts a smooth curve into many steps; a noise floor at twice the
// scatter about a local line (window 25) keeps far fewer. TCPD measurement: eval/tcpd-defaults.mjs, README.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());

// A random walk has no step at all, but the plain level model reads its wandering as many (TCPD's over-cut
// series are mostly wandering or trending ones). A smooth logistic curve with white noise, by contrast, is not
// halved by the floor (a local line follows the bend), so it is not used here.
const walk = () => { seed = 7; let x = 0; return Array.from({ length: 300 }, () => (x += gauss())); };

test('a wandering series raises the warning, and the refit it names cuts far less', () => {
  const values = walk();
  const r = analyze({ values });
  assert.ok(r.pelt.changepoints.length >= 5, `plain level model cut ${r.pelt.changepoints.length} times`);
  assert.ok(r.overcutWarning, 'warning expected');
  assert.ok(r.overcut.refitCuts * 2 <= r.overcut.cuts);
  const follow = analyze({ values, noiseFloor: 2, noiseFloorOrder: 'local', noiseFloorWindow: 25 });
  assert.equal(follow.pelt.changepoints.length, r.overcut.refitCuts, 'the warning reports what the named options give');
  assert.equal(follow.overcutWarning, undefined, 'no warning once the floor is on');
});

test('white noise with two real steps does not raise it', () => {
  seed = 11;
  const values = Array.from({ length: 300 }, (_, t) => (t < 100 ? 0 : t < 200 ? 3 : 1) + gauss());
  const r = analyze({ values });
  assert.equal(r.overcutWarning, undefined);
});

test('off for other models and when autocorrelation is allowed for', () => {
  const values = walk();
  assert.equal(analyze({ values, ar1: true }).overcutWarning, undefined);
  assert.equal(analyze({ values, model: 'meanvar' }).overcutWarning, undefined);
});

test('the committed TCPD measurement says what the README says', () => {
  const out = readFileSync(new URL('./eval/tcpd-defaults.out.txt', import.meta.url), 'utf8');
  assert.match(out, /Over-cut warning: fires on 20 of 31 series/);
  assert.match(out, /better on 20, worse on 0/);
  assert.match(out, /noise floor 2, local 25 minus current default: mean \+0\.211/);
});
