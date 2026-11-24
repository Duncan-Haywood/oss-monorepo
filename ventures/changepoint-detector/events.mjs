// Which changes fall inside an event you name (a Google update's rollout, a release, a price change), and how often a
// change of the same width would land in one of your events by chance alone.
//
//   node cli.mjs gsc.csv --column clicks --model poisson --period 7 --events updates.csv
//
// updates.csv, one event per line, oldest or newest first, a header line optional:
//   start,end,label
//   2025-03-13,2025-03-27,March 2025 core update
//   2025-06-30,,a release (no end: one day)
//
// The chance figure is the share of places in this series where a change with the same 95% range width would have
// overlapped one of the event windows. When windows cover much of the series, a change inside one says little: two
// week-long rollouts a quarter cover about 15% of the days. A low chance is not proof the event caused the change
// either; it is the base rate a reader should hold the coincidence against.
//
// Statistical analysis of data you supply, not advice. FSL-1.1-MIT licence.

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const dayNumber = (d) => Date.parse(`${d}T00:00:00Z`) / 86400000;

/** Split one CSV line, honouring double quotes ("a, b" stays one field). */
function fields(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Events from CSV text: `start[,end],label` per line. A second field that is a date is the end (inclusive); an empty
 * one means a one-day event; anything else starts the label. Blank lines, `#` comments and a header line (a first line
 * whose first field is not a date) are skipped. Throws, naming the line, on a start that is not YYYY-MM-DD or an end
 * before its start.
 */
export function parseEvents(text) {
  const events = [];
  const lines = String(text ?? '').split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const f = fields(line);
    if (!ISO.test(f[0])) {
      if (!events.length && i === lines.findIndex((l) => l.trim() && !l.trim().startsWith('#'))) return; // header
      throw new Error(`events line ${i + 1}: the first field must be a date (YYYY-MM-DD), not "${f[0]}".`);
    }
    if (Number.isNaN(dayNumber(f[0]))) throw new Error(`events line ${i + 1}: ${f[0]} is not a calendar date.`);
    let end = f[0], rest = f.slice(1);
    if (rest.length && (ISO.test(rest[0]) || rest[0] === '')) { if (rest[0]) end = rest[0]; rest = rest.slice(1); }
    if (Number.isNaN(dayNumber(end))) throw new Error(`events line ${i + 1}: ${end} is not a calendar date.`);
    if (end < f[0]) throw new Error(`events line ${i + 1}: the end ${end} is before the start ${f[0]}.`);
    events.push({ start: f[0], end, label: rest.join(', ').trim() || `${f[0]}${end !== f[0] ? ` to ${end}` : ''}` });
  });
  if (!events.length) throw new Error('the events file has no events (one per line: start[,end],label).');
  return events;
}

/** The labels as day numbers, or null when any label is not a YYYY-MM-DD date (events need a dated series). */
function labelDays(labels) {
  const d = labels.map((l) => (ISO.test(String(l)) ? dayNumber(String(l)) : NaN));
  return d.every((x) => Number.isFinite(x)) ? d : null;
}

/**
 * For each change: the events whose window, widened by `slack` days on each side, overlaps the change's 95% range (or
 * its own date when it has no range), and the chance a change of the same width would overlap any window if it were
 * placed anywhere in the series. `changes` are PELT changepoints ({ index, label, range95?: { fromIndex, toIndex } }).
 */
export function matchEvents({ labels, changes, events, slack = 0 }) {
  if (!Number.isInteger(slack) || slack < 0) throw new Error('--event-slack takes a whole number of days, 0 or more.');
  const days = labelDays(labels);
  if (!days) throw new Error('--events needs a series dated YYYY-MM-DD in its label column.');
  const windows = events.map((e) => ({ ...e, lo: dayNumber(e.start) - slack, hi: dayNumber(e.end) + slack }));
  const hit = (a, b) => windows.filter((w) => w.lo <= b && w.hi >= a);
  const n = days.length;
  const inSeries = windows.filter((w) => w.hi >= days[0] && w.lo <= days[n - 1]);
  const report = changes.map((c) => {
    const from = c.range95 ? c.range95.fromIndex : c.index;
    const to = c.range95 ? c.range95.toIndex : c.index;
    const width = to - from;
    let places = 0, overlapping = 0;
    for (let p = 0; p + width < n; p++) { places++; if (hit(days[p], days[p + width]).length) overlapping++; }
    const m = hit(days[from], days[to]);
    return {
      label: c.label,
      from: labels[from],
      to: labels[to],
      events: m.map((w) => ({ label: w.label, start: w.start, end: w.end })),
      chance: places ? Number((overlapping / places).toFixed(3)) : null,
    };
  });
  const covered = days.filter((d) => windows.some((w) => w.lo <= d && w.hi >= d)).length;
  return { slack, eventsInSeries: inSeries.length, eventsGiven: events.length, coveredShare: Number((covered / n).toFixed(3)), changes: report, unmatchedEvents: inSeries.filter((w) => !report.some((r) => r.events.some((e) => e.label === w.label && e.start === w.start))).map((w) => ({ label: w.label, start: w.start, end: w.end })) };
}

const pct = (x) => `${Math.round(x * 100)}%`;

/** The text block the CLI prints under the changes. */
export function eventsText(r) {
  const lines = [`Events (${r.eventsInSeries} of ${r.eventsGiven} inside the series${r.slack ? `, windows widened by ${r.slack} day${r.slack === 1 ? '' : 's'} each side` : ''}; their windows cover ${pct(r.coveredShare)} of its days):`];
  if (!r.changes.length) lines.push('  No change to match.');
  for (const c of r.changes) {
    const where = c.from === c.to ? c.from : `${c.from} – ${c.to}`;
    const chance = c.chance == null ? '' : ` A change this wide lands in an event by chance ${pct(c.chance)} of the time.`;
    if (c.events.length) lines.push(`  ${c.label} (${where}): inside ${c.events.map((e) => `${e.label} (${e.start}${e.end !== e.start ? ` to ${e.end}` : ''})`).join('; ')}.${chance}`);
    else lines.push(`  ${c.label} (${where}): no event.${chance}`);
  }
  if (r.unmatchedEvents.length) lines.push(`  Events with no change found in them: ${r.unmatchedEvents.map((e) => `${e.label} (${e.start})`).join('; ')}. No change found is not proof of no effect: a small one may sit under the noise.`);
  lines.push('  (A change inside an event is a coincidence of dates, not proof the event caused it; weigh it against the chance figure.)');
  return lines.join('\n');
}
