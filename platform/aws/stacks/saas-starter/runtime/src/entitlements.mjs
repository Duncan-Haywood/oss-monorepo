// Entitlement writes (consumer) and reads (apps). `db` is anything with `query(text, params)`
// returning `{ rows }` (a pg Pool or Client).
import { ENTITLED_STATUSES } from "./paddle.mjs";

/** Applies one message from toEntitlementMessage. Idempotent and order-safe. Returns what happened. */
export async function applyMessage(db, msg) {
  const ins = await db.query(
    `INSERT INTO platform.paddle_events (event_id, event_type, occurred_at, payload)
     VALUES ($1, $2, $3, $4) ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
    [msg.event_id, msg.event_type, msg.occurred_at, JSON.stringify(msg.payload)],
  );
  if (ins.rows.length === 0) return "duplicate";
  const e = msg.entitlement;
  if (!e) return "logged";
  const up = await db.query(
    `INSERT INTO platform.entitlements
       (product, user_sub, status, plan, subscription_id, customer_id, current_period_end, source_occurred_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (product, user_sub) DO UPDATE SET
       status = EXCLUDED.status, plan = EXCLUDED.plan, subscription_id = EXCLUDED.subscription_id,
       customer_id = EXCLUDED.customer_id, current_period_end = EXCLUDED.current_period_end,
       source_occurred_at = EXCLUDED.source_occurred_at, updated_at = now()
     WHERE platform.entitlements.source_occurred_at < EXCLUDED.source_occurred_at
     RETURNING product`,
    [e.product, e.user_sub, e.status, e.plan, e.subscription_id, e.customer_id, e.current_period_end, msg.occurred_at],
  );
  return up.rows.length ? "applied" : "stale";
}

/** What an app calls: `{ entitled, status, plan, current_period_end }` for this user and product. */
export async function entitlementFor(db, product, userSub) {
  if (!userSub) return { entitled: false, status: "anonymous", plan: null, current_period_end: null };
  const { rows } = await db.query(
    `SELECT status, plan, current_period_end FROM platform.entitlements WHERE product = $1 AND user_sub = $2`,
    [product, userSub],
  );
  if (!rows.length) return { entitled: false, status: "none", plan: null, current_period_end: null };
  const r = rows[0];
  return { entitled: ENTITLED_STATUSES.has(r.status), status: r.status, plan: r.plan, current_period_end: r.current_period_end };
}
