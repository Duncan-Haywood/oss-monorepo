// Copies the counter's aggregate daily totals into the repository, so the
// router, the review track and the next session can read them like any other
// committed fact (`portfolio/usage/README.md`, rule 2: "a number nobody wrote
// down does not exist").
//
//   COUNTER_URL=https://counter.example node platform/counter/pull.mjs
//
// Writes `portfolio/usage/site-visits.json`. Merges rather than replaces: a
// day already on file keeps the larger of the two counts for each slug, so a
// counter restored from an older backup can never shrink the record.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REF_KEY } from './counter.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const OUT = path.resolve(HERE, '..', '..', 'portfolio', 'usage', 'site-visits.json');

export function mergeDays(existing = {}, incoming = {}) {
  const out = structuredClone(existing);
  for (const [day, slugs] of Object.entries(incoming)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const d = (out[day] ||= {});
    for (const [slug, n] of Object.entries(slugs || {})) {
      if (Number.isInteger(n) && n >= 0) d[slug] = Math.max(d[slug] || 0, n);
    }
  }
  return Object.fromEntries(Object.keys(out).sort().map((k) => [k, Object.fromEntries(Object.entries(out[k]).sort())]));
}

export function summarise(days) {
  const totals = {};
  const channels = {};
  let all = 0;
  for (const slugs of Object.values(days)) {
    for (const [slug, n] of Object.entries(slugs)) {
      // `ref:<tag>` keys count arrivals by channel link; each one is also a
      // page load already counted under its slug, so adding it would double.
      if (slug.startsWith(REF_KEY)) {
        channels[slug.slice(REF_KEY.length)] = (channels[slug.slice(REF_KEY.length)] || 0) + n;
        continue;
      }
      totals[slug] = (totals[slug] || 0) + n;
      all += n;
    }
  }
  const top = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 20);
  return { days: Object.keys(days).length, page_loads: all, top, channels };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const base = process.env.COUNTER_URL;
  if (!base) {
    console.log('COUNTER_URL is not set; nothing to pull (the counter is off by default).');
    process.exit(0);
  }
  let existing = {};
  try {
    existing = JSON.parse(fs.readFileSync(OUT, 'utf8')).days || {};
  } catch { /* first pull */ }
  const res = await fetch(new URL('/counts', base));
  if (!res.ok) {
    console.error(`counter answered ${res.status}`);
    process.exit(1);
  }
  const { days } = await res.json();
  const merged = mergeDays(existing, days);
  const doc = {
    unit: 'page loads per UTC day by browsers that did not send DNT/GPC or opt out; not people',
    source: 'platform/counter (first-party, cookieless, no IPs stored)',
    days: merged,
  };
  fs.writeFileSync(OUT, `${JSON.stringify(doc, null, 1)}\n`);
  const s = summarise(merged);
  console.log(`${s.page_loads} page loads over ${s.days} day(s). Top: ${s.top.slice(0, 5).map(([k, n]) => `${k}=${n}`).join(', ') || 'none'}. By channel link: ${Object.entries(s.channels).map(([k, n]) => `${k}=${n}`).join(', ') || 'none'}`);
}
