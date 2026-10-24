import test from 'node:test';
import assert from 'node:assert/strict';
import { probe, sniff, measureWavLoudness, hhmmss } from './media.mjs';
import { mp3, wav, m4a, png, jpeg } from './fixtures.mjs';

test('CBR MP3: exact duration from frame count, 192 kbps, mono, 44.1 kHz', () => {
  const r = probe(mp3(Array(100).fill(11)));
  assert.equal(r.format, 'mp3');
  assert.equal(r.mime, 'audio/mpeg');
  assert.equal(r.frames, 100);
  assert.equal(r.duration, Math.round((100 * 1152 / 44100) * 1000) / 1000);
  assert.equal(r.bitrateKbps, 192);
  assert.equal(r.cbr, true);
  assert.equal(r.sampleRate, 44100);
  assert.equal(r.channels, 1);
});

test('MP3 that mixes bitrates is VBR even without a Xing header', () => {
  const r = probe(mp3([11, 9, 11, 9, 11]));
  assert.equal(r.cbr, false);
  assert.equal(r.minKbps, 128);
  assert.equal(r.maxKbps, 192);
});

test('MP3 with a leading ID3v2 tag is sniffed and its tag skipped', () => {
  const b = mp3(Array(10).fill(11), { id3: true, mono: false });
  assert.equal(sniff(b), 'mp3');
  const r = probe(b);
  assert.equal(r.frames, 10);
  assert.equal(r.channels, 2);
});

test('WAV: duration, format, and loudness of a known signal', () => {
  const rate = 8000;
  const samples = new Float64Array(rate * 2);
  // One second of a 0.5-amplitude square wave, then one second of silence.
  for (let i = 0; i < rate; i++) samples[i] = i % 2 ? 0.5 : -0.5;
  const b = wav(samples, rate);
  const r = probe(b);
  assert.equal(r.format, 'wav');
  assert.equal(r.duration, 2);
  const l = measureWavLoudness(b);
  assert.equal(l.peakDb, -6);
  assert.equal(l.rmsDb, -9); // half the time at -6 dB RMS: 10*log10(0.125) = -9.03
  assert.equal(l.noiseFloorDb, -Infinity);
});

test('M4A / M4B: duration from mvhd, sample entry, chapters flag, brand', () => {
  const r = probe(m4a({ seconds: 125.5, brand: 'M4B ', chapters: true, mdatBytes: 8000 }));
  assert.equal(r.format, 'mp4');
  assert.equal(r.mime, 'audio/x-m4b');
  assert.equal(r.duration, 125.5);
  assert.equal(r.sampleRate, 44100);
  assert.equal(r.channels, 2);
  assert.equal(r.chapters, true);
  assert.equal(probe(m4a({ seconds: 3 })).chapters, false);
});

test('PNG and JPEG dimensions and colour model', () => {
  assert.deepEqual([probe(png(3000, 3000)).width, probe(png(3000, 3000)).height], [3000, 3000]);
  assert.equal(probe(png(10, 10, 0)).colorModel, 'grayscale');
  const j = probe(jpeg(1600, 2560));
  assert.deepEqual([j.width, j.height, j.colorModel], [1600, 2560, 'rgb']);
  assert.equal(probe(jpeg(10, 10, 4)).colorModel, 'cmyk');
});

test('unknown bytes are reported, not thrown', () => {
  const r = probe(new Uint8Array([1, 2, 3, 4]));
  assert.equal(r.format, 'unknown');
  assert.ok(r.error);
});

test('hhmmss', () => {
  assert.equal(hhmmss(0), '00:00:00');
  assert.equal(hhmmss(3725.4), '01:02:05');
});
