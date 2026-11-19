// An IFC measure type for a bSDD Real property, from its unit and dimension.
//
// bSDD's data type for a length, an area or a U-value is just "Real". An IDS
// facet with dataType IFCREAL then fails every model that stores the value
// the way IFC means it to be stored, as an IfcLengthMeasure or an
// IfcThermalTransmittanceMeasure: IDS compares the value's IFC type exactly.
// Each class property also gives its units (bSDD codes such as "mm", and
// QUDT names such as "MilliM"), and often the SI dimension exponents. This
// file turns those into one IFC measure type and the factor that writes a
// bSDD value in SI units, which is how IDS compares a measure (the property's
// value is converted to SI from the model's unit before the comparison, and
// the IDS value is read as SI).
//
// measureOf(p, { units, schema }) returns
//   { type, scale, offset, unit } when one measure type fits (scale/offset
//     null when no single unit says how to write values in SI), or
//   { type: null, why } when none does: no unit and no dimension, a
//     dimensionless unit (percent, ratio: IFC's ratio measures take 0.5 for
//     50 % and the dictionary may mean 50), units of different dimensions, a
//     dimension no IFC measure has, or a unit disagreeing with the
//     property's own stated dimension.
// toSI(value, m) writes one bSDD number in SI ("3000" mm -> "3").
//
// units: schema/bsdd-units.json (schema/gen-bsdd-units.mjs; QUDT CC BY 4.0).

// The IFC measure each SI dimension vector [L, M, T, I, Θ, N, J] names, and
// QUDT quantity kinds that pick another measure of the same dimension (a
// torque and an energy are both kg·m²/s²). QUDT lists several kinds per unit
// (m³: Volume and SectionModulus; Pa: ForcePerArea and ModulusOfElasticity),
// so a kind picks the other measure only when the unit names none of the
// row's general kinds (the fourth entry).
const BY_DIM = [
  [[1, 0, 0, 0, 0, 0, 0], "IFCLENGTHMEASURE"],
  [[2, 0, 0, 0, 0, 0, 0], "IFCAREAMEASURE"],
  [[3, 0, 0, 0, 0, 0, 0], "IFCVOLUMEMEASURE", { SectionModulus: "IFCSECTIONMODULUSMEASURE" }, ["Volume", "LiquidVolume"]],
  [[4, 0, 0, 0, 0, 0, 0], "IFCMOMENTOFINERTIAMEASURE"],
  [[6, 0, 0, 0, 0, 0, 0], "IFCWARPINGCONSTANTMEASURE"],
  [[0, 1, 0, 0, 0, 0, 0], "IFCMASSMEASURE"],
  [[0, 0, 1, 0, 0, 0, 0], "IFCTIMEMEASURE"],
  [[0, 0, 0, 1, 0, 0, 0], "IFCELECTRICCURRENTMEASURE"],
  [[0, 0, 0, 0, 1, 0, 0], "IFCTHERMODYNAMICTEMPERATUREMEASURE"],
  [[0, 0, 0, 0, 0, 1, 0], "IFCAMOUNTOFSUBSTANCEMEASURE"],
  [[0, 0, 0, 0, 0, 0, 1], "IFCLUMINOUSINTENSITYMEASURE", { LuminousFlux: "IFCLUMINOUSFLUXMEASURE" }, ["LuminousIntensity"]],
  [[-2, 0, 0, 0, 0, 0, 1], "IFCILLUMINANCEMEASURE"],
  [[-3, 1, 0, 0, 0, 0, 0], "IFCMASSDENSITYMEASURE"],
  [[-2, 1, 0, 0, 0, 0, 0], "IFCAREADENSITYMEASURE"],
  [[-1, 1, 0, 0, 0, 0, 0], "IFCMASSPERLENGTHMEASURE"],
  [[1, 0, -1, 0, 0, 0, 0], "IFCLINEARVELOCITYMEASURE"],
  [[1, 0, -2, 0, 0, 0, 0], "IFCACCELERATIONMEASURE"],
  [[3, 0, -1, 0, 0, 0, 0], "IFCVOLUMETRICFLOWRATEMEASURE"],
  [[0, 1, -1, 0, 0, 0, 0], "IFCMASSFLOWRATEMEASURE"],
  [[0, 0, -1, 0, 0, 0, 0], "IFCFREQUENCYMEASURE", { AngularVelocity: "IFCANGULARVELOCITYMEASURE" }, ["Frequency"]],
  [[1, 1, -2, 0, 0, 0, 0], "IFCFORCEMEASURE"],
  [[2, 1, -2, 0, 0, 0, 0], "IFCENERGYMEASURE", { Torque: "IFCTORQUEMEASURE", MomentOfForce: "IFCTORQUEMEASURE" }, ["Energy"]],
  [[2, 1, -3, 0, 0, 0, 0], "IFCPOWERMEASURE", { SoundPower: "IFCSOUNDPOWERMEASURE" }, ["Power"]],
  [[-1, 1, -2, 0, 0, 0, 0], "IFCPRESSUREMEASURE", { ModulusOfElasticity: "IFCMODULUSOFELASTICITYMEASURE", ShearModulus: "IFCSHEARMODULUSMEASURE", SoundPressure: "IFCSOUNDPRESSUREMEASURE" }, ["ForcePerArea", "Pressure", "Stress"]],
  [[0, 1, -2, 0, 0, 0, 0], "IFCLINEARFORCEMEASURE"],
  [[0, 1, -3, 0, 0, 0, 0], "IFCHEATFLUXDENSITYMEASURE"],
  [[0, 1, -3, 0, -1, 0, 0], "IFCTHERMALTRANSMITTANCEMEASURE"],
  [[1, 1, -3, 0, -1, 0, 0], "IFCTHERMALCONDUCTIVITYMEASURE"],
  [[0, -1, 3, 0, 1, 0, 0], "IFCTHERMALRESISTANCEMEASURE"],
  [[2, 0, -2, 0, -1, 0, 0], "IFCSPECIFICHEATCAPACITYMEASURE"],
  [[2, 0, -2, 0, 0, 0, 0], "IFCHEATINGVALUEMEASURE", { AbsorbedDose: "IFCABSORBEDDOSEMEASURE", DoseEquivalent: "IFCDOSEEQUIVALENTMEASURE" }, ["SpecificEnergy"]],
  [[0, 0, 0, 0, -1, 0, 0], "IFCTHERMALEXPANSIONCOEFFICIENTMEASURE"],
  [[2, 1, -3, -1, 0, 0, 0], "IFCELECTRICVOLTAGEMEASURE"],
  [[2, 1, -3, -2, 0, 0, 0], "IFCELECTRICRESISTANCEMEASURE"],
  [[-2, -1, 3, 2, 0, 0, 0], "IFCELECTRICCONDUCTANCEMEASURE"],
  [[-2, -1, 4, 2, 0, 0, 0], "IFCELECTRICCAPACITANCEMEASURE"],
  [[0, 0, 1, 1, 0, 0, 0], "IFCELECTRICCHARGEMEASURE"],
  [[2, 1, -2, -2, 0, 0, 0], "IFCINDUCTANCEMEASURE"],
  [[-1, 1, -1, 0, 0, 0, 0], "IFCDYNAMICVISCOSITYMEASURE"],
  [[2, 0, -1, 0, 0, 0, 0], "IFCKINEMATICVISCOSITYMEASURE"],
  [[0, 1, 0, 0, 0, -1, 0], "IFCMOLECULARWEIGHTMEASURE"],
];
// Dimensionless units that still name one measure. Levels in decibels are
// written as they are (QUDT gives them no linear multiplier).
const DIMENSIONLESS = { PlaneAngle: "IFCPLANEANGLEMEASURE", Angle: "IFCPLANEANGLEMEASURE", SolidAngle: "IFCSOLIDANGLEMEASURE", SoundPressureLevel: "IFCSOUNDPRESSURELEVELMEASURE", SoundPowerLevel: "IFCSOUNDPOWERLEVELMEASURE" };
const LEVELS = new Set(["IFCSOUNDPRESSURELEVELMEASURE", "IFCSOUNDPOWERLEVELMEASURE"]);

const key = (d) => d.join(",");
const DIM_INDEX = new Map(BY_DIM.map(([d, t, k, g]) => [key(d), { type: t, kinds: k || {}, general: g || [] }]));
export const MEASURE_TYPES = [...new Set([...BY_DIM.flatMap(([, t, k]) => [t, ...Object.values(k || {})]), ...Object.values(DIMENSIONLESS)])];

const isZero = (d) => d.every((x) => x === 0);

// The measure one unit names: { type, scale, offset } or { type: null, why }.
function unitMeasure(u) {
  if (isZero(u.dim)) {
    // dB is both a sound pressure and a sound power level: no one measure.
    const ts = [...new Set(u.kinds.map((k) => DIMENSIONLESS[k]).filter(Boolean))];
    if (ts.length > 1) return { type: null, why: `dimensionless, and QUDT gives it ${ts.length} kinds (${ts.join(", ")})` };
    const t = ts[0];
    if (!t) return { type: null, why: "dimensionless" };
    return LEVELS.has(t) ? { type: t, scale: 1, offset: 0 } : { type: t, scale: u.m, offset: u.o || 0 };
  }
  const row = DIM_INDEX.get(key(u.dim));
  if (!row) return { type: null, why: `no IFC measure has dimension ${u.dim.join(" ")}` };
  const t = (!u.kinds.some((k) => row.general.includes(k)) && u.kinds.map((k) => row.kinds[k]).find(Boolean)) || row.type;
  return { type: t, scale: u.m, offset: u.o || 0 };
}

// The property's own dimension exponents, when bSDD gives them.
function ownDim(p) {
  const names = ["dimensionLength", "dimensionMass", "dimensionTime", "dimensionElectricCurrent", "dimensionThermodynamicTemperature", "dimensionAmountOfSubstance", "dimensionLuminousIntensity"];
  if (names.every((n) => typeof p[n] === "number")) return names.map((n) => p[n]);
  const m = /^\s*(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s*$/.exec(String(p.dimension || ""));
  return m ? m.slice(1).map(Number) : null;
}

export function unitsOf(p, units) {
  const found = [];
  const unknown = [];
  for (const q of p.qudtCodes || []) if (units.units[q]) found.push({ name: q, ...units.units[q] }); else unknown.push(q);
  if (!found.length) for (const c of p.units || []) {
    const n = units.codes[c] || (units.units[c] ? c : null);
    if (n) found.push({ name: n, code: c, ...units.units[n] }); else unknown.push(c);
  }
  return { found, unknown };
}

export function measureOf(p, { units, schema = null } = {}) {
  const has = (t) => !schema || !!schema.types[t];
  const dim = ownDim(p);
  const { found, unknown } = unitsOf(p, units);
  if (found.length) {
    const ms = found.map(unitMeasure);
    const bad = ms.find((m) => !m.type);
    if (bad) return { type: null, why: `unit ${found[ms.indexOf(bad)].code || found[ms.indexOf(bad)].name}: ${bad.why}` };
    if (new Set(ms.map((m) => m.type)).size > 1) return { type: null, why: `units of different measures (${found.map((u) => u.code || u.name).join(", ")})` };
    if (dim && !isZero(dim) && found.some((u) => key(u.dim) !== key(dim))) return { type: null, why: `unit ${found[0].code || found[0].name} is not of the property's dimension ${dim.join(" ")}` };
    const t = ms[0].type;
    if (!has(t)) return { type: null, why: `${t} is not in the chosen IFC schema` };
    // Several units of one measure (mm and m): the type holds, the scale does not.
    const one = new Set(ms.map((m) => `${m.scale}/${m.offset}`)).size === 1 && !unknown.length;
    return { type: t, scale: one ? ms[0].scale : null, offset: one ? ms[0].offset : null, unit: found.map((u) => u.code || u.name).join(", ") };
  }
  if (dim && !isZero(dim)) {
    const row = DIM_INDEX.get(key(dim));
    if (!row) return { type: null, why: `no IFC measure has dimension ${dim.join(" ")}` };
    const t = (p.physicalQuantity && row.kinds[String(p.physicalQuantity).replace(/\s+/g, "")]) || row.type;
    if (!has(t)) return { type: null, why: `${t} is not in the chosen IFC schema` };
    return { type: t, scale: null, offset: null, unit: unknown.join(", ") || null };
  }
  return { type: null, why: unknown.length ? `unit ${unknown.join(", ")} is not in bSDD's unit list` : "no unit or dimension" };
}

// One bSDD number in SI: value * scale + offset, without float noise
// (3000 mm -> "3", not "3.0000000000000004").
export function toSI(value, m) {
  const x = Number(value);
  if (!Number.isFinite(x) || m.scale === null || m.scale === undefined) return null;
  const y = x * m.scale + (m.offset || 0);
  return String(Number(y.toPrecision(12)));
}
