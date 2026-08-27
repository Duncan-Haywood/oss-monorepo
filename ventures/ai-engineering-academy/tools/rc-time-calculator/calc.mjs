// Pure RC charge/discharge timing math. Inputs are SI units.

export const E24_BASE = [1, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2, 2.2, 2.4, 2.7, 3, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];
export const E12_BASE = [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];

function positive(value, label) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive number.`);
}

export function toSignificant(value, sig = 4) {
  if (!Number.isFinite(value) || value === 0) return value;
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  return Math.round(value * 10 ** (sig - 1 - exponent)) / 10 ** (sig - 1 - exponent);
}

export function nearestPreferred(value, series = E24_BASE) {
  positive(value, "Value");
  const exponent = Math.floor(Math.log10(value));
  let best;
  for (const exp of [exponent - 1, exponent, exponent + 1]) {
    for (const base of series) {
      const candidate = base * 10 ** exp;
      const diff = Math.abs(candidate - value);
      if (!best || diff < best.diff) best = { value: candidate, diff };
    }
  }
  return toSignificant(best.value, 6);
}

export function formatWithPrefix(value, units) {
  if (!Number.isFinite(value) || value < 0) return "-";
  if (value === 0) return `0 ${units[units.length - 1][1]}`;
  for (const [scale, suffix] of units) {
    if (value >= scale) return `${toSignificant(value / scale, 4)} ${suffix}`;
  }
  const [scale, suffix] = units[units.length - 1];
  return `${toSignificant(value / scale, 4)} ${suffix}`;
}

export const formatResistance = v => formatWithPrefix(v, [[1e6, "MΩ"], [1e3, "kΩ"], [1, "Ω"]]);
export const formatCapacitance = v => formatWithPrefix(v, [[1, "F"], [1e-3, "mF"], [1e-6, "µF"], [1e-9, "nF"], [1e-12, "pF"]]);
export const formatTime = v => formatWithPrefix(v, [[1, "s"], [1e-3, "ms"], [1e-6, "µs"], [1e-9, "ns"]]);

// `mode` is charge (from 0 toward supply) or discharge (from initial voltage toward 0).
export function timeFromComponents({ mode, resistanceOhms, capacitanceFarads, supplyVolts, initialVolts = supplyVolts, thresholdVolts }) {
  if (!new Set(["charge", "discharge"]).has(mode)) throw new Error("Mode must be charge or discharge.");
  positive(resistanceOhms, "Resistance");
  positive(capacitanceFarads, "Capacitance");
  positive(supplyVolts, "Supply voltage");
  positive(thresholdVolts, "Threshold voltage");
  if (mode === "charge") {
    if (thresholdVolts >= supplyVolts) throw new Error("Charge threshold must be below the supply voltage.");
    if (thresholdVolts <= 0) throw new Error("Charge threshold must be above zero.");
  } else {
    positive(initialVolts, "Initial voltage");
    if (thresholdVolts >= initialVolts) throw new Error("Discharge threshold must be below the initial voltage.");
  }
  const ratio = mode === "charge" ? 1 - thresholdVolts / supplyVolts : thresholdVolts / initialVolts;
  const timeConstantSeconds = resistanceOhms * capacitanceFarads;
  return { timeSeconds: toSignificant(-timeConstantSeconds * Math.log(ratio), 9), timeConstantSeconds: toSignificant(timeConstantSeconds, 9) };
}

export function designForTime({ mode, targetTimeSeconds, solveFor, resistanceOhms, capacitanceFarads, supplyVolts, initialVolts = supplyVolts, thresholdVolts }) {
  positive(targetTimeSeconds, "Target time");
  const probe = timeFromComponents({ mode, resistanceOhms: resistanceOhms || 1, capacitanceFarads: capacitanceFarads || 1, supplyVolts, initialVolts, thresholdVolts });
  const factor = probe.timeSeconds / ((resistanceOhms || 1) * (capacitanceFarads || 1));
  let exactValue;
  let componentLabel;
  if (solveFor === "resistance") {
    positive(capacitanceFarads, "Capacitance");
    exactValue = targetTimeSeconds / (capacitanceFarads * factor);
    componentLabel = "resistance";
  } else if (solveFor === "capacitance") {
    positive(resistanceOhms, "Resistance");
    exactValue = targetTimeSeconds / (resistanceOhms * factor);
    componentLabel = "capacitance";
  } else throw new Error("Solve for must be resistance or capacitance.");
  const snappedValue = nearestPreferred(exactValue, componentLabel === "capacitance" ? E12_BASE : E24_BASE);
  const result = componentLabel === "resistance" ? { resistanceOhms: snappedValue, capacitanceFarads } : { resistanceOhms, capacitanceFarads: snappedValue };
  const achieved = timeFromComponents({ mode, ...result, supplyVolts, initialVolts, thresholdVolts });
  return { componentLabel, exactValue, snappedValue, achievedTimeSeconds: achieved.timeSeconds, errorPercent: (achieved.timeSeconds / targetTimeSeconds - 1) * 100 };
}

/**
 * Capacitor voltage after a given time. The inverse of `timeFromComponents`:
 * that answers "how long to this threshold", this answers "what voltage
 * after this delay" — the question when you already have the part values
 * and a clock edge, not a target trip point.
 */
export function voltageAtTime({ mode, resistanceOhms, capacitanceFarads, supplyVolts, initialVolts = supplyVolts, timeSeconds }) {
  if (!new Set(["charge", "discharge"]).has(mode)) throw new Error("Mode must be charge or discharge.");
  positive(resistanceOhms, "Resistance");
  positive(capacitanceFarads, "Capacitance");
  positive(supplyVolts, "Supply voltage");
  if (!Number.isFinite(timeSeconds) || timeSeconds < 0) throw new Error("Time must not be negative.");
  const timeConstantSeconds = resistanceOhms * capacitanceFarads;
  const ratio = Math.exp(-timeSeconds / timeConstantSeconds);
  if (mode === "charge") {
    const volts = supplyVolts * (1 - ratio);
    return {
      volts: toSignificant(volts, 9),
      fractionOfSupply: toSignificant(volts / supplyVolts, 9),
      timeConstantSeconds: toSignificant(timeConstantSeconds, 9),
    };
  }
  positive(initialVolts, "Initial voltage");
  const volts = initialVolts * ratio;
  return {
    volts: toSignificant(volts, 9),
    fractionOfInitial: toSignificant(volts / initialVolts, 9),
    timeConstantSeconds: toSignificant(timeConstantSeconds, 9),
  };
}
