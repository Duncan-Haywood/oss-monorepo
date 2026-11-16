// Preview renderer: Standard MIDI File -> stereo 16-bit WAV, no dependencies.
//
// A deliberately plain synthesiser so the ear check and the mix/master check can run
// on real audio with no DAW and no soundfont: choir-like additive pad (a few detuned
// voices, slow attack, a formant-ish "ah" tilt), organ drone, subby bass, a saw chord
// pad, and synthesised GM drums. It is a PREVIEW, not a release master: the real
// voices are recorded singers (RECORDING-GUIDE.md). Deterministic: a seeded noise
// source, so the same MIDI gives the same bytes.
import { readWav, integratedLufs, truePeak } from './master.mjs';
import { singNote, latinVowel, latinOnset, latinCoda, onsetLength, PHONES } from './sing.mjs';
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
  const names = new Map(); // channel -> name of the first track that plays on it (meta 0x03)
  for (let t = 0; t < ntrk && pos + 8 <= b.length; t++) {
    let trackName = null, named = false, lyric = null, lyricId = 0;
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
        if (type === 0x03 && trackName === null) trackName = new TextDecoder().decode(b.subarray(p, Math.min(end, p + len)));
        if (type === 0x05) { lyric = new TextDecoder().decode(b.subarray(p, Math.min(end, p + len))); lyricId++; }
        p += len;
        if (type === 0x2f) break;
      } else if (s === 0xf0 || s === 0xf7) { p += vlq(); }
      else {
        const hi = s & 0xf0, ch = s & 0x0f;
        if (!named && trackName !== null && !names.has(ch)) { names.set(ch, trackName); named = true; }
        if (hi === 0xc0 || hi === 0xd0) {
          if (hi === 0xc0) { if (!programs.has(ch)) programs.set(ch, []); programs.get(ch).push([tick, b[p]]); }
          p += 1;
        } else {
          const d1 = b[p], d2 = b[p + 1];
          p += 2;
          const key = ch * 128 + d1;
          if (hi === 0x90 && d2 > 0) {
            if (!open.has(key)) open.set(key, []);
            open.get(key).push({ tick, vel: d2, lyric, syl: lyric === null ? null : `${t}:${lyricId}` });
          } else if (hi === 0x80 || (hi === 0x90 && d2 === 0)) {
            const q = open.get(key);
            if (q && q.length) { const o = q.shift(); notes.push(withLyric({ ch, note: d1, vel: o.vel, tick: o.tick, end: tick }, o)); }
          }
        }
      }
    }
    for (const [key, q] of open) for (const o of q) notes.push(withLyric({ ch: Math.floor(key / 128), note: key % 128, vel: o.vel, tick: o.tick, end: tick }, o));
    pos = end;
  }
  tempos.sort((x, y) => x[0] - y[0]);
  return { division, notes, tempos, programs, names };
}

// a note keeps the lyric (meta 0x05) last seen on its track, and `syl` names which lyric event
// that was, so the notes of one melisma share it; notes before any lyric carry neither
function withLyric(n, o) { if (o.syl !== null) { n.lyric = o.lyric; n.syl = o.syl; } return n; }

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
// `scratch` (optional, {}) keeps the working arrays between calls of the same length:
// renderMidi's limiter makes up to 8 passes, and every array is fully rewritten
// before it is read, so reuse returns the same curve. The returned array is
// scratch's own, overwritten by the next call with that scratch.
export function limiterCurve(L, R, rate, ceil, ms = 5, scratch = null) {
  const n = L.length, w = Math.max(1, Math.round(rate * ms / 1000));
  const buf = scratch && scratch.n === n ? scratch : { n, need: new Float64Array(n), mn: new Float64Array(n), dq: new Int32Array(n), out: new Float64Array(n), cs: new Float64Array(n + 1) };
  if (scratch && scratch !== buf) Object.assign(scratch, buf);
  const { need, mn, dq, out, cs } = buf;
  for (let i = 0; i < n; i++) { const a = Math.max(Math.abs(L[i]), Math.abs(R[i])); need[i] = a > ceil ? ceil / a : 1; }
  let h = 0, t = 0;
  for (let i = n - 1; i >= 0; i--) { // min over need[i..i+w]
    while (t > h && need[dq[t - 1]] >= need[i]) t--;
    dq[t++] = i;
    while (dq[h] > i + w) h++;
    mn[i] = need[dq[h]];
  }
  cs[0] = 0;
  for (let i = 0; i < n; i++) cs[i + 1] = cs[i] + mn[i];
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - w + 1); out[i] = (cs[i + 1] - cs[a]) / (i + 1 - a); }
  return out;
}

export function renderMidi(midiBytes, { rate = 44100, tail = 1.5, targetPeak = 0.8, targetLufs = null, ceiling = 0.89, stems = false, limit = false, learn = null, sing = false, nasalCut = true, voiceBar = true, voiceBarWall = true } = {}) {
  const m = parseMidi(midiBytes);
  // sing: the choir sings each note's Latin syllable (sing.mjs) instead of the pad's fixed "ah":
  // its consonants on the syllable's first note, then its vowel, then its final consonants at the end of
  // its last note ('vowels': the vowel alone); a diphthong glides on the syllable's last note, found as the last note on that
  // channel carrying the syllable's lyric event
  const lastOfSyl = new Set(), firstOfSyl = new Set();
  const nextOn = new Map(); // note -> start tick of the next note on its channel (legato release)
  const nextNote = new Map(); // note -> the next note on its channel
  if (sing) {
    const byCh = new Map();
    for (const n of m.notes) { if (!byCh.has(n.ch)) byCh.set(n.ch, []); byCh.get(n.ch).push(n); }
    for (const list of byCh.values()) {
      list.sort((a, b) => a.tick - b.tick);
      for (let k = 0; k < list.length; k++) { const later = list.slice(k + 1).find((x) => x.tick > list[k].tick); if (later) { nextOn.set(list[k], later.tick); nextNote.set(list[k], later); } }
    }
    const bySyl = new Map();
    for (const n of m.notes) if (n.syl) { const k = `${n.ch}|${n.syl}`; const b = bySyl.get(k); if (!b || n.tick >= b.tick) bySyl.set(k, n); }
    for (const n of bySyl.values()) lastOfSyl.add(n);
    const firstBy = new Map();
    for (const n of m.notes) if (n.syl) { const k = `${n.ch}|${n.syl}`; const b = firstBy.get(k); if (!b || n.tick < b.tick) firstBy.set(k, n); }
    for (const n of firstBy.values()) firstOfSyl.add(n);
  }
  // the consonants a note opens with: the syllable's onset on its first note, none on a melisma's later notes
  const onsetOf = (n) => (sing === true && firstOfSyl.has(n) ? latinOnset(n.lyric) : []);
  // and the consonants it closes with: the syllable's coda at the end of its last note
  const codaOf = (n) => (sing === true && lastOfSyl.has(n) ? latinCoda(n.lyric) : []);
  // Choirs sing the consonant before the beat so the vowel lands on it. A note's consonant takes its
  // full length where it can: up to half the previous note (and any rest before it) goes to it, and
  // what does not fit spills into the note itself, at most 30% of it, shortened in proportion when
  // even that is too little. lead: seconds before the beat; len: the consonant's whole length.
  const sec0 = (t) => tickToSeconds(t, m.division, m.tempos);
  const prevNote = new Map();
  for (const [a, b] of nextNote) prevNote.set(b, a);
  const leadOf = new Map(); // note -> { lead, len }
  if (sing === true) for (const n of m.notes) {
    const on = onsetOf(n); if (!on.length) continue;
    const want = onsetLength(on), p = prevNote.get(n), start = sec0(n.tick), dur = sec0(n.end) - start;
    const before = p ? 0.5 * (sec0(p.end) - sec0(p.tick)) + Math.max(0, start - sec0(p.end)) : start;
    const lead = Math.max(0, Math.min(want, before, start)), len = Math.min(want, lead + 0.3 * dur);
    leadOf.set(n, { lead, len });
  }
  // how much of a note the next note's consonant takes from its end
  const cutOf = (n) => { const nx = nextNote.get(n), l = nx && leadOf.get(nx); return l ? Math.max(0, l.lead - (sec0(nx.tick) - sec0(n.end))) : 0; };
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
    const ld = leadOf.get(n) || { lead: 0, len: null }, cut = sing === true ? cutOf(n) : 0;
    const start = Math.round((sec(n.tick) - ld.lead) * rate);
    const dur = Math.max(0.03, sec(n.end) - sec(n.tick) - cut);
    if (learn && learn.mode === 'minus' && v === 'choir' && n.ch === learn.ch) continue;
    let wave;
    if (v === 'drums') {
      if (!drumCache.has(n.note)) drumCache.set(n.note, drum(n.note, rate, rand));
      wave = drumCache.get(n.note);
    } else {
      const sung = sing && v === 'choir' ? (latinVowel(n.lyric) || { vowel: 'a', glide: null }) : null;
      const glide = sung && sung.glide && lastOfSyl.has(n) ? sung.glide : null;
      // the same singers go straight on to the next note: a 50 ms crossfade into it, not the pad's
      // 0.25 s release over the next syllable (which covered the quieter /i/ and /u/ on short notes)
      // before a stop, an affricate or a fricative the voices stop for the consonant: 15 ms, so the
      // closure is silent and the hiss is not sung over, and before a tap, so its dip is heard; and before
      // a nasal, whose lips or tongue close the mouth as a stop's do: the 50 ms tail of the vowel covered
      // the first 50 of the murmur's 70 ms, and a third of the sung nasals read as none (README "Nasal
      // openings: the mouth closes"; `nasalCut: false` keeps the 50 ms). l and the glides keep the 50 ms.
      const nx = sung && nextNote.get(n), nxOn = nx ? onsetOf(nx) : [];
      const overlap = nxOn.length && (PHONES[nxOn[0]].F === undefined || nxOn[0] === 'r' || (nasalCut && PHONES[nxOn[0]].kind === 'nasal')) ? 0.015 : 0.05;
      // the gap to the next sound: the next note's start, or where its consonant starts before the beat
      const nxl = nx && leadOf.get(nx) ? leadOf.get(nx).lead : 0;
      const release = sung ? (nextOn.has(n) ? Math.min(0.25, Math.max(overlap, sec(nextOn.get(n)) - nxl - (sec(n.end) - cut) + overlap)) : 0.25) : 0;
      const onset = sung ? onsetOf(n) : [], coda = sung ? codaOf(n) : [];
      const leadMs = Math.round(ld.lead * 1000), lenMs = ld.len === null ? -1 : Math.round(ld.len * 1000);
      const key = `${v}:${n.note}:${Math.round(dur * 1000)}${sung ? `:${sung.vowel}${glide || ''}:${Math.round(release * 1000)}:${onset.join('.')}:${leadMs}:${lenMs}:${coda.join('.')}` : ''}`;
      if (!waveCache.has(key)) waveCache.set(key, sung ? singNote(hz(n.note), dur, rate, { vowel: sung.vowel, glide, release, onset, coda, lead: leadMs / 1000, onsetLen: lenMs < 0 ? null : lenMs / 1000, seed: n.note * 7919 + Math.round(dur * 1000), ...(voiceBar ? {} : { voiceBarLevel: false }), ...(voiceBarWall ? {} : { voiceBarWall: false }) }) : (v === 'choir' ? choir : v === 'organ' ? organ : v === 'bass' ? bass : chordPad)(hz(n.note), dur, rate));
      wave = waveCache.get(key);
    }
    let g = (n.vel / 127) * gain[v], p = pan[v];
    if (learn) { // rehearsal track: the learner's section up front, the other sections and the band behind
      if (v === 'choir' && n.ch === learn.ch) p = learn.pan;
      else if (v === 'choir') { g *= learn.others; p = -learn.pan; }
      else g *= learn.backing;
    }
    const gl = g * (1 - Math.max(0, p)), gr = g * (1 + Math.min(0, p));
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
      const x0 = new Float64Array(total), x1 = new Float64Array(total); // reused by every pass
      const lim = {}; // limiterCurve's working arrays, reused by every pass
      const b0 = base[0], b1 = base[1];
      for (let pass = 0; pass < 8; pass++) {
        gUsed = g;
        for (let i = 0; i < total; i++) { x0[i] = b0[i] * g; x1[i] = b1[i] * g; }
        curve = limiterCurve(x0, x1, rate, c, 5, lim);
        for (let i = 0; i < total; i++) { L[i] = x0[i] * curve[i]; R[i] = x1[i] * curve[i]; }
        const now = integratedLufs([L, R], rate).lufs;
        const tp = truePeak(R, 4, 16, truePeak(L)); // = Math.max of the two
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

// ---- rehearsal ("learning") tracks: one pair per choir section ----
// The tracks choirs buy per part: "part" puts the learner's section loud on the left with
// the other sections at `others` (default -12 dB) on the right and the band at `backing`
// (default -6 dB), so a singer hears their line and where it sits; "minus" is the full
// mix with the learner's section taken out, to sing the part against. A section is a
// choir-program channel; its name is the MIDI track name (chant-forge writes Tenors,
// Second tenors, Baritones, Basses with --split-voices; a unison chant has one section).
export const LEARN_DEFAULTS = { others: 10 ** (-12 / 20), backing: 10 ** (-6 / 20), pan: -0.5 };

export function choirSections(midiBytes) {
  const m = parseMidi(midiBytes);
  const progAt = (ch) => (m.programs.get(ch) || [[0, 0]])[0][1];
  const chans = [...new Set(m.notes.map((n) => n.ch))].filter((ch) => voiceFor(ch, progAt(ch)) === 'choir').sort((a, b) => a - b);
  return chans.map((ch) => {
    const name = (m.names.get(ch) || '').trim() || (chans.length === 1 ? 'Choir' : `Choir ${ch + 1}`);
    const mine = m.notes.filter((n) => n.ch === ch);
    return { ch, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), notes: mine.length, mean: mine.reduce((a, n) => a + n.note, 0) / mine.length };
  }).sort((a, b) => rank(a) - rank(b) || b.mean - a.mean || a.ch - b.ch); // score order: highest section first
}
// chant-forge's own track names in score order; other names sort after them by average pitch
const SCORE_ORDER = ['tenors', 'first-tenors', 'second-tenors', 'baritones', 'basses'];
const rank = (s) => { const k = SCORE_ORDER.indexOf(s.slug); return k < 0 ? SCORE_ORDER.length : k; };

export function learningTracks(midiBytes, { rate = 44100, others = LEARN_DEFAULTS.others, backing = LEARN_DEFAULTS.backing, minus = true, targetLufs = null, sing = false } = {}) {
  const out = [];
  for (const s of choirSections(midiBytes)) {
    out.push({ ...s, mode: 'part', wav: renderMidi(midiBytes, { rate, targetLufs, sing, learn: { ch: s.ch, mode: 'part', others, backing, pan: LEARN_DEFAULTS.pan } }) });
    if (minus) out.push({ ...s, mode: 'minus', wav: renderMidi(midiBytes, { rate, targetLufs, sing, learn: { ch: s.ch, mode: 'minus', others: 1, backing: 1, pan: 0 } }) });
  }
  return out;
}
