"use client";

/**
 * Last-resort boundary for errors thrown in the root layout itself, where
 * the normal error.tsx can't render because the layout never mounted.
 * Must ship its own <html>/<body>.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
