// Query keys, reads and mutations for applications, reviews and submissions.
// Keys follow the app-wide ["orgs", orgId, <resource>, ...] convention (see grants/queries.ts), so
// invalidating ["orgs", orgId, "applications"] also refreshes the dashboard's application list.
import { ApiError, api, orgApi } from "@client/lib/api";
import type { FlagDto, InterviewDto, SubmissionDto } from "@shared/api/types";
import type { Paragraph } from "@shared/content";
import type { ApplicationStatus, FollowupStatus, ReviewDecision } from "@shared/enums";
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { isBusy } from "./model";
import type {
  ApplicationDetail,
  ApplicationListItem,
  CostSummary,
  FeedbackItem,
  FollowupListItem,
  PackageIntegrity,
  ReviewQueueItem,
  SubmissionListItem,
} from "./types";

export const POLL_MS = 3000;

const enc = encodeURIComponent;

export const appKeys = {
  all: (orgId: string) => ["orgs", orgId, "applications"] as const,
  /** status "" = all (same key + shape as grants/queries applicationList). */
  list: (orgId: string, status: string) => ["orgs", orgId, "applications", "list", status] as const,
  detail: (orgId: string, id: string) => ["orgs", orgId, "applications", "detail", id] as const,
  cost: (orgId: string, id: string) =>
    ["orgs", orgId, "applications", "detail", id, "cost"] as const,
  reviews: (orgId: string) => ["orgs", orgId, "reviews"] as const,
  queue: (orgId: string) => ["orgs", orgId, "reviews", "queue"] as const,
  feedback: (orgId: string, id: string) => ["orgs", orgId, "reviews", "feedback", id] as const,
  submissions: (orgId: string) => ["orgs", orgId, "submissions"] as const,
  submissionList: (orgId: string) => ["orgs", orgId, "submissions", "list"] as const,
  followups: (orgId: string, status: FollowupStatus | "all") =>
    ["orgs", orgId, "submissions", "followups", status] as const,
  integrity: (orgId: string, submissionId: string) =>
    ["orgs", orgId, "submissions", "integrity", submissionId] as const,
};

/** Everything an application state change can affect. */
function invalidateApplication(qc: QueryClient, orgId: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: appKeys.all(orgId) }),
    qc.invalidateQueries({ queryKey: appKeys.reviews(orgId) }),
    qc.invalidateQueries({ queryKey: appKeys.submissions(orgId) }),
    qc.invalidateQueries({ queryKey: ["orgs", orgId, "matches"] }),
  ]);
}

// ---------- reads ----------

export function useApplications(orgId: string, status: string) {
  return useQuery({
    queryKey: appKeys.list(orgId, status),
    queryFn: () =>
      api<{ items: ApplicationListItem[] }>(
        orgApi(orgId, `/applications${status ? `?status=${enc(status)}` : ""}`),
      ),
    enabled: !!orgId,
    placeholderData: (prev) => prev,
    refetchInterval: (q) => (q.state.data?.items.some((a) => isBusy(a.status)) ? POLL_MS : false),
  });
}

/** Keep polling while the pipeline works, or while an approval is being submitted. */
export function detailPollInterval(d: ApplicationDetail | undefined): number | false {
  if (!d) return false;
  if (isBusy(d.status)) return POLL_MS;
  if (d.status === "approved" && !d.lastError && d.submissions.length === 0) return POLL_MS;
  return false;
}

export function useApplication(orgId: string, id: string) {
  return useQuery({
    queryKey: appKeys.detail(orgId, id),
    queryFn: () => api<ApplicationDetail>(orgApi(orgId, `/applications/${enc(id)}`)),
    enabled: !!orgId && !!id,
    refetchInterval: (q) => detailPollInterval(q.state.data),
  });
}

export function useApplicationCost(orgId: string, id: string, status?: ApplicationStatus) {
  return useQuery({
    queryKey: appKeys.cost(orgId, id),
    queryFn: () => api<CostSummary>(orgApi(orgId, `/applications/${enc(id)}/cost`)),
    enabled: !!orgId && !!id,
    refetchInterval: status && isBusy(status) ? POLL_MS * 2 : false,
  });
}

export function useReviewQueue(orgId: string) {
  return useQuery({
    queryKey: appKeys.queue(orgId),
    queryFn: () => api<{ items: ReviewQueueItem[] }>(orgApi(orgId, "/reviews/queue")),
    enabled: !!orgId,
  });
}

export function useFeedback(orgId: string, id: string) {
  return useQuery({
    queryKey: appKeys.feedback(orgId, id),
    queryFn: () => api<{ items: FeedbackItem[] }>(orgApi(orgId, `/reviews/${enc(id)}/feedback`)),
    enabled: !!orgId && !!id,
  });
}

export function useSubmissions(orgId: string) {
  return useQuery({
    queryKey: appKeys.submissionList(orgId),
    queryFn: () => api<{ items: SubmissionListItem[] }>(orgApi(orgId, "/submissions")),
    enabled: !!orgId,
  });
}

export function useFollowups(orgId: string, status: FollowupStatus | "all") {
  return useQuery({
    queryKey: appKeys.followups(orgId, status),
    queryFn: () =>
      api<{ items: FollowupListItem[] }>(
        orgApi(orgId, `/submissions/followups${status === "all" ? "" : `?status=${status}`}`),
      ),
    enabled: !!orgId,
    placeholderData: (prev) => prev,
  });
}

export const packageUrl = (
  orgId: string,
  submissionId: string,
  opts: { format?: "json" | "md"; download?: boolean } = {},
) => {
  const sp = new URLSearchParams();
  if (opts.format === "md") sp.set("format", "md");
  if (opts.download) sp.set("download", "1");
  const q = sp.toString();
  return orgApi(orgId, `/submissions/${enc(submissionId)}/package${q ? `?${q}` : ""}`);
};

/** GET the JSON package and read the server's X-Package-Integrity check (sha256 re-computed). */
export async function fetchPackageIntegrity(
  orgId: string,
  submissionId: string,
): Promise<{ integrity: PackageIntegrity; sha256: string | null }> {
  const res = await fetch(packageUrl(orgId, submissionId), {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    let code = "http_error";
    let message = res.statusText || "Couldn't load the package";
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, code, message);
  }
  const header = res.headers.get("X-Package-Integrity");
  return {
    integrity: header === "verified" || header === "mismatch" ? header : "unknown",
    sha256: res.headers.get("X-Package-Sha256"),
  };
}

export function usePackageIntegrity(orgId: string, submissionId: string) {
  return useQuery({
    queryKey: appKeys.integrity(orgId, submissionId),
    queryFn: () => fetchPackageIntegrity(orgId, submissionId),
    enabled: !!orgId && !!submissionId,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

// ---------- writes ----------

export function useReviewDecision(orgId: string, applicationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { decision: ReviewDecision; comments?: string }) =>
      api<ApplicationDetail>(orgApi(orgId, `/reviews/${enc(applicationId)}/decision`), {
        method: "POST",
        body,
      }),
    onSettled: () => invalidateApplication(qc, orgId),
  });
}

export function useResolveFlag(orgId: string, applicationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ flagId, resolution }: { flagId: string; resolution: string }) =>
      api<FlagDto>(
        orgApi(orgId, `/applications/${enc(applicationId)}/flags/${enc(flagId)}/resolve`),
        { method: "POST", body: { resolution } },
      ),
    onSuccess: () => invalidateApplication(qc, orgId),
  });
}

export function useEditSection(orgId: string, applicationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sectionKey, paragraphs }: { sectionKey: string; paragraphs: Paragraph[] }) =>
      api<ApplicationDetail>(
        orgApi(orgId, `/applications/${enc(applicationId)}/sections/${enc(sectionKey)}`),
        { method: "PATCH", body: { paragraphs } },
      ),
    onSuccess: () => invalidateApplication(qc, orgId),
  });
}

export function useRegenerate(orgId: string, applicationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { sectionKey?: string; instructions?: string }) =>
      api<ApplicationDetail>(orgApi(orgId, `/applications/${enc(applicationId)}/regenerate`), {
        method: "POST",
        body,
      }),
    onSettled: () => invalidateApplication(qc, orgId),
  });
}

export function useAddFeedback(orgId: string, applicationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { rating: number; comment?: string; sectionKey?: string | null }) =>
      api<FeedbackItem>(orgApi(orgId, `/reviews/${enc(applicationId)}/feedback`), {
        method: "POST",
        body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: appKeys.feedback(orgId, applicationId) }),
  });
}

export function useRecordOutcome(orgId: string, applicationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      outcome: "awarded" | "declined";
      awardedAmountCents?: number;
      notes?: string;
    }) =>
      api<ApplicationDetail>(orgApi(orgId, `/applications/${enc(applicationId)}/outcome`), {
        method: "POST",
        body,
      }),
    onSuccess: () => invalidateApplication(qc, orgId),
  });
}

export function useConfirmSubmission(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ submissionId, externalRef }: { submissionId: string; externalRef?: string }) =>
      api<SubmissionDto>(orgApi(orgId, `/submissions/${enc(submissionId)}/confirm`), {
        method: "POST",
        body: externalRef ? { externalRef } : {},
      }),
    onSuccess: () => invalidateApplication(qc, orgId),
  });
}

export function useUpdateFollowup(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; status?: FollowupStatus; notes?: string }) =>
      api<FollowupListItem>(orgApi(orgId, `/submissions/followups/${enc(id)}`), {
        method: "PATCH",
        body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: appKeys.submissions(orgId) }),
  });
}

/**
 * Start a gap-fill interview focused on this application and open it. Falls back to a follow-up
 * interview if the backend rejects gap_fill (older deployments).
 */
export function useGapFillInterview(orgId: string) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (applicationId: string) => {
      const start = (kind: "gap_fill" | "follow_up") =>
        api<InterviewDto>(orgApi(orgId, "/interviews"), {
          method: "POST",
          body: { kind, focusApplicationId: applicationId },
        });
      try {
        return await start("gap_fill");
      } catch (e) {
        if (e instanceof ApiError && (e.status === 400 || e.status === 422)) {
          return start("follow_up");
        }
        throw e;
      }
    },
    onSuccess: async (interview) => {
      void qc.invalidateQueries({ queryKey: ["orgs", orgId, "interviews"] });
      await navigate({
        to: "/orgs/$orgId/interviews/$interviewId",
        params: { orgId, interviewId: interview.id },
      });
    },
  });
}
