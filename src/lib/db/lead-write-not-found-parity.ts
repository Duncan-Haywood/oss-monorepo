/**
 * Structural guard: db.ts's SQLite fallback for a lead-mutation helper must
 * behave the same as its convex/leads.ts twin when the row does not exist.
 *
 * convex/leads.ts's updateStage and recordOutreach mutations both throw
 * `Lead with slug ${slug} not found` on an unknown slug (see
 * convex/leads.ts:88-90 and :203-205). A bare SQLite
 * `UPDATE ... WHERE slug = ?` matches zero rows and returns normally instead
 * of throwing, so without an explicit existence check the two backends
 * silently diverged: Convex threw while SQLite no-op'd and reported success
 * — the same "silent no-op on an unknown id" bug class AGENT_PROTOCOL
 * documents for update-lead-stage-action-existence-check, except one layer
 * lower (inside db.ts's own SQLite fallback, not the dashboard action that
 * calls it). Every sibling lead-mutation helper in db.ts (updateLeadNotes,
 * updateLeadSnooze, applyColdLeadDisposition) already throws the same way,
 * so updateLeadStage/recordLeadOutreach were the odd ones out.
 *
 * Exists so Vitest can lock the invariant without importing the
 * `"server-only"` db module (see convex-api-map-audit.ts for the sibling
 * pattern this file follows).
 */

/**
 * Extract the source text of a top-level `export async function NAME(...)`
 * declaration, from its `export` keyword up to (but not including) the next
 * top-level `export` declaration. Good enough for db.ts's flat sequence of
 * exported functions — it does not attempt real brace matching.
 */
export function extractExportedFunctionSource(
  source: string,
  functionName: string,
): string {
  const marker = `export async function ${functionName}(`;
  const start = source.indexOf(marker);
  if (start === -1) {
    throw new Error(
      `Could not find "export async function ${functionName}(" in source`,
    );
  }
  const rest = source.slice(start);
  const nextExportOffset = rest
    .slice(marker.length)
    .search(/\nexport (async function|function|const|interface|type)\b/);
  return nextExportOffset === -1
    ? rest
    : rest.slice(0, marker.length + nextExportOffset);
}

/**
 * True when a function's source throws (rather than silently no-ops) after
 * finding no matching row — the `if (!existing) { throw new Error(...) }`
 * pattern every other lead-mutation SQLite fallback in db.ts already uses.
 */
export function throwsBeforeWrite(functionSource: string): boolean {
  return /if\s*\(!existing\)\s*\{\s*throw new Error/.test(functionSource);
}
