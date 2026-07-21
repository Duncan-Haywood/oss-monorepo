"use client";

import { useState, useTransition } from "react";

/**
 * Post-checkout self-serve link into Stripe Billing Portal (card / invoices / cancel).
 */
export function ManageBillingButton({ sessionId }: { sessionId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const openPortal = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/stripe/billing-portal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            returnUrl: `${window.location.origin}/checkout/success?session_id=${encodeURIComponent(sessionId)}`,
          }),
        });
        const data = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !data.url) {
          setError(data.error ?? "Could not open billing portal");
          return;
        }
        window.location.href = data.url;
      } catch {
        setError("Could not open billing portal");
      }
    });
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={openPortal}
        className="inline-flex h-12 items-center justify-center rounded-full bg-zinc-900 px-8 font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60"
      >
        {isPending ? "Opening…" : "Manage subscription"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
