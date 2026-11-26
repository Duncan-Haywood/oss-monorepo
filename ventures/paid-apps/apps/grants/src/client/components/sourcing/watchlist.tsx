// Funder watchlist: add a page to watch, the org's sources (check / pause / remove), the
// platform's read-only sources, and the feed of watch events.
import { timeAgo } from "@client/components/grants/format";
import { KbLink } from "@client/components/knowledge/link";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Select,
  SkeletonCard,
  SkeletonText,
  toast,
} from "@client/components/ui";
import { ApiError } from "@client/lib/api";
import {
  Activity,
  ExternalLink,
  Eye,
  Lock,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import * as React from "react";
import {
  isPlatformSource,
  isReadOnlySource,
  normalizeHttpUrl,
  sourceName,
  sourcingErrorMessage,
  URL_FIELD_ERROR_CODES,
  WATCH_EVENT_META,
  WATCH_KIND_LABEL,
  WATCH_STATUS_META,
} from "./format";
import {
  useAddWatchSource,
  useCheckWatchSource,
  useRemoveWatchSource,
  useSetWatchSourceStatus,
  useWatchEvents,
  useWatchlist,
} from "./queries";
import {
  type CreateWatchSourceInput,
  WATCH_SOURCE_KINDS,
  type WatchEventDto,
  type WatchSourceDto,
  type WatchSourceKind,
} from "./types";

export const POLITE_CHECKING_NOTE =
  "We check pages politely, respect robots.txt and site terms, and only extract opportunities that are explicitly posted.";

const opportunityHref = (orgId: string, id: string) =>
  `/orgs/${encodeURIComponent(orgId)}/opportunities/${encodeURIComponent(id)}`;

function When({ iso, never = "Never" }: { iso: string | null; never?: string }) {
  if (!iso) return <span className="text-neutral-400">{never}</span>;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return <span className="text-neutral-400">{never}</span>;
  return (
    <time
      dateTime={iso}
      title={new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(
        d,
      )}
    >
      {timeAgo(d)}
    </time>
  );
}

export function WatchStatusBadge({ status }: { status: WatchSourceDto["status"] }) {
  const meta = WATCH_STATUS_META[status] ?? {
    label: status,
    tone: "neutral" as const,
    description: "",
  };
  return (
    <Badge tone={meta.tone} dot title={meta.description}>
      {meta.label}
    </Badge>
  );
}

// ---------- add form ----------

export function AddWatchSourceForm({ orgId }: { orgId: string }) {
  const add = useAddWatchSource(orgId);
  const [url, setUrl] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [funderName, setFunderName] = React.useState("");
  const [kind, setKind] = React.useState<WatchSourceKind | "">("");
  const [urlError, setUrlError] = React.useState<string | null>(null);
  const ids = {
    url: React.useId(),
    label: React.useId(),
    funder: React.useId(),
    kind: React.useId(),
    note: React.useId(),
  };

  const serverError = add.error;
  const serverIsUrlError =
    serverError instanceof ApiError && URL_FIELD_ERROR_CODES.has(serverError.code);
  const fieldError = urlError ?? (serverIsUrlError ? sourcingErrorMessage(serverError) : null);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const normalized = normalizeHttpUrl(url);
    if (!normalized) {
      setUrlError(
        url.trim()
          ? "Enter a full web address, like https://foundation.org/grants."
          : "Enter the address of the funder page to watch.",
      );
      return;
    }
    setUrlError(null);
    const body: CreateWatchSourceInput = { url: normalized };
    if (label.trim()) body.label = label.trim();
    if (funderName.trim()) body.funderName = funderName.trim();
    if (kind) body.kind = kind;
    add.mutate(body, {
      onSuccess: (created) => {
        toast.success(
          "Added to your watchlist",
          `We'll check ${created?.label || body.label || "this page"} on a regular schedule.`,
        );
        setUrl("");
        setLabel("");
        setFunderName("");
        setKind("");
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Watch a funder page</CardTitle>
          <CardDescription>
            Add a foundation's grants page, RFP page or feed. We'll tell you when a new opportunity
            is posted there.
          </CardDescription>
        </div>
      </CardHeader>
      <CardBody className="space-y-4">
        <p
          id={ids.note}
          className="flex gap-2 rounded-lg bg-brand-50 px-3 py-2.5 text-sm text-brand-900 ring-1 ring-brand-200 ring-inset"
        >
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-hidden />
          <span>{POLITE_CHECKING_NOTE}</span>
        </p>
        <form
          onSubmit={submit}
          noValidate
          aria-label="Add a funder page to your watchlist"
          aria-describedby={ids.note}
          className="grid gap-4 sm:grid-cols-2"
        >
          <Field
            label="Page URL"
            htmlFor={ids.url}
            required
            error={fieldError ?? undefined}
            hint="The public page where the funder posts its grant opportunities."
            className="sm:col-span-2"
          >
            <Input
              id={ids.url}
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://foundation.org/grants"
              value={url}
              required
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? `${ids.url}-error` : `${ids.url}-hint`}
              onChange={(e) => {
                setUrl(e.target.value);
                if (urlError) setUrlError(null);
                if (add.error) add.reset();
              }}
            />
          </Field>
          <Field label="Label" htmlFor={ids.label} hint="Optional, e.g. “Community grants page”.">
            <Input
              id={ids.label}
              value={label}
              maxLength={120}
              aria-describedby={`${ids.label}-hint`}
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>
          <Field label="Funder name" htmlFor={ids.funder} hint="Optional.">
            <Input
              id={ids.funder}
              value={funderName}
              maxLength={160}
              aria-describedby={`${ids.funder}-hint`}
              onChange={(e) => setFunderName(e.target.value)}
            />
          </Field>
          <Field
            label="Kind of page"
            htmlFor={ids.kind}
            hint="Not sure? Leave it on automatic."
            className="sm:col-span-2"
          >
            <Select
              id={ids.kind}
              value={kind}
              aria-describedby={`${ids.kind}-hint`}
              onChange={(e) => setKind(e.target.value as WatchSourceKind | "")}
            >
              <option value="">Detect automatically</option>
              {WATCH_SOURCE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {WATCH_KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          {serverError && !serverIsUrlError && (
            <Alert
              tone="danger"
              title={
                serverError instanceof ApiError && serverError.code === "robots_disallowed"
                  ? "We can't watch that page"
                  : "Couldn't add that page"
              }
              className="sm:col-span-2"
            >
              {sourcingErrorMessage(serverError)}
            </Alert>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" loading={add.isPending}>
              {!add.isPending && <Plus className="h-4 w-4" aria-hidden />}
              Add to watchlist
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

// ---------- source rows ----------

function SourceMeta({ source }: { source: WatchSourceDto }) {
  const hours = source.checkIntervalHours;
  return (
    <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-neutral-500">
      <div className="flex gap-1">
        <dt>Last checked</dt>
        <dd className="font-medium text-neutral-700">
          <When iso={source.lastCheckedAt} never="Not yet" />
        </dd>
      </div>
      <div className="flex gap-1">
        <dt>Last changed</dt>
        <dd className="font-medium text-neutral-700">
          <When iso={source.lastChangedAt} never="No changes seen" />
        </dd>
      </div>
      {hours > 0 && (
        <div className="flex gap-1">
          <dt>Checked</dt>
          <dd className="font-medium text-neutral-700">
            {hours % 24 === 0
              ? hours === 24
                ? "daily"
                : `every ${hours / 24} days`
              : `every ${hours} hour${hours === 1 ? "" : "s"}`}
          </dd>
        </div>
      )}
      <div className="flex gap-1">
        <dt className="sr-only">Kind</dt>
        <dd>{WATCH_KIND_LABEL[source.kind] ?? source.kind}</dd>
      </div>
    </dl>
  );
}

function SourceHeading({ source }: { source: WatchSourceDto }) {
  const name = sourceName(source);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium text-neutral-900">{name}</h3>
        <WatchStatusBadge status={source.status} />
      </div>
      {source.funderName && source.funderName !== name && (
        <p className="text-sm text-neutral-600">{source.funderName}</p>
      )}
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex max-w-full items-center gap-1 text-sm break-all text-brand-700 hover:underline"
      >
        {source.url}
        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </div>
  );
}

function SourceProblem({ source }: { source: WatchSourceDto }) {
  if (source.status === "blocked_by_robots") {
    return (
      <p className="mt-2 text-sm text-danger-800">
        This site's robots.txt asks automated tools not to visit this page, so we've stopped
        checking it. You can still download the RFP yourself and import it.
      </p>
    );
  }
  if (source.status === "error" && source.lastError) {
    return (
      <p className="mt-2 text-sm text-danger-800">
        <span className="font-medium">Last error:</span> {source.lastError}
      </p>
    );
  }
  return null;
}

export function WatchSourceRow({ orgId, source }: { orgId: string; source: WatchSourceDto }) {
  const name = sourceName(source);
  const check = useCheckWatchSource(orgId);
  const setStatus = useSetWatchSourceStatus(orgId);
  const remove = useRemoveWatchSource(orgId);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const paused = source.status === "paused";

  const onCheck = () =>
    check.mutate(source.id, {
      onSuccess: () =>
        toast.success("Check started", `We'll fetch ${name} and update this list shortly.`),
      onError: (err) => {
        const rateLimited = err instanceof ApiError && err.status === 429;
        toast({
          title: rateLimited ? "Checked recently" : "Couldn't start a check",
          description: rateLimited
            ? `${sourcingErrorMessage(err)} We limit checks to stay polite to funder websites.`
            : sourcingErrorMessage(err),
          tone: rateLimited ? "warning" : "error",
        });
      },
    });

  const onToggle = () =>
    setStatus.mutate(
      { id: source.id, status: paused ? "active" : "paused" },
      {
        onSuccess: () =>
          toast.success(
            paused ? "Watching again" : "Paused",
            `${name} ${paused ? "will be checked on schedule." : "won't be checked until you resume it."}`,
          ),
        onError: (err) => toast.error("Couldn't update that page", sourcingErrorMessage(err)),
      },
    );

  const onRemove = () =>
    remove.mutate(source.id, {
      onSuccess: () => {
        setConfirmOpen(false);
        toast.success("Removed from your watchlist", name);
      },
      onError: (err) => toast.error("Couldn't remove that page", sourcingErrorMessage(err)),
    });

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SourceHeading source={source} />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={onCheck}
            loading={check.isPending}
            disabled={paused}
            title={paused ? "Resume watching this page to check it" : undefined}
            aria-label={`Check ${name} now`}
          >
            {!check.isPending && <RefreshCw aria-hidden />}
            Check now
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onToggle}
            loading={setStatus.isPending}
            aria-label={paused ? `Resume watching ${name}` : `Pause watching ${name}`}
          >
            {!setStatus.isPending && (paused ? <Play aria-hidden /> : <Pause aria-hidden />)}
            {paused ? "Resume" : "Pause"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-danger-700 hover:bg-danger-50 hover:text-danger-800"
            onClick={() => setConfirmOpen(true)}
            aria-label={`Remove ${name}`}
          >
            <Trash2 aria-hidden />
            Remove
          </Button>
        </div>
      </div>
      <SourceProblem source={source} />
      <SourceMeta source={source} />
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={onRemove}
        loading={remove.isPending}
        tone="danger"
        title="Remove this page from your watchlist?"
        description={`We'll stop checking ${name}. Opportunities already found from it stay in your catalog.`}
        confirmLabel="Remove"
      />
    </li>
  );
}

/** A platform-managed source: same details, no actions. */
export function PlatformSourceRow({ source }: { source: WatchSourceDto }) {
  return (
    <li className="px-5 py-4" data-readonly="true">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SourceHeading source={source} />
        <Badge tone="neutral" title="Managed by Grant Autopilot for all organizations">
          <Lock className="h-3 w-3" aria-hidden />
          Read-only
        </Badge>
      </div>
      <SourceProblem source={source} />
      <SourceMeta source={source} />
    </li>
  );
}

// ---------- events ----------

export function WatchEventsFeed({
  orgId,
  sources,
}: {
  orgId: string;
  sources: readonly WatchSourceDto[];
}) {
  const events = useWatchEvents(orgId);
  const byId = React.useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);
  const items = React.useMemo(
    () =>
      [...(events.data?.items ?? [])]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 30),
    [events.data],
  );
  const headingId = React.useId();

  return (
    <Card aria-labelledby={headingId} role="region">
      <CardHeader>
        <div>
          <CardTitle id={headingId}>Watchlist activity</CardTitle>
          <CardDescription>Changes and new opportunities on the pages you watch.</CardDescription>
        </div>
      </CardHeader>
      <CardBody>
        {events.isPending ? (
          <SkeletonText lines={4} label="Loading watchlist activity" />
        ) : events.error ? (
          <div className="space-y-3">
            <Alert tone="danger" title="Couldn't load activity">
              {sourcingErrorMessage(events.error)}
            </Alert>
            <Button size="sm" variant="secondary" onClick={() => void events.refetch()}>
              Try again
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="py-6 text-center text-sm text-neutral-500">
            <Activity className="mx-auto mb-2 h-5 w-5 text-neutral-400" aria-hidden />
            No activity yet. When a watched page changes or posts a new opportunity, it shows up
            here.
          </div>
        ) : (
          <ol className="space-y-4">
            {items.map((ev, i) => (
              <WatchEventItem
                key={ev.id ?? `${ev.createdAt}-${i}`}
                orgId={orgId}
                event={ev}
                sourceLabel={eventSourceLabel(ev, byId)}
              />
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}

function eventSourceLabel(ev: WatchEventDto, byId: Map<string, WatchSourceDto>) {
  const id = ev.sourceId ?? ev.source?.id;
  const known = id ? byId.get(id) : undefined;
  if (known) return sourceName(known);
  if (ev.source)
    return sourceName({ label: ev.source.label, funderName: null, url: ev.source.url });
  return null;
}

function WatchEventItem({
  orgId,
  event,
  sourceLabel,
}: {
  orgId: string;
  event: WatchEventDto;
  sourceLabel: string | null;
}) {
  const meta = WATCH_EVENT_META[event.kind] ?? { label: event.kind, tone: "neutral" as const };
  return (
    <li className="text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={meta.tone}>{meta.label}</Badge>
        <span className="text-xs text-neutral-500">
          <When iso={event.createdAt} />
        </span>
      </div>
      <p className="mt-1 text-neutral-700">{event.summary}</p>
      {sourceLabel && <p className="text-xs text-neutral-500">{sourceLabel}</p>}
      {event.opportunityId && (
        <KbLink
          href={opportunityHref(orgId, event.opportunityId)}
          className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
        >
          <Eye className="h-3.5 w-3.5" aria-hidden />
          View opportunity
        </KbLink>
      )}
    </li>
  );
}

// ---------- panel ----------

export function WatchlistPanel({ orgId }: { orgId: string }) {
  const list = useWatchlist(orgId);
  const all = list.data?.items ?? [];
  const mine = all.filter((s) => !isPlatformSource(s));
  const platform = all.filter(isPlatformSource);
  const mineId = React.useId();
  const platformId = React.useId();

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-5">
        <AddWatchSourceForm orgId={orgId} />

        <section aria-labelledby={mineId} className="space-y-3">
          <h2 id={mineId} className="text-lg font-semibold tracking-tight text-neutral-900">
            Your watchlist
            {list.isSuccess && (
              <span className="ml-2 text-sm font-normal text-neutral-500">
                {mine.length} page{mine.length === 1 ? "" : "s"}
              </span>
            )}
          </h2>
          {list.isPending ? (
            <SkeletonCard />
          ) : list.error ? (
            <div className="space-y-3">
              <Alert tone="danger" title="Couldn't load your watchlist">
                {sourcingErrorMessage(list.error)}
              </Alert>
              <Button size="sm" variant="secondary" onClick={() => void list.refetch()}>
                Try again
              </Button>
            </div>
          ) : mine.length === 0 ? (
            <EmptyState
              icon={<Eye />}
              title="You're not watching any funder pages yet"
              description="Add a foundation's grants page above and we'll let you know when it posts a new opportunity."
            />
          ) : (
            <Card>
              <ul className="divide-y divide-neutral-100" aria-label="Your watched pages">
                {mine.map((s) => (
                  <WatchSourceRow key={s.id} orgId={orgId} source={s} />
                ))}
              </ul>
            </Card>
          )}
        </section>

        {list.isSuccess && platform.length > 0 && (
          <section aria-labelledby={platformId} className="space-y-3">
            <div>
              <h2 id={platformId} className="text-lg font-semibold tracking-tight text-neutral-900">
                Watched for everyone
              </h2>
              <p className="text-sm text-neutral-500">
                Funder pages Grant Autopilot checks for all organizations. They're managed by our
                team, so they're read-only here.
              </p>
            </div>
            <Card className="bg-neutral-50/50">
              <ul className="divide-y divide-neutral-100" aria-label="Platform-managed pages">
                {platform.map((s) =>
                  isReadOnlySource(s) ? (
                    <PlatformSourceRow key={s.id} source={s} />
                  ) : (
                    <WatchSourceRow key={s.id} orgId={orgId} source={s} />
                  ),
                )}
              </ul>
            </Card>
          </section>
        )}
      </div>

      <div>
        <WatchEventsFeed orgId={orgId} sources={all} />
      </div>
    </div>
  );
}
