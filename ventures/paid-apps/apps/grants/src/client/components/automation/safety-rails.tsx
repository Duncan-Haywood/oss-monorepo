// The safety rails every automatic submission must pass. Never configurable, so rendered as a
// locked, read-only list (no controls), at every level and for every role.
import { Lock, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { SAFETY_RAILS } from "./levels";

/** `help`: optional element after the heading (e.g. a guide HelpTip). */
export function SafetyRailsList({ help }: { help?: ReactNode }) {
  return (
    <section aria-labelledby="safety-rails-heading" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-success-600" aria-hidden />
        <h3 id="safety-rails-heading" className="font-semibold text-neutral-900">
          Safety rails
        </h3>
        {help}
        <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
          <Lock className="h-3 w-3" aria-hidden />
          Always on, at every level
        </span>
      </div>
      <p className="text-sm text-neutral-500">
        Nothing is ever submitted automatically unless all of these pass. They can't be turned off,
        by anyone.
      </p>
      <ul className="grid gap-2 sm:grid-cols-2" aria-label="Safety rails (always on)">
        {SAFETY_RAILS.map((r) => (
          <li
            key={r.key}
            data-rail={r.key}
            className="flex gap-2.5 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2"
          >
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" aria-label="Locked" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-neutral-900">{r.label}</p>
              <p className="text-xs text-neutral-500">{r.help}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
