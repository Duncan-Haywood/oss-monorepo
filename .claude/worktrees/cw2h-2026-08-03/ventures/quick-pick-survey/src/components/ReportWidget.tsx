"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { useStoredSession } from "@/lib/sessionStore";
import { recordUsage } from "@/lib/usageClient";

type Kind = "bug" | "confusing" | "question" | "idea" | "other";
type Impact = "blocked" | "hard" | "minor";

const KINDS: { key: Kind; label: string; glyph: string; placeholder: string }[] = [
  { key: "bug", label: "Broken", glyph: "🐞", placeholder: "What happened, and what were you trying to do?" },
  { key: "confusing", label: "Confusing", glyph: "🧭", placeholder: "What was unclear or made you hesitate?" },
  { key: "question", label: "Question feels off", glyph: "🃏", placeholder: "Which wording, topic, or comparison felt wrong—and why?" },
  { key: "idea", label: "Idea", glyph: "💡", placeholder: "What would make this more useful?" },
  { key: "other", label: "Other", glyph: "💬", placeholder: "Tell us anything else." },
];

const IMPACTS: { key: Impact; label: string }[] = [
  { key: "blocked", label: "Stopped me" },
  { key: "hard", label: "Made it harder" },
  { key: "minor", label: "Small thing" },
];

const QUICK_TAGS = [
  { tag: "Typo on card", kind: "question" as Kind, impact: "minor" as Impact },
  { tag: "Unclear comparison", kind: "confusing" as Kind, impact: "hard" as Impact },
  { tag: "Missing an option", kind: "idea" as Kind, impact: "minor" as Impact },
  { tag: "App glitch", kind: "bug" as Kind, impact: "blocked" as Impact },
];

export function ReportWidget() {
  const pathname = usePathname();
  const { bundle } = useStoredSession();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("confusing");
  const [impact, setImpact] = useState<Impact | null>(null);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    setError(null);
    const startedAt = performance.now();
    try {
      const response = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          impact,
          message,
          email: email || undefined,
          path: pathname,
          perspective: bundle?.perspective,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        recordUsage("feedback_submit", { perspective: bundle?.perspective, durationMs: Math.round(performance.now() - startedAt), success: false });
        setError(data?.error ?? "Couldn't send that.");
      } else {
        recordUsage("feedback_submit", { perspective: bundle?.perspective, durationMs: Math.round(performance.now() - startedAt), success: true });
        setReference(data.reference ?? "SAVED");
        setMessage("");
        setEmail("");
      }
    } catch {
      recordUsage("feedback_submit", { perspective: bundle?.perspective, durationMs: Math.round(performance.now() - startedAt), success: false });
      setError("Couldn't reach the server. Your text is still here—try again.");
    } finally {
      setBusy(false);
    }
  }

  function applyQuickTag(item: typeof QUICK_TAGS[0]) {
    setKind(item.kind);
    setImpact(item.impact);
    setMessage((prev) => (prev ? `${prev} (${item.tag})` : item.tag));
  }

  function close() {
    setOpen(false);
    setReference(null);
    setError(null);
  }

  if (!open) return (
    <button
      onClick={() => { setOpen(true); recordUsage("feedback_open", { perspective: bundle?.perspective }); }}
      aria-label="Send feedback or report a problem"
      className="fixed bottom-20 right-3 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-neutral-300 bg-white/90 text-base shadow-lg backdrop-blur transition active:scale-90 dark:border-neutral-700 dark:bg-neutral-900/90"
    >
      💬
    </button>
  );

  const active = KINDS.find((item) => item.key === kind)!;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center">
      <div role="dialog" aria-modal="true" aria-labelledby="feedback-title" className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-baseline justify-between">
          <h2 id="feedback-title" className="font-bold">{reference ? "Feedback received" : "What should we improve?"}</h2>
          <button onClick={close} aria-label="Close" className="text-sm text-neutral-500 dark:text-neutral-400">✕</button>
        </div>
        {reference ? (
          <div className="mt-3">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">It is saved even if our internal issue tracker is temporarily unavailable.</p>
            <p className="mt-2 rounded-lg bg-neutral-100 px-3 py-2 font-mono text-xs dark:bg-neutral-800">Reference: {reference}</p>
            <button onClick={close} className="mt-3 w-full rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-neutral-950">Done</button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
            <div>
              <p className="mb-1 text-[11px] font-medium text-neutral-600 dark:text-neutral-300">Quick 1-tap feedback tags:</p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_TAGS.map((qt) => (
                  <button
                    key={qt.tag}
                    type="button"
                    onClick={() => applyQuickTag(qt)}
                    className="rounded-lg border border-neutral-300 bg-neutral-50 px-2 py-1 text-[11px] font-semibold text-neutral-700 transition active:scale-95 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                  >
                    + {qt.tag}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {KINDS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setKind(item.key)}
                  aria-pressed={kind === item.key}
                  className={`flex items-center gap-1.5 rounded-xl border-2 px-2 py-2 text-left text-[11px] font-semibold ${
                    kind === item.key
                      ? "border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                      : "border-neutral-200 text-neutral-600 dark:border-neutral-700 dark:text-neutral-400"
                  }`}
                >
                  <span>{item.glyph}</span>{item.label}
                </button>
              ))}
            </div>

            <div>
              <p className="mb-1 text-[11px] font-medium text-neutral-600 dark:text-neutral-300">How much did it affect you? <span className="font-normal text-neutral-500 dark:text-neutral-400">Optional</span></p>
              <div className="flex gap-1.5">
                {IMPACTS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setImpact(item.key)}
                    aria-pressed={impact === item.key}
                    className={`flex-1 rounded-full border px-2 py-1 text-[11px] ${
                      impact === item.key
                        ? "border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                        : "border-neutral-300 dark:border-neutral-700"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={active.placeholder}
              rows={4}
              maxLength={4000}
              autoFocus
              className="w-full resize-none rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 dark:border-neutral-700 dark:bg-neutral-950"
            />
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email (optional, only if you want a reply)"
              maxLength={200}
              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 dark:border-neutral-700 dark:bg-neutral-950"
            />
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400">We attach this page and your current self/partner mode so you do not have to explain them.</p>
            {error && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={busy || !message.trim()}
              className="rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-neutral-950 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Send feedback"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
