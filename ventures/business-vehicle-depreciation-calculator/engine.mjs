// Business vehicle first-year write-off: MACRS vs 100% bonus vs Section 179, with the
// Section 280F "luxury auto" caps for cars/light SUVs (<= 6,000 lb GVWR) and the Section 179
// heavy-SUV cap (> 6,000 lb, <= 14,000 lb). Pure functions, no network. Limits are editable
// inputs: the IRS republishes them every year (Rev. Proc. 2025-16 for 2025) and this table
// is only as current as LIMITS_AS_OF says.

export const LIMITS_AS_OF = "Defaults: 2025 placed-in-service limits (IRS Rev. Proc. 2025-16 and the 2025 Section 179 SUV cap), standard mileage 70 cents/mile. Check the IRS page for the year you buy";

export const DEFAULT_LIMITS = {
  // Section 280F caps on total depreciation + 179 per tax year, passenger autos <= 6,000 lb GVWR.
  passengerCaps: { year1WithBonus: 20200, year1NoBonus: 12200, year2: 19600, year3: 11800, afterwards: 7060 },
  // Section 179 expensing cap for SUVs > 6,000 lb and <= 14,000 lb GVWR that are not otherwise exempt.
  heavySuv179Cap: 31300,
  mileageRate: 0.70,
};

// MACRS 5-year property, half-year convention.
const MACRS5 = [0.2, 0.32, 0.192, 0.1152, 0.1152, 0.0576];
// ADS straight line, 5-year class = 6 tax years, half-year convention (required at <= 50% business use).
const ADS5 = [1 / 12, 1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 12];
const YEARS = 14;

export const CLASSES = {
  passenger: "Car or light SUV, GVWR 6,000 lb or less (280F caps apply)",
  heavy_suv: "SUV over 6,000 lb GVWR (179 capped, bonus and MACRS are not)",
  exempt: "Cargo van, pickup with 6 ft+ bed, work truck, or over 14,000 lb (no caps)",
};

export function fmt(n) {
  const r = Math.round(n);
  return (r < 0 ? "-$" : "$") + Math.abs(r).toLocaleString("en-US");
}

const capFor = (limits, i, bonus) => {
  const c = limits.passengerCaps;
  if (i === 0) return bonus ? c.year1WithBonus : c.year1NoBonus;
  if (i === 1) return c.year2;
  if (i === 2) return c.year3;
  return c.afterwards;
};

// Turn a schedule of allowed-before-cap amounts into what the cap actually permits, carrying the
// unrecovered balance forward (a capped car keeps depreciating at the "afterwards" cap until recovered).
function applyCaps(scheduled, capAt, scale) {
  const out = [];
  let pool = 0;
  for (let i = 0; i < YEARS; i++) {
    pool += scheduled[i] || 0;
    const allowed = Math.min(pool, capAt(i) * scale);
    out.push(allowed);
    pool -= allowed;
  }
  return out;
}

const pad = (a) => Array.from({ length: YEARS }, (_, i) => a[i] || 0);

export function compute(input, limits = DEFAULT_LIMITS) {
  const price = Math.max(0, Number(input.price) || 0);
  const biz = Math.min(1, Math.max(0, (Number(input.businessPct) || 0) / 100));
  const klass = CLASSES[input.vehicleClass] ? input.vehicleClass : "passenger";
  const rate = Math.min(1, Math.max(0, (Number(input.taxRate) || 0) / 100));
  const income = input.businessIncome === undefined || input.businessIncome === "" || input.businessIncome === null
    ? null : Math.max(0, Number(input.businessIncome) || 0);
  const basis = price * biz;
  const warnings = [];
  const methods = [];

  const add = (key, label, schedule, notes = []) => {
    const s = pad(schedule);
    const total = s.reduce((a, b) => a + b, 0);
    methods.push({ key, label, schedule: s, year1: s[0], total, taxSavedYear1: s[0] * rate, taxSavedTotal: total * rate, notes });
  };

  if (!price || !biz) return { status: "error", text: "Enter the vehicle price and the percentage of use that is for business.", methods: [], warnings, basis };

  if (biz <= 0.5) {
    warnings.push("Business use of 50% or less: no Section 179 and no bonus depreciation, and the vehicle must use ADS straight-line over six tax years" + (klass === "passenger" ? ", still subject to the 280F caps." : "."));
    const sched = klass === "passenger"
      ? applyCaps(ADS5.map((p) => p * basis), (i) => capFor(limits, i, false), biz)
      : ADS5.map((p) => p * basis);
    add("ads", "ADS straight-line (required at 50% or less business use)", sched);
  } else {
    const macrs = MACRS5.map((p) => p * basis);
    const full = [basis];
    if (klass === "passenger") {
      add("macrs", "Regular MACRS, no election", applyCaps(macrs, (i) => capFor(limits, i, false), biz),
        ["Capped each year by the 280F table."]);
      add("bonus", "100% bonus depreciation", applyCaps(full, (i) => capFor(limits, i, true), biz),
        ["Year one capped, unrecovered balance continues at the later-year caps."]);
      add("s179", "Section 179 election", applyCaps(full, (i) => capFor(limits, i, false), biz),
        ["For a car, 179 sits inside the lower no-bonus cap, so bonus usually deducts more in year one."]);
    } else if (klass === "heavy_suv") {
      add("macrs", "Regular MACRS, no election", macrs, ["The 280F caps do not apply over 6,000 lb."]);
      add("bonus", "100% bonus depreciation", full, ["Bonus is not limited by the 179 SUV cap."]);
      const cap = Math.min(price, limits.heavySuv179Cap) * biz;
      let first = cap;
      const carry = [];
      if (income !== null && first > income) { carry[1] = first - income; first = income; warnings.push("Section 179 cannot exceed your business taxable income; the excess carries to next year here."); }
      const rest = basis - cap;
      add("s179", "Section 179 (SUV cap) plus MACRS on the rest",
        MACRS5.map((p, i) => p * rest + (i === 0 ? first : 0) + (carry[i] || 0)),
        [`179 capped at ${fmt(limits.heavySuv179Cap)} of cost; the remaining basis depreciates on the 5-year MACRS table.`]);
    } else {
      add("macrs", "Regular MACRS, no election", macrs);
      add("bonus", "100% bonus depreciation", full, ["Bonus can create a net operating loss if it exceeds your income."]);
      let first = basis;
      const carry = [];
      if (income !== null && first > income) { carry[1] = first - income; first = income; warnings.push("Section 179 cannot exceed your business taxable income; the excess carries to next year here."); }
      add("s179", "Section 179 election", [first, carry[1] || 0]);
    }
  }

  // Standard mileage alternative: no depreciation at all, so shown beside, not ranked against, the schedules.
  const miles = Math.max(0, Number(input.miles) || 0);
  const mileage = miles ? { deduction: miles * limits.mileageRate, taxSaved: miles * limits.mileageRate * rate, rate: limits.mileageRate } : null;
  if (klass === "passenger" || klass === "heavy_suv") warnings.push("Check the recapture rule: if business use drops to 50% or less in a later year, some of the early deduction is added back to income.");

  const best = methods.reduce((a, b) => (b.year1 > a.year1 ? b : a), methods[0]);
  const text = `${best.label} deducts the most in year one: ${fmt(best.year1)} on a ${fmt(price)} vehicle at ${Math.round(biz * 100)}% business use` + (rate ? `, about ${fmt(best.taxSavedYear1)} of tax at your ${Math.round(rate * 1000) / 10}% rate.` : ".");
  return { status: "ok", text, basis, methods, best: best.key, mileage, warnings, vehicleClass: klass };
}
