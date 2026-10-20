// Calendar export: the dates the calculator works out, as an .ics file that
// any calendar app imports. Local only; nothing is uploaded.

const pad = n => String(n).padStart(2, '0');

function compact(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  const d = m && new Date(`${iso}T00:00:00Z`);
  if (!m || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) throw new Error('Enter a valid date.');
  return m[1] + m[2] + m[3];
}

function nextDay(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error('Enter a valid date.');
  d.setUTCDate(d.getUTCDate() + 1);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

function addDaysISO(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const escapeText = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// RFC 5545 asks for lines of at most 75 octets, continued with CRLF + space.
function fold(line) {
  const out = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}

/**
 * Three all-day events for one invoice: it falls due, the cash is expected on
 * the client's pay run, and the day the grace period ends, when a late fee
 * would start to accrue. Events that coincide are merged so a calendar does
 * not show the same day twice.
 */
export function buildCalendar({ invoiceDate, dueDate, settlementDate, graceDays = 0, amount = 0, label = 'Invoice' } = {}) {
  compact(invoiceDate);
  compact(dueDate);
  compact(settlementDate);
  const grace = Math.max(0, Math.round(Number(graceDays) || 0));
  const money = Number.isFinite(Number(amount)) ? `$${Number(amount).toFixed(2)} ` : '';
  const name = String(label).trim() || 'Invoice';
  const graceEnds = addDaysISO(dueDate, grace);

  const events = [
    { date: dueDate, key: 'due', summary: `${name} ${money}due`, note: 'Date on the invoice terms.' },
    { date: settlementDate, key: 'cash', summary: `${name} ${money}cash expected`, note: "Next pay run of your client's accounts-payable on or after the due date." },
  ];
  if (grace > 0) {
    events.push({ date: graceEnds, key: 'grace', summary: `${name} grace period ends`, note: `${grace} grace day${grace === 1 ? '' : 's'} after the due date; a late fee would start to accrue after this day.` });
  }
  const byDate = new Map();
  for (const e of events) {
    const prev = byDate.get(e.date);
    if (prev) { prev.summary += ` / ${e.summary.slice(name.length + 1 + (money ? money.length : 0))}`; prev.note += ` ${e.note}`; prev.keys.push(e.key); }
    else byDate.set(e.date, { ...e, keys: [e.key] });
  }

  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//invoice-payment-terms-calculator//EN', 'CALSCALE:GREGORIAN'];
  for (const e of [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.keys.join('-')}-${compact(invoiceDate)}-${compact(e.date)}@invoice-payment-terms-calculator`,
      `DTSTAMP:${compact(invoiceDate)}T000000Z`,
      `DTSTART;VALUE=DATE:${compact(e.date)}`,
      `DTEND;VALUE=DATE:${nextDay(e.date)}`,
      `SUMMARY:${escapeText(e.summary)}`,
      `DESCRIPTION:${escapeText(`${e.note} Arithmetic from the numbers you entered; not a prediction that the client pays on this day.`)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
