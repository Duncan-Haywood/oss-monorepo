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

export const BARITONE_RANGE = { low: 45, high: 65 }; // A2-F4
// Second tenors (TTBB, 2026-11-13): option tenor2 splits the tenors in two, 'tenor' then
// being the first tenors. The default, C3-G4, is a rule-of-thumb second-tenor range, two
// semitones under the tenor default at the top; an assumption, not a measurement.
export const TENOR2_RANGE = { low: 48, high: 67 }; // C3-G4

// Who can sing a unit: a set of sections, as a bitmask over the section list. With two
// sections the sets are 'all', 'tenor' and 'bass' (the 2026-11-13 behaviour). With a
// baritone section between them (option baritone) a unit can also go to two of the three,
// 'tenor+baritone' or 'baritone+bass' (and 'tenor+bass' for odd custom ranges), or to one.
// Larger sets come first, so the DP's ties go to more singers.
function voiceSets(sections) {
  const full = (1 << sections.length) - 1;
  const sets = [];
  for (let m = 1; m <= full; m++) sets.push(m);
  sets.sort((a, b) => popcount(b) - popcount(a) || a - b);
  const label = (m) => (m === full ? 'all' : sections.filter((_, k) => m & (1 << k)).map((x) => x[0]).join('+'));
  const range = (m) => {
    const rs = sections.filter((_, k) => m & (1 << k)).map((x) => x[1]);
    return { low: Math.max(...rs.map((r) => r.low)), high: Math.min(...rs.map((r) => r.high)) };
  };
  return sets.map((m) => ({ mask: m, label: label(m), range: range(m), size: popcount(m) })).filter((v) => v.range.low <= v.range.high);
}
const popcount = (m) => { let c = 0; for (; m; m >>= 1) c += m & 1; return c; };

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
// entranceCost (2026-11-13): each time a section starts singing after the first note it is
// charged this many section-notes, in the same currency as missing. A section that joins
// for a passage and leaves again then has to sing more than entranceCost notes there to
// be worth bringing in, so short entrances are traded back for fewer changes of singer.
// 0 (the default) keeps the earlier behaviour exactly.
const orderFor = (words, wordCost, entranceCost = 0) => ({
  never: (c) => [c.mid, c.missing + entranceCost * c.entrances, c.changes],
  needed: (c) => [c.mid, c.missing + entranceCost * c.entrances, c.changes],
  prefer: (c) => [c.missing + wordCost * c.mid + entranceCost * c.entrances, c.changes, c.mid],
})[words];
const less = (a, b) => {
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] < b[k];
  return false;
};

// missing counts section-notes not sung: a note sung by one of three sections misses two.
// With two sections it is the number of notes the full choir does not sing, as before.
export function splitVoices(events, { tenor = TENOR_RANGE, bass = BASS_RANGE, baritone = null, tenor2 = null, shift = null, words = 'needed', wordCost = 3, overlap = false, entranceCost = 0 } = {}) {
  for (const r of [tenor, bass, ...(baritone ? [baritone] : []), ...(tenor2 ? [tenor2] : [])]) if (!(r.low < r.high)) throw new Error('low must be below high');
  if (!['never', 'needed', 'prefer'].includes(words)) throw new Error(`words must be never, needed or prefer, not ${words}`);
  if (!(Number.isInteger(wordCost) && wordCost >= 0)) throw new Error('wordCost must be a whole number of notes, 0 or more');
  if (!(Number.isInteger(entranceCost) && entranceCost >= 0)) throw new Error('entranceCost must be a whole number of notes, 0 or more');
  const sections = [['tenor', tenor], ...(tenor2 ? [['tenor2', tenor2]] : []), ...(baritone ? [['baritone', baritone]] : []), ['bass', bass]];
  const S = sections.length;
  const both = { low: Math.max(...sections.map((x) => x[1].low)), high: Math.min(...sections.map((x) => x[1].high)) };
  if (both.low > both.high) throw new Error(`the ${sections.map((x) => x[0]).join(', ')} ranges do not overlap (${sections.map((x) => `${noteName(x[1].low)}-${noteName(x[1].high)}`).join(', ')})`);
  const sets = voiceSets(sections);
  const byLabel = Object.fromEntries(sets.map((v) => [v.label, v]));
  const VOICES = sets.map((v) => v.label);
  const phrases = phrasesOf(events);
  if (!phrases.length) throw new Error('no notes');
  // the units the DP walks: whole phrases, or words when a handoff inside a phrase is allowed
  const units = words === 'never' ? phrases.map((p, k) => ({ ...p, phrase: k })) : wordsOf(events, phrases);
  const order = orderFor(words, wordCost, entranceCost);
  const lo = Math.min(...phrases.map((p) => p.lo));
  const hi = Math.max(...phrases.map((p) => p.hi));
  const fin = events.filter((e) => e.type === 'note').at(-1).midi;
  const fits = (p, s, v) => p.lo + s >= byLabel[v].range.low && p.hi + s <= byLabel[v].range.high;
  const centre = Math.round((both.low + both.high) / 2 - (lo + hi) / 2);
  const allLow = Math.min(...sections.map((x) => x[1].low)), allHigh = Math.max(...sections.map((x) => x[1].high));
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
        const own = (S - byLabel[v].size) * p.notes;
        if (!prev) { cur[v] = { mid: 0, missing: own, changes: 0, entrances: 0 }; from[v] = null; continue; }
        let pick = null;
        for (const u of Object.keys(prev)) {
          const moved = u === v ? 0 : 1;
          const joined = popcount(byLabel[v].mask & ~byLabel[u].mask);
          const c = { mid: prev[u].mid + (samePhrase ? moved : 0), missing: prev[u].missing + own, changes: prev[u].changes + moved, entrances: prev[u].entrances + joined };
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
    if (shift !== null) why = `at this final some ${words === 'never' ? 'phrase' : 'word'} is out of every section's range`;
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
  // Overlap: where tenors hand straight to basses (or back) inside a phrase, the line breaks
  // between two words. With three sections the same holds for any handoff between two sets
  // with no section in common (tenors to basses, tenors and baritones to basses, ...); a
  // handoff that keeps a section singing (tenors and baritones to baritones) does not break.
  // If a note at the seam is in both sets' ranges, both sets sing it: first
  // the incoming section joins on the outgoing section's last note (it takes its pitch from
  // the singers it relieves), else the outgoing section holds on for the incoming's first note.
  const overlaps = [];
  let breaks = 0;
  if (overlap) {
    const inRange = (i, r) => events[i].midi + best.shift >= r.low && events[i].midi + best.shift <= r.high;
    const noteIdx = (r, which) => {
      if (which === 'last') { for (let i = r.last; i >= r.first; i--) if (events[i].type === 'note') return i; }
      else for (let i = r.first; i <= r.last; i++) if (events[i].type === 'note') return i;
      return -1;
    };
    for (let k = 1; k < runs.length; k++) {
      const a = runs[k - 1], b = runs[k];
      if (a.phrase !== b.phrase || (byLabel[a.voice].mask & byLabel[b.voice].mask)) continue;
      const union = sets.find((v) => v.mask === (byLabel[a.voice].mask | byLabel[b.voice].mask));
      const early = noteIdx(a, 'last'), hold = noteIdx(b, 'first');
      const at = !union ? null : inRange(early, union.range) ? [early, 'joins early'] : inRange(hold, union.range) ? [hold, 'holds on'] : null;
      if (!at) { breaks++; continue; }
      voiceAt.set(at[0], union.label);
      const e = events[at[0]];
      overlaps.push({ phrase: a.phrase, index: at[0], note: noteName(e.midi + best.shift), syllable: e.syllable || '', from: a.voice, to: b.voice, how: at[1] });
    }
  }
  const tagged = events.map((e, i) => (e.type === 'note' ? { ...e, midi: e.midi + best.shift, voice: voiceAt.get(i) } : e));
  // counted note by note, so an overlapped note counts once, for the sets that sing it
  const count = (v) => tagged.filter((e) => e.type === 'note' && e.voice === v).length;
  const voiceNotes = Object.fromEntries(VOICES.map((v) => [v, count(v)]).filter(([, n]) => n > 0));
  // per section: every note it sings, alone or with others (its MIDI track)
  const sectionNotes = Object.fromEntries(sections.map(([name], k) => [name, tagged.filter((e) => e.type === 'note' && byLabel[e.voice].mask & (1 << k)).length]));
  return {
    fits: true,
    shift: best.shift,
    final: fin + best.shift,
    finalName: noteName(fin + best.shift),
    unison: [noteName(both.low), noteName(both.high)],
    sections: sections.map((x) => x[0]),
    split: best.cost.missing > 0,
    notes,
    allNotes: count('all'),
    tenorNotes: count('tenor'),
    bassNotes: count('bass'),
    ...(baritone ? { baritoneNotes: count('baritone') } : {}),
    ...(tenor2 ? { tenor2Notes: count('tenor2') } : {}),
    voiceNotes,
    sectionNotes,
    changes: best.cost.changes,
    entrances: best.cost.entrances,
    handoffs: best.cost.mid,
    ...(overlap ? { overlaps, breaks } : {}),
    phrases: out,
    events: tagged,
  };
}

// One line for the CLI and the studio page: who sings what, from a fitting splitVoices result.
// With second tenors in the choir, 'tenor' names the first tenors.
const WHO_NAME = { all: 'all', tenor: 'tenors', tenor2: 'second tenors', baritone: 'baritones', bass: 'basses' };
export function describeSplit(r) {
  const names = r.sections && r.sections.includes('tenor2') ? { ...WHO_NAME, tenor: 'first tenors' } : WHO_NAME;
  const list = (xs) => (xs.length < 3 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
  const whoName = (v) => list(v.split('+').map((x) => (Object.hasOwn(names, x) ? names[x] : x)));
  if (!r.split) return `the whole chant fits ${r.unison.join('-')}, so the full choir sings every phrase (final ${r.finalName})`;
  const whole = (v) => r.phrases.map((p, k) => (p.voice === v ? k + 1 : 0)).filter(Boolean);
  const counts = r.voiceNotes || { tenor: r.tenorNotes, bass: r.bassNotes };
  const notesOf = (v) => counts[v] || 0;
  const mixed = r.phrases.map((p, k) => [p, k + 1]).filter(([p]) => p.voice === 'mixed');
  const alone = Object.keys(counts).filter((v) => v !== 'all' && notesOf(v) > 0).map((v) => {
    const w = whole(v);
    const part = mixed.filter(([p]) => p.parts.some((x) => x.voice === v)).length;
    const where = [w.length ? `phrase ${w.join(', ')}` : '', part ? `part of ${part === 1 ? 'one shared phrase' : `${part} shared phrases`}` : ''].filter(Boolean).join(' and ');
    return `${whoName(v)} ${v.includes('+') ? 'together' : 'alone'} on ${where} (${notesOf(v)} notes)`;
  });
  const shared = mixed.map(([p, n]) => `phrase ${n} handed over at a word: ${p.parts.map((x) => `${whoName(x.voice)} "${x.text}"`).join(', ')}`);
  const over = (r.overlaps || []).map((o) => {
    const at = `${o.note}${o.syllable ? ` ("${o.syllable}")` : ''}`;
    return o.how === 'joins early'
      ? `phrase ${o.phrase + 1}: ${whoName(o.to)} join ${whoName(o.from)} on ${at} and take over`
      : `phrase ${o.phrase + 1}: ${whoName(o.from)} hold on with ${whoName(o.to)} for ${at}`;
  });
  const broken = r.breaks ? [`${r.breaks} handoff${r.breaks === 1 ? '' : 's'} with no note both sections can sing (the line breaks there)`] : [];
  return [`full choir on ${r.allNotes} of ${r.notes} notes (${r.unison.join('-')})`, ...alone, ...shared, ...over, ...broken, `final ${r.finalName}`].join('; ');
}
