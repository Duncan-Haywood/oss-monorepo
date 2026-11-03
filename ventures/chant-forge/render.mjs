// Preview renderer: Standard MIDI File -> stereo 16-bit WAV, no dependencies.
//
// A deliberately plain synthesiser so the ear check and the mix/master check can run
// on real audio with no DAW and no soundfont: choir-like additive pad (a few detuned
// voices, slow attack, a formant-ish "ah" tilt), organ drone, subby bass, a saw chord
// pad, and synthesised GM drums. It is a PREVIEW, not a release master: the real
// voices are recorded singers (RECORDING-GUIDE.md). Deterministic: a seeded noise
// source, so the same MIDI gives the same bytes.
import { readWav, integratedLufs, truePeak } from './master.mjs';
export { readWav };

// ---- MIDI reading (format 0/1, running status, tempo map, channel programs) ----

export function parseMidi(bytes) {
  // plain Uint8Array plus big-endian readers, so this runs in a browser (no Buffer)
  const b = Uint8Array.from(bytes);
  const dv = new DataView(b.buffer);
  b.readUInt16BE = (o) => dv.getUint16(o);
  b.readUInt32BE = (o) => dv.getUint32(o);
  b.toString = (_enc, a, z) => String.fromCharCode(...b.subarray(a, z));
  if (b.length < 14 || b.toString('latin1', 0, 4) !== 'MThd') throw new Error('not a MIDI file');
  const ntrk = b.readUInt16BE(10);
  const division = b.readUInt16BE(12);
  if (division & 0x8000) throw new Error('SMPTE time division is not supported');
  let pos = 8 + b.readUInt32BE(4);
  const notes = [];
  const tempos = [[0, 500000]];
  const programs = new Map(); // channel -> [[tick, program]]
  for (let t = 0; t < ntrk && pos + 8 <= b.length; t++) {
    if (b.toString('latin1', pos, pos + 4) !== 'MTrk') throw new Error('bad track chunk');
    const end = Math.min(b.length, pos + 8 + b.readUInt32BE(pos + 4));
    let p = pos + 8, tick = 0, status = 0;
    const open = new Map();
    const vlq = () => { let v = 0, c; do { if (p >= end) throw new Error('truncated track'); c = b[p++]; v = (v << 7) | (c & 0x7f); } while (c & 0x80); return v; };
    while (p < end) {
      tick += vlq();
      let s = b[p];
      if (s & 0x80) { status = s; p++; } else s = status;
      if (s === 0xff) {
        const type = b[p++], len = vlq();
        if (type === 0x51 && len === 3) tempos.push([tick, (b[p] << 16) | (b[p + 1] << 8) | b[p + 2]]);
        p += len;
        if (type === 0x2f) break;
      } else if (s === 0xf0 || s === 0xf7) { p += vlq(); }
      else {
        const hi = s & 0xf0, ch = s & 0x0f;
        if (hi === 0xc0 || hi === 0xd0) {
          if (hi === 0xc0) { if (!programs.has(ch)) programs.set(ch, []); programs.get(ch).push([tick, b[p]]); }
          p += 1;
        } else {
          const d1 = b[p], d2 = b[p + 1];
          p += 2;
          const key = ch * 128 + d1;
          if (hi === 0x90 && d2 > 0) {
            if (!open.has(key)) open.set(key, []);
            open.get(key).push({ tick, vel: d2 });
          } else if (hi === 0x80 || (hi === 0x90 && d2 === 0)) {
            const q = open.get(key);
            if (q && q.length) { const o = q.shift(); notes.push({ ch, note: d1, vel: o.vel, tick: o.tick, end: tick }); }
          }
        }
      }
    }
    for (const [key, q] of open) for (const o of q) notes.push({ ch: Math.floor(key / 128), note: key % 128, vel: o.vel, tick: o.tick, end: tick });
    pos = end;
  }
  tempos.sort((x, y) => x[0] - y[0]);
  return { division, notes, tempos, programs };
}

// tick -> seconds through the tempo map
export function tickToSeconds(tick, division, tempos) {
  let sec = 0, lastTick = 0, us = 500000;
  for (const [tk, tempo] of tempos) {
    if (tk >= tick) break;
    sec += ((tk - lastTick) * us) / division / 1e6;
    lastTick = tk; us = tempo;
  }
  return sec + ((tick - lastTick) * us) / division / 1e6;
}

// ---- synthesis ----

function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1; }
const hz = (n) => 440 * 2 ** ((n - 69) / 12);

function pad(partials, detunes, attack, release) {
  return (f, dur, rate) => {
    const total = Math.round((dur + release) * rate);
    const out = new Float64Array(total);
    for (const dt of detunes) {
      const ff = f * 2 ** (dt / 1200);
      for (let h = 1; h <= partials && ff * h < rate / 2.2; h++) {
        // "ah"-like tilt: 1/h roll-off with a bump near 700 and 1100 Hz
        const fh = ff * h;
        const g = (1 / h) * (1 + 1.6 * Math.exp(-(((fh - 700) / 220) ** 2)) + 0.9 * Math.exp(-(((fh - 1100) / 260) ** 2)));
        const w = (2 * Math.PI * fh) / rate;
        const ph0 = h * dt; // spread starting phases per voice
        // rotation recurrence: one multiply-add pair per sample instead of Math.sin
        const c = Math.cos(w), sn = Math.sin(w);
        let x = Math.sin(ph0), y = Math.cos(ph0);
        for (let i = 0; i < total; i++) { out[i] += g * x; const nx = x * c + y * sn; y = y * c - x * sn; x = nx; }
      }
    }
    const norm = 1 / (detunes.length * 2.5);
    const aN = Math.max(1, Math.round(attack * rate)), rN = Math.max(1, Math.round(release * rate));
    const dN = Math.round(dur * rate);
    for (let i = 0; i < total; i++) {
      let env = Math.min(1, i / aN);
      if (i > dN) env *= Math.max(0, 1 - (i - dN) / rN);
      out[i] *= env * norm;
    }
    return out;
  };
}

const choir = pad(14, [-14, -5, 0, 6, 15], 0.09, 0.25);
const organ = pad(6, [0, 3], 0.4, 0.8);
const chordPad = (f, dur, rate) => {
  const total = Math.round((dur + 0.15) * rate), out = new Float64Array(total);
  for (const dt of [-8, 8]) {
    const ff = f * 2 ** (dt / 1200);
    let ph = 0, lp = 0;
    for (let i = 0; i < total; i++) {
      ph = (ph + ff / rate) % 1;
      lp += 0.18 * ((2 * ph - 1) - lp); // one-pole low-pass on a saw
      const env = Math.min(1, i / (0.02 * rate)) * (i > dur * rate ? Math.max(0, 1 - (i - dur * rate) / (0.15 * rate)) : 1);
      out[i] += lp * env * 0.5;
    }
  }
  return out;
};
const bass = (f, dur, rate) => {
  const total = Math.round((dur + 0.08) * rate), out = new Float64Array(total);
  let ph = 0, lp = 0;
  for (let i = 0; i < total; i++) {
    ph = (ph + f / rate) % 1;
    lp += 0.07 * ((2 * ph - 1) - lp);
    const env = Math.min(1, i / (0.005 * rate)) * (i > dur * rate ? Math.max(0, 1 - (i - dur * rate) / (0.08 * rate)) : 1);
    out[i] = (0.7 * lp + 0.5 * Math.sin(2 * Math.PI * f * i / rate)) * env;
  }
  return out;
};

function drum(note, rate, rand) {
  const len = Math.round(rate * (note === 49 ? 1.2 : note === 46 ? 0.35 : note === 51 ? 0.5 : note === 42 ? 0.06 : 0.22));
  const out = new Float64Array(len);
  let hp = 0, prev = 0;
  for (let i = 0; i < len; i++) {
    const t = i / rate;
    if (note === 36) { // kick: falling sine
      const f = 45 + 110 * Math.exp(-t * 28);
      out[i] = Math.sin(2 * Math.PI * (45 * t + (110 / 28) * (1 - Math.exp(-t * 28)))) * Math.exp(-t * 11) * (f > 0 ? 1 : 0);
    } else if (note === 38 || note === 39) { // snare / clap: noise plus a body tone
      const n = rand();
      out[i] = (0.8 * n * Math.exp(-t * (note === 39 ? 24 : 18)) + (note === 38 ? 0.5 * Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 30) : 0)) * 0.9;
    } else { // hats, ride, crash: high-passed noise
      const n = rand();
      hp = 0.92 * (hp + n - prev); prev = n;
      const dec = note === 42 ? 70 : note === 46 ? 12 : note === 49 ? 3.5 : 7;
      out[i] = hp * Math.exp(-t * dec) * 0.5;
    }
  }
  return out;
}

// GM program -> voice. 52 choir, 19 organ, 38 bass, 89 pad; anything else falls back.
function voiceFor(ch, program) {
  if (ch === 9) return 'drums';
  if (program === 52 || program === 53 || program === 54) return 'choir';
  if (program === 19 || program === 16 || program === 20) return 'organ';
  if (program >= 32 && program <= 39) return 'bass';
  return 'chords';
}

// 0.80 sample ceiling (-1.9 dBFS) leaves room for inter-sample peaks under the -1 dBTP target
const limitCeiling = (c) => Math.min(c, 0.8);

// Per-sample gain (<= 1) that keeps max(|L|,|R|) under `ceil`: a 5 ms lookahead minimum,
// then a 5 ms moving average of that minimum, which can only be lower than needed.
export function limiterCurve(L, R, rate, ceil, ms = 5) {
  const n = L.length, w = Math.max(1, Math.round(rate * ms / 1000));
  const need = new Float64Array(n);
  for (let i = 0; i < n; i++) { const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); need[i] = a > ceil ? ceil / a : 1; }
  const mn = new Float64Array(n), dq = new Int32Array(n);
  let h = 0, t = 0;
  for (let i = n - 1; i >= 0; i--) { // min over need[i..i+w]
    while (t > h && need[dq[t - 1]] >= need[i]) t--;
    dq[t++] = i;
    while (dq[h] > i + w) h++;
    mn[i] = need[dq[h]];
  }
  const out = new Float64Array(n), cs = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cs[i + 1] = cs[i] + mn[i];
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - w + 1); out[i] = (cs[i + 1] - cs[a]) / (i + 1 - a); }
  return out;
}

export function renderMidi(midiBytes, { rate = 44100, tail = 1.5, targetPeak = 0.8, targetLufs = null, ceiling = 0.89, stems = false, limit = false } = {}) {
  const m = parseMidi(midiBytes);
  const sec = (t) => tickToSeconds(t, m.division, m.tempos);
  const progAt = (ch) => (m.programs.get(ch) || [[0, 0]])[0][1];
  let endSec = 0;
  for (const n of m.notes) endSec = Math.max(endSec, sec(n.end));
  const total = Math.ceil((endSec + tail) * rate);
  const L = new Float64Array(total), R = new Float64Array(total);
  const stemBuf = stems ? new Map() : null; // voice -> [L, R], same scale as the mix
  const rand = rng(12345);
  const drumCache = new Map();
  const waveCache = new Map(); // same voice, pitch and length renders once
  const pan = { choir: 0, organ: 0.0, bass: 0, chords: 0.25, drums: 0 };
  const gain = { choir: 0.9, organ: 0.35, bass: 0.7, chords: 0.28, drums: 0.8 };
  for (const n of m.notes) {
    const v = voiceFor(n.ch, progAt(n.ch));
    const start = Math.round(sec(n.tick) * rate);
    const dur = Math.max(0.03, sec(n.end) - sec(n.tick));
    let wave;
    if (v === 'drums') {
      if (!drumCache.has(n.note)) drumCache.set(n.note, drum(n.note, rate, rand));
      wave = drumCache.get(n.note);
    } else {
      const key = `${v}:${n.note}:${Math.round(dur * 1000)}`;
      if (!waveCache.has(key)) waveCache.set(key, (v === 'choir' ? choir : v === 'organ' ? organ : v === 'bass' ? bass : chordPad)(hz(n.note), dur, rate));
      wave = waveCache.get(key);
    }
    const g = (n.vel / 127) * gain[v];
    const p = pan[v], gl = g * (1 - Math.max(0, p)), gr = g * (1 + Math.min(0, p));
    for (let i = 0; i < wave.length && start + i < total; i++) { L[start + i] += wave[i] * gl; R[start + i] += wave[i] * gr; }
    if (stemBuf) {
      if (!stemBuf.has(v)) stemBuf.set(v, [new Float64Array(total), new Float64Array(total)]);
      const [sl, sr] = stemBuf.get(v);
      for (let i = 0; i < wave.length && start + i < total; i++) { sl[start + i] += wave[i] * gl; sr[start + i] += wave[i] * gr; }
    }
  }
  // normalise the peak (a preview level, not a loudness target: master-cli.mjs judges that)
  let peak = 0;
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const k = peak > 0 ? targetPeak / peak : 1;
  for (let i = 0; i < total; i++) { L[i] *= k; R[i] *= k; }
  if (stemBuf) for (const [sl, sr] of stemBuf.values()) for (let i = 0; i < total; i++) { sl[i] *= k; sr[i] *= k; }
  // optional loudness target: gain to the target, then capped so the sample peak stays under
  // `ceiling` (0.89 = -1 dBFS); a quiet mix that would clip reports the LUFS it reached instead
  let lufs = null;
  if (targetLufs !== null && limit) {
    // lookahead peak limiter: the loudness target is reached by pushing gain up and
    // pulling the drum transients back down, instead of stopping where the first peak hits the ceiling
    const before = integratedLufs([L, R], rate).lufs;
    if (Number.isFinite(before)) {
      let g = 10 ** ((targetLufs - before) / 20);
      const base = [L.slice(), R.slice()];
      const stemBase = stemBuf ? [...stemBuf].map(([, ch]) => [ch[0].slice(), ch[1].slice()]) : null;
      let curve = null, gUsed = g, c = limitCeiling(ceiling);
      for (let pass = 0; pass < 8; pass++) {
        gUsed = g;
        const x0 = base[0].map((v) => v * g), x1 = base[1].map((v) => v * g);
        curve = limiterCurve(x0, x1, rate, c);
        for (let i = 0; i < total; i++) { L[i] = x0[i] * curve[i]; R[i] = x1[i] * curve[i]; }
        const now = integratedLufs([L, R], rate).lufs;
        const tp = Math.max(truePeak(L), truePeak(R));
        const tpDb = 20 * Math.log10(tp || 1e-9);
        const loud = Number.isFinite(now) && Math.abs(now - targetLufs) < 0.05;
        if (loud && tpDb <= -1.05) break;
        if (tpDb > -1.05) c *= 10 ** ((-1.05 - tpDb) / 20); // inter-sample peaks: tighten the ceiling
        if (Number.isFinite(now)) g *= 10 ** ((targetLufs - now) / 20);
      }
      if (stemBuf) [...stemBuf.values()].forEach(([sl, sr], k2) => { for (let i = 0; i < total; i++) { sl[i] = stemBase[k2][0][i] * gUsed * curve[i]; sr[i] = stemBase[k2][1][i] * gUsed * curve[i]; } });
      lufs = integratedLufs([L, R], rate).lufs;
    }
  } else if (targetLufs !== null) {
    const before = integratedLufs([L, R], rate).lufs;
    if (Number.isFinite(before)) {
      let g = 10 ** ((targetLufs - before) / 20);
      let pk = 0;
      for (let i = 0; i < total; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
      if (pk * g > ceiling) g = ceiling / pk;
      for (let i = 0; i < total; i++) { L[i] *= g; R[i] *= g; }
      if (stemBuf) for (const [sl, sr] of stemBuf.values()) for (let i = 0; i < total; i++) { sl[i] *= g; sr[i] *= g; }
      lufs = before + 20 * Math.log10(g);
    }
  }
  const out = { rate, channels: [L, R], seconds: total / rate, notes: m.notes.length, lufs };
  if (stemBuf) out.stems = Object.fromEntries([...stemBuf].map(([v, ch]) => [v, { rate, channels: ch }]));
  return out;
}

export function encodeWav({ rate, channels }) {
  const n = channels[0].length, c = channels.length;
  const buf = Buffer.alloc(44 + n * c * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * c * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(c, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * c * 2, 28); buf.writeUInt16LE(c * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * c * 2, 40);
  for (let i = 0; i < n; i++) for (let k = 0; k < c; k++) {
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(channels[k][i] * 32767))), 44 + (i * c + k) * 2);
  }
  return buf;
}
