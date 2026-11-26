// OWNER: knowledge UI agent — the fact base: coverage, filters, fact cards with provenance.
import { ApiErrorAlert } from "@client/components/grants/api-error-alert";
import { HelpTip } from "@client/components/guide/help-tip";
import { TakeTourButton } from "@client/components/guide/tour";
import { FACT_BASE_TOUR } from "@client/components/guide/tours";
import { AddFactForm } from "@client/components/knowledge/add-fact-form";
import { CoveragePanel } from "@client/components/knowledge/coverage-panel";
import { FactList } from "@client/components/knowledge/fact-list";
import { FACT_CATEGORY_LABELS, FACT_STATUS_INFO } from "@client/components/knowledge/labels";
import {
  type FactFilters,
  useDocuments,
  useFact,
  useFactSummary,
  useFacts,
  useOrgId,
} from "@client/components/knowledge/queries";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Input,
  Label,
  PageHeader,
  Select,
  Spinner,
} from "@client/components/ui";
import { cn } from "@client/lib/cn";
import type { FactDto } from "@shared/api/types";
import { FACT_CATEGORIES, FACT_STATUSES, type FactCategory, type FactStatus } from "@shared/enums";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Plus, Search, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const TABS: { value: FactStatus | ""; label: string }[] = [
  { value: "proposed", label: "Needs review" },
  { value: "confirmed", label: "Confirmed" },
  { value: "rejected", label: "Rejected" },
  { value: "", label: "All" },
];

/** Search params this page reads: ?status=proposed|confirmed|rejected|superseded|all (or CSV) & ?factId= */
export interface FactsSearch {
  status?: string;
  factId?: string;
}

/** The facts route's `validateSearch`: keeps non-empty string `status` / `factId`, drops the rest. */
export function validateFactsSearch(search: Record<string, unknown>): FactsSearch {
  // The router JSON-parses values, so `?factId=123` arrives as a number.
  const str = (v: unknown) =>
    typeof v === "string" ? v.trim() || undefined : typeof v === "number" ? String(v) : undefined;
  const out: FactsSearch = {};
  const status = str(search.status);
  const factId = str(search.factId);
  if (status) out.status = status;
  if (factId) out.factId = factId;
  return out;
}

/**
 * URL `status` -> the API filter. Missing -> "proposed" (the review queue); "all" -> no filter;
 * CSV lists are passed through (the API accepts them); unknown values are dropped.
 */
export function parseStatusParam(raw: unknown): string {
  if (raw === undefined || raw === null || raw === "") return "proposed";
  const parts = String(raw)
    .split(",")
    .map((p) => p.trim())
    .filter((p): p is FactStatus => (FACT_STATUSES as readonly string[]).includes(p));
  if (String(raw) === "all" || parts.length === 0) return "";
  return parts.join(",");
}

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function FactsPage() {
  const orgId = useOrgId();
  const navigate = useNavigate();
  const search = useSearch({ from: "/orgs/$orgId/knowledge/facts" });
  const status = parseStatusParam(search.status);
  const factId = search.factId;
  const [category, setCategory] = useState<FactCategory | "">("");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const dq = useDebounced(q.trim());
  const filters: FactFilters = { status, category, q: dq };

  const setSearch = (next: Partial<FactsSearch>) =>
    void navigate({
      to: "/orgs/$orgId/knowledge/facts",
      params: { orgId },
      search: (prev: FactsSearch) => {
        const merged: FactsSearch = { ...prev, ...next };
        if (!merged.factId) delete merged.factId;
        return merged;
      },
      replace: true,
    });

  const facts = useFacts(orgId, filters);
  const linked = useFact(orgId, factId);
  const summary = useFactSummary(orgId);
  const docs = useDocuments(orgId);
  const titles = useMemo(
    () => new Map((docs.data?.items ?? []).map((d) => [d.id, d.title] as const)),
    [docs.data],
  );
  const counts = summary.data?.byStatus;
  const items = facts.data?.items ?? [];
  const linkedInList = !!factId && items.some((f) => f.id === factId);
  // A deep-linked fact outside the current filter is pinned above the list.
  const pinned = factId && !linkedInList && linked.data ? linked.data : null;

  // Scroll the deep-linked fact into view once it has rendered (in the list or pinned).
  const scrolledFor = useRef<string | null>(null);
  const linkedReady = linkedInList || !!pinned;
  useEffect(() => {
    if (!factId || !linkedReady || scrolledFor.current === factId) return;
    const el = document.getElementById(`fact-${factId}`);
    if (!el) return;
    scrolledFor.current = factId;
    el.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [factId, linkedReady]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fact base"
        description="Every statement Autopilot may make about your organization, with where it came from."
        actions={
          <>
            <TakeTourButton tour={FACT_BASE_TOUR} />
            <Button
              onClick={() => setAdding((a) => !a)}
              aria-expanded={adding}
              data-tour="facts-add"
            >
              <Plus className="h-4 w-4" aria-hidden /> Add a fact
            </Button>
          </>
        }
      />

      <div className="flex items-start gap-3 rounded-md border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-700">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <p>
          <strong>Drafts can only state facts from this list.</strong> Confirmed facts can be used
          by autopilot. Facts that still need review are flagged for a human wherever they're cited;
          rejected facts are never used. <HelpTip term="proposed_fact" />
        </p>
      </div>

      {adding && (
        <Card>
          <CardHeader>
            <CardTitle>Add a fact</CardTitle>
            <p className="mt-1 text-sm text-neutral-500">
              Facts you enter yourself are confirmed immediately.
            </p>
          </CardHeader>
          <CardBody>
            <AddFactForm orgId={orgId} onDone={() => setAdding(false)} />
          </CardBody>
        </Card>
      )}

      <CoveragePanel orgId={orgId} />

      <section aria-label="Facts" className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div
            role="tablist"
            aria-label="Fact status"
            data-tour="facts-status-tabs"
            className="flex rounded-md border border-neutral-200 bg-white p-1"
          >
            {TABS.map((t) => {
              const count = t.value ? counts?.[t.value] : undefined;
              const active = status === t.value;
              return (
                <button
                  key={t.label}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSearch({ status: t.value || "all" })}
                  className={cn(
                    "rounded px-3 py-1.5 text-sm font-medium",
                    active ? "bg-brand-600 text-white" : "text-neutral-600 hover:bg-neutral-100",
                  )}
                >
                  {t.label}
                  {count != null && (
                    <span
                      className={cn("ml-1.5 text-xs", active ? "text-white" : "text-neutral-500")}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="w-48 space-y-1">
            <Label htmlFor="fact-category">Category</Label>
            <Select
              id="fact-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as FactCategory | "")}
            >
              <option value="">All categories</option>
              {FACT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {FACT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-56 flex-1 space-y-1">
            <Label htmlFor="fact-search">Search facts</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
                aria-hidden
              />
              <Input
                id="fact-search"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="e.g. graduates, Gallup, budget"
                className="pl-9"
              />
            </div>
          </div>
        </div>

        {factId && (
          <LinkedFact
            orgId={orgId}
            factId={factId}
            pinned={pinned}
            query={linked}
            inList={linkedInList}
            titles={titles}
            onClear={() => setSearch({ factId: undefined })}
          />
        )}

        {facts.isPending ? (
          <Spinner label="Loading facts" />
        ) : facts.isError ? (
          <ApiErrorAlert error={facts.error} title="Couldn't load facts" />
        ) : (
          <>
            {facts.isFetching && items.length > 0 && (
              <p className="sr-only" role="status">
                Updating…
              </p>
            )}
            {status === "proposed" && items.length > 0 && (
              <Alert tone="warning">
                Review each fact against its source quote. Confirm what's accurate; reject anything
                wrong or out of date.
              </Alert>
            )}
            <FactList
              orgId={orgId}
              facts={items}
              documentTitles={titles}
              bulk={status === "proposed" || status === ""}
              highlightId={factId}
              emptyTitle={
                dq || category
                  ? "No facts match your filters"
                  : status === "proposed"
                    ? "Nothing to review"
                    : "No facts here yet"
              }
              emptyDescription={
                dq || category
                  ? "Try a different search or category."
                  : status === "proposed"
                    ? "You're all caught up. Upload documents or run an interview to add more."
                    : "Upload documents, run an interview, or add a fact yourself."
              }
            />
          </>
        )}
      </section>
    </div>
  );
}

function LinkedFact({
  orgId,
  factId,
  pinned,
  query,
  inList,
  titles,
  onClear,
}: {
  orgId: string;
  factId: string;
  pinned: FactDto | null;
  query: { isPending: boolean; isError: boolean; error: unknown };
  inList: boolean;
  titles: Map<string, string>;
  onClear: () => void;
}) {
  const clear = (
    <Button variant="ghost" size="sm" onClick={onClear}>
      <X className="h-4 w-4" aria-hidden /> Clear
    </Button>
  );
  if (query.isError && !inList) {
    return (
      <ApiErrorAlert
        error={query.error}
        title="Couldn't open the linked fact"
        messages={{
          not_found: "That fact no longer exists. It may have been deleted with its source.",
        }}
      />
    );
  }
  if (inList) {
    return (
      <p className="flex items-center justify-between gap-2 text-sm text-neutral-600" role="status">
        <span>Showing the fact you followed a link to (highlighted below).</span>
        {clear}
      </p>
    );
  }
  if (!pinned) return query.isPending ? <Spinner label="Loading the linked fact" /> : null;
  return (
    <section aria-label="Linked fact" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-neutral-600">
          The fact you followed a link to
          {` (${FACT_STATUS_INFO[pinned.status]?.label ?? pinned.status})`} isn't in the current
          filter:
        </p>
        {clear}
      </div>
      <FactList
        orgId={orgId}
        facts={[pinned]}
        documentTitles={titles}
        bulk={false}
        highlightId={factId}
      />
    </section>
  );
}
