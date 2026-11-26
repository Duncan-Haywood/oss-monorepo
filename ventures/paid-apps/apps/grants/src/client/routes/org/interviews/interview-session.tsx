// OWNER: interview UI agent — one interview: chat transcript, topic progress, answer composer.

import { ApiErrorAlert } from "@client/components/grants/api-error-alert";
import { apiErrorStatus } from "@client/components/grants/api-errors";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Spinner,
  Textarea,
} from "@client/components/ui";
import { appendTranscript, DictationButton } from "@client/components/voice";
import { api, formatDate, orgApi } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import type { InterviewTurnDto } from "@shared/api/types";
import type { InputMode } from "@shared/enums";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Check, CheckCircle2, Mic, Send } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ANSWER_ERRORS,
  ANSWER_GUIDANCE,
  type AnswerResponse,
  extractedFactCount,
  type InterviewDetail,
  interviewKeys,
  isExtracting,
  KIND_LABELS,
  projectsKey,
  STATUS_LABELS,
  STATUS_TONES,
  topicLabel,
} from "./shared";

const TEMP_PREFIX = "tmp_";

export function InterviewSessionPage() {
  const { orgId, interviewId } = useParams({ strict: false }) as {
    orgId: string;
    interviewId: string;
  };
  const qc = useQueryClient();
  const key = interviewKeys.detail(orgId, interviewId);
  const path = `/interviews/${encodeURIComponent(interviewId)}`;

  const query = useQuery({
    queryKey: key,
    queryFn: () => api<InterviewDetail>(orgApi(orgId, path)),
    // Facts are extracted on a background queue after completion; poll until they land.
    refetchInterval: (q) => (isExtracting(q.state.data) ? 3000 : false),
  });

  const [draft, setDraft] = useState("");
  const [usedVoice, setUsedVoice] = useState(false);
  /** Stored-recording key from the latest dictation (only when the org keeps recordings). */
  const [audioKey, setAudioKey] = useState<string | null>(null);
  const [agendaDone, setAgendaDone] = useState(false);
  const [completedCount, setCompletedCount] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const endRef = useRef<HTMLLIElement>(null);
  const composerId = useId();

  const answer = useMutation({
    mutationFn: (vars: { content: string; inputMode: InputMode; audioKey?: string }) =>
      api<AnswerResponse>(orgApi(orgId, `${path}/answer`), { method: "POST", body: vars }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<InterviewDetail>(key);
      const tempId = `${TEMP_PREFIX}${Date.now()}`;
      if (prev) {
        const ordinal = prev.turns.reduce((max, t) => Math.max(max, t.ordinal), 0) + 1;
        const optimistic = {
          id: tempId,
          orgId,
          interviewId,
          ordinal,
          role: "respondent",
          content: vars.content,
          inputMode: vars.inputMode,
          audioR2Key: null,
          topicKey: null,
          speakerName: null,
          createdBy: null,
          createdAt: new Date().toISOString(),
        } as InterviewTurnDto;
        qc.setQueryData<InterviewDetail>(key, { ...prev, turns: [...prev.turns, optimistic] });
      }
      setDraft("");
      setUsedVoice(false);
      setAudioKey(null);
      setAnnouncement("Answer sent. Waiting for the next question…");
      return { prev, tempId };
    },
    onError: (err, vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      if (apiErrorStatus(err) === 409)
        void qc.invalidateQueries({ queryKey: interviewKeys.all(orgId) });
      // Give the user their words back so nothing is lost.
      setDraft((cur) => (cur.trim() ? cur : vars.content));
      if (vars.inputMode === "voice") setUsedVoice(true);
      if (vars.audioKey) setAudioKey(vars.audioKey);
      setAnnouncement("Your answer could not be sent.");
    },
    onSuccess: (res, _vars, ctx) => {
      const incoming = (res?.turns ?? []).filter((t): t is InterviewTurnDto => t != null);
      qc.setQueryData<InterviewDetail>(key, (cur) =>
        cur
          ? {
              ...cur,
              turns: [
                ...cur.turns.filter(
                  (t) => t.id !== ctx?.tempId && !incoming.some((n) => n.id === t.id),
                ),
                ...incoming,
              ],
            }
          : cur,
      );
      const next = incoming.find((t) => t.role === "interviewer");
      if (res?.done) setAgendaDone(true);
      setAnnouncement(
        next
          ? `Next question: ${next.content}`
          : res?.done
            ? "That covers every topic. You can finish the interview now."
            : "Answer saved.",
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  // POST /complete returns the completed interview (InterviewDto & { turns }); fact extraction
  // is queued, so factCount is usually still 0 here and fills in once the job has run.
  const complete = useMutation({
    mutationFn: () => api<InterviewDetail>(orgApi(orgId, `${path}/complete`), { method: "POST" }),
    onSuccess: (res) => {
      if (res && typeof res === "object" && "turns" in res) qc.setQueryData(key, res);
      const count = extractedFactCount(res, query.data?.factCount ?? 0);
      setCompletedCount(count);
      setAnnouncement(
        count > 0
          ? `Interview finished — ${count} facts extracted for your review.`
          : "Interview finished. We're pulling facts out of your answers now.",
      );
      void qc.invalidateQueries({ queryKey: interviewKeys.all(orgId), exact: true });
      void qc.invalidateQueries({ queryKey: ["orgs", orgId, "facts"] });
      // Project interviews fill in the project's fields.
      if (query.data?.focusProjectId) void qc.invalidateQueries({ queryKey: projectsKey(orgId) });
    },
    onError: (err) => {
      // 409: the interview was completed/abandoned elsewhere — show its real state.
      if (apiErrorStatus(err) === 409) void qc.invalidateQueries({ queryKey: key });
    },
  });

  const turns = useMemo(
    () => [...(query.data?.turns ?? [])].sort((a, b) => a.ordinal - b.ordinal),
    [query.data?.turns],
  );
  const lastTurnId = turns.at(-1)?.id;
  const hasTurns = turns.length > 0;

  // Keep the newest turn in view.
  useEffect(() => {
    if (lastTurnId || answer.isPending) endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [lastTurnId, answer.isPending]);

  if (query.isPending) return <Spinner label="Loading interview" />;
  if (query.isError)
    return (
      <ApiErrorAlert
        error={query.error}
        title="Couldn't load this interview"
        messages={{ not_found: "This interview doesn't exist or was deleted." }}
      />
    );

  const interview = query.data;
  const readOnly = interview.status !== "active" || completedCount !== null;
  const respondentCount = turns.filter(
    (t) => t.role === "respondent" && !t.id.startsWith(TEMP_PREFIX),
  ).length;
  const agenda = interview.agenda ?? [];
  const covered = new Set(interview.coveredTopics ?? []);
  const allCovered = agenda.length > 0 && agenda.every((t) => covered.has(t));
  const suggestFinish = !readOnly && (agendaDone || allCovered);
  const respondentLabel = interview.mode === "human_transcript" ? "Respondent" : "You";

  const send = () => {
    const content = draft.trim();
    if (!content || answer.isPending || readOnly) return;
    answer.mutate({
      content,
      inputMode: usedVoice ? "voice" : "text",
      ...(usedVoice && audioKey ? { audioKey } : {}),
    });
  };

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        to="/orgs/$orgId/interviews"
        params={{ orgId }}
        className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-neutral-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> All interviews
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            {interview.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
            <Badge tone="brand">{KIND_LABELS[interview.kind] ?? interview.kind}</Badge>
            <Badge tone={STATUS_TONES[interview.status] ?? "neutral"}>
              {STATUS_LABELS[interview.status] ?? interview.status}
            </Badge>
            <span>Started {formatDate(interview.createdAt)}</span>
          </div>
        </div>
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {!readOnly && <Alert tone="info">{ANSWER_GUIDANCE}</Alert>}

          {completedCount !== null || interview.status === "completed" ? (
            <CompletedPanel
              orgId={orgId}
              factCount={Math.max(completedCount ?? 0, interview.factCount)}
              extracting={isExtracting(interview) || (completedCount === 0 && respondentCount > 0)}
              justFinished={completedCount !== null}
              summary={interview.summary}
            />
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{readOnly ? "Transcript" : "Conversation"}</CardTitle>
            </CardHeader>
            <CardBody>
              {!hasTurns ? (
                <p className="text-sm text-neutral-500">No messages in this interview yet.</p>
              ) : (
                <ol className="space-y-4" aria-label="Interview transcript">
                  {turns.map((turn) => (
                    <TurnBubble key={turn.id} turn={turn} respondentLabel={respondentLabel} />
                  ))}
                  {answer.isPending && (
                    <li className="flex justify-start">
                      <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-neutral-100 px-4 py-3 text-sm text-neutral-500">
                        <span className="inline-flex items-center gap-1" aria-hidden>
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:150ms]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:300ms]" />
                        </span>
                        <span className="ml-2">Thinking about your answer…</span>
                      </div>
                    </li>
                  )}
                  <li ref={endRef} aria-hidden className="h-0" />
                </ol>
              )}
            </CardBody>

            {!readOnly && (
              <div className="border-t border-neutral-100 px-5 py-4">
                {suggestFinish && (
                  <div className="mb-3">
                    <Alert tone="success" title="That covers everything on our list">
                      Finish the interview to turn your answers into facts — or keep adding detail.
                    </Alert>
                  </div>
                )}
                {answer.isError && (
                  <ApiErrorAlert
                    className="mb-3"
                    error={answer.error}
                    title="Your answer wasn't sent"
                    messages={ANSWER_ERRORS}
                  />
                )}
                <label
                  htmlFor={composerId}
                  className="mb-1 block text-sm font-medium text-neutral-700"
                >
                  Your answer
                </label>
                <Textarea
                  id={composerId}
                  value={draft}
                  rows={4}
                  placeholder="Type your answer, or use Dictate to speak it…"
                  onChange={(e) => {
                    setDraft(e.target.value);
                    if (!e.target.value.trim()) {
                      setUsedVoice(false);
                      setAudioKey(null);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  aria-describedby={`${composerId}-hint`}
                />
                <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
                  <DictationButton
                    orgId={orgId}
                    disabled={answer.isPending}
                    onTranscript={(text, meta) => {
                      setDraft((cur) => appendTranscript(cur, text));
                      setUsedVoice(true);
                      if (meta.audioKey) setAudioKey(meta.audioKey);
                      document.getElementById(composerId)?.focus();
                    }}
                  />
                  <div className="flex items-center gap-3">
                    <span
                      id={`${composerId}-hint`}
                      className="hidden text-xs text-neutral-500 sm:inline"
                    >
                      Ctrl/⌘ + Enter to send
                    </span>
                    <Button onClick={send} disabled={!draft.trim()} loading={answer.isPending}>
                      {!answer.isPending && <Send className="h-4 w-4" aria-hidden />}
                      Send
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>

        <aside className="space-y-4">
          <TopicProgress agenda={agenda} covered={covered} />
          {!readOnly && (
            <Card>
              <CardHeader>
                <CardTitle>Done for now?</CardTitle>
              </CardHeader>
              <CardBody className="space-y-3 text-sm text-neutral-600">
                <p>
                  Finishing pulls facts out of your answers. They arrive as{" "}
                  <strong>proposed</strong> facts — you confirm each one before it can be used in an
                  application.
                </p>
                <ApiErrorAlert
                  error={complete.error}
                  title="Couldn't finish the interview"
                  messages={ANSWER_ERRORS}
                />
                <Button
                  variant={suggestFinish ? "primary" : "secondary"}
                  className="w-full"
                  onClick={() => complete.mutate()}
                  loading={complete.isPending}
                  disabled={respondentCount === 0 || answer.isPending}
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  Finish interview
                </Button>
                {respondentCount === 0 && (
                  <p className="text-xs text-neutral-500">Answer at least one question first.</p>
                )}
                <p className="text-xs text-neutral-500">
                  You can leave and come back — your answers are saved as you go.
                </p>
              </CardBody>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function TurnBubble({
  turn,
  respondentLabel,
}: {
  turn: InterviewTurnDto;
  respondentLabel: string;
}) {
  const mine = turn.role === "respondent";
  const pending = turn.id.startsWith(TEMP_PREFIX);
  return (
    <li className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[85%]", mine && "text-right")}>
        <p className="mb-1 flex items-center gap-1 text-xs font-medium text-neutral-500">
          {mine && turn.inputMode === "voice" && <Mic className="h-3 w-3" aria-label="Dictated" />}
          {turn.speakerName || (mine ? respondentLabel : "Interviewer")}
          {pending && <span className="font-normal">· sending…</span>}
        </p>
        <div
          className={cn(
            "whitespace-pre-wrap rounded-2xl px-4 py-3 text-left text-sm leading-relaxed",
            mine
              ? "rounded-tr-sm bg-brand-600 text-white"
              : "rounded-tl-sm bg-neutral-100 text-neutral-900",
            pending && "opacity-70",
          )}
        >
          {turn.content}
        </div>
      </div>
    </li>
  );
}

function TopicProgress({ agenda, covered }: { agenda: string[]; covered: Set<string> }) {
  if (agenda.length === 0) return null;
  const done = agenda.filter((t) => covered.has(t)).length;
  const pct = Math.round((done / agenda.length) * 100);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Topics</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between text-sm text-neutral-600">
          <span>Covered</span>
          <span className="tabular-nums">
            {done} of {agenda.length}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Topics covered"
          aria-valuemin={0}
          aria-valuemax={agenda.length}
          aria-valuenow={done}
          aria-valuetext={`${done} of ${agenda.length} topics covered`}
          className="h-2 overflow-hidden rounded-full bg-neutral-100"
        >
          <div
            className="h-full rounded-full bg-brand-600 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <ul className="space-y-1 text-sm">
          {agenda.map((topic) => {
            const isCovered = covered.has(topic);
            return (
              <li
                key={topic}
                className={cn(
                  "flex items-center gap-2",
                  isCovered ? "text-neutral-900" : "text-neutral-500",
                )}
              >
                {isCovered ? (
                  <Check className="h-4 w-4 text-success-600" aria-hidden />
                ) : (
                  <span
                    className="mx-1 h-2 w-2 rounded-full border border-neutral-300"
                    aria-hidden
                  />
                )}
                {topicLabel(topic)}
                <span className="sr-only">{isCovered ? "(covered)" : "(not yet covered)"}</span>
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}

function CompletedPanel({
  orgId,
  factCount,
  extracting,
  justFinished,
  summary,
}: {
  orgId: string;
  factCount: number;
  /** Extraction job still running (factCount not final yet). */
  extracting: boolean;
  justFinished: boolean;
  summary: string | null;
}) {
  const facts = `${factCount} ${factCount === 1 ? "fact" : "facts"}`;
  const message =
    factCount > 0
      ? `We extracted ${facts} — review them in your fact base. Nothing is used in an application until you confirm it.`
      : extracting
        ? "We're pulling facts out of your answers now — they'll appear in your fact base in a minute. Nothing is used in an application until you confirm it."
        : "No new facts were found in this interview.";
  return (
    <div className="rounded-lg border border-success-200 bg-success-50 px-5 py-4" role="status">
      <p className="flex items-center gap-2 font-semibold text-success-900">
        <CheckCircle2 className="h-5 w-5" aria-hidden />
        {justFinished ? "Thank you — interview finished" : "This interview is complete"}
      </p>
      <p className="mt-1 text-sm text-success-900">{message}</p>
      {summary && <p className="mt-2 text-sm text-success-800">{summary}</p>}
      <Link
        to="/orgs/$orgId/knowledge/facts"
        params={{ orgId }}
        search={{ status: "proposed" }}
        className="mt-3 inline-flex h-9 items-center rounded-md bg-success-700 px-3 text-sm font-medium text-white hover:bg-success-800"
      >
        Review proposed facts
      </Link>
    </div>
  );
}
