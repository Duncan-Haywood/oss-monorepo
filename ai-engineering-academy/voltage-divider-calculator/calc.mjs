// Pure calculation logic for the voltage divider calculator. No DOM, no
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

function requirePositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

/**
 * Computes a resistive voltage divider's output, optionally accounting for
 * a load resistance drawing current from the output node (R2 and the load
 * sit in parallel, which pulls Vout below the unloaded value — the classic
 * beginner surprise this tool exists to catch).
 */
export function calculateVoltageDivider({ vin, r1, r2, loadOhms }) {
  requirePositive(vin, "Input voltage");
  requirePositive(r1, "R1");
  requirePositive(r2, "R2");

  const unloadedVout = clean((vin * r2) / (r1 + r2));
  const unloadedCurrentAmps = vin / (r1 + r2);
  const unloadedR1PowerWatts = clean(unloadedCurrentAmps * unloadedCurrentAmps * r1);
  const unloadedR2PowerWatts = clean((unloadedVout * unloadedVout) / r2);

  const result = {
    unloadedVout,
    unloadedCurrentAmps: clean(unloadedCurrentAmps),
    unloadedR1PowerWatts,
    unloadedR2PowerWatts,
    loadedVout: null,
    loadDropPercent: null,
    loadCurrentAmps: null,
    r1PowerWatts: null,
    r2PowerWatts: null,
    loadPowerWatts: null,
  };

  if (loadOhms === undefined || loadOhms === null) {
    return result;
  }

  requirePositive(loadOhms, "Load resistance");
  const effectiveR2 = (r2 * loadOhms) / (r2 + loadOhms);
  const loadedVout = clean((vin * effectiveR2) / (r1 + effectiveR2));
  const totalCurrentAmps = vin / (r1 + effectiveR2);

  result.loadedVout = loadedVout;
  result.loadDropPercent = clean(((unloadedVout - loadedVout) / unloadedVout) * 100);
  result.loadCurrentAmps = clean(loadedVout / loadOhms);
  result.r1PowerWatts = clean(totalCurrentAmps * totalCurrentAmps * r1);
  result.r2PowerWatts = clean((loadedVout * loadedVout) / r2);
  result.loadPowerWatts = clean((loadedVout * loadedVout) / loadOhms);

  return result;
}

/**
 * Sizes a divider to survive a known load, rather than leaving loading to
 * chance: picks R1 and R2 so the divider's own (unloaded) current is
 * `bleederMultiple` times the current the load draws at the target voltage —
 * the standard rule of thumb ("bleeder current") for keeping a passive
 * divider stiff. A bigger multiple means less droop but more wasted power;
 * the two trade off directly, which is why this returns the achieved result
 * (via `calculateVoltageDivider`, not a second approximation) rather than
 * just the resistor values — the residual droop from using a finite
 * multiple, and from snapping to a buyable E24 pair, is the whole point.
 */
export function designDividerForLoad({ vin, targetVout, loadOhms, bleederMultiple = 10 }) {
  requirePositive(vin, "Input voltage");
  requirePositive(targetVout, "Target output voltage");
  requirePositive(loadOhms, "Load resistance");
  requirePositive(bleederMultiple, "Bleeder current multiple");
  if (targetVout >= vin) {
    throw new Error(
      `Target output voltage (${targetVout} V) must be less than the input voltage (${vin} V) — a passive divider can only step voltage down.`,
    );
  }

  // The load current at the target voltage is a starting estimate, not the
  // final answer — the divider will droop below the target by construction,
  // so the real load current ends up a little lower than this. `achieved`
  // below reports what actually happens once R1/R2 are fixed and snapped.
  const loadCurrentAmps = targetVout / loadOhms;
  const bleederCurrentAmps = bleederMultiple * loadCurrentAmps;

  const exactR2 = clean(targetVout / bleederCurrentAmps);
  const exactR1 = clean((vin - targetVout) / bleederCurrentAmps);
  const nearestR1 = nearestStandardResistor(exactR1);
  const nearestR2 = nearestStandardResistor(exactR2);

  const achieved = calculateVoltageDivider({ vin, r1: nearestR1, r2: nearestR2, loadOhms });

  const notes = [];
  if (Math.abs(achieved.loadDropPercent) > 5) {
    notes.push({
      severity: "warning",
      message:
        `Even sized this way, the load still pulls the output ${Math.abs(achieved.loadDropPercent).toFixed(2)}% ` +
        `off target — this load is heavy enough relative to the divider that a passive divider is a poor fit. ` +
        "Raise the bleeder multiple (more divider current, more wasted power, less droop) or use a proper " +
        "regulator or a unity-gain buffer instead.",
    });
  }
  const quiescentWatts = achieved.unloadedR1PowerWatts + achieved.unloadedR2PowerWatts;
  if (quiescentWatts > 0.25) {
    notes.push({
      severity: "warning",
      message:
        `The divider alone dissipates ${(quiescentWatts * 1000).toFixed(1)} mW even before the load, from ` +
        "keeping the bleeder current high enough to resist loading. On a battery-powered design, lower the " +
        "bleeder multiple and accept more droop, or switch to active regulation.",
    });
  }

  return {
    bleederCurrentAmps: clean(bleederCurrentAmps),
    exactR1,
    exactR2,
    nearestR1,
    nearestR2,
    achieved,
    notes,
  };
}

/**
 * Given a supply voltage, a target output voltage, and a preferred R1 (a
 * common starting point when designing a divider — pick R1, solve for R2),
 * returns the exact R2 needed and the nearest standard (E24) R2, plus the
 * actual output voltage that standard value produces.
 */
export function suggestDividerForTarget({ vin, targetVout, r1 }) {
  requirePositive(vin, "Input voltage");
  requirePositive(targetVout, "Target output voltage");
  requirePositive(r1, "R1");
  if (targetVout >= vin) {
    throw new Error(
      `Target output voltage (${targetVout} V) must be less than the input voltage (${vin} V) — a passive divider can only step voltage down.`,
    );
  }

  const exactR2 = clean((r1 * targetVout) / (vin - targetVout));
  const nearestR2 = nearestStandardResistor(exactR2);
  const actualVout = clean((vin * nearestR2) / (r1 + nearestR2));
  const errorPercent = clean(((actualVout - targetVout) / targetVout) * 100);

  return { exactR2, nearestR2, actualVout, errorPercent };
}
