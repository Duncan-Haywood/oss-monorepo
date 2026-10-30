// @ts-check
// Where the money goes: the shopping list's total split by assembly (the part
// of the shed it builds) and by material type, the cost change between two
// designs by assembly, and the bridge from one design's total to another's.
//
// Lumber is bought by the board but cut into pieces for several assemblies, so
// each board's price is shared among the pieces cut from it in proportion to
// their length; the offcut is shared the same way. Spare boards and bulk prices
// follow their material's split. Everything else is one shopping line to one
// assembly, so the assemblies always add up to the shopping list's total.

/** @typedef {import('./model.mjs').Shed} Shed */
/** @typedef {import('./estimate.mjs').Estimate} Estimate */

/** The assemblies in build order, with a short name for sentences. */
export const ASSEMBLIES = [
  { key: 'foundation', label: 'Foundation and site', short: 'foundation' },
  { key: 'floor', label: 'Floor', short: 'floor' },
  { key: 'walls', label: 'Wall framing', short: 'wall framing' },
  { key: 'roof', label: 'Roof framing and deck', short: 'roof framing' },
  { key: 'roofing', label: 'Roofing', short: 'roofing' },
  { key: 'siding', label: 'Siding', short: 'siding' },
  { key: 'trim', label: 'Trim', short: 'trim' },
  { key: 'openings', label: 'Doors, windows and vents', short: 'doors and windows' },
  { key: 'hardware', label: 'Fasteners and hardware', short: 'fasteners and hardware' },
  { key: 'finish', label: 'Paint and finish', short: 'paint' },
  { key: 'interior', label: 'Inside finish', short: 'inside finish' },
  { key: 'other', label: 'Other', short: 'other' },
];

/** Material types, for the second view. */
export const MATERIAL_TYPES = [
  { key: 'framing', label: 'Framing lumber', short: 'framing lumber' },
  { key: 'treated', label: 'Treated lumber', short: 'treated lumber' },
  { key: 'sheathing', label: 'Plywood and OSB', short: 'plywood and OSB' },
  { key: 'siding', label: 'Siding', short: 'siding' },
  { key: 'roofing', label: 'Roofing', short: 'roofing' },
  { key: 'trim', label: 'Trim boards', short: 'trim boards' },
  { key: 'units', label: 'Doors and windows', short: 'doors and windows' },
  { key: 'metal', label: 'Connectors, flashing, vents and door hardware', short: 'metal hardware' },
  { key: 'fasteners', label: 'Nails, screws, glue and caulk', short: 'fasteners' },
  { key: 'paint', label: 'Paint and stain', short: 'paint' },
  { key: 'interior', label: 'Inside lining', short: 'inside lining' },
  { key: 'site', label: 'Blocks, gravel and site', short: 'site' },
  { key: 'other', label: 'Other', short: 'other' },
];

const CONNECTORS = new Set(['rafterHanger', 'rafterHanger28', 'rafterHanger210', 'pitchConnector', 'hurricaneTie']);
const METAL = new Set([...CONNECTORS, 'gableVent', 'zFlashing']);

/** The assembly a framing member belongs to, from its group. @param {string} group */
export function assemblyOfGroup(group) {
  if (group === 'foundation') return 'foundation';
  if (group === 'floor') return 'floor';
  if (group.startsWith('wall:') || group.startsWith('gable:')) return 'walls';
  if (group === 'roof') return 'roof';
  if (group === 'door') return 'openings';
  return 'other';
}

/**
 * The assembly of a shopping line that is not lumber.
 * @param {{ section: string, source?: any }} r
 */
export function assemblyOfLine(r) {
  const key = r.source?.key || '';
  switch (r.section) {
    case 'Sheet goods': return key === 'roofSheet' ? 'roof' : 'floor';
    case 'Siding': return 'siding';
    case 'Paint': return 'finish';
    case 'Roof trim': case 'Wall trim': return 'trim';
    case 'Interior': return 'interior';
    case 'Roofing': return 'roofing';
    case 'Doors and windows': case 'Door hardware': return 'openings';
    case 'Site prep': return 'foundation';
    case 'Foundation and hardware':
      if (key === 'gableVent') return 'openings';
      return CONNECTORS.has(key) ? 'hardware' : 'foundation';
    case 'Fasteners and sealants': return 'hardware';
    default: return 'other';
  }
}

/** The material type of a shopping line. @param {{ section: string, source?: any }} r */
export function materialOfLine(r) {
  const key = r.source?.key || '';
  if (r.section === 'Lumber') return /^lumber:PT /.test(key) || /^PT /.test(/** @type {any} */ (r).name || '') ? 'treated' : 'framing';
  if (r.section === 'Sheet goods' || key === 'wallSheathing') return 'sheathing';
  if (METAL.has(key) || r.section === 'Door hardware') return 'metal';
  switch (r.section) {
    case 'Siding': return 'siding';
    case 'Roofing': return 'roofing';
    case 'Roof trim': case 'Wall trim': return 'trim';
    case 'Doors and windows': return 'units';
    case 'Fasteners and sealants': return 'fasteners';
    case 'Paint': return 'paint';
    case 'Interior': return key === 'interiorPaint' ? 'paint' : 'interior';
    case 'Site prep': case 'Foundation and hardware': return 'site';
    default: return 'other';
  }
}

/** The lumber material a shopping line buys ('2x4', 'PT 4x6'), from its key or name. @param {any} r */
function lumberMaterial(r) {
  const m = /^lumber:(.+):\d+$/.exec(r.source?.key || '');
  if (m) return m[1];
  return String(r.name).split(' x ')[0];
}

/**
 * For each lumber material, the share of its boards' cost that each assembly takes:
 * each board's price split over its cuts by length (the offcut shared the same way).
 * @param {Shed} shed @param {Estimate} est
 * @returns {Map<string, { share: Record<string, number>, pieces: Record<string, number> }>}
 */
export function lumberShares(shed, est) {
  /** @type {Map<string, string>} */
  const asmOf = new Map();
  for (const m of [...shed.members, ...(shed.doorParts || [])]) asmOf.set(m.id, assemblyOfGroup(m.group));
  const out = new Map();
  for (const l of est.lumber) {
    /** @type {Record<string, number>} */
    const money = {};
    /** @type {Record<string, number>} */
    const pieces = {};
    let all = 0;
    for (const b of l.result.boards) {
      const used = b.cuts.reduce((t, c) => t + c.len, 0);
      if (!(used > 0)) continue;
      for (const c of b.cuts) {
        const a = asmOf.get(/** @type {any} */ (c).id) || 'other';
        money[a] = (money[a] || 0) + (b.price * c.len) / used;
        pieces[a] = (pieces[a] || 0) + 1;
      }
      all += b.price;
    }
    // A material bought at zero (prices typed as 0) still splits by length.
    if (!(all > 0)) {
      for (const k of Object.keys(money)) delete money[k];
      let len = 0;
      for (const b of l.result.boards) for (const c of b.cuts) { const a = asmOf.get(/** @type {any} */ (c).id) || 'other'; money[a] = (money[a] || 0) + c.len; len += c.len; }
      all = len;
    }
    /** @type {Record<string, number>} */
    const share = {};
    for (const [k, v] of Object.entries(money)) share[k] = all > 0 ? v / all : 0;
    out.set(l.material, { share, pieces });
  }
  return out;
}

/**
 * The shopping list's total split by assembly and by material type. Each group
 * lists its lines (a lumber line appears in every assembly that uses its boards,
 * with that assembly's share). Groups come largest first; empty ones are left out.
 * @param {Shed} shed @param {Estimate} est
 */
export function costBreakdown(shed, est) {
  const shares = lumberShares(shed, est);
  /** @type {Map<string, { key: string, label: string, short: string, total: number, lines: { name: string, total: number, qty?: number, unit?: string, note?: string }[] }>} */
  const byAsm = new Map(ASSEMBLIES.map((a) => [a.key, { ...a, total: 0, lines: [] }]));
  /** @type {Map<string, any>} */
  const byMat = new Map(MATERIAL_TYPES.map((a) => [a.key, { ...a, total: 0, lines: [] }]));
  for (const r of est.shopping) {
    const mat = byMat.get(materialOfLine(r));
    mat.total += r.total;
    mat.lines.push({ name: r.name, total: r.total, qty: r.qty, unit: r.unit });
    if (r.section !== 'Lumber') {
      const a = /** @type {any} */ (byAsm.get(assemblyOfLine(r)));
      a.total += r.total;
      a.lines.push({ name: r.name, total: r.total, qty: r.qty, unit: r.unit });
      continue;
    }
    const material = lumberMaterial(r);
    const s = shares.get(material);
    const split = s && Object.keys(s.share).length ? s.share : { other: 1 };
    for (const [k, f] of Object.entries(split)) {
      if (!(f > 0)) continue;
      const a = /** @type {any} */ (byAsm.get(k) || byAsm.get('other'));
      const amount = r.total * f;
      a.total += amount;
      // One line per material in each assembly, gathering that material's board lengths and spares.
      const name = `${material} boards`;
      let line = a.lines.find((x) => x.name === name);
      if (!line) {
        line = { name, total: 0, note: `${s?.pieces[k] || 0} piece${s?.pieces[k] === 1 ? '' : 's'} cut from shared boards` };
        a.lines.push(line);
      }
      line.total += amount;
    }
  }
  const finish = (m) => [...m.values()].filter((g) => Math.abs(g.total) >= 0.005)
    .map((g) => ({ ...g, total: round(g.total), lines: g.lines.map((l) => ({ ...l, total: round(l.total) })).sort((x, y) => y.total - x.total) }))
    .sort((x, y) => y.total - x.total);
  const assemblies = finish(byAsm);
  const materials = finish(byMat);
  return { total: est.total, assemblies, materials };
}

/** @typedef {ReturnType<typeof costBreakdown>} Breakdown */

const round = (n) => Math.round(n * 100) / 100;

/**
 * The cost change from one breakdown to another, by assembly (or material type),
 * biggest change first, leaving out changes under 50 cents.
 * @param {Breakdown} from @param {Breakdown} to @param {'assemblies' | 'materials'} [by]
 */
export function costDelta(from, to, by = 'assemblies') {
  const list = by === 'materials' ? MATERIAL_TYPES : ASSEMBLIES;
  const get = (b, k) => b[by].find((g) => g.key === k)?.total || 0;
  return list.map((g) => ({ key: g.key, label: g.label, short: g.short, from: get(from, g.key), to: get(to, g.key), delta: round(get(to, g.key) - get(from, g.key)) }))
    .filter((x) => Math.abs(x.delta) >= 0.5)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.delta - b.delta);
}

/** Whole dollars with a true minus sign: "-$120", "+$15". @param {number} n */
export function signedDollars(n) {
  const r = Math.round(n);
  return `${r < 0 ? '−' : '+'}$${Math.abs(r).toLocaleString('en-US')}`;
}

/**
 * The change as a phrase: "doors and windows −$120, wall framing −$40, siding +$15".
 * Changes that round to $0 are left out; past `max` items the rest are summed.
 * @param {ReturnType<typeof costDelta>} deltas @param {number} [max]
 */
export function deltaPhrase(deltas, max = 5) {
  const shown = deltas.filter((d) => Math.round(d.delta) !== 0);
  if (!shown.length) return '';
  const head = shown.slice(0, max).map((d) => `${d.short} ${signedDollars(d.delta)}`);
  const rest = shown.slice(max);
  if (rest.length) head.push(`${rest.length} more ${signedDollars(rest.reduce((t, d) => t + d.delta, 0))}`);
  return head.join(', ');
}

/**
 * A bridge (waterfall) from one design's materials total to another's: the start
 * total, each assembly's change (savings first, biggest first, then the rises),
 * and the end total. Each step carries where its bar starts and ends.
 * @param {Breakdown} from @param {Breakdown} to
 */
export function costBridge(from, to) {
  const deltas = costDelta(from, to);
  const ordered = [...deltas.filter((d) => d.delta < 0).sort((a, b) => a.delta - b.delta), ...deltas.filter((d) => d.delta > 0).sort((a, b) => b.delta - a.delta)];
  /** @type {{ kind: 'total' | 'down' | 'up' | 'rest', label: string, value: number, start: number, end: number }[]} */
  const steps = [{ kind: 'total', label: 'Your design', value: from.total, start: 0, end: from.total }];
  let at = from.total;
  for (const d of ordered) {
    steps.push({ kind: d.delta < 0 ? 'down' : 'up', label: d.label, value: d.delta, start: at, end: at + d.delta });
    at += d.delta;
  }
  // Changes under 50 cents each: gathered into a step of their own when they come to
  // 50 cents or more, else folded into the last step, so the bridge lands on the end total.
  const rest = round(to.total - at);
  const last = steps[steps.length - 1];
  if (Math.abs(rest) >= 0.5 || (steps.length === 1 && Math.abs(rest) >= 0.005)) steps.push({ kind: 'rest', label: 'Small changes', value: rest, start: at, end: to.total });
  else if (steps.length > 1) { last.value = round(last.value + rest); last.end = to.total; }
  steps.push({ kind: 'total', label: 'Cheapest passing design', value: to.total, start: 0, end: to.total });
  return { steps, saving: round(from.total - to.total), max: Math.max(...steps.map((s) => Math.max(s.start, s.end))) };
}
