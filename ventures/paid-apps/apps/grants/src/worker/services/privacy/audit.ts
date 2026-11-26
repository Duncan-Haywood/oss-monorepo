// Append-only audit log. Call for every consequential action (uploads, deletions, fact confirmations,
// drafts, approvals, submissions, settings/billing changes, exports). Never include document contents.
import type { ActorType } from "@shared/enums";
import type { AppContext } from "../../context";
import { auditLog } from "../../db/schema";
import { newId } from "../../lib/ids";

export interface AuditEntry {
  orgId: string | null;
  actorType: ActorType;
  actorId?: string | null;
  action: string; // "<entity>.<verb>", e.g. "document.uploaded"
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  requestId?: string;
}

export async function audit(ctx: AppContext, e: AuditEntry): Promise<void> {
  await ctx.db.insert(auditLog).values({
    id: newId("aud"),
    orgId: e.orgId,
    actorType: e.actorType,
    actorId: e.actorId ?? null,
    action: e.action,
    targetType: e.targetType ?? null,
    targetId: e.targetId ?? null,
    metadata: e.metadata ?? null,
    requestId: e.requestId ?? null,
  });
}
