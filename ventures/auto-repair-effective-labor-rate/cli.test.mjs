import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { run, parseArgs, EXAMPLE } from './cli.mjs';

const CLI = fileURLToPath(new URL('./cli.mjs', import.meta.url));
const SHOP = { postedLaborRate: '165', monthlyOverhead: '3000', partsGrossProfit: '500', technicianCount: '2', totalTechnicianPay: '2000' };

test('run matches the page arithmetic on the example', () => {
  const r = run(EXAMPLE, SHOP);
  assert.equal(r.ok, true);
  assert.equal(r.figures.customerPayHours, 6);
  assert.ok(Math.abs(r.figures.effectiveLaborRate - (860 + 143) / 7.5) < 1e-9);
  assert.equal(r.byTech.length, 2);
});

test('missing posted rate is an error, not a zero', () => {
  const r = run(EXAMPLE, {});
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.id === 'postedLaborRate'));
});

test('unclassifiable lines are reported, not guessed', () => {
  const r = run(`${EXAMPLE}1006,Ben,Mystery,1,$100,1\n`, SHOP);
  assert.equal(r.skipped.length, 1);
});

test('parseArgs rejects unknown options and missing values', () => {
  assert.throws(() => parseArgs(['--bogus']));
  assert.throws(() => parseArgs(['--posted']));
  assert.equal(parseArgs(['f.csv', '--posted', '150', '--json']).inputs.postedLaborRate, '150');
});

test('CLI end to end via stdin', () => {
  const out = execFileSync('node', [CLI, '-', '--posted', '165', '--overhead', '3000', '--techs', '2', '--tech-pay', '2000', '--json'], { input: EXAMPLE, encoding: 'utf8' });
  assert.equal(JSON.parse(out).ok, true);
  const bad = spawnSync('node', [CLI, '-', '--json'], { input: EXAMPLE, encoding: 'utf8' });
  assert.equal(bad.status, 1);
});
