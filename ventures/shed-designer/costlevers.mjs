// @ts-check
// What each foundation, floor, door and window choice costs against the design
// you are editing. Every alternative is framed, priced and checked the same
// way as your design (buildShed, estimate, the structure and connection
// checks), so the table shows the change in materials, in your hours and in
// the peak, which checks it fails, and what it means on site.

import { buildShed, normalize, BLOCKS } from './model.mjs';
import { estimate } from './estimate.mjs';
import { structuralChecks } from './checks.mjs';
import { connectionChecks } from './connections.mjs';
import { cutMetrics, laborHours } from './simplify.mjs';
import { PRODUCTS, productById } from './products.mjs';
import { fmtFtIn } from './lumber.mjs';

/** Site-built door widths offered, rough opening in inches. Over 48" the door is built as a pair of leaves. */
export const DOOR_WIDTHS = [36, 48, 60, 72];

/**
 * @param {any} d a normalized design
 * @param {import('./estimate.mjs').Prices} [prices]
 */
function evaluate(d, prices) {
  const shed = buildShed(d);
  const est = estimate(shed, prices);
  const sc = structuralChecks(shed);
  const cc = connectionChecks(shed);
  const hours = laborHours(shed, est, cutMetrics(shed, est));
  const built = new Set((shed.framedOpenings || []).map((/** @type {any} */ p) => p.op?.id ?? p.id));
  const failing = [...sc.rows.filter((r) => !r.ok).map((r) => r.member), ...(cc.ok ? [] : ['a connection check'])];
  const unbuilt = shed.design.openings.filter((o) => !built.has(o.id)).map((o) => o.id);
  return { shed, est, total: est.total, hours, peak: shed.dims.peak, ok: sc.ok && cc.ok && !unbuilt.length, failing, unbuilt };
}

/** Site prep and what it means, for the foundation a design has. */
function siteNote(shed) {
  const d = shed.design;
  const k = shed.dims;
  const block = /** @type {any} */ (BLOCKS)[d.foundation];
  if (!block) return `Strip the turf over a pad 1 ft bigger than the shed all round, lay fabric, then about ${k.gravelCuYd.toFixed(1)} cu yd of crushed stone in 4" lifts, compacted, and level. Drains well and spreads the load; the most digging and hauling.`;
  if (block.pier) return `${k.blockCount} holes dug ${d.pierDepth}" deep (set the depth to your frost line), a tube in each and ${k.pierBags} bags of concrete mixed and poured. The most digging and the most work, but nothing to settle or heave where the ground freezes; call 811 before digging.`;
  const n = `${k.blockCount} ${block.plural}`;
  if (k.noPad) return `${n} on stripped, tamped firm soil, each levelled by hand. The least work and material; on soft or wet ground the blocks can settle, so check the Structure tab's soil row where it is shown.`;
  if (k.underBlocks) return `${n}, each on a 4" bed of paver base (${k.baseBags} bags) in its own hole. Less stone to haul than a full pad; each block is levelled on its own bed.`;
  return `${n} on a compacted stone pad (about ${k.gravelCuYd.toFixed(1)} cu yd). The pad drains under the whole shed and makes the blocks easy to level.`;
}

/** What a window choice means for light and use. */
function windowNote(d) {
  const w = d.openings.filter((o) => o.kind === 'window');
  if (!w.length) return 'No daylight with the door shut: plan on a battery or solar light. Every wall is free for shelving, and there is no glass to break or force.';
  const sqft = w.reduce((t, o) => t + (o.width * o.height) / 144, 0);
  return `${w.length} window${w.length > 1 ? 's' : ''}, about ${sqft.toFixed(1)} sq ft of rough opening: daylight to work by, less wall for shelving.`;
}

/**
 * Every foundation, floor, door and window alternative to the design, priced
 * and checked against it. Rows are grouped; the current choice is marked.
 * @param {any} design @param {import('./estimate.mjs').Prices} [prices]
 */
export function leverOptions(design, prices) {
  const start = normalize(design);
  const base = evaluate(start, prices);
  /** @type {{ title: string, rows: any[] }[]} */
  const groups = [];
  // A choice you fixed shows only as it is: no alternatives are priced for it.
  let lockKey = '';
  const isLocked = () => start.locked.includes(lockKey);
  const row = (label, change, note) => {
    if (isLocked()) return null;
    const d = normalize({ ...start, ...change });
    const r = evaluate(d, prices);
    return {
      label, change, note: note ? note(r.shed) : '', current: false,
      total: r.total, delta: Math.round((r.total - base.total) * 100) / 100, hours: r.hours, dHours: Math.round((r.hours - base.hours) * 10) / 10,
      peak: r.peak, dPeak: r.peak - base.peak, ok: r.ok, failing: r.failing, unbuilt: r.unbuilt,
    };
  };
  const current = (label, note) => ({ label, change: {}, note: note ? note(base.shed) : '', current: true, total: base.total, delta: 0, hours: base.hours, dHours: 0, peak: base.peak, dPeak: 0, ok: base.ok, failing: base.failing, unbuilt: base.unbuilt });

  lockKey = 'foundation';
  // Foundation: skids on a gravel pad, or on each kind of block with each kind of gravel.
  {
    const name = (f, pad) => (f === 'gravel' ? 'Skids on a full gravel pad' : /** @type {any} */ (BLOCKS)[f].pier ? 'Skids on concrete piers in 12" form tubes' : `Skids on ${/** @type {any} */ (BLOCKS)[f].plural}, ${{ full: 'on a full gravel pad', 'under blocks': 'gravel only under each block', none: 'on tamped soil, no gravel' }[pad]}`);
    const rows = [];
    for (const f of ['gravel', ...Object.keys(BLOCKS)]) {
      for (const pad of f === 'gravel' ? ['full'] : /** @type {any} */ (BLOCKS)[f].pier ? ['none'] : ['full', 'under blocks', 'none']) {
        const isCur = start.foundation === f && (f === 'gravel' || /** @type {any} */ (BLOCKS)[f].pier || start.pad === pad);
        rows.push(isCur ? current(name(f, pad), siteNote) : row(name(f, pad), { foundation: f, pad }, siteNote));
      }
    }
    groups.push({ title: 'Foundation', rows: rows.filter(Boolean), locked: isLocked() });
  }
  lockKey = 'floor';
  // Floor frame and subfloor.
  {
    const rows = [current(`${start.joistSize} joists at ${start.joistSpacing}", ${start.floorPanel === 'OSB' ? 'OSB' : 'plywood'} subfloor`)];
    for (const s of [16, 24]) if (s !== start.joistSpacing) rows.push(row(`Joists at ${s}"`, { joistSpacing: s }));
    for (const sz of ['2x4', '2x6', '2x8']) if (sz !== start.joistSize) rows.push(row(`${sz} joists`, { joistSize: sz }));
    rows.push(row(start.floorPanel === 'OSB' ? '23/32" T&G plywood subfloor' : '23/32" T&G OSB subfloor', { floorPanel: start.floorPanel === 'OSB' ? 'plywood' : 'OSB' }));
    groups.push({ title: 'Floor', rows: rows.filter(Boolean), locked: isLocked() });
  }
  lockKey = 'doors';
  // Each door: built on site at a range of widths (a pair of leaves over 48"), or each stock door.
  for (const op of start.openings.filter((o) => o.kind === 'door')) {
    const with_ = (patch) => ({ openings: start.openings.map((o) => (o.id === op.id ? { ...o, ...patch } : o)) });
    const centre = op.offset + op.width / 2;
    const curName = op.product === 'site-built' ? `Built on site, ${op.width}" wide${op.width > 48 ? ' (a pair)' : ''}` : productById(op.product)?.name || `${op.width}" x ${op.height}" opening, no unit chosen`;
    const rows = [current(curName)];
    for (const w of DOOR_WIDTHS) {
      if (op.product === 'site-built' && Math.abs(w - op.width) < 1) continue;
      rows.push(row(`Built on site, ${w}" wide${w > 48 ? ' (a pair of leaves)' : ''}`, with_({ product: 'site-built', width: w, offset: Math.max(0, Math.round(centre - w / 2)) }),
        () => `${fmtFtIn(w)} rough opening for ${w >= 60 ? 'a mower, wheelbarrow or sheet goods' : w >= 48 ? 'a wheelbarrow and bikes' : 'walking in with tools'}.`));
    }
    for (const pr of PRODUCTS.filter((x) => x.kind === 'door' && x.id !== op.product)) {
      rows.push(row(pr.name, with_({ product: pr.id, offset: Math.max(0, Math.round(centre - pr.roW / 2)) }), () => pr.note));
    }
    groups.push({ title: `Door ${op.id} (${op.wall} wall)`, rows: rows.filter(Boolean), locked: isLocked() });
  }
  lockKey = 'windows';
  // Windows: none, or every window as one stock size.
  {
    const wins = start.openings.filter((o) => o.kind === 'window');
    const rows = [current(wins.length ? `${wins.length} window${wins.length > 1 ? 's' : ''} as drawn` : 'No windows', () => windowNote(start))];
    if (wins.length) {
      rows.push(row('No windows', { openings: start.openings.filter((o) => o.kind !== 'window') }, () => windowNote({ openings: [] })));
      for (const pr of PRODUCTS.filter((x) => x.kind === 'window')) {
        if (wins.every((o) => o.product === pr.id)) continue;
        rows.push(row(`Every window: ${pr.name}`, { openings: start.openings.map((o) => (o.kind === 'window' ? { ...o, product: pr.id } : o)) }, () => pr.note));
      }
    }
    groups.push({ title: 'Windows', rows: rows.filter(Boolean), locked: isLocked() });
  }
  for (const g of groups) g.rows.sort((a, b) => Number(b.current) - Number(a.current) || Number(b.ok) - Number(a.ok) || a.delta - b.delta);
  return { base: { total: base.total, hours: base.hours, peak: base.peak }, groups };
}

const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const usd = (n) => `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`;

/**
 * The table, as HTML: one table per group, the current choice first, each
 * other row with its change in materials, hours and peak, its checks and a
 * button carrying its group and row index.
 * @param {ReturnType<typeof leverOptions>} r
 */
export function leverTableHtml(r) {
  let html = '';
  r.groups.forEach((g, gi) => {
    html += `<h4>${escHtml(g.title)}${g.locked ? ' <span class="muted">(kept as you chose; untick it under "Your limits and fixed choices" to price the others)</span>' : ''}</h4><div class="table-wrap"><table class="levers"><thead><tr><th scope="col">Option</th><th scope="col">Materials</th><th scope="col">Your time</th><th scope="col">Peak</th><th scope="col">Checks</th><th scope="col">What it means</th><th scope="col">Apply</th></tr></thead><tbody>`;
    g.rows.forEach((x, i) => {
      const money = x.current ? usd(x.total) : `${x.delta <= 0 ? 'saves' : 'adds'} ${usd(Math.abs(x.delta))}`;
      const time = x.current ? `${x.hours} h` : x.dHours ? `${x.dHours > 0 ? '+' : ''}${x.dHours} h` : 'same';
      const peak = x.current || Math.abs(x.dPeak) < 0.06 ? (x.current ? 'yours' : 'same') : `${x.dPeak > 0 ? '+' : '-'}${fmtFtIn(Math.round(Math.abs(x.dPeak) * 8) / 8)}`;
      const checks = x.ok ? 'pass' : `<strong>fails</strong>: ${escHtml([...x.failing, ...(x.unbuilt.length ? ['an opening does not fit'] : [])].join(', '))}`;
      html += `<tr${x.current ? ' class="current"' : ''}><th scope="row">${x.current ? '<strong>Yours:</strong> ' : ''}${escHtml(x.label)}</th><td>${money}</td><td>${time}</td><td>${peak}</td><td>${checks}</td><td>${escHtml(x.note)}</td><td>${x.current || !x.ok ? '' : `<button type="button" class="btn" data-lever="${gi}:${i}">Use this</button>`}</td></tr>`;
    });
    html += '</tbody></table></div>';
  });
  return html;
}
