// Reads and mutations for the funder rubric report (GET/POST /applications/:id/quality…).
// The key sits under the application's detail key, so invalidating the application refreshes it.
import { ApiError, api, orgApi } from "@client/lib/api";
import type { ApplicationDto } from "@shared/api/types";
import type { QualityReportDto } from "@shared/quality";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { appKeys, POLL_MS } from "./queries";

const enc = encodeURIComponent;

/** Stop polling for a missing / outdated report after about two minutes. */
const MAX_POLLS = 24;

export const qualityKey = (orgId: string, applicationId: string) =>
  [...appKeys.detail(orgId, applicationId), "quality"] as const;

/** The report, or null while none exists yet (404). Polls until the current version is scored. */
export function useQualityReport(
  orgId: string,
  applicationId: string,
  currentVersionId: string | null,
) {
  return useQuery({
    queryKey: [...qualityKey(orgId, applicationId), currentVersionId ?? ""],
    queryFn: async () => {
      try {
        return await api<QualityReportDto>(
          orgApi(orgId, `/applications/${enc(applicationId)}/quality`),
        );
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    enabled: !!orgId && !!applicationId && !!currentVersionId,
    refetchInterval: (q) =>
      q.state.data?.current || q.state.dataUpdateCount >= MAX_POLLS || q.state.error
        ? false
        : POLL_MS * 2,
  });
}

export function useApplyQuality(orgId: string, applicationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { sectionKey: string; suggestionIds: string[] }) =>
      api<ApplicationDto>(orgApi(orgId, `/applications/${enc(applicationId)}/quality/apply`), {
        method: "POST",
        body,
      }),
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: appKeys.all(orgId) }),
        qc.invalidateQueries({ queryKey: appKeys.reviews(orgId) }),
      ]),
  });
}

/** Ask missing-evidence questions in a gap-fill interview, then open it. */
export function useQualityInterview(orgId: string, applicationId: string) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (suggestionIds: string[]) =>
      api<{ interviewId: string; questions: number }>(
        orgApi(orgId, `/applications/${enc(applicationId)}/quality/interview`),
        { method: "POST", body: { suggestionIds } },
      ),
    onSuccess: async (r) => {
      void qc.invalidateQueries({ queryKey: ["orgs", orgId, "interviews"] });
      await navigate({
        to: "/orgs/$orgId/interviews/$interviewId",
        params: { orgId, interviewId: r.interviewId },
      });
    },
  });
}
