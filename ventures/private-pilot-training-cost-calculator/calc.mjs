// Private pilot training cost maths. Pure functions, no DOM, no network.
// Every rate is the student's own input; nothing here is a market price or a
// prediction of how many hours any one student will need.

export const SAMPLE = {
  hours: "65", solo: "12", aircraftRate: "185", instructorRate: "65", briefing: "0.5", groundHours: "10",
  groundCourse: "250", medical: "150", written: "175", checkride: "800", gear: "500",
  flightsPerWeek: "2", hoursPerFlight: "1.3", clubDues: "75", clubRate: "150",
};

// 14 CFR 61.109: at least 40 hours of flight time, 20 with an instructor and 10 solo.
export const FAR_MIN_TOTAL = 40;
export const FAR_MIN_DUAL = 20;
export const FAR_MIN_SOLO = 10;

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
  const hours = num(raw.hours), aircraftRate = num(raw.aircraftRate), instructorRate = num(raw.instructorRate);
  if (!(hours >= FAR_MIN_TOTAL)) errors.push(`Enter total flight hours of at least ${FAR_MIN_TOTAL}, the FAA minimum for a private pilot certificate.`);
  if (!(aircraftRate > 0)) errors.push("Enter the aircraft rental rate per hour (more than 0).");
  if (!(instructorRate > 0)) errors.push("Enter the instructor rate per hour (more than 0).");
  const solo = opt(raw.solo, FAR_MIN_SOLO), briefing = opt(raw.briefing, 0.5), groundHours = opt(raw.groundHours, 0);
  const groundCourse = opt(raw.groundCourse, 0), medical = opt(raw.medical, 0), written = opt(raw.written, 0);
  const checkride = opt(raw.checkride, 0), gear = opt(raw.gear, 0);
  const flightsPerWeek = opt(raw.flightsPerWeek, 0), hoursPerFlight = opt(raw.hoursPerFlight, 1.3);
  const clubDues = opt(raw.clubDues, 0), clubRate = opt(raw.clubRate, 0);
  for (const [n, v] of [["Briefing hours", briefing], ["Ground instruction hours", groundHours], ["Ground course cost", groundCourse], ["Medical", medical], ["Written test", written], ["Checkride fee", checkride], ["Gear and books", gear], ["Flights per week", flightsPerWeek], ["Club dues", clubDues], ["Club rate", clubRate]])
    if (!(v >= 0)) errors.push(`${n} must be 0 or more.`);
  if (!(solo >= FAR_MIN_SOLO)) errors.push(`Solo hours must be at least ${FAR_MIN_SOLO}, the FAA minimum.`);
  else if (hours >= FAR_MIN_TOTAL && hours - solo < FAR_MIN_DUAL) errors.push(`Total hours minus solo hours leaves ${hours - solo} with an instructor; the FAA minimum is ${FAR_MIN_DUAL}.`);
  if (!(hoursPerFlight > 0 && hoursPerFlight <= 4)) errors.push("Hours per flight must be more than 0 and no more than 4.");
  return { errors, hours, solo, aircraftRate, instructorRate, briefing, groundHours, groundCourse, medical, written, checkride, gear, flightsPerWeek, hoursPerFlight, clubDues, clubRate };
}

function cost(p, hours) {
  const dual = hours - p.solo;
  const aircraft = hours * p.aircraftRate;
  const instructorHours = dual * (1 + p.briefing) + p.groundHours;
  const instructor = instructorHours * p.instructorRate;
  const fixed = p.groundCourse + p.medical + p.written + p.checkride + p.gear;
  return { dual, aircraft, instructor, instructorHours, fixed, total: aircraft + instructor + fixed };
}

export function compute(raw) {
  const p = parse(raw);
  if (p.errors.length) return { errors: p.errors };
  const c = cost(p, p.hours);
  const perFlightHour = c.total / p.hours;
  const marginalHour = p.aircraftRate + p.instructorRate * (1 + p.briefing);
  const weeks = p.flightsPerWeek > 0 ? p.hours / (p.flightsPerWeek * p.hoursPerFlight) : null;
  const perMonth = weeks === null ? null : c.total / (weeks * 12 / 52);
  const steps = [...new Set([FAR_MIN_TOTAL, 50, 60, 70, 80, 100, p.hours])].filter((h) => h >= FAR_MIN_TOTAL && h - p.solo >= FAR_MIN_DUAL).sort((a, b) => a - b);
  const scenarios = steps.map((h) => ({ hours: h, total: round2(cost(p, h).total) }));
  // Club against renting: the club charges monthly dues and a lower hourly rate.
  let club = null;
  if (p.clubRate > 0 && weeks !== null) {
    const months = weeks * 12 / 52;
    const clubAircraft = p.hours * p.clubRate + p.clubDues * months;
    const saving = p.hours * p.aircraftRate - clubAircraft;
    const perHourSaved = p.aircraftRate - p.clubRate;
    club = { months: round2(months), clubAircraft: round2(clubAircraft), saving: round2(saving), breakEvenHoursPerMonth: perHourSaved > 0 ? round2(p.clubDues / perHourSaved) : null, hoursPerMonth: round2(p.hours / months) };
  }
  const findings = [];
  if (p.hours < 60) findings.push({ severity: "medium", title: `You planned ${p.hours} flight hours. Schools and pilot groups commonly quote totals well above the ${FAR_MIN_TOTAL}-hour minimum, often 60 to 75, so check what your own school's students actually need. At ${p.hours + 20} hours this plan would cost ${dollars(cost(p, p.hours + 20).total)}.` });
  findings.push({ severity: "info", title: `Each extra hour of training costs about ${dollars(marginalHour)}: aircraft ${dollars(p.aircraftRate)} plus ${(1 + p.briefing).toFixed(2)} instructor hours at ${dollars(p.instructorRate)}. Ten more hours is ${dollars(marginalHour * 10)}.` });
  if (p.flightsPerWeek > 0 && p.flightsPerWeek < 1) findings.push({ severity: "medium", title: `Flying less than once a week. Many instructors find long gaps mean repeating material, which adds hours; the ${dollars(marginalHour)} per extra hour is the price of that.` });
  if (c.aircraft + c.instructor > 0.9 * c.total) findings.push({ severity: "info", title: `${((c.aircraft + c.instructor) / c.total * 100).toFixed(0)}% of the total is aircraft and instructor time. The fixed fees are not where the money goes.` });
  if (club && club.saving > 0) findings.push({ severity: "info", title: `At ${club.hoursPerMonth} flight hours a month a club saves about ${dollars(club.saving)} over renting. It breaks even at ${club.breakEvenHoursPerMonth} hours a month.` });
  else if (club && club.breakEvenHoursPerMonth !== null) findings.push({ severity: "medium", title: `At ${club.hoursPerMonth} flight hours a month the club costs about ${dollars(-club.saving)} more than renting. It only pays at ${club.breakEvenHoursPerMonth} hours a month or more.` });
  return { errors: [], input: p, total: round2(c.total), aircraft: round2(c.aircraft), instructor: round2(c.instructor), fixed: round2(c.fixed), perFlightHour: round2(perFlightHour), marginalHour: round2(marginalHour), dual: c.dual, weeks: weeks === null ? null : round2(weeks), perMonth: perMonth === null ? null : round2(perMonth), scenarios, club, findings };
}

export function summaryText(r) {
  const p = r.input;
  return [
    `Private pilot training: ${p.hours} flight hours (${r.dual} with an instructor, ${p.solo} solo) at ${dollars(p.aircraftRate)} aircraft and ${dollars(p.instructorRate)} instructor per hour`,
    `Total: ${dollars(r.total)} = aircraft ${dollars(r.aircraft)} + instructor ${dollars(r.instructor)} + fees and gear ${dollars(r.fixed)}`,
    `All-in per flight hour: ${dollars(r.perFlightHour)}; each extra hour of training: ${dollars(r.marginalHour)}`,
    r.weeks === null ? "Pace: no flights per week entered" : `Pace: about ${r.weeks.toFixed(0)} weeks, ${dollars(r.perMonth)} a month`,
    ...r.findings.filter((f) => f.severity !== "info").map((f) => `- ${f.title}`),
  ].join("\n");
}

export function scenariosCsv(r) {
  return ["flight_hours,total_cost", ...r.scenarios.map((x) => `${x.hours},${x.total.toFixed(2)}`)].join("\n");
}
