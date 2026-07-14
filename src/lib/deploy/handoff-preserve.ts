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
 * Progress rank for deploy handoff status. Higher = further along fulfillment.
 * Used so note-only writes (bundle receipt/DNS email sent-markers) cannot
 * regress a concurrent Mark live / provisioned state — see
 * handoff-email-marker-status-no-downgrade.
 *
 * `pending` and `failed` share rank 0 (neither is progress past the other).
 */
export const HANDOFF_STATUS_RANK: Record<DeployHandoffStatus, number> = {
  pending: 0,
  failed: 0,
  awaiting_dns: 1,
  provisioned: 2,
  live: 3,
};

/**
 * Pick the more advanced of two handoff statuses.
 * Equal rank prefers `requested` so intentional same-status note appends
 * (webhook markers) keep the caller's value; a lower-rank request loses to
 * the existing row so a stale awaiting_dns marker cannot undo live.
 */
export function preferAdvancedHandoffStatus(
  existing: DeployHandoffStatus,
  requested: DeployHandoffStatus,
): DeployHandoffStatus {
  const existingRank = HANDOFF_STATUS_RANK[existing] ?? 0;
  const requestedRank = HANDOFF_STATUS_RANK[requested] ?? 0;
  return requestedRank >= existingRank ? requested : existing;
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

/**
 * After tryProvisionVercelDomain (a real Vercel Domains API fetch), re-read
 * the handoff and merge only provision outputs onto the fresh row before the
 * final full-row upsert. Without this, a concurrent Mark live / Save domain /
 * Assign Vercel project during the network window is silently discarded —
 * same TOCTOU class as commerce-catalog-sync-lost-update-guard.
 *
 * - Base identity / payment fields come from `provisioned` (upsell rebuilds
 *   carry a new stripeSessionId; assign paths carry the just-written domain
 *   or project id through the provision snapshot).
 * - Operator-owned fields that may have moved during the call (`customDomain`,
 *   `vercelProjectId`, Mark live status + notes) come from `fresh`.
 * - `vercelDomainStatus` and provision-only notes come from `provisioned`.
 */
export function mergeProvisionOntoFreshHandoff(
  fresh: DeployHandoff,
  provisioned: DeployHandoff,
): DeployHandoff {
  const freshNoteSet = new Set(fresh.notes);
  const provisionOnlyNotes = provisioned.notes.filter(
    (note) => !freshNoteSet.has(note),
  );

  const status =
    fresh.status === "live" || provisioned.status === "live"
      ? "live"
      : fresh.status === "provisioned" || provisioned.status === "provisioned"
        ? "provisioned"
        : // Prefer the post-provision rebuild status (e.g. awaiting_dns) over a
          // stale fresh `failed` row during enqueueProductionHandoff rebuild.
          provisioned.status;

  return {
    ...provisioned,
    customDomain: fresh.customDomain,
    vercelProjectId: fresh.vercelProjectId,
    status,
    notes: [...fresh.notes, ...provisionOnlyNotes],
    vercelDomainStatus:
      provisioned.vercelDomainStatus ?? fresh.vercelDomainStatus,
    updatedAt: provisioned.updatedAt || fresh.updatedAt,
  };
}
