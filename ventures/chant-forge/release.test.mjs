import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isrcOk, gtinOk, imageSize, checkRelease } from './release.mjs';
import { run } from './release-cli.mjs';

function png(w, h) { const b = Buffer.alloc(33); b.writeUInt32BE(0x89504e47, 0); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; }
function wav(secs = 2, rate = 44100, amp = 0.05) {
  const n = secs * rate, b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { const v = Math.round(amp * 32767 * Math.sin(2 * Math.PI * 440 * i / rate)); b.writeInt16LE(v, 44 + i * 4); b.writeInt16LE(v, 46 + i * 4); }
  return b;
}
function fixture() {
  const d = mkdtempSync(join(tmpdir(), 'rel-'));
  writeFileSync(join(d, 'c.png'), png(3000, 3000)); writeFileSync(join(d, 'a.wav'), wav()); writeFileSync(join(d, 'x.gabc'), 'name: x;\n%%\n(c4) A(f)');
  const rel = {
    title: 'Dies Irae (Gym Mix)', artist: 'Test Choir', type: 'single', releaseDate: '2026-12-01', pLine: '℗ 2026 Test', cLine: '© 2026 Test',
    cover: 'c.png', upc: '036000291452', aiDisclosure: { level: 'assisted', tools: 'Chant Forge (rule-based MIDI)', parts: 'arrangement' }, credits: [{ role: 'arranger', name: 'Test' }],
    tracks: [{ title: 'Dies Irae', isrc: 'USABC2600001', language: 'la', explicit: false, audio: 'a.wav', source: { edition: 'Graduale Romanum', year: 1908, rights: 'public domain', gabcFile: 'x.gabc' } }],
  };
  return { d, rel };
}
test('ISRC and UPC check digits', () => {
  assert.ok(isrcOk('US-ABC-26-00001')); assert.ok(!isrcOk('USABC260000')); assert.ok(!isrcOk('1SABC2600001'));
  assert.ok(gtinOk('036000291452')); assert.ok(!gtinOk('036000291453')); assert.ok(gtinOk('4006381333931')); assert.ok(!gtinOk('12345'));
});
test('imageSize reads PNG and a JPEG SOF0', () => {
  assert.deepEqual(imageSize(png(3000, 2000)), { type: 'png', w: 3000, h: 2000 });
  const j = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0x0b, 0xb8, 0x0b, 0xb8, 3, 0]);
  assert.deepEqual(imageSize(j), { type: 'jpeg', w: 3000, h: 3000 });
});
test('a complete release fails only on the master check of a quiet sine; skipMaster passes', () => {
  const { d, rel } = fixture();
  assert.ok(checkRelease(rel, d, { skipMaster: true }).pass);
  assert.ok(!checkRelease(rel, d).pass);
});
test('missing AI disclosure, pre-1929 source, duplicate ISRC and small cover are caught', () => {
  const { d, rel } = fixture();
  rel.aiDisclosure = {}; rel.tracks[0].source.year = 1974; rel.type = 'ep'; rel.tracks.push({ ...rel.tracks[0] }); writeFileSync(join(d, 'c.png'), png(1500, 1500));
  const r = checkRelease(rel, d, { skipMaster: true });
  const bad = (n) => r.checks.some((c) => !c.ok && c.name.includes(n));
  assert.ok(bad('AI disclosure level')); assert.ok(bad('pre-1929')); assert.ok(bad('ISRC unique')); assert.ok(bad('3000 px'));
  assert.equal(r.checks.find((c) => c.name.includes('3000 px')).level, 'WARN');
});
test('AI level none contradicts a credit that names a voice model', () => {
  const { d, rel } = fixture();
  rel.aiDisclosure = { level: 'none' }; rel.credits = [{ role: 'vocals', name: 'AI vocal model' }];
  assert.ok(checkRelease(rel, d, { skipMaster: true }).checks.some((c) => !c.ok && c.name === 'AI level matches credits'));
});
test('release date lead time warns inside seven days', () => {
  const { d, rel } = fixture();
  const r = checkRelease(rel, d, { skipMaster: true, today: '2026-11-30' });
  assert.equal(r.checks.find((c) => c.name.startsWith('release date at least')).level, 'WARN');
});
test('cli reports usage, bad file and a pass', () => {
  assert.equal(run([]).code, 2); assert.equal(run(['/nonexistent.json']).code, 2);
  const { d, rel } = fixture(); writeFileSync(join(d, 'r.json'), JSON.stringify(rel));
  const o = run([join(d, 'r.json'), '--skip-master']); assert.equal(o.code, 0); assert.match(o.text, /ready to upload/);
});
