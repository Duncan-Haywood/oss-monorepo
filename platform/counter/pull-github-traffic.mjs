// Copies GitHub's repository traffic (views, clones, referring sites, popular
// paths) into the repository. GitHub keeps only a rolling 14 days, so a number
// nobody pulls is gone two weeks later (`portfolio/usage/README.md`, rule 2).
//
//   TRAFFIC_TOKEN=... TRAFFIC_REPOS=owner/repo[,owner/repo] node platform/counter/pull-github-traffic.mjs
//
// Writes `portfolio/usage/github-traffic.json`. Daily views and clones merge
// like `pull.mjs`: a day already on file keeps the larger of each count, so the
// partial first and last days of a window never shrink the record. Referring
// sites and popular paths are 14-day totals with no per-day split, so each pull
// files them as a snapshot under the day it ran.
//
// The traffic endpoints need a token with push access (fine-grained:
// "Administration: Read-only"). The workflow's own GITHUB_TOKEN cannot be
// granted that, so without a TRAFFIC_TOKEN secret a pull answers 403 and this
// script says so and exits 0 rather than turning the daily job red.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const OUT = path.resolve(HERE, '..', '..', 'portfolio', 'usage', 'github-traffic.json');
const UNIT = 'GitHub repository traffic: views and clones per UTC day (count and unique visitors as GitHub reports them), plus 14-day referring sites and popular paths per pull day; aggregates only';
const SOURCE = 'GitHub REST traffic API via platform/counter/pull-github-traffic.mjs (14-day window, so pulled daily)';
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const int = (n) => (Number.isInteger(n) && n >= 0 ? n : 0);

/** `{views: [...], clones: [...]}` from the API into `{day: {views, view_uniques, clones, clone_uniques}}`. */
export function toDays({ views = [], clones = [] } = {}) {
  const out = {};
  for (const [list, key] of [[views, 'views'], [clones, 'clones']]) {
    for (const r of list) {
      const day = String(r?.timestamp || '').slice(0, 10);
      if (!DAY.test(day)) continue;
      const d = (out[day] ||= { views: 0, view_uniques: 0, clones: 0, clone_uniques: 0 });
      d[key] = int(r.count);
      d[key === 'views' ? 'view_uniques' : 'clone_uniques'] = int(r.uniques);
    }
  }
  return out;
}

export function mergeDays(existing = {}, incoming = {}) {
  const out = structuredClone(existing);
  for (const [day, counts] of Object.entries(incoming)) {
    if (!DAY.test(day)) continue;
    const d = (out[day] ||= {});
    for (const [k, n] of Object.entries(counts || {})) d[k] = Math.max(d[k] || 0, int(n));
  }
  return Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
}

/** Keeps only the aggregate fields; GitHub sends nothing personal here, and nothing else is stored. */
export function snapshot({ referrers = [], paths = [] } = {}) {
  return {
    referrers: referrers.map((r) => ({ referrer: String(r.referrer), count: int(r.count), uniques: int(r.uniques) })),
    paths: paths.map((p) => ({ path: String(p.path), title: String(p.title || ''), count: int(p.count), uniques: int(p.uniques) })),
  };
}

export function mergeRepo(existing = {}, pulled, today) {
  return {
    days: mergeDays(existing.days, toDays(pulled)),
    top: { ...(existing.top || {}), [today]: snapshot(pulled) },
  };
}

export function summarise(days) {
  const s = { days: Object.keys(days).length, views: 0, clones: 0 };
  for (const d of Object.values(days)) { s.views += d.views || 0; s.clones += d.clones || 0; }
  return s;
}

async function get(repo, endpoint, token) {
  const res = await fetch(`https://api.github.com/repos/${repo}/traffic/${endpoint}`, {
    headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' },
  });
  if (!res.ok) {
    const err = new Error(`${repo} traffic/${endpoint} answered ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const token = process.env.TRAFFIC_TOKEN;
  const repos = (process.env.TRAFFIC_REPOS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!token || !repos.length) {
    console.log('TRAFFIC_TOKEN or TRAFFIC_REPOS is not set; nothing to pull.');
    process.exit(0);
  }
  let doc = {};
  try {
    doc = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  } catch { /* first pull */ }
  const all = doc.repos || {};
  const today = new Date().toISOString().slice(0, 10);
  let pulledAny = false;
  for (const repo of repos) {
    try {
      const pulled = {
        views: (await get(repo, 'views?per=day', token)).views,
        clones: (await get(repo, 'clones?per=day', token)).clones,
        referrers: await get(repo, 'popular/referrers', token),
        paths: await get(repo, 'popular/paths', token),
      };
      all[repo] = mergeRepo(all[repo], pulled, today);
      pulledAny = true;
      const s = summarise(all[repo].days);
      const refs = all[repo].top[today].referrers.map((r) => `${r.referrer}=${r.count}`).join(', ') || 'none';
      console.log(`${repo}: ${s.views} views, ${s.clones} clones over ${s.days} day(s) on file. Referrers (14 days): ${refs}`);
    } catch (e) {
      if (e.status === 403 || e.status === 401) {
        console.log(`${e.message}: the token cannot read traffic. Add a TRAFFIC_TOKEN secret (fine-grained PAT, Administration: Read-only on ${repo}).`);
        continue;
      }
      throw e;
    }
  }
  if (pulledAny) fs.writeFileSync(OUT, `${JSON.stringify({ unit: UNIT, source: SOURCE, repos: all }, null, 1)}\n`);
}
