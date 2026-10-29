// @ts-check
// How the frame ties together: a list of construction checks a framer makes
// by eye, made from the model so nobody has to. Each check names what it
// looked at and passes only if every instance does.
//
// - The cap plates lap the corners (the end walls' cap over the long walls' top plate).
// - Cap-plate joints sit away from top-plate joints, and every plate joint lands on a stud.
// - Every stud, king and post stud stands on a bottom plate and runs to the top plate.
// - Every header bears on a jack at each end; every jack carries a header.
// - Cripples bear on a header or sill, and rough sills sit on cripples.
// - Every rafter's birdsmouth seat bears on a wall's top plates, and its top end meets the ridge.
// - Every floor joist bears on at least two skids; every skid bears on the pad or blocks.

import { bbox } from './integrity.mjs';
import { fmtIn } from './lumber.mjs';

const EPS = 0.01;
const near = (a, b) => Math.abs(a - b) < EPS;
const within = (a0, a1, b0, b1) => a0 >= b0 - EPS && a1 <= b1 + EPS;
/** Is [a0, a1] covered by the union of the pieces (a stud under a splice sits on two plates)? */
const covered = (a0, a1, pieces) => {
  let x = a0;
  for (const p of [...pieces].sort((u, v) => u.s0 - v.s0)) if (p.s0 <= x + EPS && p.s1 > x) x = p.s1;
  return x >= a1 - EPS;
};

/** @param {import('./model.mjs').Shed} shed */
export function connectionChecks(shed) {
  const d = shed.design;
  const k = shed.dims;
  const H = d.wallHeight;
  /** @type {{ check: string, ok: boolean, detail: string }[]} */
  const rows = [];
  const add = (check, fails, total, what) => rows.push({ check, ok: fails.length === 0, detail: fails.length ? `${fails.length} of ${total} ${what}: ${fails.slice(0, 4).join('; ')}` : `all ${total} ${what}` });

  // Corner laps.
  {
    const fails = [];
    let n = 0;
    for (const g of ['left', 'right']) {
      const cap = shed.members.filter((m) => m.group === `wall:${g}` && m.kind === 'cap plate').map((m) => bbox(m.geom));
      for (const e of ['front', 'back']) {
        n += 1;
        const tops = shed.members.filter((m) => m.group === `wall:${e}` && m.kind === 'top plate').map((m) => bbox(m.geom));
        const laps = cap.some((c) => tops.some((t) => near(c.lo[2], t.hi[2]) && c.lo[0] < t.hi[0] - EPS && c.hi[0] > t.lo[0] + EPS && c.lo[1] < t.hi[1] - EPS && c.hi[1] > t.lo[1] + EPS));
        if (!laps) fails.push(`${g}/${e} corner`);
      }
    }
    add('Cap plates lap the corners', fails, n, 'corners interlocked (end-wall cap over long-wall top plate)');
  }

  for (const [name, w] of Object.entries(shed.walls)) {
    const mem = w.members.filter((m) => m.group === `wall:${name}`);
    const of = (kind) => mem.filter((m) => m.kind === kind).map((m) => /** @type {any} */ (m.local));
    const bottoms = of('bottom plate');
    const tops = of('top plate');
    const caps = of('cap plate');
    const headers = of('header');
    const jacks = of('jack stud');
    const sills = of('rough sill');
    const tag = (l) => `${fmtIn(l.s0)}`;

    const full = [...of('stud'), ...of('corner stud'), ...of('king stud'), ...of('post stud')];
    const fullFails = full.filter((l) => !(near(l.z0, 1.5) && covered(l.s0, l.s1, bottoms) && near(l.z1, H - 3) && covered(l.s0, l.s1, tops))).map(tag);
    add(`${name} wall: studs bear on both plates`, fullFails, full.length, 'studs, kings and post studs stand on a bottom plate and reach the top plate');

    const jackFails = jacks.filter((l) => !(near(l.z0, 1.5) && covered(l.s0, l.s1, bottoms) && headers.some((h) => near(h.z0, l.z1) && within(l.s0, l.s1, h.s0, h.s1)))).map(tag);
    const hdrFails = headers.filter((h) => jacks.filter((j) => near(j.z1, h.z0) && within(j.s0, j.s1, h.s0, h.s1)).length < 2).map(tag);
    if (headers.length) {
      add(`${name} wall: headers bear on jacks`, [...hdrFails.map((x) => `header at ${x}`), ...jackFails.map((x) => `jack at ${x}`)], headers.length + jacks.length, 'header plies and jacks (each header on two jacks, each jack on the plate under a header)');
    }
    const tc = of('top cripple');
    const bc = of('bottom cripple');
    const crFails = [
      ...tc.filter((l) => !(headers.some((h) => near(h.z1, l.z0) && within(l.s0, l.s1, h.s0, h.s1)) && near(l.z1, H - 3))).map((l) => `top ${tag(l)}`),
      ...bc.filter((l) => !(near(l.z0, 1.5) && covered(l.s0, l.s1, bottoms) && sills.some((s) => near(s.z0, l.z1) && within(l.s0, l.s1, s.s0, s.s1)))).map((l) => `bottom ${tag(l)}`),
      ...sills.filter((s) => bc.filter((l) => near(l.z1, s.z0) && within(l.s0, l.s1, s.s0, s.s1)).length < 2).map((s) => `sill ${tag(s)}`),
    ];
    if (tc.length || bc.length || sills.length) add(`${name} wall: cripples and sills bear`, crFails, tc.length + bc.length + sills.length, 'cripples and rough sills bearing on a header, sill or plate');

    // Plate joints land on a stud centre, and cap joints keep clear of top joints.
    const centres = [...full, ...jacks].map((l) => (l.s0 + l.s1) / 2);
    const joints = (ps) => ps.slice().sort((a, b) => a.s0 - b.s0).slice(1).map((p) => p.s0);
    const tj = joints(tops);
    const cj = joints(caps);
    const jointFails = [...tj, ...cj].filter((x) => !centres.some((c) => near(c, x))).map((x) => `joint at ${fmtIn(x)}`);
    const clearFails = cj.filter((c) => tj.some((t) => Math.abs(c - t) < 48 - EPS)).map((x) => `cap joint at ${fmtIn(x)}`);
    if (tj.length || cj.length) add(`${name} wall: plate splices`, [...jointFails, ...clearFails], tj.length + cj.length, 'plate joints on a stud, cap joints 4 ft from top-plate joints');
  }

  // Rafters seat on the plates and meet the ridge.
  {
    const rafters = shed.members.filter((m) => m.kind === 'rafter');
    const ridge = shed.members.filter((m) => m.kind === 'ridge board' || m.kind === 'ridge beam').map((m) => bbox(m.geom));
    // Seats bear on whichever cap is on top there: the long walls' caps, or at the
    // corners the end walls' caps that lap over them.
    const topPlates = shed.members.filter((m) => m.group.startsWith('wall:') && m.kind === 'cap plate').map((m) => bbox(m.geom));
    const fails = [];
    for (const r of rafters) {
      const b = bbox(r.geom);
      const xs = [b.lo[0], b.hi[0]];
      const seatPts = r.geom.profile.filter((p) => near(p[1], k.plateTop));
      const seatY = seatPts.map((p) => p[0]);
      const back = Math.min(...r.geom.profile.map((p) => p[0])) > d.width / 2 - 2;
      // A rafter on a variable-pitch connector has no notch: it touches the outside top edge of the caps.
      const onEdge = k.connector && r.geom.profile.some((p) => near(p[0], back ? d.width : 0) && near(p[1], k.plateTop));
      const y0 = k.connector ? (back ? d.width - k.stud : 0) : Math.min(...seatY);
      const y1 = k.connector ? (back ? d.width : k.stud) : Math.max(...seatY);
      // The whole seat (rafter thickness x seat length) must rest on cap plates.
      const under = topPlates.filter((t) => near(t.hi[2], k.plateTop) && t.lo[1] <= y0 + EPS && t.hi[1] >= y1 - EPS);
      const seated = (k.connector ? onEdge : seatY.length >= 2) && covered(xs[0], xs[1], under.map((t) => ({ s0: t.lo[0], s1: t.hi[0] })));
      const meets = ridge.some((g) => b.lo[1] <= g.hi[1] + EPS && b.hi[1] >= g.lo[1] - EPS && b.hi[2] <= g.hi[2] + EPS && b.hi[2] >= g.lo[2]);
      if (!seated) fails.push(`${r.id} seat`);
      if (!meets) fails.push(`${r.id} ridge`);
    }
    add('Rafters seat on the plates and meet the ridge', fails, rafters.length, 'rafters with a full birdsmouth seat on a long wall and their top end at the ridge');
  }

  // Floor on skids, skids on the ground.
  {
    const skids = shed.members.filter((m) => m.kind === 'skid').map((m) => bbox(m.geom));
    const joists = shed.members.filter((m) => m.kind === 'floor joist');
    const fails = joists.filter((j) => {
      const b = bbox(j.geom);
      return skids.filter((s) => near(s.hi[2], b.lo[2]) && s.lo[0] < b.hi[0] && s.hi[0] > b.lo[0] && s.lo[1] < b.hi[1] && s.hi[1] > b.lo[1]).length < 2;
    }).map((j) => j.id);
    add('Floor joists bear on skids', fails, joists.length, 'joists resting on at least two skids');
    const base = k.block ? k.block.h : 0;
    const skidFails = skids.filter((s) => !near(s.lo[2], base)).map((s) => fmtIn(s.lo[1]));
    add('Skids bear on the ground', skidFails, skids.length, k.block ? `skids on the ${k.block.plural}` : 'skids on the gravel pad');
    // A ridge beam's gable posts come down the post studs at mid-width: a skid
    // has to be under them, or the end joist takes the post as a point load.
    const posts = shed.members.filter((m) => m.kind === 'post stud').map((m) => bbox(m.geom));
    if (posts.length) {
      const postFails = posts.filter((p) => !skids.some((s) => s.lo[1] <= p.lo[1] + EPS && s.hi[1] >= p.hi[1] - EPS && s.lo[0] <= p.hi[0] && s.hi[0] >= p.lo[0])).map((p) => `post stud at ${fmtIn(p.lo[0])}, ${fmtIn(p.lo[1])}`);
      add('Ridge-beam posts bear on a skid', postFails, posts.length, 'post studs with a skid straight under them');
    }
    if (k.block) {
      // A butt joint between blocks hangs in the air: both ends need 1-1/2" on a block.
      const blocks = shed.fixtures.filter((f) => f.kind === 'block').map((f) => bbox(f.geom));
      const ends = skids.flatMap((s) => [s.lo[0], s.hi[0]].filter((x) => x > EPS && x < d.length - EPS).map((x) => ({ s, x })));
      const jointFails = ends.filter(({ s, x }) => !blocks.some((b) => b.lo[0] <= x - 1.5 + EPS && b.hi[0] >= x + 1.5 - EPS && b.lo[1] < s.hi[1] && b.hi[1] > s.lo[1])).map(({ x }) => `joint at ${fmtIn(x)}`);
      if (ends.length) add('Skid joints land on blocks', jointFails, ends.length, 'skid ends at a butt joint, each on a block');
    }
  }

  // Panel edges on framing: every sheet edge inside the building lands on wood
  // it can be nailed to, 1/2" or more each side of the joint.
  {
    const spans = (kinds) => shed.members.filter((m) => kinds.includes(m.kind)).map((m) => bbox(m.geom)).map((b) => ({ s0: b.lo[0], s1: b.hi[0] }));
    const edgeFails = (kind, framing) => {
      const xs = new Set();
      for (const p of shed.panels.filter((x) => x.kind === kind)) { const b = bbox(p.geom); for (const x of [b.lo[0], b.hi[0]]) if (x > EPS && x < d.length - EPS) xs.add(Math.round(x * 16) / 16); }
      return { n: xs.size, fails: [...xs].filter((x) => !covered(x - 0.5, x + 0.5, framing)).map((x) => `edge at ${fmtIn(x)}`) };
    };
    const floor = edgeFails('floor sheet', spans(['floor joist']));
    if (floor.n) add('Subfloor edges on joists', floor.fails, floor.n, 'subfloor sheet end joints on a joist');
    const roof = edgeFails('roof sheathing', spans(['rafter']));
    if (roof.n) add('Roof sheathing edges on rafters', roof.fails, roof.n, 'roof sheathing end joints on a rafter');

    // Siding: each vertical joint between panels, sampled every inch up the
    // wall, must have framing under both panels except where it crosses a door,
    // window or vent opening. A few inches of slack cover the edges of openings.
    const fails = [];
    let n = 0;
    for (const p of shed.panels.filter((x) => x.kind === 'siding')) {
      const b = bbox(p.geom);
      const eave = p.wall === 'front' || p.wall === 'back';
      const ax = eave ? 0 : 1;
      const across = eave ? 1 : 0;
      const len = eave ? d.length : d.width;
      const zone = p.wall === 'front' ? [0, k.stud] : p.wall === 'back' ? [d.width - k.stud, d.width] : p.wall === 'left' ? [0, k.stud] : [d.length - k.stud, d.length];
      const inZone = (g) => g.lo[across] < zone[1] - EPS && g.hi[across] > zone[0] + EPS;
      const frame = shed.members.map((m) => bbox(m.geom)).filter(inZone);
      const holes = shed.fixtures.filter((f) => ['door', 'window', 'vent'].includes(f.kind)).map((f) => bbox(f.geom))
        .filter((g) => g.lo[across] < zone[1] + 2 && g.hi[across] > zone[0] - 2);
      for (const x of [b.hi[ax]]) {
        if (x < EPS || x > len - EPS) continue;
        n += 1;
        let bad = 0;
        for (let z = k.floorTop + 1; z < b.hi[2] - 1; z += 1) {
          if (holes.some((h) => h.lo[ax] < x + 1 && h.hi[ax] > x - 1 && z > h.lo[2] - 1 && z < h.hi[2] + 1)) continue;
          const wood = (xx) => frame.some((g) => g.lo[ax] <= xx && g.hi[ax] >= xx && g.lo[2] <= z && g.hi[2] >= z);
          if (!(wood(x - 0.5) && wood(x + 0.5))) bad += 1;
        }
        if (bad > 12) fails.push(`${p.wall} joint at ${fmtIn(x)} (${bad}" unbacked)`);
      }
    }
    if (n) add('Siding joints on framing', fails, n, 'vertical siding joints with a stud, cripple or post behind them');
  }
  return { rows, ok: rows.every((r) => r.ok) };
}
