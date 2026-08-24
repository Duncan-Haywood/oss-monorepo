export function buildReport(input, date = new Date().toISOString().slice(0, 10)) {
  if (!input || typeof input !== 'object') throw new Error('Paste a valid axe-core JSON object.');
  const violations = Array.isArray(input.violations) ? input.violations : [];
  const passes = Array.isArray(input.passes) ? input.passes : [];
  const incomplete = Array.isArray(input.incomplete) ? input.incomplete : [];
  const simplify = (item, fallback) => ({
    id: String(item.id || 'unknown-rule'),
    impact: String(item.impact || 'unknown'),
    help: String(item.help || fallback),
    helpUrl: typeof item.helpUrl === 'string' ? item.helpUrl : '',
    nodes: Array.isArray(item.nodes) ? item.nodes.length : 0,
  });
  const items = violations.map((item) => simplify(item, 'Review this violation manually.'));
  const reviewItems = incomplete.map((item) => simplify(item, 'Review this result manually.'));
  return {
    date,
    url: typeof input.url === 'string' ? input.url : 'Not supplied',
    tool: typeof input.testEngine?.name === 'string' ? input.testEngine.name : 'axe-core',
    counts: { violations: items.length, nodes: items.reduce((sum, item) => sum + item.nodes, 0), passes: passes.length, incomplete: incomplete.length },
    items,
    reviewItems,
  };
}

export function reportAsText(report) {
  const lines = [`Accessibility evidence record`, `Checked: ${report.date}`, `URL: ${report.url}`, `Engine: ${report.tool}`, '', `Violations: ${report.counts.violations} rules / ${report.counts.nodes} nodes`, `Passes: ${report.counts.passes} rules`, `Needs review: ${report.counts.incomplete} rules`, ''];
  if (!report.items.length) lines.push('No violations were present in this supplied result. Manual review is still required.');
  for (const item of report.items) lines.push(`- [${item.impact}] ${item.id}: ${item.help} (${item.nodes} node${item.nodes === 1 ? '' : 's'})${item.helpUrl ? ` ${item.helpUrl}` : ''}`);
  if (report.reviewItems.length) {
    lines.push('', 'Items needing manual review:');
    for (const item of report.reviewItems) lines.push(`- [${item.impact}] ${item.id}: ${item.help} (${item.nodes} node${item.nodes === 1 ? '' : 's'})${item.helpUrl ? ` ${item.helpUrl}` : ''}`);
  }
  lines.push('', 'This is a record of the supplied automated test, not a compliance determination.');
  return lines.join('\n');
}
