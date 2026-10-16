import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { appName, packageId, shortDescription, buildAndroid, plan } from './android.mjs';

test('appName fits Play\'s 30 characters', () => {
  assert.equal(appName('Shift Roster Builder — free'), 'Shift Roster Builder');
  assert.ok(appName('x'.repeat(80)).length <= 30);
});

test('packageId is a valid Java package name, digits led by n', () => {
  assert.equal(packageId('401k-plan-fee-calculator'), 'io.github.duncanhaywood.n401kplanfeecalculator');
  for (const s of ['a-b', '3d-print-price-calculator', 'x']) assert.match(packageId(s), /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/);
});

test('shortDescription fits 80 characters', () => {
  assert.equal(shortDescription('a  b').length, 3);
  assert.equal(shortDescription('w '.repeat(100)).length, 80);
});

async function fixture(files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'android-'));
  for (const [n, b] of Object.entries(files)) await fs.writeFile(path.join(dir, n), b);
  return dir;
}
const PAGE = '<title>Demo Tool — x</title><meta name="description" content="Does a thing.">';

test('buildAndroid writes a TWA manifest that points at the tool and requests nothing', async () => {
  const dir = await fixture({ 'index.html': PAGE, LICENSE: 'MIT License\n' });
  const p = await buildAndroid({ slug: 'demo-tool', dir });
  const m = JSON.parse(p.files['twa-manifest.json']);
  assert.equal(m.packageId, 'io.github.duncanhaywood.demotool');
  assert.equal(m.host, 'duncan-haywood.github.io');
  assert.equal(m.startUrl, '/monorepo-projects/demo-tool/');
  assert.equal(m.enableNotifications, false);
  assert.equal(Buffer.from(p.files['icon-512.png']).subarray(1, 4).toString(), 'PNG');
  const links = JSON.parse(p.files['assetlinks.template.json']);
  assert.equal(links[0].target.package_name, m.packageId);
  assert.match(p.files['store-listing.md'], /Collects or shares user data: \*\*No\*\*/);
  assert.match(p.files['BUILD.md'], /origin root/);
});

test('buildAndroid skips a tool with no MIT licence or a remote file', async () => {
  assert.match((await buildAndroid({ slug: 'a', dir: await fixture({ 'index.html': PAGE, LICENSE: 'x' }) })).skip, /MIT/);
  const remote = await fixture({ 'index.html': `${PAGE}<script src="https://cdn.example/x.js"></script>`, LICENSE: 'MIT License' });
  assert.match((await buildAndroid({ slug: 'a', dir: remote })).skip, /another origin/);
  assert.match((await buildAndroid({ slug: 'a', dir: await fixture({}) })).skip, /index.html/);
});

test('plan has no duplicate package ids across the real catalogue', async () => {
  const { ok } = await plan();
  assert.ok(ok.length > 100);
  assert.equal(new Set(ok.map((o) => o.packageId)).size, ok.length);
});
