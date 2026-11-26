// The AWS side of the same inboxes, for when the email-ops stack's SES
// receipt rule replaces Cloudflare Email Routing (platform/aws/stacks/
// email-ops, "Inbound"). SES writes the raw message to S3 and invokes a
// Lambda with a receipt event; this turns that event into the exact
// `service.ingest` call the Cloudflare Worker makes, so threads, flags,
// guardrails and the agent API are unchanged.
//
// What still has to be written for the move (README.md, "Portability"):
// a DynamoDB + S3 store passing store.test.mjs's contract, and a Lambda
// entry that builds createService({ store, sender: portSender(sesSender(...)),
// alerter, ... }) and passes HTTP requests to service.api through the
// function-URL adapter platform/edge/aws/lambda.mjs already has.

/**
 * @param service   createService(...) result
 * @param getObject async (bucket, key) => Uint8Array   (S3 GetObject)
 * @param domain    the inbox domain; other recipients in the event are skipped
 */
export function sesInboundHandler({ service, getObject, domain }) {
  return async function handler(event) {
    const results = [];
    for (const record of event?.Records || []) {
      const ses = record.ses || {};
      const action = ses.receipt?.action || {};
      if (action.type !== 'S3' || !action.bucketName || !action.objectKey) {
        results.push({ skipped: 'not an S3 receipt action' });
        continue;
      }
      const raw = await getObject(action.bucketName, action.objectKey);
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
