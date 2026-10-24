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
import { REF_KEY, SOURCE_KEY, GEO_KEY, DEVICE_KEY, BOT_KEY, BOT_PAGE_KEY } from './core.mjs';

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

// Each `prefix:` key is a breakdown, never a page: ref/src/geo/dev split the
// same counted loads by channel link, kind of referring site, country and
// device, and bot/botpage count crawler beacons that were not page loads at
// all. Adding any of them to the page total would double count or count bots.
const BREAKDOWNS = [
  [REF_KEY, 'channels'], [SOURCE_KEY, 'sources'], [GEO_KEY, 'countries'],
  [DEVICE_KEY, 'devices'], [BOT_PAGE_KEY, 'bot_pages'], [BOT_KEY, 'bots'],
];

export function summarise(days) {
  const totals = {};
  const out = Object.fromEntries(BREAKDOWNS.map(([, name]) => [name, {}]));
  let all = 0;
  for (const slugs of Object.values(days)) {
    for (const [slug, n] of Object.entries(slugs)) {
      const hit = BREAKDOWNS.find(([prefix]) => slug.startsWith(prefix));
      if (hit) {
        const k = slug.slice(hit[0].length);
        out[hit[1]][k] = (out[hit[1]][k] || 0) + n;
        continue;
      }
      if (slug.includes(':')) continue; // a breakdown this reader does not know yet
      totals[slug] = (totals[slug] || 0) + n;
      all += n;
    }
  }
  const top = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 20);
  return { days: Object.keys(days).length, page_loads: all, top, ...out };
}

const list = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}=${n}`).join(', ') || 'none';

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
    unit: 'page loads per UTC day by browsers that did not send DNT/GPC or opt out; not people. Keys with a prefix are breakdowns, not pages: ref:/src:/geo:/dev: split the same loads by channel link, referring-site kind, country and device; bot:/botpage: count crawler beacons, which are not page loads',
    source: 'platform/edge Worker (first-party, cookieless; no IP, browser string or referring host stored, only the country code and device class)',
    days: merged,
  };
  fs.writeFileSync(OUT, `${JSON.stringify(doc, null, 1)}\n`);
  const s = summarise(merged);
  console.log(`${s.page_loads} page loads over ${s.days} day(s). Top: ${s.top.slice(0, 5).map(([k, n]) => `${k}=${n}`).join(', ') || 'none'}. By channel link: ${list(s.channels)}. By referring site: ${list(s.sources)}. By country: ${list(s.countries)}. By device: ${list(s.devices)}. Crawler beacons (not page loads): ${list(s.bots)}.`);
}
