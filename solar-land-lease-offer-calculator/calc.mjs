// Solar land-lease math. Pure functions, no I/O. All money in USD, all inputs entered by the user.
// Payments are treated as received at the end of each year; the signing bonus at year 0.

const r2 = (x) => Math.round(x * 100) / 100;
export const money = (x) => (x == null ? "—" : (x < 0 ? "-$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US"));

const DEFAULTS = {
  acres: 160,
  rentPerAcre: 900,      // year-1 operating rent offered, $/acre/yr
  escalatorPct: 2,       // annual rent escalator once operating
  termYears: 35,         // operating term, years
  optionYears: 3,        // development / option period before construction
  optionPerAcre: 30,     // option payment, $/acre/yr
  farmDuringOption: 1,   // 1 = land can still be farmed during the option period
  signingBonusPerAcre: 0,
  altCashRent: 280,      // what the land earns now (cash rent or net farm income), $/acre/yr
  altGrowthPct: 2.5,     // yearly growth of that alternative
  discountPct: 6,        // owner's discount rate
  extraTaxPerAcre: 15,   // extra property tax / assessment the owner carries once operating, $/acre/yr
  rollbackPerAcre: 0,    // one-time ag-use rollback or recapture tax at conversion, $/acre
  acresPerMw: 7,         // acres per MWac of project, to relate rent to project size
  capacityFactorPct: 25,
  powerPricePerMwh: 40,  // what the project sells power for, $/MWh (enter your own)
};

function schedule(v, rent) {
  const total = v.optionYears + v.termYears;
  const rows = [];
  for (let t = 1; t <= total; t++) {
    const alt = v.altCashRent * (1 + v.altGrowthPct / 100) ** (t - 1) * v.acres;
    let lease;
    if (t <= v.optionYears) lease = v.optionPerAcre * v.acres + (v.farmDuringOption ? alt : 0);
    else lease = (rent * (1 + v.escalatorPct / 100) ** (t - v.optionYears - 1) - v.extraTaxPerAcre) * v.acres;
    rows.push({ year: t, lease, alt, discount: (1 + v.discountPct / 100) ** t });
  }
  return rows;
}

function npvs(v, rent, escOverride) {
  const w = escOverride === undefined ? v : { ...v, escalatorPct: escOverride };
  const rows = schedule(w, rent);
  let lease = (w.signingBonusPerAcre - w.rollbackPerAcre) * w.acres, alt = 0;
  for (const r of rows) { lease += r.lease / r.discount; alt += r.alt / r.discount; }
  return { lease, alt, rows };
}

export function analyze(input = {}) {
  const v = { ...DEFAULTS, ...Object.fromEntries(Object.entries(input).filter(([, x]) => x !== undefined && x !== null && x !== "")) };
  for (const k of Object.keys(DEFAULTS)) v[k] = Number(v[k]);
  if (!(v.acres > 0)) return { error: "Enter the acres." };
  if (!(v.rentPerAcre >= 0)) return { error: "Rent cannot be negative." };
  if (!(v.termYears >= 1 && v.termYears <= 99)) return { error: "Operating term must be 1 to 99 years." };
  if (!(v.optionYears >= 0 && v.optionYears <= 20)) return { error: "Option period must be 0 to 20 years." };
  if (!(v.discountPct >= 0 && v.discountPct <= 50)) return { error: "Discount rate must be 0 to 50 percent." };
  if (!(v.escalatorPct > -10 && v.escalatorPct <= 20)) return { error: "Escalator must be between -10 and 20 percent." };
  if (!(v.altGrowthPct > -10 && v.altGrowthPct <= 20)) return { error: "Alternative growth must be between -10 and 20 percent." };
  if (!(v.acresPerMw > 0)) return { error: "Acres per MWac must be above 0." };
  if (!(v.capacityFactorPct > 0 && v.capacityFactorPct <= 100)) return { error: "Capacity factor must be above 0 and at most 100 percent." };
  for (const k of ["optionPerAcre", "signingBonusPerAcre", "altCashRent", "extraTaxPerAcre", "rollbackPerAcre", "powerPricePerMwh"])
    if (!(v[k] >= 0)) return { error: `${k} cannot be negative.` };

  const { lease, alt, rows } = npvs(v, v.rentPerAcre);
  const nominalLease = (v.signingBonusPerAcre - v.rollbackPerAcre) * v.acres + rows.reduce((s, r) => s + r.lease, 0);
  const nominalAlt = rows.reduce((s, r) => s + r.alt, 0);
  const npvGain = lease - alt;

  // NPV is linear in year-1 rent, so the break-even rent is exact.
  const base = npvs(v, 0).lease;
  const perRent = (npvs(v, 1).lease - base);
  const breakEvenRent = perRent > 0 ? (alt - base) / perRent : null;

  // Break-even escalator at the offered rent (NPV rises with it): bisect 0..20%.
  let breakEvenEsc;
  if (npvs(v, v.rentPerAcre, 0).lease >= alt) breakEvenEsc = 0;
  else if (npvs(v, v.rentPerAcre, 20).lease < alt) breakEvenEsc = null;
  else { let lo = 0, hi = 20; for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (npvs(v, v.rentPerAcre, mid).lease >= alt) hi = mid; else lo = mid; } breakEvenEsc = r2(hi); }

  // Real (today's-dollar) value of the last operating year's rent, using the alternative's growth as the inflation proxy.
  const lastRent = v.rentPerAcre * (1 + v.escalatorPct / 100) ** (v.termYears - 1);
  const lastRentReal = lastRent / (1 + v.altGrowthPct / 100) ** (v.optionYears + v.termYears - 1);

  const mw = v.acres / v.acresPerMw;
  const revenuePerAcre = (8760 * (v.capacityFactorPct / 100) * v.powerPricePerMwh) / v.acresPerMw;
  const rentShare = revenuePerAcre > 0 ? v.rentPerAcre / revenuePerAcre : null;
  const rentPerMwYear = v.rentPerAcre * v.acresPerMw;

  const advice = [];
  advice.push(`${v.acres} acres at ${money(v.rentPerAcre)} an acre is ${money(v.rentPerAcre * v.acres)} in year 1 of operation, rising ${v.escalatorPct}% a year to about ${money(lastRent * v.acres)} in year ${v.termYears}. Over the ${v.optionYears}-year option and ${v.termYears}-year term that is ${money(nominalLease)} in total, or ${money(lease)} in present value at ${v.discountPct}%.`);
  if (npvGain >= 0) advice.push(`Keeping the land in its current use is worth ${money(alt)} in present value over the same ${v.optionYears + v.termYears} years, so this offer is ahead by ${money(npvGain)} (${money(npvGain / v.acres)} an acre).`);
  else advice.push(`Keeping the land in its current use is worth ${money(alt)} in present value over the same ${v.optionYears + v.termYears} years, so this offer is behind by ${money(-npvGain)} (${money(-npvGain / v.acres)} an acre).`);
  if (breakEvenRent != null) advice.push(`Year-1 rent has to be at least ${money(breakEvenRent)} an acre for the lease to match the alternative at this escalator, term and discount rate${breakEvenRent > v.rentPerAcre ? `; the offer is ${money(breakEvenRent - v.rentPerAcre)} short` : ""}.`);
  if (breakEvenEsc === null) advice.push("No escalator up to 20% closes the gap at this rent.");
  else if (breakEvenEsc > v.escalatorPct) advice.push(`At the offered rent the escalator would have to be about ${breakEvenEsc}% a year to match the alternative; the offer has ${v.escalatorPct}%.`);
  if (v.escalatorPct < v.altGrowthPct) advice.push(`The escalator (${v.escalatorPct}%) is below the ${v.altGrowthPct}% your alternative grows at, so the rent buys less each year: the last year's rent is worth about ${money(lastRentReal)} an acre in today's dollars against ${money(v.rentPerAcre)} in year 1.`);
  if (rentShare != null) advice.push(`The project would be about ${r2(mw)} MWac. Rent of ${money(v.rentPerAcre)} an acre is ${money(rentPerMwYear)} per MWac-year, about ${r2(rentShare * 100)}% of the ${money(revenuePerAcre)} an acre the project would gross at ${v.capacityFactorPct}% capacity factor and ${money(v.powerPricePerMwh)}/MWh. Enter your own project figures; the share is a talking point, not a rate survey.`);
  if (v.termYears > 40) advice.push("Terms above 40 years tie up the land past most owners' planning horizon; check renewal, termination and decommissioning-security clauses with an attorney.");
  if (v.optionYears > 0 && v.optionPerAcre === 0) advice.push("A free option period locks up the land without paying you for it; option payments are normally negotiated.");

  return { inputs: v, nominalLease: r2(nominalLease), nominalAlt: r2(nominalAlt), npvLease: r2(lease), npvAlt: r2(alt), npvGain: r2(npvGain), npvGainPerAcre: r2(npvGain / v.acres), breakEvenRent: breakEvenRent == null ? null : r2(breakEvenRent), breakEvenEscalatorPct: breakEvenEsc, year1Rent: r2(v.rentPerAcre * v.acres), lastYearRent: r2(lastRent * v.acres), lastRentRealPerAcre: r2(lastRentReal), projectMw: r2(mw), rentPerMwYear: r2(rentPerMwYear), revenuePerAcre: r2(revenuePerAcre), rentSharePct: rentShare == null ? null : r2(rentShare * 100), offerBeatsAlternative: npvGain >= 0, advice };
}

/** NPV gain of the lease over the alternative for a spread of escalators and year-1 rents. */
export function sensitivity(input, escalators = [0, 1, 2, 2.5, 3], rents) {
  const base = { ...DEFAULTS, ...input };
  const r0 = Number(base.rentPerAcre);
  const list = rents || [0.8, 1, 1.2].map((f) => Math.round(r0 * f));
  return escalators.map((e) => ({ escalatorPct: e, cells: list.map((rent) => { const r = analyze({ ...input, escalatorPct: e, rentPerAcre: rent }); return { rentPerAcre: rent, npvGain: r.error ? null : r.npvGain }; }) }));
}

export function sampleInput() {
  return { ...DEFAULTS, acres: 240, rentPerAcre: 850, escalatorPct: 1.5, termYears: 35, optionYears: 3, optionPerAcre: 25, altCashRent: 300 };
}

export function toCsv(r) {
  const rows = [["line", "value"], ["acres", r.inputs.acres], ["year-1 rent", r.year1Rent], ["last-year rent", r.lastYearRent], ["total nominal lease income", r.nominalLease], ["present value of lease", r.npvLease], ["present value of alternative", r.npvAlt], ["lease minus alternative", r.npvGain], ["break-even year-1 rent per acre", r.breakEvenRent ?? ""], ["break-even escalator pct", r.breakEvenEscalatorPct ?? ""], ["project MWac", r.projectMw], ["rent per MWac-year", r.rentPerMwYear], ["rent share of project revenue pct", r.rentSharePct ?? ""]];
  return rows.map((x) => x.join(",")).join("\n") + "\n";
}
