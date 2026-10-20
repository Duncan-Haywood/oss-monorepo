// Yoga, pilates and barre studio class profit. Pure arithmetic over what a boutique studio owner types in: how many classes run a week, how many people reserve each one,
// how those reservations pay (drop-in, class pack or monthly membership), what a late cancel or no-show does to that, what a teacher costs under three pay models, the room's
// fixed costs, and three ways to run the same timetable: the owner teaches in their own studio, the owner hires teachers, or the owner gives up the lease and rents a room by the hour.
// Retail, workshops, teacher training and tips are left out on purpose: they are other businesses sharing the same room.

const round1 = (x) => Math.round((x + Number.EPSILON) * 10) / 10;
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (s) => Number(String(s ?? "").replace(/[$,%\s_]/g, ""));

export const PAY_MODELS = [
  { id: "flat", label: "Flat fee per class" },
  { id: "perHead", label: "Per student who attends (with a per-class minimum)" },
  { id: "share", label: "Share of the class's revenue" },
];

const NUMERIC = [
  "classesPerWeek", "capacity", "bookedPerClass", "lateCancelPct", "classMin", "turnoverMin", "roomHoursAvailable",
  "dropInPct", "packPct", "dropInPrice", "packPrice", "packClasses", "packBreakagePct", "membershipPrice", "memberBookingsPerMonth", "lateFee", "lateFeeEnforcePct", "processingPct",
  "flatPay", "perHeadPay", "perHeadMin", "sharePct", "payrollPct",
  "ownerRate", "adminHours", "ownerMaxTeachHours", "rentedAdminHours",
  "rentMonth", "utilitiesMonth", "softwareMonth", "insuranceMonth", "otherMonth",
  "roomRentHour", "rentedFillPct", "targetMarginPct",
];

export const SHARE_KEYS = [...NUMERIC, "payModel"];

export function readInput(input) {
  const f = (k, d = 0) => (input[k] === undefined || input[k] === "" ? d : num(input[k]));
  const v = {
    classesPerWeek: f("classesPerWeek"), capacity: f("capacity", 14), bookedPerClass: f("bookedPerClass"), lateCancelPct: f("lateCancelPct", 8), classMin: f("classMin", 55), turnoverMin: f("turnoverMin", 15),
    roomHoursAvailable: f("roomHoursAvailable", 40),
    dropInPct: f("dropInPct", 25), packPct: f("packPct", 35), dropInPrice: f("dropInPrice", 26), packPrice: f("packPrice", 200), packClasses: f("packClasses", 10), packBreakagePct: f("packBreakagePct", 8),
    membershipPrice: f("membershipPrice", 140), memberBookingsPerMonth: f("memberBookingsPerMonth", 8), lateFee: f("lateFee", 10), lateFeeEnforcePct: f("lateFeeEnforcePct", 60), processingPct: f("processingPct", 3),
    flatPay: f("flatPay", 55), perHeadPay: f("perHeadPay", 5), perHeadMin: f("perHeadMin", 35), sharePct: f("sharePct", 30), payrollPct: f("payrollPct", 8),
    ownerRate: f("ownerRate", 35), adminHours: f("adminHours", 12), ownerMaxTeachHours: f("ownerMaxTeachHours", 16), rentedAdminHours: f("rentedAdminHours", 3),
    rentMonth: f("rentMonth"), utilitiesMonth: f("utilitiesMonth"), softwareMonth: f("softwareMonth"), insuranceMonth: f("insuranceMonth"), otherMonth: f("otherMonth"),
    roomRentHour: f("roomRentHour", 30), rentedFillPct: f("rentedFillPct", 85), targetMarginPct: f("targetMarginPct", 25),
    payModel: String(input.payModel === undefined || input.payModel === "" ? "flat" : input.payModel),
  };
  for (const k of NUMERIC) if (!Number.isFinite(v[k]) || v[k] < 0) return { error: `Check ${k}: use a plain number that is not negative.` };
  if (!PAY_MODELS.some((m) => m.id === v.payModel)) return { error: "Pick one of the three teacher pay models." };
  if (!Number.isInteger(v.classesPerWeek)) return { error: "Classes per week must be a whole number." };
  if (v.classesPerWeek < 1) return { error: "Enter how many classes you run in a typical week." };
  if (v.classesPerWeek > 300) return { error: "That is far more classes than one room can run in a week: check the number." };
  if (!Number.isInteger(v.capacity) || v.capacity < 1) return { error: "Room capacity must be a whole number of at least 1." };
  if (v.bookedPerClass > v.capacity) return { error: "Average reservations per class cannot exceed the room's capacity." };
  if (v.lateCancelPct > 90) return { error: "Late-cancel and no-show rate is a percent of reservations: keep it at or below 90." };
  if (v.classMin < 1 || v.classMin > 240) return { error: "Class length must be between 1 and 240 minutes." };
  if (v.turnoverMin > 120) return { error: "Changeover between classes should be at most 120 minutes." };
  if (v.roomHoursAvailable <= 0 || v.roomHoursAvailable > 168) return { error: "Room hours available per week must be above 0 and at most 168." };
  if (v.dropInPct > 100 || v.packPct > 100 || v.dropInPct + v.packPct > 100) return { error: "Drop-in and class-pack shares are percents of reservations and together cannot pass 100; members are the rest." };
  if (v.packClasses < 1) return { error: "A class pack must hold at least one class." };
  if (v.packBreakagePct >= 90) return { error: "Pack breakage is the share of pack classes never used: keep it below 90." };
  if (v.dropInPct + v.packPct < 100 && v.memberBookingsPerMonth <= 0) return { error: "Enter how many classes a member books in a month." };
  if (v.lateFeeEnforcePct > 100) return { error: "The share of late cancels where you keep the fee cannot pass 100." };
  if (v.processingPct >= 30) return { error: "Card processing is a percent of revenue: keep it below 30." };
  if (v.sharePct >= 100) return { error: "Revenue-share pay is a percent of class revenue: keep it below 100." };
  if (v.payrollPct > 50) return { error: "Payroll tax and extras on teacher pay is a percent of that pay: keep it at or below 50." };
  if (v.ownerMaxTeachHours <= 0) return { error: "Enter how many hours a week you are willing to teach." };
  if (v.rentedFillPct > 200) return { error: "Attendance in a rented room is a percent of your studio's: keep it at or below 200." };
  if (v.targetMarginPct >= 90) return { error: "Target margin must be below 90 percent of revenue." };
  return { v };
}

const WEEKS_PER_MONTH = 52 / 12;
const perWeek = (monthly) => (monthly * 12) / 52;

export function fixedCosts(v) {
  const rent = perWeek(v.rentMonth), utilities = perWeek(v.utilitiesMonth), software = perWeek(v.softwareMonth), insurance = perWeek(v.insuranceMonth), other = perWeek(v.otherMonth);
  const total = rent + utilities + software + insurance + other;
  // What survives if the lease is given up and the owner rents rooms by the hour: the booking software and the liability cover follow the owner; premises costs do not.
  const kept = software + insurance;
  return { rent: round2(rent), utilities: round2(utilities), software: round2(software), insurance: round2(insurance), other: round2(other), total: round2(total), totalRaw: total, keptRaw: kept, kept: round2(kept) };
}

// One class: revenue by how the reservation pays. Non-members who cancel late pay nothing for the class (the drop-in is refunded, the pack credit is returned) apart from a
// late fee where one is enforced; a member's monthly price is paid whether or not they turn up, so a member's no-show costs the studio nothing in revenue.
export function classRevenue(v, booked, lateCancelPct = v.lateCancelPct, dropInPrice = v.dropInPrice) {
  const lc = lateCancelPct / 100;
  const d = v.dropInPct / 100, p = v.packPct / 100, m = 1 - d - p;
  const attended = booked * (1 - lc);
  const packPerClass = v.packPrice / (v.packClasses * (1 - v.packBreakagePct / 100)); // unused pack classes make the ones that are used worth more
  const memberPerReservation = m > 0 ? v.membershipPrice / v.memberBookingsPerMonth : 0;
  const dropIn = booked * d * (1 - lc) * dropInPrice;
  const pack = booked * p * (1 - lc) * packPerClass;
  const member = booked * m * memberPerReservation;
  const fees = booked * lc * v.lateFee * (v.lateFeeEnforcePct / 100);
  const revenue = dropIn + pack + member + fees;
  return { booked, attended, dropIn, pack, member, fees, revenue, processing: (revenue * v.processingPct) / 100, packPerClass, memberPerReservation };
}

// What one teacher costs for one class under each pay model, including the employer's payroll tax and extras.
export function teacherCost(v, model, attended, revenue) {
  let pay;
  if (model === "flat") pay = v.flatPay;
  else if (model === "perHead") pay = Math.max(v.perHeadMin, v.perHeadPay * attended);
  else pay = (v.sharePct / 100) * revenue;
  return pay * (1 + v.payrollPct / 100);
}

// A week of the whole timetable under one setup. `o` overrides the booking level, the late-cancel rate, the drop-in price or the pay model for what-if rows.
export function week(v, setup, o = {}) {
  const fixed = fixedCosts(v);
  const model = o.model ?? v.payModel;
  const lcPct = o.lateCancelPct ?? v.lateCancelPct;
  const price = o.dropInPrice ?? v.dropInPrice;
  const classes = v.classesPerWeek;
  const baseBooked = Math.min(o.booked ?? v.bookedPerClass, v.capacity);
  const booked = setup === "rent" ? Math.min(baseBooked * (v.rentedFillPct / 100), v.capacity) : baseBooked;
  const c = classRevenue(v, booked, lcPct, price);
  const teachHours = (classes * v.classMin) / 60;
  const roomHoursOwn = (classes * (v.classMin + v.turnoverMin)) / 60;
  const revenue = classes * c.revenue, processing = classes * c.processing;
  let teacher = 0, premises = fixed.totalRaw, roomRent = 0, ownerHours = 0, roomHours = roomHoursOwn;
  if (setup === "owner") ownerHours = teachHours + v.adminHours;
  else if (setup === "hire") { teacher = classes * teacherCost(v, model, c.attended, c.revenue); ownerHours = v.adminHours; }
  else { premises = fixed.keptRaw; roomRent = roomHoursOwn * v.roomRentHour; ownerHours = teachHours + v.rentedAdminHours; }
  const net = revenue - processing - teacher - roomRent - premises; // before the owner is paid for their own hours
  const ownerPay = ownerHours * v.ownerRate;
  return {
    setup, classes, booked, attended: classes * c.attended, revenue, processing, teacher, roomRent, premises, net, ownerHours, ownerPay, afterPay: net - ownerPay,
    teachHours, roomHours, c,
  };
}

// Lowest average reservations per class (counted in your own studio; a rented room draws rentedFillPct of that) at which a setup's weekly result after owner pay reaches zero, scanned in tenths of a person up to the room's capacity.
export function breakEvenBooked(v, setup) {
  for (let i = 0; i <= v.capacity * 20; i++) {
    const b = i / 20;
    if (week(v, setup, { booked: b }).afterPay >= -1e-9) return round1(Math.ceil(b * 10 - 1e-9) / 10);
  }
  return null;
}

// Drop-in price at which a setup's weekly result after owner pay is the target share of revenue. Null when there are no drop-ins to price or no price gets there.
export function priceForTarget(v, setup) {
  if (v.dropInPct <= 0) return null;
  const margin = (price) => {
    const w = week(v, setup, { dropInPrice: price });
    return w.revenue > 0 ? w.afterPay / w.revenue : -Infinity;
  };
  const t = v.targetMarginPct / 100;
  if (margin(0) >= t) return 0;
  let lo = 0, hi = 5000;
  if (margin(hi) < t) return null;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (margin(mid) >= t) hi = mid; else lo = mid;
  }
  return round2(hi);
}

// The most a studio can pay a hired teacher per class (flat, before payroll extras) and still keep the target margin after the owner's admin hours.
export function maxFlatPay(v) {
  const w = week(v, "hire", { model: "flat" });
  const target = (v.targetMarginPct / 100) * w.revenue;
  const room = w.afterPay + w.teacher - target; // what is left to pay teachers with
  return Math.max(0, round2(room / v.classesPerWeek / (1 + v.payrollPct / 100)));
}

function usd(x) {
  return (x < 0 ? "-$" : "$") + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function plan(input) {
  const { v, error } = readInput(input);
  if (error) return { error };
  const owner = week(v, "owner"), hire = week(v, "hire"), rent = week(v, "rent");
  const fixed = fixedCosts(v);
  const c = owner.c;
  const yieldPerVisit = c.attended > 0 ? c.revenue / c.attended : 0;
  const mix = [
    { id: "dropIn", label: "Drop-ins", share: v.dropInPct, weekly: round2(owner.classes * c.dropIn), perVisit: v.dropInPrice },
    { id: "pack", label: "Class packs", share: v.packPct, weekly: round2(owner.classes * c.pack), perVisit: round2(c.packPerClass) },
    { id: "member", label: "Memberships", share: round1(100 - v.dropInPct - v.packPct), weekly: round2(owner.classes * c.member), perVisit: v.dropInPct + v.packPct < 100 ? round2(c.memberPerReservation / (1 - v.lateCancelPct / 100)) : 0 },
    { id: "fees", label: "Late fees kept", share: 0, weekly: round2(owner.classes * c.fees), perVisit: 0 },
  ];
  const models = PAY_MODELS.map((m) => {
    const w = week(v, "hire", { model: m.id });
    return { id: m.id, label: m.label, perClass: round2(w.teacher / w.classes), weekly: round2(w.teacher), net: round2(w.afterPay) };
  });
  const bestModel = [...models].sort((a, b) => b.net - a.net)[0];
  const lcNone = (s) => week(v, s, { lateCancelPct: 0 });
  const lcHalf = (s) => week(v, s, { lateCancelPct: v.lateCancelPct / 2 });
  const lateCost = { owner: round2(lcNone("owner").afterPay - owner.afterPay), hire: round2(lcNone("hire").afterPay - hire.afterPay) };
  const lateHalfGain = round2(lcHalf("owner").afterPay - owner.afterPay);
  const roomUsedPct = round1((owner.roomHours / v.roomHoursAvailable) * 100);
  const rentedHours = rent.roomHours;
  const setups = {
    owner: { net: round2(owner.net), afterPay: round2(owner.afterPay), ownerHours: round1(owner.ownerHours), perClass: round2(owner.afterPay / owner.classes), perRoomHour: round2(owner.afterPay / owner.roomHours), breakEvenBooked: breakEvenBooked(v, "owner"), priceForTarget: priceForTarget(v, "owner") },
    hire: { net: round2(hire.net), afterPay: round2(hire.afterPay), ownerHours: round1(hire.ownerHours), perClass: round2(hire.afterPay / hire.classes), perRoomHour: round2(hire.afterPay / hire.roomHours), breakEvenBooked: breakEvenBooked(v, "hire"), priceForTarget: priceForTarget(v, "hire"), teacher: round2(hire.teacher) },
    rent: { net: round2(rent.net), afterPay: round2(rent.afterPay), ownerHours: round1(rent.ownerHours), perClass: round2(rent.afterPay / rent.classes), perRoomHour: round2(rent.afterPay / rentedHours), breakEvenBooked: breakEvenBooked(v, "rent"), priceForTarget: priceForTarget(v, "rent"), roomRent: round2(rent.roomRent), attendedPerClass: round1(rent.booked * (1 - v.lateCancelPct / 100)) },
  };
  const season = {
    classes: v.classesPerWeek, booked: round1(owner.booked), attended: round1(owner.attended / owner.classes), revenue: round2(owner.revenue), revenuePerClass: round2(owner.revenue / owner.classes),
    yieldPerVisit: round2(yieldPerVisit), fillPct: round1((owner.booked / v.capacity) * 100), fixed, roomHours: round1(owner.roomHours), roomUsedPct, mix, models, setups,
    lateCost, lateCostYear: { owner: round2(lateCost.owner * 52), hire: round2(lateCost.hire * 52) }, lateHalfGainYear: round2(lateHalfGain * 52), feesWeek: round2(owner.classes * c.fees),
    maxFlatPay: maxFlatPay(v), ownerOverHours: owner.teachHours > v.ownerMaxTeachHours,
  };
  const advice = [];
  advice.push(`The timetable per week: ${season.classes} classes, ${season.booked} reservations each (${season.fillPct}% of ${v.capacity} spots), about ${season.attended} people actually in the room. Revenue ${usd(season.revenue)} (${usd(season.revenuePerClass)} a class, ${usd(season.yieldPerVisit)} per person who attends).`);
  advice.push(`Owner teaches every class: ${usd(setups.owner.net)} a week after processing and the premises, ${usd(setups.owner.afterPay)} after paying your own ${setups.owner.ownerHours} hours at ${usd(v.ownerRate)}. That is ${usd(setups.owner.perClass)} a class and ${usd(setups.owner.perRoomHour)} per room hour used.`);
  advice.push(`Hire teachers (${PAY_MODELS.find((m) => m.id === v.payModel).label.toLowerCase()}): teachers cost ${usd(setups.hire.teacher)} a week with payroll extras, leaving ${usd(setups.hire.net)} and ${usd(setups.hire.afterPay)} after your ${setups.hire.ownerHours} hours of running the place. That is ${usd(setups.hire.perClass)} a class and ${usd(setups.hire.perRoomHour)} per room hour.`);
  advice.push(`Give up the lease and rent a room at ${usd(v.roomRentHour)} an hour: rent ${usd(setups.rent.roomRent)} a week for ${round1(rentedHours)} room hours (class plus changeover), about ${setups.rent.attendedPerClass} people per class at ${v.rentedFillPct}% of your studio's draw. ${usd(setups.rent.net)} before your pay, ${usd(setups.rent.afterPay)} after your ${setups.rent.ownerHours} hours.`);
  const ranked = [["you teaching in your studio", setups.owner.afterPay], ["hiring teachers", setups.hire.afterPay], ["renting a room by the hour", setups.rent.afterPay]].sort((a, b) => b[1] - a[1]);
  advice.push(`On these numbers, after paying for your own time, the order is ${ranked.map((r) => `${r[0]} (${usd(r[1])})`).join(", then ")}.`);
  if (season.ownerOverHours) advice.push(`You would teach ${round1(owner.teachHours)} hours a week yourself against the ${v.ownerMaxTeachHours} you said you will teach, so the owner-teaches and rented-room rows are more than one teacher can deliver.`);
  advice.push(`Teacher pay models on the same timetable: ${models.map((m) => `${m.label.toLowerCase()} ${usd(m.perClass)} a class (${usd(m.net)} a week for you)`).join("; ")}. ${bestModel.id === v.payModel ? "The one you chose leaves you the most." : `${bestModel.label} leaves you the most on these bookings, and it moves with attendance: a per-head or revenue-share teacher is paid less on a thin class and more on a full one, a flat fee is not.`} The most you can pay a teacher per class and still clear a ${v.targetMarginPct}% margin is about ${usd(season.maxFlatPay)} before payroll extras.`);
  if (v.lateCancelPct > 0) {
    const memberShare = round1(100 - v.dropInPct - v.packPct);
    advice.push(`Late cancels and no-shows: ${v.lateCancelPct}% of reservations is about ${round1(owner.booked * owner.classes * v.lateCancelPct / 100)} empty spots a week. ${memberShare > 0 ? `Members ${memberShare}% of reservations pay either way, so only drop-in and pack reservations cost revenue. ` : ""}Net of ${usd(season.feesWeek)} of late fees kept, it costs you ${usd(lateCost.owner)} a week teaching yourself (${usd(season.lateCostYear.owner)} a year). Halving the rate is worth about ${usd(season.lateHalfGainYear)} a year.`);
  }
  for (const s of ["owner", "hire"]) {
    const x = setups[s], label = s === "owner" ? "teaching yourself" : "hiring teachers";
    if (x.breakEvenBooked === null) advice.push(`Break-even: even a full room of ${v.capacity} does not cover ${label} on these prices and costs.`);
    else advice.push(`Break-even ${label}: about ${x.breakEvenBooked} reservations per class, against ${season.booked} planned.${x.breakEvenBooked > season.booked ? " You plan fewer than that." : ""}`);
    if (x.priceForTarget !== null && v.dropInPct > 0 && x.priceForTarget > v.dropInPrice) advice.push(`A ${v.targetMarginPct}% margin ${label} needs a drop-in price of about ${usd(x.priceForTarget)} against ${usd(v.dropInPrice)} today, holding packs and memberships as they are.`);
  }
  advice.push(`The room is used ${season.roomHours} of ${v.roomHoursAvailable} hours a week (${roomUsedPct}%, counting ${v.turnoverMin} minutes of changeover per class). Premises and software cost ${usd(fixed.total)} a week whether or not a class runs in those hours.`);
  const table = [0.5, 0.75, 1, 1.25, 1.5].map((sc) => {
    const b = Math.min(v.bookedPerClass * sc, v.capacity);
    return {
      pct: Math.round(sc * 100), booked: round1(b), fillPct: round1((b / v.capacity) * 100),
      owner: round2(week(v, "owner", { booked: b }).afterPay), hire: round2(week(v, "hire", { booked: b }).afterPay), rent: round2(week(v, "rent", { booked: b }).afterPay),
    };
  });
  return { error: null, input: v, season, table, advice };
}

export function sampleInput() {
  return {
    classesPerWeek: "24", capacity: "14", bookedPerClass: "9", lateCancelPct: "8", classMin: "55", turnoverMin: "15", roomHoursAvailable: "40",
    dropInPct: "25", packPct: "35", dropInPrice: "26", packPrice: "200", packClasses: "10", packBreakagePct: "8", membershipPrice: "140", memberBookingsPerMonth: "8",
    lateFee: "10", lateFeeEnforcePct: "60", processingPct: "3",
    payModel: "flat", flatPay: "55", perHeadPay: "5", perHeadMin: "35", sharePct: "30", payrollPct: "8",
    ownerRate: "35", adminHours: "12", ownerMaxTeachHours: "24", rentedAdminHours: "3",
    rentMonth: "3200", utilitiesMonth: "380", softwareMonth: "180", insuranceMonth: "120", otherMonth: "260",
    roomRentHour: "30", rentedFillPct: "85", targetMarginPct: "25",
  };
}

// Share-link payload: only known keys, only plain strings, so a pasted link cannot inject anything.
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
  const head = "reservations_per_class_pct,reservations_per_class,room_filled_pct,owner_teaches_after_pay,hire_teachers_after_pay,rent_room_after_pay";
  return [head, ...result.table.map((r) => [r.pct, r.booked, r.fillPct, r.owner, r.hire, r.rent].join(","))].join("\n");
}
