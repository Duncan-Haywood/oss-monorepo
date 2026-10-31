// Open custom development: the request queue in `requests.json`, read by the
// site build (platform/pages/build.mjs, `renderCustomDevelopmentPage`) and
// checked by `requests.test.mjs`. One file, so a request's history is its git
// log, and a person can follow one without any account but a browser.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REQUESTS_FILE = path.join(HERE, 'requests.json');

/** What each status means, in the order a request moves through them. */
export const STATUSES = {
  received: 'Read, not yet decided.',
  accepted: 'Will be built; waiting for a session to start it.',
  building: 'Sessions are working on it; the project link shows how far it got.',
  shipped: 'Live, or merged and usable. Later fixes are still welcome.',
  declined: 'Not built here, with the reason given.',
};

/** Where a request came from. */
export const SOURCES = {
  owner: 'the repository owner',
  issue: 'a GitHub issue',
  form: 'the site feedback form',
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^R-\d{4}$/;

/** Problems with a parsed requests file, as strings; empty means valid. */
export function validateRequests(data, { exists = () => true } = {}) {
  const problems = [];
  if (!data || !Array.isArray(data.requests)) return ['requests.json needs a "requests" array'];
  const seen = new Set();
  for (const [i, r] of data.requests.entries()) {
    const at = r?.id || `#${i}`;
    if (!ID.test(r?.id || '')) problems.push(`${at}: id must look like R-0001`);
    if (seen.has(r?.id)) problems.push(`${at}: duplicate id`);
    seen.add(r?.id);
    if (!r?.title?.trim()) problems.push(`${at}: needs a title`);
    if (!r?.ask?.trim()) problems.push(`${at}: needs the ask, in the requester's words or a faithful summary`);
    if (!(r?.status in STATUSES)) problems.push(`${at}: status must be one of ${Object.keys(STATUSES).join(', ')}`);
    if (!(r?.source in SOURCES)) problems.push(`${at}: source must be one of ${Object.keys(SOURCES).join(', ')}`);
    for (const k of ['received', 'updated']) if (!DATE.test(r?.[k] || '')) problems.push(`${at}: ${k} must be YYYY-MM-DD`);
    if (r?.received && r?.updated && r.updated < r.received) problems.push(`${at}: updated is before received`);
    if (r?.source !== 'owner' && !/^https:\/\/github\.com\//.test(r?.link || '') && r?.source !== 'form') {
      problems.push(`${at}: a request from an issue needs its issue link`);
    }
    if (r?.status === 'declined' && !r?.reason?.trim()) problems.push(`${at}: a declined request says why (reason)`);
    if (r?.status === 'shipped' && !r?.project && !r?.live) problems.push(`${at}: a shipped request links its project or live page`);
    if (r?.project && !exists(r.project)) problems.push(`${at}: project ${r.project} is not in the tree`);
  }
  return problems;
}

/** The parsed file, or an empty queue when it cannot be read. */
export function loadRequests(file = REQUESTS_FILE) {
  try {
    return JSON.parse(readFileSync(file, 'utf8')).requests || [];
  } catch {
    return [];
  }
}
