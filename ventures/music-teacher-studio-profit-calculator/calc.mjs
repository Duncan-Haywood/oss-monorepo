// Music teacher studio profit. Pure arithmetic over what an independent private music teacher (piano, guitar, voice, strings) types in: three kinds of lesson (30-minute
// private, 45 or 60-minute private, group or theory class) with weekly bookings, price, lesson minutes, unpaid prep minutes and materials each; a late-cancel and no-show rate
// with a make-up and late-cancel-fee policy; weeks taught against weeks billed; studio rent, instruments, recital costs and in-home travel; and three ways to run the work:
// teach privately, teach for a music school at a percentage split, or rent a room by the hour and teach there. Nothing is stored.

const round1 = (x) => Math.round((x + Number.EPSILON) * 10) / 10;
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (s) => Number(String(s ?? "").replace(/[$,%\s_]/g, ""));

export const SERVICES = [
  { id: "short", label: "30-minute private lessons", home: true },
  { id: "long", label: "45 or 60-minute private lessons", home: true },
  { id: "group", label: "Group or theory classes", home: false },
];

const NUMERIC = [
  "shortQty", "shortPrice", "shortMin", "shortPrep", "shortMat",
  "longQty", "longPrice", "longMin", "longPrep", "longMat",
  "groupQty", "groupPrice", "groupMin", "groupPrep", "groupMat",
  "cancelPct", "chargedPct", "makeupPct", "weeksTaught", "weeksBilled", "adminHoursWeek", "targetHourly",
  "inHomePct", "travelMin", "travelCost",
  "rentPerMonth", "equipmentCost", "equipmentYears", "otherFixedMonth", "recitalCostYear", "recitalIncomeYear",
  "schoolPct", "schoolFillPct", "schoolAdminHours", "schoolCancelPaidPct", "roomHourly",
];

export function readInput(input) {
  const f = (k, d = 0) => (input[k] === undefined || input[k] === "" ? d : num(input[k]));
  const v = {
    shortQty: f("shortQty"), shortPrice: f("shortPrice", 35), shortMin: f("shortMin", 30), shortPrep: f("shortPrep", 10), shortMat: f("shortMat", 1),
    longQty: f("longQty"), longPrice: f("longPrice", 60), longMin: f("longMin", 60), longPrep: f("longPrep", 15), longMat: f("longMat", 2),
    groupQty: f("groupQty"), groupPrice: f("groupPrice", 80), groupMin: f("groupMin", 60), groupPrep: f("groupPrep", 30), groupMat: f("groupMat", 5),
    cancelPct: f("cancelPct", 8), chargedPct: f("chargedPct", 25), makeupPct: f("makeupPct", 50),
    weeksTaught: f("weeksTaught", 40), weeksBilled: f("weeksBilled", 36), adminHoursWeek: f("adminHoursWeek", 3), targetHourly: f("targetHourly", 40),
    inHomePct: f("inHomePct"), travelMin: f("travelMin", 40), travelCost: f("travelCost", 6),
    rentPerMonth: f("rentPerMonth"), equipmentCost: f("equipmentCost"), equipmentYears: f("equipmentYears", 10), otherFixedMonth: f("otherFixedMonth"),
    recitalCostYear: f("recitalCostYear"), recitalIncomeYear: f("recitalIncomeYear"),
    schoolPct: f("schoolPct", 50), schoolFillPct: f("schoolFillPct", 100), schoolAdminHours: f("schoolAdminHours", 0.5), schoolCancelPaidPct: f("schoolCancelPaidPct", 50),
    roomHourly: f("roomHourly", 18),
  };
  for (const k of NUMERIC) if (!Number.isFinite(v[k]) || v[k] < 0) return { error: `Check the ${k}: use a plain number that is not negative.` };
  for (const k of ["shortQty", "longQty", "groupQty"]) if (!Number.isInteger(v[k])) return { error: `${k} must be a whole number of lessons per week.` };
  const booked = v.shortQty + v.longQty + v.groupQty;
  if (booked < 1) return { error: "Enter how many lessons or classes you book in a typical teaching week." };
  if (booked > 200) return { error: "That is far more than one teacher can book in a week: check the quantities." };
  if (v.cancelPct > 90) return { error: "Late-cancel and no-show rate is a percent of booked lessons: keep it at or below 90." };
  if (v.chargedPct + v.makeupPct > 100) return { error: "Of the cancelled lessons, the share you charge for and the share you make up cannot add up to more than 100 percent." };
  if (v.weeksTaught < 1 || v.weeksTaught > 52) return { error: "Weeks taught per year must be between 1 and 52." };
  if (v.weeksBilled > 52) return { error: "Weeks billed per year cannot be more than 52." };
  if (v.inHomePct > 100) return { error: "In-home share is a percent of private lessons: keep it at or below 100." };
  if (v.equipmentYears < 0.5) return { error: "The instruments and equipment must be spread over at least half a year." };
  if (v.schoolPct > 100) return { error: "The school split is the percent of the tuition you keep: keep it at or below 100." };
  if (v.schoolCancelPaidPct > 100) return { error: "The share of cancellations the school still pays you for must be at or below 100." };
  if (v.schoolFillPct > 300) return { error: "School fill is the percent of your current lessons the school would send you: keep it at or below 300." };
  for (const s of SERVICES) if (v[s.id + "Min"] <= 0 && v[s.id + "Qty"] > 0) return { error: `Enter the minutes for ${s.label.toLowerCase()}.` };
  return { v };
}

// Cancellation policy: of the booked lessons a share cancel late or do not show. A charged cancellation pays the fee and frees the slot; a made-up one is taught again in
// another slot for the one fee; the rest are lost. "tf" is the share of booked lessons actually taught, "lost" the share earning nothing.
export function policy(v) {
  const c = v.cancelPct / 100, ch = v.chargedPct / 100, mk = v.makeupPct / 100;
  const lost = c * (1 - ch) * (1 - mk);
  const makeup = c * (1 - ch) * mk;
  return { lost, makeup, tf: 1 - c + makeup, paid: 1 - lost };
}

export function fixedCosts(v) {
  const rent = v.rentPerMonth * 12;
  const equipment = v.equipmentCost / v.equipmentYears;
  const other = v.otherFixedMonth * 12;
  const recital = v.recitalCostYear;
  const total = rent + equipment + other + recital;
  return { rent: round2(rent), equipment: round2(equipment), other: round2(other), recital: round2(recital), recitalIncome: round2(v.recitalIncomeYear), total: round2(total), totalRaw: total, net: round2(total - v.recitalIncomeYear), netRaw: total - v.recitalIncomeYear };
}

// Weekly quantities for one teaching week, then annualised: revenue over weeks billed, hours and variable costs over weeks taught.
function week(v, scale = 1) {
  const p = policy(v);
  const w = { booked: 0, taught: 0, revenue: 0, lostRevenue: 0, mat: 0, mileage: 0, teachH: 0, travelH: 0, bookedH: 0, studioBookedH: 0, makeupH: 0, makeupLessons: 0, lostLessons: 0, perLessonHours: 0 };
  for (const s of SERVICES) {
    const q = Math.round(v[s.id + "Qty"] * scale), price = v[s.id + "Price"], min = v[s.id + "Min"], prep = v[s.id + "Prep"], mat = v[s.id + "Mat"];
    const home = s.home ? v.inHomePct / 100 : 0;
    const taught = q * p.tf;
    w.booked += q; w.taught += taught;
    w.revenue += q * p.paid * price; w.lostRevenue += q * p.lost * price; w.lostLessons += q * p.lost;
    w.mat += taught * mat; w.mileage += taught * home * v.travelCost;
    w.teachH += (taught * (min + prep)) / 60; w.travelH += (taught * home * v.travelMin) / 60;
    w.bookedH += (q * min) / 60; w.studioBookedH += (q * (1 - home) * min) / 60;
    w.makeupLessons += q * p.makeup; w.makeupH += (q * p.makeup * (min + prep + home * v.travelMin)) / 60;
  }
  w.adminH = v.adminHoursWeek;
  w.hours = w.teachH + w.travelH + w.adminH;
  return w;
}

function annual(v, w) {
  const fixed = fixedCosts(v);
  return {
    revenue: w.revenue * v.weeksBilled, variable: (w.mat + w.mileage) * v.weeksTaught, hours: w.hours * v.weeksTaught,
    fixed, studioBookedHours: w.studioBookedH * v.weeksTaught,
  };
}

// Three ways to run the same teaching, per year, before the teacher draws anything for their own time.
export function studioModes(v, scale = 1) {
  const w = week(v, scale), a = annual(v, w), p = policy(v);
  const privateNet = a.revenue + v.recitalIncomeYear - a.variable - a.fixed.totalRaw;
  const roomCost = v.roomHourly * a.studioBookedHours;
  const roomNet = a.revenue + v.recitalIncomeYear - a.variable - (a.fixed.totalRaw - a.fixed.rent) - roomCost;
  // Music school: it sends v.schoolFillPct of your lessons, pays you a split of tuition for lessons taught and a share of the cancelled ones, and supplies the room, the billing and the recital.
  let schoolGross = 0, schoolTaught = 0, schoolMat = 0, schoolTeachH = 0;
  const fill = v.schoolFillPct / 100, c = v.cancelPct / 100, sp = v.schoolCancelPaidPct / 100;
  for (const s of SERVICES) {
    const q = Math.round(v[s.id + "Qty"] * scale) * fill;
    const taught = q * (1 - c);
    schoolGross += q * ((1 - c) + c * sp) * v[s.id + "Price"];
    schoolTaught += taught; schoolMat += taught * v[s.id + "Mat"];
    schoolTeachH += (taught * (v[s.id + "Min"] + v[s.id + "Prep"])) / 60;
  }
  const schoolHoursYear = (schoolTeachH + v.schoolAdminHours) * v.weeksTaught;
  const schoolCosts = schoolMat * v.weeksTaught + a.fixed.equipment;
  const schoolGrossYear = schoolGross * v.weeksBilled;
  const schoolNet = (schoolGrossYear * v.schoolPct) / 100 - schoolCosts;
  const hourly = (net, h) => (h > 0 ? net / h : 0);
  // Split at which the school pays the same per hour as teaching privately; room rate at which renting pays the same as paying your own rent.
  const equalSplit = schoolGrossYear > 0 && schoolHoursYear > 0 ? ((hourly(privateNet, a.hours) * schoolHoursYear + schoolCosts) / schoolGrossYear) * 100 : null;
  const equalRoomRate = a.studioBookedHours > 0 ? (a.revenue + v.recitalIncomeYear - a.variable - (a.fixed.totalRaw - a.fixed.rent) - privateNet) / a.studioBookedHours : null;
  return {
    w, a, p,
    private: { net: privateNet, hourly: hourly(privateNet, a.hours) },
    room: { net: roomNet, cost: roomCost, hourly: hourly(roomNet, a.hours) },
    school: { net: schoolNet, hours: schoolHoursYear, hourly: hourly(schoolNet, schoolHoursYear), gross: schoolGrossYear, taughtPerWeek: schoolTaught },
    equalSplit, equalRoomRate,
  };
}

// One kind of lesson. Hours per booked lesson include an even share of the weekly admin; fixed cost is spread over all working hours.
export function serviceLine(v, s, m = studioModes(v)) {
  const p = m.p, price = v[s.id + "Price"], min = v[s.id + "Min"], prep = v[s.id + "Prep"], mat = v[s.id + "Mat"], qty = v[s.id + "Qty"];
  const home = s.home ? v.inHomePct / 100 : 0;
  const hoursPer = (p.tf * (min + prep + home * v.travelMin)) / 60 + (m.w.booked > 0 ? m.w.adminH / m.w.booked : 0);
  const varPer = p.tf * (mat + home * v.travelCost);
  const fixedPerHour = m.a.hours > 0 ? m.a.fixed.netRaw / m.a.hours : 0;
  const revPer = price * p.paid;
  const cost = (hoursPer * (v.targetHourly + fixedPerHour) + varPer) * (v.weeksTaught / Math.max(v.weeksBilled, 0.0001));
  return {
    id: s.id, label: s.label, qty, price, min, prep, mat,
    hoursPerBooked: round2(hoursPer), effectiveHourly: hoursPer > 0 ? round2((revPer * (v.weeksBilled / v.weeksTaught) - varPer) / hoursPer) : 0,
    headlineHourly: min > 0 ? round2((price * 60) / min) : 0,
    targetPrice: p.paid > 0 ? round2(cost / p.paid) : null,
  };
}

// Booked lessons per week at which the studio covers its fixed cost, and at which it also pays the target hourly for all the time it takes.
export function breakEven(v, m = studioModes(v)) {
  const w = m.w;
  if (w.booked <= 0) return { cover: null, target: null };
  const contribution = (w.revenue * v.weeksBilled - (w.mat + w.mileage) * v.weeksTaught) / w.booked; // per weekly lesson slot, per year
  const lessonHours = ((w.teachH + w.travelH) * v.weeksTaught) / w.booked;
  const fixed = m.a.fixed.netRaw;
  const calc = (num, den) => (den > 0 ? round1(num / den) : null);
  return {
    cover: calc(fixed, contribution), perLessonContribution: round2(contribution),
    target: calc(fixed + w.adminH * v.weeksTaught * v.targetHourly, contribution - lessonHours * v.targetHourly),
  };
}

function usd(x) {
  return (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function plan(input) {
  const { v, error } = readInput(input);
  if (error) return { error };
  const m = studioModes(v);
  const lines = SERVICES.map((s) => serviceLine(v, s, m));
  const be = breakEven(v, m);
  const w = m.w, a = m.a;
  const cancelRevenueYear = w.lostRevenue * v.weeksBilled;
  const makeupTimeYear = w.makeupH * v.weeksTaught * v.targetHourly;
  const gapWeeks = Math.max(0, v.weeksTaught - v.weeksBilled);
  const gapCost = gapWeeks * w.revenue;
  const requiredNet = v.targetHourly * a.hours;
  const priceFactor = a.revenue > 0 ? (requiredNet + a.variable + a.fixed.netRaw) / a.revenue : null;
  const result = {
    lines, fixed: a.fixed, booked: w.booked, taughtPerWeek: round1(w.taught), hoursPerWeek: round1(w.hours), hoursPerYear: round1(a.hours),
    teachHoursPerWeek: round1(w.teachH), travelHoursPerWeek: round1(w.travelH), adminHoursPerWeek: round1(w.adminH),
    revenueYear: round2(a.revenue), privateNet: round2(m.private.net), effectiveHourly: round2(m.private.hourly),
    cancelRevenueYear: round2(cancelRevenueYear), makeupTimeYear: round2(makeupTimeYear), cancelCostYear: round2(cancelRevenueYear + makeupTimeYear), lostLessonsPerWeek: round2(w.lostLessons),
    gapWeeks, gapCost: round2(gapCost),
    schoolNet: round2(m.school.net), schoolHourly: round2(m.school.hourly), schoolHoursYear: round1(m.school.hours),
    roomNet: round2(m.room.net), roomHourly: round2(m.room.hourly), roomCost: round2(m.room.cost),
    equalSplit: m.equalSplit === null ? null : round1(m.equalSplit), equalRoomRate: m.equalRoomRate === null ? null : round2(m.equalRoomRate),
    priceFactor: priceFactor === null ? null : round2(priceFactor), breakEven: be,
  };
  const advice = [];
  advice.push(`Teaching privately, per year: ${w.booked} booked lessons a week (${result.taughtPerWeek} actually taught), ${usd(result.revenueYear)} of tuition over ${v.weeksBilled} billed weeks, and ${usd(result.privateNet)} left after materials, mileage, rent, instruments and recital costs.`);
  advice.push(`That is ${usd(result.effectiveHourly)} an hour across ${result.hoursPerWeek} working hours a week (${result.teachHoursPerWeek} teaching and prep, ${result.travelHoursPerWeek} travel, ${result.adminHoursPerWeek} admin) over ${v.weeksTaught} taught weeks, against your target of ${usd(v.targetHourly)}.`);
  const best = [...lines.filter((l) => l.qty > 0)].sort((x, y) => y.effectiveHourly - x.effectiveHourly);
  if (best.length > 1) advice.push(`Per working hour before rent and recital costs: ${best.map((l) => `${l.label.toLowerCase()} ${usd(l.effectiveHourly)} (advertised ${usd(l.headlineHourly)})`).join(", ")}. The headline price per lesson hour overstates what you keep because prep, admin, travel and cancellations are unpaid.`);
  else if (best.length === 1) advice.push(`${best[0].label} advertise ${usd(best[0].headlineHourly)} an hour and keep ${usd(best[0].effectiveHourly)} an hour once prep, admin, travel and cancellations are counted.`);
  if (result.effectiveHourly < v.targetHourly && priceFactor !== null) advice.push(`To reach ${usd(v.targetHourly)} an hour with the same lessons, tuition has to rise about ${round1((priceFactor - 1) * 100)}% overall. Price needed per lesson: ${lines.filter((l) => l.qty > 0 && l.targetPrice !== null).map((l) => `${l.label.toLowerCase()} ${usd(l.targetPrice)}`).join(", ")}.`);
  else advice.push(`You already clear ${usd(v.targetHourly)} an hour. The price for exactly that rate is ${lines.filter((l) => l.qty > 0 && l.targetPrice !== null).map((l) => `${usd(l.targetPrice)} for ${l.label.toLowerCase()}`).join(", ")}.`);
  if (v.cancelPct > 0) advice.push(`Cancellations: ${v.cancelPct}% of booked lessons is about ${round2(w.booked * v.cancelPct / 100)} a week. With ${v.chargedPct}% charged and ${v.makeupPct}% made up, about ${result.lostLessonsPerWeek} lessons a week earn nothing: ${usd(result.cancelRevenueYear)} of tuition a year, plus ${usd(result.makeupTimeYear)} of make-up time valued at your target hourly, ${usd(result.cancelCostYear)} in all.`);
  if (gapWeeks > 0) advice.push(`You teach ${v.weeksTaught} weeks but bill ${v.weeksBilled}. The ${gapWeeks} unbilled teaching weeks are worth about ${usd(result.gapCost)} a year at your current schedule.`);
  else if (v.weeksBilled > v.weeksTaught) advice.push(`You bill ${v.weeksBilled} weeks but teach ${v.weeksTaught}: tuition for the extra weeks is income for weeks with no lessons, so check it matches what your studio policy promises.`);
  if (be.cover !== null) advice.push(`Break-even: about ${be.cover} booked lessons a week cover the studio's fixed costs with no pay to you${be.target === null ? ", and at these prices no number of lessons pays your target hourly because each lesson earns less than its own time is worth" : `, and about ${be.target} a week also pay your target hourly for all the time they take`}. You plan ${w.booked}.`);
  advice.push(`The same lessons three ways, per year: teach privately ${usd(result.privateNet)} (${usd(result.effectiveHourly)} an hour), teach for a music school keeping ${v.schoolPct}% ${usd(result.schoolNet)} (${usd(result.schoolHourly)} an hour over ${result.schoolHoursYear} hours), rent a room at ${usd(v.roomHourly)} an hour ${usd(result.roomNet)} (${usd(result.roomHourly)} an hour).`);
  if (result.equalSplit !== null) advice.push(`The school pays the same hourly as teaching privately at a split of about ${result.equalSplit}% (you offered ${v.schoolPct}%). ${v.schoolPct >= result.equalSplit ? "The school split is the better deal on these numbers." : "Teaching privately is the better deal on these numbers."} A school hands you students and billing; check how many it really sends.`);
  if (result.equalRoomRate !== null && v.rentPerMonth > 0) advice.push(result.equalRoomRate > 0 ? `Renting a room beats your own rent while the room costs less than about ${usd(result.equalRoomRate)} an hour of booked lesson time; you assumed ${usd(v.roomHourly)}.` : `Your own rent is cheaper than renting a room at any price for these bookings.`);
  const table = [0.5, 0.75, 1, 1.25, 1.5].map((s) => {
    const r = studioModes(v, s);
    return { pct: Math.round(s * 100), booked: r.w.booked, hours: round1(r.w.hours), private: round2(r.private.hourly), school: round2(r.school.hourly), room: round2(r.room.hourly) };
  });
  return { error: null, input: v, season: result, table, advice };
}

export function sampleInput() {
  return {
    shortQty: "8", shortPrice: "35", shortMin: "30", shortPrep: "10", shortMat: "1",
    longQty: "10", longPrice: "60", longMin: "60", longPrep: "15", longMat: "2",
    groupQty: "2", groupPrice: "80", groupMin: "60", groupPrep: "30", groupMat: "5",
    cancelPct: "8", chargedPct: "25", makeupPct: "50", weeksTaught: "40", weeksBilled: "36", adminHoursWeek: "3", targetHourly: "40",
    inHomePct: "20", travelMin: "40", travelCost: "6",
    rentPerMonth: "400", equipmentCost: "3000", equipmentYears: "10", otherFixedMonth: "80", recitalCostYear: "600", recitalIncomeYear: "400",
    schoolPct: "50", schoolFillPct: "100", schoolAdminHours: "0.5", schoolCancelPaidPct: "50", roomHourly: "18",
  };
}

// Share-link payload: only known keys, only plain strings, so a pasted link cannot inject anything.
export const SHARE_KEYS = [...NUMERIC];

export function encodeShare(input) {
  const p = new URLSearchParams();
  for (const k of SHARE_KEYS) if (input[k] !== undefined && input[k] !== "") p.set(k, String(input[k]).slice(0, 200));
  return p.toString();
}

export function decodeShare(text) {
  const p = new URLSearchParams(String(text ?? "").replace(/^#/, ""));
  const out = {};
  for (const k of SHARE_KEYS) if (p.has(k)) out[k] = p.get(k).slice(0, 200);
  return out;
}

export function toCsv(result) {
  const head = "volume_pct,booked_per_week,hours_per_week,private_hourly,music_school_hourly,rented_room_hourly";
  return [head, ...result.table.map((r) => [r.pct, r.booked, r.hours, r.private, r.school, r.room].join(","))].join("\n");
}
