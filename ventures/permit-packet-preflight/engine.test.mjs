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
test('one file shared by two lines is flagged, not silently double counted', () => {
  const r = preflight('Site plan\nFloor plans', ['site-plan.pdf']);
  const sp = r.rows[0], fp = r.rows[1];
  assert.equal(sp.file, 'site-plan.pdf'); assert.equal(sp.shared, false);
  assert.equal(fp.status, 'missing');
});
test('combined plan set matches several lines, marked shared', () => {
  const r = preflight('Foundation plan\nFloor plans\nElevations', ['foundation-floor-plans-elevations.pdf']);
  assert.equal(r.summary.missing, 0);
  assert.ok(r.summary.shared >= 1);
  assert.match(report(r), /combined set/);
});
