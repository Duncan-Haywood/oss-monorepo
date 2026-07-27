"use client"; // Error boundaries must be Client Components (Next.js 16 app router convention)

import { useEffect, useRef } from "react";
import Link from "next/link";

export default function ErrorBoundary({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // Server Component errors already get a generic message + digest here (Next.js
    // scrubs details in production) — logging client-side still surfaces the digest
    // for matching against server logs without leaking anything new.
    console.error(error);
    // Next's built-in route announcer (docs/03-architecture/accessibility.md)
    // only fires on a route transition — it inspects document.title/<h1> after
    // a navigation completes. This boundary can also mount with no navigation
    // at all (a client-side interaction throws mid-page), so a screen reader
    // user gets no cue that the page swapped to this fallback UI unless focus
    // is moved here explicitly (error-boundary-heading-focus-on-mount).
    headingRef.current?.focus();
  }, [error]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col items-center px-6 py-24 text-center sm:py-32">
      <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">
        Something went wrong
      </p>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mt-4 text-3xl font-semibold tracking-tight text-zinc-900 outline-none sm:text-4xl"
      >
        This page hit a snag
      </h1>
      <p className="mt-4 text-lg leading-8 text-zinc-600">
        It&rsquo;s not you — try again, or head back to the homepage.
        {error.digest && (
          <span className="mt-2 block text-sm text-zinc-500">Reference: {error.digest}</span>
        )}
      </p>
      <div className="mt-10 flex flex-col gap-4 sm:flex-row">
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="inline-flex h-12 items-center justify-center rounded-full bg-zinc-900 px-8 font-medium text-white transition-colors hover:bg-zinc-700"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex h-12 items-center justify-center rounded-full border border-zinc-300 px-8 font-medium text-zinc-900 transition-colors hover:border-zinc-400"
        >
          Back to homepage
        </Link>
      </div>
    </main>
  );
}
