// A tax calendar for one year as plain events and as an iCalendar (.ics) file
// you can subscribe to in Google Calendar, Apple Calendar or Outlook: federal
// estimated payments (with the amount from `estimatedTax` when given), the
// Jan 31 W-2 / 1099-NEC / 940 date, quarterly 941 dates, the filing deadline
// and, when a state is named, each sales tax return. Dates are the ones the
// rest of the venture already uses; a calendar to plan from, not advice.
import { estimatedDueDates } from "./taxforms.mjs";
import { salesTaxDueDates, nextBusinessDay } from "./salestaxreturn.mjs";

export function taxCalendar(year, { state = null, frequency = "quarterly", payroll = false, contractors = false, estimates = null, dueDay, endMonth } = {}) {
  const ev = [];
  const add = (date, title, notes = "") => ev.push({ date, title, notes });
  const est = estimatedDueDates(year);
  ["Q1", "Q2", "Q3", "Q4"].forEach((q, i) => add(est[i], `Federal estimated tax payment ${q} (Form 1040-ES)`,
    estimates?.[i] != null ? `Planned payment ${(estimates[i] / 100).toFixed(2)}` : "Amount from the estimate command."));
  add(nextBusinessDay(`${year + 1}-04-15`), `${year} federal return due (Schedule C, SE tax)`, "Extension to October moves the filing date, not the payment.");
  if (contractors || payroll) add(nextBusinessDay(`${year + 1}-01-31`), `1099-NEC to contractors and IRS${payroll ? ", W-2s to employees, Form 940" : ""}`, "Furnish and file by this date.");
  if (payroll) for (const [m, d] of [[4, 30], [7, 31], [10, 31]]) add(nextBusinessDay(`${year}-${String(m).padStart(2, "0")}-${d}`), "Form 941 quarterly payroll return", "Due the last day of the month after the quarter; Q4 is due Jan 31.");
  if (payroll) add(nextBusinessDay(`${year + 1}-01-31`), "Form 941 for the fourth quarter", "");
  if (state) for (const r of salesTaxDueDates(year, { state, frequency, dueDay, endMonth })) add(r.due, `${String(state).toUpperCase()} sales tax return for ${r.period}`, "Check the state's own page for your filing frequency and due date.");
  return ev.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

const esc = (t) => String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const nextDay = (d) => { const dt = new Date(`${d}T00:00:00Z`); dt.setUTCDate(dt.getUTCDate() + 1); return dt.toISOString().slice(0, 10).replace(/-/g, ""); };
// RFC 5545: CRLF line ends, lines folded at 75 octets, all-day events, a stable UID per date and title
export function toIcs(events, { name = "Tax calendar" } = {}) {
  const fold = (l) => { const out = []; let cur = ""; for (const ch of l) { if (new TextEncoder().encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ch; } else cur += ch; } out.push(cur); return out.map((x, i) => (i ? " " + x : x)).join("\r\n"); };
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ai-bookkeeper//tax calendar//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${esc(name)}`];
  for (const e of events) {
    const slug = e.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    lines.push("BEGIN:VEVENT", `UID:${e.date}-${slug}@ai-bookkeeper`, "DTSTAMP:20260101T000000Z", `DTSTART;VALUE=DATE:${e.date.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${nextDay(e.date)}`, `SUMMARY:${esc(e.title)}`);
    if (e.notes) lines.push(`DESCRIPTION:${esc(e.notes)}`);
    lines.push("BEGIN:VALARM", "TRIGGER:-P7D", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.title)} in 7 days`, "END:VALARM", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
