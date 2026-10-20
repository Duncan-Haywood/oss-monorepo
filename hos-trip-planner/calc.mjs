// Hours-of-service trip planner for property-carrying drivers (49 CFR 395.3).
// Pure arithmetic over the clocks the driver types in. It ships no map or
// mileage data, and it is a planning aid, not a logbook or an ELD.
export const LIMITS = { drive: 11, window: 14, breakAfter: 8, breakLen: 0.5, offDuty: 10, restart: 34 };
export const CYCLES = { "60/7": 60, "70/8": 70 };
const EPS = 1e-9;

const num = (v) => (v === "" || v === null || v === undefined ? NaN : Number(v));

export function parseLegs(text) {
  // One leg per line: "miles, mph, dwell hours at the stop, label"
  const legs = [];
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const [i, line] of lines.entries()) {
    const [miles, mph, dwell, ...label] = line.split(",").map((s) => s.trim());
    const leg = { miles: num(miles), mph: num(mph || 55), dwell: dwell === undefined || dwell === "" ? 0 : num(dwell), label: label.join(", ") || `Stop ${i + 1}` };
    if (!(leg.miles >= 0) || !(leg.mph > 0) || !(leg.dwell >= 0)) return { error: `Line ${i + 1}: use "miles, mph, dwell hours, label" with positive numbers.` };
    legs.push(leg);
  }
  if (!legs.length) return { error: "Add at least one leg: miles, mph, dwell hours at the stop, label." };
  return { legs };
}

export const DEFAULTS = {
  cycle: "70/8", cycleUsed: 0, driveUsed: 0, windowUsed: 0, driveSinceBreak: 0,
  startHour: 6, autoRestart: true, appointmentHour: "",
};

export function plan(input) {
  const v = { ...DEFAULTS, ...input };
  const cap = CYCLES[v.cycle];
  if (!cap) return { error: "Cycle must be 60/7 or 70/8." };
  const legsIn = Array.isArray(v.legs) ? { legs: v.legs } : parseLegs(v.legs);
  if (legsIn.error) return legsIn;
  const s = { cycleUsed: num(v.cycleUsed), drive: num(v.driveUsed), window: num(v.windowUsed), sinceBreak: num(v.driveSinceBreak) };
  for (const [k, x] of Object.entries(s)) if (!(x >= 0)) return { error: `Enter 0 or more for ${k}.` };
  if (s.cycleUsed > cap || s.drive > LIMITS.drive || s.window > LIMITS.window || s.sinceBreak > LIMITS.breakAfter)
    return { error: "A clock you entered is already past its limit. Enter hours used so far, within the limit." };
  const start = num(v.startHour);
  if (!(start >= 0)) return { error: "Start hour must be 0 or more (hours from midnight)." };

  let t = start; // clock hours since midnight of day 0
  const events = [];
  const stops = [];
  const add = (type, hours, note) => { events.push({ type, start: t, end: t + hours, hours, note }); t += hours; };
  let totalMiles = 0, driveHours = 0;
  const count = { breaks: 0, offDuty: 0, restarts: 0 };

  const rest = (kind) => {
    if (kind === "break") { add("break", LIMITS.breakLen, "30-minute break"); s.window += LIMITS.breakLen; s.sinceBreak = 0; count.breaks++; }
    else if (kind === "restart") { add("restart", LIMITS.restart, "34-hour restart"); Object.assign(s, { cycleUsed: 0, drive: 0, window: 0, sinceBreak: 0 }); count.restarts++; }
    else { add("off", LIMITS.offDuty, "10 hours off duty"); Object.assign(s, { drive: 0, window: 0, sinceBreak: 0 }); count.offDuty++; }
  };

  for (const leg of legsIn.legs) {
    let left = leg.miles / leg.mph;
    totalMiles += leg.miles;
    let guard = 0;
    while (left > EPS) {
      if (++guard > 500) return { error: "Plan did not converge; check the legs." };
      const room = Math.min(left, LIMITS.drive - s.drive, LIMITS.window - s.window, LIMITS.breakAfter - s.sinceBreak, cap - s.cycleUsed);
      if (room > EPS) {
        add("drive", room, `Drive ${Math.round(room * leg.mph)} mi toward ${leg.label}`);
        s.drive += room; s.window += room; s.sinceBreak += room; s.cycleUsed += room; left -= room; driveHours += room;
        continue;
      }
      if (cap - s.cycleUsed <= EPS) {
        if (!v.autoRestart) return { error: "The cycle runs out before the trip is done. Turn on the 34-hour restart or shorten the trip.", events, count };
        rest("restart");
      } else if (LIMITS.drive - s.drive <= EPS || LIMITS.window - s.window <= EPS) rest("off");
      else rest("break");
    }
    // dwell at the stop: on duty, not driving
    if (leg.dwell > 0) {
      add("dwell", leg.dwell, `On duty at ${leg.label}`);
      s.window += leg.dwell; s.cycleUsed += leg.dwell;
      if (leg.dwell >= LIMITS.breakLen) s.sinceBreak = 0;
    }
    stops.push({ label: leg.label, arrive: t - leg.dwell, depart: t, windowLeft: Math.max(0, LIMITS.window - s.window), driveLeft: Math.max(0, LIMITS.drive - s.drive), cycleLeft: Math.max(0, cap - s.cycleUsed), overWindow: s.window > LIMITS.window + EPS, overCycle: s.cycleUsed > cap + EPS });
  }

  const arrive = stops.length ? stops[stops.length - 1].arrive : start;
  const appt = v.appointmentHour === "" || v.appointmentHour === null ? null : num(v.appointmentHour);
  const result = {
    inputs: v, events, stops, count, totalMiles, driveHours,
    elapsed: t - start, arrive, finish: t,
    restHours: events.filter((e) => e.type !== "drive" && e.type !== "dwell").reduce((a, e) => a + e.hours, 0),
    appointment: appt, lateBy: appt !== null && Number.isFinite(appt) ? Math.max(0, arrive - appt) : null,
    advice: [],
  };
  const a = result.advice;
  a.push(`${Math.round(totalMiles)} mi needs ${driveHours.toFixed(1)} h of driving; with required rest the delivery lands ${fmtDuration(result.elapsed)} after you start (${fmtClock(arrive)} on ${dayWord(arrive)}).`);
  if (count.offDuty + count.restarts) a.push(`It needs ${count.offDuty} ten-hour reset${count.offDuty === 1 ? "" : "s"}${count.restarts ? ` and ${count.restarts} 34-hour restart` : ""}; that rest, not the miles, is what pushes the arrival.`);
  if (result.lateBy > EPS) a.push(`You would be ${fmtDuration(result.lateBy)} past the appointment. Options: start earlier, take the reset before loading, split the load, or move the appointment.`);
  else if (appt !== null) a.push(`Makes the appointment with ${fmtDuration(appt - arrive)} to spare.`);
  const tightest = stops.reduce((m, x) => (x.windowLeft < m.windowLeft ? x : m), stops[0]);
  if (stops.some((x) => x.overCycle)) a.push("A stop's dwell pushes you over the cycle limit; the next drive will force a restart.");
  if (tightest && tightest.windowLeft < 1) a.push(`At ${tightest.label} you have under an hour of the 14-hour window left; long dwell there will cost a reset.`);
  return result;
}

export function fmtDuration(h) {
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}
export function fmtClock(h) {
  const m = Math.round(((h % 24) + 24) % 24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
export function dayWord(h) { const d = Math.floor(h / 24); return d === 0 ? "day 1" : `day ${d + 1}`; }

export function sampleInput() {
  return {
    cycle: "70/8", cycleUsed: 41, driveUsed: 0, windowUsed: 0, driveSinceBreak: 0, startHour: 6, autoRestart: true, appointmentHour: 40,
    legs: "420, 58, 1.5, Shipper (made-up)\n380, 58, 2, Receiver (made-up)",
  };
}

export function toCsv(r) {
  const rows = [["event", "start", "end", "hours", "note"], ...r.events.map((e) => [e.type, `${dayWord(e.start)} ${fmtClock(e.start)}`, `${dayWord(e.end)} ${fmtClock(e.end)}`, e.hours.toFixed(2), `"${e.note}"`])];
  return rows.map((x) => x.join(",")).join("\n");
}
