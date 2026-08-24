/**
 * Pure helpers for auditing the id-based cross-references between
 * ITERATIONS[].decisions and BUSINESS_DECISIONS in
 * src/lib/process/prompt_process.tsx.
 *
 * AGENT_PROTOCOL mandates (see the "New BUSINESS_DECISIONS entries must set
 * `id`" rule) that every new ITERATIONS entry reference its owning decision
 * via `BUSINESS_DECISIONS.filter((d) => d.id === "...")` rather than a
 * hand-tracked slice index, specifically so a missing/typo'd id can't
 * silently produce an empty `decisions` array the way the old slice-index
 * convention silently drifted. That guarantee was never actually enforced by
 * a test — see process-log-decisions-cross-reference-integrity-guard, which
 * found exactly one id-filter reference (checkout-page-rate-limit) whose
 * BUSINESS_DECISIONS entry had never been appended, so the filter it backs
 * evaluated to `[]` at runtime with nothing to catch it.
 *
 * This module only audits entries that use the id-filter convention — the
 * large pre-existing population of `BUSINESS_DECISIONS.slice(i, j)` /
 * `BUSINESS_DECISIONS[i]` entries from before that convention existed is
 * documented in AGENT_PROTOCOL as a known, deliberately-not-mass-rewritten
 * historical range and is out of scope here.
 */

/** Matches `id: "some-id"` inside the BUSINESS_DECISIONS source block. */
const BUSINESS_DECISION_ID = /\bid:\s*"([^"]+)"/g;

/**
 * Matches every `BUSINESS_DECISIONS.filter((d) => <condition>)` call site
 * (single-line or Prettier-wrapped across multiple lines) and captures the
 * arrow function's condition body, from which one or more `d.id === "..."`
 * comparisons are then extracted.
 */
const DECISIONS_FILTER_CALL =
  /BUSINESS_DECISIONS\.filter\(\s*\(d\)\s*=>\s*([\s\S]*?)\)\s*,?\s*\)?,?/g;
const FILTER_ID_COMPARISON = /d\.id === "([^"]+)"/g;

export function listBusinessDecisionIds(businessDecisionsSource: string): string[] {
  return [...businessDecisionsSource.matchAll(BUSINESS_DECISION_ID)].map((m) => m[1]!);
}

/**
 * Every id referenced by a `BUSINESS_DECISIONS.filter((d) => d.id === "...")`
 * (or `... || d.id === "..."`) call site in the ITERATIONS source block, in
 * source order, duplicates included (a single filter call combining two ids
 * via `||` yields two entries).
 */
export function listReferencedDecisionIds(iterationsSource: string): string[] {
  const ids: string[] = [];
  for (const call of iterationsSource.matchAll(DECISIONS_FILTER_CALL)) {
    const condition = call[1] ?? "";
    for (const cmp of condition.matchAll(FILTER_ID_COMPARISON)) {
      ids.push(cmp[1]!);
    }
  }
  return ids;
}

export interface DecisionsLinkAuditResult {
  /** BUSINESS_DECISIONS ids with more than one entry (breaks id-uniqueness). */
  duplicateBusinessDecisionIds: string[];
  /**
   * Ids referenced by an ITERATIONS `.filter((d) => d.id === "...")` call
   * that have no matching BUSINESS_DECISIONS entry — the filter it backs
   * evaluates to `[]` at runtime, silently dropping the audit-trail link.
   */
  danglingReferencedIds: string[];
}

export function auditDecisionsLinks(input: {
  businessDecisionIds: readonly string[];
  referencedIds: readonly string[];
}): DecisionsLinkAuditResult {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of input.businessDecisionIds) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }

  const danglingReferencedIds = [...new Set(input.referencedIds)]
    .filter((id) => !seen.has(id))
    .sort();

  return {
    duplicateBusinessDecisionIds: [...duplicates].sort(),
    danglingReferencedIds,
  };
}
