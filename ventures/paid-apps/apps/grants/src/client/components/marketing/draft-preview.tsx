// Hero illustration: a static, clearly labeled example of a cited draft. The mock itself is hidden from
// assistive tech; the visible figcaption says what it shows. Every number in a "verified" sentence also
// appears in its source quote, as the real grounding checker requires.
import { cn } from "@client/lib/cn";
import { CircleCheck, FileText, Flag } from "lucide-react";
import type * as React from "react";

function Cite({ n }: { n: number }) {
  return (
    <sup className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-brand-100 px-1 align-[0.35em] text-[0.65rem] font-semibold leading-none text-brand-800">
      {n}
    </sup>
  );
}

function Source({ n, title, quote }: { n: number; title: string; quote: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-brand-100 text-[0.7rem] font-semibold text-brand-800">
        {n}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-neutral-700">{title}</p>
        <p className="mt-0.5 text-xs italic leading-relaxed text-neutral-500">{quote}</p>
      </div>
    </li>
  );
}

export function DraftPreview({ className }: { className?: string }) {
  return (
    <figure className={cn("relative isolate", className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-brand-100/70 via-white to-accent-100/60 blur-2xl"
      />
      <div
        aria-hidden
        className="select-none overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-overlay motion-safe:animate-scale-in"
      >
        <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-5 py-3">
          <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-neutral-800">
            <FileText className="h-4 w-4 shrink-0 text-brand-600" />
            <span className="truncate">Program narrative</span>
          </div>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[0.7rem] font-medium uppercase tracking-wide text-neutral-600">
            Example
          </span>
        </div>

        <div className="space-y-3 px-5 py-4 text-[0.9rem] leading-relaxed text-neutral-700">
          <p>
            Last year our pantry provided groceries to 1,240 households across two counties.
            <Cite n={1} /> Volunteers gave 6,112 hours of their time.
            <Cite n={2} />
          </p>
          <p className="rounded-md bg-warning-50 px-2 py-1.5 ring-1 ring-inset ring-warning-200">
            <span className="text-neutral-800">
              We expect to double the number of families we serve.
            </span>
            <span className="mt-1 flex items-center gap-1.5 text-xs font-medium text-warning-900">
              <Flag className="h-3.5 w-3.5" />
              Not found in your records. Confirm it or remove it.
            </span>
          </p>
        </div>

        <div className="border-t border-neutral-100 bg-neutral-50/70 px-5 py-4">
          <p className="mb-2.5 text-[0.7rem] font-semibold uppercase tracking-wider text-neutral-500">
            Sources
          </p>
          <ul className="space-y-2.5">
            <Source
              n={1}
              title="2025 Annual Report, page 4"
              quote="“…provided groceries to 1,240 households across two counties…”"
            />
            <Source
              n={2}
              title="Volunteer log summary"
              quote="“Total volunteer hours for the year: 6,112.”"
            />
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 px-5 py-3">
          <span className="flex items-center gap-1.5 text-xs text-neutral-600">
            <CircleCheck className="h-4 w-4 text-success-600" />2 claims verified · 1 flagged
          </span>
          <span className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white">
            Waiting for your approval
          </span>
        </div>
      </div>
      <figcaption className="mt-4 text-center text-sm text-neutral-500">
        An example draft for a fictional food pantry. Each sentence points to its source, and the
        claim nothing supports is flagged for a person.
      </figcaption>
    </figure>
  );
}
