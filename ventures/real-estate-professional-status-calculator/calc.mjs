// Does real estate professional status (REPS) turn a rental loss into a deduction against other
// income, and what is that worth? Pure functions, no dependencies, nothing leaves the browser.
// Every default is a placeholder, not advice: replace each with your own hours log and return.
//
// Model: three gates. (1) The hours test: more than 750 hours a year in real property trades or
// businesses AND more than half of all your personal-service hours. (2) Material participation in
// the rentals themselves (the 500-hour test is the one modelled). Pass both and the rental loss is
// not passive. Otherwise it is passive, and only the $25,000 allowance (active participation,
// phased out 50 cents per dollar of MAGI over $100,000) can use it now; the rest is suspended and
// released when the property is sold in a fully taxable sale. The value of REPS is therefore a
// timing gain on suspended losses, which the multi-year table prices with a discount rate.

export const DEFAULTS = {
  reHours: 900,
  otherHours: 400,
  rentalHours: 600,
  magi: 220000,
  activeParticipation: 1,
  year1Loss: 60000,
  annualLoss: 20000,
  yearsHeld: 5,
  marginalRatePct: 35,
  discountPct: 5,
  allowance: 25000,
  phaseoutStart: 100000,
  phaseoutRatePct: 50,
};

export function num(v) {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[$,%\s]/g, ""));
  return String(v ?? "").trim() === "" ? NaN : n;
}

const nz = (x) => (Number.isFinite(x) && x > 0 ? x : 0);

export function money(x) {
  const n = Math.round(x);
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US");
}

// Gate 1. "More than half" is strict, and so is "more than 750".
export function hoursTest(re, other) {
  const r = nz(re);
  const o = nz(other);
  const total = r + o;
  const share = total > 0 ? r / total : 0;
  const needed = Math.max(751, Math.floor(o) + 1);
  return {
    total,
    share,
    over750: r > 750,
    overHalf: r > o,
    pass: r > 750 && r > o,
    hoursShort: Math.max(0, needed - r),
  };
}

// The special allowance for active participants, for one year.
export function allowanceFor(o) {
  if (!(Number(o.activeParticipation) > 0)) return 0;
  const cut = (nz(o.phaseoutRatePct) / 100) * nz(nz(o.magi) - nz(o.phaseoutStart));
  return Math.max(0, nz(o.allowance) - cut);
}

function lossesByYear(o) {
  const n = Math.max(1, Math.floor(nz(o.yearsHeld)));
  return Array.from({ length: n }, (_, i) => (i === 0 ? nz(o.year1Loss) : nz(o.annualLoss)));
}

// Status of the loss, and what it is worth, with and without REPS.
export function analyze(o) {
  const h = hoursTest(o.reHours, o.otherHours);
  const materially = nz(o.rentalHours) >= 500;
  const nonPassive = h.pass && materially;
  const rate = nz(o.marginalRatePct) / 100;
  const disc = nz(o.discountPct) / 100;
  const losses = lossesByYear(o);
  const n = losses.length;
  const allow = allowanceFor(o);

  // Without REPS: allowance each year, the rest suspended until the sale in year n.
  let carry = 0;
  const passiveRows = losses.map((loss, i) => {
    const avail = carry + loss;
    const used = Math.min(avail, allow);
    carry = avail - used;
    return { year: i + 1, loss, deducted: used, suspended: carry };
  });
  const releasedAtSale = carry;
  let pvPassive = 0;
  for (const r of passiveRows) pvPassive += (r.deducted * rate) / (1 + disc) ** r.year;
  pvPassive += (releasedAtSale * rate) / (1 + disc) ** n;

  // With REPS (both gates passed): every dollar is deducted in the year it arises.
  let pvReps = 0;
  losses.forEach((loss, i) => { pvReps += (loss * rate) / (1 + disc) ** (i + 1); });

  const totalLoss = losses.reduce((a, b) => a + b, 0);
  const pvActual = nonPassive ? pvReps : pvPassive;
  return {
    hours: h,
    materially,
    nonPassive,
    allowance: allow,
    firstYear: {
      loss: losses[0],
      deducted: nonPassive ? losses[0] : Math.min(losses[0], allow),
      taxValue: (nonPassive ? losses[0] : Math.min(losses[0], allow)) * rate,
      suspended: nonPassive ? 0 : losses[0] - Math.min(losses[0], allow),
    },
    totalLoss,
    years: n,
    passiveRows,
    releasedAtSale,
    pvPassive,
    pvReps,
    pvActual,
    // What passing both gates is worth over being passive, in today's dollars, whatever your
    // status is now; and the year-1 tax it moves forward (undiscounted).
    pvGainFromReps: pvReps - pvPassive,
    year1Gain: (losses[0] - Math.min(losses[0], allow)) * rate,
  };
}

// Pass/fail across a grid of real-estate hours (rows) and other work hours (columns).
export function hoursGrid(reList = [500, 751, 1000, 1250, 1500, 2000], otherList = [0, 500, 1000, 1500, 2000]) {
  return reList.map((re) => ({ re, cells: otherList.map((other) => ({ other, pass: hoursTest(re, other).pass })) }));
}
