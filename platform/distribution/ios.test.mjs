import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { storeName, buildIos, plan, APP_SWIFT, CSP, PRIVACY_MANIFEST } from './ios.mjs';
import { renderIcon } from '../pages/offline.mjs';

async function fixture(files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ios-'));
  for (const [n, b] of Object.entries(files)) await fs.writeFile(path.join(dir, n), b);
  return dir;
}
const PAGE = '<title>Demo Tool — x</title><meta name="description" content="Does a thing.">'
  + '<script type="module">import { f } from "./calc.mjs"; f();</script>';
const CALC = 'export const f = () => 1;\n';

test('storeName fits the App Store\'s 30 characters', () => {
  assert.equal(storeName('Shift Roster Builder — free'), 'Shift Roster Builder');
  assert.ok(storeName('x'.repeat(80)).length <= 30);
});

test('opaque icons are RGB with no alpha channel, as the App Store requires', () => {
  const png = renderIcon({ size: 64, opaque: true });
  assert.equal(png[24], 8);
  assert.equal(png[25], 2, 'PNG colour type 2 = RGB');
  assert.equal(renderIcon({ size: 64 })[25], 6, 'the default icon is unchanged');
});

test('buildIos bundles the page and what it imports, and nothing from the extension', async () => {
  const dir = await fixture({ 'index.html': PAGE, 'calc.mjs': CALC, LICENSE: 'MIT License\n' });
  const p = await buildIos({ slug: 'demo-tool', dir });
  assert.equal(p.bundleId, 'io.github.duncanhaywood.demotool');
  const names = Object.keys(p.files);
  for (const f of ['Web/index.html', 'Web/calc.mjs', 'Web/inline-1.js', 'Sources/App.swift', 'project.yml',
    'PrivacyInfo.xcprivacy', 'Assets.xcassets/AppIcon.appiconset/icon-1024.png', 'store-listing.md', 'BUILD.md', 'LICENSE']) {
    assert.ok(names.includes(f), f);
  }
  assert.ok(!names.some((n) => /manifest\.json|background\.js|icons\//.test(n)));
  assert.ok(!/<script(?![^>]*src=)[^>]*>(?!\s*<)/.test(p.files['Web/index.html'].replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')));
});

test('project.yml is valid JSON-as-YAML naming the bundle id and an icon set', async () => {
  const dir = await fixture({ 'index.html': PAGE, 'calc.mjs': CALC, LICENSE: 'MIT License\n' });
  const p = await buildIos({ slug: 'demo-tool', dir });
  const spec = JSON.parse(p.files['project.yml']);
  const base = spec.targets.ToolApp.settings.base;
  assert.equal(base.PRODUCT_BUNDLE_IDENTIFIER, p.bundleId);
  assert.equal(base.ASSETCATALOG_COMPILER_APPICON_NAME, 'AppIcon');
  assert.equal(spec.targets.ToolApp.info.properties.ITSAppUsesNonExemptEncryption, false);
  assert.ok(spec.targets.ToolApp.sources.some((s) => s.path === 'Web' && s.type === 'folder'));
  assert.equal(JSON.parse(p.files['Assets.xcassets/AppIcon.appiconset/Contents.json']).images[0].filename, 'icon-1024.png');
});

test('the privacy manifest declares no tracking and no collected data', () => {
  assert.match(PRIVACY_MANIFEST, /<key>NSPrivacyTracking<\/key>\s*<false\/>/);
  assert.match(PRIVACY_MANIFEST, /<key>NSPrivacyCollectedDataTypes<\/key>\s*<array\/>/);
});

test('the Swift shell forbids the network and leaves the app only for Safari', () => {
  assert.equal([...APP_SWIFT].filter((c) => c === '{').length, [...APP_SWIFT].filter((c) => c === '}').length, 'braces balance');
  assert.equal([...APP_SWIFT].filter((c) => c === '(').length, [...APP_SWIFT].filter((c) => c === ')').length, 'parens balance');
  assert.match(CSP, /connect-src 'none'/);
  assert.ok(APP_SWIFT.includes(CSP));
  assert.doesNotMatch(APP_SWIFT, /URLSession|NSURLConnection|WKWebsiteDataStore\.default\(\)\.removeData|https?:\/\/[a-z]/i);
  assert.match(APP_SWIFT, /file\.path\.hasPrefix\(root\.standardizedFileURL\.path/, 'path traversal is refused');
  assert.match(APP_SWIFT, /UIApplication\.shared\.open\(url\)/);
});

test('buildIos skips what the extension packager skips', async () => {
  assert.match((await buildIos({ slug: 'a', dir: await fixture({ 'index.html': PAGE, 'calc.mjs': CALC, LICENSE: 'x' }) })).skip, /MIT/);
  const remote = await fixture({ 'index.html': `${PAGE}<script src="https://cdn.example/x.js"></script>`, LICENSE: 'MIT License' });
  assert.match((await buildIos({ slug: 'a', dir: remote })).skip, /another origin/);
  assert.match((await buildIos({ slug: 'a', dir: await fixture({}) })).skip, /index.html/);
});

test('plan has no duplicate bundle ids across the real catalogue', async () => {
  const { ok } = await plan();
  assert.ok(ok.length > 100);
  assert.equal(new Set(ok.map((o) => o.bundleId)).size, ok.length);
});
