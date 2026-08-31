// Pure calculation logic for the 555 timer calculator. No DOM, no network,
// no state — every function takes its inputs and returns a plain value, so
// it can be unit tested directly and reused unchanged from the browser UI.
//
// The datasheet formulas are only half the job. A 555 design that satisfies
// them can still be unbuildable: a standard astable cannot reach a duty
// cycle of 50% or below, R1 sets the peak current the discharge pin has to
// sink, and a bipolar NE555's timing drifts once the resistors get large
// enough that pin leakage competes with the charging current. The warnings
// this module emits are the part a bare `f = 1.44 / ((R1 + 2·R2)·C)`
// calculator leaves the user to discover on the bench.

const LN2 = Math.LN2; // 0.6931… — the charge/discharge constant of a 555's 1/3–2/3 Vcc window
const LN3 = Math.log(3); // 1.0986… — the monostable's 0 → 2/3 Vcc charge

// The 24 base values of the E24 preferred-number series (IEC 60063) — the
// resistors a hobbyist can actually buy, as opposed to the exact value the
// arithmetic asks for.
export const E24_BASE = [
  1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9,
  4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1,
];

// Practical bounds for a bipolar NE555, from its datasheet's application
// notes rather than from the timing equations, which have no opinion.
export const MIN_R1_OHMS = 1000; // below this the discharge transistor sinks too much current
export const MAX_TIMING_R_OHMS = 1e6; // above this, pin leakage starts to compete with the charging current
export const MAX_DISCHARGE_CURRENT_AMPS = 0.2; // absolute sink limit of the discharge pin

/** Rounds to 9 significant decimal places to suppress binary float noise. */
function clean(n) {
  return Number.parseFloat(n.toPrecision(9));
}

// Display precision is a separate decision from computational precision. The
// resistors this tool recommends are ±5% and a microfarad-scale timing cap can
// be −20%/+80%, so printing "1.02318797 kHz" would claim an accuracy the parts
// cannot deliver. Four significant figures is enough to pick components and
// honest about the rest; the returned numbers stay full precision.
function display(n) {
  return Number.parseFloat(n.toPrecision(4));
}

function requirePositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

/** Finds the closest standard E24 resistor value to an arbitrary resistance. */
export function nearestStandardResistor(ohms) {
  requirePositive(ohms, "Resistance");
  const exponent = Math.floor(Math.log10(ohms));
  let best = null;
  // Check the decade above and below too: the closest E24 value to 9.6 Ω is
  // 10 Ω, which lives in the next decade up (1.0 × 10^1).
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

/** Formats an ohms value with the conventional Ω / kΩ / MΩ prefix. */
export function formatResistance(ohms) {
  if (!Number.isFinite(ohms) || ohms < 0) return "—";
  if (ohms >= 1e6) return `${display(ohms / 1e6)} MΩ`;
  if (ohms >= 1e3) return `${display(ohms / 1e3)} kΩ`;
  return `${display(ohms)} Ω`;
}

/** Formats a capacitance in farads with the prefix an engineer would write. */
export function formatCapacitance(farads) {
  if (!Number.isFinite(farads) || farads <= 0) return "—";
  if (farads >= 1e-3) return `${display(farads * 1e3)} mF`;
  if (farads >= 1e-6) return `${display(farads * 1e6)} µF`;
  if (farads >= 1e-9) return `${display(farads * 1e9)} nF`;
  return `${display(farads * 1e12)} pF`;
}

/** Formats a duration in seconds with a sensible s / ms / µs prefix. */
export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds >= 1) return `${display(seconds)} s`;
  if (seconds >= 1e-3) return `${display(seconds * 1e3)} ms`;
  if (seconds >= 1e-6) return `${display(seconds * 1e6)} µs`;
  return `${display(seconds * 1e9)} ns`;
}

/** Formats a frequency in hertz with a sensible Hz / kHz / MHz prefix. */
export function formatFrequency(hertz) {
  if (!Number.isFinite(hertz) || hertz <= 0) return "—";
  if (hertz >= 1e6) return `${display(hertz / 1e6)} MHz`;
  if (hertz >= 1e3) return `${display(hertz / 1e3)} kHz`;
  return `${display(hertz)} Hz`;
}

/**
 * Collects the buildability problems a set of astable component values has,
 * as {severity, message} objects. Severity "error" means the circuit will
 * misbehave or damage the chip; "warning" means it will run but the timing
 * won't match the arithmetic as closely as the numbers imply.
 */
function astableWarnings({ r1, r2, capacitanceFarads, supplyVolts }) {
  const notes = [];

  if (r1 < MIN_R1_OHMS) {
    notes.push({
      severity: "error",
      message:
        `R1 = ${formatResistance(r1)} is below the ${formatResistance(MIN_R1_OHMS)} practical minimum. ` +
        "During the discharge phase R1 is the only thing limiting current into the discharge pin, " +
        "so a small R1 can exceed the pin's sink rating and cook the chip.",
    });
  }

  const totalTimingR = r1 + r2;
  if (totalTimingR > MAX_TIMING_R_OHMS) {
    notes.push({
      severity: "warning",
      message:
        `R1 + R2 = ${formatResistance(totalTimingR)} exceeds the ${formatResistance(MAX_TIMING_R_OHMS)} ` +
        "rule of thumb for a bipolar NE555. At these values the threshold pin's own leakage current is " +
        "no longer negligible next to the charging current, so the real period drifts from the calculated " +
        "one and with temperature. A CMOS 555 (7555/TLC555) tolerates far higher resistances.",
    });
  }

  if (supplyVolts !== undefined && supplyVolts !== null) {
    // The discharge transistor saturates at roughly 0.1–0.3 V, so at the
    // instant discharge begins it pulls pin 7 to ~0 V. Two currents converge
    // on that pin from there: the full supply across R1 (Vcc to pin 7), and
    // the timing cap's charge — at its peak, 2/3 Vcc — draining back through
    // R2 (pin 7 sits between R1 and R2 in the standard astable topology).
    // An earlier version of this formula charged the cap's 2/3 Vcc through R1
    // instead of the full supply, and dropped the R2 term outright — both
    // errors made small, understating the true pin current and occasionally
    // missing this warning entirely for a component pair that overloads the
    // pin (e.g. R1 = 1 kΩ, R2 = 50 Ω, 15 V: reports 10 mA, actually 215 mA).
    const dischargePeakAmps = supplyVolts / r1 + ((2 / 3) * supplyVolts) / r2;
    if (dischargePeakAmps > MAX_DISCHARGE_CURRENT_AMPS) {
      notes.push({
        severity: "error",
        message:
          `At the instant discharge starts, the discharge pin sinks about ${display(dischargePeakAmps * 1000)} mA ` +
          `from R1 and R2 combined — above its ${MAX_DISCHARGE_CURRENT_AMPS * 1000} mA limit. Raise R1, raise R2, ` +
          "or lower the supply.",
      });
    }
  }

  if (capacitanceFarads >= 1e-6) {
    notes.push({
      severity: "warning",
      message:
        `A timing capacitor of ${formatCapacitance(capacitanceFarads)} is almost certainly an electrolytic, ` +
        "whose tolerance is commonly −20%/+80% and which drifts with age and temperature. Treat the " +
        "frequency below as a target, not a specification, and trim with R2 if it matters.",
    });
  }

  return notes;
}

/**
 * Analyses a standard two-resistor 555 astable (the textbook oscillator):
 * the capacitor charges through R1 + R2 and discharges through R2 alone,
 * which is exactly why its duty cycle can never reach 50%.
 *
 * `supplyVolts` is optional and only used for the discharge-current check.
 */
export function calculateAstable({ r1, r2, capacitanceFarads, supplyVolts }) {
  requirePositive(r1, "R1");
  requirePositive(r2, "R2");
  requirePositive(capacitanceFarads, "Capacitance");
  if (supplyVolts !== undefined && supplyVolts !== null) {
    requirePositive(supplyVolts, "Supply voltage");
  }

  const highSeconds = LN2 * (r1 + r2) * capacitanceFarads;
  const lowSeconds = LN2 * r2 * capacitanceFarads;
  const periodSeconds = highSeconds + lowSeconds;

  return {
    highSeconds: clean(highSeconds),
    lowSeconds: clean(lowSeconds),
    periodSeconds: clean(periodSeconds),
    frequencyHz: clean(1 / periodSeconds),
    dutyCyclePercent: clean((highSeconds / periodSeconds) * 100),
    notes: astableWarnings({ r1, r2, capacitanceFarads, supplyVolts }),
  };
}

/**
 * Solves the astable backwards: given the frequency and duty cycle you want
 * and the capacitor you have, returns the exact R1/R2 and the nearest E24
 * pair you can actually buy, plus what that buyable pair really produces.
 *
 * Derivation, so the constants aren't magic: with
 * K = 1 / (ln2 · f · C) = R1 + 2·R2 and D = (R1 + R2) / (R1 + 2·R2),
 * the two equations collapse to R1 = K·(2D − 1) and R2 = K·(1 − D).
 * R1 → 0 as D → 0.5, which is the algebraic form of "a standard astable
 * can't do 50% or below".
 */
export function designAstable({ frequencyHz, dutyCyclePercent, capacitanceFarads, supplyVolts }) {
  requirePositive(frequencyHz, "Frequency");
  requirePositive(capacitanceFarads, "Capacitance");
  if (!Number.isFinite(dutyCyclePercent)) {
    throw new Error("Duty cycle must be a number.");
  }
  if (dutyCyclePercent <= 50 || dutyCyclePercent >= 100) {
    throw new Error(
      `A standard two-resistor 555 astable can only produce a duty cycle above 50% and below 100% — ` +
        `${clean(dutyCyclePercent)}% is outside that range. The output is high while the capacitor charges ` +
        "through R1 + R2 and low while it discharges through R2 alone, so the high time is always the " +
        "longer of the two. For 50% or less, add a diode across R2 so charging bypasses it, or use a " +
        "CMOS 555 in a 50%-duty configuration.",
    );
  }

  const duty = dutyCyclePercent / 100;
  const k = 1 / (LN2 * frequencyHz * capacitanceFarads);
  const exactR1 = k * (2 * duty - 1);
  const exactR2 = k * (1 - duty);

  const nearestR1 = nearestStandardResistor(exactR1);
  const nearestR2 = nearestStandardResistor(exactR2);
  const achieved = calculateAstable({
    r1: nearestR1,
    r2: nearestR2,
    capacitanceFarads,
    supplyVolts,
  });

  return {
    exactR1: clean(exactR1),
    exactR2: clean(exactR2),
    nearestR1,
    nearestR2,
    achievedFrequencyHz: achieved.frequencyHz,
    achievedDutyCyclePercent: achieved.dutyCyclePercent,
    frequencyErrorPercent: clean(((achieved.frequencyHz - frequencyHz) / frequencyHz) * 100),
    dutyErrorPercent: clean(achieved.dutyCyclePercent - dutyCyclePercent),
    notes: achieved.notes,
  };
}

/**
 * Analyses a 555 monostable (one-shot): a trigger pulse starts a single
 * output pulse of ln(3)·R·C, after which the output returns low regardless
 * of the input.
 */
export function calculateMonostable({ r, capacitanceFarads, supplyVolts }) {
  requirePositive(r, "R");
  requirePositive(capacitanceFarads, "Capacitance");
  if (supplyVolts !== undefined && supplyVolts !== null) {
    requirePositive(supplyVolts, "Supply voltage");
  }

  const notes = [];
  if (r < MIN_R1_OHMS) {
    notes.push({
      severity: "error",
      message:
        `R = ${formatResistance(r)} is below the ${formatResistance(MIN_R1_OHMS)} practical minimum. ` +
        "R also limits the current the discharge pin sinks when the pulse ends.",
    });
  }
  if (r > MAX_TIMING_R_OHMS) {
    notes.push({
      severity: "warning",
      message:
        `R = ${formatResistance(r)} exceeds the ${formatResistance(MAX_TIMING_R_OHMS)} rule of thumb for a ` +
        "bipolar NE555; leakage at the threshold pin makes the real pulse width drift. A CMOS 555 " +
        "(7555/TLC555) handles far higher resistances.",
    });
  }
  if (capacitanceFarads >= 1e-6) {
    notes.push({
      severity: "warning",
      message:
        `A timing capacitor of ${formatCapacitance(capacitanceFarads)} is almost certainly an electrolytic ` +
        "(−20%/+80% is a common tolerance), so the real pulse width will vary noticeably from the number below.",
    });
  }
  notes.push({
    severity: "info",
    message:
      "The trigger pulse must be shorter than the output pulse, and the trigger pin must be held above " +
      "1/3 Vcc between triggers — otherwise the 555 re-triggers and the output never falls.",
  });

  return {
    pulseSeconds: clean(LN3 * r * capacitanceFarads),
    notes,
  };
}

/**
 * Solves the monostable backwards: given the pulse width you want and the
 * capacitor you have, returns the exact R, the nearest E24 R, and the pulse
 * that buyable resistor actually produces.
 */
export function designMonostable({ pulseSeconds, capacitanceFarads, supplyVolts }) {
  requirePositive(pulseSeconds, "Pulse width");
  requirePositive(capacitanceFarads, "Capacitance");

  const exactR = pulseSeconds / (LN3 * capacitanceFarads);
  const nearestR = nearestStandardResistor(exactR);
  const achieved = calculateMonostable({ r: nearestR, capacitanceFarads, supplyVolts });

  return {
    exactR: clean(exactR),
    nearestR,
    achievedPulseSeconds: achieved.pulseSeconds,
    pulseErrorPercent: clean(((achieved.pulseSeconds - pulseSeconds) / pulseSeconds) * 100),
    notes: achieved.notes,
  };
}
