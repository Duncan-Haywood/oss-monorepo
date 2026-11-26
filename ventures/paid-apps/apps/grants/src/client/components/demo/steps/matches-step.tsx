// Step 3: grant matches. Four imagined opportunities scored for fit, likelihood and expected value
// (likelihood × the ask, the real matcher's formula), ranked the way the real list is, with reasons
// that open the facts behind them.

import { formatPercent } from "@client/components/grants/format";
import { EligibilityBadge, FitMeter } from "@client/components/grants/match-badges";
import { Badge, Card } from "@client/components/ui";
import { formatCents } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { AlertTriangle, Building2, CalendarClock, CheckCircle2, Trophy } from "lucide-react";
import { DEMO_ORG, type DemoOpportunity } from "../data";
import { FactChip } from "../demo-bits";
import { expectedValueCents, type FactStatuses, rankOpportunities } from "../model";

function Reasons({ opp, statuses }: { opp: DemoOpportunity; statuses: FactStatuses }) {
  return (
    <ul className="space-y-3">
      {opp.reasons.map((r) => (
        <li key={r.text} className="flex gap-2.5">
          {r.tone === "fit" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-600" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-600" aria-hidden />
          )}
          <div className="min-w-0 space-y-1.5">
            <p className="text-sm text-neutral-700">
              <span className="sr-only">{r.tone === "fit" ? "Strength: " : "Watch out: "}</span>
              {r.text}
            </p>
            {r.factIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {r.factIds.map((id) => (
                  <FactChip key={id} factId={id} statuses={statuses} />
                ))}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function MatchesStep({
  selectedId,
  onSelect,
  statuses,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
  statuses: FactStatuses;
}) {
  const ranked = rankOpportunities();
  const [first, second] = ranked;
  const selected = ranked.find((o) => o.id === selectedId) ?? first;
  if (!first || !second || !selected) return null;
  const rank = ranked.indexOf(selected) + 1;

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-neutral-600">
        Grant Autopilot reads new grant listings every day and scores each one against the fact
        base. Expected value is the chance of winning times the amount {DEMO_ORG.shortName} would
        ask for, and the list is ranked by it.
      </p>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ol aria-label="Ranked grant matches" className="space-y-3">
          {ranked.map((o, i) => {
            const isSelected = o.id === selected.id;
            return (
              <li key={o.id}>
                <Card
                  className={cn(
                    "transition-shadow",
                    isSelected ? "border-brand-500 ring-1 ring-brand-500" : "hover:shadow-md",
                    o.eligibility === "ineligible" && !isSelected && "opacity-75",
                  )}
                >
                  <article
                    aria-labelledby={`demo-opp-${o.id}`}
                    className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_11rem]"
                  >
                    <div className="min-w-0 space-y-1.5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        #{i + 1}
                      </p>
                      <h3
                        id={`demo-opp-${o.id}`}
                        className="font-semibold leading-snug text-neutral-900"
                      >
                        {o.title}
                      </h3>
                      <p className="flex items-center gap-1.5 text-sm text-neutral-600">
                        <Building2 className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
                        <span className="truncate">{o.funder}</span>
                      </p>
                      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        <span className="font-medium text-neutral-900">{o.awardRange}</span>
                        <span className="inline-flex items-center gap-1 text-neutral-600">
                          <CalendarClock className="h-4 w-4" aria-hidden />
                          Closes in {o.closesInDays} days
                        </span>
                      </p>
                      <p className="text-sm text-neutral-500">{o.summary}</p>
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => onSelect(o.id)}
                        className="mt-1 text-sm font-medium text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
                      >
                        {isSelected ? "Showing why" : "Why this score?"}
                        <span className="sr-only"> for {o.title}</span>
                      </button>
                    </div>
                    <div className="space-y-2 border-t border-neutral-100 pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
                      <FitMeter score={o.fitScore} />
                      <div className="flex flex-wrap gap-1.5">
                        <EligibilityBadge eligibility={o.eligibility} />
                        <Badge tone="info">{formatPercent(o.likelihood)} likely</Badge>
                      </div>
                      <p className="text-xs text-neutral-500">
                        Expected value{" "}
                        <span className="font-semibold text-neutral-900 tabular-nums">
                          {formatCents(expectedValueCents(o))}
                        </span>
                      </p>
                    </div>
                  </article>
                </Card>
              </li>
            );
          })}
        </ol>

        <section
          aria-labelledby="demo-why-title"
          aria-live="polite"
          className="h-fit rounded-xl border border-neutral-200 bg-white p-5 shadow-card lg:sticky lg:top-24"
        >
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-700">
            {rank === 1 && <Trophy className="h-3.5 w-3.5" aria-hidden />}
            Ranked #{rank} of {ranked.length}
          </p>
          <h3 id="demo-why-title" className="mt-1 text-lg font-semibold text-neutral-900">
            {rank === 1
              ? `Why ${selected.title} ranks first`
              : `Why ${selected.title} scores this way`}
          </h3>
          <dl className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-neutral-50 p-3 text-center">
            <div>
              <dt className="text-xs text-neutral-500">Fit</dt>
              <dd className="font-semibold tabular-nums text-neutral-900">
                {selected.fitScore}/100
              </dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Likelihood</dt>
              <dd className="font-semibold tabular-nums text-neutral-900">
                {formatPercent(selected.likelihood)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">Expected value</dt>
              <dd className="font-semibold tabular-nums text-neutral-900">
                {formatCents(expectedValueCents(selected))}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-neutral-600">
            {formatPercent(selected.likelihood)} chance × {formatCents(selected.askCents)} ask ={" "}
            {formatCents(expectedValueCents(selected))}.{" "}
            {rank === 1 &&
              `${second.title} comes close (${formatCents(expectedValueCents(second))}), but it rests on a ${formatPercent(second.likelihood)} chance and a much larger ask, so this one ranks first.`}
          </p>
          <h4 className="mt-5 text-sm font-semibold text-neutral-900">
            Reasons, with the facts behind them
          </h4>
          <div className="mt-3">
            <Reasons opp={selected} statuses={statuses} />
          </div>
        </section>
      </div>
    </div>
  );
}
