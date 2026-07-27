"use client";

import { useState } from "react";

/**
 * A one-tap "was this useful?" on each unlocked insight. Deliberately
 * tiny — the point is a high response rate on a real signal, not a survey
 * about the survey. Once answered it collapses to a thank-you and never
 * asks again in that session.
 */
export function InsightFeedback({ subject }: { subject: string }) {
  const [sent, setSent] = useState<null | "up" | "down">(null);
  const [note, setNote] = useState("");
  const [noteSent, setNoteSent] = useState(false);

  async function send(useful: boolean) {
    setSent(useful ? "up" : "down");
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, usefulness: useful ? 5 : 1 }),
    }).catch(() => {});
  }

  async function sendNote() {
    if (!note.trim()) return;
    setNoteSent(true);
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, note }),
    }).catch(() => {});
  }

  if (sent === null) {
    return (
      <div className="mt-3 flex items-center gap-2 border-t border-neutral-100 pt-2 dark:border-neutral-800">
        <span className="text-[11px] text-neutral-400">Useful?</span>
        <button
          onClick={() => send(true)}
          aria-label="This insight was useful"
          className="rounded-full px-2 py-0.5 text-sm transition active:scale-90 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          👍
        </button>
        <button
          onClick={() => send(false)}
          aria-label="This insight was not useful"
          className="rounded-full px-2 py-0.5 text-sm transition active:scale-90 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          👎
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-neutral-100 pt-2 dark:border-neutral-800">
      {sent === "down" && !noteSent ? (
        <div className="flex gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What would've been useful?"
            maxLength={200}
            className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-2 py-1 text-xs outline-none focus:border-amber-500 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button
            onClick={sendNote}
            className="shrink-0 rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-semibold text-neutral-950"
          >
            Send
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-neutral-400">Thanks — noted 💛</p>
      )}
    </div>
  );
}

/**
 * Periodic pulse on the swiping itself. Shown rarely (every 50 answers)
 * because enjoyment is what decides whether anyone keeps going, but asking
 * often would itself make it less enjoyable.
 */
export function SessionPulse({ totalAnswers, onDone }: { totalAnswers: number; onDone: () => void }) {
  const [busy, setBusy] = useState(false);

  async function rate(enjoyment: number) {
    if (busy) return;
    setBusy(true);
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: "session", enjoyment, note: `after ${totalAnswers} answers` }),
    }).catch(() => {});
    onDone();
  }

  return (
    <div className="rounded-2xl border-2 border-amber-300/70 bg-amber-50 px-4 py-3 text-center dark:border-amber-400/30 dark:bg-amber-950/40">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Enjoying this?</p>
      <div className="mt-2 flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => rate(n)}
            disabled={busy}
            aria-label={`Rate ${n} out of 5`}
            className="h-9 w-9 rounded-full border-2 border-amber-400 text-sm font-bold text-amber-700 transition active:scale-90 disabled:opacity-50 dark:text-amber-300"
          >
            {n}
          </button>
        ))}
      </div>
      <button onClick={onDone} className="mt-2 text-[11px] text-amber-800/70 underline dark:text-amber-300/60">
        skip
      </button>
    </div>
  );
}
