// Pure calculation logic for the RC filter calculator. No DOM, no network,
// no state — every function takes its inputs and returns a plain value, so
// it can be unit tested directly and reused unchanged from the browser UI.
//
// A first-order RC filter is one resistor and one capacitor, and its whole
// behaviour follows from a single time constant. The formula everyone
// memorises (fc = 1 / 2*pi*R*C) is the easy part; what this module also
// computes is the part that surprises people who have only seen the
// formula — that the "cutoff" frequency is not where the signal stops, and
// that phase shift is already substantial there. See `filterResponse`.

/** Rounds to `digits` significant figures. Plain decimal rounding is no use
 * here: capacitances are ~1e-9 and frequencies ~1e6, and both need to
 * survive the same helper without being flattened to zero or to an integer. */
function signif(n, digits = 10) {
  if (!Number.isFinite(n) || n === 0) return n;
  const factor = 10 ** (digits - Math.ceil(Math.log10(Math.abs(n))));
  return Math.round(n * factor) / factor;
}

/** Formats an ohms value with the conventional Ω / kΩ / MΩ prefix. */
export function formatResistance(ohms) {
  if (!Number.isFinite(ohms) || ohms < 0) return "—";
  const units = [
    [1e6, "MΩ"],
    [1e3, "kΩ"],
    [1, "Ω"],
  ];
  for (const [scale, suffix] of units) {
    if (ohms >= scale) return `${signif(ohms / scale, 4)} ${suffix}`;
  }
  return `${signif(ohms, 4)} Ω`;
}

/** Formats a capacitance in farads with the prefix a datasheet would use. */
export function formatCapacitance(farads) {
  if (!Number.isFinite(farads) || farads < 0) return "—";
  const units = [
    [1, "F"],
    [1e-3, "mF"],
    [1e-6, "µF"],
    [1e-9, "nF"],
    [1e-12, "pF"],
  ];
  for (const [scale, suffix] of units) {
    if (farads >= scale) return `${signif(farads / scale, 4)} ${suffix}`;
  }
  return `${signif(farads / 1e-12, 4)} pF`;
}

/** Formats a frequency with the conventional Hz / kHz / MHz prefix. */
export function formatFrequency(hz) {
  if (!Number.isFinite(hz) || hz < 0) return "—";
  const units = [
    [1e6, "MHz"],
    [1e3, "kHz"],
    [1, "Hz"],
  ];
  for (const [scale, suffix] of units) {
    if (hz >= scale) return `${signif(hz / scale, 4)} ${suffix}`;
  }
  return `${signif(hz, 4)} Hz`;
}

// The 24 base values of the E24 preferred-number series (IEC 60063) — the
// resistors a hobbyist can actually buy, and the reason a "design for this
// cutoff" answer has to be rounded before it is useful.
export const E24_BASE = [
  1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9,
  4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1,
];

// Capacitors are stocked far more coarsely than resistors, so the realistic
// design move is to pick the capacitor from what is in the drawer and solve
// for the resistor. E6 is what that drawer usually holds.
export const E6_BASE = [1.0, 1.5, 2.2, 3.3, 4.7, 6.8];

function nearestFromSeries(value, series, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number.`);
  }
  const exponent = Math.floor(Math.log10(value));
  let best = null;
  // Check the decade above and below too: the closest E24 value to 9.6 Ω is
  // 10 Ω, which lives in the next decade up (1.0 * 10^1).
  for (const exp of [exponent - 1, exponent, exponent + 1]) {
    const scale = 10 ** exp;
    for (const base of series) {
      const candidate = signif(base * scale);
      const diff = Math.abs(candidate - value);
      if (best === null || diff < best.diff) best = { value: candidate, diff };
    }
  }
  return best.value;
}

/** Finds the closest standard E24 resistor value to an arbitrary resistance. */
export function nearestStandardResistor(ohms) {
  return nearestFromSeries(ohms, E24_BASE, "Resistance");
}

/** Finds the closest standard E6 capacitor value to an arbitrary capacitance. */
export function nearestStandardCapacitor(farads) {
  return nearestFromSeries(farads, E6_BASE, "Capacitance");
}

function requirePositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

/**
 * The -3 dB corner frequency of a first-order RC filter, in hertz.
 * Identical for the low-pass and high-pass arrangement — swapping R and C
 * moves which side the output is taken from, not where the corner sits.
 */
export function cutoffFrequency({ r, c }) {
  requirePositive(r, "Resistance");
  requirePositive(c, "Capacitance");
  return signif(1 / (2 * Math.PI * r * c));
}

/** The RC time constant in seconds — the same number the corner frequency
 * is derived from, and the one that matters if you are thinking about step
 * response (settling to ~63.2% of a step) rather than about frequency. */
export function timeConstant({ r, c }) {
  requirePositive(r, "Resistance");
  requirePositive(c, "Capacitance");
  return signif(r * c);
}

/**
 * Full first-order response at one frequency, for either filter type.
 *
 * The point of returning gain *and* phase together is that the corner
 * frequency is routinely misread as "where the filter stops the signal".
 * It is not: at exactly fc a first-order filter still passes 1/sqrt(2) of
 * the amplitude (-3.01 dB, ~70.7%) and has already shifted the phase by
 * 45 degrees. Both facts fall out of the same complex transfer function:
 *
 *   low-pass   H(f) = 1 / (1 + j f/fc)
 *   high-pass  H(f) = (j f/fc) / (1 + j f/fc)
 *
 * Well past the corner the magnitude settles into 20 dB per decade, which
 * is the other thing a single-pole filter is regularly assumed to beat.
 */
export function filterResponse({ r, c, frequency, type = "low-pass" }) {
  if (type !== "low-pass" && type !== "high-pass") {
    throw new Error('Filter type must be either "low-pass" or "high-pass".');
  }
  const cutoffHz = cutoffFrequency({ r, c });
  if (!Number.isFinite(frequency) || frequency < 0) {
    throw new Error("Frequency must be zero or a positive number.");
  }

  const ratio = frequency / cutoffHz;
  let gainRatio;
  let phaseDegrees;

  if (type === "low-pass") {
    gainRatio = 1 / Math.sqrt(1 + ratio * ratio);
    phaseDegrees = -Math.atan(ratio) * (180 / Math.PI);
  } else {
    // At DC a high-pass passes nothing and leads by a quarter cycle. Taking
    // the limit explicitly avoids 0/0 in the ratio form below.
    if (frequency === 0) {
      gainRatio = 0;
      phaseDegrees = 90;
    } else {
      gainRatio = ratio / Math.sqrt(1 + ratio * ratio);
      phaseDegrees = Math.atan(1 / ratio) * (180 / Math.PI);
    }
  }

  return {
    cutoffHz,
    timeConstantSeconds: timeConstant({ r, c }),
    gainRatio: signif(gainRatio),
    // -Infinity is the honest answer for a high-pass at DC; the UI renders
    // it rather than pretending the attenuation is merely very large.
    gainDb: gainRatio === 0 ? -Infinity : signif(20 * Math.log10(gainRatio)),
    phaseDegrees: signif(phaseDegrees),
    attenuationPercent: signif((1 - gainRatio) * 100),
    // Decades from the corner: negative below, positive above. This is what
    // makes the 20 dB/decade slope checkable by eye against gainDb.
    decadesFromCutoff: frequency === 0 ? -Infinity : signif(Math.log10(ratio)),
  };
}

/**
 * Designs a filter for a target corner frequency: you pick the capacitor
 * (the coarsely-stocked part), this solves for the resistor and then tells
 * you what you actually get once that resistor is rounded to a value you
 * can buy. The rounded corner frequency, not the exact one, is the number
 * the built circuit will have.
 */
export function designForCutoff({ targetHz, c }) {
  requirePositive(targetHz, "Target cutoff frequency");
  requirePositive(c, "Capacitance");

  const exactR = signif(1 / (2 * Math.PI * targetHz * c));
  const nearestR = nearestStandardResistor(exactR);
  const actualHz = cutoffFrequency({ r: nearestR, c });
  const errorPercent = signif(((actualHz - targetHz) / targetHz) * 100);

  return { exactR, nearestR, actualHz, errorPercent };
}
