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
  // Both sides collapsed to local midnight before dividing, so a 23- or
  // 25-hour day across a daylight-saving change cannot shift the answer.
  const start = new Date(today).setHours(0, 0, 0, 0);
  return Math.round((due - start) / 86400000);
}

export function assessBid(items, dueDate, today = new Date()) {
  const daysRemaining = daysUntilDue(dueDate, today);
  const rows = items.map((item) => ({
    name: item.name.trim(),
    owner: item.owner.trim(),
    status: item.status,
    note: item.note.trim(),
  }));
  const missing = rows.filter((row) => row.status !== 'ready');
  const blocked = rows.filter((row) => row.status === 'blocked');
  return {
    rows,
    missing,
    blocked,
    ready: rows.length > 0 && missing.length === 0,
    daysRemaining,
    urgency: daysRemaining !== null && daysRemaining < 0 ? 'past-due' : daysRemaining !== null && daysRemaining <= 2 ? 'urgent' : 'normal',
  };
}

/**
 * How the deadline is worded to the user. Zero is the case worth spelling out:
 * "0 day(s) remain" is technically what the count says and reads as though
 * there is no deadline pressure at all, on the one day there is most.
 */
export function deadlineSentence(daysRemaining) {
  if (daysRemaining === null) return 'Add a deadline for urgency context.';
  if (daysRemaining < 0) {
    const days = Math.abs(daysRemaining);
    return `The deadline passed ${days} day${days === 1 ? '' : 's'} ago.`;
  }
  if (daysRemaining === 0) return 'The deadline is today.';
  return `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remain${daysRemaining === 1 ? 's' : ''}.`;
}

export function markdownReport(result, opportunity, dueDate) {
  const lines = [`# Bid readiness: ${opportunity || 'Untitled opportunity'}`, '', `Due date: ${dueDate || 'Not set'}`, `Result: ${result.ready ? 'All listed items ready' : `${result.missing.length} item(s) need attention`}`, ''];
  for (const row of result.rows) lines.push(`- [${row.status === 'ready' ? 'x' : ' '}] **${row.name}** (${row.status})${row.owner ? ` | owner: ${row.owner}` : ''}${row.note ? ` | ${row.note}` : ''}`);
  lines.push('', 'This is a private working record, not a determination that a bid is complete or compliant. Review the solicitation and confirm requirements with the issuing authority.');
  return lines.join('\n');
}
