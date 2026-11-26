// GET /api/orgs/:orgId/guide: the getting-started checklist, computed from the org's data.
import { api, orgApi } from "@client/lib/api";
import type { GuideDto } from "@shared/guide";
import { useQuery } from "@tanstack/react-query";

export const guideKey = (orgId: string) => ["orgs", orgId, "guide"] as const;

export function useGuide(orgId: string | null | undefined) {
  return useQuery({
    queryKey: guideKey(orgId ?? ""),
    queryFn: () => api<GuideDto>(orgApi(orgId ?? "", "/guide")),
    enabled: Boolean(orgId),
    // Progress comes from everyone's edits in other views; keep it fresh but cheap.
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}
