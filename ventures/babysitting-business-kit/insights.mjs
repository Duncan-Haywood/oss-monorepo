// Babysitting Business Kit: business numbers that change decisions. Pure functions over
// the desk, like engine.mjs: callers pass `today`, nothing touches storage or the network.
//
//   familyRates()    what each family really pays per hour once the drive there and back
//                    (time and miles at the engine's mileage rate) and minimum-hour
//                    padding are counted, best to worst
//   incomePatterns() earnings by weekday and by season
//   capacity()       booked hours against the hours the sitter's weekly availability offers
//   raisePlan()      a proposed new hourly rate: the change per family per month and a kind,
//                    advance-notice message to each family
//   incomeLetter()   a year-to-date income summary for a landlord or lender, from recorded
//                    payments, signed by the sitter: a self-prepared summary, not a tax document
//   yearOverYear()   this year against last year, once there are two years of data
//
// Settings live on desk.profile.insights (normalizeDesk keeps every profile key):
//   { travelMph, localRate, localRateNote }
// travelMph is only used for a sit with miles and no drive time typed in; it is the
// sitter's own assumption, shown on screen and editable. localRate is a comparison the
// sitter types herself; this file never supplies a "market rate".
// Drive time: booking.travelMinutes, else family.travelMinutes, both round trip, matching
// the round-trip miles a booking holds.
import { expandBookings, quote, payments, mileageRate, parseWeekly, dayOf, addDays, daysBetween, toMin, DAYS } from "./engine.mjs";

const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const r1 = (x) => Math.round((Number(x) || 0) * 10) / 10;
const num = (x, d = 0) => (Number.isFinite(Number(x)) && x !== "" && x !== null && x !== undefined ? Number(x) : d);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// Meteorological seasons (December to February is winter), named by the months they cover.
export const SEASONS = [
  { key: "winter", label: "Winter (Dec-Feb)", months: [12, 1, 2] },
  { key: "spring", label: "Spring (Mar-May)", months: [3, 4, 5] },
  { key: "summer", label: "Summer (Jun-Aug)", months: [6, 7, 8] },
  { key: "fall", label: "Fall (Sep-Nov)", months: [9, 10, 11] },
];
export const DEFAULT_INSIGHTS = { travelMph: 25, localRate: "", localRateNote: "" };

export function insightSettings(profile = {}) {
  const s = { ...DEFAULT_INSIGHTS, ...((profile && profile.insights) || {}) };
  return { ...s, travelMph: num(s.travelMph, DEFAULT_INSIGHTS.travelMph) };
}

// Minutes a sit actually lasts, past midnight included.
export function sitMinutes(sit) {
  const s = toMin(sit.start);
  let e = toMin(sit.end);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0;
  if (e <= s) e += 1440;
  return e - s;
}

// Round-trip drive minutes for a sit: typed on the sit, typed on the family, or estimated
// from the sit's round-trip miles at the sitter's assumed average speed.
export function travelMinutes(sit, family, settings = DEFAULT_INSIGHTS) {
  if (num(sit.travelMinutes) > 0) return { minutes: num(sit.travelMinutes), source: "sit" };
  if (family && num(family.travelMinutes) > 0) return { minutes: num(family.travelMinutes), source: "family" };
  const miles = num(sit.miles);
  const mph = num(settings.travelMph);
  if (miles > 0 && mph > 0) return { minutes: Math.round((miles / mph) * 60), source: "estimate" };
  return { minutes: 0, source: "none" };
}

// Every sit that has happened (not cancelled) between from and to inclusive, with what it
// earned and what it cost to get there. `earned` is the agreed price (booking.price) or the
// rate-card quote; it is what the sit was worth, paid or not.
export function workedSits(desk, { from = "0000-01-01", to = "9999-12-31" } = {}) {
  const p = desk.profile || {};
  const rates = p.rates || {};
  const settings = insightSettings(p);
  const fams = new Map((desk.families || []).map((f) => [f.id, f]));
  const out = [];
  for (const o of expandBookings(desk.bookings || [])) {
    if (o.status === "cancelled" || o.date < from || o.date > to) continue;
    const q = quote(o, rates, p.holidays || []);
    const minutes = sitMinutes(o);
    if (!minutes) continue;
    const fam = fams.get(o.familyId);
    const t = travelMinutes(o, fam, settings);
    const miles = num(o.miles);
    const earned = r2(num(o.price, q.total));
    const billedHours = Math.max(minutes / 60, num(rates.minimumHours));
    out.push({
      key: o.key, bookingId: o.id, familyId: o.familyId || "", date: o.date, weekday: dayOf(o.date), month: Number(o.date.slice(5, 7)),
      hours: minutes / 60, billedHours, paddingHours: Math.max(0, billedHours - minutes / 60),
      travelHours: t.minutes / 60, travelSource: t.source, miles, mileageCost: miles * mileageRate(o.date, p.mileageRate), earned,
      fixedPrice: num(o.price) > 0, kids: Math.max(1, Math.round(num(o.kids, 1))),
    });
  }
  return out;
}

function totals(sits) {
  const t = { sits: sits.length, hours: 0, travelHours: 0, paddingHours: 0, paddingEarned: 0, miles: 0, mileageCost: 0, earned: 0, estimatedTravel: 0 };
  for (const s of sits) {
    t.hours += s.hours; t.travelHours += s.travelHours; t.paddingHours += s.paddingHours;
    t.paddingEarned += s.billedHours > 0 && !s.fixedPrice ? (s.earned * s.paddingHours) / s.billedHours : 0;
    t.miles += s.miles; t.mileageCost += s.mileageCost; t.earned += s.earned;
    if (s.travelSource === "estimate") t.estimatedTravel++;
  }
  const realHours = t.hours + t.travelHours;
  return {
    sits: t.sits, hours: r2(t.hours), travelHours: r2(t.travelHours), paddingHours: r2(t.paddingHours), paddingEarned: r2(t.paddingEarned),
    miles: r1(t.miles), mileageCost: r2(t.mileageCost), earned: r2(t.earned), net: r2(t.earned - t.mileageCost),
    // What the sitter sees on the rate card per hour at the family's house...
    perSitHour: t.hours > 0 ? r2(t.earned / t.hours) : 0,
    // ...and what she keeps per hour of her day once the drive and the car are counted.
    effectiveHourly: realHours > 0 ? r2((t.earned - t.mileageCost) / realHours) : 0,
    realHours: r2(realHours), estimatedTravel: t.estimatedTravel,
  };
}

// Effective hourly earnings per family over a period, best first.
export function familyRates(desk, { from, to, today } = {}) {
  const end = to || today || "9999-12-31";
  const start = from || (today ? addDays(today, -365) : "0000-01-01");
  const sits = workedSits(desk, { from: start, to: end });
  const groups = new Map();
  for (const s of sits) { if (!groups.has(s.familyId)) groups.set(s.familyId, []); groups.get(s.familyId).push(s); }
  const names = new Map((desk.families || []).map((f) => [f.id, f.name]));
  const rows = [...groups.entries()].map(([familyId, list]) => ({ familyId, family: names.get(familyId) || (familyId ? familyId : "No family"), ...totals(list) }))
    .sort((a, b) => b.effectiveHourly - a.effectiveHourly || a.family.localeCompare(b.family));
  const all = totals(sits);
  const notes = [];
  if (rows.length >= 2) {
    const best = rows[0], worst = rows[rows.length - 1];
    if (best.effectiveHourly > worst.effectiveHourly) notes.push(`${best.family} pays you the most per real hour ($${best.effectiveHourly.toFixed(2)}), ${worst.family} the least ($${worst.effectiveHourly.toFixed(2)}), a gap of $${(best.effectiveHourly - worst.effectiveHourly).toFixed(2)} an hour.`);
  }
  for (const r of rows) {
    if (r.realHours > 0 && r.travelHours / r.realHours >= 0.25) notes.push(`${r.family}: driving is ${Math.round((r.travelHours / r.realHours) * 100)}% of the time these sits take from your day.`);
    if (r.paddingHours > 0) notes.push(`${r.family}: your minimum-hours rule added ${r1(r.paddingHours)} billed hours (about $${r.paddingEarned.toFixed(2)}) over ${r.sits} sit${r.sits === 1 ? "" : "s"}.`);
    if (r.sits < 3) notes.push(`${r.family}: only ${r.sits} sit${r.sits === 1 ? "" : "s"} so far, so this rate can move a lot.`);
  }
  if (all.estimatedTravel) notes.push(`Drive time for ${all.estimatedTravel} sit${all.estimatedTravel === 1 ? " is" : "s is"} estimated from miles at ${insightSettings(desk.profile).travelMph} mph. Type each family's real round-trip drive time for a truer figure.`);
  return { from: start, to: end, rows, total: all, notes };
}

// Earnings and hours by weekday and by season over a period.
export function incomePatterns(desk, { from, to, today } = {}) {
  const end = to || today || "9999-12-31";
  const start = from || (today ? addDays(today, -365) : "0000-01-01");
  const sits = workedSits(desk, { from: start, to: end });
  const byWeekday = DAYS.map((day, i) => ({ day, ...totals(sits.filter((s) => s.weekday === i)) }));
  const bySeason = SEASONS.map((x) => ({ season: x.key, label: x.label, ...totals(sits.filter((s) => x.months.includes(s.month))) }));
  const top = byWeekday.filter((d) => d.earned > 0).sort((a, b) => b.earned - a.earned)[0] || null;
  return { from: start, to: end, byWeekday, bySeason, topDay: top ? top.day : null, total: totals(sits) };
}

// Hours a week the sitter's availability offers, per weekday.
export function availableHours(availability) {
  const { slots, errors } = parseWeekly(availability);
  const byDay = DAYS.map((_, d) => r2((slots[d] || []).reduce((a, [s, e]) => a + (e - s), 0) / 60));
  return { byDay, week: r2(byDay.reduce((a, x) => a + x, 0)), errors };
}

// Booked sit hours against available hours, for the weeks behind and ahead of today.
// Upcoming weeks count scheduled sits; past weeks count sits that happened.
export function capacity(desk, today, { weeksBack = 8, weeksAhead = 4 } = {}) {
  const avail = availableHours((desk.profile || {}).availability);
  const settings = insightSettings(desk.profile);
  const fams = new Map((desk.families || []).map((f) => [f.id, f]));
  const sunday = addDays(today, -dayOf(today));
  const weeks = [];
  const all = expandBookings(desk.bookings || []).filter((o) => o.status !== "cancelled");
  for (let w = -weeksBack; w < weeksAhead; w++) {
    const start = addDays(sunday, 7 * w), end = addDays(start, 6);
    const list = all.filter((o) => o.date >= start && o.date <= end);
    const hours = list.reduce((a, o) => a + sitMinutes(o) / 60, 0);
    const travel = list.reduce((a, o) => a + travelMinutes(o, fams.get(o.familyId), settings).minutes / 60, 0);
    weeks.push({ start, end, past: end < today, sits: list.length, hours: r2(hours), travelHours: r2(travel), available: avail.week, pct: avail.week > 0 ? Math.round((hours / avail.week) * 100) : null });
  }
  // Weekday fill over the past weeks: which days are full and which have room.
  const pastStart = addDays(sunday, -7 * weeksBack);
  const pastSits = all.filter((o) => o.date >= pastStart && o.date < sunday);
  const byDay = DAYS.map((day, d) => {
    const booked = pastSits.filter((o) => dayOf(o.date) === d).reduce((a, o) => a + sitMinutes(o) / 60, 0) / Math.max(1, weeksBack);
    return { day, available: avail.byDay[d], booked: r2(booked), pct: avail.byDay[d] > 0 ? Math.round((booked / avail.byDay[d]) * 100) : null };
  });
  const past = weeks.filter((w) => w.past);
  const ahead = weeks.filter((w) => !w.past);
  const avg = (list) => (list.length ? r2(list.reduce((a, w) => a + w.hours, 0) / list.length) : 0);
  const pastAvg = avg(past), aheadAvg = avg(ahead);
  return {
    availableWeek: avail.week, errors: avail.errors, weeks, byDay,
    pastAvgHours: pastAvg, pastPct: avail.week > 0 ? Math.round((pastAvg / avail.week) * 100) : null,
    aheadAvgHours: aheadAvg, aheadPct: avail.week > 0 ? Math.round((aheadAvg / avail.week) * 100) : null,
    openHoursAhead: r2(Math.max(0, avail.week * ahead.length - ahead.reduce((a, w) => a + w.hours, 0))),
  };
}

// ---------- rate raise ----------

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export function longDate(d) {
  const t = new Date(`${d}T12:00:00Z`);
  return `${WEEKDAYS[t.getUTCDay()]}, ${MONTHS[t.getUTCMonth()]} ${t.getUTCDate()}, ${t.getUTCFullYear()}`;
}

// What a new base hourly rate does to each family's month, from their usual billed hours
// over the lookback window (weekly repeats included). The extra-child charge and the other
// fees stay as they are; only the base hourly rate changes. A sit with an agreed fixed
// price is counted at its billed hours, as if it moved to the new rate too.
export function raisePlan(desk, { newRate, effective, today, lookbackDays = 90, honorBooked = true } = {}) {
  const p = desk.profile || {};
  const oldRate = num((p.rates || {}).hourly);
  const rate = num(newRate);
  const errors = [];
  if (!(rate > 0)) errors.push("Enter the new hourly rate.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(effective || ""))) errors.push("Enter the date the new rate starts.");
  const noticeDays = errors.length ? 0 : daysBetween(today, effective);
  if (!errors.length && noticeDays < 0) errors.push("The start date is in the past.");
  const from = addDays(today, -lookbackDays);
  const sits = workedSits(desk, { from, to: addDays(today, -1) });
  const months = lookbackDays / (365.25 / 12);
  const names = new Map((desk.families || []).map((f) => [f.id, f]));
  const groups = new Map();
  for (const s of sits) { if (!s.familyId) continue; if (!groups.has(s.familyId)) groups.set(s.familyId, []); groups.get(s.familyId).push(s); }
  // Families with no recent sits but something booked ahead still get a message.
  const upcoming = expandBookings(desk.bookings || []).filter((o) => o.status !== "cancelled" && o.date >= today && o.familyId);
  for (const o of upcoming) if (!groups.has(o.familyId)) groups.set(o.familyId, []);
  const diff = rate - oldRate;
  const rows = [...groups.entries()].filter(([id]) => names.has(id)).map(([familyId, list]) => {
    const f = names.get(familyId);
    const hoursPerMonth = list.reduce((a, s) => a + s.billedHours, 0) / months;
    const nowMonthly = list.reduce((a, s) => a + s.earned, 0) / months;
    const change = hoursPerMonth * diff;
    const bookedBefore = upcoming.filter((o) => o.familyId === familyId && o.date < effective).length;
    return {
      familyId, family: f.name, sits: list.length, hoursPerMonth: r1(hoursPerMonth), nowMonthly: r2(nowMonthly), newMonthly: r2(nowMonthly + change), change: r2(change),
      pct: nowMonthly > 0 ? r1((change / nowMonthly) * 100) : null, bookedBefore,
      message: errors.length ? "" : raiseMessage(f, p, { oldRate, newRate: rate, effective, change, honorBooked, bookedBefore }),
    };
  }).sort((a, b) => b.change - a.change || a.family.localeCompare(b.family));
  const settings = insightSettings(p);
  const notes = [];
  if (!errors.length) {
    notes.push(`That gives ${noticeDays} day${noticeDays === 1 ? "" : "s"} of notice before ${longDate(effective)}.`);
    if (noticeDays < 30) notes.push("Families plan budgets by the month; more notice is kinder if you can give it.");
    if (diff <= 0) notes.push(`The new rate is not higher than your current $${oldRate.toFixed(2)} an hour.`);
  }
  if (num(settings.localRate) > 0) notes.push(`Your own local comparison: $${num(settings.localRate).toFixed(2)} an hour${settings.localRateNote ? ` (${settings.localRateNote})` : ""}.`);
  const total = rows.reduce((a, r) => a + r.change, 0);
  return { oldRate, newRate: rate, effective, noticeDays, lookbackDays, rows, monthlyChange: r2(total), yearlyChange: r2(total * 12), notes, errors };
}

export function raiseMessage(family, profile, { oldRate, newRate, effective, change, honorBooked = true, bookedBefore = 0 }) {
  const first = String(family.contactName || "").trim().split(/\s+/)[0] || "there";
  const kids = (family.kids || []).map((k) => k.name).filter(Boolean);
  const kidText = kids.length ? kids.length === 1 ? kids[0] : `${kids.slice(0, -1).join(", ")} and ${kids[kids.length - 1]}` : "your kids";
  const lines = [
    `Hi ${first}! It's ${profile.name || "your babysitter"}. Thank you so much for trusting me with ${kidText}. It's a joy to be part of your family's week.`,
    `I wanted to let you know well ahead of time that starting ${longDate(effective)}, my hourly rate will go from $${num(oldRate).toFixed(2)} to $${num(newRate).toFixed(2)}.`,
  ];
  if (change > 0.5) lines.push(`For the sits you usually book, that works out to about $${Math.round(change)} more a month.`);
  if (honorBooked && bookedBefore > 0) lines.push(`The sit${bookedBefore === 1 ? "" : "s"} already on the calendar before then stay${bookedBefore === 1 ? "s" : ""} at the current rate.`);
  else if (honorBooked) lines.push("Anything booked for before then stays at the current rate.");
  lines.push("If you have any questions, or if this changes what works for your family, please tell me. I'd love to keep sitting for you. Thank you!");
  return lines.join(" ");
}

// ---------- income letter ----------

// Payments recorded in `year` up to `through`, by month.
export function paidByMonth(desk, year, through = `${year}-12-31`) {
  const Y = String(year);
  const months = MONTHS.map((name, i) => ({ month: i + 1, name, amount: 0, count: 0 }));
  for (const b of desk.bookings || []) for (const pay of payments(b)) {
    const d = String(pay.date || "");
    if (!d.startsWith(Y) || d > through) continue;
    const m = months[Number(d.slice(5, 7)) - 1];
    if (!m) continue;
    m.amount += num(pay.amount); m.count++;
  }
  for (const m of months) m.amount = r2(m.amount);
  return months;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const usd = (x) => `$${num(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// A year-to-date income summary she signs. Gross receipts by month from recorded payments;
// optionally her recorded expenses and mileage too, so a reader sees net as well as gross.
export function incomeLetter(desk, { year, today, addressee = "", purpose = "", includeNet = false } = {}) {
  const p = desk.profile || {};
  const Y = Number(year || String(today).slice(0, 4));
  const through = String(today).slice(0, 4) === String(Y) ? today : `${Y}-12-31`;
  const lastMonth = Number(through.slice(5, 7));
  const months = paidByMonth(desk, Y, through).slice(0, lastMonth);
  const total = r2(months.reduce((a, m) => a + m.amount, 0));
  const payCount = months.reduce((a, m) => a + m.count, 0);
  const worked = months.filter((m) => m.amount > 0).length;
  // Months elapsed, counting a part month as a fraction, so a letter written on the 2nd
  // does not average in a whole empty month.
  const elapsedMonths = (daysBetween(`${Y}-01-01`, through) + 1) / (365.25 / 12);
  const avg = elapsedMonths > 0 ? r2(total / elapsedMonths) : 0;
  const families = new Set();
  for (const b of desk.bookings || []) for (const pay of payments(b)) if (String(pay.date).startsWith(String(Y)) && pay.date <= through && b.familyId) families.add(b.familyId);
  let expenses = 0, mileage = 0;
  if (includeNet) {
    for (const e of desk.expenses || []) if (String(e.date).startsWith(String(Y)) && e.date <= through) { expenses += num(e.amount); if (num(e.miles)) mileage += num(e.miles) * mileageRate(e.date, p.mileageRate); }
    for (const s of workedSits(desk, { from: `${Y}-01-01`, to: through })) mileage += s.mileageCost;
  }
  const net = r2(total - expenses - mileage);
  const who = p.businessName ? `${p.name}, doing business as ${p.businessName}` : p.name;
  const lines = [
    longDate(today),
    "",
    addressee ? `To: ${addressee}` : "To whom it may concern:",
    "",
    `I, ${who}, am a self-employed babysitter${p.city && p.city !== "Your Town" ? ` in ${p.city}` : ""}. ${purpose ? `${purpose} ` : ""}Below is the income I received from babysitting from January 1 through ${longDate(through).replace(/^\w+, /, "")}, from my own payment records.`,
    "",
    ...months.map((m) => `  ${m.name.padEnd(10)} ${usd(m.amount).padStart(12)}`),
    `  ${"Total".padEnd(10)} ${usd(total).padStart(12)}`,
    "",
    `That is ${payCount} payment${payCount === 1 ? "" : "s"} from ${families.size} famil${families.size === 1 ? "y" : "ies"}, about ${usd(avg)} a month on average since January 1.`,
  ];
  if (includeNet) lines.push(`After the business expenses (${usd(expenses)}) and mileage at the IRS standard rate (${usd(mileage)}) I recorded, net self-employment income for the same period is ${usd(net)}.`);
  lines.push(
    "",
    "This is a self-prepared summary of my own records. It is not a tax return, a tax form or a document from the IRS, and no accountant or bank has checked it. I can provide bank or payment-app statements, or my filed tax return, on request.",
    "",
    "Signed: ______________________________",
    `        ${p.name || ""}`,
  );
  if (p.phone || p.email) lines.push(`        ${[p.phone, p.email].filter(Boolean).join(" · ")}`);
  if (p.address) lines.push(`        ${p.address}`);
  const text = lines.join("\n");
  return { year: Y, through, months, total, payCount, families: families.size, avg, worked, expenses: r2(expenses), mileage: r2(mileage), net, includeNet, text, html: letterHTML(text, `Income summary ${Y}`) };
}

// A printable page for the letter: plain text in a print-friendly frame.
export function letterHTML(text, title) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font:15px/1.5 Georgia,serif;color:#111;max-width:720px;margin:40px auto;padding:0 20px}pre{font:inherit;white-space:pre-wrap}.tag{font:12px system-ui,sans-serif;color:#555;border:1px solid #bbb;display:inline-block;padding:2px 8px;border-radius:4px}@media print{.noprint{display:none}body{margin:0 auto}}</style></head>
<body><p class="tag">Self-prepared summary, not a tax document</p><pre>${esc(text)}</pre><p class="noprint"><button onclick="print()">Print</button></p></body></html>`;
}

// ---------- year over year ----------

// Years with any recorded payment or worked sit.
export function yearsWithData(desk, today) {
  const ys = new Set();
  for (const b of desk.bookings || []) for (const pay of payments(b)) if (/^\d{4}/.test(String(pay.date))) ys.add(Number(String(pay.date).slice(0, 4)));
  for (const s of workedSits(desk, { to: today })) ys.add(Number(s.date.slice(0, 4)));
  return [...ys].sort((a, b) => a - b);
}

// This year so far against the same stretch of last year, month by month, plus full-year
// totals for every year on record. Null until there are two years of data.
export function yearOverYear(desk, today) {
  const years = yearsWithData(desk, today);
  if (years.length < 2) return null;
  const cur = Number(today.slice(0, 4));
  const thisYear = years.includes(cur) ? cur : years[years.length - 1];
  const lastYear = years.filter((y) => y < thisYear).pop();
  if (!lastYear) return null;
  const md = thisYear === cur ? today.slice(5) : "12-31";
  const period = (y) => {
    const through = `${y}-${md === "02-29" && y % 4 ? "02-28" : md}`;
    const paid = paidByMonth(desk, y, through);
    const t = totals(workedSits(desk, { from: `${y}-01-01`, to: through }));
    const fams = new Set(workedSits(desk, { from: `${y}-01-01`, to: through }).map((s) => s.familyId).filter(Boolean));
    return { year: y, through, paid: r2(paid.reduce((a, m) => a + m.amount, 0)), months: paid, sits: t.sits, hours: t.hours, perSitHour: t.perSitHour, effectiveHourly: t.effectiveHourly, families: fams.size };
  };
  const a = period(thisYear), b = period(lastYear);
  const pct = (x, y) => (y > 0 ? r1(((x - y) / y) * 100) : null);
  const lastMonth = Number(md.slice(0, 2));
  const months = MONTHS.slice(0, lastMonth).map((name, i) => ({ name, thisYear: a.months[i].amount, lastYear: b.months[i].amount, change: r2(a.months[i].amount - b.months[i].amount) }));
  const fullYears = years.map((y) => {
    const t = totals(workedSits(desk, { from: `${y}-01-01`, to: y === cur ? today : `${y}-12-31` }));
    const paid = paidByMonth(desk, y, y === cur ? today : `${y}-12-31`).reduce((s, m) => s + m.amount, 0);
    return { year: y, partial: y === cur, paid: r2(paid), sits: t.sits, hours: t.hours, effectiveHourly: t.effectiveHourly };
  });
  return {
    thisYear: a, lastYear: b, months, fullYears,
    change: { paid: r2(a.paid - b.paid), paidPct: pct(a.paid, b.paid), sits: a.sits - b.sits, hours: r2(a.hours - b.hours), effectiveHourly: r2(a.effectiveHourly - b.effectiveHourly), families: a.families - b.families },
  };
}
