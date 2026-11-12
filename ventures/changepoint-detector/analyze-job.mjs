// One analysis request from the page, as plain data, so the same call runs in a
// Web Worker (analyze-worker.mjs) or on the main thread when workers are missing.
// job = { kind: 'one', opts }              -> analyze(opts)
//     | { kind: 'multi', csv, columns, opts } -> parseColumns + analyzeMulti
//     | { kind: 'drift', opts }            -> driftResult(opts) (jumps on a wandering level)
//     | { kind: 'watch', csv, column, opts } -> parseSeries + replayWatch (what a daily watch would have sent)
// Returns { result } or { error } (an error message for the page to show), never throws.
import { analyze, parseSeries } from './engine.mjs';
import { parseColumns, analyzeMulti } from './multivariate.mjs';
import { driftResult } from './drift-cli.mjs';
import { replayWatch } from './watch.mjs';

export const MULTI_NEEDS_TWO = 'Several-columns mode needs two or more numeric columns; for one column pick “One column”.';

export function analyzeJob(job) {
  try {
    if (job.kind === 'multi') {
      const p = parseColumns(job.csv, job.columns && job.columns.length ? job.columns : null, null);
      if (p.cols.length < 2) throw new Error(MULTI_NEEDS_TWO);
      return { result: { p, r: analyzeMulti({ ...p, ...job.opts }) } };
    }
    if (job.kind === 'drift') return { result: driftResult(job.opts) };
    if (job.kind === 'watch') {
      const { labels, values, column } = parseSeries(job.csv, job.column ?? null, null);
      return { result: { column, ...replayWatch(values, labels, job.opts) } };
    }
    return { result: analyze(job.opts) };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
}
