import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChecklist, preflight, report, tokens } from './engine.mjs';
const CL = `- Completed permit application
- Site plan showing setbacks
- Foundation plan
- Floor plans
- Structural calculations (if applicable)
- Energy compliance report
- Contractor license`;
test('found, missing and optional', () => {
  const r = preflight(CL, ['Application-signed.pdf','site-plan.pdf','Foundation_Plan_A2.pdf','floorplans.pdf','energy-rescheck.pdf']);
  assert.equal(r.ok, true);
  assert.deepEqual(r.missing, ['Contractor license']);
  assert.equal(r.rows.find(x => x.item.startsWith('Structural')).status, 'optional-missing');
  assert.equal(r.summary.found, 5);
});
test('unmatched files listed', () => {
  const r = preflight(CL, ['photo-of-dog.jpg']);
  assert.deepEqual(r.unmatchedFiles, ['photo-of-dog.jpg']);
  assert.equal(r.summary.missing, 6);
});
test('hostile input refused with reasons', () => {
  assert.equal(preflight(null, []).ok, false);
  assert.equal(preflight('', []).ok, false);
  assert.equal(preflight(CL, 'x').ok, false);
  assert.equal(preflight(CL, [1]).ok, false);
  assert.equal(preflight(CL, [], { threshold: 0 }).ok, false);
  assert.equal(parseChecklist('x'.repeat(200001)).ok, undefined);
  assert.deepEqual(tokens(5), []);
});
test('report text', () => {
  const t = report(preflight(CL, ['site-plan.pdf']));
  assert.match(t, /\[x\] Site plan/);
  assert.match(t, /not a content check/);
  assert.match(report({ ok: false, errors: ['e'] }), /Cannot check/);
});
