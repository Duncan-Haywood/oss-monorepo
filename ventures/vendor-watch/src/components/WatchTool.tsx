"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import type { DiffOp } from "@/lib/diff";
import {
  browserBaselineStorage,
  getBaseline,
  listBaselines,
  removeBaseline,
  saveBaseline,
  type Baseline,
  type BaselineStorage,
} from "@/lib/baseline-store";
import DiffView from "./DiffView";

// The watch list lives in localStorage, which React cannot see. Reading it in
// an effect and pushing it into state would render the empty list first and
// then replace it; useSyncExternalStore is the supported way to read a browser
// store, and it hydrates against getServerSnapshot so the server markup and the
// first client render still agree.

const EMPTY_LIST: Baseline[] = [];

let cachedStorage: BaselineStorage | null | undefined;

function storageHandle(): BaselineStorage | null {
  if (cachedStorage === undefined) cachedStorage = browserBaselineStorage();
  return cachedStorage;
}

const listeners = new Set<() => void>();
let version = 0;
let cachedVersion = -1;
let cachedList: Baseline[] = EMPTY_LIST;

// useSyncExternalStore re-renders whenever getSnapshot returns a new reference,
// so the parse is cached behind a version counter rather than re-run per render.
// A baseline can hold 20k characters and there can be 50 of them.
function baselinesSnapshot(): Baseline[] {
  if (cachedVersion !== version) {
    cachedList = listBaselines(storageHandle());
    cachedVersion = version;
  }
  return cachedList;
}

function baselinesServerSnapshot(): Baseline[] {
  return EMPTY_LIST;
}

function subscribeToBaselines(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function baselinesChanged(): void {
  version += 1;
  // forEach rather than for...of: this project's tsconfig target does not
  // allow iterating a Set directly.
  listeners.forEach((listener) => listener());
}

type CheckOutcome = "first_snapshot" | "unchanged" | "changed" | "inconclusive";

type CheckResult = {
  outcome: CheckOutcome;
  url: string;
  fetchedAt: string;
  httpStatus: number | null;
  errorMessage?: string;
  previous?: { fetchedAt: string; httpStatus: number | null };
  diff?: DiffOp[];
  snapshot?: Baseline;
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
  const [storageWarning, setStorageWarning] = useState(false);
  const watched = useSyncExternalStore(
    subscribeToBaselines,
    baselinesSnapshot,
    baselinesServerSnapshot,
  );

  const runCheck = useCallback(async (target: string) => {
    const storage = storageHandle();
    setState("checking");
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/watch/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Always send the baseline field, even as null. Its presence is what
        // tells the server this visitor keeps their own history, so the
        // shared demo store never answers on their behalf.
        body: JSON.stringify({ url: target, baseline: getBaseline(storage, target) }),
      });
      const data = (await response.json()) as CheckResult | { error: string };
      if (!response.ok || "error" in data) {
        setError("error" in data ? data.error : "Something went wrong checking that URL.");
        setState("error");
        return;
      }
      setResult(data);
      setState("done");
      // An inconclusive check carries no snapshot, so the existing baseline
      // stays put and the next successful check still compares against the
      // last page text actually seen.
      if (data.snapshot) {
        setStorageWarning(!saveBaseline(storage, data.snapshot));
        baselinesChanged();
      }
    } catch {
      setError("Network error — could not reach the check endpoint.");
      setState("error");
    }
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runCheck(url);
  }

  function handleForget(target: string) {
    removeBaseline(storageHandle(), target);
    baselinesChanged();
    if (result?.url === target) {
      setResult(null);
      setState("idle");
    }
  }

  return (
    <div className="space-y-6">
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
          Snapshots are kept in this browser, not on the server — they survive a restart, they
          are never shown to anyone else, and clearing your site data or switching devices
          starts the watch over. This is a change record, not an archive of record.
        </p>

        {storageWarning && (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            This browser would not let the page store a snapshot, so the comparison above could
            not be saved. The next check will read as a first snapshot. Private-browsing windows
            and blocked site data both do this.
          </p>
        )}

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
                First snapshot captured — it is saved in this browser. Check again later to see
                what changed.
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
                last successful fetch. Your previous snapshot was kept.
              </p>
            )}
          </div>
        )}
      </div>

      {watched.length > 0 && (
        <section
          aria-labelledby="watch-list-heading"
          data-testid="watch-list"
          className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 id="watch-list-heading" className="text-sm font-semibold text-slate-900">
            Pages you are watching
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Saved in this browser. Re-check one to see what has changed since the snapshot shown.
          </p>
          <ul className="mt-4 divide-y divide-slate-100">
            {watched.map((entry) => (
              <li
                key={entry.url}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs text-slate-700">{entry.url}</p>
                  <p className="text-xs text-slate-500">
                    Snapshot from {formatTimestamp(entry.fetchedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={state === "checking"}
                    onClick={() => {
                      setUrl(entry.url);
                      void runCheck(entry.url);
                    }}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                  >
                    Re-check
                  </button>
                  <button
                    type="button"
                    onClick={() => handleForget(entry.url)}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Forget
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
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
