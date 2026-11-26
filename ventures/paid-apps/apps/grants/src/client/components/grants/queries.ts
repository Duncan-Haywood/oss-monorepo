// Query keys, response types and hooks for the dashboard + opportunities UI.
// Keys follow the app-wide ["orgs", orgId, <resource>, ...] convention so other modules'
// invalidations (e.g. after an application is created) refresh these views too.
import { ApiError, api, orgApi } from "@client/lib/api";
import type {
  ApplicationDto,
  DocumentDto,
  FollowupDto,
  InterviewDto,
  InterviewTurnDto,
  ListResponse,
  MatchDto,
  OpportunityDto,
  ProjectDto,
  SubmissionDto,
} from "@shared/api/types";
import type {
  ApplicationStatus,
  FactCategory,
  FactStatus,
  InterviewKind,
  MatchStatus,
  OpportunityStatus,
} from "@shared/enums";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";

export function useOrgId(): string {
  const params = useParams({ strict: false }) as { orgId?: string };
  return params.orgId ?? "";
}

export type OpportunityWithMatch = OpportunityDto & { match: MatchDto | null };
export type MatchWithOpportunity = MatchDto & { opportunity: OpportunityDto };
export type ApplicationListItem = ApplicationDto & {
  opportunity: { id: string; title: string; funderName: string; closeDate: string | null } | null;
};
export type SubmissionListItem = SubmissionDto & {
  application: { id: string; title: string } | null;
};
export interface CoverageItem {
  topic: string;
  /** Human label, e.g. "Mission & identity". */
  label?: string;
  factCount: number;
  confirmedCount?: number;
  /** What funders ask about this topic. */
  question?: string;
  status: "missing" | "thin" | "good";
}
export interface FactSummary {
  byStatus: Partial<Record<FactStatus, number>>;
  byCategory: Partial<Record<FactCategory, number>>;
  coverage: CoverageItem[];
}
/** GET /submissions/dashboard (services/submission/dashboard.ts → DashboardData). */
export interface DashboardDeadline {
  applicationId: string;
  title: string;
  status: ApplicationStatus;
  /** ISO date: the application's own deadline, else the opportunity's close date. */
  deadline: string;
  daysLeft: number;
  opportunityId: string;
  funderName: string;
}
export interface DashboardActivity {
  id: string;
  action: string;
  actorType: string;
  createdAt: string;
  targetType: string | null;
  targetId: string | null;
}
export interface DashboardSummary {
  counts: { byStatus: Partial<Record<ApplicationStatus, number>> };
  /** Open applications due within 30 days, soonest first. */
  upcomingDeadlines: DashboardDeadline[];
  /** Number of applications in review. */
  pendingReviews: number;
  awardedCents: number;
  submittedThisMonth: number;
  /** Latest 10 audit-log entries. */
  recentActivity: DashboardActivity[];
}
export interface OpportunityFilters {
  q: string;
  status: OpportunityStatus | "";
  closingWithinDays: string;
}

export const grantKeys = {
  org: (orgId: string) => ["orgs", orgId, "org"] as const,
  dashboard: (orgId: string) => ["orgs", orgId, "submissions", "dashboard"] as const,
  opportunities: (orgId: string) => ["orgs", orgId, "opportunities"] as const,
  opportunityList: (orgId: string, f: OpportunityFilters) =>
    ["orgs", orgId, "opportunities", "list", f] as const,
  opportunity: (orgId: string, id: string) =>
    ["orgs", orgId, "opportunities", "detail", id] as const,
  matches: (orgId: string) => ["orgs", orgId, "matches"] as const,
  applications: (orgId: string) => ["orgs", orgId, "applications"] as const,
  applicationList: (orgId: string) => ["orgs", orgId, "applications", "list", ""] as const,
  submissionList: (orgId: string) => ["orgs", orgId, "submissions", "list"] as const,
  followups: (orgId: string) => ["orgs", orgId, "submissions", "followups", "pending"] as const,
  // Same keys + shapes as components/knowledge/queries.ts so the caches are shared.
  factSummary: (orgId: string) => ["orgs", orgId, "facts", "summary"] as const,
  projects: (orgId: string) => ["orgs", orgId, "projects"] as const,
  documentList: (orgId: string) => ["orgs", orgId, "documents", "list", ""] as const,
  interviewList: (orgId: string) => ["orgs", orgId, "interviews", "list", "all"] as const,
};

const qs = (params: Record<string, string | undefined>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
};

// ---------- reads ----------

export const useOrgSummary = (orgId: string) =>
  useQuery({
    queryKey: grantKeys.org(orgId),
    queryFn: () => api<{ org: { id: string; name: string; slug: string } }>(orgApi(orgId)),
    enabled: !!orgId,
  });

export const useDashboardSummary = (orgId: string) =>
  useQuery({
    queryKey: grantKeys.dashboard(orgId),
    queryFn: () => api<DashboardSummary>(orgApi(orgId, "/submissions/dashboard")),
    enabled: !!orgId,
  });

export const useOpportunities = (orgId: string, f: OpportunityFilters) =>
  useQuery({
    queryKey: grantKeys.opportunityList(orgId, f),
    queryFn: () =>
      api<ListResponse<OpportunityWithMatch>>(
        orgApi(
          orgId,
          `/opportunities${qs({ q: f.q.trim(), status: f.status, closingWithinDays: f.closingWithinDays })}`,
        ),
      ),
    enabled: !!orgId,
    placeholderData: (prev) => prev,
  });

export const useOpportunity = (orgId: string, id: string) =>
  useQuery({
    queryKey: grantKeys.opportunity(orgId, id),
    queryFn: () =>
      api<OpportunityWithMatch>(orgApi(orgId, `/opportunities/${encodeURIComponent(id)}`)),
    enabled: !!orgId && !!id,
  });

export const useMatches = (orgId: string) =>
  useQuery({
    queryKey: grantKeys.matches(orgId),
    queryFn: () => api<ListResponse<MatchWithOpportunity>>(orgApi(orgId, "/matches")),
    enabled: !!orgId,
  });

export const useApplicationList = (orgId: string) =>
  useQuery({
    queryKey: grantKeys.applicationList(orgId),
    queryFn: () => api<ListResponse<ApplicationListItem>>(orgApi(orgId, "/applications")),
    enabled: !!orgId,
  });

export const useSubmissionList = (orgId: string) =>
  useQuery({
    queryKey: grantKeys.submissionList(orgId),
    queryFn: () => api<ListResponse<SubmissionListItem>>(orgApi(orgId, "/submissions")),
    enabled: !!orgId,
  });

export const usePendingFollowups = (orgId: string) =>
  useQuery({
    queryKey: grantKeys.followups(orgId),
    queryFn: () =>
      api<ListResponse<FollowupDto>>(orgApi(orgId, "/submissions/followups?status=pending")),
    enabled: !!orgId,
  });

export const useFactSummary = (orgId: string) =>
  useQuery({
    queryKey: grantKeys.factSummary(orgId),
    queryFn: () => api<FactSummary>(orgApi(orgId, "/facts/summary")),
    enabled: !!orgId,
  });

export const useProjects = (orgId: string) =>
  useQuery({
    queryKey: grantKeys.projects(orgId),
    queryFn: () => api<ListResponse<ProjectDto>>(orgApi(orgId, "/projects")),
    enabled: !!orgId,
  });

export const useDocumentList = (orgId: string) =>
  useQuery({
    queryKey: grantKeys.documentList(orgId),
    queryFn: () => api<ListResponse<DocumentDto>>(orgApi(orgId, "/documents")),
    enabled: !!orgId,
  });

export const useInterviewList = (orgId: string) =>
  useQuery({
    queryKey: grantKeys.interviewList(orgId),
    queryFn: () => api<ListResponse<InterviewDto>>(orgApi(orgId, "/interviews")),
    enabled: !!orgId,
  });

// ---------- writes ----------

export type DraftApplicationInput = {
  opportunityId: string;
  projectId?: string;
  requestedAmountCents?: number;
};

/** POST /applications (starts the drafting pipeline), then open the new application. */
export function useDraftApplication(orgId: string) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (body: DraftApplicationInput) =>
      api<ApplicationDto>(orgApi(orgId, "/applications"), { method: "POST", body }),
    onSuccess: async (app) => {
      void qc.invalidateQueries({ queryKey: grantKeys.applications(orgId) });
      void qc.invalidateQueries({ queryKey: grantKeys.matches(orgId) });
      void qc.invalidateQueries({ queryKey: grantKeys.opportunities(orgId) });
      void qc.invalidateQueries({ queryKey: grantKeys.dashboard(orgId) });
      await navigate({
        to: "/orgs/$orgId/applications/$applicationId",
        params: { orgId, applicationId: app.id },
      });
    },
  });
}

export function useUpdateMatchStatus(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ matchId, status }: { matchId: string; status: MatchStatus }) =>
      api<MatchDto>(orgApi(orgId, `/matches/${encodeURIComponent(matchId)}`), {
        method: "PATCH",
        body: { status },
      }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: grantKeys.opportunities(orgId) }),
        qc.invalidateQueries({ queryKey: grantKeys.matches(orgId) }),
      ]),
  });
}

export function useRescoreMatches(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{ queued: boolean }>(orgApi(orgId, "/matches/rescore"), { method: "POST", body: {} }),
    onSuccess: () => {
      // Scoring runs on the queue; refresh shortly after so new scores show up.
      const refresh = () => {
        void qc.invalidateQueries({ queryKey: grantKeys.opportunities(orgId) });
        void qc.invalidateQueries({ queryKey: grantKeys.matches(orgId) });
      };
      refresh();
      setTimeout(refresh, 5000);
      setTimeout(refresh, 15000);
    },
  });
}

export function useImportOpportunity(orgId: string) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (input: { kind: "url"; url: string } | { kind: "rfp"; file: File }) => {
      if (input.kind === "url") {
        return api<OpportunityDto>(orgApi(orgId, "/imports/opportunity-url"), {
          method: "POST",
          body: { url: input.url },
        });
      }
      const form = new FormData();
      form.set("file", input.file);
      return api<OpportunityDto>(orgApi(orgId, "/imports/rfp"), { method: "POST", body: form });
    },
    onSuccess: async (opp) => {
      void qc.invalidateQueries({ queryKey: grantKeys.opportunities(orgId) });
      void qc.invalidateQueries({ queryKey: grantKeys.matches(orgId) });
      await navigate({
        to: "/orgs/$orgId/opportunities/$opportunityId",
        params: { orgId, opportunityId: opp.id },
      });
    },
  });
}

/**
 * POST /opportunities/:id/confirm-submission-email { email } — vouch for an imported grant's
 * submission address (409 email_changed if it changed since the page loaded).
 */
export function useConfirmSubmissionEmail(orgId: string, opportunityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (email: string) =>
      api<OpportunityWithMatch>(
        orgApi(
          orgId,
          `/opportunities/${encodeURIComponent(opportunityId)}/confirm-submission-email`,
        ),
        { method: "POST", body: { email } },
      ),
    onSuccess: (opp) => {
      qc.setQueryData(grantKeys.opportunity(orgId, opportunityId), opp);
      void qc.invalidateQueries({ queryKey: grantKeys.opportunities(orgId) });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409)
        void qc.invalidateQueries({ queryKey: grantKeys.opportunity(orgId, opportunityId) });
    },
  });
}

/** POST /interviews then open the live session (gap-fill for an application, or a follow-up). */
export function useStartInterview(orgId: string) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { kind: InterviewKind; focusApplicationId?: string }) =>
      api<InterviewDto & { turns: InterviewTurnDto[] }>(orgApi(orgId, "/interviews"), {
        method: "POST",
        body: { ...body },
      }),
    onSuccess: async (interview) => {
      void qc.invalidateQueries({ queryKey: ["orgs", orgId, "interviews"] });
      await navigate({
        to: "/orgs/$orgId/interviews/$interviewId",
        params: { orgId, interviewId: interview.id },
      });
    },
  });
}
