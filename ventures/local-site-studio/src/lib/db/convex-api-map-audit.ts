/**
 * Pure helpers for auditing the static Convex API map in src/lib/db.ts against
 * every public query/mutation export under convex/*.ts.
 *
 * A missing map registration throws at call time, gets swallowed by the
 * Convex→SQLite fallback catch, and produces a multi-instance split-brain.
 * This module exists so Vitest can lock that invariant without importing the
 * server-only db module.
 */

/** Deliberately unregistered — dead code superseded by leads.markLeadPaid. */
export const DELIBERATE_CONVEX_API_ORPHANS = ["orders:createOrder"] as const;

export type ConvexApiMapAuditResult = {
  defined: string[];
  registered: string[];
  /** Defined public functions not on the static map (excluding deliberate orphans). */
  missingFromMap: string[];
  /** Map entries that have no matching convex/*.ts export. */
  registeredButUndefined: string[];
  /** Defined but intentionally left unregistered. */
  deliberateOrphansPresent: string[];
  /** Listed as deliberate orphans but no longer defined in convex/*.ts. */
  staleDeliberateOrphans: string[];
};

const PUBLIC_FN =
  /export const (\w+)\s*=\s*(query|mutation)\s*\(/g;

/**
 * Extract `module:exportName` keys from a convex/*.ts source file.
 * Internal helpers (internalQuery / internalMutation / action) are ignored —
 * the static map only covers public query/mutation call sites from db.ts.
 */
export function listPublicConvexExports(
  moduleName: string,
  source: string,
): string[] {
  const keys: string[] = [];
  for (const match of source.matchAll(PUBLIC_FN)) {
    const name = match[1];
    if (!name) continue;
    keys.push(`${moduleName}:${name}`);
  }
  return keys;
}

/**
 * Extract registered `module:exportName` values from the `const api: any = {…}`
 * block in src/lib/db.ts.
 */
export function listRegisteredConvexApiPaths(dbSource: string): string[] {
  const block = dbSource.match(/const api:\s*any\s*=\s*\{([\s\S]*?)\n\};/);
  if (!block?.[1]) {
    throw new Error("Could not locate static Convex API map (const api: any = {…}) in db.ts");
  }
  return [...block[1].matchAll(/:\s*"([^"]+)"/g)].map((m) => m[1]!).filter(Boolean);
}

export function auditConvexApiMap(input: {
  defined: readonly string[];
  registered: readonly string[];
  deliberateOrphans?: readonly string[];
}): ConvexApiMapAuditResult {
  const deliberate = new Set(
    input.deliberateOrphans ?? DELIBERATE_CONVEX_API_ORPHANS,
  );
  const definedSet = new Set(input.defined);
  const registeredSet = new Set(input.registered);

  const missingFromMap = [...definedSet]
    .filter((k) => !registeredSet.has(k) && !deliberate.has(k))
    .sort();
  const registeredButUndefined = [...registeredSet]
    .filter((k) => !definedSet.has(k))
    .sort();
  const deliberateOrphansPresent = [...deliberate]
    .filter((k) => definedSet.has(k))
    .sort();
  const staleDeliberateOrphans = [...deliberate]
    .filter((k) => !definedSet.has(k))
    .sort();

  return {
    defined: [...definedSet].sort(),
    registered: [...registeredSet].sort(),
    missingFromMap,
    registeredButUndefined,
    deliberateOrphansPresent,
    staleDeliberateOrphans,
  };
}
