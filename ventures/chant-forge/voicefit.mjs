// Which finals put a whole chant inside a singing range? Pure; no I/O.
// Default range E2-E4 (MIDI 40-64): low bass to high tenor, a men's-choir
// unison line. It is a rule of thumb, not a voice-teacher's ruling.
import { noteName } from './gabc.mjs';

export const MENS_RANGE = { low: 40, high: 64 };

export function suggestFinal(events, { low = MENS_RANGE.low, high = MENS_RANGE.high } = {}) {
  const ms = events.filter((e) => e.type === 'note').map((e) => e.midi);
  if (!ms.length) throw new Error('no notes');
  if (!(low < high)) throw new Error('low must be below high');
  const lo = Math.min(...ms);
  const hi = Math.max(...ms);
  const fin = ms[ms.length - 1];
  const ambitus = hi - lo;
  const out = { ambitus, range: [noteName(low), noteName(high)], fits: ambitus <= high - low };
  if (!out.fits) {
    out.over = ambitus - (high - low);
    return out;
  }
  // shift s keeps every note in [low, high] when low-lo <= s <= high-hi
  const sMin = low - lo;
  const sMax = high - hi;
  const finals = [];
  for (let s = sMin; s <= sMax; s++) finals.push(fin + s);
  const mid = (low + high) / 2;
  const centre = Math.round(mid - (lo + hi) / 2); // centre the line in the range
  const best = Math.min(sMax, Math.max(sMin, centre));
  out.finals = { lowest: finals[0], highest: finals[finals.length - 1], lowestName: noteName(finals[0]), highestName: noteName(finals[finals.length - 1]) };
  out.recommended = { final: fin + best, name: noteName(fin + best), shift: best };
  return out;
}

// ---- Split voices: tenors and basses take turns by phrase ----
//
// E2-E4 above is really the textbook bass range. A whole men's choir singing in
// unison is limited to what both sections can reach: with the textbook ranges
// (tenor C3-A4, bass E2-E4) that is C3-E4, 16 semitones. A chant wider than that
// still fits a men's choir if each phrase goes to the section that can sing it,
// the old alternatim habit of two half-choirs trading verses and phrases.
// splitVoices picks one transposition and, for each phrase (the notes between two
// bars of any kind), who sings it: 'all' when every note is in both ranges,
// otherwise 'tenor' or 'bass'. It maximises the notes the full choir sings, then
// minimises changes of who sings, then keeps the line centred. Pure; no I/O.
export const TENOR_RANGE = { low: 48, high: 69 }; // C3-A4
export const BASS_RANGE = { low: 40, high: 64 }; // E2-E4

export function phrasesOf(events) {
  const out = [];
  let cur = null;
  events.forEach((e, i) => {
    if (e.type === 'bar') { cur = null; return; }
    if (e.type !== 'note') return;
    if (!cur) { cur = { first: i, last: i, lo: e.midi, hi: e.midi, notes: 0 }; out.push(cur); }
    cur.last = i;
    cur.lo = Math.min(cur.lo, e.midi);
    cur.hi = Math.max(cur.hi, e.midi);
    cur.notes++;
  });
  return out;
}

const VOICES = ['all', 'tenor', 'bass'];

export function splitVoices(events, { tenor = TENOR_RANGE, bass = BASS_RANGE, shift = null } = {}) {
  for (const r of [tenor, bass]) if (!(r.low < r.high)) throw new Error('low must be below high');
  const both = { low: Math.max(tenor.low, bass.low), high: Math.min(tenor.high, bass.high) };
  if (both.low > both.high) throw new Error(`the tenor and bass ranges do not overlap (${noteName(tenor.low)}-${noteName(tenor.high)}, ${noteName(bass.low)}-${noteName(bass.high)})`);
  const phrases = phrasesOf(events);
  if (!phrases.length) throw new Error('no notes');
  const lo = Math.min(...phrases.map((p) => p.lo));
  const hi = Math.max(...phrases.map((p) => p.hi));
  const fin = events.filter((e) => e.type === 'note').at(-1).midi;
  const range = { [VOICES[0]]: both, tenor, bass };
  const fits = (p, s, v) => p.lo + s >= range[v].low && p.hi + s <= range[v].high;
  const centre = Math.round((both.low + both.high) / 2 - (lo + hi) / 2);
  const allLow = Math.min(tenor.low, bass.low), allHigh = Math.max(tenor.high, bass.high);
  const shifts = [];
  if (shift !== null) shifts.push(shift);
  else for (let s = allLow - lo; s <= allHigh - hi; s++) shifts.push(s);
  let best = null;
  for (const s of shifts) {
    // DP over phrases; cost = [notes not sung by the full choir, changes of who sings]
    let prev = null;
    const back = [];
    for (const p of phrases) {
      const cur = {};
      const from = {};
      for (const v of VOICES) {
        if (!fits(p, s, v)) continue;
        const own = v === 'all' ? 0 : p.notes;
        if (!prev) { cur[v] = [own, 0]; from[v] = null; continue; }
        let pick = null;
        for (const u of Object.keys(prev)) {
          const c = [prev[u][0] + own, prev[u][1] + (u === v ? 0 : 1)];
          if (!pick || c[0] < pick[0][0] || (c[0] === pick[0][0] && c[1] < pick[0][1])) pick = [c, u];
        }
        cur[v] = pick[0];
        from[v] = pick[1];
      }
      if (!Object.keys(cur).length) { prev = null; break; }
      back.push(from);
      prev = cur;
    }
    if (!prev) continue;
    let end = null;
    for (const v of Object.keys(prev)) if (!end || prev[v][0] < prev[end][0] || (prev[v][0] === prev[end][0] && prev[v][1] < prev[end][1])) end = v;
    const cost = prev[end];
    const key = [cost[0], cost[1], Math.abs(s - centre)];
    if (best && (best.key[0] < key[0] || (best.key[0] === key[0] && (best.key[1] < key[1] || (best.key[1] === key[1] && best.key[2] <= key[2]))))) continue;
    const who = new Array(phrases.length);
    who[phrases.length - 1] = end;
    for (let k = phrases.length - 1; k > 0; k--) who[k - 1] = back[k][who[k]];
    best = { key, shift: s, who };
  }
  const notes = phrases.reduce((a, p) => a + p.notes, 0);
  if (!best) {
    const widest = phrases.reduce((w, p) => (p.hi - p.lo > w.hi - w.lo ? p : w));
    const why = shift !== null
      ? `at this final some phrase is out of both sections' ranges`
      : `the widest phrase spans ${widest.hi - widest.lo} semitones and the whole chant ${hi - lo}`;
    return { fits: false, reason: why, phrases: phrases.length };
  }
  const voiceAt = new Map();
  const out = phrases.map((p, k) => {
    for (let i = p.first; i <= p.last; i++) voiceAt.set(i, best.who[k]);
    return { first: p.first, last: p.last, notes: p.notes, low: noteName(p.lo + best.shift), high: noteName(p.hi + best.shift), voice: best.who[k] };
  });
  const tagged = events.map((e, i) => (e.type === 'note' ? { ...e, midi: e.midi + best.shift, voice: voiceAt.get(i) } : e));
  const count = (v) => out.filter((p) => p.voice === v).reduce((a, p) => a + p.notes, 0);
  return {
    fits: true,
    shift: best.shift,
    final: fin + best.shift,
    finalName: noteName(fin + best.shift),
    unison: [noteName(both.low), noteName(both.high)],
    split: best.key[0] > 0,
    notes,
    allNotes: count('all'),
    tenorNotes: count('tenor'),
    bassNotes: count('bass'),
    changes: best.key[1],
    phrases: out,
    events: tagged,
  };
}
