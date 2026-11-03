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
