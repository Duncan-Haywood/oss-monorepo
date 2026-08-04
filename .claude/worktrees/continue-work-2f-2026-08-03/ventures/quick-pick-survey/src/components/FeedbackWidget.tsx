"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useStoredSession } from "@/lib/sessionStore";
import { createUsageId, getUsageSessionKey, recordUsage } from "@/lib/usageClient";

type SaveState = "idle" | "saving" | "sent" | "error";

const NEGATIVE_REASONS = [
  ["too_obvious", "Too obvious"],
  ["not_true", "Didn't feel true"],
  ["too_vague", "Too vague"],
  ["not_actionable", "Not useful yet"],
  ["need_more_context", "Needs more context"],
  ["unclear_cards", "Cards unclear"],
] as const;

function useFeedbackContext() {
  const pathname = usePathname();
  const { bundle } = useStoredSession();
  return { path: pathname, perspective: bundle?.perspective };
}

async function postFeedback(payload: Record<string, unknown>, clientFeedbackId: string): Promise<void> {
  const response = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, clientFeedbackId, sessionKey: getUsageSessionKey() }),
  });
  if (!response.ok) throw new Error("feedback rejected");
}

export function InsightFeedback({ subject }: { subject: string }) {
  const context = useFeedbackContext();
  const [vote, setVote] = useState<null | "up" | "down">(null);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<SaveState>("idle");
  const [clientFeedbackId] = useState(createUsageId);
  const completed = useRef(false);

  useEffect(() => {
    recordUsage("feedback_prompt", { perspective: context.perspective, domain: subject });
    return () => {
      if (!completed.current) {
        recordUsage("feedback_dismiss", { perspective: context.perspective, domain: subject });
      }
    };
  }, [context.perspective, subject]);

  async function save(useful: boolean) {
    if (state === "saving") return;
    setState("saving");
    try {
      await postFeedback({
        subject,
        usefulness: useful ? 5 : 1,
        reason: useful ? undefined : reason,
        note: note.trim() || undefined,
        ...context,
      }, clientFeedbackId);
      completed.current = true;
      recordUsage("feedback_submit", { perspective: context.perspective, domain: subject, success: true });
      setState("sent");
    } catch {
      recordUsage("feedback_submit", { perspective: context.perspective, domain: subject, success: false });
      setState("error");
    }
  }

  if (state === "sent") {
    return <p className="mt-3 border-t border-neutral-100 pt-2 text-[11px] font-medium text-emerald-700 dark:border-neutral-800 dark:text-emerald-400">✓ Thanks — that helps tune the next insight for you.</p>;
  }

  return (
    <div className="mt-3 border-t border-neutral-100 pt-2 dark:border-neutral-800">
      {vote === null ? (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-neutral-500 dark:text-neutral-400">Did this tell you something useful?</span>
          <button onClick={() => { setVote("up"); recordUsage("feedback_open", { perspective: context.perspective, domain: subject }); void save(true); }} aria-label="This insight was useful" className="rounded-full px-2 py-0.5 text-sm transition active:scale-90 hover:bg-neutral-100 dark:hover:bg-neutral-800">👍</button>
          <button onClick={() => { setVote("down"); recordUsage("feedback_open", { perspective: context.perspective, domain: subject }); }} aria-label="This insight was not useful" className="rounded-full px-2 py-0.5 text-sm transition active:scale-90 hover:bg-neutral-100 dark:hover:bg-neutral-800">👎</button>
        </div>
      ) : vote === "down" ? (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300">What missed? One tap is enough.</p>
          <div className="flex flex-wrap gap-1.5">
            {NEGATIVE_REASONS.map(([key, label]) => (
              <button key={key} type="button" onClick={() => setReason(key)} aria-pressed={reason === key} className={`rounded-full border px-2 py-1 text-[11px] ${reason === key ? "border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" : "border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-400"}`}>{label}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional detail" maxLength={300} className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-2 py-1 text-xs outline-none focus:border-amber-500 dark:border-neutral-700 dark:bg-neutral-900" />
            <button onClick={() => void save(false)} disabled={!reason || state === "saving"} className="shrink-0 rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-semibold text-neutral-950 disabled:opacity-50">{state === "saving" ? "Sending…" : "Send"}</button>
          </div>
        </div>
      ) : null}
      {state === "error" && (
        <p role="alert" className="mt-2 text-[11px] text-red-600 dark:text-red-400">That didn&apos;t save. <button onClick={() => void save(vote === "up")} className="font-semibold underline">Try again</button></p>
      )}
    </div>
  );
}

export function SessionPulse({ totalAnswers, onDone }: { totalAnswers: number; onDone: () => void }) {
  const context = useFeedbackContext();
  const [state, setState] = useState<SaveState>("idle");
  const [clientFeedbackId] = useState(createUsageId);
  const completed = useRef(false);

  useEffect(() => {
    recordUsage("feedback_prompt", { perspective: context.perspective, domain: "session" });
    return () => {
      if (!completed.current) {
        recordUsage("feedback_dismiss", { perspective: context.perspective, domain: "session" });
      }
    };
  }, [context.perspective]);

  async function rate(enjoyment: number) {
    if (state === "saving") return;
    setState("saving");
    try {
      await postFeedback({ subject: "session", enjoyment, answerCount: totalAnswers, ...context }, clientFeedbackId);
      recordUsage("nps_submitted", { perspective: context.perspective, domain: "session", success: true });
      completed.current = true;
      setState("sent");
      onDone();
    } catch {
      recordUsage("nps_submitted", { perspective: context.perspective, domain: "session", success: false });
      setState("error");
    }
  }

  return (
    <div className="rounded-2xl border-2 border-amber-300/70 bg-amber-50 px-4 py-3 text-center dark:border-amber-400/30 dark:bg-amber-950/40">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">How does the swiping feel right now?</p>
      <p className="mt-0.5 text-[11px] text-amber-800 dark:text-amber-300">1 = frustrating · 5 = effortless</p>
      <div className="mt-2 flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => void rate(n)} disabled={state === "saving"} aria-label={`Rate ${n} out of 5`} className="h-9 w-9 rounded-full border-2 border-amber-400 text-sm font-bold text-amber-700 transition active:scale-90 disabled:opacity-50 dark:text-amber-300">{n}</button>)}
      </div>
      {state === "error" && <p role="alert" className="mt-2 text-[11px] text-red-700 dark:text-red-300">Couldn&apos;t save that. Please tap a rating again.</p>}
      <button onClick={() => { completed.current = true; recordUsage("feedback_dismiss", { perspective: context.perspective, domain: "session" }); onDone(); }} className="mt-2 text-[11px] text-amber-800 underline dark:text-amber-300/60">Skip</button>
    </div>
  );
}
