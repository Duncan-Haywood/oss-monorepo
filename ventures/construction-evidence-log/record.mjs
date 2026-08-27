export function makeRecord(input, createdAt = new Date().toISOString()) {
  const type = String(input.changeType || 'none').trim();
  const record = {
    schema: 'construction-evidence-log/v1',
    createdAt,
    log: {
      date: String(input.date || '').trim(),
      project: String(input.project || '').trim(),
      crew: String(input.crew || '').trim(),
      conditions: String(input.conditions || '').trim(),
      work: String(input.work || '').trim(),
    },
    change: type === 'none'
      ? null
      : {
        type,
        requestedBy: String(input.requestedBy || '').trim(),
        impact: String(input.impact || '').trim(),
        details: String(input.changeDetails || '').trim(),
      },
  };
  const findings = [];
  if (!record.log.crew) findings.push('People on site was left blank. Add it if labor attribution matters.');
  if (!record.log.conditions) findings.push('Site conditions were not recorded. Add weather, access, or other observable conditions.');
  if (record.change && !record.change.requestedBy) findings.push('The change or delay has no requester/observer named.');
  if (record.change && !record.change.details) findings.push('The change or delay has no description. Record the request, cause, and response.');
  return { record, findings };
}

export function summary(bundle) {
  const changeLine = bundle.record.change
    ? `Change/delay: ${bundle.record.change.details || '(not described)'}`
    : 'No change or delay recorded.';
  return `${bundle.record.log.date} | ${bundle.record.log.project}\nWork: ${bundle.record.log.work}\n${changeLine}`;
}
