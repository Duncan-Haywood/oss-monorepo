// Private tutor effective hourly rate maths. Pure functions, no DOM, no network.
// Every figure is the tutor's own input; nothing here is a market rate.

export const SAMPLE = {
  sessions: "15", rate: "60", minutes: "60", prepMin: "20", travelMin: "25", inPerson: "50", cancelPct: "10",
  lateFee: "50", platformFee: "0", adminHours: "3", weeks: "40", expensesMonth: "120", target: "50",
};

const num = (v) => {
  const s = String(v ?? "").replace(/[$,%\s]/g, "");
  if (s === "") return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const opt = (v, d) => (String(v ?? "").trim() === "" ? d : num(v));
export const dollars = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (n) => Math.round(n * 100) / 100;

export function parse(raw) {
  const errors = [];
  const sessions = num(raw.sessions), rate = num(raw.rate), minutes = num(raw.minutes), weeks = num(raw.weeks);
  if (!(sessions > 0)) errors.push("Enter session slots booked per week (more than 0).");
  if (!(rate >= 0)) errors.push("Enter your rate per session (0 or more).");
  if (!(minutes > 0)) errors.push("Enter minutes per session (more than 0).");
  if (!(weeks > 0 && weeks <= 52)) errors.push("Enter weeks you work per year (more than 0, at most 52).");
  const prepMin = opt(raw.prepMin, 0), travelMin = opt(raw.travelMin, 0), inPerson = opt(raw.inPerson, 0);
  const cancelPct = opt(raw.cancelPct, 0), lateFee = opt(raw.lateFee, 0), platformFee = opt(raw.platformFee, 0);
  const adminHours = opt(raw.adminHours, 0), expensesMonth = opt(raw.expensesMonth, 0), target = opt(raw.target, 0);
  for (const [n, v] of [["Prep minutes", prepMin], ["Travel minutes", travelMin], ["Admin hours", adminHours], ["Monthly expenses", expensesMonth], ["Target hourly pay", target]])
    if (!(v >= 0)) errors.push(`${n} must be 0 or more.`);
  if (!(inPerson >= 0 && inPerson <= 100)) errors.push("In-person share must be from 0 to 100 percent.");
  if (!(cancelPct >= 0 && cancelPct < 100)) errors.push("Cancelled sessions must be from 0 to under 100 percent.");
  if (!(lateFee >= 0 && lateFee <= 100)) errors.push("Late-cancel fee collected must be from 0 to 100 percent of the rate.");
  if (!(platformFee >= 0 && platformFee < 100)) errors.push("Platform fee must be from 0 to under 100 percent.");
  return { errors, sessions, rate, minutes, weeks, prepMin, travelMin, inPerson, cancelPct, lateFee, platformFee, adminHours, expensesMonth, target };
}

// Weekly paid-for units: delivered sessions pay the full rate, cancelled slots pay the late fee share.
function week(p, sessions = p.sessions) {
  const c = p.cancelPct / 100;
  const delivered = sessions * (1 - c);
  const payUnits = delivered + sessions * c * (p.lateFee / 100); // multiples of one session rate
  const hours = delivered * (p.minutes + p.prepMin) / 60 + delivered * (p.inPerson / 100) * p.travelMin / 60 + p.adminHours;
  return { delivered, payUnits, hours, teachHours: delivered * p.minutes / 60 };
}
const net = (p, w, rate = p.rate) => w.payUnits * rate * (1 - p.platformFee / 100) * p.weeks - p.expensesMonth * 12;
// The rate that leaves `perHour` per hour worked: (perHour * hours + expenses) / (units * keep * weeks).
const rateFor = (p, w, perHour) => (perHour * w.hours * p.weeks + p.expensesMonth * 12) / (w.payUnits * (1 - p.platformFee / 100) * p.weeks);

export function compute(raw) {
  const p = parse(raw);
  if (p.errors.length) return { errors: p.errors };
  const w = week(p);
  const annualNet = net(p, w);
  const hoursYear = w.hours * p.weeks;
  const effective = annualNet / hoursYear;
  const quoted = p.rate * (1 - p.platformFee / 100) / (p.minutes / 60); // pay per teaching hour, before the extra unpaid time
  const gross = w.payUnits * p.rate * p.weeks;
  const platform = gross * p.platformFee / 100;
  const breakEvenRate = rateFor(p, w, 0), targetRate = rateFor(p, w, p.target);
  const sweep = [...new Set([5, 10, 15, 20, 25, 30, p.sessions])].filter((s) => s > 0).sort((a, b) => a - b).map((s) => {
    const x = week(p, s), n = net(p, x);
    return { sessions: s, hoursWeek: round2(x.hours), annualNet: round2(n), hourly: round2(n / (x.hours * p.weeks)) };
  });
  const findings = [];
  if (annualNet < 0) findings.push({ severity: "high", title: `Tutoring loses about ${dollars(-annualNet)} a year after expenses at this rate. The rate needs to be ${dollars(breakEvenRate)} a session just to break even.` });
  else if (effective < p.target) findings.push({ severity: "medium", title: `Your real pay is about ${dollars(effective)} an hour across all the time tutoring takes, short of your ${dollars(p.target)} target. A session rate of ${dollars(targetRate)} reaches it with the same schedule.` });
  if (quoted > 0 && effective < quoted * 0.7) findings.push({ severity: "medium", title: `The rate looks like ${dollars(quoted)} an hour, but prep, travel, admin and cancellations bring it to ${dollars(effective)}. ${((1 - effective / quoted) * 100).toFixed(0)}% of the rate you quote disappears into time and costs you do not bill.` });
  if (p.cancelPct >= 10 && p.lateFee < 100) findings.push({ severity: "info", title: `${p.cancelPct}% of slots cancelled and ${p.lateFee}% of the rate collected on them leaves ${dollars(p.sessions * (p.cancelPct / 100) * p.rate * (1 - p.lateFee / 100) * p.weeks)} a year unearned. A written 24-hour policy with a fee, or a prepaid block, recovers part of it.` });
  if (p.travelMin > 0 && p.inPerson > 0) findings.push({ severity: "info", title: `Travel adds about ${(w.delivered * (p.inPerson / 100) * p.travelMin / 60).toFixed(1)} unpaid hours a week. Charging a travel fee or batching in-person sessions by area raises your hourly pay without raising the headline rate.` });
  findings.push({ severity: "info", title: `At this schedule you work about ${w.hours.toFixed(1)} hours a week to teach ${w.teachHours.toFixed(1)}; each extra delivered session adds about ${dollars(p.rate * (1 - p.platformFee / 100))} and ${((p.minutes + p.prepMin) / 60 + (p.inPerson / 100) * p.travelMin / 60).toFixed(1)} hours.` });
  return { errors: [], input: p, weekHours: round2(w.hours), teachHours: round2(w.teachHours), delivered: round2(w.delivered), gross: round2(gross), platform: round2(platform), expenses: round2(p.expensesMonth * 12), annualNet: round2(annualNet), hoursYear: round2(hoursYear), effective: round2(effective), quoted: round2(quoted), breakEvenRate: round2(breakEvenRate), targetRate: round2(targetRate), findings, sweep };
}

export function summaryText(r) {
  const p = r.input;
  return [
    `Tutoring: ${p.sessions} session slots a week at ${dollars(p.rate)} for ${p.minutes} minutes, ${p.weeks} weeks a year`,
    `Yearly: income ${dollars(r.gross)}; platform fees ${dollars(r.platform)}; expenses ${dollars(r.expenses)}; net ${dollars(r.annualNet)}`,
    `Time: ${r.weekHours.toFixed(1)} hours a week worked, ${r.teachHours.toFixed(1)} of them teaching`,
    `Real hourly pay ${dollars(r.effective)} against ${dollars(r.quoted)} an hour as quoted`,
    `Rate to break even ${dollars(r.breakEvenRate)} a session; rate for your ${dollars(p.target)} an hour target ${dollars(r.targetRate)}`,
    ...r.findings.filter((f) => f.severity !== "info").map((f) => `- ${f.title}`),
  ].join("\n");
}

export function sweepCsv(r) {
  return ["sessions_per_week,hours_per_week,annual_net,effective_hourly", ...r.sweep.map((x) => `${x.sessions},${x.hoursWeek.toFixed(2)},${x.annualNet.toFixed(2)},${x.hourly.toFixed(2)}`)].join("\n");
}
