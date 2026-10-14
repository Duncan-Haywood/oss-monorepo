// UK Marriage Allowance calculator for 2025/26 and 2026/27.
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. Modelled: the lower-earning partner (income at or below the GBP 12,570 personal allowance) transfers
// 10% of the personal allowance (GBP 1,260, rounded up to the nearest GBP 10) to the higher-earning partner, who must pay tax at no more than the basic rate. The recipient's
// tax falls by 20% of the transfer (GBP 252). If the giver's income is above GBP 11,310 they use part of their own allowance and pay 20% on the part they gave away that
// they would have used. Backdating: a claim can cover the current year and up to four earlier tax years where both partners qualified; this tool assumes the same incomes each year.
// NOT modelled: Married Couple's Allowance (either partner born before 6 April 1935), the Blind Person's Allowance, savings and dividend allowances, Scottish bands beyond
// the recipient's upper limit, a recipient who has claimed or lost allowance through the 100k taper, and rates announced for later years. Every result names its source to verify.

export const VERIFY = "GOV.UK 'Marriage Allowance' (gov.uk/marriage-allowance) and 'Income Tax rates and Personal Allowances'; Income Tax Act 2007 s.55B-55D";
export const PA = 12570;
export const TRANSFER = 1260;
export const BASIC_RATE = 0.2;
export const LIMITS = { rest: { label: "England, Wales or Northern Ireland", upper: 50270 }, scot: { label: "Scotland", upper: 43662 } };
export const YEARS = { 2025: { label: "2025/26" }, 2026: { label: "2026/27" } };
export const MAX_BACKDATE = 4;
export const MAX_SAVING = TRANSFER * BASIC_RATE;

const money = (n) => (n < 0 ? "-" : "") + "GBP " + Number(Math.round(Math.abs(n) * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;

export function parse(input) {
  const i = input || {};
  const errors = [];
  const num = (key, label) => {
    const v = i[key];
    if (v === undefined || v === null || v === "") { errors.push(`Enter ${label}.`); return 0; }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) { errors.push(`Enter ${label} as zero or more.`); return 0; }
    return n;
  };
  const a = num("a", "the first partner's yearly income (zero if none)");
  const b = num("b", "the second partner's yearly income (zero if none)");
  const year = Number(i.year);
  if (!YEARS[year]) errors.push("Pick the tax year.");
  const region = i.region === undefined || i.region === "" ? "rest" : i.region;
  if (!LIMITS[region]) errors.push("Pick where the higher earner lives for tax.");
  let back = i.back === undefined || i.back === "" ? 0 : Number(i.back);
  if (!Number.isInteger(back) || back < 0 || back > MAX_BACKDATE) { errors.push(`Enter earlier years to backdate as a whole number from 0 to ${MAX_BACKDATE}.`); back = 0; }
  return { errors, a, b, year, region, back };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const { a, b, year, region, back } = p;
  const y = YEARS[year];
  const upper = LIMITS[region].upper;
  const low = Math.min(a, b), high = Math.max(a, b);

  const reasons = [];
  if (low > PA) reasons.push(`The lower earner's income of ${money(low)} is above the ${money(PA)} personal allowance, so there is no unused allowance to give away.`);
  if (high <= PA) reasons.push(`Neither partner pays income tax (the higher income is ${money(high)}, at or below ${money(PA)}), so there is no tax for the recipient to save.`);
  if (high > upper) reasons.push(`The higher earner's income of ${money(high)} is above ${money(upper)}, the top of the basic-rate band for ${LIMITS[region].label}, so they cannot receive the transfer.`);
  const eligible = reasons.length === 0;

  const giverUsedAllowance = r2(Math.max(0, low - (PA - TRANSFER)));
  const giverCost = eligible ? r2(giverUsedAllowance * BASIC_RATE) : 0;
  const gross = eligible ? MAX_SAVING : 0;
  const net = r2(gross - giverCost);
  const years = back + 1;
  const total = r2(net * years);

  const findings = [];
  const obligations = [];
  if (!eligible) {
    findings.push({ severity: "high", title: `On these figures you would not qualify for Marriage Allowance in ${y.label}. ${reasons[0]}` });
    for (const r of reasons.slice(1)) findings.push({ severity: "medium", title: r });
  } else if (net <= 0) {
    findings.push({ severity: "medium", title: `Transferring would save the higher earner ${money(gross)} but cost the lower earner the same in lost tax-free allowance, so the couple gain nothing in ${y.label}.` });
  } else {
    findings.push({ severity: "high", title: `You qualify on these figures: the couple save ${money(net)} in ${y.label}${back ? `, and ${money(total)} in total if the same applied in the ${back} earlier ${back === 1 ? "year" : "years"} you can claim for` : ""}.` });
    if (giverCost > 0) findings.push({ severity: "medium", title: `The lower earner's income of ${money(low)} is above ${money(PA - TRANSFER)}, so they use ${money(giverUsedAllowance)} of the allowance they give away and pay ${money(giverCost)} more tax. The saving is ${money(gross)} minus that.` });
    findings.push({ severity: "info", title: `The lower earner makes the claim, but the tax saving goes to the higher earner: through a lower tax code, or as a reduction in their Self Assessment bill. Backdated years are normally paid as a refund.` });
  }
  if (high > upper - 1000 && high <= upper) findings.push({ severity: "medium", title: `The higher earner is within ${money(upper - high)} of the basic-rate limit. A pay rise or extra income could make them ineligible for that year and ${back ? "affect the earlier years you want to backdate" : "later years"}.` });
  findings.push({ severity: "info", title: "Claiming is free on GOV.UK. Anyone charging a fee to claim Marriage Allowance for you is not needed; use the official service with your National Insurance numbers and a Government Gateway or One Login account." });
  findings.push({ severity: "info", title: "Not modelled: Married Couple's Allowance (a partner born before 6 April 1935), the Blind Person's Allowance, different incomes in earlier years, Scottish rates in detail, savings and dividend income, and anything that changed after this was written. You must be married or in a civil partnership." });

  if (eligible) {
    obligations.push({ ref: "Apply", title: "Lower earner applies on GOV.UK", why: "Search 'Marriage Allowance' on GOV.UK. You need both partners' National Insurance numbers and the lower earner's identity sign-in. It takes a few minutes and is free." });
    obligations.push({ ref: "Backdate", title: "Claim earlier years in the same application", why: `You can ask for the current year and up to ${MAX_BACKDATE} earlier tax years in which you were both eligible and married or in a civil partnership. HMRC will pay the higher earner a refund for earlier years.` });
    obligations.push({ ref: "Renews", title: "It renews automatically", why: "Once accepted it continues each year until you cancel or your circumstances change (divorce, a death, or incomes outside the limits). Tell HMRC if either partner's income changes." });
  }
  return { errors: [], label: y.label, year, region, regionLabel: LIMITS[region].label, a, b, low, high, upper, eligible, reasons, giverUsedAllowance, giverCost, gross, net, back, years, total, findings, obligations };
}

export const SAMPLE = { year: 2025, region: "rest", a: 9000, b: 32000, back: 4 };

export function summaryText(r) {
  const L = [`UK Marriage Allowance, ${r.label}`, "", `Partner incomes: ${money(r.a)} and ${money(r.b)}`, `Higher earner taxed in: ${r.regionLabel}`, "", `Eligible: ${r.eligible ? "yes" : "no"}`];
  if (r.eligible) L.push(`Allowance transferred: ${money(TRANSFER)}`, `Tax saved by the higher earner: ${money(r.gross)}`, `Extra tax for the lower earner: ${money(r.giverCost)}`, `Net saving for ${r.label}: ${money(r.net)}`, `Years claimed (current plus ${r.back} earlier): ${r.years}`, `Total across years: ${money(r.total)}`);
  L.push("", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not tax advice. No warranty.");
  return L.join("\n");
}
