// Pure calculation logic for the RC / RL filter cutoff-frequency calculator.
// No DOM, no network, no state — every function takes its inputs and returns
// a plain value, so it can be unit tested directly and reused unchanged from
// the browser UI.
//
// A first-order RC or RL filter has a single -3 dB cutoff frequency where the
// output power falls to half the input:
//
//   RC filter: f_c = 1 / (2·π·R·C),   time constant τ = R·C
//   RL filter: f_c = R / (2·π·L),     time constant τ = L / R
//
// Whether the filter is low-pass or high-pass depends only on where the
// output is taken (across C vs R, or across R vs L) — the cutoff frequency
// and time constant are identical either way, so the topology selection here
// only affects the explanatory labels, not the arithmetic.

/** Rounds a value to `sig` significant figures (for display of derived components). */
export function toSignificant(value, sig = 4) {
  if (!Number.isFinite(value) || value === 0) return value;
  const exponent = Math.floor(Math.log10(Math.abs(value)));
  const factor = 10 ** (sig - 1 - exponent);
  return Math.round(value * factor) / factor;
}

/** Formats a resistance in Ω / kΩ / MΩ. */
export function formatResistance(ohms) {
  return formatWithPrefix(ohms, [
    [1e6, "MΩ"],
    [1e3, "kΩ"],
    [1, "Ω"],
  ]);
}

/** Formats a frequency in Hz / kHz / MHz / GHz. */
export function formatFrequency(hz) {
  return formatWithPrefix(hz, [
    [1e9, "GHz"],
    [1e6, "MHz"],
    [1e3, "kHz"],
    [1, "Hz"],
  ]);
}

/** Formats a capacitance in F / mF / µF / nF / pF. */
export function formatCapacitance(farads) {
  return formatWithPrefix(farads, [
    [1, "F"],
    [1e-3, "mF"],
    [1e-6, "µF"],
    [1e-9, "nF"],
    [1e-12, "pF"],
  ]);
}

/** Formats an inductance in H / mH / µH / nH. */
export function formatInductance(henries) {
  return formatWithPrefix(henries, [
    [1, "H"],
    [1e-3, "mH"],
    [1e-6, "µH"],
    [1e-9, "nH"],
  ]);
}

/** Formats a time (seconds) in s / ms / µs / ns. */
export function formatTime(seconds) {
  return formatWithPrefix(seconds, [
    [1, "s"],
    [1e-3, "ms"],
    [1e-6, "µs"],
    [1e-9, "ns"],
  ]);
}

// Shared prefix formatter: `units` is a descending list of [scale, suffix].
// Picks the largest scale the value meets, prints up to 4 significant figures.
function formatWithPrefix(value, units) {
  if (!Number.isFinite(value) || value < 0) return "—";
  if (value === 0) return `0 ${units[units.length - 1][1]}`;
  for (const [scale, suffix] of units) {
    if (value >= scale) {
      return `${trim(toSignificant(value / scale, 4))} ${suffix}`;
    }
  }
  const [scale, suffix] = units[units.length - 1];
  return `${trim(toSignificant(value / scale, 4))} ${suffix}`;
}

/** Drops trailing zeros from a fixed-precision number for tidy display. */
function trim(n) {
  return Number(n.toFixed(6)).toString();
}

// The 24 base values of the E24 preferred-number series (IEC 60063). Used to
// snap a derived component to a value you can actually buy — the same series
// resistors, and most film capacitors, are sold in.
export const E24_BASE = [
  1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9,
  4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1,
];

// The 12 base values of the E12 series — the decade most through-hole
// hobbyist capacitors are actually stocked in.
export const E12_BASE = [
  1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2,
];

/**
 * Finds the closest preferred-series value to an arbitrary positive value,
 * scanning the decade below, at, and above so a value like 9.6 snaps up to 10
 * (which lives in the next decade). `series` defaults to E24.
 */
export function nearestPreferred(value, series = E24_BASE) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Value must be a positive finite number.");
  }
  const exponent = Math.floor(Math.log10(value));
  let best = null;
  for (const exp of [exponent - 1, exponent, exponent + 1]) {
    const scale = 10 ** exp;
    for (const base of series) {
      const candidate = base * scale;
      const diff = Math.abs(candidate - value);
      if (best === null || diff < best.diff) best = { value: candidate, diff };
    }
  }
  // Clean the float so 2.2e-9 * scale doesn't render as 2.2000000000000003.
  return toSignificant(best.value, 6);
}

const FILTER_TYPES = new Set(["rc-lowpass", "rc-highpass", "rl-lowpass", "rl-highpass"]);

function isRc(type) {
  return type === "rc-lowpass" || type === "rc-highpass";
}

/**
 * Computes the -3 dB cutoff frequency (Hz), time constant (s), and angular
 * cutoff (rad/s) of a first-order filter from its components.
 *
 * For an RC filter pass { type, resistanceOhms, capacitanceFarads }.
 * For an RL filter pass { type, resistanceOhms, inductanceHenries }.
 */
export function cutoffFromComponents({
  type,
  resistanceOhms,
  capacitanceFarads,
  inductanceHenries,
}) {
  if (!FILTER_TYPES.has(type)) {
    throw new Error(`Unknown filter type: ${type}`);
  }
  if (!Number.isFinite(resistanceOhms) || resistanceOhms <= 0) {
    throw new Error("Resistance must be a positive number.");
  }

  let timeConstant;
  if (isRc(type)) {
    if (!Number.isFinite(capacitanceFarads) || capacitanceFarads <= 0) {
      throw new Error("Capacitance must be a positive number.");
    }
    timeConstant = resistanceOhms * capacitanceFarads;
  } else {
    if (!Number.isFinite(inductanceHenries) || inductanceHenries <= 0) {
      throw new Error("Inductance must be a positive number.");
    }
    timeConstant = inductanceHenries / resistanceOhms;
  }

  // Component values span many decades (pF to MΩ, nH to H), so round to
  // significant figures rather than decimal places — clean() would collapse a
  // capacitance-scale time constant like 1e-8 s to zero.
  const angularCutoff = toSignificant(1 / timeConstant, 9);
  const cutoffHz = toSignificant(angularCutoff / (2 * Math.PI), 9);
  return {
    cutoffHz,
    angularCutoffRadPerSec: angularCutoff,
    timeConstantSeconds: toSignificant(timeConstant, 9),
  };
}

/**
 * Design mode: given a target cutoff frequency and one known component,
 * solves for the other component, then snaps it to a buyable preferred value
 * and reports the cutoff that snapped value actually produces.
 *
 * `solveFor` is "capacitance" | "inductance" | "resistance". The component
 * you are NOT solving for must be supplied.
 */
export function designForCutoff({
  type,
  targetCutoffHz,
  solveFor,
  resistanceOhms,
  capacitanceFarads,
  inductanceHenries,
}) {
  if (!FILTER_TYPES.has(type)) {
    throw new Error(`Unknown filter type: ${type}`);
  }
  if (!Number.isFinite(targetCutoffHz) || targetCutoffHz <= 0) {
    throw new Error("Target cutoff frequency must be a positive number.");
  }
  const omega = 2 * Math.PI * targetCutoffHz;

  let exactValue;
  let snappedValue;
  let componentLabel;
  const resolved = {
    resistanceOhms,
    capacitanceFarads,
    inductanceHenries,
  };

  if (isRc(type)) {
    if (solveFor === "capacitance") {
      if (!Number.isFinite(resistanceOhms) || resistanceOhms <= 0) {
        throw new Error("Resistance must be a positive number to solve for capacitance.");
      }
      exactValue = 1 / (omega * resistanceOhms); // farads
      snappedValue = nearestPreferred(exactValue, E12_BASE);
      resolved.capacitanceFarads = snappedValue;
      componentLabel = "capacitance";
    } else if (solveFor === "resistance") {
      if (!Number.isFinite(capacitanceFarads) || capacitanceFarads <= 0) {
        throw new Error("Capacitance must be a positive number to solve for resistance.");
      }
      exactValue = 1 / (omega * capacitanceFarads); // ohms
      snappedValue = nearestPreferred(exactValue, E24_BASE);
      resolved.resistanceOhms = snappedValue;
      componentLabel = "resistance";
    } else {
      throw new Error("For an RC filter, solve for 'capacitance' or 'resistance'.");
    }
  } else {
    if (solveFor === "inductance") {
      if (!Number.isFinite(resistanceOhms) || resistanceOhms <= 0) {
        throw new Error("Resistance must be a positive number to solve for inductance.");
      }
      exactValue = resistanceOhms / omega; // henries
      snappedValue = nearestPreferred(exactValue, E12_BASE);
      resolved.inductanceHenries = snappedValue;
      componentLabel = "inductance";
    } else if (solveFor === "resistance") {
      if (!Number.isFinite(inductanceHenries) || inductanceHenries <= 0) {
        throw new Error("Inductance must be a positive number to solve for resistance.");
      }
      exactValue = omega * inductanceHenries; // ohms
      snappedValue = nearestPreferred(exactValue, E24_BASE);
      resolved.resistanceOhms = snappedValue;
      componentLabel = "resistance";
    } else {
      throw new Error("For an RL filter, solve for 'inductance' or 'resistance'.");
    }
  }

  const achieved = cutoffFromComponents({ type, ...resolved });

  return {
    componentLabel,
    exactValue: toSignificant(exactValue, 9),
    snappedValue,
    achievedCutoffHz: achieved.cutoffHz,
    achievedTimeConstantSeconds: achieved.timeConstantSeconds,
    // Signed percentage error of the snapped-value cutoff vs the target.
    cutoffErrorPercent: toSignificant(((achieved.cutoffHz - targetCutoffHz) / targetCutoffHz) * 100, 6),
    resolved,
  };
}

/**
 * Human-readable description of what a given filter type passes and blocks,
 * plus the standard first-order roll-off. Pure lookup, no arithmetic.
 */
export function describeFilter(type) {
  switch (type) {
    case "rc-lowpass":
      return "Passes frequencies below the cutoff and attenuates those above it at −20 dB/decade (−6 dB/octave). Output taken across the capacitor.";
    case "rc-highpass":
      return "Passes frequencies above the cutoff and attenuates those below it at −20 dB/decade (−6 dB/octave). Output taken across the resistor.";
    case "rl-lowpass":
      return "Passes frequencies below the cutoff and attenuates those above it at −20 dB/decade (−6 dB/octave). Output taken across the resistor.";
    case "rl-highpass":
      return "Passes frequencies above the cutoff and attenuates those below it at −20 dB/decade (−6 dB/octave). Output taken across the inductor.";
    default:
      throw new Error(`Unknown filter type: ${type}`);
  }
}
