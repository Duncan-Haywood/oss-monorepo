/**
 * Operator Assign-project input bounds for Vercel project ids.
 *
 * Auth-gated dashboard actions still need finite client-input ceilings —
 * requireOperatorAuth is not a payload-size throttle, and soft-cap/truncate
 * would change the opaque project id handed to Domains API provisioning.
 */

export const MAX_VERCEL_PROJECT_ID_LENGTH = 100;

/**
 * Trim + hard-reject over-long vercelProjectId. Returns null for blank /
 * whitespace-only (clear dedicated project) OR over-long input — callers
 * distinguish over-long via `raw.trim().length > 0` when null.
 */
export function parseVercelProjectId(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length > MAX_VERCEL_PROJECT_ID_LENGTH) {
    return null;
  }
  return trimmed || null;
}
