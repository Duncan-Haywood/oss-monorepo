// Queue job handlers for this module. Signatures are fixed by queues/handlers.ts.
import type { AppContext } from "../../context";
import { AppError } from "../../lib/errors";
import type { JobOf } from "../../queues/messages";
import { assertWebsiteCrawlAllowed, crawlOrgWebsite, importOpportunityFromUrl } from "./index";

/** Crawls the org's website. Re-checks setting + consent at run time (consent may be revoked). */
export async function crawlWebsite(ctx: AppContext, job: JobOf<"website.crawl">): Promise<void> {
  let consentRecordId: string;
  try {
    consentRecordId = await assertWebsiteCrawlAllowed(ctx, job.orgId);
  } catch (e) {
    if (e instanceof AppError) {
      ctx.logger.warn("website.crawl_skipped", { orgId: job.orgId, reason: e.code });
      return; // not retryable
    }
    throw e;
  }
  const result = await crawlOrgWebsite(ctx, job.orgId, job.url, job.maxPages, {
    consentRecordId,
  });
  ctx.logger.info("website.crawl_done", {
    orgId: job.orgId,
    stored: result.stored,
    fetched: result.fetched,
    skipped: result.skipped,
  });
}

/** Async (re-)import of an org-private opportunity from its URL. */
export async function importOpportunityUrl(
  ctx: AppContext,
  job: JobOf<"opportunity.import_url">,
): Promise<void> {
  try {
    await importOpportunityFromUrl(ctx, {
      orgId: job.orgId,
      url: job.url,
      opportunityId: job.opportunityId,
    });
  } catch (e) {
    // 4xx-type failures (robots disallow, not an opportunity, bad URL) will not fix themselves.
    if (e instanceof AppError && e.status < 500) {
      ctx.logger.warn("opportunity.import_failed", { orgId: job.orgId, code: e.code });
      return;
    }
    throw e;
  }
}
