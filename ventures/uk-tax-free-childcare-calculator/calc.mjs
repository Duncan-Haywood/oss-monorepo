// UK childcare support for working parents (England): free childcare hours,
// Tax-Free Childcare top-up and the Universal Credit childcare alternative.
// Browser-only, no network. Not advice.
//
// Figures to verify on GOV.UK ("Tax-Free Childcare", "30 hours free childcare",
// "Universal Credit: help with childcare costs"). `verified: false` rows are
// assumptions for a year not yet checked against GOV.UK.
export const YEARS = {
  "2025-26": { nlw: 12.21, ucOne: 1031.88, ucTwo: 1768.94, verified: true },
  "2026-27": { nlw: 12.71, ucOne: 1031.88, ucTwo: 1768.94, verified: false },
};
export const TFC_RATE = 0.2; // government adds 20p for every 80p paid in
export const TFC_CAP = 2000; // per child per year
export const TFC_CAP_DISABLED = 4000;
export const ANI_LIMIT = 100000;
export const UC_SHARE = 0.85;
export const FUNDED_WEEKS = 38;

export const SAMPLE = {
  nation: "england",
  year: "2026-27",
  p1Status: "working", p1Earnings: "38000", p1Ani: "",
  p2Status: "working", p2Earnings: "26000", p2Ani: "",
  minWage: "",
  mode: "term",
  c1Age: "9m", c1Hours: "30", c1Rate: "7.50", c1Weeks: "50", c1Disabled: "no",
  c2Age: "school", c2Hours: "10", c2Rate: "4.50", c2Weeks: "40", c2Disabled: "no",
  c3Age: "none", c3Hours: "", c3Rate: "", c3Weeks: "", c3Disabled: "no",
};

const round2 = (n) => Math.round(n * 100) / 100;
const money = (n) => "£" + round2(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v) => (v === "" || v == null ? null : Number(v));

// Hours a week of free childcare for a child, in England.
// 30 hours: working parents, from the term after 9 months until school age.
// 15 hours: all 3 and 4 year olds, whether or not the parents work.
export function entitlement(age, qualifies) {
  if (age === "9m" || age === "3-4") return qualifies ? 30 : age === "3-4" ? 15 : 0;
  return 0;
}

function parentCheck(label, status, earnings, ani, quarterMin, limit) {
  const out = { label, pass: true, reasons: [] };
  const aniVal = ani == null ? earnings : ani;
  if (status === "none") return { label, present: false, pass: true, reasons: [] };
  out.present = true;
  if (status === "notWorking") { out.pass = false; out.reasons.push(`${label} is not working, and both parents (in a couple) must be in work, on statutory leave, or otherwise exempt.`); }
  else if (status === "working") {
    if (earnings == null) { out.pass = false; out.reasons.push(`Enter ${label}'s expected yearly earnings.`); }
    else if (earnings / 4 < quarterMin) { out.pass = false; out.reasons.push(`${label} expects to earn about ${money(earnings / 4)} a quarter, below the ${money(quarterMin)} a quarter (16 hours a week at minimum wage) needed.`); }
  }
  if (aniVal != null && aniVal > limit) { out.pass = false; out.reasons.push(`${label}'s adjusted net income of ${money(aniVal)} is over the ${money(limit)} limit: any parent over it loses all free hours and Tax-Free Childcare.`); }
  return out;
}

export function compute(raw) {
  const errors = [];
  if (raw.nation !== "england") errors.push("This calculator models England. Scotland, Wales and Northern Ireland have different free hours and rules; Tax-Free Childcare applies in all four, so check the free-hours rules for your nation on GOV.UK or mygov.scot / gov.wales / nidirect.gov.uk.");
  const yr = YEARS[raw.year];
  if (!yr) errors.push("Choose a tax year.");
  if (errors.length) return { errors };

  const override = num(raw.minWage);
  if (override !== null && !(override > 0 && override < 50)) return { errors: ["Minimum wage override must be an hourly rate in pounds."] };
  const nlw = override ?? yr.nlw;
  const quarterMin = round2(16 * nlw * 13);

  const p1 = parentCheck("Parent 1", raw.p1Status, num(raw.p1Earnings), num(raw.p1Ani), quarterMin, ANI_LIMIT);
  const p2 = parentCheck("Parent 2", raw.p2Status, num(raw.p2Earnings), num(raw.p2Ani), quarterMin, ANI_LIMIT);
  if (raw.p1Status === "none") return { errors: ["Parent 1 must be a parent in the household; leave Parent 2 as 'No partner' for a single parent."] };
  const parents = [p1, p2].filter((p) => p.present);
  const eligible = parents.every((p) => p.pass);

  const children = [];
  for (const i of [1, 2, 3]) {
    const age = raw[`c${i}Age`];
    if (!age || age === "none") continue;
    const hours = num(raw[`c${i}Hours`]);
    const rate = num(raw[`c${i}Rate`]);
    const weeks = num(raw[`c${i}Weeks`]);
    if (!(hours > 0) || hours > 100) { errors.push(`Child ${i}: enter the hours a week in childcare (1 to 100).`); continue; }
    if (!(rate > 0)) { errors.push(`Child ${i}: enter the hourly rate you pay.`); continue; }
    if (!(weeks > 0 && weeks <= 52)) { errors.push(`Child ${i}: enter the weeks a year in childcare (1 to 52).`); continue; }
    children.push({ i, age, hours, rate, weeks, disabled: raw[`c${i}Disabled`] === "yes" });
  }
  if (!children.length && !errors.length) errors.push("Enter at least one child with hours, hourly rate and weeks.");
  if (errors.length) return { errors };

  const rows = children.map((c) => {
    const weekly = entitlement(c.age, eligible);
    const gross = c.hours * c.rate * c.weeks;
    let fundedHours = 0;
    if (weekly > 0) {
      if (raw.mode === "stretch") fundedHours = Math.min(weekly * FUNDED_WEEKS, c.hours * c.weeks);
      else fundedHours = Math.min(weekly, c.hours) * Math.min(FUNDED_WEEKS, c.weeks);
    }
    const fundedValue = round2(fundedHours * c.rate);
    const toPay = round2(gross - fundedValue);
    const cap = c.disabled ? TFC_CAP_DISABLED : TFC_CAP;
    const topUp = eligible ? round2(Math.min(toPay * TFC_RATE, cap)) : 0;
    return { ...c, weekly, gross: round2(gross), fundedHours: Math.round(fundedHours * 10) / 10, fundedValue, toPay, cap, topUp, youPay: round2(toPay - topUp) };
  });

  const sum = (k) => round2(rows.reduce((s, r) => s + r[k], 0));
  const totals = { gross: sum("gross"), fundedValue: sum("fundedValue"), fundedHours: Math.round(rows.reduce((s, r) => s + r.fundedHours, 0) * 10) / 10, toPay: sum("toPay"), topUp: sum("topUp"), youPay: sum("youPay") };

  // Universal Credit childcare element: 85% of costs after free hours, monthly cap by child count.
  // Only available if you already get (or would qualify for) UC; not combinable with Tax-Free Childcare.
  const ucCap = rows.length >= 2 ? yr.ucTwo : yr.ucOne;
  const ucMonthly = Math.min((totals.toPay / 12) * UC_SHARE, ucCap);
  const uc = { cap: ucCap, perYear: round2(ucMonthly * 12), youPay: round2(totals.toPay - ucMonthly * 12) };

  const findings = [];
  for (const p of parents) {
    if (!p.pass) for (const r of p.reasons) findings.push({ severity: "high", title: r });
  }
  if (eligible) findings.push({ severity: "info", title: `Both tests passed on these figures: minimum earnings of ${money(quarterMin)} a quarter (16 hours at ${money(nlw)} an hour) and adjusted net income at or under ${money(ANI_LIMIT)}.` });
  else findings.push({ severity: "high", title: "On these figures the household would not qualify for the 30 hours or for Tax-Free Childcare. Only the 15 free hours for 3 and 4 year olds would apply." });
  if (totals.fundedHours > 0) findings.push({ severity: "info", title: `Free hours cover ${totals.fundedHours} hours a year, worth ${money(totals.fundedValue)} at your hourly rate. Providers often fund these at a lower rate than they charge, so check what extras they bill.` });
  if (eligible && totals.topUp > 0) findings.push({ severity: "info", title: `Tax-Free Childcare adds ${money(totals.topUp)} a year: 20p for every 80p you pay in, up to ${money(TFC_CAP)} per child (${money(TFC_CAP_DISABLED)} if disabled).` });
  if (eligible && rows.some((r) => r.toPay * TFC_RATE > r.cap)) findings.push({ severity: "medium", title: "At least one child's costs hit the Tax-Free Childcare cap, so extra spending on that child earns no more top-up." });
  if (uc.perYear > totals.topUp) findings.push({ severity: "medium", title: `If you are on Universal Credit, its childcare element could repay up to ${money(uc.perYear)} a year (85% of costs after free hours, capped at ${money(ucCap)} a month), more than Tax-Free Childcare. You cannot get both for the same costs.` });
  if (!yr.verified) findings.push({ severity: "medium", title: `The ${raw.year.replace("-", "/")} minimum wage and Universal Credit caps are assumptions not yet checked: confirm them on GOV.UK, or type the minimum wage in the override box.` });
  if (raw.p1Status === "working" && raw.p2Status === "working") {
    const ani = Math.max(num(raw.p1Ani) ?? num(raw.p1Earnings) ?? 0, num(raw.p2Ani) ?? num(raw.p2Earnings) ?? 0);
    if (ani > 90000 && ani <= ANI_LIMIT) findings.push({ severity: "medium", title: `Adjusted net income of ${money(ani)} is within ${money(ANI_LIMIT - ani)} of the ${money(ANI_LIMIT)} cliff. A pension contribution or Gift Aid donation lowers it.` });
  }

  const obligations = [
    { title: "Create a childcare account", why: "Apply at GOV.UK (Childcare Choices). One application covers Tax-Free Childcare and the 30 hours; you get a code for the free hours." },
    { title: "Apply before the term deadline", why: "Free hours start the term after the child turns 9 months (or 3). The cut-offs are 31 August, 31 December and 31 March; applying early in the term before can matter." },
    { title: "Reconfirm every 3 months", why: "You must confirm your details each quarter or the account closes. Pay in money, and the government adds its top-up as you pay the provider." },
    { title: "Use a registered provider", why: "Ofsted/CQC-registered nurseries, childminders, clubs and holiday schemes qualify; family and friends usually do not." },
    { title: "Don't mix routes", why: "Tax-Free Childcare cannot be combined with Universal Credit childcare, tax credits or childcare vouchers for the same costs. Pick the better one." },
  ];

  return { errors: [], year: raw.year, nlw, quarterMin, eligible, parents, rows, totals, uc, findings, obligations };
}

export function summaryText(r) {
  return [
    `UK childcare support, England, ${r.year.replace("-", "/")}`,
    `Qualifies for free hours and Tax-Free Childcare on these figures: ${r.eligible ? "yes" : "no"}`,
    `Childcare at your rates ${money(r.totals.gross)}; free hours cover ${money(r.totals.fundedValue)} (${r.totals.fundedHours} hours); left to pay ${money(r.totals.toPay)}`,
    `Tax-Free Childcare top-up ${money(r.totals.topUp)}; you pay ${money(r.totals.youPay)} a year (${money(r.totals.youPay / 12)} a month)`,
    `Universal Credit route (if you qualify, not combinable): up to ${money(r.uc.perYear)} back, you pay ${money(r.uc.youPay)}`,
    "Verify rates and eligibility on GOV.UK (Childcare Choices) before relying on this. Not advice.",
  ].join("\n");
}
