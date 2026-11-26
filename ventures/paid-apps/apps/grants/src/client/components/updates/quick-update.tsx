// OWNER: updates — "Share an update": a quick typed or dictated update (POST /updates) whose
// proposed facts are confirmed or rejected inline, plus the "What's new?" check-in nudge.
// Usage on the dashboard: <ShareUpdateCard orgId={orgId} />
import { friendlyError } from "@client/components/grants/api-errors";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  Textarea,
} from "@client/components/ui";
import { appendTranscript, DictationButton } from "@client/components/voice";
import { api, orgApi } from "@client/lib/api";
import type { FactDto, InterviewDto, InterviewTurnDto } from "@shared/api/types";
import type { DocumentStatus, FactStatus, InputMode } from "@shared/enums";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, MessageSquarePlus, Upload, X } from "lucide-react";
import { useId, useState } from "react";

export interface FactLinkDto {
  id: string;
  statement: string;
  asOf: string | null;
  status: FactStatus;
}

/** A fact as GET /facts and the updates endpoints return it (with pending supersede links). */
export type UpdateFactDto = FactDto & {
  supersedes?: FactLinkDto | null;
  supersedeProposal?: FactLinkDto | null;
};

export interface QuickUpdateDto {
  documentId: string;
  title: string;
  status: DocumentStatus;
  error: string | null;
  pending: boolean;
  duplicate: boolean;
  facts: UpdateFactDto[];
}

export interface UpdateStatusDto {
  lastUpdateAt: string | null;
  daysSinceLastUpdate: number | null;
  checkInDue: boolean;
  staleFactCount: number;
  staleTopics: { key: string; label: string; staleness: "dated" | "stale" }[];
}

export const updateKeys = {
  status: (orgId: string) => ["orgs", orgId, "updates", "status"] as const,
  detail: (orgId: string, documentId: string) => ["orgs", orgId, "updates", documentId] as const,
};

const POLL_MS = 1500;
const MAX_POLLS = 40;

export function useUpdateStatus(orgId: string) {
  return useQuery({
    queryKey: updateKeys.status(orgId),
    queryFn: () => api<UpdateStatusDto>(orgApi(orgId, "/updates/status")),
    enabled: !!orgId,
  });
}

type FactAction = "confirm" | "reject";

export function QuickUpdate({ orgId }: { orgId: string }) {
  const uid = useId();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("text");
  const [result, setResult] = useState<QuickUpdateDto | null>(null);
  const [polls, setPolls] = useState(0);
  const [busy, setBusy] = useState<{ id: string; action: FactAction } | null>(null);
  const [factError, setFactError] = useState<string | null>(null);

  // Facts, coverage, documents and the update status changed; never the poll below (it would loop).
  const refreshKnowledge = () => {
    void qc.invalidateQueries({
      queryKey: ["orgs", orgId],
      predicate: (q) => q.queryKey[2] !== "updates" || q.queryKey[3] === "status",
    });
  };

  const submit = useMutation({
    mutationFn: () =>
      api<QuickUpdateDto>(orgApi(orgId, "/updates"), {
        method: "POST",
        body: { text: text.trim(), inputMode },
      }),
    onSuccess: (res) => {
      setResult(res);
      setPolls(0);
      refreshKnowledge();
    },
  });

  // Queue mode: the note is processed in the background; poll until its facts are extracted.
  const documentId = result?.documentId ?? "";
  const polling = !!result?.pending && polls < MAX_POLLS;
  useQuery({
    queryKey: updateKeys.detail(orgId, documentId),
    queryFn: async () => {
      const res = await api<QuickUpdateDto>(
        orgApi(orgId, `/updates/${encodeURIComponent(documentId)}`),
      );
      setPolls((n) => n + 1);
      setResult((cur) => (cur && cur.documentId === res.documentId ? res : cur));
      if (!res.pending) refreshKnowledge();
      return res;
    },
    enabled: polling,
    refetchInterval: polling ? POLL_MS : false,
  });

  const act = async (fact: UpdateFactDto, action: FactAction) => {
    setBusy({ id: fact.id, action });
    setFactError(null);
    try {
      const updated = await api<FactDto>(
        orgApi(orgId, `/facts/${encodeURIComponent(fact.id)}/${action}`),
        { method: "POST" },
      );
      setResult((cur) =>
        cur
          ? { ...cur, facts: cur.facts.map((f) => (f.id === fact.id ? { ...f, ...updated } : f)) }
          : cur,
      );
      refreshKnowledge();
    } catch (e) {
      setFactError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const reset = () => {
    setText("");
    setInputMode("text");
    setResult(null);
    setFactError(null);
    submit.reset();
  };

  const textId = `${uid}-text`;
  const canSubmit = text.trim().length >= 3 && !submit.isPending;

  if (result) {
    const stillProcessing = result.pending && polls < MAX_POLLS;
    const open = result.facts.filter((f) => f.status === "proposed").length;
    return (
      <div className="space-y-3">
        {result.status === "failed" ? (
          <Alert tone="danger" title="We couldn't process this update">
            {result.error ?? "Try again, or upload it as a document."}
          </Alert>
        ) : stillProcessing ? (
          <Alert tone="info">Reading your update and pulling out the facts…</Alert>
        ) : result.facts.length === 0 ? (
          <Alert tone="info" title="Thanks — your update is saved">
            We didn't find any specific facts in it. Numbers, dates and names help the most.
          </Alert>
        ) : (
          <p className="text-sm text-neutral-600" aria-live="polite">
            {open > 0
              ? `We found ${result.facts.length} fact${result.facts.length === 1 ? "" : "s"}. Confirm what's right; only confirmed facts are used without review.`
              : "All done. Your fact base is up to date."}
          </p>
        )}
        {factError && (
          <p className="text-sm text-danger-600" role="alert">
            {factError}
          </p>
        )}
        <ul className="space-y-2" aria-label="Facts from your update">
          {result.facts.map((f) => (
            <UpdateFactRow
              key={f.id}
              fact={f}
              busy={busy?.id === f.id ? busy.action : null}
              disabled={!!busy}
              onAct={(action) => act(f, action)}
            />
          ))}
        </ul>
        <div className="flex justify-end">
          <Button size="sm" variant="secondary" onClick={reset}>
            Share another update
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) submit.mutate();
      }}
    >
      <label htmlFor={textId} className="sr-only">
        What's new?
      </label>
      <Textarea
        id={textId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. We served 412 students in 2026, hired a new program director and won a $50,000 grant from the Kellogg Foundation."
        className="min-h-24"
        maxLength={20_000}
      />
      {submit.isError && (
        <p className="text-sm text-danger-600" role="alert">
          {friendlyError(submit.error)}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <DictationButton
            orgId={orgId}
            showPrivacyNote={false}
            disabled={submit.isPending}
            onTranscript={(t) => {
              setText((cur) => appendTranscript(cur, t));
              setInputMode("voice");
            }}
          />
          <Link
            to="/orgs/$orgId/knowledge/documents"
            params={{ orgId }}
            className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden /> Upload a new document
          </Link>
        </div>
        <Button type="submit" size="sm" loading={submit.isPending} disabled={!canSubmit}>
          Share update
        </Button>
      </div>
    </form>
  );
}

function UpdateFactRow({
  fact,
  busy,
  disabled,
  onAct,
}: {
  fact: UpdateFactDto;
  busy: FactAction | null;
  disabled: boolean;
  onAct: (action: FactAction) => void;
}) {
  return (
    <li className="rounded-md border border-neutral-200 p-3">
      <p className="text-sm font-medium text-neutral-900">{fact.statement}</p>
      {fact.sourceQuote && (
        <blockquote className="mt-1 border-l-4 border-neutral-200 pl-2 text-xs italic text-neutral-600">
          “{fact.sourceQuote}”
        </blockquote>
      )}
      {fact.supersedes && fact.status === "proposed" && (
        <p className="mt-1 text-xs text-warning-700">
          Updates “{fact.supersedes.statement}”
          {fact.supersedes.asOf ? ` (as of ${fact.supersedes.asOf})` : ""}. Confirming replaces it.
        </p>
      )}
      <div className="mt-2 flex items-center justify-end gap-2">
        {fact.status === "proposed" ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onAct("reject")}
              loading={busy === "reject"}
              disabled={disabled && busy !== "reject"}
              aria-label={`Reject: ${fact.statement}`}
            >
              {busy !== "reject" && <X className="h-3.5 w-3.5" aria-hidden />} Reject
            </Button>
            <Button
              size="sm"
              onClick={() => onAct("confirm")}
              loading={busy === "confirm"}
              disabled={disabled && busy !== "confirm"}
              aria-label={`Confirm: ${fact.statement}`}
            >
              {busy !== "confirm" && <Check className="h-3.5 w-3.5" aria-hidden />} Confirm
            </Button>
          </>
        ) : (
          <Badge tone={fact.status === "confirmed" ? "success" : "neutral"}>
            {fact.status === "confirmed" ? "Confirmed" : "Rejected"}
          </Badge>
        )}
      </div>
    </li>
  );
}

/** Dashboard card: the quick update plus a "What's new?" check-in nudge after 30 days. */
export function ShareUpdateCard({ orgId }: { orgId: string }) {
  const status = useUpdateStatus(orgId);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const startCheckIn = useMutation({
    mutationFn: () =>
      api<InterviewDto & { turns: InterviewTurnDto[] }>(orgApi(orgId, "/interviews"), {
        method: "POST",
        body: { kind: "update" },
      }),
    onSuccess: async (iv) => {
      void qc.invalidateQueries({ queryKey: ["orgs", orgId, "interviews"] });
      await navigate({
        to: "/orgs/$orgId/interviews/$interviewId",
        params: { orgId, interviewId: iv.id },
      });
    },
  });
  const s = status.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Share an update</CardTitle>
        <CardDescription>
          New programs, results, staff, awards, partners or budget? Type or dictate it.
        </CardDescription>
      </CardHeader>
      <CardBody className="space-y-4">
        {s?.checkInDue && (
          <Alert
            tone="warning"
            title="What's new?"
            action={
              <Button
                size="sm"
                variant="secondary"
                loading={startCheckIn.isPending}
                onClick={() => startCheckIn.mutate()}
              >
                <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden /> Start check-in
              </Button>
            }
          >
            {s.daysSinceLastUpdate == null
              ? "Take a 2-minute check-in so your applications use current facts."
              : `Your last update was ${s.daysSinceLastUpdate} days ago.`}
            {s.staleFactCount > 0 &&
              ` ${s.staleFactCount} fact${s.staleFactCount === 1 ? " looks" : "s look"} outdated.`}
          </Alert>
        )}
        {startCheckIn.isError && (
          <p className="text-sm text-danger-600" role="alert">
            {friendlyError(startCheckIn.error)}
          </p>
        )}
        <QuickUpdate orgId={orgId} />
      </CardBody>
    </Card>
  );
}
