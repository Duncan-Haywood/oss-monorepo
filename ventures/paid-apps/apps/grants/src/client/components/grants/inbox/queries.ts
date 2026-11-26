// Triage inbox data: GET /matches/inbox (list + count badge) and POST /matches/bulk (shortlist /
// dismiss one or many, optimistic). Keys live under ["orgs", orgId, "matches"] so invalidating
// grantKeys.matches (e.g. a PATCH from the opportunity page) refreshes the inbox and the badge too.
import { api, orgApi } from "@client/lib/api";
import type {
  BulkMatchResult,
  BulkMatchStatus,
  DismissReason,
  InboxResponse,
} from "@shared/match-triage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { grantKeys } from "../queries";

export const inboxKeys = {
  all: (orgId: string) => [...grantKeys.matches(orgId), "inbox"] as const,
  list: (orgId: string) => [...grantKeys.matches(orgId), "inbox", "list"] as const,
  count: (orgId: string) => [...grantKeys.matches(orgId), "inbox", "count"] as const,
};
const triageKey = (orgId: string) => ["triage-matches", orgId] as const;

export function useInbox(orgId: string) {
  return useQuery({
    queryKey: inboxKeys.list(orgId),
    queryFn: () => api<InboxResponse>(orgApi(orgId, "/matches/inbox")),
    enabled: !!orgId,
  });
}

/** Number of new matches waiting for triage (sidebar badge). undefined while loading or on error. */
export function useInboxCount(orgId: string): number | undefined {
  const q = useQuery({
    queryKey: inboxKeys.count(orgId),
    queryFn: () => api<InboxResponse>(orgApi(orgId, "/matches/inbox?limit=0")),
    enabled: !!orgId,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    select: (d) => d.total,
  });
  return q.data;
}

export interface TriageInput {
  ids: string[];
  status: BulkMatchStatus;
  dismissReason?: DismissReason;
  dismissNote?: string;
}

function withoutIds(data: InboxResponse | undefined, ids: ReadonlySet<string>) {
  if (!data) return data;
  const items = data.items.filter((i) => !ids.has(i.id));
  return { items, total: Math.max(0, data.total - (data.items.length - items.length)) };
}

/**
 * Shortlist or dismiss matches. Removes them from the cached inbox (and badge) at once; restores
 * the snapshot if the request fails. Refetches once the last in-flight triage settles, so rapid
 * j/s/d triage never flickers items back in.
 */
export function useTriageMatches(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: triageKey(orgId),
    mutationFn: (input: TriageInput) =>
      api<BulkMatchResult>(orgApi(orgId, "/matches/bulk"), {
        method: "POST",
        body: { ...input },
      }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: inboxKeys.all(orgId) });
      const prevList = qc.getQueryData<InboxResponse>(inboxKeys.list(orgId));
      const prevCount = qc.getQueryData<InboxResponse>(inboxKeys.count(orgId));
      const ids = new Set(input.ids);
      qc.setQueryData<InboxResponse>(inboxKeys.list(orgId), (d) => withoutIds(d, ids));
      if (prevCount) {
        qc.setQueryData<InboxResponse>(inboxKeys.count(orgId), {
          items: [],
          total: Math.max(0, prevCount.total - ids.size),
        });
      }
      return { prevList, prevCount };
    },
    onError: (_err, _input, snapshot) => {
      if (snapshot?.prevList) qc.setQueryData(inboxKeys.list(orgId), snapshot.prevList);
      if (snapshot?.prevCount) qc.setQueryData(inboxKeys.count(orgId), snapshot.prevCount);
    },
    onSettled: () => {
      // This mutation still counts as in flight here.
      if (qc.isMutating({ mutationKey: triageKey(orgId) }) > 1) return;
      void qc.invalidateQueries({ queryKey: grantKeys.matches(orgId) });
      void qc.invalidateQueries({ queryKey: grantKeys.opportunities(orgId) });
    },
  });
}
