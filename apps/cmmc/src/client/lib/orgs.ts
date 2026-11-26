// The organization picker's value is DOM text. The id the app keeps (and puts into every
// /api/orgs/{id}/... link) is taken from the signed-in user's own memberships, never from that text.
import type { Me } from "./types";

/** The membership id equal to `value`, or null when the value names no org this user belongs to. */
export function membershipId(memberships: Me["memberships"], value: string): string | null {
  return memberships.find((m) => m.id === value)?.id ?? null;
}
