// files.mjs: the page's WAV and ZIP writers (browser-safe) against Node's own encoders and readers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32 as zcrc } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { wavBytes, crc32, zipStored } from './files.mjs';
import { encodeWav } from './render.mjs';

test('wavBytes writes the same bytes as render.mjs encodeWav, clipping included', () => {
  const ch = [Float64Array.from([0, 0.5, -0.5, 1.2, -1.2, 1e-5]), Float64Array.from([1, -1, 0.25, 0, 0.001, -0.75])];
  assert.deepEqual(Buffer.from(wavBytes({ rate: 44100, channels: ch })), encodeWav({ rate: 44100, channels: ch }));
});

test('crc32 matches zlib', () => {
  for (const s of ['', 'a', 'The quick brown fox', 'x'.repeat(10000)]) assert.equal(crc32(new TextEncoder().encode(s)), zcrc(s));
});

test('zipStored is read back intact by unzip and Python zipfile, and is deterministic', () => {
  const files = [
    { name: 'chant-choir.wav', bytes: Uint8Array.from({ length: 5000 }, (_, i) => (i * 7) & 0xff) },
    { name: 'chant-drums.wav', bytes: new Uint8Array(0) },
    { name: 'Pange lingua é.txt', bytes: new TextEncoder().encode('gloriosi') },
  ];
  const zip = zipStored(files);
  assert.deepEqual(zipStored(files), zip);
  const dir = mkdtempSync(join(tmpdir(), 'zip-'));
  writeFileSync(join(dir, 'a.zip'), zip);
  const py = execFileSync('python3', ['-I', '-c', 'import sys,zipfile,json; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(json.dumps([[i.filename, list(z.read(i))] for i in z.infolist()]))', join(dir, 'a.zip')], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(py), files.map((f) => [f.name, [...f.bytes]]));
  let hasUnzip = true;
  try { execFileSync('unzip', ['-v'], { stdio: 'ignore' }); } catch { hasUnzip = false; }
  if (hasUnzip) {
    execFileSync('unzip', ['-q', '-t', join(dir, 'a.zip')]);
    execFileSync('unzip', ['-q', join(dir, 'a.zip'), '-d', join(dir, 'x')]);
    assert.deepEqual(new Uint8Array(readFileSync(join(dir, 'x', 'chant-choir.wav'))), files[0].bytes);
  }
});

test('files.mjs needs no Buffer', async () => {
  const saved = globalThis.Buffer;
  delete globalThis.Buffer;
  try {
    const m = await import('./files.mjs?nobuffer');
    assert.equal(m.zipStored([{ name: 'a', bytes: new Uint8Array([1]) }]).length, 30 + 1 + 1 + 46 + 1 + 22);
    assert.equal(m.wavBytes({ rate: 8000, channels: [new Float64Array(2)] }).length, 48);
  } finally {
    globalThis.Buffer = saved;
  }
});
