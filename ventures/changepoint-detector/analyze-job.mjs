// One analysis request from the page, as plain data, so the same call runs in a
// Web Worker (analyze-worker.mjs) or on the main thread when workers are missing.
// job = { kind: 'one', opts, synth? }      -> analyze(opts); with synth (synth-cli.mjs synthResult's options) also a
//                                            synthetic control, as result.synth or, if it fails, result.synthError
//     | { kind: 'multi', csv, columns, opts } -> parseColumns + analyzeMulti
//     | { kind: 'drift', opts }            -> driftResult(opts) (jumps on a wandering level)
//     | { kind: 'replay', csv, column, opts } -> parseSeries + replayWatch (what a daily watch would have sent)
//     | { kind: 'eagerness', csv, column, opts } -> parseSeries + eagernessReplay (each "How eager" setting on the history)
// Returns { result } or { error } (an error message for the page to show), never throws.
import { analyze, parseSeries } from './engine.mjs';
import { parseColumns, analyzeMulti } from './multivariate.mjs';
import { driftResult } from './drift-cli.mjs';
import { replayWatch, eagernessReplay, dropShutWeekdays } from './watch-core.mjs';

// The watch CLI's `--shut-days auto` default (README "A shop shut one weekday"): a level model leaves out a weekday that
// is 0 in each of its last 8 weeks, and a period of 7 becomes 7 minus the days left out. opts.shutDays 'keep' skips it.
export function shutPrep(values, labels, opts = {}) {
  const { shutDays, ...rest } = opts;
  if (shutDays === 'keep' || rest.model === 'poisson') return { values, labels, opts: rest, shutDays: null };
  const d = dropShutWeekdays(values, labels);
  if (!d.dropped.length) return { values, labels, opts: rest, shutDays: null };
  const period = Number(rest.period) === 7 ? 7 - d.dropped.length : rest.period;
  return { values: d.values, labels: d.labels, opts: { ...rest, ...(period !== undefined ? { period } : {}) }, shutDays: { left: d.dropped, rows: labels.length - d.labels.length, ...(period !== rest.period ? { period } : {}) } };
}
import { synthResult } from './synth-cli.mjs';

export const MULTI_NEEDS_TWO = 'Several-columns mode needs two or more numeric columns; for one column pick “One column”.';

export function analyzeJob(job) {
  try {
    if (job.kind === 'multi') {
      const p = parseColumns(job.csv, job.columns && job.columns.length ? job.columns : null, null);
      if (p.cols.length < 2) throw new Error(MULTI_NEEDS_TWO);
      return { result: { p, r: analyzeMulti({ ...p, ...job.opts }) } };
    }
    if (job.kind === 'drift') return { result: driftResult(job.opts) };
    if (job.kind === 'replay') {
      const p = parseSeries(job.csv, job.column ?? null, null), s = shutPrep(p.values, p.labels, job.opts);
      return { result: { column: p.column, ...replayWatch(s.values, s.labels, s.opts), ...(s.shutDays ? { shutDays: s.shutDays } : {}) } };
    }
    if (job.kind === 'eagerness') {
      const p = parseSeries(job.csv, job.column ?? null, null), s = shutPrep(p.values, p.labels, job.opts);
      return { result: { column: p.column, ...eagernessReplay(s.values, s.labels, s.opts), ...(s.shutDays ? { shutDays: s.shutDays } : {}) } };
    }
    const result = analyze(job.opts);
    if (job.synth) {
      // The page's donor and covariate boxes: an error here leaves the one-column result standing.
      try { result.synth = synthResult(job.synth); } catch (e) { result.synthError = String((e && e.message) || e); }
    }
    return { result };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
}
