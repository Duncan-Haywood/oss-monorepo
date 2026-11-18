// Does --spikes work on the log scale, where a closure is a fraction of normal ridership, not a count of riders?
// Same data and question as eval/sandy-spikes.mjs, with log: true. Sandy closed Capital Bikeshare on 2012-10-29
// (recalled, source unread).   usage: node eval/sandy-spikes-log.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/bike-sharing-daily.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]);
const sandy = labels.indexOf('2012-10-29');
for (const [name, col] of [['registered', 2], ['casual', 1]]) {
  const r = analyze({ values: rows.map((x) => +x[col]), labels, model: 'mean', period: 7, log: true, spikes: true });
  const sd = (x) => Math.abs(x.excursionInNoiseSd);
  const s = [...r.spikes].sort((a, b) => sd(b) - sd(a));
  const rank = s.findIndex((x) => x.startIndex <= sandy && x.endIndex >= sandy) + 1;
  const other = s.find((_, i) => i !== rank - 1);
  console.log(`${name} (log): ${r.pelt.changepoints.length} changes, ${r.spikes.length} labels in ${labels.length} days; Sandy label rank ${rank || 'none'}${rank ? ` at ${sd(s[rank - 1]).toFixed(1)} sd, ratio ${Math.exp(s[rank - 1].excursion).toFixed(2)}` : ''}; next largest ${other ? sd(other).toFixed(1) : '-'} sd; labels over 3, 5, 7 sd: ${[3, 5, 7].map((t) => s.filter((x) => sd(x) >= t).length).join(', ')}`);
}
