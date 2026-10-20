// Pure logic for "how long until a capacitor is basically fully charged?" —
// the question that comes before anyone has picked a specific trip-point
// voltage. The parent page's "Timing" section already answers "how long to
// reach this threshold", but that requires a threshold, and the question
// people actually type into a search box does not have one yet.
//
// No DOM, no network, no state. Imports voltageAtTime and formatTime from
// calc.mjs rather than restating the exponential-charging formula — see
// CLAUDE.md on the two occasions copying a rule out of a module instead of
// importing it has cost live product.

import { voltageAtTime, formatTime, toSignificant } from "./calc.mjs";

function positive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

// Common multiples of the time constant people actually reach for when
// asking "is it done yet". None of these is "the" right answer — an
// exponential charge has no finish line — so the table states the exact
// percentage each one reaches rather than asserting one of them is correct.
export const SETTLING_MULTIPLES = [1, 2, 3, 4, 5, 6, 7, 10];

/**
 * The percent of the supply reached after each of SETTLING_MULTIPLES time
 * constants, plus the real elapsed time for this circuit's own R and C.
 * Every figure comes from voltageAtTime — the same function the parent
 * page's "voltage after a delay" section uses — evaluated at t = n * RC, so
 * this table cannot drift out of step with the calculator it extends.
 */
export function chargeSettlingTable({ resistanceOhms, capacitanceFarads, supplyVolts }) {
  positive(resistanceOhms, "Resistance");
  positive(capacitanceFarads, "Capacitance");
  positive(supplyVolts, "Supply voltage");
  const tau = resistanceOhms * capacitanceFarads;
  return SETTLING_MULTIPLES.map((multiple) => {
    const timeSeconds = multiple * tau;
    const { volts, fractionOfSupply } = voltageAtTime({
      mode: "charge",
      resistanceOhms,
      capacitanceFarads,
      supplyVolts,
      timeSeconds,
    });
    return {
      multiple,
      timeSeconds,
      formattedTime: formatTime(timeSeconds),
      volts,
      percentOfSupply: toSignificant(fractionOfSupply * 100, 6),
    };
  });
}

/**
 * Inverts the charging equation to answer "how long until I'm at P% of the
 * supply" for any P a person picks, not only the fixed multiples in the
 * table above. Derived directly from V(t) = Vs * (1 - e^(-t/RC)):
 *
 *   P/100 = 1 - e^(-t/RC)   =>   t = -RC * ln(1 - P/100)
 *
 * P must be strictly below 100. An RC charge approaches the supply
 * asymptotically and never mathematically reaches it — the remaining gap
 * only ever halves and halves again — so "100%" has no finite time and is
 * refused rather than silently returning Infinity.
 */
export function timeToReachPercent({ resistanceOhms, capacitanceFarads, percentOfSupply }) {
  positive(resistanceOhms, "Resistance");
  positive(capacitanceFarads, "Capacitance");
  if (!Number.isFinite(percentOfSupply) || percentOfSupply <= 0 || percentOfSupply >= 100) {
    throw new Error(
      "Target percent must be greater than 0 and less than 100 — an RC charge " +
        "never mathematically reaches 100% of the supply, only closer and closer to it.",
    );
  }
  const tau = resistanceOhms * capacitanceFarads;
  const remainingFraction = 1 - percentOfSupply / 100;
  const timeSeconds = -tau * Math.log(remainingFraction);
  return {
    timeSeconds: toSignificant(timeSeconds, 9),
    formattedTime: formatTime(timeSeconds),
    timeConstants: toSignificant(timeSeconds / tau, 6),
  };
}
