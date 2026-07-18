"use client";

import { useState, useTransition } from "react";
import { sendDailyDigestAction } from "@/app/dashboard/leads/actions";

/** Operator-triggered send of the daily digest email — see /docs/process. */
export function DailyDigestButton() {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<
    { kind: "success"; itemCount: number; mock: boolean } | { kind: "error"; message: string } | null
  >(null);

  const handleClick = () => {
    startTransition(async () => {
      const res = await sendDailyDigestAction();
      if (!res.success) {
        setStatus({ kind: "error", message: res.error });
        return;
      }
      // Use the digest's own true pre-slice total across every section
      // (actionableItemCount, backed by the same isEmpty source of truth) —
      // not a hand-summed subset. A prior version summed only 4 of the
      // digest's ~19 sections, so a digest whose only actionable items were
      // e.g. marketingPacksDue or commerceCatalogsMissing displayed "nothing
      // urgent today" here while the email just sent listed real items.
      setStatus({ kind: "success", itemCount: res.digest.actionableItemCount, mock: res.mock });
    });
  };

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 md:mt-0">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50"
      >
        {isPending ? "Sending digest…" : "Send daily digest"}
      </button>
      {status?.kind === "success" ? (
        <p className="text-xs text-emerald-700">
          Sent{status.mock ? " (mock — RESEND_API_KEY not configured)" : ""} —{" "}
          {status.itemCount === 0
            ? "nothing urgent today"
            : `${status.itemCount} item${status.itemCount === 1 ? "" : "s"} to act on`}
          .
        </p>
      ) : null}
      {status?.kind === "error" ? (
        <p className="text-xs text-rose-700">{status.message}</p>
      ) : null}
    </div>
  );
}
