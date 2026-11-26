// Foundation prospects: private foundations whose 990-PF giving resembles the org's work, ranked by
// fit, with a lightweight pipeline (status, notes, next step) per prospect.
import { FitMeter } from "@client/components/grants/match-badges";
import {
  Alert,
  Button,
  EmptyState,
  Field,
  Input,
  Label,
  Select,
  SkeletonCard,
  Table,
  Td,
  Textarea,
  Th,
  toast,
} from "@client/components/ui";
import { formatCents, formatDate } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { ChevronDown, ChevronRight, ExternalLink, Landmark, RefreshCw } from "lucide-react";
import * as React from "react";
import {
  dateInputToIso,
  filterProspects,
  formatCompactCents,
  funderOf,
  isOverdue,
  isoToDateInput,
  PROSPECT_APPROACH_LABEL,
  PROSPECT_STATUS_LABEL,
  type ProspectFilter,
  sortProspectsByFit,
  sourcingErrorMessage,
} from "./format";
import { useProspects, useRefreshProspects, useUpdateProspect } from "./queries";
import { ReasonList } from "./reason-list";
import {
  PROSPECT_STATUSES,
  type ProspectItem,
  type ProspectRunDto,
  type ProspectStatus,
  type UpdateProspectInput,
} from "./types";

export const PROPUBLICA_EXPLORER_URL = "https://projects.propublica.org/nonprofits/";

const FILTER_OPTIONS: { value: ProspectFilter; label: string }[] = [
  { value: "active", label: "Active prospects" },
  { value: "all", label: "All prospects" },
  ...PROSPECT_STATUSES.map((s) => ({ value: s, label: PROSPECT_STATUS_LABEL[s] })),
];

const COLUMNS = 7;

export function ProspectsExplainer() {
  return (
    <Alert tone="info" title="What a prospect is (and isn't)">
      <p>
        Prospects are private foundations whose past grants look like your work, found in their IRS
        Form 990-PF filings. 990-PF data lags 1–2 years, so giving and assets reflect the filing
        year shown, not today.
      </p>
      <p className="mt-1">
        A prospect is not an open invitation to apply. Many foundations fund only organizations they
        already know or don't accept unsolicited proposals. Check each foundation's website and
        guidelines before reaching out.
      </p>
    </Alert>
  );
}

function ExternalA({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline",
        className,
      )}
    >
      {children}
      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

const safeHttpUrl = (u: string | null | undefined) => {
  if (!u) return null;
  const withScheme = /^https?:\/\//i.test(u) ? u : `https://${u}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

function Money({ cents, year }: { cents: number | null; year?: number | null }) {
  return (
    <div className="tabular-nums">
      <span
        className="font-medium text-neutral-900"
        title={cents == null ? undefined : formatCents(cents)}
      >
        {formatCompactCents(cents)}
      </span>
      {year != null && cents != null && (
        <span className="block text-xs text-neutral-500">FY {year} filing</span>
      )}
    </div>
  );
}

export function ProspectRow({
  orgId,
  prospect,
  now,
}: {
  orgId: string;
  prospect: ProspectItem;
  now?: Date;
}) {
  const funder = funderOf(prospect);
  const update = useUpdateProspect(orgId);
  const [open, setOpen] = React.useState(false);
  const [notes, setNotes] = React.useState(prospect.notes ?? "");
  const [nextStep, setNextStep] = React.useState(isoToDateInput(prospect.nextStepAt));
  const [dateError, setDateError] = React.useState<string | null>(null);
  const detailsId = React.useId();
  const statusId = React.useId();
  const notesId = React.useId();
  const dateId = React.useId();

  const toggle = () => {
    if (!open) {
      // Start editing from the latest saved values.
      setNotes(prospect.notes ?? "");
      setNextStep(isoToDateInput(prospect.nextStepAt));
      setDateError(null);
    }
    setOpen(!open);
  };

  const location = [funder.city, funder.state].filter(Boolean).join(", ");
  const website = safeHttpUrl(funder.website);
  const propublica = safeHttpUrl(funder.propublicaUrl);
  const overdue = isOverdue(prospect.nextStepAt, now);

  const onStatus = (status: ProspectStatus) =>
    update.mutate(
      { id: prospect.id, patch: { status } },
      {
        onSuccess: () =>
          toast.success("Status updated", `${funder.name}: ${PROSPECT_STATUS_LABEL[status]}`),
        onError: (err) => toast.error("Couldn't update the status", sourcingErrorMessage(err)),
      },
    );

  const savedNotes = prospect.notes ?? "";
  const savedDate = isoToDateInput(prospect.nextStepAt);
  const dirty = notes !== savedNotes || nextStep !== savedDate;

  const onSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const nextStepAt = dateInputToIso(nextStep);
    if (nextStepAt === undefined) {
      setDateError("Enter a valid date, or clear the field.");
      return;
    }
    setDateError(null);
    const patch: UpdateProspectInput = {};
    // The API stores notes as a string; "" clears them.
    if (notes !== savedNotes) patch.notes = notes.trim() ? notes : "";
    if (nextStep !== savedDate) patch.nextStepAt = nextStepAt;
    update.mutate(
      { id: prospect.id, patch },
      {
        onSuccess: () => toast.success("Saved", funder.name),
        onError: (err) => toast.error("Couldn't save your changes", sourcingErrorMessage(err)),
      },
    );
  };

  return (
    <>
      <tr className={cn("align-top", open && "bg-neutral-50/60")}>
        <Th
          scope="row"
          className="bg-transparent px-4 py-3 text-sm font-normal tracking-normal normal-case"
        >
          <div className="min-w-48">
            <p className="font-medium text-neutral-900">{funder.name}</p>
            <p className="text-xs text-neutral-500">
              {[location, funder.nteeCode ? `NTEE ${funder.nteeCode}` : null, `EIN ${prospect.ein}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {website && <ExternalA href={website}>Website</ExternalA>}
              {propublica && <ExternalA href={propublica}>990s on ProPublica</ExternalA>}
            </div>
          </div>
        </Th>
        <Td className="min-w-32">
          <FitMeter score={prospect.fitScore} />
        </Td>
        <Td>
          <Money cents={funder.totalGivingCents} year={funder.latestFilingYear} />
        </Td>
        <Td>
          <Money cents={funder.totalAssetsCents} />
        </Td>
        <Td>
          <label htmlFor={statusId} className="sr-only">
            Status for {funder.name}
          </label>
          <Select
            id={statusId}
            className="h-9 min-w-36"
            value={prospect.status}
            disabled={update.isPending && update.variables?.patch.status !== undefined}
            onChange={(e) => onStatus(e.target.value as ProspectStatus)}
          >
            {PROSPECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROSPECT_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </Td>
        <Td className="whitespace-nowrap">
          {prospect.nextStepAt ? (
            <span className={cn(overdue && "font-medium text-danger-700")}>
              {formatDate(prospect.nextStepAt)}
              {overdue && <span className="block text-xs">Overdue</span>}
            </span>
          ) : (
            <span className="text-neutral-400">—</span>
          )}
        </Td>
        <Td className="text-right">
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={toggle}
          >
            {open ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
            Details<span className="sr-only"> for {funder.name}</span>
          </Button>
        </Td>
      </tr>
      <tr id={detailsId} hidden={!open} className="bg-neutral-50/60">
        <td colSpan={COLUMNS} className="px-4 pb-5">
          {open && (
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <h4 className="mb-2 text-sm font-semibold text-neutral-800">Why it may fit</h4>
                <ReasonList orgId={orgId} reasons={prospect.reasons ?? []} />
                {prospect.approach && PROSPECT_APPROACH_LABEL[prospect.approach] && (
                  <div className="mt-4 text-sm">
                    <h4 className="font-semibold text-neutral-800">
                      Suggested approach: {PROSPECT_APPROACH_LABEL[prospect.approach].label}
                    </h4>
                    <p className="mt-1 text-neutral-600">
                      {prospect.approachNotes?.trim() ||
                        PROSPECT_APPROACH_LABEL[prospect.approach].hint}
                    </p>
                  </div>
                )}
              </div>
              <form onSubmit={onSave} className="space-y-3" aria-label={`Notes for ${funder.name}`}>
                <div className="space-y-1.5">
                  <Label htmlFor={notesId}>Notes</Label>
                  <Textarea
                    id={notesId}
                    value={notes}
                    maxLength={5000}
                    placeholder="Who you spoke to, guidelines, deadlines…"
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
                <Field
                  label="Next step date"
                  htmlFor={dateId}
                  error={dateError ?? undefined}
                  className="max-w-xs"
                >
                  <Input
                    id={dateId}
                    type="date"
                    value={nextStep}
                    aria-invalid={dateError ? true : undefined}
                    aria-describedby={dateError ? `${dateId}-error` : undefined}
                    onChange={(e) => setNextStep(e.target.value)}
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!dirty}
                    loading={update.isPending && update.variables?.patch.status === undefined}
                  >
                    Save
                  </Button>
                  {nextStep && (
                    <Button size="sm" variant="ghost" onClick={() => setNextStep("")}>
                      Clear date
                    </Button>
                  )}
                </div>
              </form>
            </div>
          )}
        </td>
      </tr>
    </>
  );
}

function LastRunNote({ run }: { run: ProspectRunDto | null }) {
  if (!run) return null;
  if (run.status === "queued" || run.status === "running") {
    return (
      <p className="text-sm text-neutral-500" role="status">
        A refresh is in progress. New prospects will appear here when it finishes.
      </p>
    );
  }
  if (run.status === "failed") {
    return (
      <Alert tone="warning" title="The last refresh didn't finish">
        Something went wrong while searching foundation filings. You can try again.
      </Alert>
    );
  }
  const at = run.finishedAt ?? run.startedAt;
  return (
    <p className="text-sm text-neutral-500">
      Last refreshed <time dateTime={at}>{formatDate(at)}</time>.
    </p>
  );
}

export function ProspectsPanel({ orgId, now }: { orgId: string; now?: Date }) {
  const list = useProspects(orgId);
  const refresh = useRefreshProspects(orgId);
  const [filter, setFilter] = React.useState<ProspectFilter>("active");
  const filterId = React.useId();

  const all = list.data?.items ?? [];
  const visible = sortProspectsByFit(filterProspects(all, filter));

  const refreshButton = (
    <Button
      variant="secondary"
      onClick={() => refresh.mutate()}
      loading={refresh.isPending}
      title="Search recent 990-PF filings for foundations that fund work like yours"
    >
      {!refresh.isPending && <RefreshCw className="h-4 w-4" aria-hidden />}
      Refresh prospects
    </Button>
  );

  return (
    <div className="space-y-4">
      <ProspectsExplainer />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Label htmlFor={filterId}>Show</Label>
          <Select
            id={filterId}
            className="min-w-48"
            value={filter}
            onChange={(e) => setFilter(e.target.value as ProspectFilter)}
          >
            {FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        {refreshButton}
      </div>

      <LastRunNote run={list.data?.lastRun ?? null} />
      {refresh.isSuccess && (
        <Alert tone="success" title="Refreshing prospects">
          We're re-scanning foundation filings in the background. New prospects will appear here in
          a few minutes.
        </Alert>
      )}
      {refresh.error && (
        <Alert tone="danger" title="Couldn't start a refresh">
          {sourcingErrorMessage(refresh.error)}
        </Alert>
      )}

      {list.isPending ? (
        <SkeletonCard />
      ) : list.error ? (
        <div className="space-y-3">
          <Alert tone="danger" title="Couldn't load prospects">
            {sourcingErrorMessage(list.error)}
          </Alert>
          <Button size="sm" variant="secondary" onClick={() => void list.refetch()}>
            Try again
          </Button>
        </div>
      ) : all.length === 0 ? (
        <EmptyState
          icon={<Landmark />}
          title="No foundation prospects yet"
          description="Refresh to search 990-PF filings for foundations that fund work like yours. The more confirmed facts in your fact base, the better the matches."
          action={refreshButton}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No prospects with this status"
          action={
            <Button variant="secondary" onClick={() => setFilter("all")}>
              Show all prospects
            </Button>
          }
        />
      ) : (
        <>
          <p className="text-sm text-neutral-500" aria-live="polite">
            {visible.length} of {all.length} prospect{all.length === 1 ? "" : "s"}, highest fit
            first{list.isFetching && " · updating…"}
          </p>
          <Table aria-label="Foundation prospects, sorted by fit">
            <thead>
              <tr>
                <Th>Foundation</Th>
                <Th aria-sort="descending">Fit</Th>
                <Th>Annual giving</Th>
                <Th>Assets</Th>
                <Th>Status</Th>
                <Th>Next step</Th>
                <Th>
                  <span className="sr-only">Details</span>
                </Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {visible.map((p) => (
                <ProspectRow key={p.id} orgId={orgId} prospect={p} now={now} />
              ))}
            </tbody>
          </Table>
        </>
      )}

      <p className="text-xs text-neutral-500">
        Foundation financials come from IRS filings via{" "}
        <a
          href={PROPUBLICA_EXPLORER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-brand-700 hover:underline"
        >
          ProPublica Nonprofit Explorer
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        . Check figures against the foundation's latest filing before relying on them.
      </p>
    </div>
  );
}
