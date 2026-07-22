interface SuppressedEmailsPanelProps {
  emails: string[];
}

/**
 * Read-only CAN-SPAM audit view. suppressEmail/isEmailSuppressed/getSuppressedEmails
 * (src/lib/db.ts) have been dual-backend and tested since suppression-convex-parity-fix,
 * but the list itself was never surfaced on any operator surface until this panel —
 * there was no way to confirm opt-out compliance or spot a mistaken suppression.
 * No unsuppress control yet (see prompt_process.tsx ITERATIONS for this panel's entry).
 */
export function SuppressedEmailsPanel({ emails }: SuppressedEmailsPanelProps) {
  const sorted = [...emails].sort((a, b) => a.localeCompare(b));

  return (
    <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
          Suppressed emails (CAN-SPAM opt-outs)
        </h2>
        <p className="text-xs text-zinc-500">
          {sorted.length} address{sorted.length === 1 ? "" : "es"}
        </p>
      </div>
      <p className="mt-2 text-sm text-zinc-600">
        These addresses unsubscribed and are skipped by cold outreach (Email 1-3),
        abandoned-cart recovery, and the Starter upsell nudge. Receipts and DNS /
        go-live instructions still send after payment. There is no way to remove an
        address from this list yet.
      </p>
      {sorted.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">No suppressed addresses.</p>
      ) : (
        <ul className="mt-4 max-h-64 divide-y divide-zinc-100 overflow-y-auto text-sm">
          {sorted.map((email) => (
            <li key={email} className="py-1.5 font-mono text-zinc-700">
              {email}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
