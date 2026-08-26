export function assessBid(items, dueDate, today = new Date()) {
  const due = dueDate ? new Date(`${dueDate}T23:59:59`) : null;
  const daysRemaining = due ? Math.ceil((due - today) / 86400000) : null;
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

export function markdownReport(result, opportunity, dueDate) {
  const lines = [`# Bid readiness: ${opportunity || 'Untitled opportunity'}`, '', `Due date: ${dueDate || 'Not set'}`, `Result: ${result.ready ? 'All listed items ready' : `${result.missing.length} item(s) need attention`}`, ''];
  for (const row of result.rows) lines.push(`- [${row.status === 'ready' ? 'x' : ' '}] **${row.name}** (${row.status})${row.owner ? ` | owner: ${row.owner}` : ''}${row.note ? ` | ${row.note}` : ''}`);
  lines.push('', 'This is a private working record, not a determination that a bid is complete or compliant. Review the solicitation and confirm requirements with the issuing authority.');
  return lines.join('\n');
}
