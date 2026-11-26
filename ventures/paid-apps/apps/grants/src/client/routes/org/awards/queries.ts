// Reads and mutations for /awards (post-award reporting). Keys follow the app-wide
// ["orgs", orgId, <resource>, ...] convention; any change invalidates the whole "awards" subtree
// plus follow-ups (report reminders show on the submissions page).
import { api, orgApi } from "@client/lib/api";
import type {
  AwardDetail,
  AwardListItem,
  AwardReportDetail,
  AwardReportKind,
} from "@shared/api/awards";
import type { Paragraph } from "@shared/content";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const enc = encodeURIComponent;

export const awardKeys = {
  all: (orgId: string) => ["orgs", orgId, "awards"] as const,
  list: (orgId: string) => ["orgs", orgId, "awards", "list"] as const,
  detail: (orgId: string, id: string) => ["orgs", orgId, "awards", "detail", id] as const,
  report: (orgId: string, awardId: string, reportId: string) =>
    ["orgs", orgId, "awards", "detail", awardId, "report", reportId] as const,
};

export const awardPath = (orgId: string, awardId: string) =>
  `/orgs/${enc(orgId)}/awards/${enc(awardId)}`;
export const reportApi = (orgId: string, awardId: string, reportId: string, rest = "") =>
  orgApi(orgId, `/awards/${enc(awardId)}/reports/${enc(reportId)}${rest}`);

export function useAwards(orgId: string) {
  return useQuery({
    queryKey: awardKeys.list(orgId),
    queryFn: () => api<{ items: AwardListItem[] }>(orgApi(orgId, "/awards")),
    enabled: !!orgId,
  });
}

export function useAward(orgId: string, awardId: string) {
  return useQuery({
    queryKey: awardKeys.detail(orgId, awardId),
    queryFn: () => api<AwardDetail>(orgApi(orgId, `/awards/${enc(awardId)}`)),
    enabled: !!orgId && !!awardId,
  });
}

export function useReport(orgId: string, awardId: string, reportId: string | null) {
  return useQuery({
    queryKey: awardKeys.report(orgId, awardId, reportId ?? ""),
    queryFn: () => api<AwardReportDetail>(reportApi(orgId, awardId, reportId ?? "")),
    enabled: !!orgId && !!awardId && !!reportId,
  });
}

function useInvalidate(orgId: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: awardKeys.all(orgId) }),
      qc.invalidateQueries({ queryKey: ["orgs", orgId, "submissions"] }),
    ]);
}

export interface AwardTermsPatch {
  startDate?: string | null;
  endDate?: string | null;
  grantNumber?: string | null;
  termsNotes?: string;
}

export function useUpdateAward(orgId: string, awardId: string) {
  const invalidate = useInvalidate(orgId);
  return useMutation({
    mutationFn: (body: AwardTermsPatch) =>
      api<AwardDetail>(orgApi(orgId, `/awards/${enc(awardId)}`), {
        method: "PATCH",
        body: { ...body },
      }),
    onSuccess: invalidate,
  });
}

export interface ReportPatch {
  kind?: AwardReportKind;
  periodStart?: string;
  periodEnd?: string;
  dueDate?: string;
  section?: { key: string; paragraphs: Paragraph[] };
}

export function useUpdateReport(orgId: string, awardId: string, reportId: string) {
  const invalidate = useInvalidate(orgId);
  return useMutation({
    mutationFn: (body: ReportPatch) =>
      api<AwardReportDetail>(reportApi(orgId, awardId, reportId), {
        method: "PATCH",
        body: { ...body },
      }),
    onSuccess: invalidate,
  });
}

export function useDraftReport(orgId: string, awardId: string, reportId: string) {
  const invalidate = useInvalidate(orgId);
  return useMutation({
    mutationFn: () =>
      api<AwardReportDetail>(reportApi(orgId, awardId, reportId, "/draft"), { method: "POST" }),
    onSuccess: invalidate,
  });
}

export function useSubmitReport(orgId: string, awardId: string, reportId: string) {
  const invalidate = useInvalidate(orgId);
  return useMutation({
    mutationFn: (externalRef: string) =>
      api<AwardReportDetail>(reportApi(orgId, awardId, reportId, "/submit"), {
        method: "POST",
        body: externalRef.trim() ? { externalRef: externalRef.trim() } : {},
      }),
    onSuccess: invalidate,
  });
}
