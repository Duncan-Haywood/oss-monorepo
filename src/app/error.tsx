"use client"; // Error boundaries must be Client Components (Next.js 16 app router convention)

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorBoundary({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Server Component errors already get a generic message + digest here (Next.js
    // scrubs details in production) — logging client-side still surfaces the digest
    // for matching against server logs without leaking anything new.
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col items-center px-6 py-24 text-center sm:py-32">
      <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">
        Something went wrong
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
        This page hit a snag
      </h1>
      <p className="mt-4 text-lg leading-8 text-zinc-600">
        It&rsquo;s not you — try again, or head back to the homepage.
        {error.digest && (
          <span className="mt-2 block text-sm text-zinc-400">Reference: {error.digest}</span>
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
