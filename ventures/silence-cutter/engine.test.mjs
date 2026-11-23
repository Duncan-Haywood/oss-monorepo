import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  analyse, frameLevels, estimateLevels, speechRegions, planCuts, invert, snapToFrames, timecode, mapTime,
  toEDL, toFCPXML, toPremiereXML, toFfmpeg, toCSV, retimeSRT, renderKeeps, encodeWav, decodeWav, fpsOf, formatDuration,
} from './engine.mjs';

const SR = 16000;
function rnd(seed) { let s = seed; return () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296); }
// Tone bursts (a voiced-ish 150 Hz + harmonics) at given [start, end] times over noise.
function take(bursts, dur, { noiseDb = -70, levelDb = -20, hum = 0 } = {}) {
  const x = new Float32Array(Math.round(dur * SR)), r = rnd(3);
  const na = Math.pow(10, noiseDb / 20) * Math.sqrt(3), a = Math.pow(10, levelDb / 20);
  for (let i = 0; i < x.length; i++) x[i] = (r() * 2 - 1) * na + hum * Math.sin((2 * Math.PI * 60 * i) / SR);
  for (const [s, e] of bursts) for (let i = Math.round(s * SR); i < Math.round(e * SR); i++) {
    const t = i / SR; x[i] += a * (Math.sin(2 * Math.PI * 150 * t) + 0.5 * Math.sin(2 * Math.PI * 450 * t) + 0.3 * Math.sin(2 * Math.PI * 1200 * t));
  }
  return x;
}

test('frameLevels: a full-scale sine reads about -3 dBFS, digital silence -100', () => {
  const x = new Float32Array(SR);
  for (let i = 0; i < SR; i++) x[i] = Math.sin((2 * Math.PI * 1000 * i) / SR);
  const lv = frameLevels(x, SR);
  assert.equal(lv.length, 100);
  assert.ok(Math.abs(lv[50] + 3.01) < 0.05, `got ${lv[50]}`);
  assert.equal(frameLevels(new Float32Array(1600), SR)[0], -100);
});

test('estimateLevels: threshold sits between floor and voice, at least 6 dB over the floor', () => {
  const lv = Float32Array.from([...Array(50).fill(-70), ...Array(50).fill(-20)]);
  const e = estimateLevels(lv);
  assert.equal(e.floor, -70); assert.equal(e.voice, -20);
  assert.ok(Math.abs(e.threshold - (-70 + 0.35 * 50)) < 1e-9);
  const flat = estimateLevels(Float32Array.from(Array(100).fill(-30)));
  assert.equal(flat.threshold, -24);
});

test('analyse: cuts the long pauses, keeps the short one, pads each side', () => {
  const x = take([[1, 2], [2.3, 3], [5, 6]], 7);
  const a = analyse(x, SR);
  // lead-in 0-1, gap 3-5, tail 6-7; the 0.3 s gap stays.
  assert.equal(a.cuts.length, 3, JSON.stringify(a.cuts));
  const [lead, mid, tail] = a.cuts;
  assert.equal(lead.start, 0); assert.ok(Math.abs(lead.end - (1 - 0.12)) < 0.03, `lead end ${lead.end}`);
  assert.ok(Math.abs(mid.start - (3 + 0.18)) < 0.05 && Math.abs(mid.end - (5 - 0.12)) < 0.05, JSON.stringify(mid));
  assert.ok(Math.abs(tail.start - 6.18) < 0.05 && tail.end === 7);
  assert.ok(Math.abs(a.kept + a.removed - 7) < 1e-9);
});

test('analyse: the same take works 25 dB quieter (auto threshold follows the recording)', () => {
  const loud = analyse(take([[1, 2], [4, 5]], 6, { levelDb: -12, noiseDb: -62 }), SR);
  const quiet = analyse(take([[1, 2], [4, 5]], 6, { levelDb: -37, noiseDb: -87 }), SR);
  assert.equal(loud.cuts.length, 3); assert.equal(quiet.cuts.length, 3);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(loud.cuts[i].start - quiet.cuts[i].start) < 0.03);
});

test('analyse: strong 60 Hz hum is filtered out of the decision', () => {
  const a = analyse(take([[1, 2], [4, 5]], 6, { hum: 0.2 }), SR);
  assert.equal(a.cuts.length, 3, JSON.stringify(a.cuts));
  const raw = analyse(take([[1, 2], [4, 5]], 6, { hum: 0.2 }), SR, { bandLimit: false, lowOver: null });
  assert.ok(raw.cuts.length < 3, 'without the voice band the hum reads as speech');
});

test('analyse: a manual threshold overrides auto; a click shorter than 60 ms is not speech', () => {
  const x = take([[1, 2], [3.5, 3.53], [5, 6]], 7);
  const a = analyse(x, SR, { threshold: -45 });
  assert.equal(a.threshold, -45);
  assert.ok(a.cuts.some((c) => c.start < 3.5 && c.end > 3.53), 'click inside a cut');
});

test('planCuts: keepPause leaves part of each pause; minSilence and edges', () => {
  const speech = [{ start: 1, end: 2 }, { start: 4, end: 5 }];
  const { cuts } = planCuts(speech, 6, { padBefore: 0, padAfter: 0, keepPause: 0.5, minSilence: 0.5 });
  const mid = cuts.find((c) => c.start > 1.5 && c.end < 4.5);
  assert.ok(Math.abs(mid.end - mid.start - 1.5) < 1e-9);
  assert.equal(planCuts(speech, 6, { minSilence: 3 }).cuts.length, 0);
  assert.deepEqual(planCuts([], 4).cuts, [{ start: 0, end: 4 }]);
});

test('invert and mapTime', () => {
  const keeps = invert([{ start: 1, end: 2 }, { start: 3, end: 4 }], 5);
  assert.deepEqual(keeps, [{ start: 0, end: 1 }, { start: 2, end: 3 }, { start: 4, end: 5 }]);
  assert.equal(mapTime(2.5, keeps), 1.5);
  assert.equal(mapTime(1.5, keeps), null);
  assert.equal(mapTime(4.5, keeps), 2.5);
});

test('snapToFrames and timecode', () => {
  assert.deepEqual(snapToFrames([{ start: 0, end: 1.01 }, { start: 1.01, end: 2 }, { start: 2.5, end: 2.51 }], '25'), [{ in: 0, out: 50 }]);
  assert.equal(timecode(25 * 3661 + 7, 25), '01:01:01:07');
  assert.equal(fpsOf('29.97').timebase, 30); assert.equal(fpsOf('29.97').ntsc, true);
  assert.throws(() => fpsOf('31'));
});

test('toEDL: events chain on the record side and match the source lengths', () => {
  const edl = toEDL([{ start: 0, end: 2 }, { start: 3, end: 4.5 }], { fps: '25', clipName: 'talk.mp4' });
  const ev = edl.split('\n').filter((l) => /^\d{3} /.test(l));
  assert.equal(ev.length, 2);
  assert.match(ev[0], /00:00:00:00 00:00:02:00 00:00:00:00 00:00:02:00$/);
  assert.match(ev[1], /00:00:03:00 00:00:04:13 00:00:02:00 00:00:03:13$/);
  assert.match(edl, /\* FROM CLIP NAME: talk\.mp4/);
});

test('toFCPXML and toPremiereXML: offsets chain, rational times on the frame grid, names escaped', () => {
  const keeps = [{ start: 0, end: 2 }, { start: 3, end: 4.5 }];
  const f = toFCPXML(keeps, { fps: '29.97', clipName: 'a&b.mp4', duration: 5 });
  assert.match(f, /frameDuration="1001\/30000s"/);
  assert.match(f, /offset="0\/30000s" start="0\/30000s" duration="60060\/30000s"/);
  assert.match(f, /offset="60060\/30000s" start="90090\/30000s" duration="45045\/30000s"/);
  assert.match(f, /name="a&amp;b\.mp4"/);
  const p = toPremiereXML(keeps, { fps: '25', clipName: 'talk.mp4', duration: 5 });
  assert.match(p, /<start>0<\/start><end>50<\/end><in>0<\/in><out>50<\/out>/);
  assert.match(p, /<start>50<\/start><end>88<\/end><in>75<\/in><out>113<\/out>/);
  assert.equal((p.match(/<file id="file-1">/g) || []).length, 1, 'the file is defined once');
});

test('toFfmpeg quotes the path and lists every kept span', () => {
  const c = toFfmpeg([{ start: 0, end: 1 }, { start: 2, end: 3.5 }], { input: 'my "talk".mp4', output: 'o.mp4' });
  assert.match(c, /between\(t,0\.000,1\.000\)\+between\(t,2\.000,3\.500\)/);
  assert.match(c, /-i "my \\"talk\\"\.mp4"/);
  assert.match(toFfmpeg([{ start: 0, end: 1 }], { hasVideo: false }), / -vn /);
});

test('toCSV lists keeps and cuts in time order with new start times', () => {
  const a = { keeps: [{ start: 0, end: 1 }, { start: 2, end: 3 }], cuts: [{ start: 1, end: 2 }] };
  assert.equal(toCSV(a), 'kind,start_s,end_s,length_s,new_start_s\nkeep,0.000,1.000,1.000,0.000\ncut,1.000,2.000,1.000,\nkeep,2.000,3.000,1.000,1.000\n');
});

test('retimeSRT: shifts cues after a cut, trims a cue that spans one, drops one inside it', () => {
  const srt = '1\n00:00:00,500 --> 00:00:01,500\nA\n\n2\n00:00:01,200 --> 00:00:01,800\nB\n\n3\n00:00:02,500 --> 00:00:03,000\nC\n';
  const keeps = [{ start: 0, end: 1 }, { start: 2, end: 4 }];
  const r = retimeSRT(srt, keeps);
  assert.equal(r.kept, 2); assert.equal(r.dropped, 1);
  assert.match(r.srt, /^1\n00:00:00,500 --> 00:00:01,000\nA\n\n2\n00:00:01,500 --> 00:00:02,000\nC\n$/);
});

test('renderKeeps + WAV round trip: length is the kept time, joins fade', () => {
  const x = new Float32Array(SR * 3).fill(0.5);
  const [y] = renderKeeps([x], SR, [{ start: 0, end: 1 }, { start: 2, end: 3 }]);
  assert.equal(y.length, 2 * SR);
  assert.ok(y[SR - 1] < 0.1 && y[SR] < 0.1, 'faded at the join');
  assert.ok(Math.abs(y[SR / 2] - 0.5) < 1e-6);
  const w = decodeWav(encodeWav([y], SR));
  assert.equal(w.sampleRate, SR); assert.equal(w.channels[0].length, y.length);
  assert.ok(Math.abs(w.channels[0][SR / 2] - 0.5) < 1e-4);
  assert.throws(() => decodeWav(new Uint8Array(20)), /not a WAV/);
});

test('decodeWav reads 24-bit and float32, including WAVE_FORMAT_EXTENSIBLE', () => {
  const mk = (format, bits, ext, writer) => {
    const n = 4, fmtSize = ext ? 40 : 16, bps = bits / 8;
    const b = new DataView(new ArrayBuffer(12 + 8 + fmtSize + 8 + n * bps));
    const s = (o, t) => [...t].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
    s(0, 'RIFF'); b.setUint32(4, b.byteLength - 8, true); s(8, 'WAVE'); s(12, 'fmt '); b.setUint32(16, fmtSize, true);
    b.setUint16(20, ext ? 0xfffe : format, true); b.setUint16(22, 1, true); b.setUint32(24, 8000, true); b.setUint32(28, 8000 * bps, true);
    b.setUint16(32, bps, true); b.setUint16(34, bits, true);
    if (ext) { b.setUint16(36, 22, true); b.setUint16(38, bits, true); b.setUint16(44, format, true); }
    const d = 20 + fmtSize; s(d, 'data'); b.setUint32(d + 4, n * bps, true);
    for (let i = 0; i < n; i++) writer(b, d + 8 + i * bps, i);
    return new Uint8Array(b.buffer);
  };
  const f = decodeWav(mk(3, 32, true, (b, o, i) => b.setFloat32(o, i * 0.25, true)));
  assert.deepEqual(Array.from(f.channels[0]), [0, 0.25, 0.5, 0.75]);
  const p = decodeWav(mk(1, 24, false, (b, o, i) => { const v = i === 1 ? -4194304 : 0; b.setUint8(o, v & 255); b.setUint8(o + 1, (v >> 8) & 255); b.setUint8(o + 2, (v >> 16) & 255); }));
  assert.equal(p.channels[0][1], -0.5);
});

test('formatDuration', () => {
  assert.equal(formatDuration(65), '1:05'); assert.equal(formatDuration(3725), '1:02:05');
});

test('CLI: WAV in, EDL/CSV/WAV out, summary line', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sc-'));
  const x = take([[1, 2], [4, 5]], 6);
  writeFileSync(join(dir, 'in.wav'), encodeWav([x], SR));
  const r = spawnSync(process.execPath, [new URL('./cutter.mjs', import.meta.url).pathname, join(dir, 'in.wav'), '--edl', join(dir, 'o.edl'), '--csv', join(dir, 'o.csv'), '--wav', join(dir, 'o.wav'), '--fps', '25'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /in\.wav: 0:06 -> 0:0\d \(3 pauses cut/);
  assert.match(readFileSync(join(dir, 'o.edl'), 'utf8'), /FROM CLIP NAME: in\.wav/);
  const out = decodeWav(readFileSync(join(dir, 'o.wav')));
  assert.ok(out.channels[0].length < x.length * 0.6);
  const bad = spawnSync(process.execPath, [new URL('./cutter.mjs', import.meta.url).pathname, join(dir, 'in.wav'), '--min-silence', 'x'], { encoding: 'utf8' });
  assert.equal(bad.status, 2); assert.match(bad.stderr, /min-silence/);
});
