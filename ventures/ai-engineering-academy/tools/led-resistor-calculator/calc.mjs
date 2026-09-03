// Pure calculation logic for the LED series-resistor calculator. No DOM, no
// network, no state — every function takes its inputs and returns a plain
// value, so it can be unit tested directly and reused unchanged from the
// browser UI.

/** Formats an ohms value with the conventional Ω / kΩ / MΩ prefix. */
export function formatResistance(ohms) {
  if (!Number.isFinite(ohms) || ohms < 0) return "—";
  const units = [
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
  return `${Math.round(ohms * 1000) / 1000} Ω`;
}

// The 24 base values of the E24 preferred-number series (IEC 60063), used
// for both resistance decades and read off as the resistors a hobbyist can
// actually buy.
export const E24_BASE = [
  1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9,
  4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1,
];

/** Rounds to 6 significant decimal places to suppress binary float noise. */
function clean(n) {
  return Math.round(n * 1e6) / 1e6;
}

/** Finds the closest standard E24 resistor value to an arbitrary resistance. */
export function nearestStandardResistor(ohms) {
  if (!Number.isFinite(ohms) || ohms <= 0) {
    throw new Error("Resistance must be a positive finite number.");
  }
  const exponent = Math.floor(Math.log10(ohms));
  let best = null;
  // Check the decade above and below too: the closest E24 value to, say,
  // 9.6 Ω is 10 Ω, which lives in the next decade up (1.0 * 10^1).
  for (const exp of [exponent - 1, exponent, exponent + 1]) {
    const scale = 10 ** exp;
    for (const base of E24_BASE) {
      const candidate = clean(base * scale);
      const diff = Math.abs(candidate - ohms);
      if (best === null || diff < best.diff) best = { value: candidate, diff };
    }
  }
  return best.value;
}

// Common off-the-shelf through-hole resistor power ratings, ascending.
export const STANDARD_POWER_RATINGS_WATTS = [0.0625, 0.125, 0.25, 0.5, 1, 2, 3, 5];

/**
 * Picks the smallest standard power rating that covers the computed
 * dissipation with a safety margin (derating a resistor to roughly half its
 * rated power is standard practice for reliability and longevity).
 * Returns null if the load exceeds common through-hole ratings.
 */
export function recommendedPowerRating(watts, safetyFactor = 2) {
  if (!Number.isFinite(watts) || watts < 0) {
    throw new Error("Power must be a non-negative number.");
  }
  const target = watts * safetyFactor;
  for (const rating of STANDARD_POWER_RATINGS_WATTS) {
    if (rating >= target) return rating;
  }
  return null;
}

/**
 * Computes the current-limiting series resistor for one or more LEDs in
 * series driven from a fixed supply, plus the nearest resistor value you can
 * actually buy and what that does to the current and dissipation.
 */
export function calculateLedResistor({
  supplyVoltage,
  ledForwardVoltage,
  ledForwardCurrentMa,
  numLeds = 1,
}) {
  if (!Number.isFinite(supplyVoltage) || supplyVoltage <= 0) {
    throw new Error("Supply voltage must be a positive number.");
  }
  if (!Number.isFinite(ledForwardVoltage) || ledForwardVoltage <= 0) {
    throw new Error("LED forward voltage must be a positive number.");
  }
  if (!Number.isFinite(ledForwardCurrentMa) || ledForwardCurrentMa <= 0) {
    throw new Error("LED forward current must be a positive number.");
  }
  if (!Number.isInteger(numLeds) || numLeds < 1) {
    throw new Error("Number of LEDs in series must be a positive whole number.");
  }

  const totalLedVoltage = clean(ledForwardVoltage * numLeds);
  if (totalLedVoltage >= supplyVoltage) {
    throw new Error(
      `Supply voltage (${supplyVoltage} V) must exceed the total LED forward voltage ` +
        `(${totalLedVoltage} V for ${numLeds} LED${numLeds > 1 ? "s" : ""} in series) — ` +
        "there is no headroom left for a current-limiting resistor.",
    );
  }

  const currentAmps = ledForwardCurrentMa / 1000;
  const headroomVoltage = supplyVoltage - totalLedVoltage;
  const requiredOhms = clean(headroomVoltage / currentAmps);
  const powerWatts = clean(currentAmps * currentAmps * requiredOhms);

  const nearestStandardOhms = nearestStandardResistor(requiredOhms);
  const currentAtNearestAmps = headroomVoltage / nearestStandardOhms;
  const currentAtNearestMa = clean(currentAtNearestAmps * 1000);
  const powerAtNearestWatts = clean(currentAtNearestAmps * currentAtNearestAmps * nearestStandardOhms);

  return {
    totalLedVoltage,
    requiredOhms,
    formattedRequired: formatResistance(requiredOhms),
    powerWatts,
    recommendedPowerRatingWatts: recommendedPowerRating(powerWatts),
    nearestStandardOhms,
    formattedNearestStandard: formatResistance(nearestStandardOhms),
    currentAtNearestMa,
    powerAtNearestWatts,
    recommendedPowerRatingAtNearestWatts: recommendedPowerRating(powerAtNearestWatts),
  };
}
