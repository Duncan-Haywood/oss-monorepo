// Current user + memberships (GET /api/me) and the org selected by the :orgId route param.
import type { MemberRole } from "@shared/enums";
import { ROLE_RANK } from "@shared/enums";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { ApiError, api } from "./api";
import { authClient } from "./auth-client";
import { queryClient } from "./query";

export interface Membership {
  orgId: string;
  orgName: string;
  orgSlug: string;
  role: MemberRole;
}
export interface Me {
  user: { id: string; email: string; name: string };
  memberships: Membership[];
  /** Present (true) only for platform admins. */
  isPlatformAdmin?: true;
  /** Present (true) only for throwaway one-click demo visitors (demo deployment). */
  isDemo?: true;
}

export const meQueryKey = ["me"] as const;

/** GET /api/me; resolves to null when signed out (401). */
export async function fetchMe(): Promise<Me | null> {
  try {
    return await api<Me>("/api/me");
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export function useMe() {
  return useQuery({ queryKey: meQueryKey, queryFn: fetchMe, staleTime: 60_000 });
}

/** Refetch /api/me (after sign-in, sign-up, accepting an invite, creating an org). */
export function refreshMe() {
  return queryClient.fetchQuery({ queryKey: meQueryKey, queryFn: fetchMe, staleTime: 0 });
}

export function hasRole(role: MemberRole | null | undefined, min: MemberRole): boolean {
  return role != null && ROLE_RANK[role] >= ROLE_RANK[min];
}

/** The org from the `$orgId` route param, plus the user's membership in it (if any). */
export function useCurrentOrg() {
  const params = useParams({ strict: false }) as { orgId?: string };
  const orgId = params.orgId ?? null;
  const me = useMe();
  const membership = me.data?.memberships.find((m) => m.orgId === orgId) ?? null;
  return {
    orgId,
    membership,
    role: membership?.role ?? null,
    orgName: membership?.orgName ?? null,
    user: me.data?.user ?? null,
    memberships: me.data?.memberships ?? [],
    isLoading: me.isLoading,
    /** e.g. can("editor") before showing an edit button (server still enforces). */
    can: (min: MemberRole) => hasRole(membership?.role, min),
  };
}

/** Sign out, then drop all cached data so the next user sees nothing stale. */
export async function signOut() {
  try {
    await authClient.signOut();
  } finally {
    queryClient.setQueryData(meQueryKey, null);
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== meQueryKey[0] });
  }
}
