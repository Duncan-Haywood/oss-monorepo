// COBRA continuation coverage vs an ACA marketplace plan after losing job-based coverage.
// Pure functions, no network. Premiums and plan terms are typed in (the marketplace premium is
// the net amount after any premium tax credit, from the visitor's own healthcare.gov quote), so
// this file holds no subsidy table that could go stale. Deadlines follow the federal COBRA and
// marketplace special-enrollment rules and are as-of the date in RULES_AS_OF.

export const RULES_AS_OF = "Federal rules as understood 2026-10: 60-day COBRA election window, 45-day first-premium grace, up to 18 months of coverage, 60-day marketplace special enrollment window. State continuation laws, small-employer plans and plan documents can differ; confirm with your plan administrator";

// Illustrative allowed charges (what the insurer's contract price comes to, not a hospital's list price).
export const DEFAULT_SCENARIOS = [
  { key: "healthy", label: "No care at all", spend: 0 },
  { key: "routine", label: "Routine care and a few prescriptions", spend: 2500 },
  { key: "injury", label: "ER visit or broken bone", spend: 9000 },
  { key: "surgery", label: "Planned surgery or short hospital stay", spend: 40000 },
  { key: "major", label: "Cancer treatment or long hospital stay", spend: 150000 },
];

export function fmt(n) {
  const r = Math.round(n);
  return (r < 0 ? "-$" : "$") + Math.abs(r).toLocaleString("en-US");
}

const num = (v, d = 0) => {
  if (v === "" || v === null || v === undefined) return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

// What the patient pays out of pocket for `spend` of allowed charges under one plan, given the
// deductible and out-of-pocket max still unmet when the period starts.
export function patientCost(spend, { dedLeft, oopLeft, coinsurance }) {
  if (spend <= 0 || oopLeft <= 0) return 0;
  const inDeductible = Math.min(spend, dedLeft);
  const share = Math.max(0, spend - dedLeft) * coinsurance;
  return Math.min(oopLeft, inDeductible + share);
}

const MS = 86400000;
const parseDay = (s) => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  if (!m) return NaN;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 ? d : NaN;
};
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * MS);
const firstOfNextMonth = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
const lastOfMonth = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));

export function deadlines({ lossDate, noticeDate }) {
  const loss = parseDay(lossDate);
  if (loss === null) return null;
  if (Number.isNaN(loss)) return { error: "Coverage end date must be YYYY-MM-DD" };
  const notice = parseDay(noticeDate);
  if (Number.isNaN(notice)) return { error: "Election notice date must be YYYY-MM-DD" };
  const base = notice && notice > loss ? notice : loss;
  const election = addDays(base, 60);
  return {
    electionDeadline: iso(election),
    firstPremiumDue: iso(addDays(election, 45)), // the latest it can be: 45 days after electing, if you elect on the last day
    marketplaceWindowEnds: iso(addDays(loss, 60)),
    marketplaceNoGapPickBy: iso(lastOfMonth(loss)),
    marketplaceStartsIfPickedByThen: iso(firstOfNextMonth(loss)),
    maxCobraEnds: iso(new Date(Math.min(Date.UTC(loss.getUTCFullYear(), loss.getUTCMonth() + 18, loss.getUTCDate()), Date.UTC(loss.getUTCFullYear(), loss.getUTCMonth() + 19, 0)))),
    electionNoticeBasis: notice && notice > loss ? "the date the election notice was sent" : "the date coverage ended",
  };
}

export function compute(input) {
  const f = {
    cobraPremium: num(input.cobraPremium),
    marketPremium: num(input.marketPremium),
    months: num(input.months, 6),
    cobraDeductible: num(input.cobraDeductible),
    cobraOopMax: num(input.cobraOopMax),
    cobraDedMet: num(input.cobraDedMet),
    cobraOopMet: num(input.cobraOopMet),
    cobraCoinsurancePct: num(input.cobraCoinsurancePct, 20),
    marketDeductible: num(input.marketDeductible),
    marketOopMax: num(input.marketOopMax),
    marketCoinsurancePct: num(input.marketCoinsurancePct, 20),
    expectedSpend: num(input.expectedSpend),
  };
  for (const [k, v] of Object.entries(f)) {
    if (Number.isNaN(v) || v < 0) return { status: "error", text: `${k} must be a non-negative number` };
  }
  if (f.cobraPremium <= 0) return { status: "error", text: "Enter the full monthly COBRA premium from your election notice" };
  if (f.cobraOopMax <= 0 || f.marketOopMax <= 0) return { status: "error", text: "Enter each plan's out-of-pocket maximum (it is on the plan summary)" };
  if (f.months < 1 || f.months > 18) return { status: "error", text: "Months of coverage needed must be between 1 and 18, the COBRA maximum for a job loss" };
  if (f.cobraCoinsurancePct > 100 || f.marketCoinsurancePct > 100) return { status: "error", text: "Coinsurance is the share you pay, 0 to 100" };

  const warnings = [];
  const cobra = {
    dedLeft: Math.max(0, f.cobraDeductible - f.cobraDedMet),
    oopLeft: Math.max(0, f.cobraOopMax - f.cobraOopMet),
    coinsurance: f.cobraCoinsurancePct / 100,
  };
  const market = { dedLeft: f.marketDeductible, oopLeft: f.marketOopMax, coinsurance: f.marketCoinsurancePct / 100 };
  if (f.cobraDedMet > f.cobraDeductible) warnings.push("Deductible already met is larger than the COBRA deductible; treated as fully met.");
  if (f.marketPremium === 0) warnings.push("Marketplace premium is $0. That is possible after a large credit, but check the quote; the result reflects it.");

  const cobraPremiums = f.cobraPremium * f.months;
  const marketPremiums = f.marketPremium * f.months;
  const spendList = DEFAULT_SCENARIOS.map((s) => ({ ...s }));
  if (f.expectedSpend > 0 && !spendList.some((s) => s.spend === f.expectedSpend)) {
    spendList.push({ key: "expected", label: "Your own estimate", spend: f.expectedSpend });
    spendList.sort((a, b) => a.spend - b.spend);
  }
  const scenarios = spendList.map((s) => {
    const cobraOop = patientCost(s.spend, cobra);
    const marketOop = patientCost(s.spend, market);
    const cobraTotal = cobraPremiums + cobraOop;
    const marketTotal = marketPremiums + marketOop;
    return { ...s, cobraOop, marketOop, cobraTotal, marketTotal, cheaper: Math.abs(cobraTotal - marketTotal) < 1 ? "tie" : cobraTotal < marketTotal ? "cobra" : "marketplace" };
  });

  // First allowed-charge level at which COBRA's lower out-of-pocket cost outweighs its higher premium.
  const premiumGap = cobraPremiums - marketPremiums;
  let breakeven = null;
  const diffAt = (s) => (cobraPremiums + patientCost(s, cobra)) - (marketPremiums + patientCost(s, market));
  // Both cost curves are piecewise linear in allowed charges, with corners at each plan's remaining deductible and
  // at the charge where it reaches its out-of-pocket maximum, so the sign of diffAt at those corners (and between them,
  // by linear interpolation) is exact. Quality audit 2026-11-12: the old test looked only at $0 of care and could call
  // COBRA "always" cheaper above a table showing the marketplace cheaper at $9,000.
  const capAt = (p) => (p.coinsurance > 0 ? p.dedLeft + Math.max(0, p.oopLeft - p.dedLeft) / p.coinsurance : p.dedLeft);
  const corners = [...new Set([0, cobra.dedLeft, market.dedLeft, capAt(cobra), capAt(market), Math.min(cobra.oopLeft, cobra.dedLeft), Math.min(market.oopLeft, market.dedLeft)])]
    .filter((x) => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  corners.push(corners[corners.length - 1] + 1e6);
  const crossings = []; // { spend, to: which plan is cheaper past this point }
  for (let i = 1; i < corners.length; i++) {
    const p = corners[i - 1], q = corners[i], a = diffAt(p), b = diffAt(q);
    if ((a > 0 && b <= 0) || (a <= 0 && b > 0)) {
      crossings.push({ spend: Math.round(a === b ? p : p + (a / (a - b)) * (q - p)), to: b <= 0 ? "cobra" : "marketplace" });
    }
  }
  if (!crossings.length) breakeven = diffAt(0) <= 0 ? { kind: "always" } : { kind: "never" };
  else if (crossings.length === 1 && crossings[0].to === "cobra") breakeven = { kind: "at", spend: crossings[0].spend };
  else if (crossings.length === 1) breakeven = { kind: "below", spend: crossings[0].spend };
  else breakeven = { kind: "mixed", crossings };

  const worstCobra = cobraPremiums + patientCost(1e9, cobra);
  const worstMarket = marketPremiums + patientCost(1e9, market);
  const notes = [];
  if (cobra.dedLeft < f.cobraDeductible) notes.push(`COBRA keeps what you already paid this plan year: ${fmt(f.cobraDedMet)} of deductible and ${fmt(f.cobraOopMet)} toward the out-of-pocket maximum carry over. A marketplace plan starts both at zero.`);
  notes.push("Choosing a marketplace plan means giving up COBRA. If you pick COBRA and quit mid-year you usually cannot get a marketplace special enrollment for that, only at open enrollment, and while you are enrolled in COBRA you get no premium tax credit.");
  notes.push("Doctors and drugs matter as much as price: check that each doctor you see is in the marketplace plan's network and each prescription is on its formulary. COBRA keeps the exact plan you had.");
  if (f.months > 3) notes.push("The longer you need coverage, the more the premium gap dominates. A new job's plan or Medicare often starts sooner than planned; model the months you actually expect.");
  // Deductibles and out-of-pocket maximums reset each plan year: January 1 for every marketplace plan (45 CFR 147.104(f))
  // and for most employer plans. The totals above treat the whole period as one plan year (quality audit 2026-11-12).
  const lossDay = parseDay(input.lossDate);
  if (lossDay instanceof Date && !Number.isNaN(lossDay.getTime())) {
    const startMonth = lossDay.getUTCMonth() + 1; // coverage you are pricing starts the month after the old plan ends
    if (startMonth + f.months > 12) {
      const before = Math.max(0, 12 - startMonth);
      notes.push(`These months cross January 1, when a marketplace plan's deductible and out-of-pocket maximum start again at zero (most employer plans, and so COBRA, reset too). The totals above treat all ${f.months} months as one plan year, so with care on both sides of January the real cost can be higher than shown, and what COBRA carries over only helps for the ${before} month${before === 1 ? "" : "s"} before the reset.`);
    }
  }
  const waitSavings = f.cobraPremium * Math.min(2, f.months);
  notes.push(`Election window: you have 60 days to elect COBRA and 45 more to pay. Coverage is retroactive, so if nothing is spent in those first months you can skip them. That can defer up to ${fmt(waitSavings)} of premium, at the risk that care in the gap is uninsured until you elect.`);

  const text = breakeven.kind === "below"
    ? `COBRA is cheaper until your care reaches about ${fmt(breakeven.spend)} of allowed charges over ${f.months} months; past that, the marketplace plan costs less because its out-of-pocket maximum is lower.`
    : breakeven.kind === "mixed"
    ? `Which plan is cheaper changes more than once as care rises (at about ${breakeven.crossings.map((c) => fmt(c.spend)).join(", ")} of allowed charges); compare the scenarios below at the level of care you expect.`
    : breakeven.kind === "always"
    ? "COBRA costs no more than the marketplace plan at any level of care, given these numbers."
    : breakeven.kind === "never"
      ? `Marketplace plan is cheaper at every level of care you could have over ${f.months} months: premiums alone differ by ${fmt(premiumGap)} and COBRA's lower deductible never catches up.`
      : `Marketplace is cheaper until your care reaches about ${fmt(breakeven.spend)} of allowed charges over ${f.months} months; past that, COBRA costs less. Premiums differ by ${fmt(premiumGap)} over the period.`;

  return {
    status: "ok", text, months: f.months, premiumGap, cobraPremiums, marketPremiums, scenarios, breakeven,
    worstCase: { cobra: worstCobra, marketplace: worstMarket },
    notes, warnings, dates: deadlines(input),
  };
}
