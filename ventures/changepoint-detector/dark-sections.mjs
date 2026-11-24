// A section gone dark: a page-view column (ga4-metrics.mjs --sections writes one per section of the site) whose last
// `days` days average under `frac` of its mean over the `base` days before them, from a level of at least `minLevel`
// a day. A tag lost from one page template takes that section to zero while every total moves only by its share,
// which the watch's change detectors hear on a small section about 1 time in 7 at best; a rise (a post that takes
// off) never trips this check. README "A template-shaped tracking loss" (round 2, pre-registered).
//
// Statistical check on data you supply, not advice. MIT licence.

export const DARK_DEFAULTS = { days: 3, frac: 0.1, base: 28, minLevel: 20 };

/**
 * Dark runs in one column of daily values (oldest first, one per day): [{ start, end }] as indexes, where `start` is
 * the first day of the dark stretch and `end` its last (the series' end if it is still dark). A stretch is found once,
 * on the day it has lasted `days` days.
 */
export function darkRuns(values, opts = {}) {
  const { days, frac, base, minLevel } = { ...DARK_DEFAULTS, ...opts };
  const out = [];
  let open = null;
  for (let t = base + days - 1; t < values.length; t++) {
    let recent = 0, before = 0;
    for (let k = t - days + 1; k <= t; k++) recent += values[k];
    for (let k = t - days - base + 1; k <= t - days; k++) before += values[k];
    recent /= days; before /= base;
    if (open) {
      if (values[t] >= frac * open.level) { out.push({ start: open.start, end: t - 1 }); open = null; }
      continue;
    }
    if (before >= minLevel && recent < frac * before) open = { start: t - days + 1, level: before };
  }
  if (open) out.push({ start: open.start, end: values.length - 1 });
  return out;
}

/** Dark stretches per column of rows [{ date, values }]: [{ column, start, end, level }] with dates. */
export function darkSections(rows, columns, opts = {}) {
  const found = [];
  for (const c of columns) {
    const v = rows.map((r) => Number(r.values[c]) || 0);
    for (const r of darkRuns(v, opts)) found.push({ column: c, start: rows[r.start].date, end: rows[r.end].date, stillDark: r.end === rows.length - 1 });
  }
  return found;
}
