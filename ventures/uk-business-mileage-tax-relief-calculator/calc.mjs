// UK business mileage tax relief for employees using their own vehicle (HMRC Approved Mileage Allowance Payments, AMAP).
// If your employer pays less than the approved rate per business mile, you can claim tax relief on the shortfall for four tax years back;
// if it pays more, the excess is taxable. Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory plus a web check of adviser summaries, NOT from HMRC's own pages: every result names GOV.UK as the source to verify.
// Modelled: AMAP rates unchanged since 2011 (car/van 45p to 10,000 business miles a tax year then 25p; motorcycle 24p; bicycle 20p; +5p a mile per
// business passenger); relief at the single marginal rate the user picks; claim deadline 5 April, five years after the tax year starts.
// Not modelled: employer NIC on excess payments, Scottish bands, mileage mixed across several vehicles, electric-car advisory fuel rates.

export const VERIFY = "GOV.UK 'Expenses and benefits: business travel mileage' (approved mileage rates), 'Claim tax relief for your job expenses' and HMRC form P87";
export const YEARS = { 2021: "2021/22", 2022: "2022/23", 2023: "2023/24", 2024: "2024/25", 2025: "2025/26" };
export const RATES = [19, 20, 21, 40, 42, 45, 48];
export const VEHICLES = { car: "Car or van", motorcycle: "Motorcycle", bicycle: "Bicycle" };
export const AMAP = { car: { first: 45, after: 25, threshold: 10000 }, motorcycle: { first: 24, after: 24, threshold: Infinity }, bicycle: { first: 20, after: 20, threshold: Infinity } };
export const PASSENGER_PENCE = 5;
export const P87_LIMIT = 2500;

const money = (n) => "GBP " + Number(Math.round(n * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;
const yn = (v) => v === true || v === "yes";

export function deadline(year) { return `${year + 5}-04-05`; }

// Approved amount in pounds for one tax year of business miles in one vehicle type.
export function approved(vehicle, miles, passengerMiles = 0) {
  const a = AMAP[vehicle];
  if (!a) return 0;
  const high = Math.min(miles, a.threshold), low = Math.max(0, miles - a.threshold);
  return r2((high * a.first + low * a.after + passengerMiles * PASSENGER_PENCE) / 100);
}

export function parse(input) {
  const i = input || {};
  const errors = [];
  const num = (v, label, max) => {
    if (v === undefined || v === null || v === "") return 0;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || (max !== undefined && n > max)) { errors.push(`Enter ${label} as ${max !== undefined ? `0 to ${max}` : "zero or more"}.`); return 0; }
    return n;
  };
  const miles = {};
  for (const y of Object.keys(YEARS)) miles[y] = num(i["miles" + y], `business miles in ${YEARS[y]}`, 200000);
  const vehicle = String(i.vehicle || "");
  if (!AMAP[vehicle]) errors.push("Pick the type of vehicle you use.");
  const paidPence = num(i.paidPence, "what your employer pays per business mile, in pence", 200);
  const passengerShare = num(i.passengerShare, "the share of miles with a business passenger, as a percentage", 100);
  const rate = Number(i.rate);
  if (!RATES.includes(rate)) errors.push("Pick your income tax rate.");
  const asOf = String(i.asOf || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || Number.isNaN(Date.parse(asOf))) errors.push("Enter today's date.");
  if (!errors.length && !Object.values(miles).some((m) => m > 0)) errors.push("Enter your business miles for at least one tax year.");
  return { errors, miles, vehicle, paidPence, passengerShare, rate, asOf, commute: yn(i.commute), sa: yn(i.sa) };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const { miles, vehicle, paidPence, passengerShare, rate, asOf, commute, sa } = p;
  const today = Date.parse(asOf);
  const rows = [];
  for (const y of Object.keys(YEARS).map(Number)) {
    const m = miles[y];
    if (!m) continue;
    const dl = deadline(y);
    const daysLeft = Math.ceil((Date.parse(dl) - today) / 86400000);
    const passengerMiles = m * passengerShare / 100;
    const allowance = approved(vehicle, m, passengerMiles);
    const paid = r2(m * paidPence / 100);
    const gap = r2(allowance - paid);
    const shortfall = gap > 0 ? gap : 0;
    const excess = gap < 0 ? -gap : 0;
    const relief = commute ? 0 : r2(shortfall * rate / 100);
    const taxOnExcess = commute ? 0 : r2(excess * rate / 100);
    const status = daysLeft < 0 ? "expired" : daysLeft <= 90 ? "urgent" : "open";
    rows.push({ year: y, label: YEARS[y], miles: m, allowance, paid, shortfall, excess, relief, taxOnExcess, deadline: dl, daysLeft, status });
  }
  const open = rows.filter((r) => r.status !== "expired");
  const expired = rows.filter((r) => r.status === "expired");
  const claimable = r2(open.reduce((s, r) => s + r.relief, 0));
  const lost = r2(expired.reduce((s, r) => s + r.relief, 0));
  const excessTax = r2(rows.reduce((s, r) => s + r.taxOnExcess, 0));
  const findings = [];
  if (commute) {
    findings.push({ severity: "high", title: "Ordinary commuting to your usual workplace is not business travel, so it earns no relief. Only trips to a temporary workplace or between workplaces count. On your answer there is no claim." });
  } else {
    const shortRows = open.filter((r) => r.shortfall > 0);
    if (shortRows.length) findings.push({ severity: "info", title: `Still claimable: ${money(claimable)} of tax back across ${shortRows.length} tax year${shortRows.length === 1 ? "" : "s"}, at ${rate}% on ${money(r2(shortRows.reduce((s, r) => s + r.shortfall, 0)))} of shortfall between the approved rate and what your employer paid.` });
    else findings.push({ severity: "info", title: "Your employer pays at least the approved rate for every open year, so there is nothing to reclaim." });
    if (expired.some((r) => r.relief > 0)) findings.push({ severity: "high", title: `Too late for ${expired.filter((r) => r.relief > 0).map((r) => r.label).join(", ")}: the four-year window has closed, which would have been ${money(lost)}.` });
    const urgent = open.filter((r) => r.status === "urgent" && r.relief > 0);
    if (urgent.length) findings.push({ severity: "high", title: `Closing within 90 days: ${urgent.map((r) => `${r.label} (by ${r.deadline})`).join(", ")}. Claim these first.` });
    if (excessTax > 0) findings.push({ severity: "medium", title: `In some years your employer pays more than the approved rate. The excess is taxable earnings and should go through payroll; at ${rate}% that is about ${money(excessTax)} of tax (employer National Insurance not included).` });
    if (paidPence === 0) findings.push({ severity: "info", title: "Nothing from your employer: the full approved rate is treated as your shortfall. Keep a mileage log, since HMRC can ask for dates, journeys and distances." });
  }
  const obligations = !commute && claimable > 0 ? [
    sa ? { ref: "SA", title: "Claim on your Self Assessment return", why: "Claim the shortfall in the employment expenses section of the return for each year, or amend a filed return within its deadline." }
       : { ref: "P87", title: "Claim online with form P87", why: "One claim per tax year when job expenses are under GBP 2,500. Have your Government Gateway login and National Insurance number ready." },
    { ref: "Log", title: "Keep a mileage log", why: "Date, start and end, purpose and miles for each business trip, plus payslips showing what your employer paid." },
    { ref: "Pay", title: "How the money arrives", why: "For past years HMRC usually refunds by cheque or bank transfer; for the current year it can change your tax code instead." },
  ] : [];
  return { errors: [], asOf, rate, vehicle, rows, claimable, lost, excessTax, commute, findings, obligations };
}

export const SAMPLE = { asOf: "2026-10-14", miles2021: 0, miles2022: 6000, miles2023: 7500, miles2024: 12000, miles2025: 9000, vehicle: "car", paidPence: 20, passengerShare: 0, rate: 20, commute: "no", sa: "no" };

export function summaryText(r) {
  const L = [`UK business mileage tax relief: backdated claim check as at ${r.asOf}`, "", `Vehicle: ${VEHICLES[r.vehicle]}`, `Income tax rate used: ${r.rate}%`, ""];
  for (const x of r.rows) L.push(`${x.label}: ${x.miles} miles, approved ${money(x.allowance)}, employer paid ${money(x.paid)}, shortfall ${money(x.shortfall)}, relief ${money(x.relief)}, claim by ${x.deadline} (${x.status})`);
  L.push("", `Total still claimable: ${money(r.claimable)}`, `Lost to the deadline: ${money(r.lost)}`, "", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Single marginal rate used; Scottish bands not modelled. Not tax advice. No warranty.");
  return L.join("\n");
}
