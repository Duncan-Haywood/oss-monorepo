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

/**
 * Combine several saved daily-log bundles (each the `{ record, findings }`
 * shape `makeRecord` returns) into one dated evidence pack spanning multiple
 * days, so a project's history can be handed over as a single record instead
 * of one JSON file per day.
 *
 * Pure and order-independent: entries are sorted by date before packing, so
 * it does not matter what order they were saved in or downloaded from.
 */
export function buildEvidencePack(entries, generatedAt = new Date().toISOString()) {
  const sorted = [...entries].sort((a, b) => {
    const da = a.record.log.date || '';
    const db = b.record.log.date || '';
    if (da !== db) return da < db ? -1 : 1;
    return (a.savedAt || '') < (b.savedAt || '') ? -1 : 1;
  });
  const dates = sorted.map((e) => e.record.log.date).filter(Boolean);
  const projects = [...new Set(sorted.map((e) => e.record.log.project).filter(Boolean))];
  const reviewNotes = sorted.flatMap((e) =>
    (e.findings || []).map((f) => `${e.record.log.date || '(no date)'}: ${f}`)
  );
  const changeCount = sorted.filter((e) => e.record.change).length;
  return {
    schema: 'construction-evidence-log/pack/v1',
    generatedAt,
    entryCount: sorted.length,
    projects,
    dateRange: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
    changeOrDelayEntryCount: changeCount,
    reviewNotes,
    entries: sorted.map((e) => e.record),
  };
}

// One row per saved daily-log entry, every field the page collects and
// computes -- not just what the history list shows on screen. A CSV opened
// in a spreadsheet is how this evidence gets sorted, filtered, or handed to
// someone who was not there, and grant-reporting-tracker's toCsv already
// establishes the rule this file follows: a field the page keeps quietly
// missing from the export is a defect, not a smaller CSV. `findings` is
// joined rather than dropped, because "no crew listed" is itself part of
// the evidence a reviewer needs to see per day, not just in the moment the
// entry was created.
export function entriesToCsv(entries) {
  const fields = [
    'date', 'project', 'crew', 'conditions', 'work',
    'changeType', 'requestedBy', 'impact', 'changeDetails',
    'findings', 'savedAt',
  ];
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = entries.map((e) => {
    const log = e.record?.log || {};
    const change = e.record?.change || {};
    return {
      date: log.date,
      project: log.project,
      crew: log.crew,
      conditions: log.conditions,
      work: log.work,
      changeType: change.type || 'none',
      requestedBy: change.requestedBy,
      impact: change.impact,
      changeDetails: change.details,
      findings: (e.findings || []).join(' | '),
      savedAt: e.savedAt,
    };
  });
  return [fields.join(','), ...rows.map((row) => fields.map((f) => quote(row[f])).join(','))].join('\n');
}

export function packSummary(pack) {
  const range = pack.dateRange ? `${pack.dateRange.from} to ${pack.dateRange.to}` : 'no dated entries';
  const projectLine = pack.projects.length ? pack.projects.join(', ') : '(no project named)';
  return [
    `${pack.entryCount} ${pack.entryCount === 1 ? 'day' : 'days'} logged (${range})`,
    `Project(s): ${projectLine}`,
    `${pack.changeOrDelayEntryCount} of ${pack.entryCount} days include a change or delay`,
    pack.reviewNotes.length
      ? `${pack.reviewNotes.length} review notes across the pack`
      : 'No missing-field observations across the pack.',
  ].join('\n');
}
