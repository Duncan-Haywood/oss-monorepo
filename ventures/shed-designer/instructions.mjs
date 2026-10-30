// @ts-check
// Step-by-step build instructions written from the framed design: the real
// skid centres, diagonals, layout marks, cut lengths, angles and part marks,
// in the order a crew builds a shed. Methods are common practice for a small
// wood-framed shed; fastener spacings in particular are typical values to
// check against your local code and each product's instructions, which win.

import { fmtIn, fmtFtIn } from './lumber.mjs';
import { WALL_LABEL } from './model.mjs';
import { heelJoint } from './checks.mjs';

/** @typedef {{ title: string, why?: string, steps: string[], check?: string[] }} Section */

const deg = (r) => `${(r * 180 / Math.PI).toFixed(1)} deg`;
const list = (xs) => xs.map((x) => fmtIn(x)).join(', ');

/**
 * @param {import('./model.mjs').Shed} shed
 * @param {import('./estimate.mjs').Estimate} est
 * @returns {Section[]}
 */
export function buildInstructions(shed, est) {
  const d = shed.design;
  const k = shed.dims;
  const L = d.length;
  const W = d.width;
  const markOf = new Map();
  for (const p of est.parts) for (const id of p.ids) markOf.set(id, p.mark);
  const marks = (pred) => [...new Set(shed.members.filter(pred).map((m) => markOf.get(m.id)))].join(', ');
  const qty = (pred) => shed.members.filter(pred).length;
  const t = d.pitch / 12;
  const angle = Math.atan(t);
  const beam = d.roofType === 'ridgeBeam';
  /** @type {Section[]} */
  const out = [];

  out.push({
    title: 'Before you start',
    why: 'Permits, buried lines and a materials check save the most time on a shed.',
    steps: [
      `Ask your building department whether a ${fmtFtIn(L)} x ${fmtFtIn(W)} (${est.footprintSqFt.toFixed(0)} sq ft) shed with a peak about ${fmtFtIn(k.peak)} above grade needs a permit, and what setbacks from property lines apply. Many places exempt small sheds; the size limit varies.`,
      'Call 811 (in the US) a few days before digging so buried lines are marked.',
      `Order from the Shopping list (${est.boards} boards, ${est.floorSheets} floor sheets, ${est.roofSheets} roof sheets and the rest). Print the Cut sheet and the Plans; every piece below is called by its letter mark from those lists.`,
      'Tools: tape, chalk line, speed square and framing square, 4 ft level, circular saw, handsaw (to finish notches and the corners of cut-outs), drill/driver, framing hammer or nailer, a string line, two step ladders, safety glasses, hearing protection and gloves.',
      `Fasteners (typical, check your code): 16d galvanized commons for framing; 8d galvanized commons for the subfloor and roof sheathing; 8d galvanized siding nails; 8d galvanized finish nails for trim; 1-1/4" roofing nails; construction adhesive for the subfloor${(shed.doors || []).length ? '; #8 x 1-5/8" exterior screws for the door skin' : ''}; and the ${k.connector || beam ? 'connectors and hangers' : 'rafter ties'} on the list with the 10d connector nails their maker specifies.`,
    ],
  });

  const pad = { l: L + 24, w: W + 24 };
  if (k.noPad) out.push({
    title: 'Ground under each block',
    steps: [
      `Mark the shed's outline with stakes and string, square it (diagonals ${fmtFtIn(Math.hypot(L, W))} each), and mark where each of the ${k.blockCount} blocks goes.`,
      'At each mark, strip the turf and soft topsoil down to firm, undisturbed soil, a little wider than the block, and tamp the bottom hard.',
      'Set the blocks and level them to each other with a long straight board or a string line, adding or scraping soil under a block rather than stacking shims.',
      'On soft, wet or frost-prone ground, a bed of compacted gravel under each block (the "only under each block" choice) holds up better.',
    ],
    check: ['Every block level with the others within 1/4".', 'No block rocks or sinks when you stand on it.'],
  });
  else if (k.underBlocks) out.push({
    title: 'Gravel under each block',
    steps: [
      `Mark the shed's outline with stakes and string, square it (diagonals ${fmtFtIn(Math.hypot(L, W))} each), and mark where each of the ${k.blockCount} blocks goes.`,
      `At each mark, dig a hole 4" wider than the block (${fmtIn(k.block.along + 4)} x ${fmtIn(k.block.across + 4)}) down through the turf and soft soil, about 4" deep plus whatever it takes to reach firm ground.`,
      `Fill with paver base (${k.baseBags} bags of 0.5 cu ft in all) in 2" lifts, tamping each lift hard.`,
      'Level each bed to the others with a long straight board or a string line: the tops of all the beds in one plane.',
    ],
    check: ['Every bed level with the others within 1/4".', 'Firm under foot: no give when you stand on it.'],
  });
  else out.push({
    title: 'Gravel pad',
    steps: [
      `Mark out a ${fmtFtIn(pad.l)} x ${fmtFtIn(pad.w)} pad: the shed plus 12" on every side. Drive a stake at each corner and run string between them.`,
      `Square the strings: the two diagonals must match, at ${fmtFtIn(Math.hypot(pad.l, pad.w))} each.`,
      'Strip the turf and soft topsoil inside the strings. Dig down about 4" plus whatever it takes to reach firm soil.',
      `Fill with crushed gravel (about ${k.gravelCuYd.toFixed(1)} cu yd, ${Math.ceil(k.gravelCuYd * 1.4 * 10) / 10} tons) in 2" lifts, compacting each lift with a plate compactor or hand tamper.`,
      'Rake it level: check with a long straight board and level in both directions. The skids sit directly on this, so level now is level later.',
    ],
    check: ['Pad diagonals equal within 1/4".', 'No more than 1/4" out of level over the pad.'],
  });

  const skids = shed.members.filter((m) => m.kind === 'skid');
  out.push({
    title: 'Skids',
    steps: [
      `Lay ${k.skidCount} pressure-treated ${d.skidSize} skids (mark ${marks((m) => m.kind === 'skid')}, ${skids.length} pieces)${d.skidSize === '4x4' ? '' : ' on edge'}, running the ${fmtFtIn(L)} length of the shed.`,
      `Centre them at ${list(k.skidYs)} from the front edge of the shed (the first and last flush with the front and back edges).`,
      k.block && k.noPad
        ? `Lay the skids on the ${k.blockCount} blocks you levelled, a block under each end and the rest no more than 4 ft apart. Check each skid with a level along its length and across to the next; correct a low block by packing soil or gravel under it, not with shims on top.`
        : k.block
        ? `Set ${k.blockCount} ${k.block.plural} on the ${k.noPad ? 'tamped ground' : k.underBlocks ? 'paver-base beds' : 'compacted gravel'} under the skids (${k.block.h}" tall), one at each end and the rest no more than 4 ft apart, then level the blocks by adding or scraping ${k.underBlocks ? 'paver base' : 'gravel'} under them (not with shims on top) until every skid is level and all skids are level with each other.`
        : 'Bed each skid into the gravel and check it with a level along its length and across to the next skid; add or scrape gravel under it rather than shimming with wood.',
      skids.length > k.skidCount ? 'Skids are spliced: butt the pieces tight, stagger the joints from skid to skid, and land each joint on firm gravel or a block.' : 'Each skid is one piece.',
    ],
  });

  const joists = k.joistCenters;
  out.push({
    title: 'Floor frame',
    steps: [
      `Cut the two rim joists (mark ${marks((m) => m.kind === 'rim joist')}) and the ${joists.length} floor joists (mark ${marks((m) => m.kind === 'floor joist')}, ${fmtIn(W - 3)} each) from pressure-treated ${d.joistSize}.`,
      `Lay the two rims side by side, ends flush, and mark both at once. Put the first joist flush with each end. Mark the rest centred at ${list(joists.slice(1, -1))} from the left end, so that 8 ft sheet edges land on a joist.`,
      'Stand the joists between the rims on the marks, crowns up, and nail through each rim into each joist end with three 16d nails.',
      `Square the frame: both diagonals must read ${fmtFtIn(Math.hypot(L, W))}. Push the long corner in until they match.`,
      'Set the frame on the skids with the rims parallel to the skids. Toenail each joist to each skid it crosses (two 16d), or fit a framing tie at each crossing.',
    ],
    check: ['Diagonals within 1/8".', 'Frame flush with the skids at the front and back.'],
  });

  out.push({
    title: 'Subfloor',
    steps: [
      `Lay ${d.floorPanel === 'OSB' ? '23/32" tongue-and-groove OSB' : '3/4" tongue-and-groove plywood'} with the 8 ft edges across the joists (${est.floorSheets} sheets). Start the first row at the front, groove facing out, in a bead of construction adhesive on each joist.`,
      `Rows are 4 ft wide; ${k.floorRows} rows cover the ${fmtFtIn(W)} width. Start every other row with a half sheet (48") so the end joints are staggered; every end joint must land on a joist centre.`,
      `Cuts along the length: ${shed.floorPieces.map((x) => fmtIn(x)).join(', ')} (in row order). Rip the last row to width if the shed is not a multiple of 4 ft wide.`,
      'Nail with 8d galvanized commons every 6" along sheet edges and every 12" on the joists in the field, 3/8" from edges, before the adhesive skins over. Leave a 1/8" gap at butt ends.',
    ],
  });

  const wallOrder = ['back', 'front', 'left', 'right'];
  for (const name of wallOrder) {
    const w = shed.walls[name];
    const eave = w.eave;
    const off = eave ? 0 : k.stud;
    // Positions read from the left end of the plate as you face the outside.
    const fromLeft = (s) => (name === 'front' || name === 'right' ? s : w.len - s);
    const at = (kind) => w.members.filter((m) => m.kind === kind).map((m) => fromLeft((m.local.s0 + m.local.s1) / 2)).sort((x, y) => x - y);
    const kinds = [['stud', 'common studs'], ['corner stud', 'corner studs'], ['post stud', 'post studs under the ridge-beam post'], ['king stud', 'king studs'], ['jack stud', 'jack studs'], ['top cripple', 'cripples over headers'], ['bottom cripple', 'cripples under sills']];
    const marksList = kinds.map(([kind, label]) => [label, at(kind)]).filter(([, xs]) => xs.length).map(([label, xs]) => `${label} at ${list(xs)}`).join('; ');
    const steps = [
      `Cut the plates: bottom (mark ${marks((m) => m.group === `wall:${name}` && m.kind === 'bottom plate')}), top (${marks((m) => m.group === `wall:${name}` && m.kind === 'top plate')}) and cap (${marks((m) => m.group === `wall:${name}` && m.kind === 'cap plate')}). The wall is ${fmtFtIn(w.len)} long${eave ? ', the full length of the shed' : `, fitting between the front and back walls`}.`,
      `Lay the bottom and top plates together on the deck and square a line across both for the centre of each piece, measured from the left end as you will face the wall from outside: ${marksList}.`,
      `Cut ${qty((m) => m.group === `wall:${name}` && m.kind === 'stud') + qty((m) => m.group === `wall:${name}` && m.kind === 'corner stud') + qty((m) => m.group === `wall:${name}` && m.kind === 'king stud') + qty((m) => m.group === `wall:${name}` && m.kind === 'post stud')} full studs at ${fmtIn(k.studLen)} (wall height ${fmtFtIn(d.wallHeight)} less three 1-1/2" plates).`,
    ];
    for (const p of w.openings) {
      const left = Math.min(fromLeft(p.a + off - off), fromLeft(p.a + p.w));
      steps.push(`${p.op.kind === 'door' ? 'Door' : 'Window'} ${fmtIn(p.w)} wide x ${fmtIn(p.op.height)} high rough opening, starting ${fmtIn(fromLeft(name === 'front' || name === 'right' ? p.a : p.a + p.w) + (eave ? 0 : 0))} from the left end of the plate: a king stud each side, a jack each side at ${fmtIn(p.bottom + p.op.height - 1.5)}, a header of two ${p.hdr} at ${fmtIn(p.w + 3)} nailed together${k.stud > 3 ? ` around a ${fmtIn(k.stud - 3)} plywood spacer` : ''} and set on the jacks${p.op.kind === 'window' ? `, a rough sill at ${fmtIn(p.w)} with its top ${fmtIn(p.bottom)} above the floor and cripples under it` : ''}, then cripples above at the layout marks.`);
      void left;
    }
    const hasDoor = w.openings.some((p) => p.op.kind === 'door');
    if (hasDoor) steps.push('The bottom plate stops at each side of the door: the cut sheet has it in pieces, with the door opening left out. Nail a scrap of 2x4 across the foot of each door opening, jack to jack on the inside face, so the opening keeps its width while the wall is lifted.');
    steps.push(
      'Nail the wall together flat on the deck: two 16d through the plates into each stud end; nail jacks to kings every 16" staggered; header to kings with four 16d each end.',
      `Square the wall (equal diagonals of ${fmtFtIn(Math.hypot(w.len, d.wallHeight - 1.5))} plate to plate), tack a diagonal brace across it, then stand it up with a helper and set it on the line${eave ? ' flush with the edge of the floor' : ' between the eave walls'}.`,
      'Nail the bottom plate through the subfloor into the rim or joists, two 16d every 16". Plumb the ends with a level and brace to stakes until the next wall is in.',
    );
    if (hasDoor) steps.push('Once the bottom plate is nailed down, take the scrap off the foot of the door opening.');
    out.push({ title: `${WALL_LABEL[name]} wall`, steps, check: ['Wall plumb at both ends and straight along the top (string line).'] });
  }
  out.push({
    title: 'Tie the walls together',
    steps: [
      'Nail each corner: end stud to the corner stud of the eave wall, 16d every 12".',
      `Lap the cap plates to lock the corners. On the long walls the cap (mark ${marks((m) => (m.group === 'wall:front' || m.group === 'wall:back') && m.kind === 'cap plate')}) stops ${fmtIn(k.stud)} short of each end; on the end walls the cap (mark ${marks((m) => (m.group === 'wall:left' || m.group === 'wall:right') && m.kind === 'cap plate')}) runs ${fmtIn(k.stud)} past each end and sits over the long wall's top plate. ${Object.values(shed.walls).some((w) => w.members.filter((m) => m.kind === 'top plate').length > 1) ? 'Where a plate is spliced, the cut sheet already puts each cap joint at least 24" from a top-plate joint (4 ft where the studs allow): keep the pieces in their places. ' : ''}Nail cap to top plate with 16d every 16", and two 16d down through each lap into the plate below.`,
      'Optional: a flat steel strap tie across each corner on top of the caps adds hold, but the lap is what ties the walls.',
      `Check the box: diagonals across the top plates must match at ${fmtFtIn(Math.hypot(L, W))}. Rack the walls with the braces until they do.`,
    ],
  });

  const rafter = shed.members.find((m) => m.kind === 'rafter');
  const wallRun = W / 2 - (beam ? 1.5 : 0.75);
  const run = wallRun - k.stud;
  out.push({
    title: beam ? 'Ridge beam and posts' : 'Ridge board',
    steps: beam ? [
      `Build each gable post from two ${d.studSize} (mark ${marks((m) => m.kind === 'beam post')}, ${fmtIn(shed.members.find((m) => m.kind === 'beam post')?.length ?? 0)}), nailed face to face, and stand one centred on each gable wall's cap plate, directly over the two post studs in that wall.`,
      `Nail the two plies of the ridge beam together (mark ${marks((m) => m.kind === 'ridge beam')}, two ${d.beamSize} at ${fmtIn(L)}): 16d in two rows every 12", staggered.`,
      `Lift the beam onto the posts with a helper. Its top sits ${fmtFtIn(k.ridgeTop - k.floorTop)} above the floor; check it with a level and a tape from the floor at both ends. Toenail it to each post with four 16d, two from each side. A metal strap from beam to post adds hold where your code asks for one (none is on the list).`,
      'Brace the beam level and straight with temporary braces to the floor until rafters are on both sides.',
    ] : [
      `The ridge board (mark ${marks((m) => m.kind === 'ridge board')}, ${k.ridgeSize}) is not a beam: rafter ties hold the rafters. Mark rafter centres on it to match the top plates.`,
      `Prop it on temporary posts so its top is ${fmtFtIn(k.ridgeTop - k.floorTop)} above the floor, centred over the width.`,
      'Leave the props in until every rafter pair and its tie is nailed, then take them out: the ties, not the props, keep the walls from spreading.',
    ],
  });

  out.push({
    title: 'Rafters',
    why: 'Cut one rafter, test it at both ends and in the middle, then use it as the pattern for the rest.',
    steps: [
      `Pitch ${d.pitch}/12: the roof rises ${d.pitch}" for every 12" across, an angle of ${deg(angle)}. On a speed square, pivot on the pivot point and read ${d.pitch} on the COMMON scale for every plumb and seat line.`,
      `Ridge end: a plumb cut, marked with the square at ${d.pitch} on the common scale (${deg(angle)} off a square cut).`,
      k.connector
        ? `No birdsmouth: from the ridge plumb line measure ${fmtIn(wallRun / Math.cos(angle))} along the bottom edge (a level run of ${fmtIn(wallRun)}) and square a line across: that is the wall line, where the rafter's underside rests on the outside top edge of the wall. Each rafter sits there on a variable-pitch connector (Simpson VPA2 or equal) nailed to the cap plate; set the connector's seat to the ${d.pitch}/12 slope and nail as Simpson's instructions show.`
        : `Birdsmouth over the wall: from the ridge plumb line measure ${fmtIn(run / Math.cos(angle))} along the bottom edge (a level run of ${fmtIn(run)} to the inside face of the wall, where the seat starts). Draw the seat cut ${fmtIn(k.stud)} long (the wall's depth) and the heel cut ${fmtIn(k.heel)} deep. Never cut past the line; finish the corner with a handsaw.`,
      d.overhang > 0 ? `Tail: ${fmtIn(d.overhang)} of overhang beyond the wall, ${fmtIn(d.overhang / Math.cos(angle))} along the bottom edge past the ${k.connector ? 'wall line' : 'heel cut'}, ended with a plumb cut so the fascia hangs straight.` : `No overhang: the tail ends at the ${k.connector ? 'wall line, with a plumb cut' : 'heel cut'}.`,
      `Cut length from a square end: ${fmtIn(k.rafterCut)} (mark ${marks((m) => m.kind === 'rafter')}, ${qty((m) => m.kind === 'rafter')} rafters, ${d.rafterSize}).`,
      `Mark rafter centres on the top plates and the ${beam ? 'beam' : 'ridge'}: the first and last flush with the gable ends, the rest at ${list(k.rafterCenters.slice(1, -1))} from the left end.`,
      `Set rafters in opposite pairs so the ${beam ? 'beam' : 'ridge'} stays straight. ${beam ? `Hang each one from the beam with a ${d.rafterSize} rafter hanger (on the list)` : 'Nail through the ridge board into each rafter (three 16d)'}${k.connector ? ', and nail it to its connector' : ', and fix each one to the wall plate with a rafter-to-plate tie (on the list)'}.`,
      beam ? 'There are no rafter ties: the beam carries the rafters, so the inside is open to the roof.' : `Nail a ${d.tieSize} rafter tie (mark ${marks((m) => m.kind === 'rafter tie')}) beside every pair but the gable ends, on top of the wall plates, ${heelJoint(shed)?.nails ?? 3} 16d commons into each rafter (the tie holds the rafters' outward push; the Structure tab shows the count's working).`,
      `Fit the blocks between rafters on top of each eave wall (mark ${marks((m) => m.kind === 'eave blocking')}), top edges bevelled to ${d.pitch}/12.${d.overhang > 0 ? ' The soffit is vented, so the air has to get past them: drill two 1-1/2" holes through each block and staple insect screen over them.' : ''}`,
      d.overhang > 0 ? `Nail the 2x6 sub-fascia (mark ${marks((m) => m.kind === 'sub-fascia')}) across the rafter tails, top flush with the rafter tops, two 16d per tail.` : '',
    ].filter(Boolean),
    check: ['Every rafter top in one plane: sight along them or run a string.', `Pattern rafter fits at both gable ends and the middle before cutting the rest.`],
  });
  void rafter;

  const vents = Object.values(shed.vents || {}).flat();
  const VENT_PART = { 'vent trimmer': 'a trimmer stud each side', 'vent header': 'a flat header', 'vent sill': 'a flat sill block', 'vent cripple': 'a cripple under the sill' };
  const ventParts = Object.entries(VENT_PART).filter(([kind]) => qty((m) => m.kind === kind))
    .map(([kind, what]) => `${kind === 'vent trimmer' && beam ? 'a trimmer stud on the outer side, the post being the inner one' : what} (mark ${marks((m) => m.kind === kind)})`).join(', ').replace(/, ([^,]*)$/, ' and $1');
  out.push({
    title: 'Gable ends',
    steps: [
      `Fill each gable with studs under the end rafter (mark ${marks((m) => m.kind === 'gable stud')}), each on a layout mark of the wall below, its top cut to ${d.pitch}/12 (${deg(angle)}). Measure each one in place and compare with the Plans sheet; the lengths on the cut sheet are to the long point.`,
      vents.length ? `Frame ${vents.length / 2 > 1 ? 'the gable vents' : 'the gable vent'} in each gable: ${fmtIn(d.ventWidth)} x ${fmtIn(d.ventHeight)} rough openings with ${ventParts}.` : '',
    ].filter(Boolean),
  });

  const trimmed = shed.wallTrim && shed.wallTrim.length;
  const openings = shed.framedOpenings.length;
  out.push({
    title: 'Roof sheathing and dry-in',
    why: 'The fascia goes on before the drip edge, and the eave drip edge before the underlayment, so each layer laps over the one below it.',
    steps: [
      `Sheathe with 7/16" OSB, long edges across the rafters (${est.roofSheets} sheets, ${k.roofRows} courses a side). Start at the eave with full sheets flush with the ${d.overhang > 0 ? 'face of the sub-fascia' : 'rafter tails'}, stagger the next course by half a sheet, and land every end joint on a rafter. Leave 1/8" between sheets. The course at the ridge is narrower than a sheet: rip its strips side by side from whole sheets, as many to a sheet as fit (the sheet count assumes that).`,
      'Nail with 8d every 6" on the edges and every 12" in the field.',
      d.overhang > 0 ? 'Fascia: nail the 1x6 fascia to the sub-fascia, its top edge tight under the sheathing, with two 8d galvanized finish nails at each rafter tail.' : '',
      `Drip edge along the eaves, over the ${d.overhang > 0 ? 'fascia' : 'sheathing edge'} and under the underlayment.`,
      'Roll the underlayment from the eave up, each course lapped over the one below by the maker\'s mark, over the ridge. The roof is now dry enough to wait for the siding; the rake drip edge and shingles come after it.',
    ].filter(Boolean),
  });

  out.push({
    title: 'Siding',
    steps: [
      d.siding ? `T1-11 panels, grooves vertical, ${shed.sidingFull.length} panel positions around the shed (see the shopping list for 8, 9 and 10 ft lengths). Start at a corner, keep the bottom edge level with the top of the skids so it laps the rim joist and floor, and plumb the first panel with a level.` : 'Siding is off in this design.',
      'Every vertical panel edge lands on a stud. Nail 8d galvanized every 6" on edges and every 12" on intermediate studs.',
      shed.sidingUpper.length ? 'Where a gable needs a second panel above the first, put Z-flashing over the lower panel\'s top edge before the upper one.' : 'Each panel reaches from the bottom to the top in one piece.',
      openings ? 'Leave out the nails in the 8" of siding above each door and window head for now, so the head flashing can slip up behind it in the trim step.' : '',
      `Cut the ${openings && vents.length ? 'door, window and gable vent openings' : openings ? 'door and window openings' : vents.length ? 'gable vent openings' : 'panels to the roof line'} with a circular saw from inside, along the framing, after the panel is nailed; finish the corners with a handsaw.`,
      trimmed ? 'The corners get 1x4 corner boards in the trim step; leave the panel edges flush with the corner.' : 'No corner boards: caulk the corner joints and paint the panel edges.',
    ].filter(Boolean),
  });

  out.push({
    title: 'Rake trim and roofing',
    why: 'The rake boards go over the siding, and the rake drip edge over them, so they wait until the siding is on.',
    steps: [
      'Rake: a 1x4 board up each gable edge over the siding, its top edge tight under the roof sheathing, nailed with 8d galvanized finish nails into the end rafter.',
      'Drip edge along the rakes (gable edges), over the rake board and on top of the underlayment.',
      'Shingles: a starter strip along the eave, then courses at the exposure printed on the bundle (often 5-5/8"), staggered as the wrapper shows, four to six nails per shingle as the maker specifies. Finish the ridge with cap shingles.',
    ],
  });

  out.push({
    title: 'Trim, vents, door and windows',
    steps: [
      d.overhang > 0 ? `Soffit: fit the vented soffit (${Math.ceil((shed.trim.soffitSqFt * 1.1) / 12.75)} panels) to the underside of the rafter tails, from the siding to the back of the fascia.` : '',
      vents.length ? 'Gable vents: set each one in its opening over a bead of exterior sealant and screw through its flange; screen side in.' : '',
      shed.framedOpenings.some((o) => o.product !== 'site-built') ? 'Door and windows: follow each maker\'s instructions. Flash the sill and sides with the flashing tape, shim plumb and square in the rough opening, and leave the gap they specify around the frame.' : '',
      trimmed ? `Case each door and window: sides first, then the head across the top lapping the sides${shed.framedOpenings.some((o) => o.kind === 'window') ? ', and for windows a sill board under' : ''}.` : '',
      openings && d.siding ? `Head flashing: slide a length of Z-flashing up behind the siding over each ${trimmed ? 'head casing, its lip over the casing\'s front edge' : 'door and window head, its lip over the frame'}, so water runs off and not behind it. Then nail off the siding above it.` : '',
      trimmed ? `Corner boards: nail the 1x4 corner boards (${shed.wallTrim.filter((t) => t.where.endsWith('corner')).length}) with 8d galvanized finish nails, two every 16"; on each corner the board on the long wall laps the edge of the end-wall board. The cut list is on the Cut sheet tab.` : '',
      d.siding ? 'Caulk: run exterior caulk where each casing meets the door or window frame and the siding, and along the inside edge of every corner board. Leave the bottom edge of the head casing and the weep gaps the window maker shows open so water can drain.' : '',
    ].filter(Boolean),
  });

  for (const dr of shed.doors || []) {
    // The door's own parts, by kind, as lettered on the cut sheet and the door's plan sheet.
    const doorMarks = (kind) => est.parts.filter((p) => p.kind === kind && p.note.startsWith(`door ${dr.id}:`)).map((p) => p.mark).join(', ');
    out.push({
      title: `Build door ${dr.id} on site`,
      steps: [
        `Cut the door skin from the siding you cut out of the opening: ${dr.leaves > 1 ? `two leaves, each ${fmtIn(dr.w)} x ${fmtIn(dr.h)}` : `${fmtIn(dr.w)} x ${fmtIn(dr.h)}`}, which leaves a 1/4" gap all round${dr.leaves > 1 ? ' and between the pair' : ''}.`,
        `Cut the frame from 2x4s: two stiles ${fmtIn(dr.h)} (mark ${doorMarks('door stile')}), three rails ${fmtIn(dr.railLen)} (mark ${doorMarks('door rail')})${dr.leaves > 1 ? ' for each leaf' : ''}, and keep the braces (mark ${doorMarks('door brace')}) long until you scribe them.`,
        `Lay the frame out flat on a flat floor${dr.leaves > 1 ? ', one leaf at a time' : ''}: the stiles along the long edges and the rails across the top, middle and bottom between them.`,
        `Braces: in each bay, hold a 2x4 corner to corner and scribe it; the ends come out about ${dr.braceAngle.toFixed(0)} degrees. The low end of each brace goes on the hinge side so the brace holds the latch side up.`,
        'Run construction adhesive along the frame, lay the skin on it face up, square its edges to the frame, and screw through the skin into the frame every 8" with #8 x 1-5/8" exterior screws (on the list).',
        `Hang: three 8" tee hinges${dr.leaves > 1 ? ' on each leaf' : ''}, the straps across the rails, the leaves on the casing. The casing stands 3/4" proud of the door face, so pack each strap out with a 1x4 trim offcut the length of the strap, screwed to the door, and fix the strap through it into the rail. Shim the door to keep the 1/4" gap while you screw the hinges. Then the pull${dr.leaves > 1 ? 's' : ''} and the hasp.`,
        'Paint or seal the skin edges and all six faces of the door before it sees rain.',
      ],
    });
  }

  if (d.siding && d.sidingColor !== 'natural' && d.sidingColor !== 'unfinished') {
    out.push({
      title: 'Paint',
      steps: [
        `Prime bare wood and T1-11 with an exterior primer, then two coats of exterior paint (${d.sidingColor}).`,
        d.polkaDots ? 'Polka dots: make a 3" circle stencil. Snap chalk lines 9" apart up the wall and dab a dot every 9" along each line, shifting every other row by 4-1/2" so they stagger. Use the purple accent paint and a foam pouncer.' : '',
        d.glitter ? 'Glitter: stir a packet of paint glitter into each gallon of the final coat, or dust it onto the wet final coat, and keep stirring as you paint so it does not settle.' : '',
      ].filter(Boolean),
    });
  }
  if (shed.interior) {
    out.push({
      title: 'Inside',
      steps: [
        `Panel the walls (${shed.interior.panels} sheets), nailing to every stud, and leave the door and windows open. Paint ${shed.interior.paint}.`,
        'String lights along the top plates, posters at eye height, a rug and a beanbag. Use outdoor-rated cords unless an electrician wires the shed.',
      ],
    });
  }
  out.push({
    title: 'Final checks',
    steps: [
      'Walk the roof edges for nails that missed rafters, and the walls for siding nails that missed studs.',
      `Check that every rafter has its ${k.connector ? 'connector' : 'plate tie'}${beam ? ' and its hanger' : ''}, with every nail hole filled with the nail its maker names.`,
      'Keep the gravel clear of the siding, and slope the ground away from the pad.',
    ],
  });
  return out;
}

/** The same instructions as Markdown, for printing or a phone. */
export function instructionsMarkdown(sections, name) {
  const lines = [`# How to build: ${name}`, '', 'From Shed Designer. Not engineering or building-code advice; check your local code and each product\'s instructions.', ''];
  sections.forEach((s, i) => {
    lines.push(`## ${i + 1}. ${s.title}`, '');
    if (s.why) lines.push(`_${s.why}_`, '');
    s.steps.forEach((x, j) => lines.push(`${j + 1}. ${x}`));
    if (s.check?.length) { lines.push('', '**Check:**'); for (const c of s.check) lines.push(`- ${c}`); }
    lines.push('');
  });
  return lines.join('\n');
}
