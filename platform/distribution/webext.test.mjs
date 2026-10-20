import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { extensionName, clipDescription, rewritePage, importedFiles, buildExtension, zip, crc32, plan } from './webext.mjs';

test('extensionName keeps the part before the dash and fits 45 characters', () => {
  assert.equal(extensionName('Shift Roster Builder — a free weekly tool'), 'Shift Roster Builder');
  assert.ok(extensionName('x'.repeat(80)).length <= 45);
});

test('clipDescription fits Chrome\'s 132 characters', () => {
  assert.equal(clipDescription('a  b\nc'), 'a b c');
  assert.equal(clipDescription('w '.repeat(200)).length, 132);
});

test('rewritePage moves inline scripts out, keeps JSON-LD and module type', () => {
  const html = '<script type="application/ld+json">{"a":1}</script><script type="module">import "./c.mjs";</script><script>var x=1</script>';
  const r = rewritePage(html);
  assert.deepEqual(Object.keys(r.scripts), ['inline-1.js', 'inline-2.js']);
  assert.match(r.html, /<script type="module" src="inline-1.js"><\/script>/);
  assert.match(r.html, /<script src="inline-2.js"><\/script>/);
  assert.match(r.html, /ld\+json">\{"a":1\}/);
});

test('rewritePage refuses what MV3 cannot run or what reaches out', () => {
  assert.match(rewritePage('<button onclick="go()">x</button>').skip, /inline event handlers/);
  assert.match(rewritePage('<script src="https://cdn.example/x.js"></script>').skip, /another origin/);
  assert.match(rewritePage('<script>fetch("/x")</script>').skip, /network/);
  assert.equal(rewritePage('<p onclick-free>ok</p>').skip, undefined);
});

async function fixture(files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'webext-'));
  for (const [n, b] of Object.entries(files)) await fs.writeFile(path.join(dir, n), b);
  return dir;
}
const PAGE = '<title>Demo Tool — x</title><meta name="description" content="Does a thing."><script type="module">import { f } from "./calc.mjs"; f();</script>';

test('buildExtension bundles the closure, asks for no permissions, and has no remote code', async () => {
  const dir = await fixture({ 'index.html': PAGE, 'calc.mjs': 'import {g} from "./g.mjs"; export const f=()=>g;', 'g.mjs': 'export const g=1', LICENSE: 'MIT License\n' });
  const e = await buildExtension({ slug: 'demo', dir });
  const m = JSON.parse(e.files['manifest.json']);
  assert.equal(m.manifest_version, 3);
  assert.equal(m.name, 'Demo Tool');
  assert.equal(m.permissions, undefined);
  assert.equal(m.host_permissions, undefined);
  for (const f of ['calc.mjs', 'g.mjs', 'inline-1.js', 'background.js', 'icons/128.png']) assert.ok(f in e.files, f);
  assert.equal(Buffer.from(e.files['icons/128.png']).subarray(1, 4).toString(), 'PNG');
});

test('buildExtension skips a tool with a package import, a missing import or no MIT licence', async () => {
  const pkg = await fixture({ 'index.html': PAGE, 'calc.mjs': 'import x from "left-pad";', LICENSE: 'MIT License' });
  assert.match((await buildExtension({ slug: 'a', dir: pkg })).skip, /left-pad/);
  const miss = await fixture({ 'index.html': PAGE, LICENSE: 'MIT License' });
  assert.match((await buildExtension({ slug: 'a', dir: miss })).skip, /missing calc.mjs/);
  const lic = await fixture({ 'index.html': PAGE, 'calc.mjs': 'export const f=1', LICENSE: 'proprietary' });
  assert.match((await buildExtension({ slug: 'a', dir: lic })).skip, /MIT/);
  const net = await fixture({ 'index.html': PAGE, 'calc.mjs': 'export const f=()=>fetch("x")', LICENSE: 'MIT License' });
  assert.match((await buildExtension({ slug: 'a', dir: net })).skip, /network/);
});

test('importedFiles refuses to leave the venture directory', async () => {
  const dir = await fixture({});
  assert.match((await importedFiles(dir, ['import "../x.mjs"'])).skip, /outside/);
});

test('zip is a valid, deterministic archive', () => {
  const files = { 'b.txt': 'hello hello hello', 'a/c.bin': Buffer.from([1, 2, 3]) };
  const z = zip(files);
  assert.deepEqual(z, zip(files));
  assert.equal(z.readUInt32LE(0), 0x04034b50);
  const end = z.length - 22;
  assert.equal(z.readUInt32LE(end), 0x06054b50);
  assert.equal(z.readUInt16LE(end + 10), 2);
  // first entry (sorted: a/c.bin) round-trips
  const nameLen = z.readUInt16LE(26);
  const size = z.readUInt32LE(18);
  const body = zlib.inflateRawSync(z.subarray(30 + nameLen, 30 + nameLen + size));
  assert.deepEqual(body, Buffer.from([1, 2, 3]));
  assert.equal(z.readUInt32LE(14), crc32(Buffer.from([1, 2, 3])));
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('the real shift-roster-builder qualifies', async () => {
  const { ok } = await plan({ slugs: ['shift-roster-builder'] });
  assert.equal(ok.length, 1);
});
