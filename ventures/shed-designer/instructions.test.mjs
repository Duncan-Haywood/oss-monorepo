import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, defaultDesign, PRESETS } from './model.mjs';
import { estimate } from './estimate.mjs';
import { buildInstructions, instructionsMarkdown } from './instructions.mjs';
import { fmtIn } from './lumber.mjs';

const make = (d) => { const s = buildShed(d); return { s, sections: buildInstructions(s, estimate(s)) }; };

test('instructions run in build order and carry this design\'s numbers', () => {
  const { s, sections } = make(defaultDesign());
  const titles = sections.map((x) => x.title);
  const order = ['Before you start', 'Gravel under each block', 'Skids', 'Floor frame', 'Subfloor', 'Tie the walls together', 'Ridge beam and posts', 'Rafters', 'Gable ends', 'Roof sheathing and dry-in', 'Siding', 'Rake trim and roofing', 'Trim, vents, door and windows', 'Final checks'];
  let last = -1;
  for (const t of order) { const i = titles.indexOf(t); assert.ok(i > last, t); last = i; }
  const md = instructionsMarkdown(sections, s.design.name);
  assert.match(md, /Cut 12 full studs at 80"/); // 84-1/2" wall less three plates
  assert.match(md, /diagonals must read 14' 5-1\/16"/); // floor frame: hypot(144, 96)
  assert.ok(md.includes(`read ${s.design.pitch} on the COMMON scale`));
  assert.ok(md.includes(`Cut length from a square end: ${fmtIn(s.dims.rafterCut)}`));
  assert.match(md, /a jack each side at 76-1\/2"/); // 78" door less the 1-1/2" plate
  assert.ok(!/undefined|NaN/.test(md));
});

test('every part mark the instructions name is a real mark', () => {
  for (const make2 of [defaultDesign, PRESETS['8x12 classic'], PRESETS['12x16']]) {
    const s = buildShed(make2());
    const est = estimate(s);
    const known = new Set(est.parts.map((p) => p.mark));
    const md = instructionsMarkdown(buildInstructions(s, est), 'x');
    for (const m of md.matchAll(/\(marks? ([A-Z, ]+)[,)]/g)) for (const mk of m[1].split(/,\s*/)) if (mk) assert.ok(known.has(mk), `${mk} in ${m[0]}`);
  }
});

test('a ridge-board shed gets ridge-board and rafter-tie steps instead of beam steps', () => {
  const { sections } = make(PRESETS['8x12 classic']());
  const md = instructionsMarkdown(sections, 'x');
  assert.match(md, /## \d+\. Ridge board/);
  assert.match(md, /rafter tie/);
  assert.ok(!/Ridge beam and posts/.test(md));
});

test('a site-built door names its frame pieces by their cut-sheet marks', () => {
  const shed = buildShed({ ...defaultDesign(), length: 168, openings: [{ id: 'o1', kind: 'door', wall: 'front', offset: 40, width: 60, height: 78, product: 'site-built' }] });
  const est = estimate(shed);
  const step = buildInstructions(shed, est).find((s) => /door o1/.test(s.title)).steps.find((t) => /stiles/.test(t));
  for (const kind of ['door stile', 'door rail', 'door brace']) {
    const marks = est.parts.filter((p) => p.kind === kind).map((p) => p.mark);
    assert.equal(marks.length, 1, `${kind}: one mark for identical pieces`);
    assert.match(step, new RegExp(`\\(mark ${marks[0]}\\)`), kind);
  }
});

// A carpenter's read of the default design and two presets, 2026-10-30: each
// test below pins a step that was wrong, out of order or missing a fastener.
const mdOf = (d) => { const s = buildShed(d); const est = estimate(s); return { s, est, md: instructionsMarkdown(buildInstructions(s, est), 'x') }; };
const before = (md, a, b) => { const i = md.indexOf(a); const j = md.indexOf(b); assert.ok(i >= 0, a); assert.ok(j >= 0, b); assert.ok(i < j, `${a} before ${b}`); };

test('each roof-edge layer goes on before the one that laps over it', () => {
  for (const make2 of [defaultDesign, PRESETS['10x12'], PRESETS['12x16']]) {
    const { md } = mdOf(make2());
    before(md, 'Fascia: nail the 1x6 fascia', 'Drip edge along the eaves');
    before(md, 'Drip edge along the eaves', 'Roll the underlayment');
    // Rake boards lap the gable siding and the rake drip edge laps them.
    before(md, '## 15. Siding', 'Rake: a 1x4 board');
    before(md, 'Rake: a 1x4 board', 'Drip edge along the rakes');
    before(md, 'Drip edge along the rakes', 'Shingles: a starter strip');
  }
});

test('head flashing goes over the head casing, behind siding left unnailed for it', () => {
  const { md } = mdOf(defaultDesign());
  assert.match(md, /Leave out the nails in the 8" of siding above each door and window head/);
  before(md, 'Leave out the nails', 'Case each door and window');
  before(md, 'Case each door and window', 'Head flashing: slide a length of Z-flashing up behind the siding over each head casing');
  assert.ok(!/before the head casing goes on/.test(md));
});

test('a door wall is framed with the bottom plate already in pieces, as the cut sheet has it', () => {
  for (const make2 of [defaultDesign, PRESETS['10x12'], PRESETS['12x16']]) {
    const { s, md } = mdOf(make2());
    const doorWalls = Object.values(s.walls).filter((w) => w.openings.some((p) => p.op.kind === 'door'));
    for (const w of doorWalls) assert.ok(w.members.filter((m) => m.kind === 'bottom plate').length >= 2, w.name);
    assert.ok(!/Cut the bottom plate out of the door opening/.test(md));
    assert.equal(md.match(/The bottom plate stops at each side of the door/g)?.length, doorWalls.length);
  }
});

test('the rafter step gives the wall line and tail on the board, and names the right hanger', () => {
  const { s, md } = mdOf(defaultDesign()); // 8 ft wide, 4/12, ridge beam, connector seats, 7" overhang
  assert.equal(s.dims.connector, true);
  // run to the outside of the wall: 48 - 1-1/2 (half the beam) = 46-1/2; along the slope 46.5 / cos(18.43 deg) = 49.01
  assert.match(md, /measure 49" along the bottom edge \(a level run of 46-1\/2"\)/);
  assert.match(md, /7-3\/8" along the bottom edge past the wall line/); // 7 / cos
  assert.ok(!/, \./.test(md), 'no dangling ", ."');
  const deep = mdOf({ ...defaultDesign(), rafterSize: '2x8', autoOverhang: false }).md;
  assert.match(deep, /a 2x8 rafter hanger/);
  const bird = mdOf(PRESETS['10x12']()).md;
  assert.match(bird, /rafter-to-plate tie \(on the list\)/);
  assert.match(bird, /plate tie, with every nail hole/);
  assert.ok(!/connector/.test(bird.split('## 12.')[1].split('## 13.')[0]));
});

test('fasteners named in the steps are the ones on the shopping list', () => {
  const { est, md } = mdOf(defaultDesign());
  const names = est.shopping.map((r) => r.name).join('\n');
  // The subfloor is nailed with the 8d commons bought for floor and roof sheathing.
  assert.match(names, /8d .*common nails.*floor and roof sheathing/);
  assert.match(md, /Nail with 8d galvanized commons every 6" along sheet edges/);
  assert.ok(!/1-1\/4" or 1-5\/8" deck screws/.test(md));
  // Screws are bought for the site-built door skin only, at the length the door step names.
  assert.match(names, /#8 x 1-5\/8 in\..*\(door skin\)/);
  assert.match(md, /#8 x 1-5\/8" exterior screws \(on the list\)/);
  const noDoor = mdOf({ ...defaultDesign(), openings: defaultDesign().openings.filter((o) => o.kind !== 'door') });
  assert.ok(!noDoor.est.shopping.some((r) => /screws/i.test(r.name)));
  // Nothing tells you to fit a part the list does not buy.
  assert.ok(!/post cap/.test(md));
  assert.match(md, /handsaw/);
});

test('the site-built door goes together in an order that works', () => {
  const { md } = mdOf(defaultDesign());
  before(md, 'Lay the frame out flat', 'Braces: in each bay');
  before(md, 'Braces: in each bay', 'lay the skin on it face up');
  assert.ok(!/skin face down/.test(md), 'cannot screw through a skin that lies face down under the frame');
  assert.match(md, /pack each strap out with a 1x4 trim offcut/);
  const pair = mdOf({ ...defaultDesign(), openings: defaultDesign().openings.map((o) => (o.kind === 'door' ? { ...o, width: 60 } : o)) }).md;
  assert.match(pair, /three 8" tee hinges on each leaf/);
});

test('blocks, vents and eave blocking say what to do with them', () => {
  const { md } = mdOf({ ...defaultDesign(), pad: 'none' }); // blocks on tamped soil
  assert.ok(!/shim the blocks/.test(md), 'the ground step says no shims; the skid step must agree');
  assert.match(md, /Lay the skids on the 12 blocks you levelled/);
  assert.match(md, /cap plate, directly over the two post studs/);
  assert.match(md, /drill two 1-1\/2" holes through each block and staple insect screen/);
  assert.match(md, /Cut the door, window and gable vent openings/);
  const ten = mdOf(PRESETS['10x12']()).md;
  assert.match(ten, /a cripple under the sill \(mark [A-Z]+\)/);
  assert.match(ten, /4x6 skids \(mark A, \d+ pieces\) on edge/);
  assert.ok(!/4x4 skids[^.]*on edge/.test(md));
});

test('the siding step says how the nested gable pieces are cut and joined', () => {
  const { md } = mdOf(PRESETS['8x10']());
  assert.match(md, /The 4 upper gable pieces come from 1 panel: two pieces that slope the same way are cut head to toe/);
  assert.match(md, /butt the joint over the stud with a bead of caulk/);
  assert.match(md, /take them from what is left of a sheet after a short full-width piece/);
  assert.ok(!/upper gable pieces come from/.test(mdOf(defaultDesign()).md)); // its panels reach the roof in one piece
});
