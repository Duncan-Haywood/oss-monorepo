// Query keys + hooks for the knowledge base (documents, facts, search, projects).
import { api, orgApi } from "@client/lib/api";
import type {
  ChunkDto,
  DocumentDto,
  FactDto,
  InterviewDto,
  InterviewTurnDto,
  ListResponse,
  ProjectDto,
} from "@shared/api/types";
import type {
  DocumentKind,
  FactCategory,
  FactStatus,
  InterviewKind,
  Sensitivity,
} from "@shared/enums";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { isDocumentBusy } from "./labels";

export function useOrgId(): string {
  const params = useParams({ strict: false }) as { orgId?: string };
  return params.orgId ?? "";
}

export const kbKeys = {
  documents: (orgId: string) => ["orgs", orgId, "documents"] as const,
  documentList: (orgId: string, kind: string) =>
    ["orgs", orgId, "documents", "list", kind] as const,
  document: (orgId: string, id: string) => ["orgs", orgId, "documents", "detail", id] as const,
  facts: (orgId: string) => ["orgs", orgId, "facts"] as const,
  factList: (orgId: string, f: FactFilters) => ["orgs", orgId, "facts", "list", f] as const,
  factSummary: (orgId: string) => ["orgs", orgId, "facts", "summary"] as const,
  fact: (orgId: string, id: string) => ["orgs", orgId, "facts", "detail", id] as const,
  projects: (orgId: string) => ["orgs", orgId, "projects"] as const,
  project: (orgId: string, id: string) => ["orgs", orgId, "projects", "detail", id] as const,
};

export type DocumentDetail = DocumentDto & { chunks: ChunkDto[]; facts: FactDto[] };
export type ProjectDetail = ProjectDto & { facts: FactDto[] };
export type ProjectListItem = ProjectDto & { factCount?: number };
export interface FactFilters {
  /** One status, a CSV list (the API accepts both), or "" for every non-superseded fact. */
  status?: FactStatus | "" | (string & {});
  category?: FactCategory | "";
  q?: string;
}
/** GET /facts/summary coverage item (services/knowledge/checklist.ts). */
export interface CoverageItem {
  topic: string;
  /** Human label, e.g. "Mission & identity". */
  label: string;
  factCount: number;
  confirmedCount: number;
  /** What funders ask about this topic. */
  question: string;
  status: "missing" | "thin" | "good";
}
export interface FactSummary {
  byStatus: Partial<Record<FactStatus, number>>;
  byCategory: Partial<Record<FactCategory, number>>;
  coverage: CoverageItem[];
}
/** POST /search item (services/retrieval RetrievedChunk). */
export interface SearchHit {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  documentKind: DocumentKind;
  heading: string | null;
  text: string;
  /** Fused relevance in 0..1. */
  score: number;
}

const qs = (params: Record<string, string | undefined>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
};

// ---------- documents ----------

export function useDocuments(orgId: string, kind = "") {
  return useQuery({
    queryKey: kbKeys.documentList(orgId, kind),
    queryFn: () => api<ListResponse<DocumentDto>>(orgApi(orgId, `/documents${qs({ kind })}`)),
    enabled: !!orgId,
    refetchInterval: (q) =>
      q.state.data?.items.some((d) => isDocumentBusy(d.status)) ? 3000 : false,
  });
}

export function useDocument(orgId: string, id: string) {
  return useQuery({
    queryKey: kbKeys.document(orgId, id),
    queryFn: () => api<DocumentDetail>(orgApi(orgId, `/documents/${encodeURIComponent(id)}`)),
    enabled: !!orgId && !!id,
    refetchInterval: (q) => (q.state.data && isDocumentBusy(q.state.data.status) ? 3000 : false),
  });
}

export function useInvalidateKnowledge() {
  const qc = useQueryClient();
  return (orgId: string) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: kbKeys.documents(orgId) }),
      qc.invalidateQueries({ queryKey: kbKeys.facts(orgId) }),
      qc.invalidateQueries({ queryKey: kbKeys.projects(orgId) }),
    ]);
}

// ---------- facts ----------

export function useFacts(orgId: string, filters: FactFilters) {
  return useQuery({
    queryKey: kbKeys.factList(orgId, filters),
    queryFn: () =>
      api<ListResponse<FactDto>>(
        orgApi(
          orgId,
          `/facts${qs({ status: filters.status, category: filters.category, q: filters.q })}`,
        ),
      ),
    enabled: !!orgId,
    placeholderData: (prev) => prev,
  });
}

/** GET /facts/:id — used to show a deep-linked fact even when it's outside the current filter. */
export function useFact(orgId: string, id: string | undefined) {
  return useQuery({
    queryKey: kbKeys.fact(orgId, id ?? ""),
    queryFn: () => api<FactDto>(orgApi(orgId, `/facts/${encodeURIComponent(id ?? "")}`)),
    enabled: !!orgId && !!id,
  });
}

export function useFactSummary(orgId: string) {
  return useQuery({
    queryKey: kbKeys.factSummary(orgId),
    queryFn: () => api<FactSummary>(orgApi(orgId, "/facts/summary")),
    enabled: !!orgId,
  });
}

export interface FactPatch {
  statement?: string;
  category?: FactCategory;
  asOf?: string | null;
}
export interface NewFact {
  category: FactCategory;
  statement: string;
  asOf?: string;
  projectId?: string;
  sensitivity?: Sensitivity;
}

/** Mutations for fact cards (confirm / reject / edit / bulk-confirm / create). */
export function useFactActions(orgId: string) {
  const invalidate = useInvalidateKnowledge();
  const onSuccess = () => invalidate(orgId);
  const confirm = useMutation({
    mutationFn: (id: string) =>
      api<FactDto>(orgApi(orgId, `/facts/${encodeURIComponent(id)}/confirm`), { method: "POST" }),
    onSuccess,
  });
  const reject = useMutation({
    mutationFn: (id: string) =>
      api<FactDto>(orgApi(orgId, `/facts/${encodeURIComponent(id)}/reject`), { method: "POST" }),
    onSuccess,
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: FactPatch }) =>
      api<FactDto>(orgApi(orgId, `/facts/${encodeURIComponent(id)}`), {
        method: "PATCH",
        body: { ...patch },
      }),
    onSuccess,
  });
  const bulkConfirm = useMutation({
    mutationFn: (ids: string[]) =>
      api<unknown>(orgApi(orgId, "/facts/bulk-confirm"), { method: "POST", body: { ids } }),
    onSuccess,
  });
  const create = useMutation({
    mutationFn: (fact: NewFact) =>
      api<FactDto>(orgApi(orgId, "/facts"), { method: "POST", body: { ...fact } }),
    onSuccess,
  });
  /** "Confirm still true": bumps lastConfirmedAt so the staleness indicator clears. */
  const stillTrue = useMutation({
    mutationFn: (id: string) =>
      api<FactDto>(orgApi(orgId, `/facts/${encodeURIComponent(id)}/still-true`), {
        method: "POST",
      }),
    onSuccess,
  });
  return { confirm, reject, update, bulkConfirm, create, stillTrue };
}

// ---------- projects ----------

export function useProjects(orgId: string) {
  return useQuery({
    queryKey: kbKeys.projects(orgId),
    queryFn: () => api<ListResponse<ProjectListItem>>(orgApi(orgId, "/projects")),
    enabled: !!orgId,
  });
}

export function useProject(orgId: string, id: string) {
  return useQuery({
    queryKey: kbKeys.project(orgId, id),
    queryFn: () => api<ProjectDetail>(orgApi(orgId, `/projects/${encodeURIComponent(id)}`)),
    enabled: !!orgId && !!id,
  });
}

// ---------- interviews ----------

/** POST /interviews then navigate to the live session. */
export function useStartInterview(orgId: string) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { kind: InterviewKind; focusProjectId?: string }) =>
      api<InterviewDto & { turns: InterviewTurnDto[] }>(orgApi(orgId, "/interviews"), {
        method: "POST",
        body: { ...body },
      }),
    onSuccess: (interview) => {
      qc.setQueryData(["orgs", orgId, "interviews", interview.id], interview);
      void qc.invalidateQueries({ queryKey: ["orgs", orgId, "interviews"], exact: true });
      return navigate({
        to: "/orgs/$orgId/interviews/$interviewId",
        params: { orgId, interviewId: interview.id },
      });
    },
  });
}
