"use client";

import { useState, useTransition } from "react";
import { unsuppressEmailAction } from "@/app/dashboard/leads/actions";

interface SuppressedEmailsPanelProps {
  emails: string[];
}

/**
 * CAN-SPAM audit + override view. suppressEmail/isEmailSuppressed/getSuppressedEmails
 * (src/lib/db.ts) have been dual-backend and tested since suppression-convex-parity-fix,
 * but the list itself was never surfaced on any operator surface until
 * suppressed-emails-operator-visibility shipped this panel read-only. Remove
 * wires unsuppressEmailAction (unsuppress-email-operator-control) so an
 * operator can correct a mistaken/stale suppression without direct DB access.
 */
const SUPPRESSED_EMAILS_HEADING_ID = "suppressed-emails-heading";

export function SuppressedEmailsPanel({ emails }: SuppressedEmailsPanelProps) {
  const [list, setList] = useState(emails);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const sorted = [...list].sort((a, b) => a.localeCompare(b));

  const handleRemove = (email: string) => {
    setError(null);
    startTransition(async () => {
      const res = await unsuppressEmailAction(email);
      if (!res.success) {
        setError(res.error ?? "Failed to remove address");
        return;
      }
      setList((prev) => prev.filter((e) => e !== email));
      // The just-clicked Remove button unmounts with its <li>; no other
      // control in this list is guaranteed to stay mounted (unlike the
      // toggle-button pattern in dashboard-focus-restore.ts), so focus
      // lands on the section heading rather than vanishing to <body>.
      document.getElementById(SUPPRESSED_EMAILS_HEADING_ID)?.focus();
    });
  };

  return (
    <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id={SUPPRESSED_EMAILS_HEADING_ID}
          tabIndex={-1}
          className="text-lg font-semibold tracking-tight text-zinc-900 focus:outline-none"
        >
          Suppressed emails (CAN-SPAM opt-outs)
        </h2>
        <p className="text-xs text-zinc-500">
          {sorted.length} address{sorted.length === 1 ? "" : "es"}
        </p>
      </div>
      <p className="mt-2 text-sm text-zinc-600">
        These addresses unsubscribed and are skipped by cold outreach (Email 1-3),
        abandoned-cart recovery, and the Starter upsell nudge. Receipts and DNS /
        go-live instructions still send after payment. Remove an address only if
        it was suppressed by mistake — the visitor did not re-request contact.
      </p>
      {error ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {sorted.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">No suppressed addresses.</p>
      ) : (
        <ul
          className="mt-4 max-h-64 divide-y divide-zinc-100 overflow-y-auto text-sm"
          aria-live="polite"
          aria-relevant="removals"
        >
          {sorted.map((email) => (
            <li
              key={email}
              className="flex items-center justify-between gap-2 py-1.5"
            >
              <span className="font-mono text-zinc-700">{email}</span>
              <button
                type="button"
                onClick={() => handleRemove(email)}
                disabled={isPending}
                aria-label={`Remove ${email} from the suppression list`}
                className="shrink-0 rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
