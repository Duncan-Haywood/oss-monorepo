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

// Words inside each phrase: a new word starts at a note whose syllable begins a word.
// A handoff inside a phrase is made only at one of these, never inside a word.
export function wordsOf(events, phrases = phrasesOf(events)) {
  const out = [];
  phrases.forEach((p, k) => {
    let cur = null;
    for (let i = p.first; i <= p.last; i++) {
      const e = events[i];
      if (e.type !== 'note') continue;
      if (!cur || e.wordStart) {
        cur = { phrase: k, first: i, last: i, lo: e.midi, hi: e.midi, notes: 0, text: '' };
        out.push(cur);
      }
      cur.last = i;
      cur.lo = Math.min(cur.lo, e.midi);
      cur.hi = Math.max(cur.hi, e.midi);
      cur.notes++;
      if (e.syllable) cur.text += e.syllable;
    }
  });
  return out;
}

// words: 'never' hands over only at bars (the 2026-11-13 behaviour); 'needed' (the
// default) hands over inside a phrase, at a word, only where no whole-phrase split
// fits, and then as few times as it can; 'prefer' hands over at a word when each
// handoff wins the full choir more than wordCost notes (a section taking one word and
// handing back is two handoffs, so it must win more than 2 * wordCost). Every order is exact:
// the DP minimises it over all splits at word boundaries and all finals.
const orderFor = (words, wordCost) => ({
  never: (c) => [c.mid, c.nonAll, c.changes],
  needed: (c) => [c.mid, c.nonAll, c.changes],
  prefer: (c) => [c.nonAll + wordCost * c.mid, c.changes, c.mid],
})[words];
const less = (a, b) => {
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] < b[k];
  return false;
};

export function splitVoices(events, { tenor = TENOR_RANGE, bass = BASS_RANGE, shift = null, words = 'needed', wordCost = 3 } = {}) {
  for (const r of [tenor, bass]) if (!(r.low < r.high)) throw new Error('low must be below high');
  if (!['never', 'needed', 'prefer'].includes(words)) throw new Error(`words must be never, needed or prefer, not ${words}`);
  if (!(Number.isInteger(wordCost) && wordCost >= 0)) throw new Error('wordCost must be a whole number of notes, 0 or more');
  const both = { low: Math.max(tenor.low, bass.low), high: Math.min(tenor.high, bass.high) };
  if (both.low > both.high) throw new Error(`the tenor and bass ranges do not overlap (${noteName(tenor.low)}-${noteName(tenor.high)}, ${noteName(bass.low)}-${noteName(bass.high)})`);
  const phrases = phrasesOf(events);
  if (!phrases.length) throw new Error('no notes');
  // the units the DP walks: whole phrases, or words when a handoff inside a phrase is allowed
  const units = words === 'never' ? phrases.map((p, k) => ({ ...p, phrase: k })) : wordsOf(events, phrases);
  const order = orderFor(words, wordCost);
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
    // DP over units; cost = handoffs inside a phrase, notes not sung by the full choir and
    // changes of who sings, compared in the order the words option gives
    let prev = null;
    const back = [];
    for (let k = 0; k < units.length; k++) {
      const p = units[k];
      const samePhrase = k > 0 && units[k - 1].phrase === p.phrase;
      const cur = {};
      const from = {};
      for (const v of VOICES) {
        if (!fits(p, s, v)) continue;
        const own = v === 'all' ? 0 : p.notes;
        if (!prev) { cur[v] = { mid: 0, nonAll: own, changes: 0 }; from[v] = null; continue; }
        let pick = null;
        for (const u of Object.keys(prev)) {
          const moved = u === v ? 0 : 1;
          const c = { mid: prev[u].mid + (samePhrase ? moved : 0), nonAll: prev[u].nonAll + own, changes: prev[u].changes + moved };
          if (!pick || less(order(c), order(pick[0]))) pick = [c, u];
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
    for (const v of Object.keys(prev)) if (!end || less(order(prev[v]), order(prev[end]))) end = v;
    const cost = prev[end];
    const key = [...order(cost), Math.abs(s - centre)];
    if (best && !less(key, best.key)) continue;
    const who = new Array(units.length);
    who[units.length - 1] = end;
    for (let k = units.length - 1; k > 0; k--) who[k - 1] = back[k][who[k]];
    best = { key, cost, shift: s, who };
  }
  const notes = phrases.reduce((a, p) => a + p.notes, 0);
  if (!best) {
    const widest = (xs) => xs.reduce((w, p) => (p.hi - p.lo > w.hi - w.lo ? p : w));
    const wp = widest(phrases), wu = widest(units);
    let why;
    if (shift !== null) why = `at this final some ${words === 'never' ? 'phrase' : 'word'} is out of both sections' ranges`;
    else if (words === 'never') why = `the widest phrase spans ${wp.hi - wp.lo} semitones and the whole chant ${hi - lo}`;
    else why = `no final puts every word inside one section's range (the widest word${wu.text ? `, "${wu.text}",` : ''} spans ${wu.hi - wu.lo} semitones, the widest phrase ${wp.hi - wp.lo} and the whole chant ${hi - lo})`;
    return { fits: false, reason: why, phrases: phrases.length };
  }
  const voiceAt = new Map();
  units.forEach((u, k) => { for (let i = u.first; i <= u.last; i++) voiceAt.set(i, best.who[k]); });
  // runs: consecutive units with the same singers inside one phrase
  const runs = [];
  units.forEach((u, k) => {
    const last = runs.at(-1);
    if (last && last.phrase === u.phrase && last.voice === best.who[k]) {
      last.last = u.last; last.notes += u.notes; last.lo = Math.min(last.lo, u.lo); last.hi = Math.max(last.hi, u.hi);
      last.text += (u.text ? ' ' + u.text : '');
    } else runs.push({ phrase: u.phrase, first: u.first, last: u.last, notes: u.notes, lo: u.lo, hi: u.hi, voice: best.who[k], text: u.text || '' });
  });
  const out = phrases.map((p, k) => {
    const mine = runs.filter((r) => r.phrase === k);
    const voice = mine.length === 1 ? mine[0].voice : 'mixed';
    return {
      first: p.first, last: p.last, notes: p.notes, low: noteName(p.lo + best.shift), high: noteName(p.hi + best.shift), voice,
      ...(voice === 'mixed' ? { parts: mine.map((r) => ({ voice: r.voice, notes: r.notes, low: noteName(r.lo + best.shift), high: noteName(r.hi + best.shift), text: r.text.trim() })) } : {}),
    };
  });
  const tagged = events.map((e, i) => (e.type === 'note' ? { ...e, midi: e.midi + best.shift, voice: voiceAt.get(i) } : e));
  const count = (v) => runs.filter((r) => r.voice === v).reduce((a, r) => a + r.notes, 0);
  return {
    fits: true,
    shift: best.shift,
    final: fin + best.shift,
    finalName: noteName(fin + best.shift),
    unison: [noteName(both.low), noteName(both.high)],
    split: best.cost.nonAll > 0,
    notes,
    allNotes: count('all'),
    tenorNotes: count('tenor'),
    bassNotes: count('bass'),
    changes: best.cost.changes,
    handoffs: best.cost.mid,
    phrases: out,
    events: tagged,
  };
}

// One line for the CLI and the studio page: who sings what, from a fitting splitVoices result.
const WHO_NAME = { all: 'all', tenor: 'tenors', bass: 'basses' };
const whoName = (v) => (Object.hasOwn(WHO_NAME, v) ? WHO_NAME[v] : v);
export function describeSplit(r) {
  if (!r.split) return `the whole chant fits ${r.unison.join('-')}, so the full choir sings every phrase (final ${r.finalName})`;
  const whole = (v) => r.phrases.map((p, k) => (p.voice === v ? k + 1 : 0)).filter(Boolean);
  const notesOf = (v) => (v === 'tenor' ? r.tenorNotes : r.bassNotes);
  const mixed = r.phrases.map((p, k) => [p, k + 1]).filter(([p]) => p.voice === 'mixed');
  const alone = ['tenor', 'bass'].filter((v) => notesOf(v) > 0).map((v) => {
    const w = whole(v);
    const part = mixed.filter(([p]) => p.parts.some((x) => x.voice === v)).length;
    const where = [w.length ? `phrase ${w.join(', ')}` : '', part ? `part of ${part === 1 ? 'one shared phrase' : `${part} shared phrases`}` : ''].filter(Boolean).join(' and ');
    return `${whoName(v)} alone on ${where} (${notesOf(v)} notes)`;
  });
  const shared = mixed.map(([p, n]) => `phrase ${n} handed over at a word: ${p.parts.map((x) => `${whoName(x.voice)} "${x.text}"`).join(', ')}`);
  return [`full choir on ${r.allNotes} of ${r.notes} notes (${r.unison.join('-')})`, ...alone, ...shared, `final ${r.finalName}`].join('; ');
}
