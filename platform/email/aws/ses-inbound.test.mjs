import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sesInboundHandler } from './ses-inbound.mjs';
import { createService } from '../service.mjs';
import { d1r2Store } from '../store.mjs';
import { d1Shim, memBucket, recordingSender, rawMail } from '../testkit.mjs';

const cfg = JSON.parse(readFileSync(new URL('../inboxes.json', import.meta.url), 'utf8'));

test('an SES receipt event lands in the same inbox as Email Routing mail', async () => {
  const store = d1r2Store(d1Shim(), memBucket());
  const service = createService({ store, sender: recordingSender(), alerter: recordingSender(), cfg, tokens: {} });
  const s3 = { 'inbox-bucket/mail/abc': rawMail() };
  const handler = sesInboundHandler({ service, domain: cfg.domain, getObject: async (b, k) => s3[`${b}/${k}`] });
  const out = await handler({ Records: [{ ses: {
    mail: { source: 'ann@example.com', destination: ['support@marisstella.app', 'someone@else.test'] },
    receipt: { recipients: ['support@marisstella.app'], action: { type: 'S3', bucketName: 'inbox-bucket', objectKey: 'mail/abc' } },
  } }] });
  assert.equal(out.results.length, 1);
  assert.equal(out.results[0].inbox, 'support');
  assert.equal((await store.getThread(out.results[0].threadId)).contact, 'ann@example.com');
});

test('a Lambda-action receipt is read from <prefix><messageId> in the configured bucket', async () => {
  const store = d1r2Store(d1Shim(), memBucket());
  const service = createService({ store, sender: recordingSender(), alerter: recordingSender(), cfg, tokens: {} });
  const s3 = { 'raw-bucket/inbound/o3vcp1ekf2rkl4tgcf8ppg0bd': rawMail() };
  const handler = sesInboundHandler({ service, domain: cfg.domain, bucket: 'raw-bucket', prefix: 'inbound/', getObject: async (b, k) => s3[`${b}/${k}`] });
  const event = (messageId) => ({ Records: [{ eventSource: 'aws:ses', ses: {
    mail: { source: 'ann@example.com', destination: ['support@marisstella.app'], messageId },
    receipt: { recipients: ['support@marisstella.app'], action: { type: 'Lambda', invocationType: 'Event', functionArn: 'arn:aws:lambda:us-east-2:123456789012:function:mail-inboxes' } },
  } }] });
  const out = await handler(event('o3vcp1ekf2rkl4tgcf8ppg0bd'));
  assert.equal(out.results[0].inbox, 'support');
  const bad = await handler(event('../other/key'));
  assert.match(bad.results[0].skipped, /no S3 copy/, 'a message id that is not a plain token never becomes a path');
  const none = await sesInboundHandler({ service, domain: cfg.domain, getObject: async () => null })(event('abc'));
  assert.match(none.results[0].skipped, /no S3 copy/);
});
