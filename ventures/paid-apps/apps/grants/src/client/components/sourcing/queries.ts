// Query keys + hooks for the grant sourcing UI (funder watchlist, watch events, foundation prospects).
// Keys follow the app-wide ["orgs", orgId, <resource>, ...] convention.
import { api, orgApi } from "@client/lib/api";
import type { ListResponse } from "@shared/api/types";
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateWatchSourceInput,
  ProspectItem,
  ProspectListResponse,
  UpdateProspectInput,
  WatchEventDto,
  WatchSourceDto,
  WatchSourceStatus,
} from "./types";

export const sourcingKeys = {
  watchlist: (orgId: string) => ["orgs", orgId, "watchlist"] as const,
  watchlistSources: (orgId: string) => ["orgs", orgId, "watchlist", "sources"] as const,
  watchlistEvents: (orgId: string) => ["orgs", orgId, "watchlist", "events"] as const,
  prospects: (orgId: string) => ["orgs", orgId, "prospects"] as const,
  prospectList: (orgId: string) => ["orgs", orgId, "prospects", "list"] as const,
  opportunities: (orgId: string) => ["orgs", orgId, "opportunities"] as const,
};

const enc = encodeURIComponent;

/** Background work (checks, refreshes) lands a few seconds later; refetch a couple of times. */
function refreshSoon(qc: QueryClient, keys: readonly (readonly unknown[])[]) {
  const run = () => {
    for (const queryKey of keys) void qc.invalidateQueries({ queryKey });
  };
  run();
  setTimeout(run, 5_000);
  setTimeout(run, 15_000);
}

// ---------- watchlist ----------

export const useWatchlist = (orgId: string) =>
  useQuery({
    queryKey: sourcingKeys.watchlistSources(orgId),
    queryFn: () => api<ListResponse<WatchSourceDto>>(orgApi(orgId, "/watchlist")),
    enabled: !!orgId,
  });

export const useWatchEvents = (orgId: string) =>
  useQuery({
    queryKey: sourcingKeys.watchlistEvents(orgId),
    queryFn: () => api<ListResponse<WatchEventDto>>(orgApi(orgId, "/watchlist/events")),
    enabled: !!orgId,
  });

export function useAddWatchSource(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateWatchSourceInput) =>
      api<WatchSourceDto>(orgApi(orgId, "/watchlist"), { method: "POST", body: { ...body } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: sourcingKeys.watchlist(orgId) }),
  });
}

export function useSetWatchSourceStatus(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: Extract<WatchSourceStatus, "active" | "paused">;
    }) =>
      api<WatchSourceDto>(orgApi(orgId, `/watchlist/${enc(id)}`), {
        method: "PATCH",
        body: { status },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: sourcingKeys.watchlist(orgId) }),
  });
}

export function useRemoveWatchSource(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(orgApi(orgId, `/watchlist/${enc(id)}`), { method: "DELETE" }),
    onSuccess: (_data, id) => {
      qc.setQueryData<ListResponse<WatchSourceDto>>(sourcingKeys.watchlistSources(orgId), (prev) =>
        prev ? { ...prev, items: prev.items.filter((s) => s.id !== id) } : prev,
      );
      return qc.invalidateQueries({ queryKey: sourcingKeys.watchlist(orgId) });
    },
  });
}

/** POST /watchlist/:id/check — 429 when the page was checked too recently. */
export function useCheckWatchSource(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<unknown>(orgApi(orgId, `/watchlist/${enc(id)}/check`), { method: "POST", body: {} }),
    onSuccess: () =>
      refreshSoon(qc, [sourcingKeys.watchlist(orgId), sourcingKeys.opportunities(orgId)]),
  });
}

// ---------- prospects ----------

export const useProspects = (orgId: string) =>
  useQuery({
    queryKey: sourcingKeys.prospectList(orgId),
    queryFn: () => api<ProspectListResponse>(orgApi(orgId, "/prospects")),
    enabled: !!orgId,
  });

/** POST /prospects/refresh (202): re-scan 990-PF data in the background. */
export function useRefreshProspects(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<unknown>(orgApi(orgId, "/prospects/refresh"), { method: "POST", body: {} }),
    onSuccess: () => refreshSoon(qc, [sourcingKeys.prospects(orgId)]),
  });
}

/** PATCH /prospects/:id with an optimistic update (rolled back on error). */
export function useUpdateProspect(orgId: string) {
  const qc = useQueryClient();
  const key = sourcingKeys.prospectList(orgId);
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateProspectInput }) =>
      api<ProspectItem>(orgApi(orgId, `/prospects/${enc(id)}`), {
        method: "PATCH",
        body: { ...patch },
      }),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ProspectListResponse>(key);
      qc.setQueryData<ProspectListResponse>(key, (prev) =>
        prev
          ? { ...prev, items: prev.items.map((p) => (p.id === id ? { ...p, ...patch } : p)) }
          : prev,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
    },
    onSuccess: (updated, { id }) => {
      // Keep the joined funder profile from the list if the PATCH returns only prospect fields.
      if (updated && typeof updated === "object" && "id" in updated) {
        qc.setQueryData<ProspectListResponse>(key, (prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.map((p) => (p.id === id ? { ...p, ...updated } : p)),
              }
            : prev,
        );
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: sourcingKeys.prospects(orgId) }),
  });
}
