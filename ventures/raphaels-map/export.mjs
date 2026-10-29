// @ts-check
// Markdown and CSV reports of compared areas. Pure. Every row keeps its
// metric definition, universe, source citation, vintage and flags, so a
// spreadsheet copied out of context still says what each number is.
import { CLASS_LABELS, FLAG_LABELS, isNum } from './format.mjs';

/**
 * One CSV cell. Quotes when needed, doubles quotes, and defuses text that a
 * spreadsheet would run as a formula (= + - @ at the start of a string).
 * Numbers are written as numbers; null is an empty cell, never 0.
 * @param {any} v
 */
export function csvCell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let s = Array.isArray(v) ? v.join('; ') : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** @param {any[][]} rows */
export function toCSV(rows) {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export const CSV_COLUMNS = [
  'geo_id', 'geo_name', 'geo_kind', 'metric_id', 'metric_label', 'estimate', 'moe_90', 'unit', 'universe', 'class',
  'flags', 'definition', 'method', 'source_id', 'source_title', 'reference_period', 'dataset_version', 'source_url', 'citation', 'vintage',
];

/**
 * @typedef {{id: string, name: string, kind?: string, observations: Record<string, {e: number|null, moe?: number|null, flags?: string[]}>}} Area
 * @typedef {{areas: Area[], metricIds: string[], metricsById: Map<string, any>, sourcesById: Map<string, any>, vintage?: string, title?: string, generatedAt?: string, notes?: string[]}} ReportInput
 */

/** Long-format rows: one line per area × metric. @param {ReportInput} r */
export function reportRows(r) {
  const out = [];
  for (const a of r.areas) {
    for (const mid of r.metricIds) {
      const m = r.metricsById.get(mid) || {};
      const s = r.sourcesById.get(m.source_id) || {};
      const o = (a.observations && a.observations[mid]) || null;
      const flags = o ? [...(o.flags || [])] : ['not_published'];
      out.push({
        geo_id: a.id, geo_name: a.name, geo_kind: a.kind || 'county', metric_id: mid, metric_label: m.label || mid,
        estimate: o && isNum(o.e) ? o.e : null, moe_90: o && isNum(o.moe) ? o.moe : null, unit: m.unit || '',
        universe: m.universe || '', class: m.class || '', flags, definition: m.definition || '', method: m.method || '',
        source_id: m.source_id || '', source_title: s.title || '', reference_period: s.reference_period || '',
        dataset_version: s.dataset_version || '', source_url: s.landing_url || '', citation: s.citation || '', vintage: r.vintage || '',
      });
    }
  }
  return out;
}

/** @param {ReportInput} r */
export function toReportCSV(r) {
  const rows = reportRows(r);
  return toCSV([CSV_COLUMNS, ...rows.map((row) => CSV_COLUMNS.map((c) => row[c]))]);
}

/** Escape a Markdown table cell. */
export function mdCell(v) {
  return String(v ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

const fmtValue = (row) => {
  if (row.estimate === null) return 'Not available';
  const e = row.estimate.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return row.moe_90 !== null ? `${e} ± ${row.moe_90.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : e;
};

/** @param {ReportInput} r */
export function toReportMarkdown(r) {
  const rows = reportRows(r);
  const lines = [];
  lines.push(`# ${r.title || "Raphael's Map research report"}`, '');
  if (r.generatedAt) lines.push(`Generated ${r.generatedAt} in the browser from published aggregates.`, '');
  lines.push(`**Data vintage:** ${r.vintage || 'not stated'}`, '');
  lines.push('Exploratory research priorities from public aggregates. No figure here describes any individual. Margins of error are 90% (American Community Survey convention). "Not available" means no value was published or imported; it is never zero.', '');
  if (r.notes && r.notes.length) {
    lines.push('## Warnings', '');
    for (const n of r.notes) lines.push(`- ${n}`);
    lines.push('');
  }
  lines.push('## Values', '');
  lines.push(`| Area | ${r.metricIds.map((m) => mdCell((r.metricsById.get(m) || {}).label || m)).join(' | ')} |`);
  lines.push(`|---|${r.metricIds.map(() => '---:').join('|')}|`);
  for (const a of r.areas) {
    const cells = r.metricIds.map((m) => {
      const row = rows.find((x) => x.geo_id === a.id && x.metric_id === m);
      const fl = row && row.flags.length ? ` (${row.flags.map((f) => FLAG_LABELS[f] || f).join(', ')})` : '';
      return mdCell(row ? fmtValue(row) + fl : 'Not available');
    });
    lines.push(`| ${mdCell(a.name)} (${mdCell(a.id)}) | ${cells.join(' | ')} |`);
  }
  lines.push('', '## Definitions', '');
  for (const mid of r.metricIds) {
    const m = r.metricsById.get(mid) || {};
    lines.push(`### ${m.label || mid} (\`${mid}\`)`, '');
    lines.push(`- **Class:** ${CLASS_LABELS[m.class] || m.class || 'unknown'}`);
    lines.push(`- **Universe:** ${m.universe || 'not stated'}`);
    lines.push(`- **Unit:** ${m.unit || 'not stated'}`);
    lines.push(`- **Definition:** ${m.definition || 'not stated'}`);
    if (m.method) lines.push(`- **Method:** ${m.method}`);
    if (m.source_variable_ids && m.source_variable_ids.length) lines.push(`- **Source variables:** ${m.source_variable_ids.join(', ')}`);
    if (m.caveats) lines.push(`- **Caveats:** ${m.caveats}`);
    lines.push('');
  }
  const used = [...new Set(r.metricIds.map((m) => (r.metricsById.get(m) || {}).source_id).filter(Boolean))];
  lines.push('## Sources', '');
  for (const sid of used) {
    const s = r.sourcesById.get(sid);
    if (!s) { lines.push(`- \`${sid}\`: not in the source register.`); continue; }
    lines.push(`- **${s.title}** (${s.provider || 'provider not stated'}), version ${s.dataset_version || 'not stated'}, reference period ${s.reference_period || 'not stated'}, status ${s.status || 'unknown'}, retrieved ${s.retrieved_at || 'not stated'}. ${s.citation || ''} ${s.landing_url || ''}`.trim());
  }
  const allFlags = [...new Set(rows.flatMap((x) => x.flags))];
  if (allFlags.length) {
    lines.push('', '## Flags used', '');
    for (const f of allFlags) lines.push(`- **${FLAG_LABELS[f] || f}** (\`${f}\`)`);
  }
  lines.push('', 'Not legal, financial, relationship, religious or professional advice. Provided as-is, with no warranty.', '');
  return lines.join('\n');
}

/** Trigger a browser download. No-op outside a browser. */
export function download(filename, text, type = 'text/plain') {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
