"use client";

import { useState, useTransition } from "react";
import { unsuppressEmailAction } from "@/app/dashboard/leads/actions";
import {
  suppressionReasonOrDefault,
  type SuppressionRecord,
} from "@/lib/email/suppression";

interface SuppressedEmailsPanelProps {
  emails: SuppressionRecord[];
}

/**
 * CAN-SPAM audit + override view. suppressEmail/isEmailSuppressed/getSuppressedEmails
 * (src/lib/db.ts) have been dual-backend and tested since suppression-convex-parity-fix,
 * but the list itself was never surfaced on any operator surface until
 * suppressed-emails-operator-visibility shipped this panel read-only. Remove
 * wires unsuppressEmailAction (unsuppress-email-operator-control) so an
 * operator can correct a mistaken/stale suppression without direct DB access.
 *
 * suppression-reason-visibility (2026-07-25) added the reason badge/grouping:
 * a bounce/complaint (deliverability signal, from the Resend webhook) is a
 * fundamentally different situation from a routine unsubscribe (customer
 * preference) and the old blanket "Remove only if suppressed by mistake"
 * copy was actively misleading for the former — a hard-bounced address is
 * usually a typo, safe to fix and re-add; a complaint should almost never be
 * removed.
 */
const SUPPRESSED_EMAILS_HEADING_ID = "suppressed-emails-heading";

const REASON_LABEL: Record<ReturnType<typeof suppressionReasonOrDefault>, string> = {
  unsubscribe: "Unsubscribed",
  bounce: "Bounced",
  complaint: "Complained",
};

const REASON_BADGE_CLASS: Record<ReturnType<typeof suppressionReasonOrDefault>, string> = {
  unsubscribe: "bg-zinc-100 text-zinc-600",
  bounce: "bg-amber-100 text-amber-800",
  complaint: "bg-red-100 text-red-800",
};

export function SuppressedEmailsPanel({ emails }: SuppressedEmailsPanelProps) {
  const [list, setList] = useState(emails);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const sorted = [...list].sort((a, b) => a.email.localeCompare(b.email));
  const bounceOrComplaintCount = sorted.filter(
    (r) => suppressionReasonOrDefault(r.reason) !== "unsubscribe",
  ).length;

  const handleRemove = (email: string) => {
    setError(null);
    startTransition(async () => {
      const res = await unsuppressEmailAction(email);
      if (!res.success) {
        setError(res.error ?? "Failed to remove address");
        return;
      }
      setList((prev) => prev.filter((r) => r.email !== email));
      // The just-clicked Remove button unmounts with its <li>; no other
      // control in this list is guaranteed to stay mounted (unlike the
      // toggle-button pattern in dashboard-focus-restore.ts), so focus
      // lands on the section heading rather than vanishing to <body>.
      document.getElementById(SUPPRESSED_EMAILS_HEADING_ID)?.focus();
    });
  };

  return (
    <section
      aria-labelledby={SUPPRESSED_EMAILS_HEADING_ID}
      className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id={SUPPRESSED_EMAILS_HEADING_ID}
          tabIndex={-1}
          className="text-lg font-semibold tracking-tight text-zinc-900 focus:outline-none"
        >
          Suppressed emails
        </h2>
        <p className="text-xs text-zinc-500">
          {sorted.length} address{sorted.length === 1 ? "" : "es"}
          {bounceOrComplaintCount > 0
            ? ` · ${bounceOrComplaintCount} bounced/complained`
            : ""}
        </p>
      </div>
      <p className="mt-2 text-sm text-zinc-600">
        Every address here is skipped by cold outreach (Email 1-3), abandoned-cart
        recovery, and the Starter upsell nudge. Receipts and DNS / go-live
        instructions still send after payment. <strong>Unsubscribed</strong> means the
        visitor opted out — remove it only if that was a mistake. <strong>Bounced</strong> /{" "}
        <strong>Complained</strong> come from Resend&apos;s own delivery events (a hard
        bounce or spam complaint) and are a sender-reputation signal, not a
        preference — only remove a bounce after confirming the address was a typo
        that&apos;s now fixed, and avoid removing a complaint at all.
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
          {sorted.map((record) => {
            const reason = suppressionReasonOrDefault(record.reason);
            return (
              <li
                key={record.email}
                className="flex items-center justify-between gap-2 py-1.5"
              >
                <span className="flex items-center gap-2">
                  <span className="font-mono text-zinc-700">{record.email}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${REASON_BADGE_CLASS[reason]}`}
                  >
                    {REASON_LABEL[reason]}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(record.email)}
                  disabled={isPending}
                  aria-label={`Remove ${record.email} from the suppression list`}
                  className="shrink-0 rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
