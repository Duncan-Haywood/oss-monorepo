import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from './cli.mjs';

const deps = JSON.stringify([
  { name: 'a', version: '1', license: 'MIT' },
  { name: 'b', version: '2', license: 'GPL-3.0-only' },
  { name: 'c', version: '3', license: '' },
]);
const readFile = async () => deps;

test('check exits 1 on a conflict and names the fix', async () => {
  const r = await run(['check', 'deps.json', '--project', 'proprietary-distributed'], { readFile });
  assert.equal(r.exitCode, 1);
  assert.match(r.output, /CONFLICT\s+b@2/);
  assert.match(r.output, /Fix:/);
});

test('check exits 0 when nothing conflicts, even with review items, unless --strict', async () => {
  assert.equal((await run(['check', 'd', '--project', 'saas'], { readFile })).exitCode, 0);
  assert.equal((await run(['check', 'd', '--project', 'saas', '--strict'], { readFile })).exitCode, 1);
});

test('--json, --allow, --linking and bad input', async () => {
  const j = JSON.parse((await run(['check', 'd', '--project', 'saas', '--json', '--allow', 'c'], { readFile })).output);
  assert.equal(j.counts.review, 0);
  assert.equal((await run(['check', 'd'], { readFile })).exitCode, 2);
  assert.equal((await run(['check', 'd', '--project', 'banana'], { readFile })).exitCode, 2);
  assert.equal((await run(['check', 'd', '--project', 'saas', '--linking', 'x'], { readFile })).exitCode, 2);
  assert.equal((await run(['check', 'd', '--project', 'saas'], { readFile: async () => { throw new Error('nope'); } })).exitCode, 2);
});

test('notices and scan and help', async () => {
  assert.match((await run(['notices', 'd'], { readFile })).output, /THIRD-PARTY NOTICES/);
  const written = [];
  const s = await run(['scan', '--out', 'o.json'], { scan: async () => [{ name: 'z', version: '1', license: 'MIT' }], writeFile: async (p, t) => written.push([p, t]) });
  assert.match(s.output, /Wrote 1 package/);
  assert.equal(written[0][0], 'o.json');
  assert.equal((await run(['--help'])).exitCode, 0);
  assert.equal((await run(['bogus'])).exitCode, 2);
});
