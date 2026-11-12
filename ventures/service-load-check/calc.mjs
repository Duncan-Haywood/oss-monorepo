// Existing-dwelling service load checks. Pure functions, no I/O.
//
// Two methods the National Electrical Code permits for deciding whether an
// existing service can carry new load:
//
//  * NEC 220.83, the optional calculation for an existing dwelling unit,
//    from an inventory of what is installed plus what is being added.
//  * NEC 220.87, the existing load taken from a year of measured maximum
//    demand (the highest 15-minute average kW), times 125%, plus the new load.
//    The measured side lives in interval.mjs; this file does the arithmetic.
//
// The section numbers and factors follow the 2017, 2020 and 2023 editions,
// which agree on everything used here. Local amendments and the inspector
// (the authority having jurisdiction) decide what applies.

export const FIRST_KVA = 8000; // VA at 100% in 220.83 (A) and (B)
export const REMAINDER = 0.4; // the rest at 40%
export const UNIT_LOAD_VA_PER_FT2 = 3; // general lighting and receptacles, 220.83(A)(1)/(B)(1)
export const SMALL_APPLIANCE_VA = 1500; // each 20 A small-appliance or laundry circuit
export const MEASURED_FACTOR = 1.25; // 220.87(2)

/** Load kinds. Cooling and heating are what switch 220.83 from (A) to (B). */
export const KINDS = {
  other: "Appliance on its own circuit (range, dryer, water heater, EV charger, pump...)",
  cooling: "Air conditioning or heat pump compressor (cooling)",
  heating: "Electric space heat (furnace strips, baseboard, heat pump in heating)",
  heatpump: "Heat pump: counts in both cooling and heating",
  storage: "Electric thermal storage or heat that runs at full nameplate",
};

export const num = (v) => {
  if (v === null || v === undefined || v === "") return NaN;
  const n = Number(String(v).replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

/** Volt-amperes for a load given as VA, or as amps at a voltage. */
export function loadVa(l) {
  const va = num(l.va);
  if (va >= 0) return va;
  const a = num(l.amps), v = num(l.volts);
  if (a >= 0 && v > 0) return a * v;
  return NaN;
}

/** First 8 kVA at 100%, remainder at 40%. */
export function demandOfOther(va) {
  if (!(va > 0)) return 0;
  return Math.min(va, FIRST_KVA) + REMAINDER * Math.max(0, va - FIRST_KVA);
}

/**
 * NEC 220.83 for an existing dwelling.
 * house: { sqft, smallApplianceCircuits, laundryCircuits }
 * loads: [{ name, kind, va | (amps, volts), isNew }]
 * Returns the method used ((A) or (B)), each line, and the calculated VA.
 */
export function calc22083(house, loads) {
  const errors = [];
  const sqft = num(house.sqft);
  if (!(sqft > 0)) errors.push("Enter the dwelling's floor area in square feet (outside dimensions, habitable space).");
  const sa = num(house.smallApplianceCircuits);
  const ld = num(house.laundryCircuits);
  if (!(sa >= 0)) errors.push("Enter the number of 20 A small-appliance circuits (kitchen and dining receptacles; the code requires at least 2).");
  if (!(ld >= 0)) errors.push("Enter the number of laundry circuits (usually 1).");
  const clean = [];
  for (const [i, l] of (loads || []).entries()) {
    const va = loadVa(l);
    const kind = Object.hasOwn(KINDS, l.kind) ? l.kind : "other";
    if (!Number.isFinite(va)) {
      if (String(l.name || "").trim() || l.va || l.amps) errors.push(`Load ${i + 1}${l.name ? ` (${l.name})` : ""}: enter VA, or amps and volts.`);
      continue;
    }
    clean.push({ name: String(l.name || `Load ${i + 1}`), kind, va, isNew: Boolean(l.isNew) });
  }
  if (errors.length) return { ok: false, errors };
  // 220.83 has no storage-heat selection of its own: storage heat is space heat.
  for (const l of clean) if (l.kind === "storage") l.kind = "heating";

  const lighting = sqft * UNIT_LOAD_VA_PER_FT2;
  const circuits = (sa + ld) * SMALL_APPLIANCE_VA;
  const sum = (f) => clean.filter(f).reduce((s, l) => s + l.va, 0);
  const cooling = sum((l) => l.kind === "cooling" || l.kind === "heatpump");
  const heating = sum((l) => l.kind === "heating" || l.kind === "heatpump");
  const fixedOther = sum((l) => l.kind === "other");
  const addsHvac = clean.some((l) => l.isNew && l.kind !== "other");

  let method, hvac = 0, hvacChoice = null, other;
  if (addsHvac) {
    // (B): the larger connected load of air conditioning or space heating,
    // but not both, at 100%; everything else at 8 kVA + 40%.
    method = "B";
    hvac = Math.max(cooling, heating);
    hvacChoice = heating > cooling ? "heating" : "cooling";
    other = lighting + circuits + fixedOther;
  } else {
    // (A): no new air conditioning or space heat, so existing HVAC is part of
    // "all appliances fastened in place" and takes the 8 kVA + 40% like the rest.
    // A heat pump is one appliance here: counted once, not as cooling plus heating.
    method = "A";
    const hpOnce = sum((l) => l.kind === "heatpump");
    other = lighting + circuits + fixedOther + sum((l) => l.kind === "cooling") + sum((l) => l.kind === "heating") + hpOnce;
  }
  const otherDemand = demandOfOther(other);
  const totalVa = hvac + otherDemand;
  return {
    ok: true,
    method,
    lighting,
    circuits,
    cooling,
    heating,
    hvac,
    hvacChoice,
    other,
    otherDemand,
    totalVa,
    loads: clean,
    newVa: clean.filter((l) => l.isNew).reduce((s, l) => s + l.va, 0),
  };
}

/** Amps on a 3-wire dwelling service: 240 V for 120/240, 208 V for 208Y/120. */
export function amps(va, volts) {
  return va / volts;
}

/**
 * How much more nameplate load (non-HVAC, e.g. an EV charger) a 220.83 result
 * leaves room for, before the service rating. Returns VA (may be 0).
 */
export function roomForOther(result, serviceAmps, volts) {
  if (!result?.ok) return NaN;
  const cap = serviceAmps * volts;
  const spare = cap - result.totalVa;
  if (spare <= 0) return 0;
  // Extra "other" VA x: demand rises 1:1 until other reaches 8 kVA, then 0.4:1.
  const below = Math.max(0, FIRST_KVA - result.other);
  if (spare <= below) return spare;
  return below + (spare - below) / REMAINDER;
}

/**
 * NEC 220.87: 125% of the measured maximum demand plus the new load must not
 * exceed the service rating. peakKw is the highest 15-minute average.
 * New load is taken at nameplate (100%), the conservative reading.
 */
export function calc22087(peakKw, newVa, serviceAmps, volts) {
  const existingVa = peakKw * 1000 * MEASURED_FACTOR;
  const totalVa = existingVa + (newVa > 0 ? newVa : 0);
  const cap = serviceAmps * volts;
  return {
    existingVa,
    totalVa,
    totalA: totalVa / volts,
    capVa: cap,
    fits: totalVa <= cap,
    roomVa: Math.max(0, cap - existingVa - (newVa > 0 ? newVa : 0)),
  };
}

/** The verdict for one method, as plain words. */
export function verdict(totalVa, serviceAmps, volts) {
  const a = totalVa / volts;
  const pct = a / serviceAmps;
  return { amps: a, pct, fits: a <= serviceAmps };
}

// NEC 220.82, the optional calculation for a dwelling unit (new or existing)
// served by a 120/240 V or 208Y/120 V 3-wire service of 100 A or more. It
// sizes the whole house, so every load counts, existing and new alike.
export const OPT_FIRST_VA = 10000; // 220.82(B): first 10 kVA at 100%, the rest at 40%
export const SUPPLEMENTAL = 0.65; // 220.82(C)(3) and (C)(4)
export const MANY_UNITS = 0.4; // 220.82(C)(5): four or more separately controlled space-heating units
export const MIN_OPTIONAL_A = 100; // 220.82(A); also 230.79(C) for a one-family dwelling
// Standard overcurrent device ratings from 100 A to 400 A, NEC 240.6(A).
export const SERVICE_RATINGS = [100, 110, 125, 150, 175, 200, 225, 250, 300, 350, 400];

/** First 10 kVA at 100%, remainder at 40%. */
export function demandOfGeneral(va) {
  if (!(va > 0)) return 0;
  return Math.min(va, OPT_FIRST_VA) + REMAINDER * Math.max(0, va - OPT_FIRST_VA);
}

/**
 * NEC 220.82 for a whole dwelling.
 * house: { sqft, smallApplianceCircuits, laundryCircuits, heatingUnits?, lockout? }
 *   heatingUnits: separately controlled space-heating units (blank: one per
 *   "heating" row); lockout: "yes" when the heat pump compressor cannot run
 *   while the supplementary heat is on.
 * loads: as calc22083; isNew is ignored (the whole house counts).
 */
export function calc22082(house, loads, volts = 240) {
  const r = calc22083({ ...house }, (loads || []).map((l) => ({ ...l, isNew: false })));
  if (!r.ok) return r;
  // Take the loads again with their own kinds (calc22083 folds storage into heating).
  const kinds = (loads || []).filter((l) => Number.isFinite(loadVa(l))).map((l) => (Object.hasOwn(KINDS, l.kind) ? l.kind : "other"));
  const items = r.loads.map((l, i) => ({ ...l, kind: kinds[i] }));
  const sum = (k) => items.filter((l) => l.kind === k).reduce((s, l) => s + l.va, 0);
  const general = r.lighting + r.circuits + sum("other");
  const generalDemand = demandOfGeneral(general);
  const ac = sum("cooling"), hp = sum("heatpump"), heat = sum("heating"), storage = sum("storage");
  const rows = items.filter((l) => l.kind === "heating").length;
  const unitsIn = num(house.heatingUnits);
  const units = unitsIn >= 0 ? unitsIn : rows;
  const lockout = String(house.lockout || "").toLowerCase() === "yes";
  const sel = [
    { n: 1, label: "Air conditioning and cooling (heat pumps included) at 100%", va: ac + hp, applies: ac + hp > 0 },
    { n: 2, label: "Heat pump without supplemental electric heat at 100%", va: hp, applies: hp > 0 && heat === 0 },
    { n: 3, label: (lockout ? "Supplemental heat at 65% (compressor locked out while it runs)" : "Heat pump compressor at 100% plus supplemental heat at 65%"), va: (lockout ? 0 : hp) + SUPPLEMENTAL * heat, applies: hp > 0 && heat > 0 },
    { n: 4, label: "Electric space heat at 65% (fewer than four separately controlled units)", va: SUPPLEMENTAL * heat, applies: heat > 0 && units < 4 },
    { n: 5, label: "Electric space heat at 40% (four or more separately controlled units)", va: MANY_UNITS * heat, applies: heat > 0 && units >= 4 },
    { n: 6, label: "Thermal storage or heat continuous at full nameplate, at 100%", va: storage, applies: storage > 0 },
  ];
  let chosen = null;
  for (const s of sel) if (s.applies && (!chosen || s.va > chosen.va)) chosen = s;
  const hvac = chosen ? chosen.va : 0;
  const totalVa = generalDemand + hvac;
  const a = totalVa / volts;
  const notes = [];
  if (heat > 0 && !(unitsIn >= 0)) notes.push(`Counted ${rows} separately controlled heating unit${rows === 1 ? "" : "s"}, one per heating row; enter the number if a row covers several thermostats.`);
  return {
    ok: true,
    method: "220.82",
    lighting: r.lighting,
    circuits: r.circuits,
    general,
    generalDemand,
    selections: sel,
    chosen: chosen ? chosen.n : null,
    hvac,
    totalVa,
    amps: a,
    minService: minServiceRating(a),
    units,
    lockout,
    loads: items,
    notes,
  };
}

/** Smallest standard rating (240.6(A)) of at least 100 A that covers the amps; null above 400 A. */
export function minServiceRating(a) {
  for (const s of SERVICE_RATINGS) if (s >= MIN_OPTIONAL_A && s + 1e-9 >= a) return s;
  return null;
}

export const DEFAULT_HOUSE = { sqft: "", smallApplianceCircuits: "2", laundryCircuits: "1", serviceAmps: "", volts: "240", heatingUnits: "", lockout: "no" };

// Placeholder house for the example button. Invented, not a real home or a
// benchmark: a 2,000 sq ft house on a 100 A service adding a 48 A EV charger.
export const EXAMPLE_HOUSE = { sqft: "2000", smallApplianceCircuits: "2", laundryCircuits: "1", serviceAmps: "100", volts: "240", heatingUnits: "", lockout: "no" };
export const EXAMPLE_LOADS = [
  { name: "Range", kind: "other", va: "12000", isNew: false },
  { name: "Dryer", kind: "other", va: "5000", isNew: false },
  { name: "Water heater", kind: "other", va: "4500", isNew: false },
  { name: "Dishwasher", kind: "other", va: "1200", isNew: false },
  { name: "Central air (3 ton)", kind: "cooling", amps: "20", volts: "240", isNew: false },
  { name: "Gas furnace blower", kind: "other", va: "600", isNew: false },
  { name: "EV charger (48 A)", kind: "other", amps: "48", volts: "240", isNew: true },
];

// Placeholder new house for the 220.82 example. Invented, not a real home:
// 2,400 sq ft, all electric, a heat pump with 10 kW of backup strips and a 48 A EV charger.
export const EXAMPLE_NEW_HOUSE = { sqft: "2400", smallApplianceCircuits: "2", laundryCircuits: "1", serviceAmps: "200", volts: "240", heatingUnits: "", lockout: "no" };
export const EXAMPLE_NEW_LOADS = [
  { name: "Induction range", kind: "other", va: "12000" },
  { name: "Dryer", kind: "other", va: "5000" },
  { name: "Water heater", kind: "other", va: "4500" },
  { name: "Dishwasher", kind: "other", va: "1200" },
  { name: "Disposal", kind: "other", va: "800" },
  { name: "EV charger (48 A)", kind: "other", amps: "48", volts: "240" },
  { name: "Heat pump (MCA 21 A)", kind: "heatpump", amps: "21", volts: "240" },
  { name: "Backup heat strips", kind: "heating", va: "10000" },
];
