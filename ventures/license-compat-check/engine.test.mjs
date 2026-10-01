import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeId, parseExpression, checkCompatibility, parseSnapshot, summarize, noticesText, normalizeContext } from './engine.mjs';

const v = (license, project, opts) => checkCompatibility([{ name: 'x', version: '1', license }], project, opts).results[0];

test('normalizeId handles spdx, aliases and + suffix', () => {
  assert.equal(normalizeId('MIT'), 'mit');
  assert.equal(normalizeId('Apache License, Version 2.0'), 'apache-2.0');
  assert.equal(normalizeId('GPL-2.0+'), 'gpl-2.0-or-later');
  assert.equal(normalizeId('GPLv3'), 'gpl-3.0-only');
  assert.equal(normalizeId('BSL-1.1'), 'busl-1.1');
  assert.equal(normalizeId('BSL-1.0'), 'bsl-1.0');
  assert.equal(normalizeId('wat'), null);
});

test('expressions: OR picks the best branch, AND the worst, legacy slash is OR', () => {
  assert.equal(v('MIT OR GPL-3.0-only', 'proprietary-distributed').verdict, 'ok');
  assert.equal(v('MIT AND GPL-3.0-only', 'proprietary-distributed').verdict, 'conflict');
  assert.equal(v('MIT/Apache-2.0', 'proprietary-distributed').verdict, 'ok');
  assert.equal(v('(MIT OR Apache-2.0) AND ISC', 'saas').verdict, 'ok');
  assert.equal(parseExpression('Apache License, Version 2.0').id, 'apache-2.0');
});

test('proprietary distribution: GPL/AGPL/SSPL conflict, LGPL depends on linking', () => {
  assert.equal(v('GPL-3.0-only', 'proprietary-distributed').verdict, 'conflict');
  assert.equal(v('AGPL-3.0-or-later', 'proprietary-distributed').verdict, 'conflict');
  assert.equal(v('SSPL-1.0', 'proprietary-distributed').verdict, 'conflict');
  assert.equal(v('LGPL-2.1-only', 'proprietary-distributed').verdict, 'review');
  assert.equal(v('LGPL-2.1-only', 'proprietary-distributed', { linking: 'dynamic' }).verdict, 'ok');
  assert.equal(v('MPL-2.0', 'proprietary-distributed').verdict, 'ok');
  assert.equal(v('BUSL-1.1', 'proprietary-distributed').verdict, 'review');
  assert.equal(v('CC-BY-NC-4.0', 'proprietary-distributed').verdict, 'conflict');
});

test('GPL with classpath exception is linkable from proprietary code', () => {
  assert.equal(v('GPL-2.0-only WITH Classpath-exception-2.0', 'proprietary-distributed').verdict, 'ok');
  assert.equal(v('GPL-2.0-only', 'proprietary-distributed').verdict, 'conflict');
});

test('SaaS: GPL ok, AGPL review unless modified, SSPL conflict', () => {
  assert.equal(v('GPL-3.0-only', 'saas').verdict, 'ok');
  assert.equal(v('AGPL-3.0-only', 'saas').verdict, 'review');
  assert.equal(v('AGPL-3.0-only', 'saas', { modified: true }).verdict, 'conflict');
  assert.equal(v('SSPL-1.0', 'saas').verdict, 'conflict');
  assert.equal(v('Elastic-2.0', 'saas').verdict, 'review');
});

test('internal: copyleft not triggered, non-commercial still flagged', () => {
  assert.equal(v('AGPL-3.0-only', 'internal').verdict, 'ok');
  assert.equal(v('CC-BY-NC-4.0', 'internal').verdict, 'review');
});

test('open-source outbound: Apache into GPL-2.0-only conflicts, into GPL-3 does not', () => {
  assert.equal(v('Apache-2.0', 'gpl-2.0-only').verdict, 'conflict');
  assert.equal(v('Apache-2.0', 'gpl-3.0-or-later').verdict, 'ok');
  assert.equal(v('Apache-2.0', 'gpl-2.0-or-later').verdict, 'ok');
});

test('open-source outbound: GPL into MIT conflicts; GPL-2-only vs GPL-3 conflicts; or-later ok', () => {
  assert.equal(v('GPL-3.0-only', 'mit').verdict, 'conflict');
  assert.equal(v('GPL-2.0-only', 'gpl-3.0-or-later').verdict, 'conflict');
  assert.equal(v('GPL-2.0-or-later', 'gpl-3.0-or-later').verdict, 'ok');
  assert.equal(v('GPL-3.0-only', 'gpl-2.0-only').verdict, 'conflict');
  assert.equal(v('AGPL-3.0-only', 'gpl-3.0-or-later').verdict, 'ok');
  assert.equal(v('AGPL-3.0-only', 'gpl-2.0-only').verdict, 'conflict');
});

test('open-source outbound: source-available never fits; MPL-1.1 vs GPL conflicts; EPL vs GPL conflicts', () => {
  assert.equal(v('SSPL-1.0', 'apache-2.0').verdict, 'conflict');
  assert.equal(v('BUSL-1.1', 'mit').verdict, 'conflict');
  assert.equal(v('MPL-1.1', 'gpl-3.0-or-later').verdict, 'conflict');
  assert.equal(v('MPL-2.0', 'gpl-3.0-or-later').verdict, 'ok');
  assert.equal(v('EPL-1.0', 'gpl-3.0-or-later').verdict, 'conflict');
  assert.equal(v('LGPL-3.0-only', 'mit').verdict, 'review');
});

test('missing or unknown license is review, and an allow-list clears it', () => {
  assert.equal(v('', 'saas').verdict, 'review');
  assert.equal(v('Totally Custom', 'saas').verdict, 'review');
  const r = checkCompatibility([{ name: 'x', version: '1', license: '' }], 'saas', { allow: ['X'] });
  assert.equal(r.results[0].verdict, 'ok');
  assert.equal(r.results[0].cleared, true);
});

test('report counts, status and summary', () => {
  const r = checkCompatibility(parseSnapshot('name,version,license\na,1,MIT\nb,2,GPL-3.0-only\nc,3,'), 'proprietary-distributed');
  assert.deepEqual(r.counts, { ok: 1, review: 1, conflict: 1 });
  assert.equal(r.status, 'conflict');
  assert.match(summarize(r).text, /1 conflict/);
  assert.equal(summarize(checkCompatibility([{ name: 'a', version: '1', license: 'MIT' }], 'saas')).status, 'clear');
  assert.equal(summarize(checkCompatibility([], 'saas')).status, 'empty');
});

test('parseSnapshot reads pip-licenses JSON keys, CSV with quotes, and package.json license objects', () => {
  assert.deepEqual(parseSnapshot('[{"Name":"requests","Version":"2.31","License":"Apache Software License"}]'), [{ name: 'requests', version: '2.31', license: 'Apache Software License' }]);
  assert.equal(parseSnapshot('name,version,license\n"a",1,"Apache License, Version 2.0"')[0].license, 'Apache License, Version 2.0');
  assert.equal(parseSnapshot('[{"name":"a","licenses":[{"type":"MIT"},{"type":"ISC"}]}]')[0].license, 'MIT OR ISC');
  assert.throws(() => parseSnapshot('{not json'), /not valid JSON/);
});

test('normalizeContext rejects nonsense and noticesText lists packages', () => {
  assert.throws(() => normalizeContext('banana'), /unknown project/);
  assert.equal(normalizeContext('GPL-3.0+'), 'gpl-3.0-or-later');
  assert.match(noticesText([{ name: 'left-pad', version: '1.3.0', license: 'MIT' }]), /left-pad 1\.3\.0 — MIT/);
});
