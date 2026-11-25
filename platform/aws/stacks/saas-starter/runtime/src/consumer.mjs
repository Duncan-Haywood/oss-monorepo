// Entitlement consumer: SQS (fed from the payments account) -> the product's Postgres database.
// Runs in the apps VPC as role `entitlement_writer`. Reports per-message failures so SQS retries
// only those, then moves them to the DLQ after maxReceiveCount.
import { applyMessage } from "./entitlements.mjs";
import { getPool } from "./pg.mjs";

const NAME = /^[a-z][a-z0-9_]{1,40}$/;   // same rule as db-admin; the DB itself is the allow-list

export function makeConsumer({ getDb, products = null }) {
  return async (event) => {
    const batchItemFailures = [];
    for (const rec of event.Records || []) {
      try {
        const msg = JSON.parse(rec.body);
        const product = msg.entitlement?.product;
        let outcome;
        if (!product) outcome = "ignored";                       // not a subscription event for a known user
        else if (!NAME.test(product) || (products && !products.includes(product))) throw new Error(`unknown product ${product}`);
        else outcome = await applyMessage(await getDb(product), msg);
        console.log(JSON.stringify({ event_id: msg.event_id, event_type: msg.event_type, product, outcome }));
      } catch (e) {
        console.error("entitlement message failed", rec.messageId, e?.message);
        batchItemFailures.push({ itemIdentifier: rec.messageId });
      }
    }
    return { batchItemFailures };
  };
}

// Lambda entry. Env: DB_HOST, DB_USER=entitlement_writer. entitlement_writer can CONNECT only to
// databases db-admin created for a product, so an unknown product fails and goes to the DLQ.
export const handler = makeConsumer({
  getDb: (product) => getPool(process.env, { database: product }),
});
