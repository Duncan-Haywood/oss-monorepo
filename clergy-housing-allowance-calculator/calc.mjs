// Minister's housing allowance (IRC section 107). Pure arithmetic over what the user types in. For a minister who owns or rents a home,
// the income-tax exclusion is the LEAST of three numbers: the amount the church designated in advance, the housing costs actually
// paid, and the fair rental value of the home (furnished, with utilities). The exclusion never touches self-employment tax: a minister
// pays SE tax on wages plus the housing exclusion. A minister in a church-owned parsonage excludes its fair rental value instead.

export const MODES = ["own", "rent", "parsonage"];
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (s) => Number(String(s ?? "").replace(/[$,%\s_]/g, ""));
const blank = (s) => s === undefined || s === null || String(s).trim() === "";

// One cost per line: label, amount, month|year (default month)
export function parseExpenses(text) {
  const items = [];
  const errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    let p = line.split(",").map((s) => s.trim());
    // Commas inside the label are fine: the amount and the optional unit are always the last fields.
    let per = "month";
    if (p.length >= 3 && /^[a-z]+$/i.test(p[p.length - 1])) per = p.pop();
    const amt = p.length >= 2 ? p.pop() : undefined;
    const label = p.join(", ");
    const amount = num(amt);
    if (!label || amt === undefined) return errors.push(`Cost line ${i + 1}: need "label, amount, month or year".`);
    if (!Number.isFinite(amount) || amount < 0) return errors.push(`Cost line ${i + 1}: use a plain amount of zero or more.`);
    const unit = per.toLowerCase();
    if (!["month", "year", "monthly", "yearly", "annual", "annually"].includes(unit)) return errors.push(`Cost line ${i + 1}: use month or year.`);
    const annual = round2(unit.startsWith("m") ? amount * 12 : amount);
    items.push({ label, amount, per: unit.startsWith("m") ? "month" : "year", annual });
  });
  return { items, errors };
}

// Self-employment tax on net earnings, simple year model: 92.35% of earnings, 12.4% up to the Social Security wage base, 2.9% on all.
export function seTax(earnings, wageBase) {
  if (!(earnings > 0)) return 0;
  const base = earnings * 0.9235;
  return round2(Math.min(base, wageBase) * 0.124 + base * 0.029);
}

export function plan(input) {
  const mode = String(input.mode ?? "own").toLowerCase();
  if (!MODES.includes(mode)) return { error: "Choose own, rent or parsonage." };
  const { items, errors } = parseExpenses(input.expenses);
  if (errors.length) return { error: errors[0], errors };
  const wages = blank(input.wages) ? 0 : num(input.wages);
  const designated = blank(input.designated) ? 0 : num(input.designated);
  const rentalValueMonthly = blank(input.fairRental) ? 0 : num(input.fairRental);
  const bizExpenses = blank(input.bizExpenses) ? 0 : num(input.bizExpenses);
  const fed = blank(input.fedRate) ? 0 : num(input.fedRate);
  const state = blank(input.stateRate) ? 0 : num(input.stateRate);
  const cushion = blank(input.cushion) ? 0 : num(input.cushion);
  const wageBase = blank(input.wageBase) ? 184500 : num(input.wageBase);
  const nums = [wages, designated, rentalValueMonthly, bizExpenses, fed, state, cushion, wageBase];
  if (!nums.every(Number.isFinite) || nums.some((n) => n < 0)) return { error: "Use plain numbers of zero or more." };
  if (fed > 60 || state > 30) return { error: "Tax rates look too high; enter percent, for example 22." };
  if (!(wages > 0 || mode === "parsonage")) return { error: "Enter the cash salary the church pays you for the year." };
  const frv = round2(rentalValueMonthly * 12);

  let expenses = round2(items.reduce((s, x) => s + x.annual, 0));
  let excluded, limiter, taxableExcess = 0, missed = 0, recommended;
  if (mode === "parsonage") {
    // Church-owned home: its fair rental value is excluded. Only utilities the minister pays can be a designated allowance.
    if (!(frv > 0)) return { error: "Enter the monthly fair rental value of the parsonage, furnished, to see the exclusion." };
    const utilities = expenses;
    const utilEx = Math.min(designated, utilities);
    excluded = round2(frv + utilEx);
    taxableExcess = round2(Math.max(designated - utilities, 0));
    missed = round2(Math.max(utilities - designated, 0));
    limiter = designated > 0 ? (designated <= utilities ? "designated" : "expenses") : "parsonage";
    recommended = round2(Math.ceil(utilities * (1 + cushion / 100) / 100) * 100);
  } else {
    if (!items.length) return { error: "Add at least one housing cost: rent or mortgage, utilities, repairs, insurance." };
    if (!(frv > 0)) return { error: "Enter the monthly fair rental value of your home, furnished and with utilities. A realtor or rental listings for similar homes will tell you." };
    excluded = round2(Math.min(designated, expenses, frv));
    taxableExcess = round2(designated - excluded);
    const cap = Math.min(expenses, frv);
    missed = round2(Math.max(cap - designated, 0));
    limiter = designated <= expenses && designated <= frv ? "designated" : expenses <= frv ? "expenses" : "rental";
    recommended = round2(Math.min(Math.ceil(expenses * (1 + cushion / 100) / 100) * 100, frv));
  }

  const taxRate = (fed + state) / 100;
  const incomeTaxSaved = round2(excluded * taxRate);
  const missedTax = round2(missed * taxRate);
  const seEarnings = Math.max(wages + excluded - bizExpenses, 0);
  const seWith = seTax(seEarnings, wageBase);
  const seOnHousing = round2(seWith - seTax(Math.max(wages - bizExpenses, 0), wageBase));
  const monthly = (x) => round2(x / 12);

  const advice = [];
  if (mode === "parsonage") {
    advice.push(`Parsonage: its fair rental value, ${usd(frv)} a year, is excluded from income tax${designated ? `, plus ${usd(round2(Math.min(designated, expenses)))} of designated utilities` : ""}, for about ${usd(incomeTaxSaved)} of income tax saved at ${fed + state}%.`);
    if (!designated && expenses > 0) advice.push(`You pay ${usd(expenses)} a year in utilities and the church designated nothing for them. A utilities allowance of ${usd(recommended)} designated in advance would exclude them too, worth about ${usd(round2(Math.min(recommended, expenses) * taxRate))}.`);
  } else {
    advice.push(`Excluded from income tax: ${usd(excluded)} (the smallest of designated ${usd(designated)}, actual costs ${usd(expenses)}, and fair rental value ${usd(frv)}). That saves about ${usd(incomeTaxSaved)} at ${fed + state}% combined income tax.`);
    if (limiter === "designated" && missed > 0) advice.push(`Your designation is the limit. You pay or could justify ${usd(Math.min(expenses, frv))} but only ${usd(designated)} is designated, so ${usd(missed)} is taxable, about ${usd(missedTax)}. A designation can only change going forward, so ask the church to raise it before the next pay period.`);
    if (taxableExcess > 0) advice.push(`${usd(taxableExcess)} of the designation is above what the home actually costs or rents for, so it is taxable wages. Lower the designation next year, or keep better records if the costs are real.`);
    if (limiter === "rental" && expenses > frv) advice.push(`Your costs (${usd(expenses)}) exceed the home's fair rental value (${usd(frv)}), which caps the exclusion. The extra ${usd(round2(expenses - frv))} is not excludable.`);
  }
  advice.push(`Self-employment tax is not reduced by the allowance. On ${usd(round2(seEarnings))} of wages plus excluded housing you owe about ${usd(seWith)} (${usd(seOnHousing)} of it caused by the housing exclusion). Ministers are usually treated as self-employed for Social Security and Medicare even when the church issues a W-2.`);
  advice.push(`Suggested designation for next year: ${usd(recommended)} (${usd(monthly(recommended))} a month), your expected costs plus a ${cushion}% cushion, capped at fair rental value for an owned or rented home.`);
  return {
    mode, items, expenses, frv, designated, excluded, taxableExcess, missed, missedTax, limiter, recommended,
    incomeTaxSaved, seEarnings: round2(seEarnings), seWith, seOnHousing, wages, advice,
  };
}

export const usd = (x) => (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// A resolution for the governing body to adopt BEFORE the year (or before the new designation takes effect). Placeholders in brackets.
export function resolution(r, opts = {}) {
  const church = opts.church || "[Name of church]";
  const minister = opts.minister || "[Name of minister]";
  const year = opts.year || "[year]";
  const amt = usd(r.recommended);
  const body = r.mode === "parsonage"
    ? `RESOLVED, that of the compensation paid to ${minister} for ${year}, ${amt} is designated as a utilities allowance under section 107(2) of the Internal Revenue Code, to the extent ${minister} actually pays utilities for the church-provided parsonage; the parsonage itself is furnished as part of ministry and excluded under section 107(1).`
    : `RESOLVED, that of the compensation paid to ${minister} for ${year}, ${amt} (${usd(round2(r.recommended / 12))} per month) is designated as a housing allowance under section 107(2) of the Internal Revenue Code, to be used for the rental or ownership, furnishing, utilities and upkeep of the minister's home.`;
  return `${church}\n\nExcerpt of minutes of the governing body, adopted on [date]\n\n${body}\n\nThe minister will keep records of actual housing costs, and the designation may be amended prospectively if costs change.\n\nCertified by: [Name, title]   Date: [date]\n\nTemplate only, not legal or tax advice. Have your church's counsel or tax professional review before adopting.`;
}

export function sampleInput() {
  return {
    mode: "own", wages: 48000, designated: 24000, fairRental: 2400, bizExpenses: 2500, fedRate: 12, stateRate: 4, cushion: 5, wageBase: 184500,
    expenses: ["Mortgage payment (principal and interest), 1650, month", "Property tax, 3600, year", "Homeowners insurance, 1500, year", "Electric, gas and water, 330, month", "Furnishings and repairs, 2400, year"].join("\n"),
  };
}

export function toCsv(r) {
  const rows = [["measure", "annual_amount"], ["designated", r.designated], ["actual_costs", r.expenses], ["fair_rental_value", r.frv], ["excluded", r.excluded], ["taxable_excess", r.taxableExcess], ["income_tax_saved", r.incomeTaxSaved], ["se_tax_estimate", r.seWith], ["suggested_designation", r.recommended]];
  return rows.map((x) => x.join(",")).join("\n") + "\n";
}
