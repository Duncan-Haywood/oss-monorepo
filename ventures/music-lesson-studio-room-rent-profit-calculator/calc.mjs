// Music lesson profit against room rent. Pure arithmetic over what an independent music teacher or small music school types in: three lesson formats
// (private, paired, small group) with classes per week, students per class, price per student and lesson minutes, a cancellation rate, the hourly room
// rent (paid for every hour booked, used or not), teacher pay, supplies, card fees and weekly fixed cost. Tips are ignored on purpose.

const round1 = (x) => Math.round((x + Number.EPSILON) * 10) / 10;
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (s) => Number(String(s ?? "").replace(/[$,%\s_]/g, ""));

export const FORMATS = [
  { id: "private", label: "Private (1 student)" },
  { id: "semi", label: "Paired lesson" },
  { id: "group", label: "Small group class" },
];

const NUMERIC = [
  "privateClasses", "privatePrice", "privateMin", "privateStudents",
  "semiClasses", "semiPrice", "semiMin", "semiStudents",
  "groupClasses", "groupPrice", "groupMin", "groupStudents",
  "cancelPct", "roomRatePerHour", "roomHoursBooked", "instructorRate", "suppliesPerLesson", "cardFeePct", "fixedPerMonth", "targetMarginPct",
];

export function readInput(input) {
  const f = (k, d = 0) => (input[k] === undefined || input[k] === "" ? d : num(input[k]));
  const v = {
    privateClasses: f("privateClasses"), privatePrice: f("privatePrice", 65), privateMin: f("privateMin", 30), privateStudents: f("privateStudents", 1),
    semiClasses: f("semiClasses"), semiPrice: f("semiPrice", 40), semiMin: f("semiMin", 30), semiStudents: f("semiStudents", 2),
    groupClasses: f("groupClasses"), groupPrice: f("groupPrice", 25), groupMin: f("groupMin", 30), groupStudents: f("groupStudents", 4),
    cancelPct: f("cancelPct", 8), roomRatePerHour: f("roomRatePerHour", 45), roomHoursBooked: f("roomHoursBooked", 0), instructorRate: f("instructorRate", 25),
    suppliesPerLesson: f("suppliesPerLesson", 1), cardFeePct: f("cardFeePct", 3), fixedPerMonth: f("fixedPerMonth", 0), targetMarginPct: f("targetMarginPct", 35),
  };
  for (const k of NUMERIC) if (!Number.isFinite(v[k]) || v[k] < 0) return { error: `Check the ${k}: use a plain number that is not negative.` };
  for (const k of ["privateClasses", "semiClasses", "groupClasses"]) if (!Number.isInteger(v[k])) return { error: `${k} must be a whole number of classes per week.` };
  for (const k of ["privateStudents", "semiStudents", "groupStudents"]) if (v[k] < 1 || v[k] > 30) return { error: `${k}: students per class must be between 1 and 30.` };
  const total = v.privateClasses + v.semiClasses + v.groupClasses;
  if (total < 1) return { error: "Enter how many classes you teach in a typical week." };
  if (total > 300) return { error: "That is far more than one room can run in a week: check the class counts." };
  for (const f2 of FORMATS) if (v[f2.id + "Classes"] > 0 && v[f2.id + "Min"] <= 0) return { error: `${f2.label}: lesson minutes must be above 0.` };
  if (v.cancelPct > 90) return { error: "Cancellation rate is a percent of booked students: keep it at or below 90." };
  if (v.cardFeePct > 20) return { error: "Card fee is a percent of the price: keep it at or below 20." };
  if (v.targetMarginPct + v.cardFeePct >= 95) return { error: "Target margin plus card fee must stay below 95 percent of the price." };
  return { v };
}

// Minutes of room time the week's classes use.
const usedMinutes = (v) => FORMATS.reduce((m, f) => m + v[f.id + "Classes"] * v[f.id + "Min"], 0);

// Hours of room you pay for: what you typed, never less than the classes themselves need.
export function roomHours(v) {
  return Math.max(v.roomHoursBooked, usedMinutes(v) / 60);
}

export function formatLine(v, f, roomHoursPaid) {
  const classes = v[f.id + "Classes"], price = v[f.id + "Price"], mins = v[f.id + "Min"], students = v[f.id + "Students"];
  const hrs = mins / 60;
  const show = 1 - v.cancelPct / 100;
  const revenue = students * price * show; // per class, after cancellations
  const fees = revenue * (v.cardFeePct / 100);
  const instructor = hrs * v.instructorRate;
  const room = hrs * v.roomRatePerHour; // room time this class itself uses
  const costs = fees + instructor + room + v.suppliesPerLesson * students * show;
  const profit = revenue - costs;
  // Price per student that reaches the target margin at this group size and cancellation rate.
  const fixedCost = instructor + room + v.suppliesPerLesson * students * show;
  const denom = students * show * (1 - v.cardFeePct / 100 - v.targetMarginPct / 100);
  const targetPrice = denom > 0 ? fixedCost / denom : null;
  // Students per class needed to break even at the typed price.
  const unit = price * show * (1 - v.cardFeePct / 100) - v.suppliesPerLesson * show;
  const base = instructor + room;
  const breakEvenStudents = unit > 0 ? Math.ceil(base / unit - 1e-9) : null;
  return {
    id: f.id, label: f.label, classes, students, price, minutes: mins,
    revenue: round2(revenue), cost: round2(costs), profit: round2(profit),
    marginPct: revenue > 0 ? round1((profit / revenue) * 100) : 0,
    profitPerRoomHour: round2(profit / hrs),
    weeklyProfit: round2(profit * classes),
    targetPrice: targetPrice === null ? null : round2(targetPrice),
    breakEvenStudents,
  };
}

export function plan(input) {
  const r = readInput(input);
  if (r.error) return r;
  const v = r.v;
  const paid = roomHours(v);
  const lines = FORMATS.map((f) => formatLine(v, f, paid)).filter((l) => l.classes > 0);
  const used = usedMinutes(v) / 60;
  const idleHours = Math.max(0, paid - used);
  // Room time the classes themselves use is already in each line; only rented-but-empty hours are extra.
  const idleCost = idleHours * v.roomRatePerHour;
  const fixedWeek = (v.fixedPerMonth * 12) / 52;
  const linesProfit = lines.reduce((s, l) => s + l.weeklyProfit, 0);
  const revenue = lines.reduce((s, l) => s + l.revenue * l.classes, 0);
  const net = linesProfit - idleCost - fixedWeek;
  const advice = adviceFor({ v, lines, used, paid, idleCost, idleHours, fixedWeek, net });
  return {
    v, lines, advice,
    week: {
      revenue: round2(revenue), classProfit: round2(linesProfit), idleHours: round1(idleHours), idleCost: round2(idleCost), fixedWeek: round2(fixedWeek),
      net: round2(net), netPerRoomHour: round2(paid > 0 ? net / paid : 0), roomHoursPaid: round1(paid), roomHoursUsed: round1(used),
      utilizationPct: paid > 0 ? round1((used / paid) * 100) : 0, netPerMonth: round2((net * 52) / 12),
    },
    table: volumeTable(v),
  };
}

// What the week nets if you teach 50-150 percent of today's classes in the same rented hours.
export function volumeTable(v) {
  const rows = [];
  for (const pct of [50, 75, 100, 125, 150]) {
    const w = scale(v, pct / 100);
    const paid = roomHours(w);
    const used = usedMinutes(w) / 60;
    const lines = FORMATS.map((f) => formatLine(w, f, paid));
    const profit = lines.reduce((s, l) => s + l.weeklyProfit, 0);
    const net = profit - Math.max(0, paid - used) * w.roomRatePerHour - (w.fixedPerMonth * 12) / 52;
    rows.push({ pct, classes: FORMATS.reduce((s, f) => s + w[f.id + "Classes"], 0), roomHours: round1(paid), utilizationPct: paid > 0 ? round1((used / paid) * 100) : 0, net: round2(net) });
  }
  return rows;
}

function scale(v, k) {
  const w = { ...v };
  for (const f of FORMATS) w[f.id + "Classes"] = Math.round(v[f.id + "Classes"] * k);
  w.roomHoursBooked = v.roomHoursBooked; // the rented block does not shrink when classes do
  return w;
}

function adviceFor({ v, lines, idleHours, idleCost, paid, net }) {
  const out = [];
  const money = (x) => (x < 0 ? "-$" : "$") + Math.abs(x).toFixed(2);
  const best = [...lines].sort((a, b) => b.profitPerRoomHour - a.profitPerRoomHour);
  if (best.length > 1) out.push(`${best[0].label} earns the most per room hour (${money(best[0].profitPerRoomHour)}); ${best[best.length - 1].label} earns the least (${money(best[best.length - 1].profitPerRoomHour)}).`);
  for (const l of lines) {
    if (l.profit < 0) out.push(`${l.label} loses ${money(-l.profit)} on every class at ${l.students} student(s) and $${l.price} each; it needs ${l.breakEvenStudents ?? "more than 30"} students or a higher price.`);
    else if (l.targetPrice !== null && l.price < l.targetPrice) out.push(`${l.label} clears break-even but sits under your ${v.targetMarginPct}% margin: it needs ${money(l.targetPrice)} per student.`);
  }
  if (idleHours > 0.05) out.push(`${round1(idleHours)} of the ${round1(paid)} room hours you rent each week have no class in them. That costs ${money(idleCost)} a week, ${money(idleCost * 52)} a year.`);
  if (net < 0) out.push(`The week loses ${money(-net)} after room rent, teacher pay and fixed cost.`);
  else out.push(`The week nets ${money(net)} after room rent, teacher pay, fees and fixed cost.`);
  return out;
}

export function sampleInput() {
  return {
    privateClasses: "10", privatePrice: "65", privateMin: "30", privateStudents: "1",
    semiClasses: "6", semiPrice: "40", semiMin: "30", semiStudents: "2",
    groupClasses: "8", groupPrice: "25", groupMin: "30", groupStudents: "4",
    cancelPct: "8", roomRatePerHour: "45", roomHoursBooked: "16", instructorRate: "25", suppliesPerLesson: "1", cardFeePct: "3", fixedPerMonth: "180", targetMarginPct: "35",
  };
}

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
  const head = "classes_pct,classes_per_week,room_hours_paid,utilization_pct,weekly_net";
  return [head, ...result.table.map((r) => [r.pct, r.classes, r.roomHours, r.utilizationPct, r.net].join(","))].join("\n");
}
