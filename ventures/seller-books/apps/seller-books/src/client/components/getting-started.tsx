// The first-run checklist on the Profit & loss page (src/shared/getting-started.ts). Each step is read
// from the books, so it ticks itself; it disappears once every step is done. "Hide" is a per-browser
// convenience only (localStorage, which may be unavailable), never the record of anything.
import type { GettingStarted } from "@shared/getting-started";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { api, orgPath } from "../lib/api";

const hideKey = (orgId: string) => `seller-books:getting-started-hidden:${orgId}`;

function readHidden(orgId: string): boolean {
  try {
    return window.localStorage.getItem(hideKey(orgId)) === "1";
  } catch {
    return false;
  }
}

function writeHidden(orgId: string) {
  try {
    window.localStorage.setItem(hideKey(orgId), "1");
  } catch {
    // Storage blocked: the card hides for this page view only.
  }
}

export function GettingStartedCard({ orgId, canEdit }: { orgId: string; canEdit: boolean }) {
  const [hidden, setHidden] = useState(() => readHidden(orgId));
  const q = useQuery({
    queryKey: ["getting-started", orgId],
    queryFn: () => api<GettingStarted>(orgPath(orgId, "/getting-started")),
    enabled: canEdit && !hidden,
  });
  const g = q.data;
  if (!canEdit || hidden || !g || g.allDone) return null;
  return (
    <section className="card" aria-labelledby="getting-started-title">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 id="getting-started-title" className="mr-auto font-medium">
          Getting started: {g.doneCount} of {g.steps.length} done
        </h2>
        <button
          type="button"
          className="text-xs text-stone-500 underline"
          onClick={() => {
            writeHidden(orgId);
            setHidden(true);
          }}
        >
          Hide
        </button>
      </div>
      <ol className="space-y-2">
        {g.steps.map((s) => (
          <li key={s.key} className="flex gap-3" data-step={s.key} data-done={s.done}>
            <span
              aria-hidden="true"
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                s.done ? "bg-brand-700 text-white" : "border border-stone-300 text-stone-400"
              }`}
            >
              {s.done ? "✓" : ""}
            </span>
            <div className="min-w-0">
              <p className={`text-sm ${s.done ? "text-stone-500" : "font-medium"}`}>
                <span className="sr-only">{s.done ? "Done: " : "To do: "}</span>
                {s.done ? (
                  s.title
                ) : (
                  <Link
                    to={`/o/$orgId${s.to}`}
                    params={{ orgId }}
                    className="text-brand-700 underline"
                  >
                    {s.title}
                  </Link>
                )}
              </p>
              <p className="text-xs text-stone-600">{s.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
