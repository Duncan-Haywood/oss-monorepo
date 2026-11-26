// Cross-module calls used by the imports module, kept in one place so signature drift between
// parallel modules only needs fixing here.
import type { AppContext } from "../../context";
import { enqueue } from "../../queues/enqueue";
import type { JobMessage } from "../../queues/messages";
import { createDocumentFromText } from "../ingestion";

export async function storeWebsitePage(
  ctx: AppContext,
  orgId: string,
  page: { title: string; text: string; sourceUrl: string; consentRecordId: string | null },
): Promise<{ id: string; duplicate: boolean }> {
  const doc = await createDocumentFromText(ctx, orgId, {
    title: page.title,
    kind: "website_page",
    text: page.text,
    sourceUrl: page.sourceUrl,
    consentRecordId: page.consentRecordId,
    onDuplicate: "reuse",
  });
  return { id: doc.documentId, duplicate: doc.duplicate };
}

/** Enqueue that never fails the caller (e.g. re-matching after an import is best-effort). */
export async function enqueueBestEffort(ctx: AppContext, job: JobMessage): Promise<void> {
  try {
    await enqueue(ctx, job);
  } catch (e) {
    ctx.logger.warn("imports.enqueue_failed", { type: job.type, error: String(e) });
  }
}
