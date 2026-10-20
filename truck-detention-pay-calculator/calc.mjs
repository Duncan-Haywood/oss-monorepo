// Pure arithmetic for truck detention pay. No DOM, no network.
// Times are the wall-clock times printed on the bill of lading / gate receipt, entered as
// "YYYY-MM-DDTHH:MM". Each stop is read in its own local time, so no time zone is applied;
// a stop that spans a daylight-saving change is off by that hour, which the page says.

export const INCREMENTS = Object.freeze({ 15: "15 minutes", 30: "30 minutes", 60: "1 hour" });

const num = (v) => (v === "" || v === null || v === undefined ? 0 : Number(v));
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export const money = (n) => {
  const format = (n) => `$${round2(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(n));
  return n < 0 && /[1-9]/.test(text) ? `-${text}` : text;
};

function parseTime(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(String(s).trim());
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000; // minutes since epoch
}

export function hoursText(minutes) {
  const m = Math.round(minutes);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

// One stop. Detention clock starts at the LATER of arrival and the appointment, because most
// rate confirmations only pay detention for time after the appointment window opens.
export function stopDetention(stop, { freeMinutes, incrementMinutes, ratePerHour, capHours }) {
  const arrival = parseTime(stop.arrival);
  const departure = parseTime(stop.departure);
  const appt = parseTime(stop.appointment);
  const label = stop.name || "Stop";
  if (arrival === null || departure === null) return { label, skipped: true, reason: "needs arrival and departure" };
  if (Number.isNaN(arrival) || Number.isNaN(departure) || Number.isNaN(appt)) return { error: `${label}: use the date-time picker format.` };
  if (departure <= arrival) return { error: `${label}: departure must be after arrival.` };
  const start = appt !== null && appt > arrival ? appt : arrival;
  const onSite = departure - arrival;
  const clock = Math.max(0, departure - start);
  const beyondFree = Math.max(0, clock - freeMinutes);
  const billableMinutes = Math.ceil(beyondFree / incrementMinutes) * incrementMinutes;
  let billableHours = billableMinutes / 60;
  let capped = false;
  if (capHours > 0 && billableHours > capHours) { billableHours = capHours; capped = true; }
  return {
    label, skipped: false, onSiteMinutes: onSite, clockMinutes: clock,
    arrivedEarlyMinutes: start - arrival, billableHours, capped,
    amount: round2(billableHours * ratePerHour),
  };
}

export function calculateDetention(input = {}) {
  const v = {
    freeHours: input.freeHours === undefined ? 2 : num(input.freeHours),
    incrementMinutes: input.incrementMinutes === undefined ? 30 : num(input.incrementMinutes),
    ratePerHour: num(input.ratePerHour),
    capHours: num(input.capHours),
    linehaul: num(input.linehaul),
    driveHours: num(input.driveHours),
    detentionLoadsPerMonth: num(input.detentionLoadsPerMonth),
  };
  for (const [k, x] of Object.entries(v)) {
    if (!Number.isFinite(x) || x < 0) return { error: `${k} must be a number of zero or more.` };
  }
  if (!INCREMENTS[v.incrementMinutes]) return { error: "Billing increment must be 15, 30 or 60 minutes." };
  if (v.ratePerHour <= 0) return { error: "Enter the detention rate per hour from your rate confirmation." };
  const opts = { freeMinutes: v.freeHours * 60, incrementMinutes: v.incrementMinutes, ratePerHour: v.ratePerHour, capHours: v.capHours };
  const stops = [];
  for (const s of input.stops || []) {
    const r = stopDetention(s, opts);
    if (r.error) return { error: r.error };
    if (!r.skipped) stops.push(r);
  }
  if (!stops.length) return { error: "Enter arrival and departure times for at least one stop." };

  const total = round2(stops.reduce((a, s) => a + s.amount, 0));
  const billableHours = stops.reduce((a, s) => a + s.billableHours, 0);
  const onSiteHours = stops.reduce((a, s) => a + s.onSiteMinutes, 0) / 60;
  // What the wait does to the load's real hourly pay, with and without the claim being paid.
  const totalHours = v.driveHours + onSiteHours;
  const hourlyUnpaid = v.linehaul > 0 && totalHours > 0 ? round2(v.linehaul / totalHours) : null;
  const hourlyPaid = v.linehaul > 0 && totalHours > 0 ? round2((v.linehaul + total) / totalHours) : null;
  const findings = [];
  for (const s of stops) {
    if (s.capped) findings.push({ severity: "medium", title: `${s.label}: capped`, detail: `Billable time at ${s.label} hit your ${v.capHours}-hour cap; the hours beyond it are unpaid under the contract terms you entered.` });
    if (s.arrivedEarlyMinutes > 0) findings.push({ severity: "info", title: `${s.label}: clock starts at the appointment`, detail: `You arrived ${hoursText(s.arrivedEarlyMinutes)} before the appointment. Time before it does not count toward detention under the usual terms.` });
    if (s.amount === 0) findings.push({ severity: "info", title: `${s.label}: inside free time`, detail: `The clock ran ${hoursText(s.clockMinutes)}, which is within your ${v.freeHours}-hour free time. Nothing to claim here.` });
  }
  if (total > 0) findings.push({ severity: "high", title: "Claim it before you leave the lane", detail: "Most brokers require the detention request with signed in/out times within 24 to 72 hours or with the POD. Photograph the gate receipt or BOL times now." });
  const yearly = v.detentionLoadsPerMonth > 0 && total > 0 ? round2(total * v.detentionLoadsPerMonth * 12) : null;
  return { stops, total, billableHours, onSiteHours, hourlyUnpaid, hourlyPaid, yearly, findings, rate: v.ratePerHour, freeHours: v.freeHours };
}

// A plain, factual claim to paste into an email to the broker or dispatcher.
export function claimText(result, { loadNumber = "", carrierName = "" } = {}) {
  const lines = [`Subject: Detention request${loadNumber ? ` - load ${loadNumber}` : ""}`, "", "Hello,", "",
    `Please find our detention request${loadNumber ? ` for load ${loadNumber}` : ""}. Times are from the signed documents attached.`, ""];
  for (const s of result.stops) {
    if (s.amount > 0 || s.capped) lines.push(`- ${s.label}: ${hoursText(s.clockMinutes)} on the clock, ${result.freeHours}h free, ${s.billableHours}h billable x ${money(result.rate)}/h = ${money(s.amount)}`);
  }
  lines.push("", `Total detention: ${money(result.total)}`, "", "Please confirm and add it to the invoice or reply with what you need to approve it.", "", carrierName || "Thank you");
  return lines.join("\n");
}
