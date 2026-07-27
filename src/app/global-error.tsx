"use client"; // Error boundaries must be Client Components (Next.js 16 app router convention)

import { useEffect, useRef } from "react";
import Link from "next/link";
import { brand } from "@/lib/brand";
import "./globals.css";

/**
 * Root-layout error boundary. error.tsx (src/app/error.tsx) wraps every
 * segment's page/layout below the root layout, but per Next's own file-
 * convention docs (node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/error.md — "It does not wrap the layout.js ... above
 * it in the same segment. To handle errors in the root layout, use
 * global-error.js") it does NOT catch a throw from src/app/layout.tsx
 * itself or its direct children (SiteHeader/SiteFooter render on every
 * page). Without this file, a root-layout render failure fell through to
 * Next's generic unbranded fallback — the same class of gap
 * branded-error-not-found-pages closed for segment-level errors and
 * unmatched routes, just missed for this one boundary.
 *
 * global-error replaces the root layout entirely while active, so it must
 * define its own <html>/<body> and import the global stylesheet directly —
 * metadata/generateMetadata are not supported here (Client Component).
 * Keep this minimal and dependency-light: it must not itself risk throwing
 * (no SiteHeader/SiteFooter, no data fetching) since there is no boundary
 * above it to catch a secondary failure.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    console.error(error);
    // Same rationale as src/app/error.tsx's own heading-focus effect: Next's
    // route announcer only fires on a navigation, and this boundary (the root
    // layout's own fallback) can mount without one too.
    headingRef.current?.focus();
  }, [error]);

  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col items-center justify-center bg-white text-zinc-900">
        <main className="mx-auto flex max-w-3xl flex-col items-center px-6 py-24 text-center sm:py-32">
          <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">
            Something went wrong
          </p>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="mt-4 text-3xl font-semibold tracking-tight text-zinc-900 outline-none sm:text-4xl"
          >
            {brand.isConfigured ? brand.name : "This site"} hit a snag
          </h1>
          <p className="mt-4 text-lg leading-8 text-zinc-600">
            {`It’s not you — try again, or come back in a moment.${
              error.digest ? ` Reference: ${error.digest}` : ""
            }`}
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
      </body>
    </html>
  );
}
