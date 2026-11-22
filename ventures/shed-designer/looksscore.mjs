// @ts-check
// The design search's looks score (looksOf), on its own so a page can show a
// design's score without loading the whole search engine: designsearch.mjs
// (about 40 kB) re-exports it unchanged, and designfacts.mjs, which the editor
// page's ready-design cards use, imports it from here.

/**
 * @typedef {{ key: string, label: string, points: number, max: number, why: string }} LooksTerm
 * @typedef {{ score: number, terms: LooksTerm[] }} Looks
 */

const r1 = (/** @type {number} */ x) => Math.round(x * 10) / 10;
/** Full points inside [lo, hi], falling linearly to zero `fall` beyond either end. */
const band = (/** @type {number} */ x, /** @type {number} */ lo, /** @type {number} */ hi, /** @type {number} */ fall) => (x >= lo && x <= hi ? 1 : Math.max(0, 1 - (x < lo ? lo - x : x - hi) / fall));

/**
 * Looks: a heuristic score out of 100, the sum of the terms below. It encodes
 * common rules of thumb for small outbuildings, not a measurement of beauty,
 * and two people will disagree with it. Each term says why it scored what it did.
 * - pitch (20): full from 6/12 to 9/12, the range most house roofs use, so the
 *   shed reads as part of the house; less at shallower pitches. A lean-to's
 *   single slope reads as deliberate when it is low: full from 3/12 to 5/12,
 *   less as it steepens and the front wall towers. A saltbox: full for a back
 *   slope from 4/12 to 6/12 under a front at least half again as steep.
 * - roofShare (15): the roof's rise as a share of the gable end's height above
 *   grade, full from 30% to 45%; a thin roof on tall walls looks like a box.
 * - plan (10): footprint long side over short side, full from 1.2 to 1.6;
 *   exactly square is boxier, much longer looks like a corridor.
 * - overhang (15): full from 8" to 12"; none looks unfinished, deep looks heavy.
 * - walls (10): floor to plate from 84" to 98", the customary 7 to 8 ft
 *   sidewall; on a lean-to, the mean of its low and tall walls.
 * - symmetry (15): each wall's openings mirror about its centre within 2".
 * - windows (15): 8 for one window, 12 for two or more, and 3 more when every
 *   window head lines up with the door head within 1".
 * @param {any} shed
 * @returns {Looks}
 */
export function looksOf(shed) {
  const d = shed.design;
  const k = shed.dims;
  /** @type {LooksTerm[]} */
  const terms = [];
  const add = (key, label, max, frac, why) => terms.push({ key, label, max, points: r1(max * Math.max(0, Math.min(1, frac))), why });
  const lean = d.style === 'leanTo';
  const barn = d.style === 'gambrel';
  if (barn) {
    add('pitch', 'Roof pitch', 20, d.pitch >= 4 && d.pitch <= 8 ? 1 : d.pitch === 3 || d.pitch === 9 ? 0.6 : 0.3,
      `${d.gambrelLower}/12 below the bend and ${d.pitch}/12 above it; full marks for an upper slope from 4/12 to 8/12, the classic barn outline`);
  } else if (d.style === 'saltbox') {
    // A saltbox reads right when the long back is a house-like slope under a front about twice as steep.
    add('pitch', 'Roof pitch', 20, (d.pitch >= 4 && d.pitch <= 6 ? 1 : d.pitch === 3 || d.pitch === 7 ? 0.6 : 0.3) * (d.frontPitch >= 1.5 * d.pitch ? 1 : 0.7),
      `${d.frontPitch}/12 front and ${d.pitch}/12 back; full marks for a back from 4/12 to 6/12 under a front at least half again as steep, the classic saltbox`);
  } else if (lean) {
    add('pitch', 'Roof pitch', 20, d.pitch >= 3 && d.pitch <= 5 ? 1 : d.pitch === 6 || d.pitch === 2 ? 0.7 : d.pitch === 7 ? 0.4 : 0.15,
      `${d.pitch}/12 on one slope; full marks from 3/12 to 5/12, where a lean-to looks deliberate`);
  } else {
    add('pitch', 'Roof pitch', 20, d.pitch >= 6 && d.pitch <= 9 ? 1 : d.pitch === 5 || d.pitch === 10 ? 0.7 : d.pitch === 4 || d.pitch >= 11 ? 0.4 : 0.15,
      `${d.pitch}/12; full marks from 6/12 to 9/12, where most house roofs sit`);
  }
  const rise = k.peak - k.plateTop;
  const share = rise / k.peak;
  add('roofShare', 'Roof to wall proportion', 15, band(share, 0.3, 0.45, 0.15), `the roof is ${Math.round(share * 100)}% of the ${lean ? 'end wall' : 'gable end'}'s height; full from 30% to 45%`);
  const aspect = Math.max(d.length, d.width) / Math.min(d.length, d.width);
  add('plan', 'Footprint proportion', 10, band(aspect, 1.2, 1.6, 0.5), `long side ${aspect.toFixed(2)} times the short; full from 1.2 to 1.6`);
  // Half marks: a barn traditionally has none, but it is the one shape here that cannot have one.
  if (barn) add('overhang', 'Overhang', 15, 0.5, 'none, as on a barn: its steep lower slope carries the water past the wall; half marks');
  else add('overhang', 'Overhang', 15, band(d.overhang, 8, 12, 8), `${d.overhang}" at the eaves; full from 8" to 12"`);
  const wall = k.plateTop - k.floorTop + (lean ? k.rise / 2 : 0);
  add('walls', 'Sidewall height', 10, band(wall, 84, 98, 12), `${Math.round(wall)}" floor to plate${lean ? ' (the mean of the low and tall walls)' : ''}; full from 84" to 98"`);
  const walls = [...new Set(d.openings.map((o) => o.wall))];
  const sym = walls.filter((w) => {
    const len = w === 'front' || w === 'back' ? d.length : d.width;
    const ops = d.openings.filter((o) => o.wall === w).map((o) => ({ c: o.offset + o.width / 2, w: o.width, k: o.kind }));
    return ops.every((o) => ops.some((p) => p.k === o.k && Math.abs(p.w - o.w) < 1 && Math.abs(p.c + o.c - len) < 2));
  }).length;
  add('symmetry', 'Symmetry', 15, walls.length ? sym / walls.length : 1, `${sym} of ${walls.length} walls with openings are symmetric about their centre`);
  const wins = d.openings.filter((o) => o.kind === 'window');
  const doors = d.openings.filter((o) => o.kind === 'door');
  const doorHead = doors.length ? Math.max(...doors.map((o) => o.height)) : null;
  const aligned = wins.length > 0 && doorHead !== null && wins.every((o) => Math.abs((o.sill ?? 42) + o.height - doorHead) <= 1);
  add('windows', 'Windows', 15, ((wins.length >= 2 ? 12 : wins.length === 1 ? 8 : 0) + (aligned ? 3 : 0)) / 15,
    `${wins.length} window${wins.length === 1 ? '' : 's'}${aligned ? ', heads in line with the door head' : ''}`);
  return { score: r1(terms.reduce((t, x) => t + x.points, 0)), terms };
}
