// Does --spikes single out a documented shock? Hurricane Sandy closed Washington DC's Capital Bikeshare system on
// 2012-10-29 (recalled, source unread). Run the mean model with a weekly period on both rider types and rank every
// label by its excursion in noise sd.   usage: node eval/sandy-spikes.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/bike-sharing-daily.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]);
const sandy = labels.indexOf('2012-10-29');
for (const [name, col] of [['registered', 2], ['casual', 1]]) {
  const r = analyze({ values: rows.map((x) => +x[col]), labels, model: 'mean', period: 7, spikes: true });
  const s = [...r.spikes].sort((a, b) => Math.abs(b.excursionInNoiseSd) - Math.abs(a.excursionInNoiseSd));
  const rank = s.findIndex((x) => x.startIndex <= sandy && x.endIndex >= sandy) + 1;
  const sd = (x) => Math.abs(x.excursionInNoiseSd);
  console.log(`${name}: ${r.spikes.length} labels in ${labels.length} days; Sandy label rank ${rank || 'none'}${rank ? ` at ${sd(s[rank - 1]).toFixed(1)} sd` : ''}; next largest ${s.find((_, i) => i !== rank - 1) ? sd(s.find((_, i) => i !== rank - 1)).toFixed(1) : '-'} sd; labels over 3, 5, 7 sd: ${[3, 5, 7].map((t) => s.filter((x) => sd(x) >= t).length).join(', ')}`);
}
