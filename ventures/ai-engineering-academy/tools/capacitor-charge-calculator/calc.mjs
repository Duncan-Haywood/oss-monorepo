// Pure RC charge/discharge calculations. Values use SI units: ohms, farads,
// seconds, and a threshold expressed as a fraction of the supply.

function positive(value, label) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive number.`);
}

export function timeToThreshold({ resistanceOhms, capacitanceFarads, thresholdFraction, mode = "charge" }) {
  positive(resistanceOhms, "Resistance");
  positive(capacitanceFarads, "Capacitance");
  if (!Number.isFinite(thresholdFraction) || thresholdFraction <= 0 || thresholdFraction >= 1) {
    throw new Error("Threshold must be between 0% and 100%.");
  }
  if (mode !== "charge" && mode !== "discharge") throw new Error("Mode must be charge or discharge.");
  const timeConstantSeconds = resistanceOhms * capacitanceFarads;
  const timeSeconds = mode === "charge"
    ? -timeConstantSeconds * Math.log(1 - thresholdFraction)
    : -timeConstantSeconds * Math.log(thresholdFraction);
  return { timeSeconds, timeConstantSeconds, thresholdFraction };
}

export function voltageAtTime({ resistanceOhms, capacitanceFarads, timeSeconds, mode = "charge" }) {
  positive(resistanceOhms, "Resistance");
  positive(capacitanceFarads, "Capacitance");
  if (!Number.isFinite(timeSeconds) || timeSeconds < 0) throw new Error("Time must not be negative.");
  if (mode !== "charge" && mode !== "discharge") throw new Error("Mode must be charge or discharge.");
  const fraction = mode === "charge"
    ? 1 - Math.exp(-timeSeconds / (resistanceOhms * capacitanceFarads))
    : Math.exp(-timeSeconds / (resistanceOhms * capacitanceFarads));
  return { fraction, voltagePercent: fraction * 100, timeConstantSeconds: resistanceOhms * capacitanceFarads };
}

export function componentForTime({ targetTimeSeconds, thresholdFraction, mode = "charge", solveFor, resistanceOhms, capacitanceFarads }) {
  positive(targetTimeSeconds, "Target time");
  const factor = timeToThreshold({ resistanceOhms: 1, capacitanceFarads: 1, thresholdFraction, mode }).timeSeconds;
  if (solveFor === "resistance") {
    positive(capacitanceFarads, "Capacitance");
    return { component: "resistance", exactValue: targetTimeSeconds / (capacitanceFarads * factor) };
  }
  if (solveFor === "capacitance") {
    positive(resistanceOhms, "Resistance");
    return { component: "capacitance", exactValue: targetTimeSeconds / (resistanceOhms * factor) };
  }
  throw new Error("Solve for resistance or capacitance.");
}

export function formatValue(value, units) {
  if (!Number.isFinite(value) || value < 0) return "—";
  for (const [scale, suffix] of units) if (value >= scale) return `${Number((value / scale).toPrecision(4))} ${suffix}`;
  const [scale, suffix] = units[units.length - 1];
  return `${Number((value / scale).toPrecision(4))} ${suffix}`;
}

export const formatTime = (v) => formatValue(v, [[1, "s"], [1e-3, "ms"], [1e-6, "µs"], [1e-9, "ns"]]);
export const formatResistance = (v) => formatValue(v, [[1e6, "MΩ"], [1e3, "kΩ"], [1, "Ω"]]);
export const formatCapacitance = (v) => formatValue(v, [[1, "F"], [1e-3, "mF"], [1e-6, "µF"], [1e-9, "nF"], [1e-12, "pF"]]);
