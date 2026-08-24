// Pure calculation logic for the resistor color code and Ohm's law
// calculators. No DOM, no network, no state — every function takes its
// inputs and returns a plain value, so it can be unit tested directly and
// reused unchanged from the browser UI.

export const DIGIT_COLORS = {
  black: 0,
  brown: 1,
  red: 2,
  orange: 3,
  yellow: 4,
  green: 5,
  blue: 6,
  violet: 7,
  grey: 8,
  white: 9,
};

export const MULTIPLIER_COLORS = {
  black: 1,
  brown: 10,
  red: 100,
  orange: 1e3,
  yellow: 1e4,
  green: 1e5,
  blue: 1e6,
  violet: 1e7,
  grey: 1e8,
  white: 1e9,
  gold: 0.1,
  silver: 0.01,
};

export const TOLERANCE_COLORS = {
  brown: 1,
  red: 2,
  green: 0.5,
  blue: 0.25,
  violet: 0.1,
  grey: 0.05,
  gold: 5,
  silver: 10,
  none: 20,
};

export const TEMP_COEFFICIENT_COLORS = {
  brown: 100,
  red: 50,
  orange: 15,
  yellow: 25,
  blue: 10,
  violet: 5,
};

/** Formats an ohms value with the conventional Ω / kΩ / MΩ / GΩ prefix. */
export function formatResistance(ohms) {
  if (!Number.isFinite(ohms) || ohms < 0) return "—";
  const units = [
    [1e9, "GΩ"],
    [1e6, "MΩ"],
    [1e3, "kΩ"],
    [1, "Ω"],
  ];
  for (const [scale, suffix] of units) {
    if (ohms >= scale) {
      const value = ohms / scale;
      const rounded = Math.round(value * 1000) / 1000;
      return `${rounded} ${suffix}`;
    }
  }
  return `${ohms} Ω`;
}

// Guards against binary floating-point noise (e.g. 56 * 0.1 === 5.6000000000000005)
// on the small set of multiplier values resistor color codes actually produce.
function roundOhms(ohms) {
  return Math.round(ohms * 1e9) / 1e9;
}

function digitValue(color, table, label) {
  const v = table[color];
  if (v === undefined) {
    throw new Error(`Unrecognised ${label} band color: "${color}"`);
  }
  return v;
}

/**
 * Decodes a 4-band resistor: two significant digits, a multiplier, and a
 * tolerance band (silver/gold/absent — represented by passing "none").
 */
export function decodeResistor4Band(band1, band2, multiplier, tolerance) {
  const d1 = digitValue(band1, DIGIT_COLORS, "digit");
  const d2 = digitValue(band2, DIGIT_COLORS, "digit");
  const mult = digitValue(multiplier, MULTIPLIER_COLORS, "multiplier");
  const tol = digitValue(tolerance, TOLERANCE_COLORS, "tolerance");
  const ohms = roundOhms((d1 * 10 + d2) * mult);
  return { ohms, tolerancePercent: tol, formatted: formatResistance(ohms) };
}

/**
 * Decodes a 5-band resistor: three significant digits, a multiplier, and a
 * tolerance band. Optionally a 6th temperature-coefficient band.
 */
export function decodeResistor5Band(
  band1,
  band2,
  band3,
  multiplier,
  tolerance,
  tempCoefficient,
) {
  const d1 = digitValue(band1, DIGIT_COLORS, "digit");
  const d2 = digitValue(band2, DIGIT_COLORS, "digit");
  const d3 = digitValue(band3, DIGIT_COLORS, "digit");
  const mult = digitValue(multiplier, MULTIPLIER_COLORS, "multiplier");
  const tol = digitValue(tolerance, TOLERANCE_COLORS, "tolerance");
  const ohms = roundOhms((d1 * 100 + d2 * 10 + d3) * mult);
  const result = { ohms, tolerancePercent: tol, formatted: formatResistance(ohms) };
  if (tempCoefficient) {
    result.ppmPerC = digitValue(tempCoefficient, TEMP_COEFFICIENT_COLORS, "temperature coefficient");
  }
  return result;
}

const OHMS_LAW_VARS = ["v", "i", "r", "p"];

/**
 * Solves Ohm's law (V = IR) and power (P = VI) given exactly two of
 * {v (volts), i (amps), r (ohms), p (watts)}. Returns all four.
 */
export function solveOhmsLaw(known) {
  const provided = OHMS_LAW_VARS.filter(
    (k) => known[k] !== undefined && known[k] !== null && known[k] !== "" && !Number.isNaN(known[k]),
  );
  if (provided.length !== 2) {
    throw new Error("Provide exactly two of voltage, current, resistance, power.");
  }
  const has = (k) => provided.includes(k);
  let { v, i, r, p } = known;
  v = has("v") ? Number(v) : undefined;
  i = has("i") ? Number(i) : undefined;
  r = has("r") ? Number(r) : undefined;
  p = has("p") ? Number(p) : undefined;

  if (has("v") && has("i")) {
    r = v / i;
    p = v * i;
  } else if (has("v") && has("r")) {
    i = v / r;
    p = v * i;
  } else if (has("v") && has("p")) {
    i = p / v;
    r = v / i;
  } else if (has("i") && has("r")) {
    v = i * r;
    p = v * i;
  } else if (has("i") && has("p")) {
    v = p / i;
    r = v / i;
  } else if (has("r") && has("p")) {
    v = Math.sqrt(p * r);
    i = v / r;
  }

  for (const [name, val] of [["voltage", v], ["current", i], ["resistance", r], ["power", p]]) {
    if (!Number.isFinite(val)) {
      throw new Error(`Could not resolve a finite ${name} from the given values (check for a zero divisor).`);
    }
  }

  return { v, i, r, p };
}

/**
 * Calculates the series resistor for a single LED. Inputs use volts and amps.
 * The recommended wattage rounds the calculated dissipation up to the next
 * common quarter-watt step, with a 0.25 W floor.
 */
export function calculateLedResistor({ supplyVoltage, ledForwardVoltage, targetCurrent }) {
  const values = { supplyVoltage, ledForwardVoltage, targetCurrent };
  for (const [name, value] of Object.entries(values)) {
    if (!Number.isFinite(Number(value))) throw new Error(`${name} must be a finite number.`);
  }
  const voltage = Number(supplyVoltage);
  const forward = Number(ledForwardVoltage);
  const current = Number(targetCurrent);
  if (voltage <= 0 || forward < 0 || current <= 0) {
    throw new Error("Supply voltage and current must be positive; LED forward voltage cannot be negative.");
  }
  if (forward >= voltage) throw new Error("LED forward voltage must be lower than supply voltage.");
  const resistance = roundOhms((voltage - forward) / current);
  const power = roundOhms((voltage - forward) * current);
  const recommendedWattage = Math.max(0.25, Math.ceil((power * 2) / 0.25) * 0.25);
  return { resistance, power, recommendedWattage };
}
