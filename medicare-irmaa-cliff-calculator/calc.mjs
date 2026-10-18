// Core arithmetic for Medicare IRMAA (income-related monthly adjustment amount)
// tiers. No network calls: this applies published figures to numbers the user
// types. It is NOT tax, medical, legal or financial advice.
//
// Figures, checked 2026-09-29 against 2026 CMS/Medicare.gov figures as
// reported by several secondary sources (standard Part B premium $202.90):
// verify at medicare.gov and ssa.gov/medicare/premiums before relying on them.
//   - The 2026 premium is set from MAGI on the 2024 tax return (a two-year
//     lookback): income in year Y sets the premium in year Y+2.
//   - Single / head of household / qualifying widow(er) and married filing
//     jointly thresholds are below. Married filing separately who lived with the
//     spouse at any time in the year has only three bands.
//   - The four lower tiers apply when MAGI is ABOVE the threshold (at the
//     threshold you are still in the lower tier). The top tier applies at or
//     above its threshold (CMS: "$500,000 and above").
//   - Surcharges are per person, per month, on top of the standard Part B
//     premium and on top of the Part D plan premium (Part D only if enrolled).
//   - Thresholds are indexed for inflation each year; a future premium year is
//     projected here on the 2026 thresholds, which will move.

export const FIGURES_CHECKED = "2026-09-29";
export const PREMIUM_YEAR = 2026;
export const STANDARD_PART_B = 202.9;

const SURCHARGES = [
  { partB: 0, partD: 0 },
  { partB: 81.2, partD: 14.5 },
  { partB: 202.9, partD: 37.5 },
  { partB: 324.6, partD: 60.4 },
  { partB: 446.3, partD: 83.3 },
  { partB: 487.0, partD: 91.0 },
];

// Each entry: the MAGI where the tier ends. `atOrBelow` = tier includes that
// dollar; `below` = tier stops one dollar short (the next tier starts AT it).
const BANDS = {
  single: {
    label: "Single (also head of household, qualifying widow(er), MFS who lived apart all year)",
    tiers: [
      { s: 0, atOrBelow: 109_000 },
      { s: 1, atOrBelow: 137_000 },
      { s: 2, atOrBelow: 171_000 },
      { s: 3, atOrBelow: 205_000 },
      { s: 4, below: 500_000 },
      { s: 5, below: Infinity },
    ],
  },
  mfj: {
    label: "Married filing jointly",
    tiers: [
      { s: 0, atOrBelow: 218_000 },
      { s: 1, atOrBelow: 274_000 },
      { s: 2, atOrBelow: 342_000 },
      { s: 3, atOrBelow: 410_000 },
      { s: 4, below: 750_000 },
      { s: 5, below: Infinity },
    ],
  },
  mfs: {
    label: "Married filing separately, lived with spouse at any time in the year",
    tiers: [
      { s: 0, atOrBelow: 109_000 },
      { s: 4, below: 391_000 },
      { s: 5, below: Infinity },
    ],
  },
};

export const FILING_STATUSES = Object.keys(BANDS);

// Last whole dollar of MAGI that is still inside the tier.
function lastDollar(t) {
  return t.atOrBelow !== undefined ? t.atOrBelow : t.below - 1;
}

function bandsFor(filing) {
  const b = BANDS[filing];
  if (!b) throw new Error(`unknown filing status: ${filing}`);
  return b;
}

export function tiers(filing = "single") {
  const b = bandsFor(filing);
  return b.tiers.map((t, i) => {
    const prev = i === 0 ? null : b.tiers[i - 1];
    const sur = SURCHARGES[t.s];
    return {
      index: i,
      from: prev ? lastDollar(prev) + 1 : 0,
      to: lastDollar(t),
      partBSurcharge: sur.partB,
      partDSurcharge: sur.partD,
      partBPremium: round2(STANDARD_PART_B + sur.partB),
    };
  });
}

const round2 = (x) => Math.round(x * 100) / 100;

export function tierIndexFor(filing, magi) {
  const m = Math.floor(Math.max(0, Number(magi) || 0));
  const list = tiers(filing);
  for (const t of list) if (m <= t.to) return t.index;
  return list.length - 1;
}

function tierCost(t, people, hasPartD) {
  const monthly = people * (t.partBSurcharge + (hasPartD ? t.partDSurcharge : 0));
  return { monthly: round2(monthly), annual: round2(monthly * 12) };
}

export function analyze(input) {
  const filing = input.filing || "single";
  const list = tiers(filing);
  const lookbackMagi = Math.floor(Math.max(0, Number(input.lookbackMagi) || 0));
  const people = filing !== "mfj" ? 1 : input.people === 1 ? 1 : 2;
  const hasPartD = input.hasPartD !== false;
  const idx = tierIndexFor(filing, lookbackMagi);
  const tier = list[idx];
  const cost = tierCost(tier, people, hasPartD);

  const next = list[idx + 1] || null;
  const prev = idx > 0 ? list[idx - 1] : null;
  const nextCost = next ? tierCost(next, people, hasPartD) : null;
  const prevCost = prev ? tierCost(prev, people, hasPartD) : null;

  const roomUp = next ? tier.to - lookbackMagi : null; // dollars you can still add
  const dropDown = prev ? lookbackMagi - prev.to : null; // dollars you would have to remove
  const partDPlan = input.partDPlanMonthly == null || input.partDPlanMonthly === "" ? null : Math.max(0, Number(input.partDPlanMonthly));

  const result = {
    filing, people, hasPartD, lookbackMagi,
    tier, tierNumber: idx, isTopTier: !next,
    partBPremiumEach: tier.partBPremium,
    monthlySurcharge: cost.monthly,
    annualSurcharge: cost.annual,
    partDMonthlyEach: partDPlan === null ? null : round2(partDPlan + (hasPartD ? tier.partDSurcharge : 0)),
    next: next && { tier: next, roomUp, oneDollarAnnualCost: round2(nextCost.annual - cost.annual), oneDollarMonthlyCost: round2(nextCost.monthly - cost.monthly) },
    prev: prev && { tier: prev, dollarsToDrop: dropDown, annualSaving: round2(cost.annual - prevCost.annual) },
    // Cost of the single dollar that crosses the cliff, for the headline.
    oneDollarCost: next ? round2(nextCost.annual - cost.annual) : 0,
    lookback: lookbackExplanation(),
    planned: null,
  };

  const planned = Math.max(0, Number(input.plannedAmount) || 0);
  if (planned > 0 || input.baselineMagi != null && input.baselineMagi !== "") {
    const baseline = Math.floor(Math.max(0, input.baselineMagi == null || input.baselineMagi === "" ? lookbackMagi : Number(input.baselineMagi) || 0));
    const bIdx = tierIndexFor(filing, baseline);
    const pIdx = tierIndexFor(filing, baseline + planned);
    const bTier = list[bIdx];
    const pTier = list[pIdx];
    const bCost = tierCost(bTier, people, hasPartD);
    const pCost = tierCost(pTier, people, hasPartD);
    const fits = pIdx === bIdx;
    result.planned = {
      baselineMagi: baseline, plannedAmount: planned, projectedMagi: baseline + planned,
      baselineTier: bTier, projectedTier: pTier, fits,
      // Room left under the tier the baseline sits in (0 when already spent).
      roomInBaselineTier: bIdx === list.length - 1 ? null : Math.max(0, bTier.to - baseline),
      overBy: fits ? 0 : baseline + planned - bTier.to,
      extraAnnualCost: round2(pCost.annual - bCost.annual),
      tiersCrossed: pIdx - bIdx,
    };
  }
  result.findings = findings(result);
  return result;
}

export function lookbackExplanation(premiumYear = PREMIUM_YEAR) {
  return {
    premiumYear, incomeYear: premiumYear - 2,
    text: `Your ${premiumYear} Medicare premium is set from your ${premiumYear - 2} tax return. Income you report in ${premiumYear} sets your ${premiumYear + 2} premium.`,
  };
}

function findings(r) {
  const out = [];
  const $ = money;
  if (r.tierNumber === 0) {
    out.push({ severity: "info", title: "No IRMAA surcharge at this income", detail: `${$(r.lookbackMagi)} is at or below the first threshold (${$(r.tier.to)}), so you pay the standard Part B premium (${moneyCents(STANDARD_PART_B)} a month in 2026).` });
  } else {
    out.push({ severity: "high", title: `Tier ${r.tierNumber} surcharge: ${$(r.annualSurcharge)} a year`, detail: `${r.people} ${r.people === 1 ? "person" : "people"} on Medicare: ${moneyCents(r.monthlySurcharge)} a month above the standard premiums.` });
  }
  if (r.next) {
    out.push({ severity: r.next.roomUp <= 5_000 ? "high" : "medium", title: `${$(r.next.roomUp)} of room before the next cliff`, detail: `One more dollar (${$(r.lookbackMagi + r.next.roomUp + 1)}) moves you to the next tier and adds ${$(r.next.oneDollarAnnualCost)} a year.` });
  } else {
    out.push({ severity: "info", title: "Top tier", detail: "There is no higher tier, so more income does not raise the surcharge." });
  }
  if (r.prev) {
    out.push({ severity: "info", title: `${$(r.prev.dollarsToDrop)} less MAGI would lower your tier`, detail: `Getting to ${$(r.prev.tier.to)} saves ${$(r.prev.annualSaving)} a year. If your income dropped for a qualifying reason, see the SSA-44 checklist below.` });
  }
  if (r.planned) {
    const p = r.planned;
    out.push(p.fits
      ? { severity: "info", title: "The planned amount fits in the same tier", detail: `${$(p.plannedAmount)} on top of ${$(p.baselineMagi)} keeps MAGI at ${$(p.projectedMagi)}, inside the ${$(p.baselineTier.from)} to ${$(p.baselineTier.to)} band.` }
      : { severity: "high", title: `The planned amount crosses ${p.tiersCrossed} tier${p.tiersCrossed === 1 ? "" : "s"}`, detail: `It is ${$(p.overBy)} over the top of the ${$(p.baselineTier.to)} band and would add ${$(p.extraAnnualCost)} a year to the premium two years later.` });
  }
  return out;
}

// SSA-44 "Medicare Income-Related Monthly Adjustment Amount - Life-Changing
// Event" reasons, as listed on the form.
export const LIFE_EVENTS = [
  { id: "marriage", label: "Marriage", note: "Your filing status changed; bring the marriage certificate." },
  { id: "divorce", label: "Divorce or annulment", note: "Bring the decree." },
  { id: "death", label: "Death of your spouse", note: "Bring the death certificate." },
  { id: "work-stopped", label: "You or your spouse stopped working (retirement)", note: "Bring a letter from the employer or other proof of the retirement date." },
  { id: "work-reduced", label: "You or your spouse reduced hours", note: "Bring pay stubs or an employer letter showing the reduction." },
  { id: "property", label: "Loss of income-producing property", note: "Bring proof of the loss (insurance claim, sale or closing documents)." },
  { id: "pension", label: "Loss or reduction of pension income", note: "Bring the pension administrator's letter." },
  { id: "settlement", label: "Employer settlement payment", note: "Bring the settlement agreement showing it was a one-time payment." },
];

export function appealChecklist(r, eventId, estimatedIncome) {
  const ev = LIFE_EVENTS.find((e) => e.id === eventId) || LIFE_EVENTS[3];
  const est = estimatedIncome == null || estimatedIncome === "" ? null : Number(estimatedIncome);
  const lines = [
    "DRAFT for my own use. Information only, not legal, tax or financial advice. Check the current SSA-44 instructions at ssa.gov.",
    "",
    `Request: reduce or remove my Medicare income-related monthly adjustment amount (IRMAA) for ${r.lookback.premiumYear}.`,
    `Reason (SSA-44 life-changing event): ${ev.label}.`,
    `My ${r.lookback.incomeYear} MAGI used by SSA: ${money(r.lookbackMagi)}. Tier assigned: ${r.tierNumber}. Surcharge: ${money(r.annualSurcharge)} a year.`,
    est === null ? "My estimated MAGI for the year of the event and after: [fill in]." : `My estimated MAGI for the year of the event and after: ${money(est)}${est !== null ? ` (tier ${tierIndexFor(r.filing, est)})` : ""}.`,
    `Date of the event: [fill in].`,
    `Evidence to attach: ${ev.note}`,
  ];
  return lines.join("\n");
}

export const CHECKLIST_STEPS = [
  "Confirm the event is on the SSA-44 list and that your income actually dropped, not just changed.",
  "Note the date of the event and estimate MAGI for that year (SSA can also ask for the following year).",
  "Gather evidence: certificate, employer letter, decree, pension or settlement paperwork.",
  "Get the SSA-44 form and instructions from ssa.gov, or ask SSA to mail it. Check the deadline on your IRMAA notice (appeals are typically due within 60 days of it).",
  "Send the form with copies (never originals) by mail or fax, or through your local Social Security office; keep a copy and note the date.",
  "If the reason is not on the list (for example a one-time Roth conversion), SSA-44 does not apply; a voluntary or planned one-time income event is generally not a qualifying reason.",
];

export function money(n) {
  const v = Math.round(Number(n) || 0);
  const s = Math.abs(v).toLocaleString("en-US");
  return v < 0 ? `-$${s}` : `$${s}`;
}
export function moneyCents(n) {
  return `$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
