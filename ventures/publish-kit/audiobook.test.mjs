import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAcx, ffmetadata, m4bCommands, titleFromFile } from './audiobook.mjs';

const good = (file, extra = {}) => ({ file, info: { format: 'mp3', duration: 600, bitrateKbps: 192, cbr: true, sampleRate: 44100, channels: 1, ...extra } });

test('a clean ACX set has no blocking findings', () => {
  const r = checkAcx([good('00-opening-credits.mp3'), good('01.mp3'), good('99-closing-credits.mp3'), good('sample.mp3')]);
  assert.deepEqual(r.findings.filter((f) => f.severity === 'danger'), []);
  assert.equal(r.totalSeconds, 2400);
  assert.ok(r.files.every((f) => f.ok));
});

test('ACX rules: VBR, low bitrate, 48 kHz, over 120 minutes, mixed channels, non-MP3', () => {
  const r = checkAcx([
    good('a.mp3', { cbr: false, minKbps: 96, maxKbps: 256 }),
    good('b.mp3', { bitrateKbps: 128 }),
    good('c.mp3', { sampleRate: 48000 }),
    good('d.mp3', { duration: 121 * 60, channels: 2 }),
    { file: 'e.m4a', info: { format: 'mp4', duration: 10, sampleRate: 44100, channels: 1 } },
  ]);
  const msg = r.findings.map((f) => `${f.field}: ${f.message}`).join('\n');
  assert.match(msg, /a.mp3: Variable bitrate/);
  assert.match(msg, /b.mp3: 128 kbps/);
  assert.match(msg, /c.mp3: 48000 Hz/);
  assert.match(msg, /d.mp3: 02:01:00 long/);
  assert.match(msg, /channels: Files mix mono and stereo/);
  assert.match(msg, /e.m4a: ACX takes MP3 only/);
  assert.match(msg, /opening credits/);
});

test('ACX loudness rules apply when a measurement is supplied', () => {
  const r = checkAcx([{ ...good('a.wav', { format: 'wav' }), loudness: { rmsDb: -25, peakDb: -1, noiseFloorDb: -50 } }]);
  const msg = r.findings.map((f) => f.message).join('\n');
  assert.match(msg, /RMS -25 dB/);
  assert.match(msg, /Peak -1 dB/);
  assert.match(msg, /noise floor/);
});

test('ffmetadata: chapters timed back to back, special characters escaped', () => {
  const t = ffmetadata({ title: 'A=B; #1', author: 'Ada' }, [{ title: 'One', duration: 1.5 }, { title: 'Two', duration: 2 }]);
  assert.match(t, /^;FFMETADATA1\ntitle=A\\=B\\; \\#1\n/);
  assert.match(t, /START=0\nEND=1500\ntitle=One/);
  assert.match(t, /START=1500\nEND=3500\ntitle=Two/);
});

test('m4b command quotes paths and embeds the cover when given', () => {
  const { list, cmd } = m4bCommands({ files: ["/x/it's 1.mp3"], metadataPath: '/m', listPath: '/l', cover: '/c.jpg', out: '/o.m4b' });
  assert.equal(list, "file '/x/it'\\''s 1.mp3'\n");
  assert.match(cmd, /-map 0:a -map 2:v -c:v copy -disposition:v:0 attached_pic/);
  assert.match(cmd, /-map_chapters 1/);
  assert.doesNotMatch(m4bCommands({ files: [], metadataPath: '/m', listPath: '/l', out: '/o' }).cmd, /attached_pic/);
});

test('titleFromFile strips track numbers', () => {
  assert.equal(titleFromFile('audio/03 - The Storm.mp3'), 'The Storm');
  assert.equal(titleFromFile('Chapter_12_Night_Falls.mp3'), 'Night Falls');
  assert.equal(titleFromFile('Epilogue.mp3'), 'Epilogue');
});
