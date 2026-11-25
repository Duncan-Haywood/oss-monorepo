#!/usr/bin/env node
// Copies the edge API's data from the Cloudflare Worker (D1) into the
// DynamoDB table, keeping every value and id, so `pull.mjs` and
// `pull-feedback.mjs` carry on from the same cursors after cutover.
//
//   node platform/edge/aws/migrate-d1.mjs                 # dry run: counts only
//   TABLE_NAME=edge-api INBOX_TOKEN=... node platform/edge/aws/migrate-d1.mjs --apply
//
// It reads the Worker's own HTTP routes, not a D1 export, so it needs no
// Cloudflare token: /counts and /feedback are public, /inbox needs
// INBOX_TOKEN (unset = the inbox is skipped; it holds at most 90 days and
// the Worker keeps receiving until the MX records move). AWS credentials come
// from the environment (the apply role's OIDC session in CI).
//
// Re-running is safe: every write is a PutItem of the same key and value,
// and the id sequences only move forward. Run it once before the DNS
// cutover and once after, so hits counted in between are carried over (a
// count read later is never lower, so the second pass wins).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dynamoStore } from './dynamo-store.mjs';
import { jsonProtocol } from './sigv4.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Everything the Worker serves, read page by page. */
export async function readWorker(base, { inboxToken = '', fetchImpl = fetch } = {}) {
  const get = async (p, headers = {}) => {
    const r = await fetchImpl(`${base}${p}`, { headers });
    if (!r.ok) throw new Error(`GET ${p}: ${r.status}`);
    return r.json();
  };
  const { days } = await get('/counts?since=0000-00-00');
  const counts = [];
  for (const [day, slugs] of Object.entries(days)) for (const [slug, n] of Object.entries(slugs)) counts.push({ day, slug, n });
  const feedback = [];
  for (let after = 0; ;) {
    const page = (await get(`/feedback?after=${after}`)).feedback;
    if (!page.length) break;
    feedback.push(...page);
    after = page[page.length - 1].id;
  }
  const inbox = [];
  if (inboxToken) {
    for (let after = 0; ;) {
      const page = (await get(`/inbox?after=${after}`, { authorization: `Bearer ${inboxToken}` })).messages;
      if (!page.length) break;
      inbox.push(...page);
      after = page[page.length - 1].id;
    }
  }
  return { counts, feedback, inbox };
}

/** Write what was read into a store; returns what it wrote. */
export async function writeAll(store, { counts, feedback, inbox }) {
  for (const c of counts) await store.importCount(c);
  for (const f of feedback) await store.importFeedback(f);
  for (const m of inbox) await store.importInbox(m);
  const maxId = (rows) => rows.reduce((m, r) => Math.max(m, r.id), 0);
  await store.raiseSequence('feedback', maxId(feedback));
  await store.raiseSequence('inbox', maxId(inbox));
  return { counts: counts.length, feedback: feedback.length, inbox: inbox.length };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const site = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'site.json'), 'utf8'));
  const base = process.env.WORKER_URL || site.url;
  const data = await readWorker(base, { inboxToken: process.env.INBOX_TOKEN || '' });
  const summary = { from: base, counts: data.counts.length, feedback: data.feedback.length, inbox: data.inbox.length };
  if (!apply) {
    console.log(JSON.stringify({ dry_run: true, ...summary }, null, 2));
    return;
  }
  if (!process.env.TABLE_NAME) throw new Error('TABLE_NAME is required with --apply');
  const call = jsonProtocol({ target: 'DynamoDB_20120810', region: process.env.AWS_REGION || 'us-east-1', service: 'dynamodb' });
  const wrote = await writeAll(dynamoStore({ call, table: process.env.TABLE_NAME }), data);
  console.log(JSON.stringify({ applied: true, from: base, to: process.env.TABLE_NAME, wrote }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
