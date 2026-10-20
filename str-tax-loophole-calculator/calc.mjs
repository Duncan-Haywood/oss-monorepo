// Core arithmetic for the short-term-rental ("STR loophole") tax question in
// 2026. No network calls: this applies published federal rules to the numbers
// the user supplies. It is NOT tax advice -- see README "What this does not
// cover".
//
// Verified 2026-09-29 via WebSearch and WebFetch against IRS.gov and
// primary-source text:
//
//   - IRS Publication 925 (2025 ed.): a "rental activity" excludes property
//     whose average period of customer use is 7 days or less, or 30 days or
//     less when the owner provides significant personal services. The average
//     is total days in all rental periods divided by the number of rentals.
//   - Pub 925: the $25,000 special allowance is for RENTAL REAL ESTATE
//     activities with active participation. It phases out by 50 cents per
//     dollar of MAGI over $100,000 (gone at $150,000). Married filing
//     separately: $12,500 with a $50,000-$75,000 range if the spouses lived
//     apart all year, $0 if they lived together at any time. The thresholds
//     are statutory (IRC 469(i)) and not indexed.
//   - 26 CFR 1.469-5T(a): seven material-participation tests. Tests 1-3 are
//     computed here: more than 500 hours; participation is substantially all
//     of the participation of all individuals; more than 100 hours and not
//     less than any other individual. A spouse's participation counts as the
//     taxpayer's. Pub 925 test 7 (regular, continuous, substantial basis)
//     never applies at 100 hours or less. Tests 4-6 are not modelled.
//   - IRS 2025 news release on bonus depreciation and the OBBBA: permanent
//     100% additional first-year depreciation for qualified property acquired
//     after January 19, 2025 (Notice 2026-11 is interim guidance). Property
//     acquired earlier keeps the phase-down and is NOT modelled here.
//   - IRS Publication 527: residential rental property is 27.5-year
//     straight-line, mid-month convention; a unit in a hotel, motel, inn or
//     other establishment more than half used on a transient basis is
//     nonresidential (39 years); land is not depreciable; a dwelling is used
//     as a home if personal use exceeds the greater of 14 days or 10% of days
//     rented at fair rental price; rented under 15 days, the income is not
//     reported.
//   - Rev. Proc. 2025-32 section 4.31: the 2026 excess business loss
//     threshold under IRC 461(l) is $256,000 ($512,000 joint), permanent
//     under OBBBA.
//
// Simplifications, all stated on the page: the mid-month formula
// (12 - month + 0.5)/12 divided by the recovery period matches the IRS
// tables to within a few thousandths of a percent; the excess business loss is
// charged first to this rental; the cost segregation study's reclassified
// share is taken as 100% bonus depreciation in year one; federal and state
// rates are flat marginal rates; MAGI is whatever the user types.

export const LAW_2026 = {
  allowanceMax: 25000,
  allowancePhaseStart: 100000,
  allowancePhaseEnd: 150000,
  allowanceMfsApartMax: 12500,
  allowanceMfsApartStart: 50000,
  allowanceMfsApartEnd: 75000,
  phaseRate: 0.5,
  eblSingle: 256000,
  eblJoint: 512000,
  avgStayShort: 7,
  avgStayServices: 30,
  bonusRate: 1,
};

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function money(n) {
  const value = Number(n) || 0;
  const format = (v) =>
    `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

export function averageStay(rentalDays, stays) {
  const d = num(rentalDays);
  const s = num(stays);
  return s > 0 ? d / s : 0;
}

// Exception (A) 7 days or less; exception (B) 30 days or less with
// significant personal services. Extraordinary personal services and the
// other exceptions in the regulation are not modelled.
export function rentalActivityStatus({ rentalDays = 0, stays = 0, significantServices = false } = {}) {
  const avg = averageStay(rentalDays, stays);
  if (avg <= 0) return { avg, known: false, isRentalActivity: true, reason: "no-data" };
  if (avg <= LAW_2026.avgStayShort) return { avg, known: true, isRentalActivity: false, reason: "seven-day" };
  if (avg <= LAW_2026.avgStayServices && significantServices) return { avg, known: true, isRentalActivity: false, reason: "thirty-day-services" };
  return { avg, known: true, isRentalActivity: true, reason: avg <= LAW_2026.avgStayServices ? "thirty-day-no-services" : "long-stay" };
}

export function materialParticipation({ myHours = 0, spouseHours = 0, othersTotalHours = 0, topOtherHours = 0 } = {}) {
  const mine = num(myHours) + num(spouseHours);
  const top = num(topOtherHours);
  const others = Math.max(num(othersTotalHours), top);
  const t1 = mine > 500;
  const t2 = mine > 0 && others === 0;
  const t3 = mine > 100 && mine >= top;
  const t7possible = mine > 100 && !(t1 || t2 || t3);
  return {
    hours: mine,
    tests: [
      { id: 1, name: "More than 500 hours", met: t1 },
      { id: 2, name: "Substantially all of the participation of all individuals", met: t2 },
      { id: 3, name: "More than 100 hours and not less than any other individual", met: t3 },
    ],
    facts: t7possible,
    met: t1 || t2 || t3,
  };
}

export function passiveAllowance({ filingStatus = "single", magi = 0 } = {}) {
  const m = num(magi);
  if (filingStatus === "mfs-together") return { max: 0, start: 0, end: 0, allowance: 0 };
  const apart = filingStatus === "mfs-apart";
  const max = apart ? LAW_2026.allowanceMfsApartMax : LAW_2026.allowanceMax;
  const start = apart ? LAW_2026.allowanceMfsApartStart : LAW_2026.allowancePhaseStart;
  const end = apart ? LAW_2026.allowanceMfsApartEnd : LAW_2026.allowancePhaseEnd;
  const reduction = Math.max(0, m - start) * LAW_2026.phaseRate;
  return { max, start, end, allowance: Math.max(0, max - reduction) };
}

export function midMonthRate(monthPlaced, years) {
  const m = Math.min(12, Math.max(1, Math.round(num(monthPlaced) || 1)));
  return (12 - m + 0.5) / 12 / years;
}

export function firstYearDepreciation({ purchasePrice = 0, landPct = 20, monthPlaced = 1, recoveryYears = 27.5, reclassPct = 0, furniture = 0, costSeg = false } = {}) {
  const price = num(purchasePrice);
  const basis = price * (1 - Math.min(100, num(landPct)) / 100);
  const years = Number(recoveryYears) === 39 ? 39 : 27.5;
  const rate = midMonthRate(monthPlaced, years);
  const reclass = costSeg ? basis * Math.min(100, num(reclassPct)) / 100 : 0;
  const bonus = reclass * LAW_2026.bonusRate;
  const building = (basis - reclass) * rate;
  const furn = num(furniture) * LAW_2026.bonusRate;
  return { basis, rate, reclass, bonus, building, furniture: furn, total: bonus + building + furn };
}

function eblThreshold(filingStatus) {
  return filingStatus === "mfj" ? LAW_2026.eblJoint : LAW_2026.eblSingle;
}

function scenario(input, costSeg) {
  const dep = firstYearDepreciation({ ...input, costSeg });
  const noi = Number(input.noiBeforeDepreciation) || 0;
  const paperLoss = Math.max(0, dep.total - noi);
  const taxableIfIncome = Math.max(0, noi - dep.total);
  const rate = (Math.min(100, num(input.fedRatePct)) + Math.min(100, num(input.stateRatePct))) / 100;

  // Non-passive path: at-risk cap, then excess business loss.
  const atRiskCap = input.atRisk === null || input.atRisk === undefined || input.atRisk === "" ? Infinity : num(input.atRisk);
  const afterAtRisk = Math.min(paperLoss, atRiskCap);
  const otherBiz = Number(input.otherBusinessIncome) || 0;
  const threshold = eblThreshold(input.filingStatus);
  const aggregateLoss = afterAtRisk - otherBiz;
  const eblExcess = Math.max(0, aggregateLoss - threshold);
  const eblCharged = Math.min(afterAtRisk, eblExcess);
  const nonpassiveAllowed = afterAtRisk - eblCharged;

  // Passive path: other passive income, then the $25,000 allowance only for
  // a true rental activity with active participation.
  const allowance = passiveAllowance(input);
  const eligibleForAllowance = Boolean(input.activeParticipation) && input.rentalActivity;
  const passiveHeadroom = num(input.otherPassiveIncome) + (eligibleForAllowance ? allowance.allowance : 0);
  const passiveAfterAtRisk = Math.min(paperLoss, atRiskCap);
  const passiveAllowed = Math.min(passiveAfterAtRisk, passiveHeadroom);

  return {
    costSeg, dep, noi, paperLoss, taxableIfIncome, rate,
    atRiskDisallowed: paperLoss - afterAtRisk,
    eblExcess: eblCharged, threshold,
    nonpassive: { allowed: nonpassiveAllowed, suspended: paperLoss - nonpassiveAllowed, savings: nonpassiveAllowed * rate },
    passive: { allowed: passiveAllowed, suspended: paperLoss - passiveAllowed, savings: passiveAllowed * rate, allowance, eligibleForAllowance },
  };
}

export function strTaxOutcome(input = {}) {
  const status = rentalActivityStatus({ rentalDays: input.rentalDays, stays: input.stays, significantServices: input.significantServices });
  const mp = materialParticipation(input);
  const rentalDays = num(input.rentalDays);
  const personalDays = num(input.personalDays);
  const usedAsHome = rentalDays > 0 && personalDays > Math.max(14, rentalDays * 0.1);
  const tooFewDays = rentalDays > 0 && rentalDays < 15;
  const nonpassiveApplies = !status.isRentalActivity && mp.met;
  const path = nonpassiveApplies ? "nonpassive" : "passive";
  const ctx = { ...input, rentalActivity: status.isRentalActivity };
  const base = scenario(ctx, false);
  const seg = scenario(ctx, true);
  const actualOf = (s) => (usedAsHome || tooFewDays ? { allowed: 0, suspended: s.paperLoss, savings: 0 } : s[path]);
  const a = actualOf(base);
  const b = actualOf(seg);
  const studyCost = num(input.studyCost);
  const extraDepreciation = seg.dep.total - base.dep.total;
  const extraSavings = b.savings - a.savings;

  const findings = [];
  if (!status.known) {
    findings.push({ severity: "high", title: "Enter nights rented and number of stays", detail: "The 7-day test divides total days in all rental periods by the number of rentals. Without both numbers the calculator assumes the property is an ordinary rental activity." });
  }
  if (status.reason === "seven-day") {
    findings.push({ severity: "info", title: `Average stay is ${status.avg.toFixed(1)} days: not a "rental activity"`, detail: "An average period of customer use of 7 days or less takes the property out of the passive-loss rental definition, so it is passive only if you do not materially participate. The $25,000 allowance is then unavailable because it is limited to rental real estate activities." });
  } else if (status.reason === "thirty-day-services") {
    findings.push({ severity: "medium", title: `Average stay is ${status.avg.toFixed(1)} days, excluded only because of significant personal services`, detail: "Between 8 and 30 days the exclusion depends on you providing significant personal services (such as daily housekeeping, meals or concierge work), not just cleaning between guests, repairs or common-area upkeep a long-term landlord also provides. Expect scrutiny and keep records of what you provide." });
  } else if (status.reason === "thirty-day-no-services") {
    findings.push({ severity: "high", title: `Average stay is ${status.avg.toFixed(1)} days: still a rental activity`, detail: "Above 7 days you need significant personal services to escape the rental definition. Without them the rental is passive whatever your hours, and only the $25,000 allowance or offsetting passive income can use the loss." });
  } else if (status.reason === "long-stay") {
    findings.push({ severity: "high", title: `Average stay is ${status.avg.toFixed(1)} days: an ordinary rental activity`, detail: "Stays averaging more than 30 days are a rental activity regardless of services. Only real estate professional status (not modelled) or the $25,000 allowance can free the loss." });
  }
  if (!status.isRentalActivity && !mp.met) {
    findings.push({ severity: "high", title: "Not a rental activity, but material participation is not shown", detail: "The property is a passive trade or business, so the loss is suspended unless you have passive income to absorb it. Tests 1-3 are computed here; tests 4-6 and the facts-and-circumstances test 7 are not counted." });
  }
  if (mp.facts) {
    findings.push({ severity: "medium", title: "Only the facts-and-circumstances test might apply", detail: "You have more than 100 hours but do not meet tests 1-3. Test 7 (regular, continuous and substantial basis) is judged on all the facts and is weakened when a paid manager or another individual does more of the managing. It is not counted as met here." });
  }
  if (usedAsHome) {
    findings.push({ severity: "high", title: "Personal use makes the property a residence under Section 280A", detail: `Your ${personalDays.toLocaleString()} personal-use days exceed the greater of 14 days or 10% of ${rentalDays.toLocaleString()} rental days. Deductions are then limited to rental income, so no loss is allowed this year in the figures below.` });
  }
  if (tooFewDays) {
    findings.push({ severity: "high", title: "Rented fewer than 15 days", detail: "A home rented fewer than 15 days a year has its rental income excluded and its rental expenses not deductible, so there is no loss to use." });
  }
  if (Number(input.recoveryYears) !== 39) {
    findings.push({ severity: "medium", title: "27.5 years assumes the property counts as residential rental", detail: "Pub 527 treats a unit in a hotel, motel, inn or similar establishment used mostly on a transient basis as 39-year nonresidential property. Whether a single-family STR is that kind of establishment is a question for your preparer; choose 39 years to see the conservative figure." });
  }
  findings.push({ severity: "info", title: "Bonus depreciation assumes the property was acquired after January 19, 2025", detail: "Property acquired after that date qualifies for permanent 100% bonus depreciation under the 2025 tax law (IRS Notice 2026-11 is interim guidance). Property acquired under an earlier binding contract keeps the phase-down rate and is not modelled." });
  if (seg.atRiskDisallowed > 0 || base.atRiskDisallowed > 0) {
    findings.push({ severity: "high", title: "At-risk limit cuts the loss", detail: `Your at-risk amount is lower than the paper loss, so ${money(seg.atRiskDisallowed)} of the loss with a cost segregation study (${money(base.atRiskDisallowed)} without one) is held back. Qualified nonrecourse mortgage financing on real property counts as at risk; your own basis in the property also limits losses.` });
  }
  if (path === "nonpassive" && (base.eblExcess > 0 || seg.eblExcess > 0)) {
    findings.push({ severity: "high", title: "Excess business loss limit applies", detail: `Net business losses above ${money(seg.threshold)} for 2026 cannot offset other income this year and become a net operating loss carryforward. Shown figures charge the excess to this rental first.` });
  }
  if (path === "passive" && seg.paperLoss > 0) {
    findings.push({ severity: "info", title: "Suspended passive losses carry forward", detail: "A passive loss you cannot use is not lost: it carries forward, offsets future passive income and is released when you sell the whole interest in a fully taxable transaction." });
  }
  if (extraDepreciation > 0) {
    findings.push({ severity: "medium", title: "Cost segregation depreciation is recaptured when you sell", detail: "Reclassified 5, 7 and 15-year components are Section 1245 or land-improvement property, so gain up to the depreciation taken can be taxed as ordinary income at sale, and building depreciation is taxed up to 25% as unrecaptured Section 1250 gain. See the depreciation recapture calculator." });
  }
  findings.push({ severity: "info", title: "State tax may not follow federal bonus depreciation", detail: "Many states decouple from bonus depreciation or the passive rules, so the state rate you entered may overstate the state benefit. Check your state." });
  findings.push({ severity: "info", title: "Keep a contemporaneous time log", detail: "Material participation is the most-litigated element. Courts reject estimates reconstructed after the fact, and time spent as an investor (reviewing statements, monitoring finances) does not count." });

  return {
    status, participation: mp, path, usedAsHome, tooFewDays, base, seg, actual: { base: a, seg: b },
    extraDepreciation, extraSavings, studyCost, netCostSegBenefit: extraSavings - studyCost, findings,
  };
}
