import type { ConvexPrimaryWriteOptions } from "@/lib/payments/convex-primary";

/**
 * Deploy-handoff operator write policy for Mark live / Assign Vercel
 * project / Assign custom domain.
 *
 * getLeadSlugByCustomDomain (proxy.ts host-based routing) and
 * listDeployHandoffs (operator dashboard panel) both read Convex-first when
 * Convex is configured. A SQLite-only write on one instance after a Convex
 * mutation failure would silently miss on every other instance: a new
 * custom domain would never route (Starter Host→preview promise broken), a
 * dedicated Vercel project assignment would not isolate the client's
 * deploy, and Mark live would leave the handoff (and the lead's pipeline
 * stage) looking pre-live elsewhere even though the operator confirmed
 * DNS/publish.
 *
 * Mirrors LEAD_SNOOZE_CONVEX_PRIMARY / COMMERCE_PAID_OUT_CONVEX_PRIMARY
 * (operator action, fail closed, operator retries). Dashboard reads keep
 * the Convex→SQLite fallback when Convex is not configured.
 */
export const DEPLOY_HANDOFF_CONVEX_PRIMARY: ConvexPrimaryWriteOptions = {
  requireConvex: true,
};
