// Parses a pasted incident log (one event per line, each starting with a
// timestamp) into a timeline, the standard response metrics, and a
// postmortem draft. Pure functions, no I/O, no network.

export const PHASES = ['start', 'detected', 'acknowledged', 'mitigated', 'resolved'];

// Order matters: later phases win, so "resolved after rollback" is resolved.
const RULES = [
  ['resolved', /\b(resolved|recovered|all[- ]clear|incident closed|closed the incident|back to normal|fully restored)\b/i],
  ['mitigated', /\b(mitigat\w*|rollback|rolled back|reverted|failed over|failover|workaround|hotfix|disabled the flag|restored service)\b/i],
  ['acknowledged', /\b(ack(?:nowledged|ed)?|investigating|looking into|on it|incident commander|ic assigned|war ?room)\b/i],
  ['detected', /\b(alert\w*|paged|pagerduty|detected|customer report\w*|reported by|noticed|monitor fired|ticket opened)\b/i],
  ['start', /\b(deployed|deploy started|rolled out|impact began|began|started|caused by|config change|migration ran|outage began)\b/i],
];

const TS = /^\s*(?:\[)?(?:(\d{4}-\d{2}-\d{2})[T ])?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(Z|UTC|[+-]\d{2}:?\d{2})?\]?\s*[-–—:|]?\s*(.*)$/;

function explicitTag(text) {
  const m = text.match(/^(start|detected|acknowledged|ack|mitigated|resolved)\s*[:\]-]\s*/i);
  if (!m) return { phase: null, text };
  const p = m[1].toLowerCase();
  return { phase: p === 'ack' ? 'acknowledged' : p, text: text.slice(m[0].length) };
}

export function inferPhase(text) {
  for (const [phase, re] of RULES) if (re.test(text)) return phase;
  return null;
}

export function parseLog(raw) {
  const events = [];
  const problems = [];
  let day = 0;
  let baseDate = null;
  let prevMs = null;
  const lines = String(raw || '').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const m = line.match(TS);
    if (!m || m[2] === undefined) { problems.push({ line: i + 1, reason: 'no timestamp', text: line.trim() }); return; }
    const [, date, hh, mm, ss, tz, rest] = m;
    const h = Number(hh), mi = Number(mm), s = Number(ss || 0);
    if (h > 23 || mi > 59 || s > 59) { problems.push({ line: i + 1, reason: 'invalid time', text: line.trim() }); return; }
    if (date) { baseDate = date; day = 0; }
    const zone = !tz ? 'Z' : /^(Z|UTC)$/.test(tz) ? 'Z' : tz.length === 5 ? `${tz.slice(0, 3)}:${tz.slice(3)}` : tz;
    const dateStr = baseDate || '2000-01-01';
    const mk = (d) => Date.parse(`${dateStr}T${String(h).padStart(2, '0')}:${mm}:${String(s).padStart(2, '0')}${zone}`) + d * 86400000;
    let ms = mk(day);
    // A time-only line earlier than the one before it means we crossed midnight.
    if (!date && prevMs !== null && ms < prevMs) { day += 1; ms = mk(day); }
    if (Number.isNaN(ms)) { problems.push({ line: i + 1, reason: 'invalid time', text: line.trim() }); return; }
    prevMs = ms;
    const { phase: tagged, text } = explicitTag(rest.trim());
    events.push({ line: i + 1, ms, text, phase: tagged || inferPhase(text), tagged: Boolean(tagged) });
  });
  events.sort((a, b) => a.ms - b.ms || a.line - b.line);
  return { events, problems };
}

const first = (events, phase) => events.find((e) => e.phase === phase) || null;

export function analyze(raw, opts = {}) {
  const { events, problems } = parseLog(raw);
  if (events.length < 2) return { error: 'Need at least two timestamped lines', problems };
  const marks = {};
  for (const p of PHASES) marks[p] = first(events, p);
  // Without an explicit start the first line is the best available estimate.
  const startEvent = marks.start || events[0];
  const startEstimated = !marks.start;
  const end = marks.resolved || null;
  const delta = (a, b) => (a && b && b.ms >= a.ms ? Math.round((b.ms - a.ms) / 1000) : null);
  const metrics = {
    ttd: delta(startEvent, marks.detected),
    tta: delta(marks.detected || startEvent, marks.acknowledged),
    ttm: delta(startEvent, marks.mitigated),
    ttr: delta(startEvent, end),
    total: delta(events[0], events[events.length - 1]),
  };
  // Silent stretches where nothing was logged are where a timeline is
  // usually hiding a question for the review.
  const gaps = [];
  for (let i = 1; i < events.length; i++) {
    const g = Math.round((events[i].ms - events[i - 1].ms) / 1000);
    if (g >= (opts.gapSeconds ?? 900)) gaps.push({ seconds: g, from: events[i - 1], to: events[i] });
  }
  gaps.sort((a, b) => b.seconds - a.seconds);
  const missing = PHASES.filter((p) => p !== 'start' && !marks[p]);
  return { events, problems, marks, startEvent, startEstimated, metrics, gaps, missing };
}

export function fmtDuration(sec) {
  if (sec === null || sec === undefined) return 'n/a';
  if (sec < 60) return `${sec}s`;
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s && !h) parts.push(`${s}s`);
  return parts.join(' ');
}

const clock = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ') + 'Z';

export function summaryLine(r) {
  const m = r.metrics;
  return `Detect ${fmtDuration(m.ttd)} · Acknowledge ${fmtDuration(m.tta)} · Mitigate ${fmtDuration(m.ttm)} · Resolve ${fmtDuration(m.ttr)}`;
}

export function toMarkdown(r, title = 'Incident') {
  const m = r.metrics;
  const out = [];
  out.push(`# Postmortem: ${title}`, '', '_Draft generated from the pasted timeline. Fill in the blank sections; blameless wording only._', '');
  out.push('## Summary', '', '- **Impact:** _who was affected and how_', `- **Duration (start to resolution):** ${fmtDuration(m.ttr)}`, '- **Severity:** _SEV?_', '');
  out.push('## Response metrics', '', '| Metric | Value |', '| --- | --- |');
  out.push(`| Time to detect | ${fmtDuration(m.ttd)} |`, `| Time to acknowledge | ${fmtDuration(m.tta)} |`, `| Time to mitigate | ${fmtDuration(m.ttm)} |`, `| Time to resolve | ${fmtDuration(m.ttr)} |`, '');
  if (r.startEstimated) out.push('> Start was not marked, so the first log line was used as the start. Detect and resolve times are measured from it.', '');
  out.push('## Timeline', '', '| Time (UTC) | Phase | Event |', '| --- | --- | --- |');
  for (const e of r.events) out.push(`| ${clock(e.ms)} | ${e.phase || ''} | ${e.text.replace(/\|/g, '\\|')} |`);
  out.push('');
  if (r.gaps.length) {
    out.push('## Questions the timeline raises', '');
    for (const g of r.gaps.slice(0, 5)) out.push(`- ${fmtDuration(g.seconds)} with nothing logged between "${g.from.text}" and "${g.to.text}". What was happening?`);
    out.push('');
  }
  if (r.missing.length) {
    out.push('## Gaps in the record', '');
    for (const p of r.missing) out.push(`- No ${p} event was found. Add a line or tag one with \`${p}:\`.`);
    out.push('');
  }
  out.push('## Root cause', '', '_Why did this happen? Ask why five times; stop at a system, not a person._', '', '## What went well', '', '-', '', '## What went poorly', '', '-', '', '## Action items', '', '| Action | Owner | Due |', '| --- | --- | --- |', '| | | |', '');
  return out.join('\n');
}
