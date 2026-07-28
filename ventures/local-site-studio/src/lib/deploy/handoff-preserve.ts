/**
 * Pure merge for operator-set deploy handoff fields.
 * Kept free of db/server-only imports so Vitest can cover preserve behavior.
 */

import type { DeployHandoff, DeployHandoffStatus } from "./types";

/** Statuses that mean the operator (or Vercel provision) already progressed past the fresh rebuild default. */
export function isProgressedHandoffStatus(
  status: DeployHandoffStatus,
): boolean {
  return status === "live" || status === "provisioned";
}

/**
 * Operator-set fields on a deploy handoff (custom domain for Host→preview
 * routing, dedicated Vercel project, Mark live / provisioned progress, and
 * the notes audit trail) must survive a rebuild when a later bundle checkout
 * (upsell / re-purchase) creates a new stripeSessionId.
 * Same class as preserveCommerceStripeIds — Convex upsert replace + SQLite
 * ON CONFLICT both overwrite omitted optionals with NULL/undefined, and
 * buildHandoffRecord always starts at awaiting_dns with fresh default notes.
 */
export function preserveDeployHandoffOperatorFields(
  next: DeployHandoff,
  existing: DeployHandoff | null | undefined,
): DeployHandoff {
  if (!existing) return next;

  const nextCustom = next.customDomain?.trim();
  const nextProject = next.vercelProjectId?.trim();
  const existingCustom = existing.customDomain?.trim();
  const existingProject = existing.vercelProjectId?.trim();

  const preserveStatus = isProgressedHandoffStatus(existing.status)
    ? existing.status
    : next.status;

  const sessionChanged = next.stripeSessionId !== existing.stripeSessionId;
  const upsellNote = sessionChanged
    ? `Upsell/re-purchase checkout ${next.stripeSessionId} — preserved operator handoff status (${preserveStatus}) and domain fields.`
    : null;

  // Progressed handoffs keep the operator audit trail; fresh awaiting_dns /
  // pending / failed rebuilds keep next's default notes from buildHandoffRecord.
  const notes = isProgressedHandoffStatus(existing.status)
    ? [...existing.notes, ...(upsellNote ? [upsellNote] : [])]
    : next.notes;

  return {
    ...next,
    customDomain: nextCustom || existingCustom || undefined,
    vercelProjectId: nextProject || existingProject || undefined,
    status: preserveStatus,
    notes,
    vercelDomainStatus: next.vercelDomainStatus ?? existing.vercelDomainStatus,
  };
}
