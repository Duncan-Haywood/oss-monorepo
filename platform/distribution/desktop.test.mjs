import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  productName, crateName, suites, buildDesktop, plan, mainRs, CSP, icoFromPngs, icnsFromPngs,
  wingetManifests, wingetSegment, withHomeLink, launcherHtml, INSTALLER_URL_PLACEHOLDER,
} from './desktop.mjs';
import { renderIcon } from '../pages/offline.mjs';

const PAGE = '<title>Demo Tool — x</title><meta name="description" content="Does a thing.">'
  + '<body><script type="module">import { f } from "./calc.mjs"; f();</script></body>';
const CALC = 'export const f = () => 1;\n';

/** A fake repository root holding ventures/<slug>/ for each entry. */
async function fixtureRoot(ventures) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-'));
  for (const [slug, files] of Object.entries(ventures)) {
    await fs.mkdir(path.join(root, 'ventures', slug), { recursive: true });
    for (const [n, b] of Object.entries(files)) await fs.writeFile(path.join(root, 'ventures', slug, n), b);
  }
  return root;
}
const DEMO = { 'index.html': PAGE, 'calc.mjs': CALC, LICENSE: 'MIT License\n' };

test('productName is safe in installer file names', () => {
  assert.equal(productName('Shift Roster Builder — free'), 'Shift Roster Builder');
  assert.equal(productName('Trade & contractor bids'), 'Trade and contractor bids');
  assert.doesNotMatch(productName('Fee: £/€ calc — x'), /[:/£€]/);
  assert.ok(productName('word '.repeat(30)).length <= 40);
});

test('crateName is a valid Cargo package name', () => {
  assert.equal(crateName('shift-roster-builder'), 'shift-roster-builder');
  assert.equal(crateName('1099k-reconciliation-worksheet'), 'app-1099k-reconciliation-worksheet');
});

test('buildDesktop bundles the page and its imports under dist/, and nothing from the extension', async () => {
  const root = await fixtureRoot({ 'demo-tool': DEMO });
  const p = await buildDesktop({ target: 'demo-tool', root });
  assert.equal(p.identifier, 'io.github.duncanhaywood.demotool');
  assert.equal(p.name, 'Demo Tool');
  const names = Object.keys(p.files);
  for (const f of ['dist/index.html', 'dist/demo-tool/index.html', 'dist/demo-tool/calc.mjs', 'dist/demo-tool/inline-1.js', 'src-tauri/src/main.rs', 'src-tauri/build.rs',
    'src-tauri/Cargo.toml', 'src-tauri/tauri.conf.json', 'src-tauri/icons/icon.ico', 'src-tauri/icons/icon.icns',
    'src-tauri/icons/32x32.png', 'package.json', 'BUILD.md', 'LICENSE']) {
    assert.ok(names.includes(f), f);
  }
  assert.ok(!names.some((n) => /manifest\.json|background\.js|dist\/demo-tool\/icons\//.test(n)));
  assert.match(p.files['dist/index.html'], /http-equiv="refresh" content="0; url=\.\/demo-tool\/index\.html"/, 'dist/ mirrors the site, and the root points at the tool');
  assert.doesNotMatch(p.files['dist/demo-tool/index.html'], /All tools/, 'no launcher link in a one-tool app');
  const rs = p.files['src-tauri/src/main.rs'];
  assert.match(rs, /WebviewUrl::App\("demo-tool\/index\.html"\.into\(\)\)/);
  assert.match(rs, /const PAGES: &\[&str\] = &\["\/", "\/demo-tool\/"\];/);
  assert.match(rs, /const SITE: &str = "https:\/\/duncan-haywood\.github\.io\/oss-monorepo\/";/);
  assert.equal(names.filter((n) => n.startsWith('winget/')).length, 3);
});

test('tauri.conf.json forbids the network, grants nothing to the page and lists every icon', async () => {
  const root = await fixtureRoot({ 'demo-tool': DEMO });
  const p = await buildDesktop({ target: 'demo-tool', root });
  const conf = JSON.parse(p.files['src-tauri/tauri.conf.json']);
  assert.equal(conf.identifier, p.identifier);
  assert.equal(conf.build.frontendDist, '../dist');
  assert.equal(conf.app.security.csp, CSP);
  assert.match(CSP, /connect-src 'none'/);
  assert.match(CSP, /script-src 'self';/, 'no inline or remote script');
  assert.equal(conf.app.withGlobalTauri, false);
  assert.deepEqual(conf.app.windows, [], 'main.rs makes the window so it can refuse navigation');
  assert.ok(!names(p).some((n) => n.startsWith('src-tauri/capabilities/')), 'no capability: the page can call no command');
  for (const icon of conf.bundle.icon) assert.ok(p.files[`src-tauri/${icon}`], icon);
  assert.match(conf.bundle.homepage, /\?ref=desktop$/);
  assert.equal(conf.bundle.macOS.signingIdentity, '-', 'ad-hoc only; a Developer ID is the owner\'s');
  assert.match(p.files['src-tauri/Cargo.toml'], /^tauri = \{ version = "2"/m);
  assert.match(JSON.parse(p.files['package.json']).devDependencies['@tauri-apps/cli'], /^2\.\d+\.\d+$/);
});
const names = (p) => Object.keys(p.files);

test('the Rust shell keeps navigation inside the bundle and has no network client', () => {
  const rs = mainRs({ title: 'Demo "Tool"', pages: ['/', '/a/'] });
  assert.equal([...rs].filter((c) => c === '{').length, [...rs].filter((c) => c === '}').length, 'braces balance');
  assert.equal([...rs].filter((c) => c === '(').length, [...rs].filter((c) => c === ')').length, 'parens balance');
  assert.match(rs, /\.title\("Demo \\"Tool\\""\)/, 'the title is a Rust string literal');
  assert.match(rs, /on_navigation/);
  assert.match(rs, /"tauri" => url\.host_str\(\) == Some\("localhost"\)/);
  assert.match(rs, /if is_bundled_page\(path\) \{\s*return true;/, 'only bundled pages load in the window');
  assert.match(rs, /append_pair\("ref", "desktop"\)/, 'links to the site are counted as this channel');
  assert.match(rs, /Some\("tauri\.localhost"\)/);
  assert.match(rs, /open::that_detached/);
  assert.doesNotMatch(rs.replace(/const SITE[^\n]*/, ''), /reqwest|TcpStream|ureq|hyper|https?:\/\/(?!tauri\.localhost)[a-z]/i);
});

test('the .ico and .icns containers point at real PNGs', () => {
  const pngs = [16, 256].map((size) => ({ size, png: renderIcon({ size }) }));
  const ico = icoFromPngs(pngs);
  assert.equal(ico.readUInt16LE(2), 1, 'type 1 = icon');
  assert.equal(ico.readUInt16LE(4), 2);
  assert.equal(ico[6], 16);
  assert.equal(ico[6 + 16], 0, '256 px is written as 0');
  const off = ico.readUInt32LE(6 + 16 + 12);
  assert.equal(ico.subarray(off, off + 8).toString('latin1'), '\x89PNG\r\n\x1a\n');
  const icns = icnsFromPngs([{ size: 128, png: renderIcon({ size: 128 }) }]);
  assert.equal(icns.subarray(0, 4).toString(), 'icns');
  assert.equal(icns.readUInt32BE(4), icns.length);
  assert.equal(icns.subarray(8, 12).toString(), 'ic07');
});

test('a suite bundles each tool in its own folder behind a launcher with a way back', async () => {
  const learning = suites().learning;
  assert.ok(learning && learning.test('ai-engineering-academy'));
  const root = await fixtureRoot({ 'ai-engineering-academy': DEMO, 'listen-and-learn-audio': DEMO, 'shift-roster-builder': DEMO });
  const p = await buildDesktop({ target: 'learning', root });
  assert.deepEqual(p.tools, ['ai-engineering-academy', 'listen-and-learn-audio']);
  assert.equal(p.identifier, 'io.github.duncanhaywood.suitelearning');
  assert.match(p.files['dist/index.html'], /href="\.\/ai-engineering-academy\/index\.html"/);
  assert.match(p.files['dist/index.html'], /not legal, tax, financial or professional advice/);
  assert.match(p.files['dist/ai-engineering-academy/index.html'], /<body><a href="\.\.\/index\.html"/);
  assert.match(p.files['src-tauri/src/main.rs'], /WebviewUrl::App\("index\.html"\.into\(\)\)/);
  assert.match(p.files['src-tauri/src/main.rs'], /&\["\/", "\/ai-engineering-academy\/", "\/listen-and-learn-audio\/"\]/);
  assert.ok(p.files['dist/listen-and-learn-audio/calc.mjs']);
  assert.ok(!Object.keys(p.files).some((n) => n.startsWith('dist/shift-roster-builder/')));
});

test('launcher and home link escape and insert safely', () => {
  assert.match(launcherHtml('X', [{ slug: 'a', name: '<b>', description: 'a & b' }]), /&lt;b&gt;.*\n?.*a &amp; b/);
  assert.match(withHomeLink('<p>no body</p>'), /^<a href="\.\.\/index\.html"/);
});

test('buildDesktop skips what the extension packager skips, and refuses odd targets', async () => {
  const root = await fixtureRoot({
    nolicense: { 'index.html': PAGE, 'calc.mjs': CALC, LICENSE: 'x' },
    remote: { 'index.html': `${PAGE}<script src="https://cdn.example/x.js"></script>`, LICENSE: 'MIT License' },
  });
  assert.match((await buildDesktop({ target: 'nolicense', root })).skip, /MIT/);
  assert.match((await buildDesktop({ target: 'remote', root })).skip, /another origin/);
  assert.match((await buildDesktop({ target: '../etc', root })).skip, /not a venture slug/);
  assert.match((await buildDesktop({ target: 'more', root })).skip, /no tool/);
});

test('winget manifests carry one identifier, a valid segment shape and the placeholder until filled', () => {
  const files = wingetManifests({ name: 'Shift Roster Builder', description: 'Does a thing.', homepage: 'https://example.com/x/' });
  assert.deepEqual(Object.keys(files).sort(), [
    'DuncanHaywood.ShiftRosterBuilder.installer.yaml', 'DuncanHaywood.ShiftRosterBuilder.locale.en-US.yaml', 'DuncanHaywood.ShiftRosterBuilder.yaml']);
  for (const body of Object.values(files)) {
    assert.match(body, /^PackageIdentifier: DuncanHaywood\.ShiftRosterBuilder$/m);
    assert.match(body, /^ManifestVersion: 1\.6\.0$/m);
  }
  assert.ok(files['DuncanHaywood.ShiftRosterBuilder.installer.yaml'].includes(INSTALLER_URL_PLACEHOLDER));
  const filled = wingetManifests({ name: 'A', description: 'd', homepage: 'https://example.com/', installerUrl: 'https://github.com/o/r/releases/download/t/A.msi', sha256: 'ab'.repeat(32) });
  assert.match(filled['DuncanHaywood.A.installer.yaml'], /InstallerSha256: (AB){32}\n/);
  assert.ok(wingetSegment('x'.repeat(50)).length <= 32);
});

test('plan has no duplicate identifiers across the real catalogue, and every suite but the tiny ones has tools', async () => {
  const { ok, suites: bySuite } = await plan();
  assert.ok(ok.length > 100);
  assert.equal(new Set(ok.map((o) => o.identifier)).size, ok.length);
  assert.ok(Object.keys(bySuite).includes('ci'));
  assert.ok(bySuite.ci > 10);
});
