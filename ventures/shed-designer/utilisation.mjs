// @ts-check
// Structural utilisation, made visible: every checked member's use of
// capacity, what governs it, and the check written out in plain words with its
// inputs, plus a target-margin report that says which members sit far below the
// target and why (the smallest size the tool offers, a sheathing or siding
// rating, stiffness, the next size down failing, or simply oversized).
//
// The numbers are the Structure tab's (checks.mjs, structure.mjs). This module
// re-derives each check's inputs and writes the arithmetic out step by step,
// then compares its own ratio with the Structure tab's; when the two differ
// (checks.mjs changed and this file did not follow) the member keeps the
// Structure tab's ratio and says its breakdown could not be reproduced, rather
// than show arithmetic that is not what was checked.
//
// Screening checks on SPF No. 2 by allowable stress; nothing here has been
// reviewed by an engineer.

import { buildShed } from './model.mjs';
import { structuralChecks, heelJoint, nailZ, skidOnBlocks, SOIL_PSF, rafterUplift, racking, bayPlates } from './checks.mjs';
import { connectionChecks } from './connections.mjs';
import { check, roofCase, FLOOR, SPF2, T, DEPTH, designValues } from './structure.mjs';
import { sidingSpan } from './simplify.mjs';
import { subfloorCheck } from './levers.mjs';
import { fmtIn, actual } from './lumber.mjs';

// NDS Supplement Table 4A size factors for No. 2 dimension lumber, as
// structure.mjs uses them (bending, and compression parallel to grain).
const CF_B = { '2x4': 1.5, '2x6': 1.3, '2x8': 1.2, '2x10': 1.1, '2x12': 1.0 };
const CF_C = { '2x4': 1.15, '2x6': 1.1, '2x8': 1.05, '2x10': 1.0, '2x12': 1.0 };
const CR = 1.15;

const n0 = (x) => Math.round(x).toLocaleString('en-US');
const n2 = (x) => (Math.abs(x) >= 100 ? n0(x) : x.toFixed(2));
const pct = (r) => `${Math.round(r * 100)}%`;

/**
 * @typedef {{ name: string, ratio: number, words: string }} Part
 * @typedef {{
 *   key: string, member: string, size: string, ratio: number, governs: string, ok: boolean,
 *   detail: string, inputs: [string, string][], parts: Part[], verified: boolean,
 *   ids: string[], kinds: string[], explain: string,
 * }} Use
 */

/**
 * A simple-span member under uniform load, written out (structure.mjs check()).
 * @returns {{ parts: Part[], inputs: [string, string][] }}
 */
function beamWords({ size, plies = 1, spacingIn, pitch = 0, bearingIn, repetitive = true, species = 'SPF' }, clearIn, c, what) {
  const L = clearIn + bearingIn;
  const cos = 1 / Math.sqrt(1 + (pitch / 12) ** 2);
  const wD = (c.dead / cos) * (spacingIn / 144);
  const wL = (c.live * spacingIn) / 144;
  const w = wD + wL;
  const b = T * plies;
  const d = DEPTH[size];
  const S = (b * d * d) / 6, A = b * d, I = (b * d ** 3) / 12;
  const Cr = repetitive && plies === 1 && spacingIn <= 24 ? CR : 1;
  // SPF's Fb takes the size factor; Southern pine's published values have it in.
  const v = designValues(size, species);
  const syp = species === 'SYP';
  const Fb = v.Fb * c.CD * Cr;
  const Fv = v.Fv * c.CD;
  const M = (w * L * L) / 8;
  const V = w * (L / 2 - d) * cos;
  const R = (w * L) / 2;
  const k = (5 * L ** 4) / (384 * v.E * I * cos ** 2);
  const fb = M / S, fv = (1.5 * V) / A, fp = R / (b * bearingIn);
  const dl = k * wL, dt = k * w;
  const slope = pitch ? ` The dead load is ${c.dead} psf on the slope, so ${n2(c.dead / cos)} psf on plan at ${pitch}/12.` : '';
  const live = c.name === 'floor' ? 'live' : 'snow';
  const inputs = /** @type {[string, string][]} */ ([
    ['Member', `${plies > 1 ? `${plies}-ply ` : ''}${size}, ${n2(b)}" x ${n2(d)}" (${syp ? 'Southern pine' : 'SPF'} No. 2)`],
    ['Span used', `${fmtIn(clearIn)} clear + ${fmtIn(bearingIn)} bearing = ${n2(L)}"`],
    ['Load width', `${n2(spacingIn)}" ${what}`],
    ['Loads', `${c.dead} psf dead + ${c.live} psf ${live}.${slope}`],
    ['Section', `S = bd²/6 = ${n2(S)} in³, A = ${n2(A)} in², I = bd³/12 = ${n2(I)} in⁴`],
    ['Design values', `Fb ${syp ? `${v.Fb} psi (size factor in, SPIB 2013)` : `${SPF2.Fb} psi`}, Fv ${v.Fv} psi, Fc⊥ ${v.Fc_perp} psi, E ${(v.E / 1e6).toFixed(1)} million psi; load duration CD ${c.CD}`],
  ]);
  const parts = [
    { name: 'bending', ratio: fb / Fb, words: `Load on the member w = ${n2(w * 12)} lb/ft. Moment M = wL²/8 = ${n0(M)} lb·in. Stress fb = M/S = ${n0(fb)} psi. Allowable F'b = ${syp ? v.Fb : `${SPF2.Fb} × size factor ${CF_B[size]}`} × CD ${c.CD}${Cr > 1 ? ` × repetitive ${CR}` : ''} = ${n0(Fb)} psi. ${n0(fb)} / ${n0(Fb)} = ${pct(fb / Fb)}.` },
    { name: 'shear', ratio: fv / Fv, words: `Shear a depth in from the support V = w(L/2 - d) = ${n0(V)} lb. Stress fv = 1.5V/A = ${n0(fv)} psi against F'v = ${v.Fv} × ${c.CD} = ${n0(Fv)} psi: ${pct(fv / Fv)}.` },
    { name: 'deflection live', ratio: dl / (L / c.liveLimit), words: `Sag under the ${live} load alone, 5wL⁴/384EI = ${dl.toFixed(3)}", against L/${c.liveLimit} = ${(L / c.liveLimit).toFixed(3)}": ${pct(dl / (L / c.liveLimit))}.` },
    { name: 'deflection total', ratio: dt / (L / c.totalLimit), words: `Sag under all the load = ${dt.toFixed(3)}", against L/${c.totalLimit} = ${(L / c.totalLimit).toFixed(3)}": ${pct(dt / (L / c.totalLimit))}.` },
    { name: 'bearing', ratio: fp / v.Fc_perp, words: `End reaction wL/2 = ${n0(R)} lb on ${n2(b)}" x ${n2(bearingIn)}" of support = ${n0(fp)} psi against Fc⊥ ${v.Fc_perp} psi: ${pct(fp / v.Fc_perp)}.` },
  ];
  // The check this was written from must agree with it.
  const ref = check({ size, plies, spacingIn, pitch, bearingIn, repetitive, species }, clearIn / 12, c);
  const same = parts.every((p) => Math.abs(p.ratio - /** @type {any} */ (ref)[p.name]) < 1e-9);
  return { parts: same ? parts : [], inputs };
}

/** A built-up post, written out (checks.mjs postCheck). */
function postWords(plies, stud, lengthIn, P, where, CD = 1.15) {
  const d = DEPTH[stud];
  const A = plies * T * d;
  const FcStar = SPF2.Fc * CD * (CF_C[stud] || 1);
  const FcE = (0.822 * SPF2.Emin) / (lengthIn / d) ** 2;
  const a = FcE / FcStar;
  const b = (1 + a) / (2 * 0.8);
  const Cp = b - Math.sqrt(b * b - a / 0.8);
  const fc = P / A;
  return [
    { name: `buckling, ${where}`, ratio: fc / (FcStar * Cp), words: `${n0(P)} lb on ${n2(A)} in² is fc = ${n0(fc)} psi. Column ${fmtIn(lengthIn)} long braced about its ${n2(d)}" depth: slenderness ${n2(lengthIn / d)}, Euler stress FcE = 0.822 × Emin / (le/d)² = ${n0(FcE)} psi, stability factor Cp = ${Cp.toFixed(3)}. Allowable ${SPF2.Fc} × CD ${CD} × size ${CF_C[stud] || 1} × Cp = ${n0(FcStar * Cp)} psi: ${pct(fc / (FcStar * Cp))}.` },
    { name: `bearing, ${where}`, ratio: fc / SPF2.Fc_perp, words: `The post's end on the plate: ${n0(fc)} psi against Fc⊥ ${SPF2.Fc_perp} psi: ${pct(fc / SPF2.Fc_perp)}.` },
  ];
}

/** A wall stud, written out for the combination that governs (structure.mjs studCheck). */
function studWords(stud, spacingIn, lengthIn, [wD, wS], windPsf) {
  const d = DEPTH[stud];
  const A = T * d, S = (T * d * d) / 6;
  /** @type {Part[]} */
  const parts = [];
  for (const [label, kD, kS, kW, CD] of /** @type {const} */ ([['dead + snow', 1, 1, 0, 1.15], ['dead + 0.75 snow + 0.75 x 0.6 wind', 1, 0.75, 0.45, 1.6], ['dead + 0.6 wind', 1, 0, 0.6, 1.6]])) {
    const P = ((kD * wD + kS * wS) * spacingIn) / 12;
    const fc = P / A;
    const FcStar = SPF2.Fc * CD * CF_C[stud];
    const FcE = (0.822 * SPF2.Emin) / (lengthIn / d) ** 2;
    const a = FcE / FcStar;
    const b = (1 + a) / (2 * 0.8);
    const Cp = b - Math.sqrt(b * b - a / 0.8);
    const wLat = (kW * windPsf * spacingIn) / 144;
    const fb = (wLat * lengthIn ** 2) / 8 / S;
    const Fb1 = SPF2.Fb * CD * CF_B[stud] * CR;
    const ratio = (fc / (FcStar * Cp)) ** 2 + fb / (Fb1 * (1 - fc / FcE));
    parts.push({ name: label, ratio, words: `Axial load ${n0(P)} lb (${n0(fc)} psi) against F'c = ${SPF2.Fc} × CD ${CD} × size ${CF_C[stud]} × Cp ${Cp.toFixed(3)} = ${n0(FcStar * Cp)} psi; wind ${n2(wLat * 12)} lb/ft on the face bends it to fb = ${n0(fb)} psi against F'b = ${n0(Fb1)} psi. NDS 3.9.2 interaction: (fc/F'c)² + fb/(F'b(1 - fc/FcE)) = ${ratio.toFixed(3)}.` });
    const pb = P / (T * d) / SPF2.Fc_perp;
    parts.push({ name: `plate bearing, ${label}`, ratio: pb, words: `The stud's end on the plate: ${n0(P / (T * d))} psi against Fc⊥ ${SPF2.Fc_perp}: ${pct(pb)}.` });
  }
  return parts;
}

/** A doubled header, written out (structure.mjs headerCheck). */
function headerWords(size, spanIn, wPlf, plies, jacks, stud) {
  const d = DEPTH[size];
  const b = plies * T;
  const w = wPlf / 12;
  const M = (w * spanIn ** 2) / 8, V = (w * spanIn) / 2;
  const CD = 1.15;
  const Fb = SPF2.Fb * CD * CF_B[size];
  const S = (b * d * d) / 6;
  const defl = (5 * w * spanIn ** 4) / (384 * SPF2.E * ((b * d ** 3) / 12));
  const brg = V / (jacks * T * Math.min(b, DEPTH[stud]));
  return [
    { name: 'bending', ratio: M / S / Fb, words: `${n0(wPlf)} lb/ft over ${fmtIn(spanIn)}: M = wL²/8 = ${n0(M)} lb·in, fb = ${n0(M / S)} psi against F'b = ${SPF2.Fb} × ${CD} × size ${CF_B[size]} = ${n0(Fb)} psi (no repetitive factor): ${pct(M / S / Fb)}.` },
    { name: 'shear', ratio: (1.5 * V) / (b * d) / (SPF2.Fv * CD), words: `End shear wL/2 = ${n0(V)} lb, fv = 1.5V/A = ${n0((1.5 * V) / (b * d))} psi against ${n0(SPF2.Fv * CD)} psi: ${pct((1.5 * V) / (b * d) / (SPF2.Fv * CD))}.` },
    { name: 'deflection', ratio: defl / (spanIn / 240), words: `Sag ${defl.toFixed(3)}" against L/240 = ${(spanIn / 240).toFixed(3)}": ${pct(defl / (spanIn / 240))}.` },
    { name: 'jack bearing', ratio: brg / SPF2.Fc_perp, words: `${n0(V)} lb on ${jacks} jack a side, ${T}" x ${n2(Math.min(b, DEPTH[stud]))}": ${n0(brg)} psi against Fc⊥ ${SPF2.Fc_perp}: ${pct(brg / SPF2.Fc_perp)}.` },
  ];
}

const worstPart = (parts) => parts.reduce((a, p) => (p.ratio > a.ratio ? p : a), { name: '', ratio: -Infinity, words: '' });

/**
 * Every checked member's utilisation, sorted highest first.
 * @param {import('./model.mjs').Shed} shed
 * @param {ReturnType<typeof structuralChecks>} [sc]
 * @returns {Use[]}
 */
export function utilisation(shed, sc = structuralChecks(shed)) {
  const d = shed.design;
  const k = shed.dims;
  const cos = 1 / Math.sqrt(1 + (d.pitch / 12) ** 2);
  const roof = roofCase(d.snowLoad);
  const beam = d.roofType === 'ridgeBeam';
  const idsOf = (pred) => shed.members.filter(pred).map((m) => m.id);
  const rafterRunIn = d.width / 2 - (beam ? 1.5 : 0.75) - k.stud;
  const tribFt = (beam ? rafterRunIn / 2 + k.stud + d.overhang : d.width / 2 + d.overhang) / 12;
  const deadPlf = (15 / cos) * tribFt;
  const snowPlf = d.snowLoad * tribFt;
  // Headers pair with rows in the order checks.mjs walks the walls.
  const headerQueue = Object.entries(shed.walls).flatMap(([name, wall]) => wall.openings.filter((p) => !p.bay).map((p) => ({ name, p })));
  const bayQueue = Object.entries(shed.walls).flatMap(([name, wall]) => wall.openings.filter((p) => p.bay).map((p) => ({ name, p })));
  /** @type {Use[]} */
  const out = [];
  for (const row of sc.rows) {
    /** @type {Use} */
    const u = { key: row.member, member: row.member, size: row.size, ratio: row.ratio, governs: row.governs, ok: row.ok, detail: row.detail, inputs: [], parts: [], verified: false, ids: [], kinds: [], explain: '' };
    if (row.member === 'Floor joists') {
      const gaps = k.skidYs.slice(1).map((y, i) => y - k.skidYs[i]);
      const skidThick = shed.members.find((m) => m.kind === 'skid')?.geom.thickness ?? 3.5;
      const r = beamWords({ size: d.joistSize, spacingIn: d.joistSpacing, bearingIn: skidThick, species: d.floorTreated ? 'SYP' : 'SPF' }, Math.max(...gaps) - skidThick, FLOOR, 'on centre: each joist carries that strip of floor');
      Object.assign(u, r, { kinds: ['floor joist'], explain: `Each joist is a simple beam from skid to skid, checked over the widest gap between skids${d.floorTreated ? ', as Southern pine: treated lumber usually is' : ''}.` });
      u.ids = idsOf((m) => m.kind === 'floor joist');
    } else if (row.member === 'Rafters') {
      const r = beamWords({ size: d.rafterSize, spacingIn: d.rafterSpacing, pitch: d.pitch, bearingIn: k.stud }, rafterRunIn, roof, 'on centre: each rafter carries that strip of roof');
      Object.assign(u, r, { kinds: ['rafter'], explain: 'Each rafter is checked on its horizontal run from the wall plate to the ridge, with the load on plan.' });
      u.ids = idsOf((m) => m.kind === 'rafter');
    } else if (row.member === 'Ridge beam') {
      const r = beamWords({ size: d.beamSize, plies: 2, spacingIn: d.width / 2, pitch: d.pitch, repetitive: false, bearingIn: 3 }, d.length - 2 * k.stud, roof, 'of roof: the upper half of each rafter, both slopes');
      Object.assign(u, r, { kinds: ['ridge beam'], explain: 'The ridge beam spans gable to gable on its two posts and carries the top half of every rafter on both sides.' });
      u.ids = idsOf((m) => m.kind === 'ridge beam');
    } else if (row.member === 'Ridge beam posts') {
      const P = ((15 / cos + d.snowLoad) * (d.width / 2) / 12 * d.length) / 12 / 2;
      const postH = shed.members.find((m) => m.kind === 'beam post')?.length ?? 12;
      u.parts = [...postWords(2, d.studSize, postH, P, 'post above the plate'), ...postWords(2, d.studSize, k.studLen, P, 'post studs in the wall')];
      u.inputs = [['Load', `half the ridge beam's load: (${n2(15 / cos)} + ${d.snowLoad}) psf × ${n2(d.width / 24)} ft × ${n2(d.length / 12)} ft / 2 = ${n0(P)} lb`], ['Member', `2-ply ${d.studSize}, ${n2(2 * T)}" x ${n2(DEPTH[d.studSize])}"`]];
      u.kinds = ['beam post', 'post stud'];
      u.explain = 'Each gable post carries half of the ridge beam\'s load down through two post studs to the floor.';
      u.ids = idsOf((m) => m.kind === 'beam post' || m.kind === 'post stud');
    } else if (row.member === 'Ridge board') {
      u.explain = 'A ridge board carries no load: each rafter pair and its tie form a triangle, and the board is a nailing surface where the pairs meet.';
      u.kinds = ['ridge board'];
      u.ids = idsOf((m) => m.kind === 'ridge board');
      u.verified = true;
    } else if (/^Rafter tie nailing/.test(row.member)) {
      const h = heelJoint(shed);
      if (h) {
        const L = d.width / 12, rise = (L / 2) * (d.pitch / 12);
        const w = (15 / cos + d.snowLoad) * (d.rafterSpacing / 12);
        u.inputs = [['Load on a pair', `(${n2(15 / cos)} + ${d.snowLoad}) psf × ${d.rafterSpacing}" = ${n2(w)} lb/ft on plan`], ['Geometry', `span ${n2(L)} ft, ridge ${n2(rise)} ft above the tie`], ['Nail', `16d common, 0.162" x 3-1/2", NDS yield limit Z = ${n2(nailZ(0.162, 1.5, 2.0))} lb × CD 1.15`]];
        u.parts = [{ name: 'nail shear', ratio: h.thrust / (h.nails * h.perNail), words: `Outward thrust H = wL²/8h = ${n0(h.thrust)} lb; ${h.nails} nails × ${n0(h.perNail)} lb = ${n0(h.nails * h.perNail)} lb: ${pct(h.thrust / (h.nails * h.perNail))}.` }];
      }
      u.kinds = ['rafter tie'];
      u.explain = 'Under a ridge board the rafters push the walls out; the tie at the plate holds them, and its nails take the whole thrust.';
      u.ids = idsOf((m) => m.kind === 'rafter tie');
    } else if (/^Header over the /.test(row.member)) {
      const q = headerQueue.shift();
      if (q) {
        const eave = q.name === 'front' || q.name === 'back';
        const wPlf = eave ? deadPlf + snowPlf + 10 : 40 + (15 / cos + d.snowLoad) * (d.rafterSpacing / 2) / 12;
        u.parts = headerWords(q.p.hdr, q.p.w, wPlf, 2, 1, d.studSize);
        u.inputs = [['Opening', `${fmtIn(q.p.w)} wide in the ${q.name} wall`], ['Load', eave ? `roof ${n0(deadPlf)} dead + ${n0(snowPlf)} snow lb/ft, plus 10 lb/ft of wall` : `the gable framing above (40 lb/ft) plus half a rafter spacing of roof`], ['Member', `2-ply ${q.p.hdr}`]];
        u.key = `${row.member} (${fmtIn(q.p.a)} along)`;
        u.ids = shed.walls[q.name].members.filter((m) => m.kind === 'header' && /** @type {any} */ (m.local).s0 < q.p.a + q.p.w && /** @type {any} */ (m.local).s1 > q.p.a).map((m) => m.id);
      }
      u.kinds = ['header'];
      u.explain = 'A header is a short beam over the opening, carried by one jack stud a side.';
    } else if (row.member === 'Subfloor') {
      const sf = subfloorCheck(d);
      u.parts = [{ name: 'span rating', ratio: d.joistSpacing / sf.spanOC, words: `Joists ${d.joistSpacing}" apart against the panel's APA span rating of ${sf.spanOC}" on centre (check the stamp): ${d.joistSpacing} / ${sf.spanOC} = ${pct(d.joistSpacing / sf.spanOC)}.` }];
      u.inputs = [['Panel', sf.name], ['Joist spacing', `${d.joistSpacing}"`]];
      u.explain = 'A panel, not a framing member: its maker rates it for a widest joist spacing, and that rating is the check.';
    } else if (/^Plates over the /.test(row.member)) {
      const q = bayQueue.shift();
      if (q) {
        const pl = bayPlates(shed, q.name, q.p);
        u.parts = [{ name: 'bending', ratio: pl.ratio, words: pl.point
          ? `A rafter landing mid-bay brings ${n0(pl.load)} lb; M = PL/4 over ${fmtIn(pl.span)} on two flat ${d.studSize} plates: ${pct(pl.ratio)}.`
          : `${n0(pl.load)} lb/ft over ${fmtIn(pl.span)}; M = wL²/8 on two flat ${d.studSize} plates: ${pct(pl.ratio)}.` }];
        u.inputs = [['Opening', `${fmtIn(q.p.w)} wide, inside one stud bay of the ${q.name} wall: no header`]];
        u.ids = shed.walls[q.name].members.filter((m) => (m.kind === 'top plate' || m.kind === 'cap plate') && /** @type {any} */ (m.local).s0 <= q.p.bay[0] && /** @type {any} */ (m.local).s1 >= q.p.bay[1]).map((m) => m.id);
      }
      u.kinds = ['top plate', 'cap plate'];
      u.explain = 'A window that fits between two studs cuts none, so the plates span its bay as they span every other.';
    } else if (row.member === 'Rafter-to-plate ties (uplift)') {
      const up = rafterUplift(shed);
      u.inputs = [['Tie', `${up.tie.model}, ${up.tie.uplift} lb allowable uplift in SPF (Simpson catalog C-C-2024)`], ['Wind', `${d.windLoad} psf up on the rafter's strip of roof and under the overhang`]];
      u.parts = [{ name: 'uplift', ratio: Math.max(0, up.net) / up.tie.uplift, words: `0.6 × wind = ${n0(up.up)} lb up, less 0.6 × the roof's weight = ${n0(up.dead)} lb, leaves ${n0(Math.max(0, up.net))} lb on the tie against ${up.tie.uplift} lb: ${pct(Math.max(0, up.net) / up.tie.uplift)}. It holds to about ${Math.floor(up.holdsPsf)} psf.` }];
      u.kinds = ['rafter'];
      u.explain = 'Wind lifts the roof; the metal tie at each rafter end holds it to the wall plate.';
      u.ids = idsOf((m) => m.kind === 'rafter');
    } else if (row.member === 'Wall bracing (racking)') {
      const r = racking(shed);
      u.parts = [{ name: 'shear', ratio: r.ratio, words: r.why }];
      u.inputs = [['Bracing', r.what]];
      u.kinds = ['stud'];
      u.explain = 'Wind on one side pushes the walls toward a parallelogram; the panels nailed to the walls parallel to the wind hold them square.';
      u.ids = idsOf((m) => m.group === `wall:${r.wall || 'front'}` && /stud/.test(m.kind));
    } else if (row.member === 'Skids on blocks' || row.member === 'Blocks on the soil') {
      const sk = skidOnBlocks(shed);
      if (sk) {
        const v = sk.values;
        const inputs = /** @type {[string, string][]} */ ([['Skid', `PT ${d.skidSize}, ${sk.outer ? 'an outer skid, under the eave wall' : 'an inner skid'}; Southern pine No. 2, wet service: Fb ${n0(v.Fb)}, Fv ${n2(v.Fv)}, Fc⊥ ${n2(v.Fc_perp)} psi, E ${(v.E / 1e6).toFixed(2)} million psi`], ['Span', `${fmtIn(sk.L)} block to block`], ['Worst reaction', `${n0(sk.R)} lb on a block`]]);
        if (row.member === 'Skids on blocks') {
          u.parts = [
            { name: 'bending', ratio: sk.ratios.bending, words: `wL²/8 on the block spacing, the worst of D+L, D+S and D+0.75(L+S) against F'b × CD: ${pct(sk.ratios.bending)}.` },
            { name: 'shear', ratio: sk.ratios.shear, words: `0.625wL (a two-span skid's inside shear), fv = 1.5V/A against F'v × CD: ${pct(sk.ratios.shear)}.` },
            { name: 'deflection', ratio: sk.ratios.deflection, words: `5wL⁴/384EI against L/240: ${pct(sk.ratios.deflection)}.` },
            { name: 'bearing', ratio: sk.ratios.bearing, words: `${n0(sk.R)} lb on the skid's ${n2(actual(d.skidSize).thick)}" width x ${k.block.along}" of block against Fc⊥: ${pct(sk.ratios.bearing)}.` },
          ];
          u.explain = 'On blocks, a skid is a beam from block to block; treated skids are usually Southern pine, and on blocks they stay damp.';
        } else {
          u.parts = [{ name: 'soil bearing', ratio: sk.soil, words: `${n0(sk.R)} lb plus 50 lb for the block and skid, on ${n2(sk.footSqFt)} sq ft${sk.spread ? ' (spread 2" each side through the gravel bed)' : ''}, against ${SOIL_PSF} psf: ${pct(sk.soil)}.` }];
          u.explain = 'The IRC presumes 1,500 psf for clay or silt when nobody has tested the soil (Table R401.4.1).';
        }
        u.inputs = inputs;
      }
      u.kinds = ['skid'];
      u.ids = idsOf((m) => m.kind === 'skid');
    } else if (row.member === 'Wall studs') {
      u.parts = studWords(d.studSize, d.studSpacing, k.studLen, [deadPlf, snowPlf], d.windLoad);
      u.inputs = [['Stud', `${d.studSize} at ${d.studSpacing}", ${fmtIn(k.studLen)} long`], ['Roof on the eave wall', `${n0(deadPlf)} lb/ft dead + ${n0(snowPlf)} lb/ft snow`], ['Wind', `${d.windLoad} psf on the wall face`]];
      u.kinds = ['stud'];
      u.explain = 'An eave-wall stud is a column under the roof that also bends under wind on the siding. Gable-wall studs carry less and share this result.';
      u.ids = idsOf((m) => m.kind === 'stud' && (m.group === 'wall:front' || m.group === 'wall:back'));
    }
    if (u.parts.length) {
      const top = worstPart(u.parts);
      u.verified = Math.abs(top.ratio - row.ratio) < 1e-6;
      if (!u.verified) u.parts = [];
      else if (row.governs !== 'none') u.governs = top.name;
    }
    out.push(u);
  }
  return out.sort((a, b) => b.ratio - a.ratio);
}

/** Heat bands for the view and the plans: upper bound of utilisation, colour, label. */
export const BANDS = /** @type {const} */ ([
  { max: 0.25, rgb: [0.62, 0.79, 0.88], hex: '#9ecae1', label: 'under 25%' },
  { max: 0.5, rgb: [0.67, 0.86, 0.63], hex: '#abdda4', label: '25 to 50%' },
  { max: 0.7, rgb: [1.0, 0.88, 0.55], hex: '#fee08b', label: '50 to 70%' },
  { max: 0.9, rgb: [0.99, 0.68, 0.38], hex: '#fdae61', label: '70 to 90%' },
  { max: 1.0, rgb: [0.96, 0.43, 0.26], hex: '#f46d43', label: '90 to 100%' },
  { max: Infinity, rgb: [0.75, 0.1, 0.15], hex: '#c0182a', label: 'over capacity' },
]);
export const UNCHECKED = { rgb: [0.82, 0.82, 0.82], hex: '#d4d4d4', label: 'not checked on its own' };

/** Band index of a ratio. */
export const bandOf = (r) => BANDS.findIndex((b) => r <= b.max + 1e-12);

/**
 * Member id -> utilisation entry, for the 3D view and the plans. A member in
 * more than one check (none today) keeps the highest.
 * @param {Use[]} uses
 */
export function heatById(uses) {
  /** @type {Map<string, Use>} */
  const map = new Map();
  for (const u of uses) {
    if (u.governs === 'none') continue;
    for (const id of u.ids) if (!map.has(id) || /** @type {Use} */ (map.get(id)).ratio < u.ratio) map.set(id, u);
  }
  return map;
}

export const REASONS = {
  oversized: 'Simply oversized',
  margin: 'Next size down misses your target',
  step: 'Minimum practical size: the next size down fails',
  minimum: 'Minimum practical size',
  stiffness: 'Stiffness or deflection',
  code: 'Code or rating minimum',
  nailing: 'Nailing surface',
};

/**
 * Lighter versions of a member that the tool can build, each as a design
 * change, or a fixed reason when there is none.
 * @param {Use} u
 * @param {import('./model.mjs').Design} d
 * @returns {{ probes: { label: string, change: object }[], reason?: keyof typeof REASONS, why?: string }}
 */
function lighter(u, d) {
  const down = (size, list) => list.slice(0, list.indexOf(size)).reverse();
  if (u.member === 'Floor joists') {
    const probes = down(d.joistSize, ['2x4', '2x6', '2x8', '2x10', '2x12']).map((s) => ({ label: `${s} joists at ${d.joistSpacing}"`, change: { joistSize: s } }));
    if (d.joistSpacing < 24) probes.push({ label: `${d.joistSize} joists at 24"`, change: { joistSpacing: 24 } });
    return probes.length ? { probes } : { probes, reason: 'minimum', why: '2x4 at 24" is the lightest floor the tool frames.' };
  }
  if (u.member === 'Rafters') {
    const probes = down(d.rafterSize, ['2x4', '2x6', '2x8', '2x10']).map((s) => ({ label: `${s} rafters at ${d.rafterSpacing}"`, change: { rafterSize: s } }));
    if (d.rafterSpacing < 24) probes.push({ label: `${d.rafterSize} rafters at 24"`, change: { rafterSpacing: 24 } });
    return probes.length ? { probes } : { probes, reason: 'code', why: 'Already 2x4 at 24": wider spacing would exceed the 24" span rating stamped on 7/16" roof sheathing (24/16).' };
  }
  if (u.member === 'Ridge beam') {
    const probes = down(d.beamSize, ['2x8', '2x10', '2x12']).map((s) => ({ label: `2-ply ${s} ridge beam`, change: { beamSize: s } }));
    return probes.length ? { probes } : { probes, reason: 'minimum', why: 'A two-ply 2x8 is the shallowest ridge beam the tool frames.' };
  }
  if (u.member === 'Subfloor') return { probes: [], reason: 'code', why: 'Its use is the joist spacing over the panel\'s rated span; it rises only if the joists spread out.' };
  if (u.member === 'Ridge beam posts') return { probes: [], reason: 'minimum', why: `Two plies of the ${d.studSize} studs is the smallest post that gives the two-ply beam (3" wide) full bearing; the load is small, so it sits well under capacity.` };
  if (u.member === 'Ridge board') return { probes: [], reason: 'code', why: 'Not a beam. IRC R802.3 asks for a ridge board at least 1" nominal and no less in depth than the cut end of the rafter, so its size follows the rafter.' };
  if (/^Header over/.test(u.member)) return { probes: [], reason: 'minimum', why: 'Two 2x4s, the shallowest header the tool frames (each header is sized to its load). A window that fits between two studs needs none: slide it into a stud bay.' };
  if (u.member === 'Wall studs') {
    if (d.studSize !== '2x4') return { probes: [{ label: `2x4 studs at ${d.studSpacing}"`, change: { studSize: '2x4' } }] };
    if (d.studSpacing < 24 && sidingSpan(d) >= 24) return { probes: [{ label: '2x4 studs at 24"', change: { studSpacing: 24 } }] };
    if (d.studSpacing < 24) return { probes: [], reason: 'code', why: `2x4 is the smallest stud; ${d.sidingType} panels are rated for studs at ${sidingSpan(d)}" (see the panel's stamp), so the spacing cannot open up without a different siding.` };
    return { probes: [], reason: 'minimum', why: '2x4 at 24" is the lightest wall the tool frames.' };
  }
  return { probes: [] };
}

/**
 * The target-margin report: members above the target (they need a bigger
 * size to keep that margin), and members far below it (under half the
 * target) with the reason and, where the tool can frame one, the lighter
 * option and its utilisation. Lighter options are built and must pass every
 * load and connection check.
 * @param {import('./model.mjs').Shed} shed
 * @param {number} [target] aim every member at or below this ratio
 * @param {Use[]} [uses]
 */
export function marginReport(shed, target = 0.7, uses = utilisation(shed)) {
  const d = shed.design;
  const over = [];
  const above = [];
  const far = [];
  for (const u of uses) {
    if (u.ratio > 1) { over.push(u); continue; }
    if (u.ratio > target) { above.push(u); continue; }
    if (u.ratio >= target / 2 && u.governs !== 'none') continue;
    const l = lighter(u, d);
    /** @type {{ use: Use, reason: keyof typeof REASONS, why: string, option?: { label: string, ratio: number, governs: string } }} */
    let item = { use: u, reason: l.reason || 'minimum', why: l.why || 'No lighter option is modelled for this member.' };
    /** @type {any} */
    let firstFail = null;
    for (const p of l.probes) {
      const alt = buildShed({ ...d, ...p.change });
      const row = structuralChecks(alt).rows.find((x) => x.member === u.member);
      if (!row) continue;
      const conn = connectionChecks(alt).ok;
      if (row.ok && conn) {
        const option = { label: p.label, ratio: row.ratio, governs: row.governs };
        item = row.ratio <= target
          ? { use: u, reason: 'oversized', why: `${p.label} would still pass, at ${pct(row.ratio)} (${row.governs}), inside your ${pct(target)} target.`, option }
          : { use: u, reason: 'margin', why: `${p.label} would pass at ${pct(row.ratio)} (${row.governs}), above your ${pct(target)} target.`, option };
        if (row.ratio <= target) break;
      } else if (!firstFail) firstFail = { p, row, conn };
    }
    if (!item.option && firstFail) {
      const { p, row, conn } = firstFail;
      item = !row.ok && /deflection/.test(row.governs)
        ? { use: u, reason: 'stiffness', why: `${p.label} would sag past its limit (${row.governs}, ${pct(row.ratio)}), though it is strong enough.` }
        : !row.ok ? { use: u, reason: 'step', why: `${p.label} would fail ${row.governs} at ${pct(row.ratio)}; sizes come in steps, so the one that passes has room to spare.` }
          : { use: u, reason: 'nailing', why: `${p.label} passes the load check but fails a connection check${conn ? '' : ' (nailing or bearing at the joints)'}.` };
    }
    far.push(item);
  }
  return { target, over, above, far };
}
