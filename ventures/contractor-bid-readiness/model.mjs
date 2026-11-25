/**
 * Whole calendar days from `today` to the due date: 0 on the day itself, -1 the
 * day after it passed.
 *
 * The previous form took the difference between the due date's last second and
 * the current instant and rounded it up, which is not the same question. It
 * read a bid due today as "1 day(s) remain" and one due tomorrow as 2, so a
 * contractor planned against a day they did not have. Worse at the other end:
 * a deadline that expired last night produced a fraction between -1 and 0,
 * which rounds up to 0, so `urgency` never reached `past-due` inside the first
 * 24 hours — the page said "urgent" about a bid that could no longer be filed.
 * An unparseable date produced NaN and printed "NaN day(s) remain"; it is now
 * null, which the page already words as "add a deadline".
 */
export function daysUntilDue(dueDate, today = new Date()) {
  if (!dueDate) return null;
  const due = Date.parse(`${dueDate}T00:00:00`);
  if (Number.isNaN(due)) return null;
  // Date.parse rolls a calendar-invalid day over ('2099-02-30' becomes March 2),
  // which would count days to a date nobody typed; treat it as no deadline.
  const d = new Date(due);
  const back = `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (back !== dueDate) return null;
  // Both sides collapsed to local midnight before dividing, so a 23- or
  // 25-hour day across a daylight-saving change cannot shift the answer.
  const start = new Date(today).setHours(0, 0, 0, 0);
  return Math.round((due - start) / 86400000);
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** A usable IANA time zone name, or null (blank, unknown, or not a string). */
export function usableTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone.trim()) return null;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: timeZone.trim() }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/** "HH:MM" on a 24-hour clock, or null. */
export function usableTime(dueTime) {
  return typeof dueTime === 'string' && TIME_RE.test(dueTime) ? dueTime : null;
}

// The wall-clock fields of `ms` as seen in `timeZone`.
function wallParts(ms, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') };
}

function offsetAt(ms, timeZone) {
  const w = wallParts(ms, timeZone);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000;
}

/**
 * The instant a bid is due: the solicitation's date and time read on the
 * issuing office's clock (an IANA zone such as "America/Chicago"), or on this
 * browser's clock when no zone is given. Null without a valid date and time.
 *
 * Solicitations state a time and the zone it is read in ("2:00 PM local time
 * at the County Purchasing Office"), and a bid received after it is late
 * (FAR 14.304 for US federal sealed bids). A date alone cannot say that a
 * 2:00 PM deadline has passed at 3:00 PM the same day.
 */
export function dueInstant(dueDate, dueTime, timeZone) {
  const time = usableTime(dueTime);
  if (!time || daysUntilDue(dueDate, new Date(Date.parse(`${dueDate}T12:00:00`))) === null) return null;
  const zone = usableTimeZone(timeZone);
  if (!zone) return Date.parse(`${dueDate}T${time}:00`);
  const [y, m, d] = dueDate.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, h, mi);
  // Two passes settle the offset across a daylight-saving change.
  let instant = wall - offsetAt(wall, zone);
  instant = wall - offsetAt(instant, zone);
  return instant;
}

// Calendar days from today to the due date, both read in `timeZone`.
function daysUntilDueIn(dueDate, today, timeZone) {
  if (daysUntilDue(dueDate, new Date(Date.parse(`${dueDate}T12:00:00`))) === null) return null;
  const w = wallParts(new Date(today).getTime(), timeZone);
  const [y, m, d] = dueDate.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(w.y, w.m - 1, w.d)) / 86400000);
}

/**
 * `timing` is optional: { dueTime: "HH:MM", timeZone: IANA name }. With a due
 * time the bid is past-due from that minute, not from the next midnight, and
 * `minutesRemaining` says how long is left. With a zone the day count is the
 * issuing office's calendar, not the viewer's.
 */
export function assessBid(items, dueDate, today = new Date(), timing = {}) {
  const zone = usableTimeZone(timing && timing.timeZone);
  const daysRemaining = zone ? daysUntilDueIn(dueDate, today, zone) : daysUntilDue(dueDate, today);
  const dueAt = daysRemaining === null ? null : dueInstant(dueDate, timing && timing.dueTime, zone);
  const minutesRemaining = dueAt === null ? null : Math.floor((dueAt - new Date(today).getTime()) / 60000);
  const rows = items.map((item) => ({
    name: item.name.trim(),
    owner: item.owner.trim(),
    status: item.status,
    note: item.note.trim(),
  }));
  const missing = rows.filter((row) => row.status !== 'ready');
  const blocked = rows.filter((row) => row.status === 'blocked');
  const pastDue = minutesRemaining !== null ? minutesRemaining < 0 : daysRemaining !== null && daysRemaining < 0;
  return {
    rows,
    missing,
    blocked,
    ready: rows.length > 0 && missing.length === 0,
    daysRemaining,
    minutesRemaining,
    dueTime: dueAt === null ? null : usableTime(timing.dueTime),
    timeZone: zone,
    urgency: pastDue ? 'past-due' : daysRemaining !== null && daysRemaining <= 2 ? 'urgent' : 'normal',
  };
}

function hoursAndMinutes(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}

/**
 * How the deadline is worded to the user. Zero is the case worth spelling out:
 * "0 day(s) remain" is technically what the count says and reads as though
 * there is no deadline pressure at all, on the one day there is most.
 */
export function deadlineSentence(daysRemaining, timing = {}) {
  if (daysRemaining === null) return 'Add a deadline for urgency context.';
  const minutes = timing && Number.isFinite(timing.minutesRemaining) ? timing.minutesRemaining : null;
  const at = minutes !== null && timing.dueTime ? ` at ${timing.dueTime}${timing.timeZone ? ` ${timing.timeZone} time` : ''}` : '';
  if (minutes !== null && minutes < 0 && daysRemaining >= 0) {
    // Due today (or, on the office's clock, still "today") and the minute has gone.
    return `The deadline passed today${at}, ${hoursAndMinutes(-minutes)} ago.`;
  }
  if (daysRemaining < 0) {
    const days = Math.abs(daysRemaining);
    return `The deadline passed ${days} day${days === 1 ? '' : 's'} ago.`;
  }
  if (daysRemaining === 0) return minutes !== null ? `The deadline is today${at}, ${hoursAndMinutes(minutes)} from now.` : 'The deadline is today.';
  return `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remain${daysRemaining === 1 ? 's' : ''}${at ? ` (due${at})` : ''}.`;
}

export function markdownReport(result, opportunity, dueDate) {
  const lines = [`# Bid readiness: ${opportunity || 'Untitled opportunity'}`, '', `Due date: ${dueDate || 'Not set'}${result.dueTime ? ` ${result.dueTime}` : ''}${result.timeZone ? ` (${result.timeZone})` : ''}`, `Deadline: ${deadlineSentence(result.daysRemaining, result)}${result.daysRemaining === null ? '' : ` (${result.urgency})`}`, `Result: ${result.ready ? 'All listed items ready' : `${result.missing.length} item(s) need attention`}`, ''];
  for (const row of result.rows) lines.push(`- [${row.status === 'ready' ? 'x' : ' '}] **${row.name}** (${row.status})${row.owner ? ` | owner: ${row.owner}` : ''}${row.note ? ` | ${row.note}` : ''}`);
  lines.push('', 'This is a private working record, not a determination that a bid is complete or compliant. Review the solicitation and confirm requirements with the issuing authority.');
  return lines.join('\n');
}
