import {
  getLeads,
  getSuppressedEmails,
  listClientVoicePacks,
  listCommerceCatalogs,
  listCommerceOrdersDisputed,
  listCommerceOrdersMissingClientReceipt,
  listCommerceOrdersRefunded,
  listDeployHandoffs,
  listMarketingPacksForMonth,
  listOpenCheckoutSessions,
  listOrders,
  listUnpaidCommerceOrders,
  listUnrepliedInquiries,
} from "@/lib/db";
import { buildDailyDigest, renderDailyDigestHtml, type DailyDigest } from "@/lib/digest/daily-digest";
import { sendOperatorDailyDigest } from "@/lib/email/resend";
import { isMarketingSchedulingAllowed } from "@/lib/marketing/buffer-gate";
import { marketingMonthKey } from "@/lib/marketing/monthly-pack";

export type SendOperatorDigestResult =
  | { success: true; digest: DailyDigest; mock: boolean }
  | { success: false; error: string };

/**
 * The shared digest-build-and-send body behind BOTH triggers: the operator's
 * manual "Send daily digest" dashboard button (sendDailyDigestAction,
 * src/app/dashboard/leads/actions.ts) and the automated daily Vercel Cron
 * invocation (src/app/api/cron/daily-digest/route.ts). Extracted so the two
 * callers can never drift apart on which ledgers feed the digest — see
 * operator-daily-digest-cron-automation in BUSINESS_DECISIONS for why the
 * cron trigger exists.
 *
 * Callers own auth/rate-limiting/env-var gating (they differ: operator
 * session cookie + per-IP limit for the button, a bearer CRON_SECRET check
 * for the cron route) and must resolve `appUrl` themselves via
 * resolveTrustedAppUrl before calling this.
 */
export async function sendOperatorDigestEmail(
  digestEmail: string,
  appUrl: string,
  nowMs: number = Date.now(),
): Promise<SendOperatorDigestResult> {
  const yearMonth = marketingMonthKey(nowMs);
  const [
    leads,
    inquiries,
    openCheckoutSessions,
    orders,
    marketingPacks,
    commerceCatalogs,
    clientVoicePacks,
    commerceOrders,
    commerceOrdersRefunded,
    commerceOrdersDisputed,
    commerceOrdersMissingClientReceipt,
    handoffs,
    suppressions,
  ] = await Promise.all([
    getLeads(),
    listUnrepliedInquiries(),
    listOpenCheckoutSessions(),
    listOrders(),
    listMarketingPacksForMonth(yearMonth),
    listCommerceCatalogs(),
    listClientVoicePacks(),
    listUnpaidCommerceOrders(),
    listCommerceOrdersRefunded(),
    listCommerceOrdersDisputed(),
    listCommerceOrdersMissingClientReceipt(),
    listDeployHandoffs(),
    getSuppressedEmails(),
  ]);

  const digest = buildDailyDigest({
    leads,
    inquiries,
    openCheckoutSessions,
    orders,
    marketingPacksThisMonth: marketingPacks,
    commerceCatalogs,
    clientVoicePacks,
    commerceOrders,
    commerceOrdersRefunded,
    commerceOrdersDisputed,
    commerceOrdersMissingClientReceipt,
    handoffs,
    marketingSchedulingEnabled: isMarketingSchedulingAllowed(),
    suppressions,
    nowMs,
  });
  const html = renderDailyDigestHtml(digest, appUrl);

  const sent = await sendOperatorDailyDigest(digestEmail, html);
  if (!sent.success) {
    return {
      success: false,
      error:
        "error" in sent && typeof sent.error === "string" ? sent.error : "Failed to send daily digest",
    };
  }

  return {
    success: true,
    digest,
    mock: "mock" in sent ? Boolean(sent.mock) : false,
  };
}
