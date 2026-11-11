// Duct sizing from room airflow, by friction rate, from first principles.
//
// Each run's pressure loss comes from the Darcy-Weisbach equation with the
// Colebrook (1939) friction factor, at the house's elevation. The design
// friction rate is the static pressure the blower has left for the ducts
// (its rated external static pressure minus the coil, filter, register and
// grille losses you type) spread over the longest supply path plus the
// longest return path, both as total effective length (straight feet plus
// the equivalent length of the fittings, which you type: no fitting table is
// built in). Each run then gets the smallest round size from your list that
// carries its airflow at or under that friction rate and under a velocity
// limit. Trunks carry the sum of the rooms they feed, with a rectangular
// equivalent from Huebscher (1948). The difference between what the blower
// has and what a short run uses is what its balancing damper must take up.
//
// Not ACCA Manual D, and none of ACCA's tables or fitting equivalent lengths.
// Estimate only; a qualified designer sizes ducts for a permit.

import { densityRatio } from './load.mjs';

export const IN_WC_PER_PSF = 1 / 5.2023;   // 1 in. of water at 60 °F = 5.2023 lbf/ft²
export const GC = 32.174;                  // lbm·ft / (lbf·s²)
export const MU_AIR = 1.217e-5;            // lbm/(ft·s), dry air at about 70 °F (1.81e-5 Pa·s)
export const RHO_SEA = 0.075;              // lbm/ft³, standard air at sea level
export const ROUGHNESS_FT = Object.freeze({
  // The value usually given for galvanized sheet-metal duct.
  metal: 0.0003,
  // A rough assumption for flex duct pulled tight, about ten times sheet
  // metal. Sagging or compressed flex loses far more: the maker's friction
  // chart wins over this number.
  flex: 0.003,
});
export const ROUND_SIZES_IN = Object.freeze([4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22, 24]);
// Larger stock rounds tried for trunks on top of the branch list.
export const TRUNK_EXTRA_SIZES_IN = Object.freeze([26, 28, 30, 32, 36, 40]);

export const DUCT_DEFAULTS = Object.freeze({
  blowerStaticInWC: 0.5,       // the air handler's rated external static pressure at the design airflow
  // Example losses at the design airflow. Replace with your coil's, filter's
  // and register maker's figures: these are placeholders, not data.
  coilInWC: 0.2, filterInWC: 0.1, supplyRegisterInWC: 0.03, returnGrilleInWC: 0.03, otherInWC: 0,
  material: 'metal', roughnessFt: null,
  branchMaxFpm: 900, trunkMaxFpm: 900, returnMaxFpm: 700,
  rectHeightIn: 8, rectStepIn: 2,
  sizesIn: ROUND_SIZES_IN,
  elevationFt: 0,
});

/** Darcy friction factor from Colebrook, solved by fixed-point iteration from Swamee-Jain. */
export function frictionFactor(re, relRough) {
  if (!(re > 0)) return 0;
  if (re < 2300) return 64 / re;
  let f = 0.25 / Math.log10(relRough / 3.7 + 5.74 / re ** 0.9) ** 2;
  for (let i = 0; i < 50; i++) {
    const next = 1 / (-2 * Math.log10(relRough / 3.7 + 2.51 / (re * Math.sqrt(f)))) ** 2;
    if (Math.abs(next - f) < 1e-12) return next;
    f = next;
  }
  return f;
}

/** Air density (lbm/ft³) at an elevation, from the same standard atmosphere the load uses. */
export const airDensity = elevationFt => RHO_SEA * densityRatio(elevationFt);

/**
 * Friction loss of a round duct, in inches of water per 100 ft, and the velocity in ft/min.
 * @param {number} cfm @param {number} diameterIn @param {{ roughnessFt?: number, elevationFt?: number }} [o]
 */
export function roundFriction(cfm, diameterIn, { roughnessFt = ROUGHNESS_FT.metal, elevationFt = 0 } = {}) {
  const d = diameterIn / 12;
  const area = Math.PI * d * d / 4;
  const v = cfm / 60 / area;                    // ft/s
  const rho = airDensity(elevationFt);
  const re = rho * v * d / MU_AIR;
  const f = frictionFactor(re, roughnessFt / d);
  const psf = f * (100 / d) * rho * v * v / (2 * GC);
  return { inWCPer100: psf * IN_WC_PER_PSF, fpm: v * 60, reynolds: re, f };
}

/** Huebscher's circular equivalent of a rectangular duct, inches. */
export const rectEquivalentIn = (a, b) => 1.30 * (a * b) ** 0.625 / (a + b) ** 0.25;

/** The narrowest width (in steps) at a fixed height whose circular equivalent reaches a diameter. */
export function rectangleFor(diameterIn, heightIn, stepIn) {
  for (let w = stepIn; w <= 120; w += stepIn) if (rectEquivalentIn(w, heightIn) >= diameterIn - 1e-9) return { widthIn: w, heightIn, equivalentIn: rectEquivalentIn(w, heightIn) };
  return null;
}

/** Smallest listed round size meeting a friction rate and a velocity limit. */
export function pickRound(cfm, frictionRate, maxFpm, o) {
  for (const size of o.sizesIn) {
    const r = roundFriction(cfm, size, o);
    if (r.inWCPer100 <= frictionRate + 1e-9 && r.fpm <= maxFpm + 1e-9) {
      const atSmaller = o.sizesIn.filter(s => s < size).at(-1);
      let limit = null;
      if (atSmaller != null) {
        const s = roundFriction(cfm, atSmaller, o);
        limit = s.inWCPer100 > frictionRate + 1e-9 ? 'friction' : 'velocity';
      }
      return { diameterIn: size, ...r, limit };
    }
  }
  return null;
}

const num = (v, name, errs, min, max) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) errs.push(`${name} must be a number`);
  else if (v < min || v > max) errs.push(`${name} must be between ${min} and ${max}`);
};

function settings(d) {
  const o = { ...DUCT_DEFAULTS, ...(d || {}) };
  for (const k of Object.keys(DUCT_DEFAULTS)) if (o[k] == null && DUCT_DEFAULTS[k] != null) o[k] = DUCT_DEFAULTS[k];
  return o;
}

/**
 * Validate a duct design. `runs`: [{ room, cfm, effectiveLengthFt }]; `returns`: same shape
 * (default one central return carrying the total at `returnEffectiveLengthFt`); `trunks`:
 * [{ name, rooms: [room names] }] (default one supply trunk carrying every room).
 */
export function validateDucts(design) {
  const errs = [];
  const o = settings(design);
  num(o.blowerStaticInWC, 'Blower external static pressure', errs, 0.05, 3);
  for (const k of ['coilInWC', 'filterInWC', 'supplyRegisterInWC', 'returnGrilleInWC', 'otherInWC']) num(o[k], k, errs, 0, 2);
  if (o.roughnessFt == null && !Object.hasOwn(ROUGHNESS_FT, o.material)) errs.push(`Duct material must be ${Object.keys(ROUGHNESS_FT).join(' or ')}, or give roughnessFt`);
  if (o.roughnessFt != null) num(o.roughnessFt, 'Roughness', errs, 0, 0.05);
  for (const k of ['branchMaxFpm', 'trunkMaxFpm', 'returnMaxFpm']) num(o[k], k, errs, 200, 3000);
  num(o.rectHeightIn, 'Rectangular trunk height', errs, 4, 30);
  num(o.rectStepIn, 'Rectangular width step', errs, 0.5, 6);
  num(o.elevationFt, 'Elevation', errs, -300, 14000);
  if (!Array.isArray(o.sizesIn) || !o.sizesIn.length || o.sizesIn.some(s => !(s >= 2 && s <= 60))) errs.push('Round sizes must be a list of diameters between 2 and 60 inches');
  const runs = o.runs;
  if (!Array.isArray(runs) || !runs.length) errs.push('Add at least one supply run');
  else runs.forEach((r, i) => {
    const n = `Supply run ${r?.room ? `"${r.room}"` : i + 1}`;
    num(r?.cfm, `${n} airflow`, errs, 0, 5000);
    num(r?.effectiveLengthFt, `${n} total effective length`, errs, 1, 2000);
  });
  if (o.returns != null) {
    if (!Array.isArray(o.returns) || !o.returns.length) errs.push('Returns must be a list of at least one return run');
    else o.returns.forEach((r, i) => { const n = `Return ${r?.name ? `"${r.name}"` : i + 1}`; num(r?.cfm, `${n} airflow`, errs, 0, 10000); num(r?.effectiveLengthFt, `${n} total effective length`, errs, 1, 2000); });
  } else num(o.returnEffectiveLengthFt, 'Return total effective length', errs, 1, 2000);
  if (o.trunks != null && Array.isArray(runs)) {
    const names = new Set(runs.map(r => r?.room));
    if (!Array.isArray(o.trunks)) errs.push('Trunks must be a list');
    else o.trunks.forEach((t, i) => {
      if (!Array.isArray(t?.rooms) || !t.rooms.length) errs.push(`Trunk ${i + 1} must list the rooms it feeds`);
      else for (const r of t.rooms) if (!names.has(r)) errs.push(`Trunk ${t.name || i + 1} feeds "${r}", which has no supply run`);
    });
  }
  return errs;
}

/** Size every run and trunk. Returns { errors } or the full design. */
export function sizeDucts(design) {
  const errors = validateDucts(design);
  if (errors.length) return { errors };
  const o = settings(design);
  const fo = { roughnessFt: o.roughnessFt ?? (Object.hasOwn(ROUGHNESS_FT, o.material) ? ROUGHNESS_FT[o.material] : ROUGHNESS_FT.metal), elevationFt: o.elevationFt, sizesIn: [...o.sizesIn].sort((a, b) => a - b) };
  const totalSupply = o.runs.reduce((a, r) => a + r.cfm, 0);
  const returns = o.returns ?? [{ name: 'Central return', cfm: totalSupply, effectiveLengthFt: o.returnEffectiveLengthFt }];
  const components = o.coilInWC + o.filterInWC + o.supplyRegisterInWC + o.returnGrilleInWC + o.otherInWC;
  const available = o.blowerStaticInWC - components;
  const longestSupply = Math.max(...o.runs.map(r => r.effectiveLengthFt));
  const longestReturn = Math.max(...returns.map(r => r.effectiveLengthFt));
  const tel = longestSupply + longestReturn;
  const frictionRate = available * 100 / tel;
  const warnings = [];
  if (available <= 0) return { errors: [`The coil, filter, register and grille losses (${components.toFixed(2)} in. w.c.) use all of the blower's ${o.blowerStaticInWC} in. w.c.: nothing is left for the ducts. Pick a blower with more static pressure or lower-loss components.`] };
  if (frictionRate < 0.03) warnings.push(`The design friction rate is only ${frictionRate.toFixed(3)} in. w.c. per 100 ft: the ducts come out large. Shorten the longest runs or find more static pressure.`);
  if (frictionRate > 0.18) warnings.push(`The design friction rate is ${frictionRate.toFixed(3)} in. w.c. per 100 ft: velocity limits, not friction, will set most sizes, and the short runs will need their dampers well closed.`);

  const sizeRun = (r, maxFpm, kind) => {
    const pick = pickRound(r.cfm, frictionRate, maxFpm, fo);
    if (!pick) { warnings.push(`${kind} "${r.room ?? r.name}" (${Math.round(r.cfm)} cfm) needs more than the largest listed size, ${fo.sizesIn.at(-1)} in.`); return { ...r, diameterIn: null }; }
    const drop = pick.inWCPer100 * r.effectiveLengthFt / 100;
    return { ...r, diameterIn: pick.diameterIn, fpm: pick.fpm, inWCPer100: pick.inWCPer100, limit: pick.limit, dropInWC: drop };
  };
  const supply = o.runs.map(r => sizeRun(r, o.branchMaxFpm, 'Supply run'));
  const ret = returns.map(r => sizeRun(r, o.returnMaxFpm, 'Return'));
  const worstReturn = Math.max(...ret.map(r => r.dropInWC ?? 0));
  for (const r of supply) if (r.dropInWC != null) {
    r.pathInWC = r.dropInWC + worstReturn;
    r.damperInWC = Math.max(0, available - r.pathInWC);
  }
  // Trunks may go past the branch list: the stock large rounds up to 40 in., plus anything larger the user listed.
  const trunkFo = { ...fo, sizesIn: [...new Set([...fo.sizesIn, ...TRUNK_EXTRA_SIZES_IN])].sort((a, b) => a - b) };
  const trunkLargestIn = trunkFo.sizesIn.at(-1);
  const trunkDefs = o.trunks ?? [{ name: 'Supply trunk', rooms: o.runs.map(r => r.room) }];
  const trunks = trunkDefs.map((t, i) => {
    const cfm = o.runs.filter(r => t.rooms.includes(r.room)).reduce((a, r) => a + r.cfm, 0);
    const pick = pickRound(cfm, frictionRate, o.trunkMaxFpm, trunkFo);
    const name = t.name || `Trunk ${i + 1}`;
    if (!pick) { warnings.push(`Trunk "${name}" (${r0(cfm)} cfm) needs more than a ${trunkLargestIn} in. round.`); return { name, rooms: t.rooms, cfm, diameterIn: null }; }
    return { name, rooms: t.rooms, cfm, diameterIn: pick.diameterIn, fpm: pick.fpm, inWCPer100: pick.inWCPer100, limit: pick.limit, rectangle: rectangleFor(pick.diameterIn, o.rectHeightIn, o.rectStepIn) };
  });
  const returnTrunk = (() => {
    const cfm = ret.reduce((a, r) => a + r.cfm, 0);
    if (ret.length < 2) return null;
    const pick = pickRound(cfm, frictionRate, o.returnMaxFpm, trunkFo);
    if (!pick) { warnings.push(`Return trunk (${r0(cfm)} cfm) needs more than a ${trunkLargestIn} in. round.`); return { name: 'Return trunk', cfm, diameterIn: null }; }
    return { name: 'Return trunk', cfm, diameterIn: pick.diameterIn, fpm: pick.fpm, inWCPer100: pick.inWCPer100, limit: pick.limit, rectangle: rectangleFor(pick.diameterIn, o.rectHeightIn, o.rectStepIn) };
  })();
  const returnCfm = ret.reduce((a, r) => a + r.cfm, 0);
  if (Math.abs(returnCfm - totalSupply) > 0.05 * totalSupply) warnings.push(`Return airflow (${Math.round(returnCfm)} cfm) differs from supply (${Math.round(totalSupply)} cfm) by more than 5%.`);
  for (const r of supply) if (r.cfm > 0 && r.cfm < 15) warnings.push(`"${r.room}" needs only ${Math.round(r.cfm)} cfm: a ${r.diameterIn} in. run will be throttled almost shut, or transfer air from a neighbouring room may do.`);
  return {
    errors: [], warnings,
    pressure: { blowerStaticInWC: o.blowerStaticInWC, componentsInWC: components, availableInWC: available, longestSupplyFt: longestSupply, longestReturnFt: longestReturn, totalEffectiveLengthFt: tel, frictionRate },
    settings: { roughnessFt: fo.roughnessFt, material: o.roughnessFt != null ? 'custom' : o.material, elevationFt: o.elevationFt, airDensity: airDensity(o.elevationFt), branchMaxFpm: o.branchMaxFpm, trunkMaxFpm: o.trunkMaxFpm, returnMaxFpm: o.returnMaxFpm, trunkLargestIn },
    supply, returns: ret, trunks, returnTrunk, totalSupplyCFM: totalSupply, totalReturnCFM: returnCfm,
  };
}

/**
 * Build a duct design from a load result and the house's `ducts` block: each room's
 * design airflow becomes a supply run, its effective length from `ducts.lengths[room]`
 * or `ducts.defaultEffectiveLengthFt`.
 */
export function designFromLoad(loadResult, house) {
  const d = house?.ducts || {};
  const lengths = d.lengths || {};
  const runs = loadResult.rooms.map(r => ({ room: r.name, cfm: r.airflow.design, effectiveLengthFt: (Object.hasOwn(lengths, r.name) ? lengths[r.name] : undefined) ?? d.defaultEffectiveLengthFt }));
  const { lengths: _l, defaultEffectiveLengthFt: _d, ...rest } = d;
  return { elevationFt: house?.site?.elevationFt ?? 0, ...rest, runs };
}

const f2 = x => x.toFixed(2), f3 = x => x.toFixed(3), r0 = x => Math.round(x).toLocaleString('en-US');

/** Plain-text report of a sized design. */
export function ductReport(s) {
  const p = s.pressure, l = [];
  l.push(`Blower ${f2(p.blowerStaticInWC)} in. w.c. - coil, filter, register and grille ${f2(p.componentsInWC)} = ${f2(p.availableInWC)} in. w.c. for the ducts`);
  l.push(`Longest supply ${r0(p.longestSupplyFt)} ft + longest return ${r0(p.longestReturnFt)} ft = ${r0(p.totalEffectiveLengthFt)} ft total effective length`);
  l.push(`Design friction rate: ${f3(p.frictionRate)} in. w.c. per 100 ft (${s.settings.material} duct, roughness ${s.settings.roughnessFt} ft)`);
  l.push('');
  l.push('Supply run         cfm  TEL ft  round  ft/min  in/100ft  set by    damper in. w.c.');
  for (const r of s.supply) l.push(`${String(r.room).padEnd(16).slice(0, 16)}${r0(r.cfm).padStart(6)}${r0(r.effectiveLengthFt).padStart(8)}${(r.diameterIn ? r.diameterIn + '"' : '-').padStart(7)}${(r.fpm ? r0(r.fpm) : '-').padStart(8)}${(r.inWCPer100 != null ? f3(r.inWCPer100) : '-').padStart(10)}  ${(r.limit ?? 'smallest').padEnd(9)}${(r.damperInWC != null ? f3(r.damperInWC) : '-').padStart(8)}`);
  for (const r of s.returns) l.push(`${('R: ' + r.name).padEnd(16).slice(0, 16)}${r0(r.cfm).padStart(6)}${r0(r.effectiveLengthFt).padStart(8)}${(r.diameterIn ? r.diameterIn + '"' : '-').padStart(7)}${(r.fpm ? r0(r.fpm) : '-').padStart(8)}${(r.inWCPer100 != null ? f3(r.inWCPer100) : '-').padStart(10)}  ${(r.limit ?? 'smallest').padEnd(9)}`);
  l.push('');
  for (const t of [...s.trunks, ...(s.returnTrunk ? [s.returnTrunk] : [])]) {
    l.push(`${t.name}: ${r0(t.cfm)} cfm -> ${t.diameterIn ? `${t.diameterIn} in. round` : `over ${s.settings.trunkLargestIn} in.`}${t.rectangle ? ` or ${t.rectangle.widthIn} x ${t.rectangle.heightIn} in. rectangular (equivalent ${t.rectangle.equivalentIn.toFixed(1)} in.)` : ''}${t.fpm ? `, ${r0(t.fpm)} ft/min, ${f3(t.inWCPer100)} in/100 ft` : ''}`);
  }
  for (const w of s.warnings) l.push(`Note: ${w}`);
  l.push('');
  l.push('Estimate only, not engineering advice and not an ACCA Manual D design. Fitting equivalent lengths and component losses are yours; a qualified designer sizes ducts for a permit.');
  return l.join('\n');
}

// Effective lengths for the example ranch (measured run plus fittings, typed):
// an illustration, not a measured house.
export const EXAMPLE_DUCTS = {
  defaultEffectiveLengthFt: 120,
  lengths: { Living: 150, 'Kitchen/dining': 130, 'Primary bedroom': 175, 'Primary bath': 185, 'Bedroom 2': 160, 'Bedroom 3': 140, 'Hall bath': 110, 'Halls/laundry': 90 },
  returnEffectiveLengthFt: 60,
  trunks: [
    { name: 'East trunk', rooms: ['Kitchen/dining', 'Bedroom 2', 'Bedroom 3', 'Hall bath'] },
    { name: 'West trunk', rooms: ['Living', 'Primary bedroom', 'Primary bath', 'Halls/laundry'] },
  ],
};
