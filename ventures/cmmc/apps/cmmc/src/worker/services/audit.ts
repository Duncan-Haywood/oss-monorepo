// Append-only audit trail of consequential actions. Never store document contents here.

import type { AppContext } from "../context";
import { auditLog } from "../db/schema";
import { newId } from "../lib/ids";

export async function audit(
  ctx: AppContext,
  e: {
    orgId: string;
    actorUserId: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
  },
) {
  await ctx.db.insert(auditLog).values({
    id: newId("aud"),
    orgId: e.orgId,
    actorUserId: e.actorUserId,
    action: e.action,
    targetType: e.targetType,
    targetId: e.targetId ?? null,
    createdAt: ctx.now(),
  });
}
