// Payment-reminder sequence: dated follow-ups around an invoice's due date,
// each with copyable wording, plus an .ics calendar file so the follow-ups
// land in the operator's own calendar. Pure functions, no network.
//
// Wording is a neutral template for the operator to edit. It does not say
// what a late fee or a collection step is permitted to do.

const DAY = 86400000;

export const REMINDER_STEPS = Object.freeze([
  { id: 'heads-up', offset: -3, label: 'Friendly heads-up' },
  { id: 'due-today', offset: 0, label: 'Due today' },
  { id: 'first-nudge', offset: 7, label: 'First follow-up' },
  { id: 'second-nudge', offset: 14, label: 'Second follow-up' },
  { id: 'final-notice', offset: 30, label: 'Final notice before next step' },
]);

function parseDate(value, label) {
  const m = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = m && new Date(`${value}T00:00:00Z`);
  if (!m || Number.isNaN(d.getTime()) || d.getUTCMonth() + 1 !== Number(m[2]) || d.getUTCDate() !== Number(m[3])) {
    throw new Error(`Enter a valid ${label}.`);
  }
  return d;
}

const iso = d => d.toISOString().slice(0, 10);

function money(n) {
  const [whole, frac] = Math.abs(n).toFixed(2).split('.');
  return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${frac}`;
}

function body(step, { invoiceNumber, amount, dueDate, daysFromDue }) {
  const ref = invoiceNumber ? `invoice ${invoiceNumber}` : 'our invoice';
  const sum = amount > 0 ? ` for ${money(amount)}` : '';
  switch (step.id) {
    case 'heads-up':
      return `Hi — a quick note that ${ref}${sum} is due on ${dueDate}. Let me know if anything is needed from my side to get it processed.`;
    case 'due-today':
      return `Hi — ${ref}${sum} is due today (${dueDate}). Please let me know when payment has been scheduled.`;
    case 'first-nudge':
      return `Hi — ${ref}${sum} was due on ${dueDate}, ${daysFromDue} days ago, and I haven't seen payment yet. Could you confirm it is in process? Happy to resend the invoice if that helps.`;
    case 'second-nudge':
      return `Hi — following up again on ${ref}${sum}, now ${daysFromDue} days past its ${dueDate} due date. Please reply with the expected payment date, or tell me if there is a problem with the invoice.`;
    default:
      return `Hi — ${ref}${sum} is now ${daysFromDue} days past due (due ${dueDate}). Please pay or contact me this week so we can resolve it directly; otherwise I will need to review the next step under our agreement.`;
  }
}

/**
 * @param {{invoiceDate: string, termsDays?: number, amount?: number, invoiceNumber?: string}} input
 * @returns {{dueDate: string, steps: {id, label, date, daysFromDue, subject, body}[]}}
 */
export function reminderSchedule(input) {
  if (!input || typeof input !== 'object') throw new Error('Enter invoice details.');
  const invoice = parseDate(input.invoiceDate, 'invoice date');
  const termsRaw = input.termsDays === undefined || input.termsDays === '' ? 30 : Number(input.termsDays);
  const termsDays = Number.isFinite(termsRaw) ? Math.max(0, Math.round(termsRaw)) : 30;
  const amountRaw = Number(input.amount);
  const amount = Number.isFinite(amountRaw) ? Math.max(0, amountRaw) : 0;
  const invoiceNumber = String(input.invoiceNumber || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 40);
  const due = new Date(invoice.getTime() + termsDays * DAY);
  const dueDate = iso(due);

  const steps = REMINDER_STEPS
    // On receipt (Net 0) a "3 days before" step would precede the invoice.
    .filter(step => due.getTime() + step.offset * DAY >= invoice.getTime())
    .map(step => {
      const date = iso(new Date(due.getTime() + step.offset * DAY));
      const daysFromDue = Math.max(0, step.offset);
      const ref = invoiceNumber ? ` ${invoiceNumber}` : '';
      return {
        id: step.id,
        label: step.label,
        date,
        daysFromDue: step.offset,
        subject: step.offset < 0 || step.offset === 0
          ? `Invoice${ref} due ${dueDate}`
          : `Invoice${ref} — ${step.offset} days past due`,
        body: body(step, { invoiceNumber, amount, dueDate, daysFromDue }),
      };
    });
  return { dueDate, steps };
}

function icsEscape(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// RFC 5545 content lines are folded at 75 octets; continuation lines start
// with a single space. Folding on characters is safe here because the text is
// escaped first and a fold never lands inside a UTF-8 sequence for ASCII, and
// for non-ASCII we fold on code points conservatively at 70.
function fold(line) {
  const chars = Array.from(line);
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of chars) {
    const n = new TextEncoder().encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/** All-day events, one per reminder step. `now` is injectable for tests. */
export function reminderIcs(schedule, { invoiceNumber = '', now = new Date() } = {}) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const ref = String(invoiceNumber || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 40);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//invoice-payment-terms-calculator//reminders//EN', 'CALSCALE:GREGORIAN'];
  schedule.steps.forEach(step => {
    const start = step.date.replace(/-/g, '');
    const end = iso(new Date(new Date(`${step.date}T00:00:00Z`).getTime() + DAY)).replace(/-/g, '');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${step.id}-${schedule.dueDate}-${start}${ref ? `-${ref.replace(/[^A-Za-z0-9]/g, '')}` : ''}@invoice-payment-terms-calculator`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${icsEscape(`${step.label}${ref ? ` — ${ref}` : ''}`)}`,
      `DESCRIPTION:${icsEscape(`${step.subject}\n\n${step.body}`)}`,
      'END:VEVENT',
    );
  });
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
