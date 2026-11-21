import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTimestamp, parseUserTime, formatTimestamp, parseSubtitles, serializeSubtitles,
  frameRateScale, twoPointTransform, applyTransform, autoAlign, resyncText, candidateScales,
} from './engine.mjs';

const SRT = `1
00:00:01,000 --> 00:00:03,500
Hello there.

2
00:00:04,000 --> 00:00:06,000
<i>Second line</i>
on two lines.
`;

test('timestamps: SRT comma, VTT dot, hourless VTT, short fractions', () => {
  assert.equal(parseTimestamp('01:02:03,456'), 3723456);
  assert.equal(parseTimestamp('01:02:03.456'), 3723456);
  assert.equal(parseTimestamp('02:03.456'), 123456);
  assert.equal(parseTimestamp('00:00:01,5'), 1500); // half a second, not 5 ms
  assert.equal(parseTimestamp('00:61:00,000'), null);
  assert.equal(formatTimestamp(3723456, 'srt'), '01:02:03,456');
  assert.equal(formatTimestamp(3723456, 'webvtt'), '01:02:03.456');
  assert.equal(formatTimestamp(-5), '00:00:00,000');
});

test('user times: signed seconds or timestamps', () => {
  assert.equal(parseUserTime('-2.5'), -2500);
  assert.equal(parseUserTime('+90'), 90000);
  assert.equal(parseUserTime('00:01:02,000'), 62000);
  assert.equal(parseUserTime('-00:00:01,000'), -1000);
  assert.equal(parseUserTime('soon'), null);
});

test('SRT parses and round-trips unchanged', () => {
  const doc = parseSubtitles(SRT);
  assert.equal(doc.format, 'srt');
  assert.equal(doc.cues.length, 2);
  assert.deepEqual(doc.cues[1].lines, ['<i>Second line</i>', 'on two lines.']);
  assert.equal(serializeSubtitles(doc.cues, 'srt'), SRT);
});

test('WebVTT keeps header, STYLE block, cue ids and settings; drops later NOTEs', () => {
  const vtt = 'WEBVTT - film\n\nSTYLE\n::cue { color: yellow }\n\nintro\n00:01.000 --> 00:02.000 align:start line:0\nHi\n\nNOTE translator was here\n\n00:03.000 --> 00:04.000\nBye\n';
  const doc = parseSubtitles(vtt);
  assert.equal(doc.format, 'webvtt');
  assert.equal(doc.headerBlocks.length, 2);
  assert.equal(doc.droppedNotes, 1);
  assert.equal(doc.cues[0].id, 'intro');
  assert.equal(doc.cues[0].settings, 'align:start line:0');
  const out = serializeSubtitles(doc.cues, 'webvtt', doc.headerBlocks);
  assert.equal(out, 'WEBVTT - film\n\nSTYLE\n::cue { color: yellow }\n\nintro\n00:00:01.000 --> 00:00:02.000 align:start line:0\nHi\n\n00:00:03.000 --> 00:00:04.000\nBye\n');
});

test('a broken timing line is reported, not swallowed', () => {
  const doc = parseSubtitles('1\n00:00:01,000 --> 00:0x:02,000\nBad\n\n2\n00:00:03,000 --> 00:00:04,000\nGood\n');
  assert.equal(doc.cues.length, 1);
  assert.equal(doc.errors.length, 1);
  assert.match(doc.errors[0], /unreadable timing/);
});

test('CRLF and BOM input parse', () => {
  const doc = parseSubtitles('﻿1\r\n00:00:01,000 --> 00:00:02,000\r\nA\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nB\r\n');
  assert.equal(doc.cues.length, 2);
});

// Worked example by hand. A PAL DVD runs every frame at 1/25 s; the film's
// 23.976 fps (= 24000/1001) release shows the same frame n at n*1001/24000 s.
// Subtitles timed on the PAL disc at 01:00:00.000 mark frame 3600*25 = 90,000,
// which the 23.976 release shows at 90,000 * 1001 / 24000 = 3753.75 s
// = 01:02:33.750. Scale = 25 * 1001 / 24000 = 1.04270833...
test('PAL 25 fps subtitles onto a 23.976 fps release: hand-computed', () => {
  const s = frameRateScale('25', '23.976');
  assert.ok(Math.abs(s - 25025 / 24000) < 1e-12);
  const r = resyncText('1\n01:00:00,000 --> 01:00:02,000\nLine\n', { fps: ['25', '23.976'] });
  assert.match(r.output, /01:02:33,750 --> 01:02:35,835/); // 3602 s * 1.0427083 = 3755.835 s
  // The reverse direction undoes it.
  assert.ok(Math.abs(frameRateScale('23.976', '25') * s - 1) < 1e-12);
});

// Worked example by hand. Line at 00:01:00.000 should be at 00:01:02.000;
// line at 01:00:00.000 should be at 01:00:10.000.
// scale = (3,610,000 - 62,000) / (3,600,000 - 60,000) = 3,548,000 / 3,540,000
//       = 1.0022598870...
// offset = 62,000 - 60,000 * 1.0022598870 = 1,864.4068 ms
// A line at 00:30:00.000 (1,800,000 ms) lands at
// 1,800,000 * 1.0022598870 + 1,864.4068 = 1,805,932.2034 -> 00:30:05.932.
test('two sync points: hand-computed shift and stretch', () => {
  const t = twoPointTransform({ fromMs: 60000, toMs: 62000 }, { fromMs: 3600000, toMs: 3610000 });
  assert.ok(Math.abs(t.scale - 3548000 / 3540000) < 1e-12);
  assert.ok(Math.abs(t.offsetMs - 1864.4068) < 1e-3);
  const r = resyncText('1\n00:30:00,000 --> 00:30:01,000\nMid\n', {
    syncPoints: [{ fromMs: 60000, toMs: 62000 }, { fromMs: 3600000, toMs: 3610000 }],
  });
  assert.match(r.output, /00:30:05,932/);
});

test('two sync points that reverse order or coincide are refused', () => {
  assert.throws(() => twoPointTransform({ fromMs: 1000, toMs: 5000 }, { fromMs: 1000, toMs: 6000 }), /different times/);
  assert.throws(() => twoPointTransform({ fromMs: 1000, toMs: 9000 }, { fromMs: 5000, toMs: 2000 }), /reverse/);
});

test('one sync point is a plain shift; extra offset adds on', () => {
  const r = resyncText(SRT, { syncPoints: [{ fromMs: 1000, toMs: 3500 }], offsetMs: 500 });
  assert.equal(r.method, 'one-point');
  assert.equal(r.offsetMs, 3000);
  assert.match(r.output, /00:00:04,000 --> 00:00:06,500/);
});

test('negative shifts drop cues that end before 0 and clamp ones that straddle it', () => {
  const r = applyTransform(parseSubtitles(SRT).cues, { offsetMs: -3000 });
  assert.equal(r.dropped, 0);
  assert.equal(r.clamped, 1);
  assert.equal(r.cues[0].startMs, 0);
  assert.equal(r.cues[0].endMs, 500);
  const r2 = applyTransform(parseSubtitles(SRT).cues, { offsetMs: -3500 });
  assert.equal(r2.dropped, 1);
});

test('conflicting modes and empty input are input errors', () => {
  assert.match(resyncText('', {}).inputError, /No subtitle cues/);
  assert.match(resyncText(SRT, { fps: ['25', '24'], syncPoints: [{ fromMs: 0, toMs: 1 }] }).inputError, /Pick one/);
});

test('SRT in, WebVTT out', () => {
  const r = resyncText(SRT, { offsetMs: 1000, outputFormat: 'webvtt' });
  assert.ok(r.output.startsWith('WEBVTT\n\n00:00:02.000 --> 00:00:04.500\nHello there.'));
});

test('candidate scales include 1 and the PAL speed-up both ways, without duplicates', () => {
  const c = candidateScales();
  assert.equal(c[0].scale, 1);
  assert.ok(c.some((x) => Math.abs(x.scale - 25025 / 24000) < 1e-9));
  assert.ok(c.some((x) => Math.abs(x.scale - 24000 / 25025) < 1e-9));
  assert.equal(new Set(c.map((x) => x.scale.toFixed(6))).size, c.length);
});

// --- reference alignment on synthetic tracks --------------------------------

// Deterministic pseudo-random numbers (mulberry32), so failures reproduce.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A reference track: ~n cues with irregular gaps, like real dialogue. */
function makeReference(n, seed) {
  const rand = rng(seed);
  const cues = [];
  let t = 20000;
  for (let i = 0; i < n; i++) {
    t += 800 + rand() * (rand() < 0.1 ? 40000 : 4000);
    const dur = 900 + rand() * 3500;
    cues.push({ id: null, startMs: Math.round(t), endMs: Math.round(t + dur), settings: '', lines: [`ref ${i}`] });
    t += dur;
  }
  return cues;
}

/**
 * The "translation": the same dialogue mapped by t_target = (t_ref - d) / s,
 * each cue jittered by up to ±jitter ms, a share dropped (merged lines) and
 * some extras added (signs, songs) that the reference does not have.
 */
function makeTarget(ref, { scale, offsetMs, jitter, dropShare, extraShare, seed }) {
  const rand = rng(seed);
  const out = [];
  for (const c of ref) {
    if (rand() < dropShare) continue;
    const j = (rand() * 2 - 1) * jitter;
    const startMs = Math.round((c.startMs + j - offsetMs) / scale);
    out.push({ ...c, startMs, endMs: startMs + (c.endMs - c.startMs) });
  }
  const span = ref[ref.length - 1].startMs;
  const extras = Math.round(ref.length * extraShare);
  for (let i = 0; i < extras; i++) {
    const startMs = Math.round((rand() * span - offsetMs) / scale);
    out.push({ id: null, startMs, endMs: startMs + 1500, settings: '', lines: ['extra'] });
  }
  return out.filter((c) => c.startMs > 0).sort((a, b) => a.startMs - b.startMs);
}

test('reference: recovers a pure 7.3 s offset', () => {
  const ref = makeReference(900, 1);
  const target = makeTarget(ref, { scale: 1, offsetMs: 7300, jitter: 150, dropShare: 0.15, extraShare: 0.1, seed: 2 });
  const a = autoAlign(target, ref);
  assert.ok(Math.abs(a.scale - 1) < 2e-4, `scale ${a.scale}`);
  assert.ok(Math.abs(a.offsetMs - 7300) < 150, `offset ${a.offsetMs}`);
  assert.equal(a.confidence, 'high');
});

test('reference: recovers PAL speed-up plus a negative offset', () => {
  const ref = makeReference(1200, 3);
  const scale = 25025 / 24000;
  const target = makeTarget(ref, { scale, offsetMs: -4200, jitter: 200, dropShare: 0.2, extraShare: 0.15, seed: 4 });
  const a = autoAlign(target, ref);
  assert.equal(a.scaleLabel.includes('25 → 23.976') || a.scaleLabel.includes('25 → 24'), true, a.scaleLabel);
  assert.ok(Math.abs(a.scale - scale) < 3e-4, `scale ${a.scale}`);
  // Check the mapped times, which is what a viewer sees, at the end of the film.
  const tEnd = target[target.length - 1].startMs;
  const err = Math.abs((a.scale * tEnd + a.offsetMs) - (scale * tEnd - 4200));
  assert.ok(err < 300, `end-of-film error ${err} ms`);
  assert.equal(a.confidence, 'high');
});

test('reference: recovers the slow-down direction (23.976 subs on a 25 fps video)', () => {
  const ref = makeReference(800, 5);
  const scale = 24000 / 25025;
  const target = makeTarget(ref, { scale, offsetMs: 2500, jitter: 150, dropShare: 0.1, extraShare: 0.05, seed: 6 });
  const a = autoAlign(target, ref);
  assert.ok(Math.abs(a.scale - scale) < 3e-4, `scale ${a.scale}`);
});

test('reference: unrelated files come back low confidence, not a confident wrong answer', () => {
  const ref = makeReference(600, 7);
  const other = makeReference(600, 99);
  const a = autoAlign(other, ref);
  assert.notEqual(a.confidence, 'high');
});

test('reference via resyncText writes the corrected file', () => {
  const ref = makeReference(400, 11);
  const target = makeTarget(ref, { scale: 1, offsetMs: 3000, jitter: 0, dropShare: 0, extraShare: 0, seed: 12 });
  const r = resyncText(serializeSubtitles(target, 'srt'), { referenceText: serializeSubtitles(ref, 'srt') });
  assert.equal(r.method, 'reference');
  const fixed = parseSubtitles(r.output).cues;
  assert.ok(Math.abs(fixed[0].startMs - ref[0].startMs) <= 2, `${fixed[0].startMs} vs ${ref[0].startMs}`);
  assert.ok(Math.abs(fixed[fixed.length - 1].startMs - ref[ref.length - 1].startMs) <= 2);
});

test('reference needs at least 3 cues each', () => {
  const r = resyncText(SRT, { referenceText: SRT });
  assert.match(r.inputError, /at least 3 cues/);
});
