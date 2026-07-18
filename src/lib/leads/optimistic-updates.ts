/**
 * Pure helpers for the dashboard's client-side optimistic Lead list state
 * (src/app/dashboard/leads/leads-client.tsx) — unit-testable without a React
 * render, mirroring the notes.ts / outreach-cadence.ts pattern for pure
 * UI-decision logic used by that file.
 *
 * Two bugs this module fixes (see leads-client-optimistic-state-desync):
 *
 * 1. Add Lead's Slug field is free-text with no client-side normalization,
 *    but addLeadAction (actions.ts) normalizes the slug server-side
 *    (lowercase, non-[a-z0-9-] -> '-') before persisting and returns that
 *    normalized value. Pushing the raw client-typed slug into local state
 *    instead of the server-returned one adds a row whose slug matches no DB
 *    record — every later action on that row (stage change, snooze, notes,
 *    follow-up) then silently targets a non-existent lead until reload.
 *    upsertSavedLeadBySlug always keys on the server-normalized slug.
 *
 * 2. handleStageChange applies an optimistic update before awaiting the
 *    server action, then on failure reverted with `setLeads(initialLeads)`
 *    — the page-load prop snapshot. That wipes every other in-session
 *    optimistic edit (other stage changes, added leads, snooze/notes/cold
 *    disposition updates) back to stale state whenever a single unrelated
 *    stage change fails, not just the row that failed.
 *    revertSingleLeadOptimisticUpdate reverts only the one row.
 *
 * 3. handleStageChange had no in-flight guard: a second stage change on the
 *    same row before the first call's response lands can resolve out of
 *    order. If the FIRST call fails after the SECOND already succeeded and
 *    persisted, an unconditional revert stomped the row back to the first
 *    call's stale snapshot, discarding the real, already-committed stage
 *    (see stage-change-optimistic-revert-race). revertSingleLeadOptimisticUpdate
 *    now takes the exact optimistic Lead object this call applied and only
 *    reverts when the row still holds that same reference.
 */

import type { Lead } from "./types";

/**
 * Add-or-replace a lead by slug — used after a successful addLeadAction with
 * the server-returned (already-normalized) slug, never the raw form input.
 */
export function upsertSavedLeadBySlug(leads: Lead[], savedLead: Lead): Lead[] {
  const existsIdx = leads.findIndex((l) => l.slug === savedLead.slug);
  if (existsIdx !== -1) {
    const updated = [...leads];
    updated[existsIdx] = savedLead;
    return updated;
  }
  return [...leads, savedLead];
}

/**
 * Revert exactly one row's optimistic update back to its pre-update
 * snapshot on a failed server action — every other row (and any other
 * optimistic edit made earlier in the session) stays untouched.
 *
 * `previous` should be the lead as it was found immediately before applying
 * the optimistic update (undefined if the slug wasn't in the list, in which
 * case there is nothing to revert).
 *
 * `expectedOptimistic`, when passed, should be the exact Lead object
 * reference this call wrote into state for `slug`. If the row no longer
 * holds that reference — because a later, overlapping call already changed
 * it, and per the out-of-order-response race above may have already
 * succeeded and persisted that change — this is a no-op: reverting would
 * clobber real, already-committed state with a stale snapshot.
 */
export function revertSingleLeadOptimisticUpdate(
  leads: Lead[],
  slug: string,
  previous: Lead | undefined,
  expectedOptimistic?: Lead,
): Lead[] {
  if (!previous) return leads;
  return leads.map((l) => {
    if (l.slug !== slug) return l;
    if (expectedOptimistic !== undefined && l !== expectedOptimistic) return l;
    return previous;
  });
}
