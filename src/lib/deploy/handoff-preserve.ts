/**
 * Pure merge for operator-set deploy handoff fields.
 * Kept free of db/server-only imports so Vitest can cover preserve behavior.
 */

import type { DeployHandoff } from "./types";

/**
 * Operator-set fields on a deploy handoff (custom domain for Host→preview
 * routing, dedicated Vercel project) must survive a rebuild when a later
 * bundle checkout (upsell / re-purchase) creates a new stripeSessionId.
 * Same class as preserveCommerceStripeIds — Convex upsert replace + SQLite
 * ON CONFLICT both overwrite omitted optionals with NULL/undefined.
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

  return {
    ...next,
    customDomain: nextCustom || existingCustom || undefined,
    vercelProjectId: nextProject || existingProject || undefined,
  };
}
