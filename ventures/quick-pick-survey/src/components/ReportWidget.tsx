"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";

type Kind = "bug" | "idea" | "other";

const KINDS: { key: Kind; label: string; glyph: string; placeholder: string }[] = [
  { key: "bug", label: "Something's broken", glyph: "🐞", placeholder: "What happened, and what were you doing?" },
  { key: "idea", label: "I have an idea", glyph: "💡", placeholder: "What would make this better?" },
  { key: "other", label: "Something else", glyph: "💬", placeholder: "Anything at all." },
];

/**
 * Always-available feedback. Deliberately a floating button rather than a
 * buried settings item — a bug report that takes three taps to find mostly
 * doesn't get filed, and unreported bugs look identical to no bugs.
 */
export function ReportWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("bug");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, message, email: email || undefined, path: pathname }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d?.error ?? "Couldn't send that.");
        setBusy(false);
        return;
      }
      setSent(true);
      setMessage("");
      setEmail("");
    } catch {
      setError("Couldn't reach the server.");
    }
    setBusy(false);
  }

  function close() {
    setOpen(false);
    setSent(false);
    setError(null);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Send feedback or report a problem"
        className="fixed bottom-20 right-3 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-neutral-300 bg-white/90 text-base shadow-lg backdrop-blur transition active:scale-90 dark:border-neutral-700 dark:bg-neutral-900/90"
      >
        💬
      </button>
    );
  }

  const active = KINDS.find((k) => k.key === kind)!;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-baseline justify-between">
          <h2 className="font-bold">{sent ? "Thanks 💛" : "Tell us"}</h2>
          <button onClick={close} aria-label="Close" className="text-sm text-neutral-500 dark:text-neutral-400">
            ✕
          </button>
        </div>

        {sent ? (
          <div className="mt-2">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Got it — genuinely useful. It goes straight to whoever can fix it.
            </p>
            <button
              onClick={close}
              className="mt-3 w-full rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-neutral-950"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
            <div className="flex gap-1.5">
              {KINDS.map((k) => (
                <button
                  key={k.key}
                  type="button"
                  onClick={() => setKind(k.key)}
                  className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl border-2 px-1 py-2 text-[11px] font-semibold transition ${
                    kind === k.key
                      ? "border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                      : "border-neutral-200 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
                  }`}
                >
                  <span className="text-base">{k.glyph}</span>
                  {k.label}
                </button>
              ))}
            </div>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={active.placeholder}
              rows={4}
              maxLength={4000}
              autoFocus
              className="w-full resize-none rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 dark:border-neutral-700 dark:bg-neutral-950"
            />

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email (optional, only if you want a reply)"
              maxLength={200}
              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 dark:border-neutral-700 dark:bg-neutral-950"
            />

            {error && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={busy || !message.trim()}
              className="rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-neutral-950 disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
