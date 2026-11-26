// Eligibility checklist for one opportunity: each funder requirement (with the funder's verbatim
// words) marked met / not met / unknown, the evidence behind it (facts, profile fields) and the
// questions to settle the unknowns in an interview.
// GET /api/orgs/:orgId/eligibility/:opportunityId · POST .../recheck · POST /interviews.
import { KbLink, kbPaths } from "@client/components/knowledge/link";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  ErrorMessage,
  Spinner,
  type Tone,
} from "@client/components/ui";
import { ApiError, api, formatDate, orgApi } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import type { InterviewDto } from "@shared/api/types";
import {
  type ChecklistItem,
  type CheckStatus,
  CRITERION_KIND_LABELS,
  type EligibilityCheckDto,
  type EligibilityOverall,
  type EvidenceRef,
} from "@shared/eligibility";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { CircleCheck, CircleHelp, CircleX, MessageCircleQuestion, RefreshCw } from "lucide-react";

export const ELIGIBILITY_DISCLAIMER =
  "Eligibility is assessed from your fact base; confirm with the funder.";

export const eligibilityKey = (orgId: string, opportunityId: string) =>
  ["orgs", orgId, "eligibility", opportunityId] as const;

const OVERALL: Record<EligibilityOverall, { label: string; tone: Tone }> = {
  eligible: { label: "Eligible", tone: "success" },
  likely: { label: "Likely eligible", tone: "info" },
  unknown: { label: "Eligibility unknown", tone: "warning" },
  ineligible: { label: "Not eligible", tone: "danger" },
};

const STATUS: Record<CheckStatus, { label: string; Icon: typeof CircleCheck; className: string }> =
  {
    met: { label: "Met", Icon: CircleCheck, className: "text-success-600" },
    not_met: { label: "Not met", Icon: CircleX, className: "text-danger-600" },
    unknown: { label: "Unknown", Icon: CircleHelp, className: "text-warning-600" },
  };

const enc = encodeURIComponent;

export function EligibilityChecklist({
  orgId,
  opportunityId,
}: {
  orgId: string;
  opportunityId: string;
}) {
  const qc = useQueryClient();
  const key = eligibilityKey(orgId, opportunityId);
  const path = orgApi(orgId, `/eligibility/${enc(opportunityId)}`);
  const query = useQuery({
    queryKey: key,
    queryFn: () => api<EligibilityCheckDto>(path),
    retry: false,
    staleTime: 60_000,
  });
  const recheck = useMutation({
    mutationFn: () => api<EligibilityCheckDto>(`${path}/recheck`, { method: "POST" }),
    onSuccess: (data) => qc.setQueryData(key, data),
  });

  const data = query.data;
  const notChecked = query.error instanceof ApiError && query.error.code === "not_checked";

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Eligibility check</CardTitle>
          {data && <Badge tone={OVERALL[data.overall].tone}>{OVERALL[data.overall].label}</Badge>}
        </div>
        {(data || notChecked) && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => recheck.mutate()}
            disabled={recheck.isPending}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", recheck.isPending && "animate-spin")}
              aria-hidden
            />
            {data ? "Re-check" : "Check eligibility"}
          </Button>
        )}
      </CardHeader>
      <CardBody className="space-y-4">
        {query.isPending ? (
          <Spinner label="Checking eligibility" />
        ) : notChecked ? (
          <Alert tone="info" title="Not checked yet">
            Eligibility for this grant hasn't been checked. An editor can run the check.
          </Alert>
        ) : query.error ? (
          <ErrorMessage error={query.error} title="Could not load the eligibility check" />
        ) : data ? (
          <CheckResult orgId={orgId} data={data} />
        ) : null}
        {recheck.error && <ErrorMessage error={recheck.error} title="Could not run the check" />}
        <p className="text-xs text-neutral-500">{ELIGIBILITY_DISCLAIMER}</p>
      </CardBody>
    </Card>
  );
}

function CheckResult({ orgId, data }: { orgId: string; data: EligibilityCheckDto }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-700">{data.summary}</p>
      {data.checklist.length > 0 && (
        <ul className="divide-y divide-neutral-100" aria-label="Eligibility requirements">
          {data.checklist.map((item) => (
            <ChecklistRow key={item.criterionId} orgId={orgId} item={item} />
          ))}
        </ul>
      )}
      {data.missingInfoQuestions.length > 0 && (
        <MissingInfo orgId={orgId} questions={data.missingInfoQuestions.map((q) => q.question)} />
      )}
      <p className="text-xs text-neutral-500">Checked {formatDate(data.checkedAt)}</p>
    </div>
  );
}

function ChecklistRow({ orgId, item }: { orgId: string; item: ChecklistItem }) {
  const s = STATUS[item.status];
  return (
    <li className="flex gap-3 py-3" data-status={item.status}>
      <s.Icon className={cn("mt-0.5 h-5 w-5 shrink-0", s.className)} aria-hidden />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="sr-only">{s.label}: </span>
          <p className="font-medium text-neutral-900">{item.text}</p>
          <Badge tone="neutral">{CRITERION_KIND_LABELS[item.kind]}</Badge>
        </div>
        <blockquote className="border-l-2 border-neutral-200 pl-3 text-sm text-neutral-600">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Funder's words{" "}
          </span>
          <q className="italic">{item.sourceQuote}</q>
        </blockquote>
        <p className="text-sm text-neutral-600">{item.reason}</p>
        {item.evidence.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Evidence">
            {item.evidence.map((e) => (
              <li key={e.ref}>
                <EvidenceLink orgId={orgId} evidence={e} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

function EvidenceLink({ orgId, evidence: e }: { orgId: string; evidence: EvidenceRef }) {
  const href =
    e.kind === "fact"
      ? `${kbPaths.facts(orgId)}#${enc(e.ref)}`
      : `/orgs/${enc(orgId)}/settings/general`;
  return (
    <KbLink
      href={href}
      className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-neutral-50 px-2 py-1 text-xs text-brand-700 ring-1 ring-inset ring-neutral-200 hover:underline"
      title={e.kind === "fact" ? `Fact ${e.ref}` : "Organization profile"}
    >
      <span className="truncate">{e.label}</span>
      {e.kind === "fact" && e.factStatus !== "confirmed" && (
        <Badge tone="warning">Unconfirmed</Badge>
      )}
    </KbLink>
  );
}

function MissingInfo({ orgId, questions }: { orgId: string; questions: string[] }) {
  const router = useRouter({ warn: false });
  const qc = useQueryClient();
  const ask = useMutation({
    mutationFn: () =>
      api<InterviewDto>(orgApi(orgId, "/interviews"), {
        method: "POST",
        body: { kind: "follow_up" },
      }),
    onSuccess: async (interview) => {
      void qc.invalidateQueries({ queryKey: ["orgs", orgId, "interviews"] });
      if (router) await router.navigate({ href: kbPaths.interview(orgId, interview.id) });
    },
  });
  return (
    <section className="space-y-2 rounded-lg bg-warning-50/60 p-3 ring-1 ring-inset ring-warning-200">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
        <MessageCircleQuestion className="h-4 w-4 text-warning-600" aria-hidden />
        Questions to settle the unknowns
      </h3>
      <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
        {questions.map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={() => ask.mutate()} loading={ask.isPending}>
          Ask in an interview
        </Button>
        {ask.data && (
          <KbLink
            href={kbPaths.interview(orgId, ask.data.id)}
            className="text-sm text-brand-700 hover:underline"
          >
            Open the interview
          </KbLink>
        )}
      </div>
      {ask.error && <ErrorMessage error={ask.error} title="Could not start the interview" />}
    </section>
  );
}
