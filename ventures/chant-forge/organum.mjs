// Organum: a second voice under the chant, after the rules of the ninth-century Musica
// enchiriadis ("modified parallel organum"). The chant is the vox principalis; the added
// vox organalis sings it a fourth below, with three limits:
//
// 1. a boundary: the organal voice does not go below the nearest note a whole tone or more
//    under the final (in a D final, C; in an F final, D). Where the fourth would fall below it, the voice holds the boundary, so the
//    interval narrows to a third, a second or a unison as the chant comes down to its final;
// 2. no tritone: where the fourth below is not a note the chant itself uses (B over F#
//    when the chant has no F#), the voice takes the third below, then the fifth, then the
//    unison, the first the chant's own notes hold;
// 3. occursus: every phrase ends with both voices on the same note.
//
// It is a texture for the second and later passes of `--repeat` (the first pass stays the
// plain chant, so the track opens as chant and the added voice is the variation), or for the
// whole piece when it is not repeated. Pitch only: rhythm, syllables and bars are the chant's.

export const ORGANUM_DEFAULTS = { interval: 5, from: 2 };

// the chant's own pitch classes: the organal voice sings no note the chant does not
export function collection(events) {
  return new Set(events.filter((e) => e.type === 'note').map((e) => ((e.midi % 12) + 12) % 12));
}

// the nearest note the chant uses at least a whole tone under the final (a semitone boundary
// would put a minor second against every final, as F over E would), or the final
export function boundaryOf(final, pcs) {
  for (let d = 2; d <= 5; d++) if (pcs.has((((final - d) % 12) + 12) % 12)) return final - d;
  return final;
}

// the organal note for one chant note p, before the occursus
export function organalNote(p, { boundary, pcs, interval = ORGANUM_DEFAULTS.interval }) {
  const has = (m) => pcs.has(((m % 12) + 12) % 12);
  let o = p;
  for (const d of [interval, interval - 1, interval + 2]) if (d > 0 && has(p - d)) { o = p - d; break; }
  if (o < boundary) o = p >= boundary ? boundary : p;
  return o;
}

// indexes of the last note of every phrase (a phrase ends at a bar event or the end)
function phraseEnds(events) {
  const ends = new Set();
  let last = -1;
  events.forEach((e, i) => {
    if (e.type === 'note') last = i;
    else if (e.type === 'bar' && last >= 0) { ends.add(last); last = -1; }
  });
  if (last >= 0) ends.add(last);
  return ends;
}

// events -> copies with `organal` (a MIDI number) on every note the added voice sings.
// `from`: the first pass (1-based, as tagged by --repeat) that gets organum; untagged events
// count as pass 1, so without --repeat pass `from: 1` is the whole piece.
export function addOrganum(events, { from = ORGANUM_DEFAULTS.from, interval = ORGANUM_DEFAULTS.interval, lift = 0 } = {}) {
  const notes = events.filter((e) => e.type === 'note');
  if (!notes.length) return { events: events.map((e) => ({ ...e })), notes: 0, intervals: {} };
  // the key the chant is written in: the last note, less any --key-lift it carries; lifted notes
  // (a transposed copy of the line) get the same rules a lift higher
  const final = notes.at(-1).midi - (notes.at(-1).lifted ? lift : 0);
  const pcs = collection(events.map((e) => (e.lifted ? { ...e, midi: e.midi - lift } : e)));
  const keys = [0, lift].map((k) => {
    const set = new Set([...pcs].map((p) => (p + k) % 12));
    return { pcs: set, boundary: boundaryOf(final + k, set) };
  });
  const ends = phraseEnds(events);
  const intervals = {};
  let count = 0;
  const out = events.map((e, i) => {
    const c = { ...e };
    if (e.type !== 'note' || (e.pass || 1) < from) return c;
    const o = ends.has(i) ? e.midi : organalNote(e.midi, { ...keys[e.lifted ? 1 : 0], interval });
    c.organal = o;
    const iv = e.midi - o;
    intervals[iv] = (intervals[iv] || 0) + 1;
    count++;
    return c;
  });
  return { events: out, notes: count, intervals, boundary: keys[0].boundary };
}

// interval counts as words, widest first: "fourth 48, third 6, unison 20"
const NAMES = { 0: 'unison', 1: 'semitone', 2: 'second', 3: 'minor third', 4: 'major third', 5: 'fourth', 7: 'fifth' };
export function describeIntervals(intervals) {
  return Object.entries(intervals).sort((a, b) => b[0] - a[0]).map(([k, n]) => `${NAMES[k] || `${k} semitones`} ${n}`).join(', ');
}
