// @ts-check
// Ready designs to start from: a gallery of sheds under 100 sq ft, each one
// found by the engine's own search rather than typed in by hand.
//
// Every entry is a starting shape (footprint, doors, windows, the finish it
// keeps) plus the things the search may not change. `generateGallery` runs the
// cheapest-materials search from `simplify.mjs` over the rest (pitch,
// overhang, rafter and stud sizes and spacing, seats, ridge, subfloor,
// foundation, siding, roofing, stock doors and windows), keeping every
// structural and connection check passing and the footprint under the limit.
// `make-gallery.mjs` writes the winners to `data/gallery.json` so the page
// need not re-run the search on load; `gallery.test.mjs` re-runs it and fails
// when the file has drifted from what the engine now picks.
//
// Prices, storage figures and every number in a card's reason are worked out
// from the design when the card is shown (`describeGallery`), never stored.

import { buildShed, normalize, defaultDesign } from './model.mjs';
import { estimate } from './estimate.mjs';
import { structuralChecks } from './checks.mjs';
import { connectionChecks } from './connections.mjs';
import { simplify } from './simplify.mjs';
import { fmtFtIn } from './lumber.mjs';

/** The permit line the owner's town uses, and the gallery's hard limit. */
export const GALLERY_LIMIT_SQFT = 100;

/**
 * The most of its capacity any member may use in a gallery design. A shed is
 * exempt from the house code, so nothing here is sized by house habit; the
 * search sizes each member by the NDS checks in checks.mjs and keeps this 10%
 * in hand for the loads and wood a calculation does not see.
 */
export const GALLERY_MAX_RATIO = 0.9;

/**
 * What every gallery shed starts from: 8 ft walls (the customary height),
 * shingles, a site-built door, solid blocks on tamped soil, under 100 sq ft.
 * @param {any} change
 */
const base = (change) => ({
  ...defaultDesign(),
  wallHeight: 96, autoWall: false, autoPitch: false, autoOverhang: false, maxPeak: 0,
  roofCover: 'shingles', maxFootprint: GALLERY_LIMIT_SQFT,
  ...change,
});

/** Painted lap siding over OSB, the look of a fiber cement (HardieBoard) house. */
const LAP = { sidingType: 'fiber cement', sidingColor: 'white', trimColor: 'white' };

const door = (wall, offset, width = 38.5, height = 78) => ({ kind: 'door', wall, offset, width, height, product: 'site-built' });
const win = (wall, offset, product = 'swm-1421') => ({ kind: 'window', wall, offset, width: 14.25, height: 21.25, sill: 44, product });
const ids = (list) => list.map((o, i) => ({ id: `o${i + 1}`, ...o }));

/**
 * The gallery. `goal` is the search's goal (`GOALS` in simplify.mjs; cheapest
 * materials unless named). `keep` names the design keys the search must leave alone: the
 * thing the card is on the list for. `rank` says which figure the card's claim
 * rests on, checked by the test against every other card.
 * @type {{ id: string, title: string, why: string, keep: string[], goal?: 'cheapest'|'balanced', rank?: 'price'|'volume'|'perDollar'|'floor', seed: () => any }[]}
 */
export const GALLERY = [
  {
    id: 'cheapest', title: 'Cheapest 8x12', rank: 'perDollar',
    why: 'The search was free to change every finish, roof and siding included: the most room per dollar in the gallery.',
    keep: ['length', 'width', 'wallHeight', 'openings'],
    seed: () => base({ name: 'Cheapest 8x12', length: 144, width: 96, openings: ids([door('front', 53), win('back', 65)]) }),
  },
  {
    id: 'house-match', title: '8x12 to match the house',
    why: 'Painted lap siding and shingles like a HardieBoard house, at the lowest price the search found for that finish.',
    keep: ['length', 'width', 'wallHeight', 'sidingType', 'sidingColor', 'roofCover', 'openings'],
    seed: () => base({ ...LAP, name: '8x12 lap-sided shed', length: 144, width: 96, openings: ids([door('front', 53), win('back', 32), win('back', 98)]) }),
  },
  {
    id: 'storage', title: 'Most storage 10x10', rank: 'volume',
    why: 'The full 100 sq ft under an open ridge-beam roof at 9/12: a loft-sized space over the 8 ft walls, the most room under a roof in the gallery.',
    keep: ['length', 'width', 'wallHeight', 'pitch', 'roofType', 'openings', 'sidingType', 'sidingColor', 'roofCover'],
    seed: () => base({ ...LAP, name: '10x10 storage shed, open roof', length: 120, width: 120, pitch: 9, roofType: 'ridgeBeam', openings: ids([door('front', 40.75), win('back', 53)]) }),
  },
  {
    id: 'looks', title: 'Best looking 8x12',
    why: 'A steeper 7/12 roof, a full foot of overhang and a centred door between two windows: proportions that read as a small house.',
    keep: ['length', 'width', 'wallHeight', 'pitch', 'overhang', 'openings', 'sidingType', 'sidingColor', 'trimColor', 'roofColor', 'roofCover'],
    seed: () => base({ ...LAP, name: '8x12 cottage shed', length: 144, width: 96, pitch: 7, overhang: 12, sidingColor: 'gray', openings: ids([door('front', 52.75), win('front', 22), win('front', 108)]) }),
  },
  {
    id: 'balanced', title: 'Balanced 8x12, open roof', goal: 'balanced',
    why: 'A ridge beam leaves no ties across the room, and the search counted your own hours at $50 an hour as well as materials, so it skips savings that cost more time than they save.',
    keep: ['length', 'width', 'openings', 'sidingType', 'sidingColor', 'roofCover', 'roofType'],
    seed: () => base({ ...LAP, name: 'Balanced 8x12', length: 144, width: 96, pitch: 6, roofType: 'ridgeBeam', openings: ids([door('front', 53), win('back', 32), win('back', 98)]) }),
  },
  {
    id: 'square', title: '10x10 mower shed', rank: 'floor',
    why: 'Exactly 100 sq ft: the biggest floor the limit allows, with a wide door on the gable end for a mower.',
    keep: ['length', 'width', 'wallHeight', 'openings', 'sidingType', 'sidingColor', 'roofType', 'roofCover'],
    seed: () => base({ ...LAP, name: '10x10 shed', roofType: 'ridgeBoard', length: 120, width: 120, openings: ids([door('left', 30, 60, 78), win('front', 53)]) }),
  },
  {
    id: 'long', title: 'Long 7x14',
    why: 'A narrow 7 ft span along a fence or a side yard: short rafters, and two doors so nothing is ever at the back.',
    keep: ['length', 'width', 'wallHeight', 'openings', 'sidingType', 'sidingColor', 'roofCover'],
    seed: () => base({ ...LAP, name: '7x14 side-yard shed', roofType: 'ridgeBoard', length: 168, width: 84, openings: ids([door('front', 24), door('front', 106), win('back', 77)]) }),
  },
  {
    id: 'garden', title: 'Small 8x8 garden shed', rank: 'price',
    why: 'The smallest and the lowest price in the gallery, for tools and bags of soil: a door on the gable end and a window over a potting bench.',
    keep: ['length', 'width', 'wallHeight', 'openings', 'sidingType', 'sidingColor', 'roofType', 'roofCover'],
    seed: () => base({ ...LAP, name: '8x8 garden shed', roofType: 'ridgeBoard', length: 96, width: 96, sidingColor: 'green', openings: ids([door('left', 29), win('front', 41)]) }),
  },
  {
    id: 'bike', title: 'Bike shed 6x16',
    why: 'Six bikes side by side behind a long eave wall, through two doors: 96 sq ft that fits a narrow strip.',
    keep: ['length', 'width', 'wallHeight', 'openings', 'sidingType', 'sidingColor', 'roofCover'],
    seed: () => base({ ...LAP, name: '6x16 bike shed', roofType: 'ridgeBoard', length: 192, width: 72, openings: ids([door('front', 30, 60, 78), door('front', 102, 60, 78)]) }),
  },
  {
    id: 'workshop', title: '9x11 workshop',
    why: '99 sq ft, wide enough for a bench along one wall and a door on the other, with windows both sides for light.',
    keep: ['length', 'width', 'wallHeight', 'openings', 'sidingType', 'sidingColor', 'roofType', 'roofCover'],
    seed: () => base({ ...LAP, name: '9x11 workshop shed', roofType: 'ridgeBoard', length: 132, width: 108, sidingColor: 'blue', openings: ids([door('left', 35), win('front', 59), win('back', 35), win('back', 83)]) }),
  },
];

/**
 * Storage figures from the built shed, inside the studs.
 * floor: clear floor in sq ft. volume: cubic feet from the floor to the roof
 * (ridge beam: open to the rafters; ridge board: the triangle over the ties
 * counts too, as a loft on the ties). shelf: feet of inside wall with no door
 * or window in it, for shelves. door: the widest door, inches.
 * @param {any} shed
 */
export function storageOf(shed) {
  const d = shed.design;
  const D = shed.dims.stud;
  const inL = d.length - 2 * D;
  const inW = d.width - 2 * D;
  const wallH = shed.dims.plateTop - shed.dims.floorTop;
  const rise = (inW / 2) * (d.pitch / 12);
  const floor = (inL * inW) / 144;
  const volume = (inL * inW * wallH + 0.5 * inW * rise * inL) / 1728;
  const perimeter = 2 * (inL + inW);
  const openings = d.openings.reduce((t, o) => t + o.width, 0);
  const shelf = Math.max(0, perimeter - openings) / 12;
  const door = Math.max(0, ...d.openings.filter((o) => o.kind === 'door').map((o) => o.width));
  return { footprint: (d.length * d.width) / 144, floor, volume, shelf, door };
}

/**
 * Run the search for one gallery entry.
 * @param {(typeof GALLERY)[number]} entry
 * @param {import('./estimate.mjs').Prices} [prices]
 */
export function optimiseEntry(entry, prices) {
  const seed = normalize(entry.seed());
  const goal = entry.goal || 'cheapest';
  const r = simplify(seed, prices, { goals: [goal], products: true, keep: entry.keep, rounds: 8, maxRatio: GALLERY_MAX_RATIO, clean: true });
  const w = r.winners[goal];
  return { id: entry.id, design: { ...w.design, name: seed.name }, changes: w.changes, from: r.base.total, evaluated: r.evaluated };
}

/**
 * Every entry, searched. Slow (seconds an entry): run by `make-gallery.mjs`,
 * not on page load.
 * @param {import('./estimate.mjs').Prices} [prices]
 */
export function generateGallery(prices) {
  return GALLERY.map((e) => optimiseEntry(e, prices));
}

/**
 * Cards for the page: each stored design rebuilt and priced now, with its
 * storage figures and the checks it passes.
 * @param {{ id: string, design: any, changes?: string[] }[]} stored
 * @param {import('./estimate.mjs').Prices} [prices]
 * @param {(shed: any) => any} [price] how to price a shed (the page passes its store choice)
 */
export function describeGallery(stored, prices, price = (shed) => estimate(shed, prices)) {
  const byId = new Map(GALLERY.map((g) => [g.id, g]));
  return stored.filter((s) => byId.has(s.id)).map((s) => {
    const g = /** @type {(typeof GALLERY)[number]} */ (byId.get(s.id));
    const shed = buildShed(normalize(s.design));
    const est = price(shed);
    const sc = structuralChecks(shed);
    const cc = connectionChecks(shed);
    const st = storageOf(shed);
    const worst = sc.rows.reduce((m, x) => Math.max(m, x.ratio), 0);
    const ft = (x) => Math.round(x / 12);
    return {
      id: g.id, title: g.title, why: g.why, rank: g.rank, design: shed.design, changes: s.changes || [],
      total: est.total, grandTotal: est.grandTotal, ...st, perDollar: st.volume / est.total,
      ok: sc.ok && cc.ok, worst,
      size: `${ft(shed.design.width)}x${ft(shed.design.length)} ft`,
      summary: `${shed.design.pitch}/12 roof, peak ${fmtFtIn(shed.dims.peak)}, ${shed.design.sidingType} siding, ${shed.design.roofCover}`,
      peak: shed.dims.peak,
    };
  });
}
