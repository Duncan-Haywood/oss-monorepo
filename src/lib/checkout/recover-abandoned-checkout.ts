import {
  getCommerceCatalog,
  getLeadBySlug,
  listOpenCheckoutSessions,
  listOrdersByLeadSlug,
  recordCheckoutRecoverySent,
} from "@/lib/db";
import { CHECKOUT_RECOVERY_SENT_CONVEX_PRIMARY } from "@/lib/checkout/session-persist";
import { leadEligibleForCommerceCatalog } from "@/lib/commerce/catalog";
import { sendCheckoutAbandonedRecovery, sendCommerceAbandonedRecovery } from "@/lib/email/resend";
import { ConvexPrimaryWriteError } from "@/lib/payments/convex-primary";
import type { CheckoutSessionRecord } from "./types";

export type RecoverAbandonedCheckoutResult =
  | { success: true; mock: boolean }
  | { success: false; error: string };

/**
 * Shared send-and-mark body behind BOTH triggers for bundle (Local Site
 * Studio plan) checkout recovery: the operator's manual "Send recovery
 * email" dashboard button (sendCheckoutRecoveryAction,
 * src/app/dashboard/leads/actions.ts) and the automated daily
 * GET /api/cron/checkout-recovery (src/app/api/cron/checkout-recovery/route.ts).
 * Extracted so the two callers can never diverge on the mark-then-send
 * race guard — see checkout-recovery-cron-automation in BUSINESS_DECISIONS.
 *
 * Callers own auth/rate-limiting/session lookup and kind validation
 * (isBundleCheckoutSession) before calling this with the resolved session.
 */
export async function recoverAbandonedBundleCheckout(
  session: CheckoutSessionRecord,
): Promise<RecoverAbandonedCheckoutResult> {
  const lead = await getLeadBySlug(session.leadSlug);
  const to = session.customerEmail || lead?.email;
  if (!to) {
    return { success: false, error: "No email on file for this checkout session" };
  }

  const businessName = lead?.businessName || session.leadSlug;
  const expectedRecoverySentCount = session.recoverySentCount ?? 0;

  let marked: boolean;
  try {
    marked = await recordCheckoutRecoverySent(
      session.stripeSessionId,
      new Date().toISOString(),
      expectedRecoverySentCount,
      CHECKOUT_RECOVERY_SENT_CONVEX_PRIMARY,
    );
  } catch (error) {
    if (error instanceof ConvexPrimaryWriteError) {
      return {
        success: false,
        error: "Could not record recovery send in the shared store — email was not sent. Retry in a moment.",
      };
    }
    throw error;
  }
  if (!marked) {
    const freshOpen = await listOpenCheckoutSessions();
    const fresh = freshOpen.find((s) => s.stripeSessionId === session.stripeSessionId);
    if (fresh && (fresh.recoverySentCount ?? 0) > expectedRecoverySentCount) {
      return {
        success: false,
        error:
          "A recovery email was already sent for this session moments ago (likely from another tab or a duplicate click) — skipped duplicate send",
      };
    }
    return {
      success: false,
      error: "Checkout session was completed after this page loaded — refresh; recovery email was not sent",
    };
  }

  const sent = await sendCheckoutAbandonedRecovery(
    to,
    businessName,
    session.leadSlug,
    session.tier,
    expectedRecoverySentCount + 1,
  );

  if (!sent.success) {
    return {
      success: false,
      error:
        "reason" in sent && sent.reason === "suppressed"
          ? "Email is on the suppression list (session already marked recovered — will not reappear in due queue)"
          : "error" in sent && typeof sent.error === "string"
            ? `${sent.error} (session already marked recovered — will not reappear in due queue)`
            : "Failed to send recovery email (session already marked recovered — will not reappear in due queue)",
    };
  }

  return { success: true, mock: "mock" in sent ? Boolean(sent.mock) : false };
}

/**
 * Shared send-and-mark body for Commerce Buy now abandoned-cart recovery —
 * see recoverAbandonedBundleCheckout above for the same manual-button /
 * cron-route split rationale. Callers own session lookup and kind
 * validation (isCommerceSkuCheckoutSession) before calling this.
 */
export async function recoverAbandonedCommerceCheckout(
  session: CheckoutSessionRecord,
): Promise<RecoverAbandonedCheckoutResult> {
  const to = session.customerEmail;
  if (!to) {
    return {
      success: false,
      error: "No customer email on this Buy now session — recovery needs the shopper's email",
    };
  }

  const lead = await getLeadBySlug(session.leadSlug);
  if (!lead) {
    return { success: false, error: "Lead not found for this Buy now session" };
  }

  // Twin of Buy now create (#348) + sync + commerce_sku webhook (#350): do
  // not nudge end-customer carts after CRM pause/cancel while entitlement
  // is off (create-path 403s; webhook skips ledger).
  const orders = await listOrdersByLeadSlug(session.leadSlug);
  if (!leadEligibleForCommerceCatalog(lead, orders)) {
    return {
      success: false,
      error: "Commerce catalogs require a paid/live lead with a Commerce add-on order",
    };
  }

  const catalog = await getCommerceCatalog(session.leadSlug);
  const skuName = catalog?.items.find((item) => item.id === session.skuId)?.name ?? session.skuId ?? "item";
  const businessName = lead.businessName || session.leadSlug;
  const expectedRecoverySentCount = session.recoverySentCount ?? 0;

  let marked: boolean;
  try {
    marked = await recordCheckoutRecoverySent(
      session.stripeSessionId,
      new Date().toISOString(),
      expectedRecoverySentCount,
      CHECKOUT_RECOVERY_SENT_CONVEX_PRIMARY,
    );
  } catch (error) {
    if (error instanceof ConvexPrimaryWriteError) {
      return {
        success: false,
        error: "Could not record recovery send in the shared store — email was not sent. Retry in a moment.",
      };
    }
    throw error;
  }
  if (!marked) {
    const freshOpen = await listOpenCheckoutSessions();
    const fresh = freshOpen.find((s) => s.stripeSessionId === session.stripeSessionId);
    if (fresh && (fresh.recoverySentCount ?? 0) > expectedRecoverySentCount) {
      return {
        success: false,
        error:
          "A recovery email was already sent for this session moments ago (likely from another tab or a duplicate click) — skipped duplicate send",
      };
    }
    return {
      success: false,
      error: "Checkout session was completed after this page loaded — refresh; recovery email was not sent",
    };
  }

  const sent = await sendCommerceAbandonedRecovery(
    to,
    businessName,
    session.leadSlug,
    skuName,
    expectedRecoverySentCount + 1,
  );

  if (!sent.success) {
    return {
      success: false,
      error:
        "reason" in sent && sent.reason === "suppressed"
          ? "Email is on the suppression list (session already marked recovered — will not reappear in due queue)"
          : "error" in sent && typeof sent.error === "string"
            ? `${sent.error} (session already marked recovered — will not reappear in due queue)`
            : "Failed to send recovery email (session already marked recovered — will not reappear in due queue)",
    };
  }

  return { success: true, mock: "mock" in sent ? Boolean(sent.mock) : false };
}
