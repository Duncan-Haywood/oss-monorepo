import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanText, hasRisk, summaryLine } from './classify.mjs';

const WF = `jobs:
  a:
    steps:
      - uses: actions/checkout@v3
      - uses: actions/upload-artifact@v3
      - uses: actions/setup-node@v4
      - uses: actions/checkout@v5
      - uses: actions/cache@v2
      # - uses: actions/checkout@v2
      - uses: actions/checkout@8e5e7e5ab8b370d6c329ec480221332ada57f0ab
      - uses: actions/checkout@main
      - uses: actions/unknown@v1
      - uses: someone/checkout@v1
      - uses: actions/github-script@v6
`;

test('classifies each runtime band', () => {
  const f = scanText(WF, 'ci.yml');
  assert.deepEqual(f.map((x) => [x.line, x.type]), [
    [4, 'deprecated-runtime'],
    [5, 'shut-down-version'],
    [6, 'ageing-runtime'],
    [8, 'shut-down-version'],
    [14, 'deprecated-runtime'],
  ]);
  assert.ok(hasRisk(f));
  assert.match(summaryLine(f), /2 shut down, 2 deprecated runtime, 1 ageing/);
});

test('skips SHA, branch, unknown and third-party refs; clean file has no risk', () => {
  const f = scanText('steps:\n  - uses: actions/checkout@v5\n  - uses: actions/checkout@main\n');
  assert.deepEqual(f, []);
  assert.match(summaryLine(f), /No first-party/);
});

test('prototype-named actions do not crash', () => {
  assert.deepEqual(scanText('- uses: actions/constructor@v1\n- uses: actions/__proto__@v1'), []);
});

test('parity with check.py on the same workflow', () => {
  const root = mkdtempSync(join(tmpdir(), 'rdc-'));
  mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
  writeFileSync(join(root, '.github', 'workflows', 'ci.yml'), WF);
  const py = JSON.parse(execFileSync('python3', [new URL('./check.py', import.meta.url).pathname, root, '--format', 'json'], { encoding: 'utf8' }));
  const js = scanText(WF, 'x');
  const pick = (f) => ({ line: f.line, type: f.type, action: f.action, node: f.node, detail: f.detail, remediation: f.remediation });
  assert.deepEqual(js.map(pick), py.map(pick));
});
