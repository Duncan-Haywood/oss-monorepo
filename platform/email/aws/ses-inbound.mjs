// The AWS side of the same inboxes, for when the email-ops stack's SES
// receipt rule replaces Cloudflare Email Routing (platform/aws/stacks/
// email-ops, "Inbound"). SES writes the raw message to S3 and invokes a
// Lambda with a receipt event; this turns that event into the exact
// `service.ingest` call the Cloudflare Worker makes, so threads, flags,
// guardrails and the agent API are unchanged.
//
// The store is dynamoS3Store in ./dynamo-store.mjs. What still has to be
// written for the move (README.md, "Portability"): the table and bucket in
// the email-ops stack, and a Lambda entry that builds createService({ store, sender: portSender(sesSender(...)),
// alerter, ... }) and passes HTTP requests to service.api through the
// function-URL adapter platform/edge/aws/lambda.mjs already has.

/**
 * @param service   createService(...) result
 * @param getObject async (bucket, key) => Uint8Array   (S3 GetObject)
 * @param domain    the inbox domain; other recipients in the event are skipped
 * @param bucket, prefix  where the receipt rule's earlier S3 action wrote the
 *                  message. A Lambda action's event names only itself
 *                  (`receipt.action.type` is 'Lambda'), so the object is
 *                  found as <prefix><mail.messageId>, as the edge API does.
 */
export function sesInboundHandler({ service, getObject, domain, bucket = '', prefix = '' }) {
  return async function handler(event) {
    const results = [];
    for (const record of event?.Records || []) {
      const ses = record.ses || {};
      const action = ses.receipt?.action || {};
      let where = null;
      if (action.type === 'S3' && action.bucketName && action.objectKey) where = [action.bucketName, action.objectKey];
      else if (bucket && /^[A-Za-z0-9._-]+$/.test(ses.mail?.messageId || '')) where = [bucket, `${prefix}${ses.mail.messageId}`];
      if (!where) {
        results.push({ skipped: 'no S3 copy named by the event or the config' });
        continue;
      }
      const raw = await getObject(...where);
      const recipients = (ses.receipt?.recipients || ses.mail?.destination || [])
        .filter((r) => String(r).toLowerCase().endsWith(`@${domain}`));
      for (const rcpt of recipients) {
        results.push(await service.ingest({ raw, envFrom: ses.mail?.source || '', envTo: rcpt }));
      }
    }
    // A synchronous SES Lambda action may answer STOP_RULE; this one is
    // invoked asynchronously after the S3 write, so it only reports.
    return { results };
  };
}
