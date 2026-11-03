import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkRelease } from './release.mjs';
import { run } from './release-cli.mjs';

const here = new URL('.', import.meta.url).pathname;
const good = () => JSON.parse(readFileSync(join(here, 'examples/release-example.json'), 'utf8'));
const msgs = (r) => r.findings.map((x) => `${x.where}: ${x.msg}`).join('\n');

test('the invented example release passes', () => {
  const r = checkRelease(good());
  assert.equal(r.ok, true, msgs(r));
  assert.equal(r.warnings, 0);
});

test('a post-1929 source is an error; a missing page is an error', () => {
  const a = good();
  a.tracks[0].source.year = 1961;
  assert.match(msgs(checkRelease(a)), /from 1961/);
  const b = good();
  delete b.tracks[0].source.page;
  assert.match(msgs(checkRelease(b)), /cite the chant source/);
});

test('synthesised voices need a disclosure and may not be credited to monks', () => {
  const a = good();
  delete a.aiDisclosure;
  assert.match(msgs(checkRelease(a)), /AI disclosure/);
  const b = good();
  b.description = 'Sung by the monks of an abbey';
  const r = checkRelease(b);
  assert.equal(r.ok, false);
  assert.match(msgs(r), /real community/);
  const c = good();
  c.aiDisclosure = 'Made with love.';
  assert.match(msgs(checkRelease(c)), /never says/);
});

test('real singers must be named; samples must be empty', () => {
  const a = good();
  a.voices = { synthesised: false };
  assert.match(msgs(checkRelease(a)), /name them/);
  const b = good();
  b.samples = ['some-record.wav'];
  assert.match(msgs(checkRelease(b)), /never samples/);
});

test('cover art: square, big enough, a known format, no web address, with an origin', () => {
  const a = good();
  a.cover = { width: 3000, height: 2000, format: 'png', origin: 'x' };
  assert.match(msgs(checkRelease(a)), /must be square/);
  const b = good();
  b.cover = { width: 1400, height: 1400, format: 'gif', origin: 'x' };
  const m = msgs(checkRelease(b));
  assert.match(m, /under 3000/);
  assert.match(m, /format "gif"/);
  const c = good();
  c.cover.hasText = true;
  c.cover.text = 'listen at www.example.com';
  assert.match(msgs(checkRelease(c)), /web addresses/);
  const d = good();
  delete d.cover.origin;
  assert.match(msgs(checkRelease(d)), /where the artwork came from/);
});

test('ISRC format and duplicates, short tracks, master report', () => {
  const a = good();
  a.tracks.push({ ...a.tracks[0], title: 'Second', isrc: 'QZABC2700001' });
  assert.match(msgs(checkRelease(a)), /used twice/);
  const b = good();
  b.tracks[0].isrc = 'QZ-ABC-27-00001';
  assert.match(msgs(checkRelease(b)), /malformed/);
  const c = good();
  c.tracks[0].seconds = 20;
  const rc = checkRelease(c);
  assert.equal(rc.ok, true);
  assert.match(msgs(rc), /under 30 s/);
  const d = good();
  d.tracks[0].master = { pass: false, checks: [{ name: 'true peak', ok: false }] };
  assert.match(msgs(checkRelease(d)), /true peak/);
  delete d.tracks[0].master;
  assert.match(msgs(checkRelease(d)), /no master report/);
});

test('a modern translation is refused and an empty release is not ready', () => {
  const a = good();
  a.tracks[0].translationUsed = true;
  assert.match(msgs(checkRelease(a)), /translation/);
  const r = checkRelease({});
  assert.equal(r.ok, false);
  assert.ok(r.errors >= 5);
});

test('CLI: exit codes and JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cf-'));
  const ok = run([join(here, 'examples/release-example.json')]);
  assert.equal(ok.code, 0);
  const bad = join(dir, 'bad.json');
  writeFileSync(bad, JSON.stringify({ title: 'x' }));
  assert.equal(run([bad]).code, 1);
  assert.equal(JSON.parse(run([bad, '--json']).text).ok, false);
  assert.equal(run([join(dir, 'nope.json')]).code, 2);
  assert.equal(run([]).code, 2);
});
