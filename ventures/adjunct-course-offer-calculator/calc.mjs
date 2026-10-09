// Adjunct and part-time instructor course offers: what a per-course contract really pays per hour once you count
// prep, grading that scales with enrolment, unpaid office hours and email, unpaid training and meetings, the drive,
// what the drive and parking cost, and the chance the section is cancelled for low enrolment. It compares up to three
// offers side by side, shows the per-course pay that would reach an hourly target, and the largest class you should
// accept at the pay on offer.
// Pure functions, nothing leaves the browser.
//
// Net per course = expected pay - driving, parking and fees.
//   expected pay = pay x (1 - cancellation chance) + kill fee x cancellation chance
// Hours per course = weeks x (class + prep + office hours + email + students x grading minutes / 60)
//                  + unpaid training and meeting hours + weeks x trips x commute minutes / 60
// Cancellation is applied to pay only, not to hours: sections are usually cancelled after prep has begun, so this is
// the conservative reading. The default figures are placeholders, not any school's contract.

export const OFFER_DEFAULTS = {
  pay: 3000,            // gross pay for the course, dollars
  weeks: 16,            // weeks you work the course, counting exam week
  classHours: 3,        // hours in the room (or live online) per week
  prepHours: 3,         // prep and lecture writing per week
  students: 25,         // enrolment you expect
  gradeMin: 12,         // grading and feedback per student per week, minutes
  officeHours: 1,       // unpaid office hours per week
  emailHours: 1,        // student email and course-site upkeep per week
  unpaidHours: 10,      // unpaid orientation, training, meetings and set-up for the term, hours
  commuteMin: 60,       // round-trip travel per campus day, minutes (0 if online)
  trips: 2,             // campus days per week
  tripCost: 12,         // gas, tolls and parking per campus day, dollars
  fees: 0,              // permit, software or textbook costs for the term, dollars
  cancelPct: 10,        // chance the section is cancelled for low enrolment, percent
  killFee: 0,           // what the school pays if it cancels, dollars
};
export const SHARED_DEFAULTS = {
  coursesPerTerm: 2,    // sections you would teach in a term
  termsPerYear: 2,      // paid terms per year (a summer term would make it 3)
  targetHourly: 30,     // what an hour of your time has to earn, dollars
  minWage: 7.25,        // minimum wage that applies to you, dollars per hour
};
export const DEFAULTS = { ...OFFER_DEFAULTS, ...SHARED_DEFAULTS };

export const num = (s) => {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[$,%\s]/g, "");
  return t === "" ? NaN : Number(t);
};
export const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;
export const money2 = (x) => `${x < 0 ? "-" : ""}$${Math.abs(x).toFixed(2)}`;
export const pct = (x) => `${(Math.round(x * 10) / 10).toFixed(1)}%`;

const hrs = (x) => (Number.isFinite(x) ? x.toFixed(0) : "-");

// Fill every offer field from typed text, falling back to the default for blanks.
export function readOffer(raw) {
  const o = { ...OFFER_DEFAULTS };
  for (const k of Object.keys(OFFER_DEFAULTS)) if (raw && Number.isFinite(num(raw[k]))) o[k] = num(raw[k]);
  return o;
}
export function readShared(raw) {
  const s = { ...SHARED_DEFAULTS };
  for (const k of Object.keys(SHARED_DEFAULTS)) if (raw && Number.isFinite(num(raw[k]))) s[k] = num(raw[k]);
  return s;
}

export function offerWarnings(o) {
  const w = [];
  for (const k of Object.keys(OFFER_DEFAULTS)) if (o[k] < 0) w.push(`${k} cannot be negative.`);
  if (!(o.weeks > 0)) w.push("Enter the weeks you work the course, above zero.");
  if (!(o.pay > 0)) w.push("Enter the pay for the course, above zero.");
  if (o.cancelPct >= 100) w.push("Cancellation chance must be under 100%.");
  return w;
}

// Hours, cost and pay for one course.
export function courseEconomics(o, students = o.students) {
  const grading = (students * o.gradeMin) / 60;
  const weeklyWork = o.classHours + o.prepHours + o.officeHours + o.emailHours + grading;
  const workHours = o.weeks * weeklyWork + o.unpaidHours;
  const commuteHours = (o.weeks * o.trips * o.commuteMin) / 60;
  const allHours = workHours + commuteHours;
  const c = o.cancelPct / 100;
  const expectedPay = o.pay * (1 - c) + o.killFee * c;
  const direct = o.weeks * o.trips * o.tripCost + o.fees;
  const net = expectedPay - direct;
  const contactHours = o.weeks * o.classHours;
  return {
    students, grading, weeklyWork, workHours, commuteHours, allHours, expectedPay, direct, net,
    contactHours,
    // The rate on the contract: pay over hours in the room, the figure a department quotes.
    quotedHourly: contactHours > 0 ? o.pay / contactHours : NaN,
    hourlyWork: workHours > 0 ? net / workHours : NaN,
    hourly: allHours > 0 ? net / allHours : NaN,
  };
}

// Per-course pay that would reach `target` dollars per hour, with the class and costs as typed.
export function payForTarget(o, target) {
  const e = courseEconomics(o);
  const c = o.cancelPct / 100;
  if (c >= 1) return NaN;
  return (target * e.allHours + e.direct - o.killFee * c) / (1 - c);
}

// Largest class that still earns `target` per hour at the pay on offer; null if even an empty class falls short,
// Infinity if grading takes no time.
export function maxStudents(o, target) {
  if (!(target > 0)) return null;
  const e = courseEconomics(o, 0);
  const hoursAvailable = e.net / target;
  const spare = hoursAvailable - e.allHours;
  if (spare < 0) return null;
  const perStudent = (o.weeks * o.gradeMin) / 60;
  return perStudent > 0 ? Math.floor(spare / perStudent) : Infinity;
}

export function enrolmentLadder(o, steps = [10, 15, 20, 25, 30, 40]) {
  return steps.map((n) => {
    const e = courseEconomics(o, n);
    return { students: n, hours: e.allHours, hourly: e.hourly };
  });
}

export function analyzeOffer(raw, shared = SHARED_DEFAULTS) {
  const o = readOffer(raw);
  const warnings = offerWarnings(o);
  if (warnings.length) return { opts: o, warnings, e: null };
  const e = courseEconomics(o);
  const annualCourses = shared.coursesPerTerm * shared.termsPerYear;
  const w = [];
  if (e.hourly < shared.minWage) w.push(`After unpaid work, travel and costs this course pays ${money2(e.hourly)} an hour, below the ${money2(shared.minWage)} minimum wage you entered.`);
  else if (e.hourly < shared.targetHourly) w.push(`This course pays ${money2(e.hourly)} an hour against your ${money2(shared.targetHourly)} target.`);
  if (e.net < 0) w.push("Driving and fees cost more than the expected pay.");
  if (e.hourly > 0 && e.quotedHourly / e.hourly > 3) w.push(`The contract rate per hour in the room (${money2(e.quotedHourly)}) is more than three times what the course really pays per hour of your time.`);
  return {
    opts: o, warnings: w, e,
    targetPay: payForTarget(o, shared.targetHourly),
    maxClass: maxStudents(o, shared.targetHourly),
    ladder: enrolmentLadder(o),
    annual: { courses: annualCourses, net: e.net * annualCourses, hours: e.allHours * annualCourses },
  };
}

// Compare the offers that have a pay entered. Offers are { name, ...fields }.
export function compare(offers, rawShared) {
  const shared = readShared(rawShared);
  const rows = offers
    .map((raw, i) => ({ i, name: (raw && raw.name) || `Offer ${String.fromCharCode(65 + i)}`, raw }))
    .filter((x) => x.raw && Number.isFinite(num(x.raw.pay)) && num(x.raw.pay) > 0)
    .map((x) => ({ ...x, a: analyzeOffer(x.raw, shared) }));
  const valid = rows.filter((r) => r.a.e);
  const ranked = [...valid].sort((p, q) => q.a.e.hourly - p.a.e.hourly);
  const bad = rows.filter((r) => !r.a.e);
  return { shared, rows, ranked, bad, best: ranked[0] || null };
}

export function toCsv(cmp) {
  if (!cmp || !cmp.ranked.length) return "";
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  return [
    "offer,gross_pay,expected_pay,direct_costs,net_per_course,work_hours,commute_hours,effective_hourly,contract_hourly,pay_for_target,max_students_at_target,annual_net,annual_hours",
    ...cmp.ranked.map((r) => {
      const { e, targetPay, maxClass, annual, opts } = r.a;
      return [q(r.name), opts.pay.toFixed(2), e.expectedPay.toFixed(2), e.direct.toFixed(2), e.net.toFixed(2), hrs(e.workHours), hrs(e.commuteHours),
        e.hourly.toFixed(2), e.quotedHourly.toFixed(2), targetPay.toFixed(2), maxClass === null ? "" : Number.isFinite(maxClass) ? maxClass : "any",
        annual.net.toFixed(2), hrs(annual.hours)].join(",");
    }),
  ].join("\n") + "\n";
}
