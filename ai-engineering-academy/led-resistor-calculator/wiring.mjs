// Pure logic for "one resistor for all my LEDs, or one each?" — the wiring
// decision that comes immediately after the single-LED resistor value.
//
// No DOM, no network, no state. Same shape as calc.mjs so both can be unit
// tested directly and reused unchanged from the browser.
//
// Why this is a separate module rather than more of calc.mjs: calc.mjs sizes
// one resistor for one branch and is what the live calculator imports. This
// asks a different question — given N LEDs, which of three standard wirings
// should you build — and answers it by calling that same sizing function
// three times. Keeping them apart means this page cannot regress the tool it
// links back to.

import {
  formatResistance,
  nearestStandardResistor,
  recommendedPowerRating,
} from "./calc.mjs";

/** Rounds to 6 significant decimal places to suppress binary float noise. */
function clean(n) {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * The most LEDs of this forward voltage that can sit in one series string on
 * this supply and still leave the resistor something to drop.
 *
 * `minHeadroomVolts` is why this is not simply `floor(supply / vf)`. A string
 * that consumes the entire supply leaves the resistor 0 V, which is not a
 * circuit — the current is then set by nothing but the LEDs' own bulk
 * resistance and the supply's tolerance, which is the failure this whole page
 * is about. A tenth of a volt is not a design margin; it is the smallest
 * headroom at which the arithmetic still describes a real resistor.
 */
export function maxLedsInSeries(supplyVoltage, ledForwardVoltage, minHeadroomVolts = 0.1) {
  if (!Number.isFinite(supplyVoltage) || supplyVoltage <= 0) {
    throw new Error("Supply voltage must be a positive number.");
  }
  if (!Number.isFinite(ledForwardVoltage) || ledForwardVoltage <= 0) {
    throw new Error("LED forward voltage must be a positive number.");
  }
  const usable = supplyVoltage - minHeadroomVolts;
  return Math.max(0, Math.floor(clean(usable / ledForwardVoltage)));
}

/** One wiring option, priced the same way for all three so they compare. */
function describeOption({
  key,
  label,
  resistorCount,
  resistorOhms,
  branchCurrentAmps,
  supplyCurrentAmps,
  supplyVoltage,
  ledPowerWatts,
}) {
  const perResistorWatts = clean(branchCurrentAmps * branchCurrentAmps * resistorOhms);
  const nearest = nearestStandardResistor(resistorOhms);
  const supplyPowerWatts = clean(supplyVoltage * supplyCurrentAmps);
  return {
    key,
    label,
    resistorCount,
    resistorOhms,
    formattedResistor: formatResistance(resistorOhms),
    nearestStandardOhms: nearest,
    formattedNearestStandard: formatResistance(nearest),
    perResistorWatts,
    recommendedPowerRatingWatts: recommendedPowerRating(perResistorWatts),
    supplyCurrentMa: clean(supplyCurrentAmps * 1000),
    supplyPowerWatts,
    ledPowerWatts: clean(ledPowerWatts),
    // Everything the supply delivers that does not end up as light is heat in
    // the resistors. Stated as its own figure because it is the number that
    // decides a battery-powered build.
    wastedPowerWatts: clean(supplyPowerWatts - ledPowerWatts),
    efficiencyPercent:
      supplyPowerWatts > 0 ? clean((ledPowerWatts / supplyPowerWatts) * 100) : 0,
  };
}

/**
 * Compares the three ways people actually wire N LEDs on one supply.
 *
 * 1. **Series string, one resistor.** Every LED carries the same current
 *    because it is literally the same current. Needs the supply to exceed the
 *    combined forward voltage.
 * 2. **Parallel branches, one resistor each.** Always available. Each
 *    branch's current is set by its own resistor, so a forward-voltage
 *    mismatch between LEDs changes brightness slightly and nothing else.
 * 3. **Parallel LEDs sharing one resistor.** One part, and the reason this
 *    page exists — see `sharedResistorRisk` on the returned option.
 */
export function compareLedWiring({
  supplyVoltage,
  ledForwardVoltage,
  ledForwardCurrentMa,
  numLeds,
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
    throw new Error("Number of LEDs must be a positive whole number.");
  }
  if (ledForwardVoltage >= supplyVoltage) {
    throw new Error(
      `Supply voltage (${supplyVoltage} V) must exceed one LED's forward voltage ` +
        `(${ledForwardVoltage} V) — no wiring works without headroom for a resistor.`,
    );
  }

  const branchCurrentAmps = ledForwardCurrentMa / 1000;
  const seriesLimit = maxLedsInSeries(supplyVoltage, ledForwardVoltage);
  const options = [];

  // ---- 1. Series string ---------------------------------------------------
  const totalSeriesVf = clean(ledForwardVoltage * numLeds);
  const seriesAvailable = numLeds <= seriesLimit;
  if (seriesAvailable) {
    const seriesOhms = clean((supplyVoltage - totalSeriesVf) / branchCurrentAmps);
    options.push({
      ...describeOption({
        key: "series",
        label: `All ${numLeds} in series, 1 resistor`,
        resistorCount: 1,
        resistorOhms: seriesOhms,
        branchCurrentAmps,
        // The whole string is one branch: the supply delivers the design
        // current once, not once per LED. This is the entire efficiency
        // argument for series and the reason it is the default answer.
        supplyCurrentAmps: branchCurrentAmps,
        supplyVoltage,
        ledPowerWatts: totalSeriesVf * branchCurrentAmps,
      }),
      available: true,
      totalForwardVoltage: totalSeriesVf,
    });
  } else {
    options.push({
      key: "series",
      label: `All ${numLeds} in series, 1 resistor`,
      available: false,
      totalForwardVoltage: totalSeriesVf,
      unavailableReason:
        `${numLeds} LEDs in series need ${clean(totalSeriesVf)} V before the resistor, ` +
        `which a ${supplyVoltage} V supply cannot provide. This supply fits ` +
        `${seriesLimit} in a string.`,
    });
  }

  // ---- 2. Parallel branches, one resistor each ---------------------------
  const individualOhms = clean((supplyVoltage - ledForwardVoltage) / branchCurrentAmps);
  options.push({
    ...describeOption({
      key: "individual",
      label: `${numLeds} in parallel, ${numLeds} resistor${numLeds > 1 ? "s" : ""}`,
      resistorCount: numLeds,
      resistorOhms: individualOhms,
      branchCurrentAmps,
      supplyCurrentAmps: branchCurrentAmps * numLeds,
      supplyVoltage,
      ledPowerWatts: ledForwardVoltage * branchCurrentAmps * numLeds,
    }),
    available: true,
  });

  // ---- 3. Parallel LEDs sharing one resistor -----------------------------
  //
  // The resistor is sized for the *total* current, which is the only quantity
  // it actually controls. How that total divides between the LEDs is set by
  // their forward-voltage curves, which no resistor in this position can
  // influence: they all sit across the same node.
  const sharedCurrentAmps = branchCurrentAmps * numLeds;
  const sharedOhms = clean((supplyVoltage - ledForwardVoltage) / sharedCurrentAmps);
  const sharedOption = describeOption({
    key: "shared",
    label: `${numLeds} in parallel, 1 shared resistor`,
    resistorCount: 1,
    resistorOhms: sharedOhms,
    branchCurrentAmps: sharedCurrentAmps,
    supplyCurrentAmps: sharedCurrentAmps,
    supplyVoltage,
    ledPowerWatts: ledForwardVoltage * branchCurrentAmps * numLeds,
  });
  options.push({
    ...sharedOption,
    available: true,
    // Deliberately a bound, not a prediction. Predicting the actual split
    // needs each LED's own forward-voltage curve, which is a per-part
    // measurement this page does not have and will not invent. What is
    // certain is the ceiling: the resistor fixes the total, so if the
    // lowest-forward-voltage LED ends up carrying it alone, it carries all
    // of it.
    sharedResistorRisk:
      numLeds > 1
        ? {
            designCurrentMa: clean(ledForwardCurrentMa),
            worstCaseCurrentMa: clean(ledForwardCurrentMa * numLeds),
            worstCaseMultiple: numLeds,
          }
        : null,
  });

  // Series where it fits, individual resistors where it does not. The shared
  // resistor is never recommended: it costs the same power as individual
  // resistors (both drop supply - Vf at the same total current) and buys
  // nothing but a lower part count, in exchange for giving up control of the
  // one quantity an LED's life depends on.
  const recommended = seriesAvailable && numLeds > 1 ? "series" : "individual";

  return {
    supplyVoltage,
    ledForwardVoltage,
    ledForwardCurrentMa,
    numLeds,
    maxLedsInSeries: seriesLimit,
    options,
    recommended,
  };
}

/** One plain sentence naming the choice and why, for the result panel. */
export function wiringNote(result) {
  const { recommended, numLeds, maxLedsInSeries: limit } = result;
  if (numLeds === 1) {
    return "One LED has only one wiring. The resistor value below is the whole answer.";
  }
  const series = result.options.find((o) => o.key === "series");
  const individual = result.options.find((o) => o.key === "individual");
  if (recommended === "series") {
    const saved = clean(individual.wastedPowerWatts - series.wastedPowerWatts);
    return (
      `Wire all ${numLeds} in series with one resistor. Every LED carries the same ` +
      `current because it is the same current, and the string wastes ` +
      `${saved.toFixed(3)} W less heat than ${numLeds} separate resistors.`
    );
  }
  return (
    `A ${numLeds}-LED series string needs more voltage than this supply has ` +
    `(it fits ${limit}). Give each LED its own resistor: one shared resistor ` +
    `costs exactly the same power and gives up control of the current.`
  );
}
