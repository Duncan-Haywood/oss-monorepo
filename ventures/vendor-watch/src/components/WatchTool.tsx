"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { DiffOp } from "@/lib/diff";
import DiffView from "./DiffView";

type CheckOutcome = "first_snapshot" | "unchanged" | "changed" | "inconclusive";

type CheckResult = {
  outcome: CheckOutcome;
  url: string;
  fetchedAt: string;
  httpStatus: number | null;
  errorMessage?: string;
  previous?: { fetchedAt: string; httpStatus: number | null };
  diff?: DiffOp[];
};

type ViewState = "idle" | "checking" | "done" | "error";

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function WatchTool() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<ViewState>("idle");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("checking");
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/watch/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await response.json()) as CheckResult | { error: string };
      if (!response.ok || "error" in data) {
        setError("error" in data ? data.error : "Something went wrong checking that URL.");
        setState("error");
        return;
      }
      setResult(data);
      setState("done");
    } catch {
      setError("Network error — could not reach the check endpoint.");
      setState("error");
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="watch-url" className="sr-only">
          Public page URL to check
        </label>
        <input
          id="watch-url"
          type="url"
          required
          placeholder="https://example.com/legal/terms"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={state === "checking"}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {state === "checking" ? "Checking…" : "Check for changes"}
        </button>
      </form>

      <p className="mt-3 text-xs text-slate-500">
        Demo store: snapshots are kept in a small, shared, in-memory cap (last ~200 URLs) —
        it may reset at any time and is not a permanent archive. Only check pages you are
        authorized to monitor.
      </p>

      {state === "error" && error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-6 space-y-3" data-testid="watch-result">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono text-slate-600 break-all">{result.url}</span>
            <StatusBadge outcome={result.outcome} />
          </div>

          <dl className="grid grid-cols-1 gap-2 text-xs text-slate-600 sm:grid-cols-2">
            {result.previous && (
              <div>
                <dt className="font-medium text-slate-500">Previous fetch</dt>
                <dd>
                  {formatTimestamp(result.previous.fetchedAt)}
                  {result.previous.httpStatus !== null && ` — HTTP ${result.previous.httpStatus}`}
                </dd>
              </div>
            )}
            <div>
              <dt className="font-medium text-slate-500">This fetch</dt>
              <dd>
                {formatTimestamp(result.fetchedAt)}
                {result.httpStatus !== null ? ` — HTTP ${result.httpStatus}` : " — no response"}
              </dd>
            </div>
          </dl>

          {result.outcome === "first_snapshot" && (
            <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-700">
              First snapshot captured — check again later to see what changed.
            </p>
          )}

          {result.outcome === "unchanged" && (
            <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-700">
              No changes detected since the previous snapshot.
            </p>
          )}

          {result.outcome === "changed" && result.diff && (
            <>
              <p className="text-sm text-slate-700">
                Text changed since the previous snapshot. Removed text is struck through in
                red, added text is highlighted in green.
              </p>
              <DiffView diff={result.diff} />
            </>
          )}

          {result.outcome === "inconclusive" && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Inconclusive — this fetch did not succeed, so no comparison could be made.
              {result.errorMessage ? ` Detail: ${result.errorMessage}` : ""} This is not the
              same as &ldquo;no change&rdquo;: the page may or may not have changed since the
              last successful fetch.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ outcome }: { outcome: CheckOutcome }) {
  const styles: Record<CheckOutcome, string> = {
    first_snapshot: "bg-slate-100 text-slate-700",
    unchanged: "bg-slate-100 text-slate-700",
    changed: "bg-amber-100 text-amber-800",
    inconclusive: "bg-red-100 text-red-800",
  };
  const labels: Record<CheckOutcome, string> = {
    first_snapshot: "First snapshot",
    unchanged: "No change",
    changed: "Changed",
    inconclusive: "Inconclusive",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[outcome]}`}>
      {labels[outcome]}
    </span>
  );
}
