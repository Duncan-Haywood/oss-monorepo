// UK working-from-home tax relief: backdated claims for employees. The flat-rate relief (GBP 6 a week) ended on 6 April 2026,
// but claims for 2025/26 and earlier years stay open for four years after each tax year ends. This tool totals what is still claimable,
// year by year, with the deadline for each. Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory plus a web check of adviser summaries, NOT from HMRC's own pages: every result names GOV.UK as the source to verify.
// Modelled: flat rate GBP 6 a week in every year offered; relief at the single marginal rate the user picks; claim deadline 5 April, five years after the tax year starts
// (four years after it ends). Scottish rates are offered as marginal-rate choices but bands are not modelled.

export const VERIFY = "GOV.UK 'Tax relief for homeworking expenses' (employees), 'Claim tax relief for your job expenses' and HMRC form P87; Autumn Budget 2025 notice on removal of homeworking relief from 6 April 2026";
export const WEEKLY = 6;
export const YEARS = { 2021: "2021/22", 2022: "2022/23", 2023: "2023/24", 2024: "2024/25", 2025: "2025/26" };
export const RATES = [19, 20, 21, 40, 42, 45, 48];
export const P87_LIMIT = 2500;

const money = (n) => "GBP " + Number(Math.round(n * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;
const yn = (v) => v === true || v === "yes";

export function deadline(year) { return `${year + 5}-04-05`; }

export function parse(input) {
  const i = input || {};
  const errors = [];
  const num = (v, label, max) => {
    if (v === undefined || v === null || v === "") return 0;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || (max !== undefined && n > max)) { errors.push(`Enter ${label} as ${max !== undefined ? `0 to ${max}` : "zero or more"}.`); return 0; }
    return n;
  };
  const weeks = {};
  for (const y of Object.keys(YEARS)) weeks[y] = num(i["weeks" + y], `weeks worked from home in ${YEARS[y]}`, 53);
  const reimbursed = num(i.reimbursed, "what your employer pays you each year for home working");
  const actual = num(i.actual, "your extra household costs per year");
  const rate = Number(i.rate);
  if (!RATES.includes(rate)) errors.push("Pick your income tax rate.");
  const asOf = String(i.asOf || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || Number.isNaN(Date.parse(asOf))) errors.push("Enter today's date.");
  if (!errors.length && !Object.values(weeks).some((w) => w > 0)) errors.push("Enter the weeks you worked from home in at least one tax year.");
  return { errors, weeks, reimbursed, actual, rate, asOf, required: yn(i.required), sa: yn(i.sa) };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const { weeks, reimbursed, actual, rate, asOf, required, sa } = p;
  const today = Date.parse(asOf);
  const rows = [];
  for (const y of Object.keys(YEARS).map(Number)) {
    const w = weeks[y];
    if (!w) continue;
    const dl = deadline(y);
    const daysLeft = Math.ceil((Date.parse(dl) - today) / 86400000);
    const flat = Math.max(0, r2(w * WEEKLY - reimbursed * (w / 52)));
    const act = actual ? Math.max(0, r2(actual * (w / 52) - reimbursed * (w / 52))) : null;
    const expenses = act !== null && act > flat ? act : flat;
    const method = act !== null && act > flat ? "actual costs" : "flat rate";
    const relief = required ? r2(expenses * rate / 100) : 0;
    const status = daysLeft < 0 ? "expired" : daysLeft <= 90 ? "urgent" : "open";
    rows.push({ year: y, label: YEARS[y], weeks: w, flat, actual: act, expenses, method, relief, deadline: dl, daysLeft, status });
  }
  const open = rows.filter((r) => r.status !== "expired");
  const expired = rows.filter((r) => r.status === "expired");
  const claimable = r2(open.reduce((s, r) => s + r.relief, 0));
  const lost = r2(expired.reduce((s, r) => s + r.relief, 0));
  const findings = [];
  if (!required) {
    findings.push({ severity: "high", title: "Relief was only ever available if your employer required you to work from home. Choosing to, or being allowed to, did not qualify. On your answer there is no claim; check your contract and any written instruction." });
  } else {
    findings.push({ severity: "info", title: `Still claimable: ${money(claimable)} of tax back across ${open.length} tax year${open.length === 1 ? "" : "s"}, at ${rate}% on ${money(r2(open.reduce((s, r) => s + r.expenses, 0)))} of expenses.` });
    if (expired.length) findings.push({ severity: "high", title: `Too late for ${expired.map((r) => r.label).join(", ")}: the four-year window has closed, which would have been ${money(lost)}.` });
    const urgent = open.filter((r) => r.status === "urgent");
    if (urgent.length) findings.push({ severity: "high", title: `Closing within 90 days: ${urgent.map((r) => `${r.label} (by ${r.deadline})`).join(", ")}. Claim these first.` });
    if (rows.some((r) => r.method === "actual costs")) findings.push({ severity: "medium", title: "Actual costs beat the flat rate for at least one year, but you must be able to show the extra costs with bills. Only costs caused by working at home count, not your normal household bills." });
    if (reimbursed > 0) findings.push({ severity: "info", title: `Your employer's payments of ${money(reimbursed)} a year were taken off before working out relief; tax-free reimbursements cannot also be claimed.` });
  }
  findings.push({ severity: "info", title: "The relief ended on 6 April 2026 for new years. From then the only tax-free route is your employer paying the costs." });
  const obligations = required && open.length ? [
    sa ? { ref: "SA", title: "Claim on your Self Assessment return", why: "If you file a return for a year, claim the expense in the employment section of that return, or amend a filed return within its deadline." }
       : { ref: "P87", title: "Claim online with form P87", why: "One claim covers one tax year when expenses are under GBP 2,500. Have your Government Gateway login and National Insurance number ready, and submit one claim per year." },
    { ref: "Pay", title: "How the money arrives", why: "For past years HMRC usually refunds by cheque or bank transfer; for the current year it can change your tax code instead." },
    { ref: "Keep", title: "Keep your evidence", why: "A letter or email showing your employer required home working, and bills if you used actual costs. HMRC can ask for them." },
  ] : [];
  return { errors: [], asOf, rate, required, rows, claimable, lost, findings, obligations };
}

export const SAMPLE = { asOf: "2026-10-14", weeks2021: 0, weeks2022: 46, weeks2023: 46, weeks2024: 48, weeks2025: 48, rate: 20, required: "yes", reimbursed: 0, actual: "", sa: "no" };

export function summaryText(r) {
  const L = [`UK working-from-home tax relief: backdated claim check as at ${r.asOf}`, "", `Income tax rate used: ${r.rate}%`, `Employer required home working: ${r.required ? "yes" : "no"}`, ""];
  for (const x of r.rows) L.push(`${x.label}: ${x.weeks} weeks, ${money(x.expenses)} (${x.method}), relief ${money(x.relief)}, claim by ${x.deadline} (${x.status})`);
  L.push("", `Total still claimable: ${money(r.claimable)}`, `Lost to the deadline: ${money(r.lost)}`, "", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Single marginal rate used; Scottish bands not modelled. Not tax advice. No warranty.");
  return L.join("\n");
}
