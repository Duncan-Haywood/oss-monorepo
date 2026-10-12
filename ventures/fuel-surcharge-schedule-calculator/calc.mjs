// Fuel surcharge (FSC) schedule check. Pure arithmetic over what the user types in: a broker or shipper pays a surcharge when the
// published diesel price rises above a "peg" (base) price. Programs differ in the peg, the miles-per-gallon they assume, the step the
// price is rounded down to, whether deadhead miles are paid, and whether the surcharge is cents per mile or a percent of linehaul.
// This turns each program into dollars on a trip and compares that to the extra fuel the truck actually burned above the peg.

export const TYPES = ["cpm", "pct"];
export const APPLIES = ["loaded", "all"];
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const round3 = (x) => Math.round((x + Number.EPSILON) * 1000) / 1000;
const num = (s) => Number(String(s ?? "").replace(/[$,%\s_]/g, ""));

// One program per line: name, peg $/gal, mpg basis (cpm) or % of linehaul per step (pct), step $/gal, loaded|all, cpm|pct
export function parsePrograms(text) {
  const programs = [];
  const errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const p = line.split(",").map((s) => s.trim());
    const [name, pegRaw, paramRaw, stepRaw, appliesRaw, typeRaw] = p;
    const where = `Program line ${i + 1}`;
    if (!name || pegRaw === undefined || paramRaw === undefined) return errors.push(`${where}: need "name, peg $/gal, mpg basis or % per step, step $/gal, loaded|all, cpm|pct".`);
    const peg = num(pegRaw), param = num(paramRaw), step = stepRaw === undefined || stepRaw === "" ? 0 : num(stepRaw);
    const applies = (appliesRaw || "loaded").toLowerCase(), type = (typeRaw || "cpm").toLowerCase();
    if (![peg, param, step].every(Number.isFinite)) return errors.push(`${where}: use plain numbers.`);
    if (peg <= 0) return errors.push(`${where}: the peg price must be above zero.`);
    if (param <= 0) return errors.push(`${where}: the mpg basis (or percent per step) must be above zero.`);
    if (step < 0) return errors.push(`${where}: the step cannot be negative.`);
    if (!APPLIES.includes(applies)) return errors.push(`${where}: miles must be loaded or all.`);
    if (!TYPES.includes(type)) return errors.push(`${where}: type must be cpm or pct.`);
    if (type === "pct" && step <= 0) return errors.push(`${where}: a percent program needs a step above zero (the price move that earns each percent).`);
    programs.push({ name, peg, param, step, applies, type });
  });
  return { programs, errors };
}

// Price rounded down to whole steps above the peg; a step of 0 means the surcharge follows the price continuously.
export function excessPrice(program, price) {
  const over = price - program.peg;
  if (over <= 0) return { over: 0, steps: 0 };
  if (program.step <= 0) return { over: round3(over), steps: null };
  const steps = Math.floor(over / program.step + 1e-9);
  return { over: round3(steps * program.step), steps };
}

export function surchargeOf(program, trip) {
  const { over, steps } = excessPrice(program, trip.price);
  const paidMiles = program.applies === "all" ? trip.loaded + trip.deadhead : trip.loaded;
  if (program.type === "cpm") {
    const perMile = over / program.param;
    return { perMile: round3(perMile), paidMiles, total: round2(perMile * paidMiles), over, steps };
  }
  const pct = steps * program.param;
  const total = trip.linehaul * pct / 100;
  return { perMile: trip.loaded > 0 ? round3(total / trip.loaded) : 0, paidMiles, total: round2(total), pct, over, steps };
}

export function plan(input) {
  const { programs, errors } = parsePrograms(input.programs);
  if (errors.length) return { error: errors[0], errors };
  if (!programs.length) return { error: "Add at least one program: name, peg, mpg basis, step, loaded|all, cpm|pct." };
  const price = num(input.price), loaded = num(input.loaded), mpg = num(input.mpg);
  const deadhead = input.deadhead === undefined || input.deadhead === "" ? 0 : num(input.deadhead);
  const linehaul = input.linehaul === undefined || input.linehaul === "" ? 0 : num(input.linehaul);
  const pump = input.pump === undefined || input.pump === "" ? price : num(input.pump);
  const perWeek = input.perWeek === undefined || input.perWeek === "" ? 1 : num(input.perWeek);
  if (!(price > 0)) return { error: "Enter the diesel price the program uses (the published weekly average, $/gal)." };
  if (!(loaded > 0)) return { error: "Enter the loaded miles of the trip, above zero." };
  if (!(mpg > 0)) return { error: "Enter your truck's real miles per gallon, above zero." };
  if (![deadhead, linehaul, pump, perWeek].every((x) => Number.isFinite(x) && x >= 0)) return { error: "Deadhead miles, linehaul, pump price and loads per week must be zero or more." };
  if (programs.some((p) => p.type === "pct") && !(linehaul > 0)) return { error: "A percent-of-linehaul program needs the linehaul amount above zero." };

  const trip = { price, loaded, deadhead, linehaul, mpg, pump };
  const allMiles = loaded + deadhead;
  const gallons = allMiles / mpg;
  const fuelCost = round2(gallons * pump);
  // Fuel the linehaul rate already assumes: the same miles at the peg is what a base rate is supposed to cover.
  const rows = programs.map((p) => {
    const s = surchargeOf(p, trip);
    const baseline = round2(gallons * p.peg);
    const extraFuel = round2(gallons * (pump - p.peg));
    const gap = round2(extraFuel - s.total);
    return {
      ...p, ...s, gallons: round2(gallons), fuelCost, baseline, extraFuel, gap,
      recoveredPct: extraFuel > 0 ? round2(s.total / extraFuel * 100) : null,
      breakEvenPerLoadedMile: round3(Math.max(0, extraFuel) / loaded),
      yearly: round2(s.total * perWeek * 52), yearlyGap: round2(gap * perWeek * 52),
    };
  });
  const ranked = [...rows].sort((a, b) => b.total - a.total);
  const best = ranked[0];
  const advice = [`Highest surcharge on this trip: ${best.name}, $${best.total.toFixed(2)} (${best.perMile.toFixed(3)} per loaded mile) at a $${price.toFixed(3)} diesel price.`];
  if (ranked.length > 1) {
    const worst = ranked[ranked.length - 1];
    advice.push(`${worst.name} pays $${round2(best.total - worst.total).toFixed(2)} less per trip than ${best.name}${perWeek > 0 ? `, about $${round2((best.total - worst.total) * perWeek * 52).toFixed(2)} a year at ${perWeek} trip${perWeek === 1 ? "" : "s"} a week` : ""}.`);
  }
  for (const r of rows) {
    if (r.extraFuel > 0 && r.gap > 0.005) advice.push(`${r.name}: the truck burned $${r.extraFuel.toFixed(2)} more than fuel at the peg, the surcharge pays $${r.total.toFixed(2)}, so $${r.gap.toFixed(2)} comes out of linehaul (${r.recoveredPct}% recovered). Surcharge needed to break even: ${r.breakEvenPerLoadedMile.toFixed(3)} per loaded mile.`);
    else if (r.extraFuel > 0) advice.push(`${r.name}: the surcharge covers the extra fuel above the peg (${r.recoveredPct}% recovered).`);
    if (r.type === "cpm" && r.applies === "loaded" && deadhead > 0) advice.push(`${r.name}: pays only loaded miles, so the ${deadhead} deadhead miles (${round2(deadhead / mpg).toFixed(1)} gal) are fuel nobody reimburses; asking for all miles would add $${round2(deadhead * r.perMile).toFixed(2)}.`);
    if (r.type === "cpm" && r.param > mpg + 0.05) advice.push(`${r.name}: assumes ${r.param} mpg but your truck gets ${mpg}; every ${r.over > 0 ? "$" + r.over.toFixed(2) : "dollar"} over the peg is under-recovered by ${round2((1 - mpg / r.param) * 100)}%.`);
    if (r.step > 0 && r.over > 0) {
      const lost = round3(price - r.peg - r.over);
      if (lost > 0.0049) advice.push(`${r.name}: rounds down to ${r.steps} step${r.steps === 1 ? "" : "s"} of $${r.step.toFixed(2)}, ignoring $${lost.toFixed(3)}/gal of the price move.`);
    }
  }
  advice.push("This assumes the program pays on the published price you enter and on the miles you enter. Many contracts use a regional price, a prior-week index, a cap, a minimum or a different mileage source. Read the fuel clause and confirm the figures with the broker or shipper.");
  return { rows, best, advice, trip, allMiles };
}

// What the same trip pays across a range of diesel prices, for one program, so the gap can be seen before the price moves.
export function sensitivity(input, programIndex = 0, deltas = [-0.5, 0, 0.5, 1, 1.5]) {
  const { programs } = parsePrograms(input.programs);
  const p = programs[programIndex];
  if (!p) return [];
  const price = num(input.price), loaded = num(input.loaded), mpg = num(input.mpg);
  const deadhead = input.deadhead === undefined || input.deadhead === "" ? 0 : num(input.deadhead);
  const linehaul = input.linehaul === undefined || input.linehaul === "" ? 0 : num(input.linehaul);
  // Keep the gap between the published price and what you pay at the pump as the price moves.
  const spread = input.pump === undefined || input.pump === "" ? 0 : num(input.pump) - price;
  return deltas.map((d) => {
    const pr = round3(Math.max(0.01, price + d));
    const s = surchargeOf(p, { price: pr, loaded, deadhead, linehaul });
    const extra = round2(((loaded + deadhead) / mpg) * (pr + spread - p.peg));
    return { price: pr, surcharge: s.total, extraFuel: Math.max(0, extra), gap: round2(Math.max(0, extra) - s.total) };
  });
}

export function sampleInput() {
  return {
    price: 4.05, loaded: 640, deadhead: 90, linehaul: 1750, mpg: 6.4, pump: 4.2, perWeek: 3,
    programs: [
      "Broker A (DOE peg), 1.20, 6.0, 0.05, loaded, cpm",
      "Broker B (pays all miles), 1.25, 6.5, 0.06, all, cpm",
      "Shipper C (percent of linehaul), 3.00, 0.5, 0.10, loaded, pct",
    ].join("\n"),
  };
}

export function toCsv(r) {
  const head = "program,type,peg,steps_over,per_loaded_mile,paid_miles,surcharge,extra_fuel_cost,gap,recovered_pct";
  const lines = r.rows.map((x) => [x.name, x.type, x.peg.toFixed(3), x.steps ?? "", x.perMile.toFixed(3), x.paidMiles, x.total.toFixed(2), x.extraFuel.toFixed(2), x.gap.toFixed(2), x.recoveredPct ?? ""].map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(","));
  return [head, ...lines].join("\n") + "\n";
}
