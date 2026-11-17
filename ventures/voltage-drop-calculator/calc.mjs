// Voltage drop and wire size engine. Pure: no imports, no clock, no randomness.
//
// Conductor resistance is computed from first principles, not copied from a code
// table: the conductor's cross-section (the AWG geometric series, kcmil, or the
// metric nominal area), the resistivity of annealed copper (100 % IACS) or of
// aluminium conductor grade (61 % IACS) at 20 C, the linear temperature
// coefficient, and a lay factor for stranded conductors. Published tables (NEC
// Chapter 9 Table 8, IEC 60228) run a few percent higher for some sizes; the
// page says so and takes a resistance from the reader's own table instead.

export const MATERIALS = {
  // resistivity at 20 C in ohm metres, temperature coefficient per C at 20 C
  cu: { name: "copper", rho20: 1.7241e-8, alpha: 0.00393 },
  al: { name: "aluminium", rho20: 2.8264e-8, alpha: 0.00403 },
};

// A stranded conductor's wires spiral, so each is a little longer than the
// cable. ASTM B8-type concentric lay adds roughly 2 % to the resistance.
export const STRAND_FACTOR = { stranded: 1.02, solid: 1.0 };

const KCMIL_MM2 = 0.5067074790975;
const FT_PER_M = 1 / 0.3048;

function awgDiameterMm(n) {
  return 0.127 * Math.pow(92, (36 - n) / 39);
}
function awgAreaMm2(n) {
  const d = awgDiameterMm(n);
  return (Math.PI * d * d) / 4;
}

const AWG = [
  ["18", 18], ["16", 16], ["14", 14], ["12", 12], ["10", 10], ["8", 8], ["6", 6], ["4", 4], ["3", 3], ["2", 2], ["1", 1],
  ["1/0", 0], ["2/0", -1], ["3/0", -2], ["4/0", -3],
].map(([id, n]) => ({ id, label: `${id} AWG`, areaMm2: awgAreaMm2(n) }));

const KCMIL = [250, 300, 350, 400, 500, 600, 750, 1000].map((k) => ({ id: String(k), label: `${k} kcmil`, areaMm2: k * KCMIL_MM2 }));

const METRIC = [0.75, 1, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300].map((a) => ({ id: String(a), label: `${a} mm²`, areaMm2: a }));

export const SIZES = { awg: [...AWG, ...KCMIL], mm2: METRIC };

export const VOLTAGE_PRESETS = [
  { id: "12dc", label: "12 V DC (car, RV, boat, small solar)", system: "dc", volts: 12 },
  { id: "24dc", label: "24 V DC", system: "dc", volts: 24 },
  { id: "48dc", label: "48 V DC (battery bank, telecom)", system: "dc", volts: 48 },
  { id: "120", label: "120 V single-phase", system: "ac1", volts: 120 },
  { id: "240", label: "240 V single-phase", system: "ac1", volts: 240 },
  { id: "230", label: "230 V single-phase", system: "ac1", volts: 230 },
  { id: "208", label: "208 V three-phase", system: "ac3", volts: 208 },
  { id: "400", label: "400 V three-phase", system: "ac3", volts: 400 },
  { id: "480", label: "480 V three-phase", system: "ac3", volts: 480 },
];

export const DEFAULTS = {
  system: "dc",
  volts: "12",
  load: "30",
  loadUnit: "A",
  length: "15",
  lengthUnit: "ft",
  material: "cu",
  stranding: "stranded",
  tempC: "75",
  pf: "1",
  reactance: "",
  sets: "1",
  targetPct: "3",
  sizeSystem: "awg",
  size: "",
  minSize: "",
  rOverride: "",
  hours: "",
  price: "",
};

export function sampleInput() {
  return { ...DEFAULTS };
}

function num(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/,/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Resistance in ohms per metre of one conductor at tempC. */
export function resistancePerMetre(areaMm2, material = "cu", tempC = 75, stranding = "stranded") {
  const m = Object.hasOwn(MATERIALS, material) ? MATERIALS[material] : null;
  if (!m) throw new Error(`unknown material ${material}`);
  const k = Object.hasOwn(STRAND_FACTOR, stranding) ? STRAND_FACTOR[stranding] : 1;
  return ((m.rho20 * (1 + m.alpha * (tempC - 20))) / (areaMm2 * 1e-6)) * k;
}

function pick(list, id) {
  return list.find((s) => s.id === String(id).trim()) || null;
}

/**
 * Voltage drop for every conductor size, the smallest size that meets the target,
 * and the result for a chosen size. Lengths are one way (source to load).
 */
export function analyze(input = {}) {
  const x = { ...DEFAULTS, ...input };
  const system = ["dc", "ac1", "ac3"].includes(x.system) ? x.system : null;
  if (!system) return { error: "Choose DC, single-phase AC or three-phase AC." };
  const volts = num(x.volts), load = num(x.load), length = num(x.length);
  if (!(volts > 0)) return { error: "Enter the source voltage, more than 0 V." };
  if (!(load > 0)) return { error: "Enter the load, more than 0." };
  if (!(length > 0)) return { error: "Enter the one-way run length, more than 0." };
  const lengthUnit = x.lengthUnit === "m" ? "m" : "ft";
  const material = Object.hasOwn(MATERIALS, x.material) ? x.material : null;
  if (!material) return { error: "Choose copper or aluminium." };
  const stranding = Object.hasOwn(STRAND_FACTOR, x.stranding) ? x.stranding : "stranded";
  const tempC = num(x.tempC) ?? 75;
  if (Number.isNaN(tempC) || tempC < -40 || tempC > 250) return { error: "Conductor temperature must be between -40 and 250 C." };
  let pf = system === "dc" ? 1 : num(x.pf) ?? 1;
  if (Number.isNaN(pf) || pf <= 0 || pf > 1) return { error: "Power factor must be more than 0 and at most 1." };
  const xPer = system === "dc" ? 0 : num(x.reactance) ?? 0;
  if (Number.isNaN(xPer) || xPer < 0) return { error: "Reactance must be blank or 0 or more." };
  const sets = num(x.sets) ?? 1;
  if (!Number.isInteger(sets) || sets < 1 || sets > 20) return { error: "Parallel sets must be a whole number from 1 to 20." };
  const targetPct = num(x.targetPct) ?? 3;
  if (Number.isNaN(targetPct) || targetPct <= 0 || targetPct >= 50) return { error: "Target drop must be more than 0 and under 50 %." };
  const sizeSystem = x.sizeSystem === "mm2" ? "mm2" : "awg";
  const list = SIZES[sizeSystem];
  const chosen = x.size === "" || x.size === null || x.size === undefined ? null : pick(list, x.size);
  if (x.size && String(x.size).trim() && !chosen) return { error: `Unknown conductor size "${x.size}" for ${sizeSystem === "awg" ? "AWG/kcmil" : "mm²"}.` };
  const minSize = x.minSize && String(x.minSize).trim() ? pick(list, x.minSize) : null;
  if (x.minSize && String(x.minSize).trim() && !minSize) return { error: `Unknown minimum size "${x.minSize}".` };
  const rOverride = num(x.rOverride);
  if (Number.isNaN(rOverride) || (rOverride !== null && rOverride <= 0)) return { error: "A resistance from your table must be more than 0." };
  if (rOverride !== null && !chosen) return { error: "A resistance from your table applies to one size: choose the size too." };
  const hours = num(x.hours), price = num(x.price);
  if (Number.isNaN(hours) || (hours !== null && (hours < 0 || hours > 8784))) return { error: "Hours per year must be between 0 and 8,784." };
  if (Number.isNaN(price) || (price !== null && price < 0)) return { error: "Electricity price must be 0 or more." };

  const loadUnit = x.loadUnit === "W" ? "W" : "A";
  let amps;
  if (loadUnit === "A") amps = load;
  else if (system === "ac3") amps = load / (Math.sqrt(3) * volts * pf);
  else amps = load / (volts * pf);

  // per-length unit used for display and the reactance/override inputs
  const unitM = lengthUnit === "ft" ? 0.3048 : 1; // metres per length unit
  const perUnit = lengthUnit === "ft" ? 1000 * 0.3048 : 1000; // metres in 1000 ft or 1 km
  const lengthM = length * unitM;
  const factor = system === "ac3" ? Math.sqrt(3) : 2;
  const sinT = Math.sqrt(Math.max(0, 1 - pf * pf));
  const xPerM = xPer / perUnit / sets;
  const lossWires = system === "ac3" ? 3 : 2;

  function row(size, rPerMOverride = null) {
    const rWire = rPerMOverride ?? resistancePerMetre(size.areaMm2, material, tempC, stranding);
    const rPerM = rWire / sets;
    const z = rPerM * pf + xPerM * sinT;
    const dropV = factor * amps * lengthM * z;
    const dropPct = (dropV / volts) * 100;
    const lossW = lossWires * amps * amps * rPerM * lengthM;
    const maxLength = (targetPct / 100) * volts / (factor * amps * z) / unitM;
    const maxAmps = (targetPct / 100) * volts / (factor * lengthM * z);
    const lossKwh = hours === null ? null : (lossW * hours) / 1000;
    return {
      id: size.id,
      label: size.label,
      areaMm2: size.areaMm2,
      rPerUnit: rWire * perUnit,
      dropV,
      dropPct,
      loadV: volts - dropV,
      lossW,
      lossPct: (lossW / (lossW + loadPowerW())) * 100,
      maxLength,
      maxAmps,
      meets: dropPct <= targetPct + 1e-9,
      allowed: !minSize || size.areaMm2 >= minSize.areaMm2 - 1e-9,
      lossKwh,
      lossCost: lossKwh === null || price === null ? null : lossKwh * price,
    };
  }
  function loadPowerW() {
    // power delivered with the source voltage and current, for the loss share
    return system === "ac3" ? Math.sqrt(3) * volts * amps * pf : volts * amps * pf;
  }

  const rows = list.map((s) => row(s));
  const recIdx = rows.findIndex((r) => r.meets && r.allowed);
  const recommended = recIdx === -1 ? null : rows[recIdx];
  let chosenRow = null;
  if (chosen) {
    chosenRow = rOverride === null ? rows.find((r) => r.id === chosen.id) : row(chosen, rOverride / perUnit);
    if (rOverride !== null) chosenRow.override = true;
  }

  const findings = [];
  const fmt = (n, d = 2) => Number(n).toFixed(d);
  const lu = lengthUnit;
  if (recommended) {
    findings.push({
      severity: "info",
      title: `Smallest size within ${fmt(targetPct, 1)} %: ${recommended.label}`,
      detail: `${fmt(recommended.dropV)} V drop (${fmt(recommended.dropPct)} %) over ${fmt(length, 0)} ${lu} one way at ${fmt(amps, 1)} A, leaving ${fmt(recommended.loadV)} V at the load.${minSize ? ` Not smaller than ${minSize.label}, the ampacity minimum you entered.` : " Check it also carries the current: voltage drop does not test ampacity."}`,
    });
    if (minSize && recIdx > 0 && rows[recIdx - 1] && rows[recIdx - 1].meets && !rows[recIdx - 1].allowed) {
      findings.push({ severity: "info", title: "Ampacity, not voltage drop, sets the size", detail: `A smaller conductor would meet the drop target; ${minSize.label} is the floor you entered from your ampacity table.` });
    }
  } else {
    findings.push({ severity: "high", title: `No ${sizeSystem === "awg" ? "AWG or kcmil" : "metric"} size in the list meets ${fmt(targetPct, 1)} % with ${sets} set${sets > 1 ? "s" : ""}`, detail: `Even the largest, ${rows[rows.length - 1].label}, drops ${fmt(rows[rows.length - 1].dropPct)} %. Raise the voltage, shorten the run, add parallel sets or accept a higher drop.` });
  }
  if (chosenRow) {
    findings.push({
      severity: chosenRow.meets ? "info" : "high",
      title: `${chosenRow.label}: ${fmt(chosenRow.dropPct)} % drop${chosenRow.meets ? "" : `, over the ${fmt(targetPct, 1)} % target`}`,
      detail: `${fmt(chosenRow.dropV)} V lost, ${fmt(chosenRow.loadV)} V at the load, ${fmt(chosenRow.lossW, 1)} W heating the wire. At this current it reaches ${fmt(chosenRow.maxLength, 0)} ${lu} one way within the target; over this run it carries ${fmt(chosenRow.maxAmps, 1)} A.${chosenRow.override ? " Uses the resistance you entered from your table." : ""}${!chosenRow.allowed ? ` Smaller than ${minSize.label}, your ampacity minimum.` : ""}`,
    });
  }
  if (system === "dc" && volts <= 48 && amps * lengthM > 0 && recommended && recommended.areaMm2 > 50) {
    findings.push({ severity: "medium", title: "Low voltage makes this run expensive", detail: `At ${fmt(volts, 0)} V the same power needs ${fmt(amps, 0)} A. Doubling the system voltage halves the current and quarters the copper needed for the same percentage drop.` });
  }
  if (system !== "dc" && pf < 1 && xPer === 0) {
    findings.push({ severity: "medium", title: "Reactance left at zero", detail: "With a power factor under 1 the conductor's reactance adds to the drop, more for large conductors and wide spacing. Enter a reactance per length from your cable maker or code table to include it." });
  }
  if (loadUnit === "W") {
    findings.push({ severity: "info", title: `Load current ${fmt(amps, 2)} A`, detail: system === "ac3" ? `${fmt(load, 0)} W / (1.732 x ${fmt(volts, 0)} V x ${fmt(pf, 2)}).` : `${fmt(load, 0)} W / (${fmt(volts, 0)} V${system === "dc" ? "" : ` x ${fmt(pf, 2)}`}).` });
  }

  return {
    input: { system, volts, amps, loadUnit, length, lengthUnit, material, stranding, tempC, pf, reactance: xPer, sets, targetPct, sizeSystem, hours, price },
    factor,
    perUnitLabel: lengthUnit === "ft" ? "ohm per 1000 ft" : "ohm per km",
    rows,
    recommended,
    chosen: chosenRow,
    minSize: minSize ? minSize.label : null,
    findings,
  };
}

function csvCell(v) {
  let s = v === null || v === undefined ? "" : String(v);
  // CSV formula injection guard (cells are engine labels and numbers today, but keep it safe).
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function reportCsv(a) {
  const u = a.input.lengthUnit;
  const head = ["size", "area_mm2", `resistance_${a.perUnitLabel.replace(/ /g, "_")}`, "drop_v", "drop_pct", "load_v", "loss_w", `max_length_${u}_at_target`, "max_amps_at_target", "meets_target", "annual_loss_kwh", "annual_loss_cost"];
  const lines = [head.join(",")];
  for (const r of a.rows) {
    lines.push([r.label, r.areaMm2.toFixed(3), r.rPerUnit.toFixed(4), r.dropV.toFixed(3), r.dropPct.toFixed(3), r.loadV.toFixed(3), r.lossW.toFixed(2), r.maxLength.toFixed(1), r.maxAmps.toFixed(2), r.meets ? "yes" : "no", r.lossKwh === null ? "" : r.lossKwh.toFixed(1), r.lossCost === null ? "" : r.lossCost.toFixed(2)].map(csvCell).join(","));
  }
  return lines.join("\n") + "\n";
}
