// Sweep of all 30 Ansett route/class weekly series (tsibbledata::ansett, via Rdatasets; data/ansett-all.csv) for the
// 1989 pilots' dispute. Question (README Next): is any closure series quiet outside the closure, so range95 can be
// scored against a clean series? Per series: changes returned, changes outside the closure (+-3 weeks), whether a
// range95 holds the first zero-ish week. usage: node eval/ansett-sweep.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/ansett-all.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const groups = new Map();
for (const [, week, route, cls, pax] of rows) {
  const k = `${route} ${cls}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push([week, +pax]);
}
const median = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
console.log('series | n | closure weeks (<25% of prior median) | model | changes | outside closure +-3 | range95 holds stop');
for (const [k, pts] of [...groups].sort()) {
  const labels = pts.map((p) => p[0]), v = pts.map((p) => p[1]);
  const i0 = labels.indexOf('1989 W30');
  const prior = v.slice(Math.max(0, i0 - 26), i0 + 3);
  const base = median(prior.length ? prior : v);
  const closed = [];
  v.forEach((x, i) => { if (labels[i] >= '1989 W33' && labels[i] <= '1989 W45' && x < 0.25 * base) closed.push(i); });
  const stop = closed[0];
  for (const [name, opt] of [['mean', { model: 'mean' }], ['nb', { model: 'poisson', overdispersion: 'nb' }]]) {
    let r;
    try { r = analyze({ values: v, labels, ...opt }); } catch (e) { console.log(`${k} | ${v.length} | err ${e.message}`); continue; }
    const cps = r.pelt.changepoints;
    const idx = cps.map((c) => labels.indexOf(c.label));
    const lo = closed.length ? closed[0] - 3 : -9, hi = closed.length ? closed[closed.length - 1] + 3 : -9;
    const outside = idx.filter((i) => i < lo || i > hi).length;
    const holds = stop !== undefined && cps.some((c) => c.range95 && c.range95.fromIndex <= stop && stop <= c.range95.toIndex);
    console.log(`${k} | ${v.length} | ${closed.length ? `${closed.length} (${labels[stop]})` : 'none'} | ${name} | ${cps.length} | ${outside} | ${stop === undefined ? '-' : holds}`);
  }
}
