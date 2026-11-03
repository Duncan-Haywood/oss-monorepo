// @ts-check
// Which drawn pieces a shopping-list line stands for, and the other way round:
// what a sheet, a siding course, a shingle field or a hinge picked in the 3D
// view is bought as. Lumber lines are matched through the cut sheet instead
// (app.mjs), since every framing member already has a part mark.

/**
 * Shopping keys (prices.mjs) to the panel kinds and fixture kinds that show
 * where that line goes. A line can point at more than one kind: drip edge runs
 * along the fascia, and house wrap goes under the lap siding on the sheathing.
 * @type {{ keys: RegExp, panels?: string[], fixtures?: string[], section?: string }[]}
 */
const RULES = [
  { keys: /^(floorSheet|floorOSB)$/, panels: ['floor sheet', 'attic deck', 'loft deck'] },
  { keys: /^roofSheet$/, panels: ['roof sheathing', 'truss gusset'] },
  { keys: /^plywoodLining$/, section: 'Sheet goods', panels: ['gambrel gusset'] },
  { keys: /^(siding\d*(primed)?|lpPanel\w*)$/, panels: ['siding'] },
  { keys: /^(wallSheathing|houseWrap|wrapTape|capNails)$/, panels: ['wall sheathing'] },
  { keys: /^(lap\w*|hardiePlank|starterStrip|jointFlashing|sidingNails5?)$/, panels: ['lap siding'] },
  { keys: /^(bbBoard|bbBatten|vinyl\w*)$/, panels: ['siding'] },
  { keys: /^(paint|stain|glitter|accentPaint)$/, panels: ['siding', 'lap siding'], fixtures: ['casing'] },
  { keys: /^(shingleBundle|starterShingle|ridgeCapShingle|underlayment|metalPanel|metalRidge|roofingNails)$/, fixtures: ['shingles'] },
  { keys: /^(fasciaTrim|rakeTrim|dripEdge)$/, fixtures: ['fascia'] },
  { keys: /^soffitPanel$/, fixtures: ['soffit'] },
  { keys: /^(trim1x4x\d+|trimNails)$/, fixtures: ['casing'] },
  { keys: /^(osbLining|plywoodLining|drywall|beadboard|pegboard|interiorPanel|jointCompound|drywallTape|interiorPaint|insulation)$/, section: 'Interior', fixtures: ['lining'] },
  { keys: /^(hurricaneTie|pitchConnector|rafterHanger|connectorNails)$/, fixtures: ['connector'] },
  { keys: /^gableVent$/, fixtures: ['vent'] },
  { keys: /^(concreteBlock|deckBlock|cmuBlock|formTube|concreteBag)$/, fixtures: ['block'] },
  { keys: /^(gravelTon|paverBase|landscapeFabric)$/, fixtures: ['gravel'] },
  { keys: /^(flashingTape|shims)$/, fixtures: ['door', 'window'] },
];

/**
 * The ids of the panels, fixtures and door-frame parts drawn for one shopping
 * line, or [] when the line has nothing drawn (nails, tools, a delivery fee).
 * Door hardware and bought doors and windows point at their own opening only.
 * @param {any} shed a built shed (model.mjs)
 * @param {{ section: string, name: string, source?: { key?: string } }} row
 * @returns {string[]}
 */
export function idsForLine(shed, row) {
  const key = row.source?.key || '';
  if (!key || key.startsWith('lumber:')) return [];
  const fixtures = shed.fixtures || [];
  const opIds = (pred) => fixtures.filter((f) => f.op && pred(f.op)).map((f) => f.id);
  // Hinges, pulls and hasps name their door: "(door o1)".
  const door = /\(door (\w+)\)$/.exec(row.name);
  if (door && (shed.framedOpenings || []).some((o) => o.id === door[1])) return [...opIds((op) => op === door[1]), ...(shed.doorParts || []).filter((p) => p.geom && p.note.startsWith(`door ${door[1]}:`)).map((p) => p.id)];
  if (key.startsWith('product:')) {
    const id = key.slice('product:'.length);
    const ops = new Set((shed.framedOpenings || []).filter((o) => o.product === id).map((o) => o.id));
    return opIds((op) => ops.has(op));
  }
  // A site-built door's lumber is in the parts list; its screws and glue are here.
  if (key === 'screws') return (shed.doorParts || []).filter((p) => p.geom).map((p) => p.id);
  const rule = RULES.find((r) => r.keys.test(key) && (!r.section || r.section === row.section));
  if (!rule) return [];
  const pk = new Set(rule.panels || []);
  const fk = new Set(rule.fixtures || []);
  return [...(shed.panels || []).filter((p) => pk.has(p.kind)).map((p) => p.id), ...fixtures.filter((f) => fk.has(f.kind) && f.id).map((f) => f.id)];
}

/**
 * What a picked id is, in words, when it is not a framing member: "Lap siding,
 * front wall", "Shingles", "Door o1". Null for an id the shed does not have.
 * @param {any} shed @param {string} id
 */
export function describePiece(shed, id) {
  const p = (shed.panels || []).find((x) => x.id === id);
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  if (p) return `${cap(p.kind)}${p.wall ? `, ${p.wall} wall` : p.side ? `, ${p.side} side` : ''}`;
  const f = (shed.fixtures || []).find((x) => x.id === id);
  if (f) return f.op ? `${cap(f.kind)} ${f.op}` : cap(f.kind);
  const dp = (shed.doorParts || []).find((x) => x.id === id);
  if (dp) return `${cap(dp.kind)} (${dp.note.split(':')[0]})`;
  return null;
}

/**
 * The shopping lines a picked id belongs to (by index into est.shopping), so a
 * click on the shingles lists the bundles, starter, ridge cap and underlayment.
 * @param {any} shed @param {{ shopping: any[] }} est @param {string} id
 */
export function linesForPiece(shed, est, id) {
  const out = [];
  est.shopping.forEach((r, i) => { if (idsForLine(shed, r).includes(id)) out.push(i); });
  return out;
}
