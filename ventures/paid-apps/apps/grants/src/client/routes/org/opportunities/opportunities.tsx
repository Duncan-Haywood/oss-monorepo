// OWNER: grants UI agent — opportunity catalog matched to this org, sorted by expected value.
import { ApiErrorAlert } from "@client/components/grants/api-error-alert";
import { ImportGrantMenu } from "@client/components/grants/import-grant";
import { OpportunityCard } from "@client/components/grants/opportunity-card";
import {
  applyClientFilters,
  sortByExpectedValue,
} from "@client/components/grants/opportunity-list";
import {
  type OpportunityFilters,
  useOpportunities,
  useOrgId,
  useRescoreMatches,
} from "@client/components/grants/queries";
import {
  Alert,
  Button,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
  Spinner,
} from "@client/components/ui";
import type { OpportunityStatus } from "@shared/enums";
import { RefreshCw, Search } from "lucide-react";
import * as React from "react";

const STATUS_OPTIONS: { value: OpportunityStatus | ""; label: string }[] = [
  { value: "", label: "Open & forecasted" },
  { value: "posted", label: "Open now" },
  { value: "forecasted", label: "Forecasted" },
  { value: "closed", label: "Closed" },
];
const CLOSING_OPTIONS = [
  { value: "", label: "Any time" },
  { value: "14", label: "Next 2 weeks" },
  { value: "30", label: "Next 30 days" },
  { value: "60", label: "Next 60 days" },
  { value: "90", label: "Next 90 days" },
];
const FIT_OPTIONS = [
  { value: 0, label: "Any fit" },
  { value: 40, label: "40+ (moderate)" },
  { value: 60, label: "60+" },
  { value: 70, label: "70+ (strong)" },
  { value: 85, label: "85+" },
];

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function OpportunitiesPage() {
  const orgId = useOrgId();
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState<OpportunityStatus | "">("");
  const [closingWithinDays, setClosingWithinDays] = React.useState("");
  const [minFit, setMinFit] = React.useState(0);
  const [showDismissed, setShowDismissed] = React.useState(false);
  const debouncedQ = useDebounced(q, 300);

  const filters: OpportunityFilters = { q: debouncedQ, status, closingWithinDays };
  const list = useOpportunities(orgId, filters);
  const rescore = useRescoreMatches(orgId);

  const all = list.data?.items ?? [];
  const visible = sortByExpectedValue(applyClientFilters(all, { minFit, showDismissed }));
  const hiddenDismissed = showDismissed
    ? 0
    : all.filter((o) => o.match?.status === "dismissed").length;
  const unscored = all.filter((o) => !o.match).length;
  const filtersActive = !!(q || status || closingWithinDays || minFit);

  const ids = {
    q: React.useId(),
    status: React.useId(),
    closing: React.useId(),
    fit: React.useId(),
    dismissed: React.useId(),
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Grant opportunities"
        description="Grants matched to your mission, ranked by expected value (likelihood × suggested ask)."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => rescore.mutate()}
              loading={rescore.isPending}
              title="Re-evaluate fit and likelihood using your latest facts"
            >
              {!rescore.isPending && <RefreshCw className="h-4 w-4" aria-hidden />}
              Rescore matches
            </Button>
            <ImportGrantMenu orgId={orgId} />
          </>
        }
      />

      {rescore.isSuccess && (
        <Alert tone="success" title="Rescoring started">
          Scores are being recalculated from your latest fact base. This list will refresh
          automatically.
        </Alert>
      )}
      <ApiErrorAlert error={rescore.error} title="Couldn't start rescoring" />

      <section
        aria-label="Search and filters"
        className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]"
      >
        <div className="space-y-1 sm:col-span-2 lg:col-span-1">
          <Label htmlFor={ids.q}>Search</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400"
              aria-hidden
            />
            <Input
              id={ids.q}
              type="search"
              className="pl-9"
              placeholder="Workforce, construction trades, Navajo Nation…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor={ids.status}>Status</Label>
          <Select
            id={ids.status}
            value={status}
            onChange={(e) => setStatus(e.target.value as OpportunityStatus | "")}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={ids.closing}>Closing within</Label>
          <Select
            id={ids.closing}
            value={closingWithinDays}
            onChange={(e) => setClosingWithinDays(e.target.value)}
          >
            {CLOSING_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={ids.fit}>Minimum fit</Label>
          <Select
            id={ids.fit}
            value={String(minFit)}
            onChange={(e) => setMinFit(Number(e.target.value))}
          >
            {FIT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-end pb-2">
          <label
            htmlFor={ids.dismissed}
            className="flex items-center gap-2 text-sm text-neutral-700"
          >
            <input
              id={ids.dismissed}
              type="checkbox"
              className="h-4 w-4 rounded border-neutral-300 text-brand-600"
              checked={showDismissed}
              onChange={(e) => setShowDismissed(e.target.checked)}
            />
            Show dismissed
          </label>
        </div>
      </section>

      {list.isPending ? (
        <Spinner label="Loading opportunities" />
      ) : list.error ? (
        <ApiErrorAlert error={list.error} title="Couldn't load opportunities" />
      ) : visible.length === 0 ? (
        all.length === 0 && !filtersActive ? (
          <EmptyState
            title="No opportunities yet"
            description="New grants are discovered daily from Grants.gov and other sources. You can also import a grant you found yourself."
            action={<ImportGrantMenu orgId={orgId} />}
          />
        ) : (
          <EmptyState
            title="No grants match these filters"
            description={
              hiddenDismissed > 0
                ? `${hiddenDismissed} dismissed grant${hiddenDismissed === 1 ? " is" : "s are"} hidden. Try "Show dismissed" or loosen the filters.`
                : "Try a broader search, a longer closing window or a lower minimum fit."
            }
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setQ("");
                  setStatus("");
                  setClosingWithinDays("");
                  setMinFit(0);
                }}
              >
                Clear filters
              </Button>
            }
          />
        )
      ) : (
        <>
          <p className="text-sm text-neutral-500" aria-live="polite">
            Showing {visible.length} of {all.length} grant{all.length === 1 ? "" : "s"}
            {hiddenDismissed > 0 && ` · ${hiddenDismissed} dismissed hidden`}
            {unscored > 0 && ` · ${unscored} not yet scored`}
            {list.isFetching && " · updating…"}
          </p>
          <ul className="space-y-3">
            {visible.map((o) => (
              <li key={o.id}>
                <OpportunityCard opportunity={o} orgId={orgId} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
