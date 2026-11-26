// Platform admin console (/admin). Reads /api/admin/* (platform admins only; the server enforces it).
// Shows cross-tenant metadata only: counts, spend, statuses, settings and the audit trail.
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Dialog,
  EmptyState,
  ErrorMessage,
  Field,
  Input,
  PageHeader,
  Spinner,
  Stat,
  Tab,
  TabList,
  Table,
  TabPanel,
  Tabs,
  Td,
  Textarea,
  Th,
  type Tone,
  toast,
} from "@client/components/ui";
import { ApiError, api } from "@client/lib/api";
import type {
  AdminAuditEntryDto,
  AdminBillingEventDto,
  AdminDiscoveryRunDto,
  AdminLlmCallDto,
  AdminOrgDetailDto,
  AdminOrgRowDto,
  AdminOverviewDto,
  AdminPage as AdminPageDto,
} from "@shared/admin/types";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Building2,
  CircleDollarSign,
  Gift,
  Play,
  Send,
  ShieldAlert,
  Users,
} from "lucide-react";
import * as React from "react";

// --- data ----------------------------------------------------------------------------------------

const adminKeys = {
  all: ["admin"] as const,
  overview: ["admin", "overview"] as const,
  orgs: ["admin", "orgs"] as const,
  org: (id: string) => ["admin", "org", id] as const,
  llmCalls: ["admin", "llm-calls"] as const,
  discoveryRuns: ["admin", "discovery-runs"] as const,
  billingEvents: ["admin", "billing-events"] as const,
  audit: ["admin", "audit"] as const,
};

type Params = Record<string, string | undefined>;

function withQuery(path: string, params: Params) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

const isAuthError = (e: unknown) => e instanceof ApiError && (e.status === 401 || e.status === 403);
const retry = (count: number, e: unknown) => !isAuthError(e) && count < 2;

function usePaged<T>(key: readonly unknown[], path: string, params: Params = {}) {
  return useInfiniteQuery({
    queryKey: [...key, params],
    queryFn: ({ pageParam }) =>
      api<AdminPageDto<T>>(withQuery(path, { ...params, cursor: pageParam })),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry,
  });
}

// --- formatting ----------------------------------------------------------------------------------

const usd = (micros: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: micros > 0 && micros < 10_000 ? 4 : 2,
  }).format(micros / 1e6);

const num = (n: number) => new Intl.NumberFormat("en-US").format(n);

const when = (d: string | null | undefined) =>
  d
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(d),
      )
    : "—";

const label = (s: string) => s.replace(/_/g, " ");

const runTone = (s: string): Tone =>
  s === "succeeded" ? "success" : s === "failed" ? "danger" : "info";

// --- page ----------------------------------------------------------------------------------------

const TABS = [
  ["overview", "Overview"],
  ["orgs", "Orgs"],
  ["llm", "LLM calls"],
  ["discovery", "Discovery runs"],
  ["billing", "Billing events"],
  ["audit", "Audit"],
] as const;
type TabKey = (typeof TABS)[number][0];

export function AdminPage() {
  const [tab, setTab] = React.useState<TabKey>("overview");
  const overview = useQuery({
    queryKey: adminKeys.overview,
    queryFn: () => api<AdminOverviewDto>("/api/admin/overview"),
    retry,
  });

  let body: React.ReactNode;
  if (overview.error instanceof ApiError && overview.error.status === 403) {
    body = (
      <EmptyState
        icon={<ShieldAlert />}
        title="Not authorized"
        description="This area is for platform administrators. Ask an operator to add your verified email to PLATFORM_ADMIN_EMAILS."
      />
    );
  } else if (overview.error instanceof ApiError && overview.error.status === 401) {
    body = (
      <EmptyState
        icon={<ShieldAlert />}
        title="Sign in required"
        description="Sign in with your platform admin account to continue."
        action={
          <Link to="/login" className="text-sm font-medium text-brand-700 hover:underline">
            Sign in
          </Link>
        }
      />
    );
  } else if (overview.isPending) {
    body = <Spinner label="Loading admin console" />;
  } else {
    body = (
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabList aria-label="Admin sections">
          {TABS.map(([value, text]) => (
            <Tab key={value} value={value}>
              {text}
            </Tab>
          ))}
        </TabList>
        <TabPanel value="overview">
          {overview.data ? (
            <OverviewTab data={overview.data} />
          ) : (
            <ErrorMessage error={overview.error} title="Could not load the overview" />
          )}
        </TabPanel>
        <TabPanel value="orgs">
          <OrgsTab />
        </TabPanel>
        <TabPanel value="llm">
          <LlmCallsTab />
        </TabPanel>
        <TabPanel value="discovery">
          <DiscoveryTab />
        </TabPanel>
        <TabPanel value="billing">
          <BillingEventsTab />
        </TabPanel>
        <TabPanel value="audit">
          <AuditTab />
        </TabPanel>
      </Tabs>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <PageHeader
        eyebrow="Grant Autopilot"
        title="Platform admin"
        description="Cross-tenant operations: usage, spend, failures and billing. Tenant content (documents, facts, interviews, drafts) is never shown here."
      />
      {body}
    </div>
  );
}

// --- overview ------------------------------------------------------------------------------------

function OverviewTab({ data }: { data: AdminOverviewDto }) {
  const failed = data.failedJobs.documents + data.failedJobs.applications;
  const maxPurpose = Math.max(1, ...data.llm.byPurpose.map((p) => p.costMicros));
  const statuses = Object.entries(data.applicationsByStatus).filter(([, n]) => n > 0);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Organizations" value={num(data.counts.orgs)} icon={Building2} />
        <Stat label="Users" value={num(data.counts.users)} icon={Users} />
        <Stat
          label="Submissions (30 days)"
          value={num(data.submissionsLast30Days)}
          icon={Send}
          tone="success"
        />
        <Stat
          label="LLM spend (month to date)"
          value={usd(data.llm.monthToDateCostMicros)}
          hint={`${num(data.llm.monthToDateCalls)} calls`}
          icon={CircleDollarSign}
          tone="accent"
        />
        <Stat
          label="Failed jobs"
          value={num(failed)}
          hint={`${data.failedJobs.documents} documents · ${data.failedJobs.applications} applications`}
          icon={AlertTriangle}
          tone={failed > 0 ? "danger" : "neutral"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Applications by status</CardTitle>
        </CardHeader>
        <CardBody>
          {statuses.length === 0 ? (
            <p className="text-sm text-neutral-500">No applications yet.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {statuses.map(([status, n]) => (
                <li key={status}>
                  <Badge tone={status === "failed" ? "danger" : "neutral"}>
                    <span className="capitalize">{label(status)}</span>
                    <span className="tabular-nums font-semibold">{num(n)}</span>
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Spend by purpose (month to date)</CardTitle>
          </CardHeader>
          <CardBody>
            {data.llm.byPurpose.length === 0 ? (
              <p className="text-sm text-neutral-500">No LLM calls this month.</p>
            ) : (
              <ul className="space-y-3">
                {data.llm.byPurpose.map((p) => (
                  <li key={p.purpose}>
                    <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate font-mono text-xs text-neutral-700">
                        {p.purpose}
                      </span>
                      <span className="shrink-0 tabular-nums text-neutral-900">
                        {usd(p.costMicros)}
                        <span className="ml-2 text-xs text-neutral-500">{num(p.calls)} calls</span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-neutral-100" aria-hidden>
                      <div
                        className="h-2 rounded-full bg-brand-500"
                        style={{ width: `${Math.max(1, (p.costMicros / maxPurpose) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top orgs by spend (month to date)</CardTitle>
          </CardHeader>
          <CardBody>
            {data.llm.topOrgs.length === 0 ? (
              <p className="text-sm text-neutral-500">No org spend this month.</p>
            ) : (
              <ol className="divide-y divide-neutral-100 text-sm">
                {data.llm.topOrgs.map((o) => (
                  <li key={o.orgId} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate">
                      {o.orgName ?? <span className="font-mono text-xs">{o.orgId}</span>}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {usd(o.costMicros)}
                      <span className="ml-2 text-xs text-neutral-500">{num(o.calls)} calls</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent failures</CardTitle>
          </CardHeader>
          <CardBody>
            {data.failedJobs.recent.length === 0 ? (
              <p className="text-sm text-neutral-500">Nothing has failed.</p>
            ) : (
              <ul className="divide-y divide-neutral-100 text-sm">
                {data.failedJobs.recent.map((f) => (
                  <li key={f.id} className="space-y-0.5 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate">
                        <Badge tone="danger" className="mr-2 capitalize">
                          {f.kind}
                        </Badge>
                        {f.orgName ?? f.orgId}
                      </span>
                      <span className="shrink-0 text-xs text-neutral-500">{when(f.updatedAt)}</span>
                    </div>
                    <p className="truncate text-xs text-neutral-500">
                      <span className="font-mono">{f.id}</span>
                      {f.error ? ` · ${f.error}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Last discovery runs</CardTitle>
          </CardHeader>
          <CardBody>
            {data.lastDiscoveryRuns.length === 0 ? (
              <p className="text-sm text-neutral-500">No discovery runs yet.</p>
            ) : (
              <ul className="divide-y divide-neutral-100 text-sm">
                {data.lastDiscoveryRuns.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Badge tone={runTone(r.status)}>{r.status}</Badge>
                      <span className="truncate">
                        {label(r.source)} · {r.trigger}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-neutral-500">
                      {num(r.created)} new · {when(r.startedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

// --- shared list chrome --------------------------------------------------------------------------

type Paged<T> = ReturnType<typeof usePaged<T>>;

function PagedTable<T>({
  query,
  head,
  row,
  empty,
}: {
  query: Paged<T>;
  head: React.ReactNode;
  row: (item: T) => React.ReactNode;
  empty: string;
}) {
  if (query.isPending) return <Spinner />;
  if (query.isError) return <ErrorMessage error={query.error} title="Could not load" />;
  const items = query.data.pages.flatMap((p) => p.items);
  if (items.length === 0) return <EmptyState title={empty} />;
  return (
    <div className="space-y-3">
      <Table>
        <thead>
          <tr>{head}</tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">{items.map(row)}</tbody>
      </Table>
      {query.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            loading={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

/** Filter inputs applied on submit (not per keystroke). */
function FilterBar({
  fields,
  onApply,
}: {
  fields: { name: string; label: string; placeholder?: string; type?: string; hint?: string }[];
  onApply: (values: Params) => void;
}) {
  const id = React.useId();
  return (
    <form
      className="mb-4 flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const values: Params = {};
        for (const f of fields) {
          const v = String(fd.get(f.name) ?? "").trim();
          values[f.name] = v && f.type === "date" ? new Date(v).toISOString() : v || undefined;
        }
        onApply(values);
      }}
    >
      {fields.map((f) => (
        <Field
          key={f.name}
          label={f.label}
          htmlFor={`${id}-${f.name}`}
          hint={f.hint}
          className="min-w-48"
        >
          <Input
            id={`${id}-${f.name}`}
            name={f.name}
            type={f.type ?? "text"}
            placeholder={f.placeholder}
          />
        </Field>
      ))}
      <Button type="submit" variant="secondary">
        Apply
      </Button>
    </form>
  );
}

// --- orgs ----------------------------------------------------------------------------------------

function OrgsTab() {
  const [q, setQ] = React.useState("");
  const [comp, setComp] = React.useState<AdminOrgRowDto | null>(null);
  const [detail, setDetail] = React.useState<AdminOrgRowDto | null>(null);
  const query = usePaged<AdminOrgRowDto>(adminKeys.orgs, "/api/admin/orgs", { q: q || undefined });
  return (
    <>
      <form
        className="mb-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(String(new FormData(e.currentTarget).get("q") ?? "").trim());
        }}
      >
        <Field label="Search orgs" htmlFor="admin-org-q" className="min-w-64 flex-1">
          <Input id="admin-org-q" name="q" type="search" placeholder="Name, slug or org id" />
        </Field>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      <PagedTable
        query={query}
        empty={q ? "No matching organizations" : "No organizations yet"}
        head={
          <>
            <Th>Organization</Th>
            <Th>Plan</Th>
            <Th className="text-right">Members</Th>
            <Th className="text-right">Applications</Th>
            <Th className="text-right">Spend (MTD)</Th>
            <Th>Last activity</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </>
        }
        row={(o) => (
          <tr key={o.id}>
            <Td>
              <div className="font-medium text-neutral-900">{o.name}</div>
              <div className="font-mono text-xs text-neutral-500">{o.id}</div>
            </Td>
            <Td>
              {o.subscription ? (
                <Badge tone={o.subscription.status === "comp" ? "success" : "neutral"}>
                  {o.subscription.planKey} · {label(o.subscription.status)}
                </Badge>
              ) : (
                <span className="text-neutral-400">none</span>
              )}
            </Td>
            <Td className="text-right tabular-nums">{num(o.memberCount)}</Td>
            <Td className="text-right tabular-nums">{num(o.applicationCount)}</Td>
            <Td className="text-right tabular-nums">{usd(o.monthToDateCostMicros)}</Td>
            <Td className="whitespace-nowrap text-xs">{when(o.lastActivityAt)}</Td>
            <Td>
              <div className="flex justify-end gap-2">
                <Button size="xs" variant="ghost" onClick={() => setDetail(o)}>
                  Details
                </Button>
                <Button size="xs" variant="outline" onClick={() => setComp(o)}>
                  <Gift aria-hidden /> Comp
                </Button>
              </div>
            </Td>
          </tr>
        )}
      />
      <CompDialog org={comp} onClose={() => setComp(null)} />
      <OrgDetailDialog org={detail} onClose={() => setDetail(null)} />
    </>
  );
}

function CompDialog({ org, onClose }: { org: AdminOrgRowDto | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [note, setNote] = React.useState("");
  React.useEffect(() => {
    if (org) setNote("");
  }, [org]);
  const mutation = useMutation({
    mutationFn: (vars: { orgId: string; note: string }) =>
      api(`/api/admin/orgs/${encodeURIComponent(vars.orgId)}/comp`, {
        method: "POST",
        body: { note: vars.note },
      }),
    onSuccess: async () => {
      toast.success("Plan comped", org ? `${org.name} now has a complimentary plan.` : undefined);
      await qc.invalidateQueries({ queryKey: adminKeys.all });
      onClose();
    },
    onError: (e) => toast.error("Could not comp the plan", e),
  });
  const trimmed = note.trim();
  return (
    <Dialog
      open={org !== null}
      onClose={onClose}
      dismissible={!mutation.isPending}
      title={org ? `Comp ${org.name}` : "Comp plan"}
      description="Gives the org a complimentary plan (e.g. pilot partners such as SWIF). This replaces any current plan and is recorded in the audit log."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            loading={mutation.isPending}
            disabled={!trimmed}
            onClick={() => org && mutation.mutate({ orgId: org.id, note: trimmed })}
          >
            Comp plan
          </Button>
        </>
      }
    >
      <Field label="Note" htmlFor="admin-comp-note" hint="Why this org is comped." required>
        <Textarea
          id="admin-comp-note"
          value={note}
          maxLength={500}
          rows={3}
          onChange={(e) => setNote(e.target.value)}
          placeholder="SWIF pilot partner, 2027 season"
        />
      </Field>
    </Dialog>
  );
}

function OrgDetailDialog({ org, onClose }: { org: AdminOrgRowDto | null; onClose: () => void }) {
  const detail = useQuery({
    queryKey: adminKeys.org(org?.id ?? ""),
    queryFn: () => api<AdminOrgDetailDto>(`/api/admin/orgs/${encodeURIComponent(org?.id ?? "")}`),
    enabled: org !== null,
    retry,
  });
  return (
    <Dialog
      open={org !== null}
      onClose={onClose}
      size="lg"
      title={org?.name ?? "Organization"}
      description="Row counts and settings only. Tenant content is not available to admins."
    >
      {detail.isPending ? (
        <Spinner />
      ) : detail.isError ? (
        <ErrorMessage error={detail.error} title="Could not load the organization" />
      ) : (
        <div className="space-y-5">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <Def term="Plan">
              {detail.data.subscription
                ? `${detail.data.subscription.planKey} · ${label(detail.data.subscription.status)}`
                : "none"}
            </Def>
            <Def term="LLM spend (MTD)">{usd(detail.data.llm.monthToDateCostMicros)}</Def>
            <Def term="LLM spend (all time)">{usd(detail.data.llm.totalCostMicros)}</Def>
            <Def term="Created">{when(detail.data.org.createdAt)}</Def>
            <Def term="Last activity">{when(detail.data.lastActivityAt)}</Def>
            {detail.data.subscription?.compNote && (
              <Def term="Comp note">{detail.data.subscription.compNote}</Def>
            )}
          </dl>
          <section>
            <h3 className="mb-2 text-sm font-semibold text-neutral-900">Rows per table</h3>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              {Object.entries(detail.data.tableCounts)
                .filter(([, n]) => n > 0)
                .map(([table, n]) => (
                  <li key={table} className="flex justify-between gap-2">
                    <span className="truncate font-mono text-xs text-neutral-600">{table}</span>
                    <span className="tabular-nums">{num(n)}</span>
                  </li>
                ))}
            </ul>
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold text-neutral-900">Settings</h3>
            {detail.data.settings ? (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {Object.entries(detail.data.settings).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="truncate text-neutral-500">{k}</dt>
                    <dd className="truncate text-right font-mono text-xs">{JSON.stringify(v)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-neutral-500">No settings row.</p>
            )}
          </section>
        </div>
      )}
    </Dialog>
  );
}

function Def({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{term}</dt>
      <dd className="font-medium text-neutral-900">{children}</dd>
    </div>
  );
}

// --- LLM calls -----------------------------------------------------------------------------------

function LlmCallsTab() {
  const [filters, setFilters] = React.useState<Params>({});
  const query = usePaged<AdminLlmCallDto>(adminKeys.llmCalls, "/api/admin/llm-calls", filters);
  return (
    <>
      <FilterBar
        onApply={setFilters}
        fields={[
          { name: "orgId", label: "Org id", placeholder: "org_…" },
          { name: "purpose", label: "Purpose", placeholder: "drafting.section" },
          { name: "since", label: "Since", type: "date" },
        ]}
      />
      <PagedTable
        query={query}
        empty="No LLM calls match"
        head={
          <>
            <Th>When</Th>
            <Th>Purpose</Th>
            <Th>Org</Th>
            <Th className="text-right">Tokens in / out</Th>
            <Th className="text-right">Cache r / w</Th>
            <Th className="text-right">Cost</Th>
            <Th className="text-right">Latency</Th>
            <Th>Result</Th>
          </>
        }
        row={(r) => (
          <tr key={r.id}>
            <Td className="whitespace-nowrap text-xs">{when(r.createdAt)}</Td>
            <Td className="font-mono text-xs">{r.purpose}</Td>
            <Td className="font-mono text-xs">{r.orgId ?? "platform"}</Td>
            <Td className="text-right tabular-nums">
              {num(r.inputTokens)} / {num(r.outputTokens)}
            </Td>
            <Td className="text-right tabular-nums">
              {num(r.cacheReadTokens)} / {num(r.cacheWriteTokens)}
            </Td>
            <Td className="text-right tabular-nums">{usd(r.costMicros)}</Td>
            <Td className="text-right tabular-nums">{num(r.latencyMs)} ms</Td>
            <Td className="text-xs">
              {r.error ? (
                <Badge tone="danger" title={r.error}>
                  error
                </Badge>
              ) : (
                (r.stopReason ?? "—")
              )}
            </Td>
          </tr>
        )}
      />
    </>
  );
}

// --- discovery -----------------------------------------------------------------------------------

function DiscoveryTab() {
  const qc = useQueryClient();
  const query = usePaged<AdminDiscoveryRunDto>(
    adminKeys.discoveryRuns,
    "/api/admin/discovery-runs",
  );
  const run = useMutation({
    mutationFn: () => api("/api/admin/discovery/run", { method: "POST" }),
    onSuccess: async () => {
      toast.success("Discovery queued", "A Grants.gov run will start shortly.");
      await qc.invalidateQueries({ queryKey: adminKeys.discoveryRuns });
      await qc.invalidateQueries({ queryKey: adminKeys.overview });
    },
    onError: (e) => toast.error("Could not start discovery", e),
  });
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-500">
          Runs also start daily from the cron. A manual run fetches Grants.gov and rescores every
          org.
        </p>
        <Button onClick={() => run.mutate()} loading={run.isPending}>
          <Play aria-hidden /> Run now
        </Button>
      </div>
      <PagedTable
        query={query}
        empty="No discovery runs yet"
        head={
          <>
            <Th>Started</Th>
            <Th>Source</Th>
            <Th>Trigger</Th>
            <Th>Status</Th>
            <Th className="text-right">Found</Th>
            <Th className="text-right">New</Th>
            <Th className="text-right">Updated</Th>
            <Th>Finished</Th>
          </>
        }
        row={(r) => (
          <tr key={r.id}>
            <Td className="whitespace-nowrap text-xs">{when(r.startedAt)}</Td>
            <Td>{label(r.source)}</Td>
            <Td>{r.trigger}</Td>
            <Td>
              <Badge tone={runTone(r.status)} title={r.error ?? undefined}>
                {r.status}
              </Badge>
            </Td>
            <Td className="text-right tabular-nums">{num(r.found)}</Td>
            <Td className="text-right tabular-nums">{num(r.created)}</Td>
            <Td className="text-right tabular-nums">{num(r.updated)}</Td>
            <Td className="whitespace-nowrap text-xs">{when(r.finishedAt)}</Td>
          </tr>
        )}
      />
    </>
  );
}

// --- billing events ------------------------------------------------------------------------------

function BillingEventsTab() {
  const [filters, setFilters] = React.useState<Params>({});
  const query = usePaged<AdminBillingEventDto>(
    adminKeys.billingEvents,
    "/api/admin/billing-events",
    filters,
  );
  return (
    <>
      <FilterBar
        onApply={setFilters}
        fields={[{ name: "orgId", label: "Org id", placeholder: "org_…" }]}
      />
      <Alert tone="info" className="mb-4">
        Webhook payloads are not shown: they carry customer details.
      </Alert>
      <PagedTable
        query={query}
        empty="No billing events yet"
        head={
          <>
            <Th>Received</Th>
            <Th>Provider</Th>
            <Th>Type</Th>
            <Th>Org</Th>
            <Th>Processed</Th>
            <Th>Event id</Th>
          </>
        }
        row={(r) => (
          <tr key={r.id}>
            <Td className="whitespace-nowrap text-xs">{when(r.createdAt)}</Td>
            <Td>{r.provider}</Td>
            <Td className="font-mono text-xs">{r.type}</Td>
            <Td className="font-mono text-xs">{r.orgId ?? "—"}</Td>
            <Td className="text-xs">
              {r.error ? (
                <Badge tone="danger" title={r.error}>
                  failed
                </Badge>
              ) : r.processedAt ? (
                when(r.processedAt)
              ) : (
                <Badge tone="warning">pending</Badge>
              )}
            </Td>
            <Td className="font-mono text-xs">{r.providerEventId}</Td>
          </tr>
        )}
      />
    </>
  );
}

// --- audit ---------------------------------------------------------------------------------------

function AuditTab() {
  const [filters, setFilters] = React.useState<Params>({});
  const query = usePaged<AdminAuditEntryDto>(adminKeys.audit, "/api/admin/audit", filters);
  return (
    <>
      <FilterBar
        onApply={setFilters}
        fields={[
          {
            name: "orgId",
            label: "Org id",
            placeholder: "org_… or platform",
            hint: "“platform” shows admin and platform actions only.",
          },
        ]}
      />
      <PagedTable
        query={query}
        empty="No audit entries"
        head={
          <>
            <Th>When</Th>
            <Th>Action</Th>
            <Th>Actor</Th>
            <Th>Org</Th>
            <Th>Target</Th>
            <Th>Details</Th>
          </>
        }
        row={(r) => (
          <tr key={r.id}>
            <Td className="whitespace-nowrap text-xs">{when(r.createdAt)}</Td>
            <Td>
              <Badge tone={r.action.startsWith("admin.") ? "accent" : "neutral"}>{r.action}</Badge>
            </Td>
            <Td className="text-xs">
              {r.actorType}
              {r.actorId && <div className="font-mono text-neutral-500">{r.actorId}</div>}
            </Td>
            <Td className="font-mono text-xs">{r.orgId ?? "platform"}</Td>
            <Td className="text-xs">
              {r.targetType ?? "—"}
              {r.targetId && <div className="font-mono text-neutral-500">{r.targetId}</div>}
            </Td>
            <Td className="max-w-xs truncate font-mono text-xs" title={JSON.stringify(r.metadata)}>
              {r.metadata ? JSON.stringify(r.metadata) : "—"}
            </Td>
          </tr>
        )}
      />
    </>
  );
}
