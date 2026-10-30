// @ts-check
// Ready designs to start from: ten sheds under 100 sq ft, each one chosen
// from the designs lane 1's search (designsearch.mjs) builds, prices and
// checks, never typed in by hand.
//
// Two searches run: one free to change every finish, and one with painted lap
// siding and shingles fixed (the look of a HardieBoard house, which is what
// the owner is matching). Both keep only designs that pass every structural
// and connection check with every member at 90% of capacity or less, that the
// model draws with no warning, that fit the footprint limit and that peak at
// 13 ft or less. Each card
// then takes the best remaining design on its own measure (cheapest, most
// room, most room per dollar, best looks, a size or a door), never one an
// earlier card took, and in a size no earlier card shows when its measure
// leaves one.
//
// `make-gallery.mjs` writes the cards to `gallery-data.mjs` so the page need
// not search on load. The page prices them live (picker.mjs); every number in
// a card's reason here is from the search itself.

import { buildShed, normalize, defaultDesign } from './model.mjs';
import { estimate } from './estimate.mjs';
import { searchDesigns, picks, evaluateDesign, DEFAULT_CONSTRAINTS } from './designsearch.mjs';

/** The permit line in the owner's town, and the gallery's hard limit. */
export const GALLERY_LIMIT_SQFT = 100;

/**
 * The most of its capacity any member may use in a gallery design. A shed is
 * exempt from the house code, so nothing here is sized by house habit; the
 * search sizes each member by the NDS checks in checks.mjs and keeps this 10%
 * in hand for the loads and wood a calculation does not see.
 */
export const GALLERY_MAX_RATIO = 0.9;

/** Designs each search builds: enough to reach every size and layout and follow the front out. */
export const GALLERY_BUDGET = 1200;

/**
 * The gambrel (barn) gets a search of its own and one card. Let into the
 * other searches (2026-10-30), barns took six of the other ten cards: the most
 * room per dollar, the balanced pick, both house-look cards, the long shed and
 * the mower shed. It has no overhang, fascia or soffit and its chords are short
 * 2x4s, so it is cheap for the room; the strip would show little else.
 */
const OTHER_STYLES = ['gable', 'leanTo'];
/**
 * The gallery searches and ranks on usable storage (storage.mjs usableCuFt):
 * the room, plus roof space only where it is open to the room or over a deck.
 * Space over bare rafter ties is not a floor, so a card never wins on it.
 */
const OBJECTIVES_USED = ['cost', 'usable', 'looks'];
const BARN_BUDGET = 400;

/** Painted lap siding and shingles: the HardieBoard-house look. */
const HOUSE = { sidingType: 'fiber cement', sidingColor: 'white', roofCover: 'shingles', trimColor: 'white' };
export const HOUSE_FIXED = ['sidingType', 'sidingColor', 'roofCover'];

const base = (change = {}) => normalize({
  ...defaultDesign(), autoWall: false, wallHeight: 92, maxPeak: 0, maxFootprint: GALLERY_LIMIT_SQFT, ...change,
});
/**
 * The peak above grade, at most: designsearch.mjs's own default, 13 ft. With
 * no limit the roomiest designs are 16 ft gable spans at 9/12 with a 15'8"
 * peak, which is not a sensible shed; many towns also cap an accessory
 * building's height (check yours).
 */
export const GALLERY_MAX_PEAK = DEFAULT_CONSTRAINTS.maxPeak;
export const GALLERY_RULES = { maxFootprint: GALLERY_LIMIT_SQFT, maxUtilisation: GALLERY_MAX_RATIO, maxPeak: GALLERY_MAX_PEAK };
const CONSTRAINTS = GALLERY_RULES;

/** "8x12" with the short side first, half feet as ".5". @param {any} d */
export const sizeOf = (d) => [d.width, d.length].sort((a, b) => a - b).map((x) => String(Math.round((x / 12) * 10) / 10)).join('x');

/**
 * The searches, as run for the gallery, each with `kept`: its feasible
 * designs that also draw with no warning.
 * @param {import('./estimate.mjs').Prices} [prices]
 */
export function gallerySearches(prices) {
  const clean = (/** @type {any} */ r) => ({ ...r, kept: r.all.filter((/** @type {any} */ s) => s.feasible && buildShed(s.design).warnings.length === 0) });
  return {
    free: clean(searchDesigns({ base: base(), prices, budget: GALLERY_BUDGET, constraints: CONSTRAINTS, objectives: OBJECTIVES_USED, knobs: { style: OTHER_STYLES } })),
    house: clean(searchDesigns({ base: base(HOUSE), prices, budget: GALLERY_BUDGET, constraints: CONSTRAINTS, fixed: HOUSE_FIXED, objectives: OBJECTIVES_USED, knobs: { style: OTHER_STYLES } })),
    barn: clean(searchDesigns({ base: base(HOUSE), prices, budget: BARN_BUDGET, constraints: CONSTRAINTS, fixed: HOUSE_FIXED, objectives: OBJECTIVES_USED, knobs: { style: ['gambrel'] } })),
  };
}

const money = (/** @type {number} */ n) => {
  const format = (/** @type {number} */ n) => `$${Math.round(n).toLocaleString('en-US')}`;
  const text = format(Math.abs(n));
  return n < 0 && /[1-9]/.test(text) ? `-${text}` : text;
};
const perDollar = (/** @type {any} */ s) => s.storage.usableCuFt / s.cost;
const bestBy = (/** @type {any[]} */ list, /** @type {(s: any) => number} */ f) => [...list].sort((a, b) => f(b) - f(a) || a.cost - b.cost);
const NEW = ' in a size no card before it in the strip shows';
const balanced = (/** @type {any[]} */ front) => picks(front, OBJECTIVES_USED).find((x) => x.key === 'balanced')?.design;

/**
 * The cards, in order. Each ranks one search's kept designs, best first, and
 * takes the first an earlier card has not (preferring a new size); `why` is the line the card shows,
 * true of the search it came from (the card's own figures come from
 * designfacts.mjs, which measures volume a little differently, so a reason
 * names a rank, not a figure the card would contradict); `first` is false when an earlier card took
 * the overall best and this one is the best in a size not shown yet. `colour` repaints painted siding for variety
 * (paint costs the same in any colour; generateGallery checks it).
 * @type {{ id: string, from: 'free'|'house'|'barn', title: (s: any) => string, rank: (kept: any[], front: any[]) => any[], why: (s: any, kept: any[], first: boolean) => string, colour?: string }[]}
 */
export const GALLERY = [
  {
    id: 'cheapest', from: 'free', title: (s) => `Cheapest ${sizeOf(s.design)}`,
    rank: (kept) => bestBy(kept, (s) => -s.cost),
    why: (s, kept, first) => `The lowest price of the ${kept.length} designs the search kept with every finish free to change${first ? '' : NEW} (${money(s.cost)} when it ran).`,
  },
  {
    id: 'value', from: 'free', title: (s) => `Most room per dollar, ${sizeOf(s.design)}`, colour: 'sage',
    rank: (kept) => bestBy(kept, perDollar),
    why: (s, kept, first) => `The most room inside for the money of the ${kept.length} designs the search kept${first ? '' : NEW}, counting only space you can load.`,
  },
  {
    id: 'balanced', from: 'free', title: (s) => `Balanced ${sizeOf(s.design)}`, colour: 'light gray',
    rank: (kept, front) => [balanced(front), ...bestBy(front, perDollar)].filter(Boolean),
    why: (s, kept, first) => (first ? 'The nearest of the designs nothing beats to being cheapest, roomiest and best looking at once.' : `Of the designs nothing beats on cost, room and looks together, the most room per dollar${NEW}.`),
  },
  {
    id: 'storage', from: 'free', title: (s) => `Most storage ${sizeOf(s.design)}`, colour: 'slate blue',
    rank: (kept) => bestBy(kept, (s) => s.storage.usableCuFt),
    why: (s, kept, first) => `The most room inside of the ${kept.length} designs the search kept${first ? '' : NEW}, counting only space you can load (the room, and roof space open to it or over a deck)${s.storage.overheadOpen ? '; this one is open to the roof' : s.design.atticStorage || s.design.loft !== 'none' ? '; this one has a decked attic' : ''}.`,
  },
  {
    id: 'looks', from: 'house', title: (s) => `Best looking ${sizeOf(s.design)}`, colour: 'greige',
    rank: (kept) => bestBy(kept, (s) => s.looks.score),
    why: (s, kept, first) => `Scores ${s.looks.score}/100 on the tool's looks measure (roof share, proportions, overhang, wall height, symmetry, windows), the top score${first ? '' : NEW} in painted lap siding and shingles.`,
  },
  {
    id: 'house', from: 'house', title: (s) => `${sizeOf(s.design)} to match the house`,
    rank: (kept, front) => [balanced(front), ...bestBy(kept, perDollar)].filter(Boolean),
    why: (s, kept, first) => `Fiber cement lap siding painted to match a HardieBoard house, and shingles, kept as they are; the search chose the rest ${first ? 'for the best balance of cost, room and looks' : `for the most room per dollar${NEW}`}.`,
  },
  {
    id: 'house-cheapest', from: 'house', title: (s) => `Cheapest lap-sided ${sizeOf(s.design)}`, colour: 'cream',
    rank: (kept) => bestBy(kept, (s) => -s.cost),
    why: (s, kept, first) => `The lowest price of the ${kept.length} designs kept with painted lap siding and shingles${first ? '' : NEW} (${money(s.cost)} when it ran).`,
  },
  {
    id: 'barn', from: 'barn', title: (s) => `Barn for storage ${sizeOf(s.design)}`, colour: 'red',
    rank: (kept) => bestBy(kept.filter((s) => s.design.style === 'gambrel'), perDollar),
    why: (s, kept, first) => `A gambrel roof: steep lower slopes and a shallow top put the most room under the gallery's 13 ft height limit. The most room per dollar of the ${kept.length} barns its own search kept in painted lap siding and shingles${first ? '' : NEW}. Searched apart from the other cards, which show gables and lean-tos.`,
  },
  {
    id: 'square', from: 'house', title: () => '10x10 square', colour: 'khaki',
    rank: (kept) => bestBy(kept.filter((s) => s.design.length === 120 && s.design.width === 120), perDollar),
    why: () => 'The full 100 sq ft as a square, the most floor for its length of wall; the most room per dollar of the 10x10s kept.',
  },
  {
    id: 'long', from: 'house', title: (s) => `Long ${sizeOf(s.design)}`, colour: 'sage',
    rank: (kept) => bestBy(kept.filter((s) => Math.max(s.design.length, s.design.width) >= 168), perDollar),
    why: (s, kept, first) => `Narrow and long, for a side yard or along a fence; the most room per dollar of the 14 ft and longer sheds kept${first ? '' : NEW}.`,
  },
  {
    id: 'mower', from: 'house', title: (s) => `Mower shed ${sizeOf(s.design)}`, colour: 'forest green',
    rank: (kept) => bestBy(kept.filter((s) => s.design.openings.some((/** @type {any} */ o) => o.kind === 'door' && o.width >= 48)), perDollar),
    why: (s, kept, first) => `A 48" pair of doors to roll a mower or a wheelbarrow through; the most room per dollar of the designs kept with a door that wide${first ? '' : NEW}.`,
  },
];

/**
 * Framing changes that mostly move cost, tried on each card's design before it
 * is shown. A card that ranks by its own measure (the most room per dollar of
 * the barns, say) can take a design off the search's front, which the
 * search's polish never reached: at 400 designs the barn card kept 2x6 floor
 * joists where 2x4s pass at 67%, $98 dearer for the same room and looks
 * (paretoaudit.test.mjs found it, 2026-10-30).
 */
export const CARD_POLISH = { joistSize: ['2x4', '2x6', '2x8'], joistSpacing: [16, 24], rafterSpacing: [16, 24], rafterSize: ['2x4', '2x6'], floorPanel: ['OSB', 'plywood'] };

/**
 * Take, one at a time, any polish change that makes the design cheaper with no
 * less room and no worse looks, still passing the gallery's rules and drawing
 * with no warning.
 * @param {any} s a scored design from a gallery search
 * @param {import('./estimate.mjs').Prices} [prices]
 */
export function polishCard(s, prices) {
  let cur = s;
  for (let improved = true; improved;) {
    improved = false;
    for (const [k, vals] of Object.entries(CARD_POLISH)) {
      for (const v of vals) {
        if (cur.design[k] === v) continue;
        const r = evaluateDesign(normalize({ ...cur.design, [k]: v }), prices, CONSTRAINTS);
        if (!r.feasible || r.cost > cur.cost - 0.5 || r.storage.usableCuFt < cur.storage.usableCuFt - 1e-9 || r.looks.score < cur.looks.score - 1e-9) continue;
        if (buildShed(r.design).warnings.length) continue;
        cur = { ...cur, ...r, design: r.design };
        improved = true;
      }
    }
  }
  return cur;
}

/**
 * Run both searches and pick every card. Slow (tens of seconds):
 * `make-gallery.mjs` runs it, not the page.
 * @param {import('./estimate.mjs').Prices} [prices]
 * @param {ReturnType<typeof gallerySearches>} [runs] searches already run with these prices
 */
export function generateGallery(prices, runs = gallerySearches(prices)) {
  const used = new Set();
  const sizes = new Set();
  const keyOf = (/** @type {any} */ d) => JSON.stringify({ ...d, name: '', sidingColor: '' });
  /** @type {{ id: string, title: string, reason: string, design: any }[]} */
  const out = [];
  for (const card of GALLERY) {
    const run = runs[card.from];
    const front = run.front.filter((/** @type {any} */ x) => run.kept.includes(x));
    const full = card.rank(run.kept, front).filter(Boolean);
    const ranked = full.filter((x) => !used.has(keyOf(x.design)));
    // A size no earlier card shows, when the card's own measure leaves one.
    const pick = ranked.find((x) => !sizes.has(sizeOf(x.design))) || ranked[0];
    if (!pick) throw new Error(`gallery card ${card.id}: the search kept no design for it`);
    const polished = polishCard(pick, prices);
    const s = used.has(keyOf(polished.design)) ? pick : polished;
    used.add(keyOf(s.design));
    used.add(keyOf(pick.design));
    sizes.add(sizeOf(s.design));
    const title = card.title(s);
    const paint = card.colour && s.design.siding && !['natural', 'unfinished'].includes(s.design.sidingColor) && s.design.sidingType !== 'vinyl';
    const design = normalize({ ...s.design, name: title, ...(paint ? { sidingColor: card.colour } : {}) });
    if (Math.abs(estimate(buildShed(design), prices).total - s.cost) > 0.01) throw new Error(`gallery card ${card.id}: its colour changed its price`);
    out.push({ id: card.id, title, reason: card.why(s, run.kept, pick === full[0]), design });
  }
  return out;
}
