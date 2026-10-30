// @ts-check
// What the design detail panel and the side-by-side compare show for one
// starting design: price and where it goes, size, heights, storage, looks,
// openings, structure and why it is on the list. Pure: a design (and the
// prices) in, plain numbers and strings out, so the page, the tests and any
// later report read the same figures.
//
// Storage (floor, volume, shelf wall, headroom) is storage.mjs's, the same
// definition the design search ranks by.

import { buildShed, normalize } from './model.mjs';
import { estimate, examplePrices } from './estimate.mjs';
import { costBreakdown } from './costs.mjs';
import { structuralChecks } from './checks.mjs';
import { productById } from './products.mjs';
import { storageOf } from './storage.mjs';
import { looksOf } from './designsearch.mjs';
import { fmtFtIn, fmtIn } from './lumber.mjs';

const SIDING_NAME = {
  'T1-11': 'T1-11 plywood panels',
  'LP SmartSide': 'LP SmartSide 3/8" panels',
  'LP SmartSide 7/16': 'LP SmartSide 7/16" panels',
  'board and batten': 'board and batten',
  vinyl: 'vinyl lap',
  'fiber cement': 'fiber cement lap',
  'LP SmartSide lap': 'LP SmartSide engineered wood lap',
};
const COLOUR_NAME = { natural: 'stained', unfinished: 'unfinished' };

/** How many cost groups the detail lists before lumping the rest as "Everything else". */
export const BREAKDOWN_TOP = 5;

/**
 * @param {any} input a design (normalized here)
 * @param {{ prices?: any, reason?: string, id?: string, price?: (shed: any) => any }} [opts]
 *   `price` prices the built shed the way the page does (its store choice); it
 *   must return the estimate's shape (`shopping`, `total`, `grandTotal`).
 */
export function designFacts(input, opts = {}) {
  const shed = buildShed(normalize(input), opts.prices);
  const d = shed.design;
  const k = shed.dims;
  const est = opts.price ? opts.price(shed) : estimate(shed, opts.prices || examplePrices());
  const checks = structuralChecks(shed);

  // Cost: by assembly (the part of the shed it builds), largest first, the same
  // split as the editor's "Where the money goes" tab (costs.mjs).
  const costs = costBreakdown(shed, est);
  const groups = costs.assemblies.map((g) => ({ name: g.label, total: g.total })).filter((g) => g.total > 0);
  const breakdown = groups.slice(0, BREAKDOWN_TOP);
  const rest = groups.slice(BREAKDOWN_TOP).reduce((t, g) => t + g.total, 0);
  if (rest > 0) breakdown.push({ name: 'Everything else', total: Math.round(rest * 100) / 100 });

  // Storage: the one definition in storage.mjs, shared with the design search.
  const st = storageOf(shed);
  const lean = d.style === 'leanTo';

  const openings = d.openings.map((o) => {
    const p = productById(o.product);
    const what = o.product === 'site-built' ? 'built on site from the siding' : p ? p.name : `${o.kind === 'door' ? 'door' : 'window'} to suit (no product picked)`;
    return { kind: o.kind, wall: o.wall, size: `${fmtIn(o.width)} x ${fmtIn(o.height)}`, what };
  });

  const worstRow = checks.rows.reduce((m, r) => (r.ratio > m.ratio ? r : m), checks.rows[0]);
  const siding = d.siding ? `${SIDING_NAME[d.sidingType] || d.sidingType}, ${COLOUR_NAME[d.sidingColor] || d.sidingColor}` : 'none (framing only)';
  const roof = d.roofing ? `${d.roofCover === 'metal' ? 'corrugated metal' : 'architectural shingles'}, ${d.roofColor}` : 'none (sheathing only)';
  const roofFrame = lean ? `lean-to: one slope from a ${fmtIn(k.highWall)} front wall to a ${fmtIn(d.wallHeight)} back wall, no ridge or ties` : d.roofType === 'ridgeBeam' ? `ridge beam on posts, open to the roof (2-ply ${d.beamSize})` : d.roofType === 'truss' ? `site-built trusses, ${d.tieSize} bottom chords, OSB gussets` : `ridge board with ${d.tieSize} rafter ties`;
  const foundation = d.foundation === 'gravel' ? 'skids on a gravel pad' : `skids on ${d.foundation === 'blocks' ? 'solid concrete blocks' : d.foundation}`;

  return {
    id: opts.id || '',
    name: d.name,
    reason: opts.reason || '',
    design: d,
    total: est.total,
    grandTotal: est.grandTotal,
    breakdown,
    // The full breakdown, for a cost change against another design (costs.mjs costDelta).
    costs,
    // The design search's looks score, term by term (designsearch.mjs looksOf).
    looks: looksOf(shed),
    footprint: `${fmtFtIn(d.length)} x ${fmtFtIn(d.width)}`,
    footprintSqFt: est.footprintSqFt,
    wallHeight: d.wallHeight,
    peak: k.peak,
    pitch: d.pitch,
    storage: {
      floorSqFt: st.floorSqFt,
      volumeCuFt: st.volumeCuFt,
      shelfFt: st.shelfFt,
      headroom: st.headroom,
      open: st.open,
      widestDoor: st.widestDoor,
    },
    perDollar: {
      sqFtPer100: est.total > 0 ? (st.floorSqFt / est.total) * 100 : 0,
      cuFtPer100: est.total > 0 ? (st.volumeCuFt / est.total) * 100 : 0,
    },
    style: `Gable, ${d.pitch}/12 roof, ${fmtIn(d.overhang)} overhang`,
    siding,
    roof,
    openings,
    structure: {
      roof: roofFrame,
      rafters: `${d.rafterSize} at ${d.rafterSpacing}"`,
      walls: `${d.studSize} at ${d.studSpacing}"`,
      floor: `${d.joistSize} joists at ${d.joistSpacing}"`,
      foundation,
      ok: checks.ok,
      worst: worstRow ? { member: worstRow.member, ratio: worstRow.ratio } : null,
    },
    warnings: shed.warnings.length,
    overLimit: d.maxFootprint > 0 && est.footprintSqFt > d.maxFootprint + 1e-9,
  };
}

/** @typedef {ReturnType<typeof designFacts>} Facts */

/**
 * The rows of the side-by-side compare. Each row has the label, one display
 * string per design, and which designs are best on it (for numbers with a
 * direction) and whether the designs differ at all, so the page can highlight
 * the differences and the winners.
 * @param {Facts[]} list
 */
export function compareRows(list) {
  const money = (n) => {
    const format = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
    const text = format(Math.abs(n));
    return n < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const n1 = (x) => (Math.round(x * 10) / 10).toString();
  /** @type {{ key: string, label: string, values: string[], nums?: number[], better?: 'low'|'high', group: string }[]} */
  const spec = [
    { key: 'total', group: 'Cost', label: 'Materials', values: list.map((f) => money(f.total)), nums: list.map((f) => f.total), better: 'low' },
    { key: 'sqft$', group: 'Cost', label: 'Floor per $100', values: list.map((f) => `${n1(f.perDollar.sqFtPer100)} sq ft`), nums: list.map((f) => f.perDollar.sqFtPer100), better: 'high' },
    { key: 'cuft$', group: 'Cost', label: 'Volume per $100', values: list.map((f) => `${Math.round(f.perDollar.cuFtPer100)} cu ft`), nums: list.map((f) => f.perDollar.cuFtPer100), better: 'high' },
    { key: 'footprint', group: 'Size', label: 'Footprint', values: list.map((f) => `${f.footprint} (${Math.round(f.footprintSqFt)} sq ft)`) },
    { key: 'walls', group: 'Size', label: 'Walls', values: list.map((f) => fmtFtIn(f.wallHeight)), nums: list.map((f) => f.wallHeight) },
    { key: 'peak', group: 'Size', label: 'Peak', values: list.map((f) => fmtFtIn(f.peak)), nums: list.map((f) => f.peak) },
    { key: 'floor', group: 'Storage', label: 'Floor inside', values: list.map((f) => `${n1(f.storage.floorSqFt)} sq ft`), nums: list.map((f) => f.storage.floorSqFt), better: 'high' },
    { key: 'volume', group: 'Storage', label: 'Volume', values: list.map((f) => `${Math.round(f.storage.volumeCuFt)} cu ft`), nums: list.map((f) => f.storage.volumeCuFt), better: 'high' },
    { key: 'shelf', group: 'Storage', label: 'Shelf wall', values: list.map((f) => `${n1(f.storage.shelfFt)} ft`), nums: list.map((f) => f.storage.shelfFt), better: 'high' },
    { key: 'headroom', group: 'Storage', label: 'Headroom', values: list.map((f) => `${fmtFtIn(f.storage.headroom)}${f.storage.open ? ', open' : ', under ties'}`), nums: list.map((f) => f.storage.headroom), better: 'high' },
    { key: 'door', group: 'Storage', label: 'Widest door', values: list.map((f) => (f.storage.widestDoor ? fmtIn(f.storage.widestDoor) : 'none')), nums: list.map((f) => f.storage.widestDoor), better: 'high' },
    { key: 'siding', group: 'Looks', label: 'Siding', values: list.map((f) => f.siding) },
    { key: 'roof', group: 'Looks', label: 'Roof', values: list.map((f) => f.roof) },
    { key: 'style', group: 'Looks', label: 'Shape', values: list.map((f) => f.style) },
    { key: 'openings', group: 'Looks', label: 'Doors, windows', values: list.map((f) => { const dn = f.openings.filter((o) => o.kind === 'door').length; const wn = f.openings.length - dn; return `${dn} door${dn === 1 ? '' : 's'}, ${wn} window${wn === 1 ? '' : 's'}`; }) },
    { key: 'roofFrame', group: 'Structure', label: 'Roof frame', values: list.map((f) => f.structure.roof) },
    { key: 'framing', group: 'Structure', label: 'Framing', values: list.map((f) => `rafters ${f.structure.rafters}, studs ${f.structure.walls}, ${f.structure.floor}`) },
    { key: 'checks', group: 'Structure', label: 'Checks', values: list.map((f) => (f.structure.ok ? 'pass' : 'over capacity') + (f.structure.worst ? ` (most used: ${f.structure.worst.member}, ${Math.round(f.structure.worst.ratio * 100)}%)` : '')) },
  ];
  return spec.map((r) => {
    const differs = new Set(r.values).size > 1;
    /** @type {number[]} */
    let best = [];
    if (differs && r.nums && r.better) {
      const target = r.better === 'low' ? Math.min(...r.nums) : Math.max(...r.nums);
      // Within half a percent counts as a tie, so rounding never crowns one.
      best = r.nums.map((x, i) => (Math.abs(x - target) <= Math.abs(target) * 0.005 ? i : -1)).filter((i) => i >= 0);
      if (best.length === r.nums.length) best = [];
    }
    return { key: r.key, group: r.group, label: r.label, values: r.values, differs, best };
  });
}

/**
 * Why a design is on the list, when its source gave no reason: what it does
 * best among the designs shown with it, in plain words, from the numbers.
 * @param {Facts} f
 * @param {Facts[]} all
 */
export function tradeOff(f, all) {
  if (f.reason) return f.reason;
  const top = (get, hi = true) => { const v = all.map(get); const t = hi ? Math.max(...v) : Math.min(...v); return Math.abs(get(f) - t) <= Math.abs(t) * 0.005; };
  const said = [];
  if (all.length > 1 && top((x) => x.total, false)) said.push('the lowest materials cost of these');
  if (all.length > 1 && top((x) => x.perDollar.sqFtPer100)) said.push('the most floor for the money');
  if (all.length > 1 && top((x) => x.storage.volumeCuFt)) said.push('the most room inside');
  if (all.length > 1 && top((x) => x.storage.widestDoor)) said.push('the widest door');
  if (all.length > 1 && top((x) => x.peak, false)) said.push('the lowest roofline');
  if (!said.length) said.push(`${Math.round(f.storage.floorSqFt)} sq ft inside for ${`$${Math.round(f.total).toLocaleString('en-US')}`}`);
  const s = said.join(', ');
  return `${s[0].toUpperCase()}${s.slice(1)}.`;
}
