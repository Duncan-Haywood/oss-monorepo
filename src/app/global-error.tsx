"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary for errors thrown in the root layout itself, where
 * the normal error.tsx can't render because the layout never mounted.
 * Must ship its own <html>/<body>.
 *
 * It takes `error` only to log it. This boundary was discarding the argument,
 * so a failure in the root layout — the one failure that takes down every
 * screen at once — left no signal anywhere, while the route-level boundary
 * beside it logged the ordinary ones.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Unhandled error in the root layout", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Something broke</h1>
        <p style={{ color: "#666", fontSize: "0.9rem" }}>
          Your answers are safe — each one is saved as you make it.
        </p>
        <button
          onClick={reset}
          style={{
            marginTop: "1rem", padding: "0.6rem 1.2rem", borderRadius: "0.75rem",
            border: "none", background: "#f59e0b", fontWeight: 600, cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
