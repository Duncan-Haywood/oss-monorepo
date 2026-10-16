import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DISCLAIMER, formatSarif, main, readTree, sweep } from './cli.mjs';
import { auditFiles } from './audit.mjs';
import { EXAMPLE_APP } from './example.mjs';

async function run(argv) {
  const out = [];
  const err = [];
  const code = await main(argv, { stdout: (s) => out.push(s), stderr: (s) => err.push(s) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

function writeApp(dir, files) {
  for (const f of files) {
    const p = join(dir, f.path);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, f.text);
  }
}

test('the example app raises every rule it was written to show', () => {
  const ids = auditFiles(EXAMPLE_APP).findings.map((f) => f.id).sort();
  assert.deepEqual(ids, [
    'affiliate-links-no-disclosure', 'ai-output-no-disclosure', 'cloud-no-budget-alarm', 'llm-call-no-output-cap',
    'llm-endpoint-no-spend-control', 'no-license', 'payments-no-terms', 'personal-data-no-privacy-notice',
    'secret-in-tree', 'subscription-no-renewal-terms', 'tracker-without-consent',
  ]);
});

test('readTree skips dependencies, VCS and binaries', () => {
  const dir = mkdtempSync(join(tmpdir(), 'la-'));
  writeApp(dir, [
    { path: 'index.html', text: '<p>hi</p>' },
    { path: 'node_modules/x/index.js', text: 'x' },
    { path: '.git/config', text: 'x' },
    { path: 'logo.png', text: 'x' },
    { path: 'LICENSE', text: 'MIT' },
  ]);
  assert.deepEqual(readTree(dir).map((f) => f.path).sort(), ['LICENSE', 'index.html']);
});

test('scan: text, md, json, sarif, and --fail-on', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'la-'));
  writeApp(dir, EXAMPLE_APP);
  const text = await run(['scan', dir]);
  assert.equal(text.code, 0);
  assert.match(text.out, /\[HIGH\] secret-in-tree/);
  assert.match(text.out, /No warranty/);
  assert.ok(!text.out.includes('9fQx2LmZ7RtW4vK8pN3sJ6hD'), 'reports never print a secret');
  assert.match((await run(['scan', dir, '--format', 'md'])).out, /^## Liability Audit: 11 of 13 checks raised findings/);
  const json = JSON.parse((await run(['scan', dir, '--format', 'json'])).out);
  assert.equal(json.summary.high, 5);
  assert.equal(json.disclaimer, DISCLAIMER);
  const sarif = JSON.parse((await run(['scan', dir, '--format', 'sarif'])).out);
  assert.equal(sarif.version, '2.1.0');
  assert.ok(sarif.runs[0].results.some((r) => r.ruleId === 'tracker-without-consent' && r.level === 'error'));
  assert.equal((await run(['scan', dir, '--fail-on', 'high'])).code, 1);
  assert.equal((await run(['scan', dir, '--fail-on', 'high', '--only', 'no-license'])).code, 0);
  assert.equal((await run(['scan', dir, '--fail-on', 'low', '--only', 'no-license'])).code, 1);
});

test('bad input exits 2', async () => {
  assert.equal((await run(['scan', '/no/such/dir'])).code, 2);
  assert.equal((await run(['scan', '.', '--fail-on', 'severe'])).code, 2);
  const unknown = await run(['scan', '.', '--only', 'made-up-rule']);
  assert.equal(unknown.code, 2);
  assert.match(unknown.err, /unknown rule/);
  assert.equal((await run(['frobnicate'])).code, 2);
});

test('rules and help', async () => {
  const rules = await run(['rules']);
  assert.match(rules.out, /subscription-no-renewal-terms \[high, consumer\]/);
  assert.match((await run(['--help'])).out, /not legal, tax or financial advice/);
});

test('sweep: one row per app, a root licence is inherited', async () => {
  const root = mkdtempSync(join(tmpdir(), 'la-'));
  writeFileSync(join(root, 'LICENSE'), 'MIT');
  writeApp(join(root, 'clean'), [{ path: 'index.html', text: '<p>ok</p>' }]);
  writeApp(join(root, 'leaky'), EXAMPLE_APP);
  const r = sweep(root);
  assert.equal(r.apps, 2);
  assert.equal(r.appsWithFindings, 1);
  assert.equal(r.rows[0].app, 'leaky');
  assert.ok(!r.rows[0].findings.some((f) => f.id === 'no-license'), 'apps inherit the root LICENSE');
  assert.equal(r.byRule['secret-in-tree'].raised, 1);
  assert.match((await run(['sweep', root])).out, /2 apps scanned; 1 raised/);
});

test('SARIF results always point at a file', () => {
  const sarif = formatSarif(auditFiles([{ path: 'a.html', text: '' }]));
  for (const r of sarif.runs[0].results) assert.ok(r.locations[0].physicalLocation.artifactLocation.uri);
});
