// Small helpers for the result: which common EV charger setting fits in a
// given number of spare volt-amperes. Pure functions, no I/O.

// Common Level 2 charger settings (amps the charger draws). An EV charger is a
// continuous load, so its circuit is 125% of the setting (NEC 625.41):
// 16 A on 20 A, 24 A on 30 A, 32 A on 40 A, 40 A on 50 A, 48 A on 60 A.
export const CHARGER_SETTINGS = [16, 24, 32, 40, 48];

/** Largest charger setting whose load (amps x volts) fits in spareVa, or 0. */
export function largestCharger(spareVa, volts) {
  let best = 0;
  for (const a of CHARGER_SETTINGS) if (a * volts <= spareVa + 1e-9) best = a;
  return best;
}
