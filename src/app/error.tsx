"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Route-level error boundary. Without this, any render-time throw shows
 * Next's blank default screen with no way out — the worst possible outcome
 * mid-session, since it looks like the answers were lost (they weren't;
 * every answer is committed server-side as it happens).
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Unhandled error", error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      <div className="text-4xl">😕</div>
      <h1 className="text-xl font-bold">Something broke</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Your answers are safe — every one is saved the moment you make it.
      </p>
      <div className="mt-2 flex gap-2">
        <button
          onClick={reset}
          className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-neutral-950"
        >
          Try again
        </button>
        <Link
          href="/app"
          className="rounded-xl border-2 border-neutral-300 px-4 py-2.5 text-sm font-semibold dark:border-neutral-700"
        >
          Back to swiping
        </Link>
      </div>
      {error.digest && <p className="text-[11px] text-neutral-400">Reference: {error.digest}</p>}
    </main>
  );
}
