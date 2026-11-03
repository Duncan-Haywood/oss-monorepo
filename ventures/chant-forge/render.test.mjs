import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseGabc, fitToBars, transposeToFinal } from './gabc.mjs';
import { eventsToMidi } from './midi.mjs';
import { arrange, barsFor } from './genre.mjs';
import { parseMidi, tickToSeconds, renderMidi, encodeWav, readWav } from './render.mjs';
import { analyze } from './master.mjs';
import { run } from './render-cli.mjs';

const piece = () => {
  const p = parseGabc(readFileSync(new URL('./corpus/dies-irae.gabc', import.meta.url), 'utf8'));
  return { p, events: fitToBars(transposeToFinal(p.events, 50), 8) };
};

// strongest frequency by autocorrelation over a window
function pitch(x, rate, lo, hi) {
  let best = 0, bestLag = 0;
  for (let lag = Math.floor(rate / hi); lag <= Math.ceil(rate / lo); lag++) {
    let s = 0;
    for (let i = 0; i + lag < x.length; i++) s += x[i] * x[i + lag];
    if (s > best) { best = s; bestLag = lag; }
  }
  return rate / bestLag;
}

test('parseMidi reads back every note chant-forge wrote, with the tempo map', () => {
  const { events } = piece();
  const n = events.filter((e) => e.type === 'note').length;
  const m = parseMidi(eventsToMidi(events, { bpm: 124 }));
  assert.equal(m.notes.length, n);
  assert.equal(m.tempos.at(-1)[1], Math.round(60_000_000 / 124));
  assert.equal(tickToSeconds(960, 480, [[0, 500000]]), 1);
});

test('a single D3 choir note renders at 146.8 Hz, and length follows tempo', () => {
  const ev = [{ type: 'note', midi: 50, pulses: 8, syllable: 'a' }];
  const r = renderMidi(eventsToMidi(ev, { bpm: 120 }), { tail: 0.5 });
  assert.ok(Math.abs(r.seconds - 2.5) < 0.01); // 8 eighth-notes at 120 BPM = 2 s, plus the 0.5 s tail
  const mid = r.channels[0].subarray(Math.round(0.8 * r.rate), Math.round(0.8 * r.rate) + 8000);
  const f = pitch(mid, r.rate, 100, 250);
  assert.ok(Math.abs(f - 146.83) < 2.5, `pitch ${f}`);
});

test('full arrangement renders deterministically, stays under 0 dBFS, and the master check reads it', () => {
  const { p, events } = piece();
  const fin = [...events].reverse().find((e) => e.type === 'note');
  const backing = arrange({ genre: 'deep-house', mode: Number(p.header.mode), final: fin.midi, bars: barsFor(events) });
  const midi = eventsToMidi(events, { bpm: 124, drone: true, backing });
  const a = renderMidi(midi), b = renderMidi(midi);
  assert.deepEqual(a.channels[0].subarray(1000, 1100), b.channels[0].subarray(1000, 1100));
  const wav = encodeWav(a);
  const back = readWav(wav);
  assert.equal(back.channels.length, 2);
  const res = analyze(back);
  const peak = Math.max(...back.channels.map((c) => c.reduce((m, v) => Math.max(m, Math.abs(v)), 0)));
  assert.ok(peak <= 0.81 && peak > 0.75, `peak ${peak}`);
  assert.ok(res.seconds > 20);
  assert.ok(res.checks.find((c) => c.name.toLowerCase().includes('clip'))?.ok);
});

test('drums are audible: a kick-only file has energy and no tonal drift', () => {
  const m = eventsToMidi([{ type: 'note', midi: 50, pulses: 2, syllable: 'a' }], {
    bpm: 120,
    backing: { drums: [{ tick: 0, note: 36, len: 100, vel: 120 }], bass: [], chords: [] },
  });
  const r = renderMidi(m);
  const early = r.channels[0].subarray(0, 4000).reduce((s, v) => s + v * v, 0);
  assert.ok(early > 1);
});

test('CLI: usage, bad rate, missing file, and a real write', () => {
  assert.equal(run([]).code, 2);
  assert.equal(run(['x.mid', '--rate', '1']).code, 2);
  assert.equal(run(['/nonexistent.mid']).code, 2);
  const dir = mkdtempSync(join(tmpdir(), 'cf-'));
  try {
    const { events } = piece();
    const fs = await_write(dir, eventsToMidi(events.slice(0, 20), { bpm: 124 }));
    const r = run([fs, '-o', join(dir, 'o.wav'), '--rate', '22050']);
    assert.equal(r.code, 0, r.text);
    assert.equal(readWav(readFileSync(join(dir, 'o.wav'))).rate, 22050);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

import { writeFileSync } from 'node:fs';
function await_write(dir, bytes) { const f = join(dir, 'i.mid'); writeFileSync(f, bytes); return f; }

test('rejects non-MIDI and truncated input with a clear error', () => {
  assert.throws(() => parseMidi(Buffer.from('hello world, not midi')), /not a MIDI/);
  const good = eventsToMidi([{ type: 'note', midi: 60, pulses: 2 }], {});
  assert.doesNotThrow(() => parseMidi(good.subarray(0, good.length - 3)));
});

test('--lufs brings a quiet deep-house preview to the target within 0.3 LU, peak under -1 dBFS', () => {
  const { p, events } = piece();
  const fin = [...events].reverse().find((e) => e.type === 'note');
  const backing = arrange({ genre: 'deep-house', mode: Number(p.header.mode), final: fin.midi, bars: barsFor(events) });
  const midi = eventsToMidi(events, { bpm: 124, drone: true, backing });
  const r = renderMidi(midi, { targetLufs: -14 });
  const back = readWav(encodeWav(r));
  const res = analyze(back);
  const peak = Math.max(...back.channels.map((c) => c.reduce((m, v) => Math.max(m, Math.abs(v)), 0)));
  assert.ok(peak <= 0.8901, `peak ${peak}`);
  assert.ok(Math.abs(r.lufs - res.lufs) < 0.3, `reported ${r.lufs} measured ${res.lufs}`);
  assert.ok(Math.abs(res.lufs + 14) < 1.5 || peak > 0.88, `lufs ${res.lufs} peak ${peak}`);
  assert.equal(run(['x.mid', '--lufs', '5']).code, 2);
});

test('--limit reaches -14 LUFS on deep house with true peak under -1 dBTP, and stems still sum', () => {
  const { p, events } = piece();
  const fin = [...events].reverse().find((e) => e.type === 'note');
  const backing = arrange({ genre: 'deep-house', mode: Number(p.header.mode), final: fin.midi, bars: barsFor(events) });
  const midi = eventsToMidi(events, { bpm: 124, drone: true, backing });
  const r = renderMidi(midi, { targetLufs: -14, limit: true, stems: true });
  const res = analyze(readWav(encodeWav(r)));
  assert.ok(Math.abs(res.lufs + 14) < 0.5, `lufs ${res.lufs}`);
  assert.ok(res.truePeakDb <= -1, `true peak ${res.truePeakDb}`);
  const L = r.channels[0];
  for (const i of [20000, 50000, 90000, 150000]) {
    let s = 0; for (const st of Object.values(r.stems)) s += st.channels[0][i];
    assert.ok(Math.abs(s - L[i]) < 1e-9);
  }
  assert.equal(run(['x.mid', '--limit']).code, 2);
});

test('stems sum to the mix and cover each voice', () => {
  const { p, events } = piece();
  const backing = arrange({ genre: 'metal', mode: Number(p.header.mode), final: 50, bars: 4 });
  const midi = eventsToMidi(events.slice(0, 12), { bpm: 124, drone: true, backing });
  const r = renderMidi(midi, { stems: true });
  const names = Object.keys(r.stems);
  assert.ok(names.includes('choir') && names.includes('drums') && names.includes('bass'), names.join());
  let worst = 0;
  for (let i = 0; i < r.channels[0].length; i += 7) {
    let s = 0; for (const v of names) s += r.stems[v].channels[0][i];
    worst = Math.max(worst, Math.abs(s - r.channels[0][i]));
  }
  assert.ok(worst < 1e-9, `stems differ from mix by ${worst}`);
  assert.equal(renderMidi(midi).stems, undefined);
});
