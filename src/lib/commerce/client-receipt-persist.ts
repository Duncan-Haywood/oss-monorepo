import type { ConvexPrimaryWriteOptions } from "@/lib/payments/convex-primary";

/**
 * Commerce manual client-receipt resend policy.
 *
 * When Convex is configured, resendCommerceClientReceiptAction must pass
 * COMMERCE_CLIENT_RECEIPT_RESEND_CONVEX_PRIMARY so a Convex mutation failure
 * surfaces to the operator instead of writing only to instance-local SQLite.
 * listCommerceOrdersMissingClientReceipt / pipeline-health / the daily digest
 * read Convex-first — a SQLite-only marker leaves the order looking
 * unnotified on other instances and risks the operator resending again.
 * Mirrors COMMERCE_PAID_OUT_CONVEX_PRIMARY (operator action, fail closed,
 * operator retries). Dashboard keeps the Convex→SQLite fallback when Convex
 * is not configured.
 */
export const COMMERCE_CLIENT_RECEIPT_RESEND_CONVEX_PRIMARY: ConvexPrimaryWriteOptions =
  {
    requireConvex: true,
  };
