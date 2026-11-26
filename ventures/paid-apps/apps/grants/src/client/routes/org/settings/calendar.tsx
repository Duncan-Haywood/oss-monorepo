// OWNER: calendar (settings tab) — subscribe to grant dates in Google, Outlook or Apple Calendar.
import {
  Alert,
  Badge,
  Button,
  buttonClass,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  ErrorMessage,
  Input,
  Select,
  Spinner,
  Switch,
  Table,
  Td,
  Th,
  toast,
} from "@client/components/ui";
import { api, formatDate, orgApi } from "@client/lib/api";
import {
  type CalendarScope,
  type CalendarSettingsDto,
  type CalendarTokenDto,
  type CreatedCalendarTokenDto,
  calendarSubscribeLinks,
} from "@shared/api/calendar";
import type { ListResponse } from "@shared/api/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Copy, ExternalLink, Trash2 } from "lucide-react";
import { useState } from "react";
import { SettingsPage } from "./settings-nav";
import { hasRole, type OrgDetail } from "./use-org";

const SCOPE_LABELS: Record<CalendarScope, string> = {
  org: "Whole organization",
  mine: "Just mine",
};

const tokensKey = (orgId: string) => ["org", orgId, "calendar", "tokens"] as const;
const settingsKey = (orgId: string) => ["org", orgId, "calendar", "settings"] as const;

export function CalendarSettingsPage() {
  return (
    <SettingsPage
      tab="calendar"
      title="Settings"
      description="See grant deadlines and follow-ups in the calendar you already use."
    >
      {({ orgId, org }) => <CalendarFeeds orgId={orgId} org={org} />}
    </SettingsPage>
  );
}

function CalendarFeeds({ orgId, org }: { orgId: string; org: OrgDetail }) {
  const qc = useQueryClient();
  const canOrgFeed = hasRole(org.role, "editor");
  const isAdmin = hasRole(org.role, "admin");
  const [scope, setScope] = useState<CalendarScope>(canOrgFeed ? "org" : "mine");
  const [created, setCreated] = useState<CreatedCalendarTokenDto | null>(null);
  const [revoking, setRevoking] = useState<CalendarTokenDto | null>(null);

  const tokens = useQuery({
    queryKey: tokensKey(orgId),
    queryFn: () => api<ListResponse<CalendarTokenDto>>(orgApi(orgId, "/calendar/tokens")),
  });
  const create = useMutation({
    mutationFn: (s: CalendarScope) =>
      api<CreatedCalendarTokenDto>(orgApi(orgId, "/calendar/tokens"), {
        method: "POST",
        body: { scope: s },
      }),
    onSuccess: (res) => {
      setCreated(res);
      qc.invalidateQueries({ queryKey: tokensKey(orgId) });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      api(orgApi(orgId, `/calendar/tokens/${encodeURIComponent(id)}`), { method: "DELETE" }),
    onSuccess: (_d, id) => {
      setRevoking(null);
      if (created?.token.id === id) setCreated(null);
      toast.success("Feed revoked. Calendars using that link will stop updating.");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: tokensKey(orgId) }),
  });

  return (
    <div className="space-y-6">
      <WhatsInTheFeed />

      <Card>
        <CardHeader>
          <CardTitle>Create a calendar feed</CardTitle>
          <CardDescription>
            You get a private link that your calendar app checks for updates, usually every few
            hours.
          </CardDescription>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label htmlFor="calendar-scope" className="text-sm font-medium text-neutral-900">
                What to include
              </label>
              <Select
                id="calendar-scope"
                className="w-64"
                value={scope}
                onChange={(e) => setScope(e.target.value as CalendarScope)}
              >
                <option value="org" disabled={!canOrgFeed}>
                  {SCOPE_LABELS.org}
                  {canOrgFeed ? "" : " (editors and above)"}
                </option>
                <option value="mine">{SCOPE_LABELS.mine}</option>
              </Select>
            </div>
            <Button loading={create.isPending} onClick={() => create.mutate(scope)}>
              <CalendarPlus aria-hidden /> Create feed
            </Button>
          </div>
          <p className="text-sm text-neutral-500">
            {scope === "org"
              ? "Every active application, shortlisted grant, follow-up and review waiting in your organization."
              : "Applications you started, their follow-ups, and reviews waiting (if you can review)."}
          </p>
          {create.isError && <ErrorMessage error={create.error} title="Couldn't create the feed" />}
          {created && <NewFeed created={created} onDone={() => setCreated(null)} />}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{isAdmin ? "Feeds in your organization" : "Your feeds"}</CardTitle>
          <CardDescription>
            Revoke a feed if its link was shared by mistake or you no longer use it.
          </CardDescription>
        </CardHeader>
        <CardBody className="p-0">
          {tokens.isPending ? (
            <div className="p-5">
              <Spinner label="Loading feeds" />
            </div>
          ) : tokens.isError ? (
            <div className="p-5">
              <ErrorMessage error={tokens.error} />
            </div>
          ) : tokens.data.items.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No calendar feeds yet" />
            </div>
          ) : (
            <Table className="border-0">
              <thead className="bg-neutral-50">
                <tr>
                  <Th>Feed</Th>
                  {isAdmin && <Th>Created by</Th>}
                  <Th>Created</Th>
                  <Th>Last checked</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {tokens.data.items.map((t) => (
                  <tr key={t.id}>
                    <Td>
                      <Badge tone={t.scope === "org" ? "brand" : "neutral"}>
                        {SCOPE_LABELS[t.scope]}
                      </Badge>
                    </Td>
                    {isAdmin && <Td>{t.mine ? "You" : (t.userName ?? "A member")}</Td>}
                    <Td className="whitespace-nowrap">{formatDate(t.createdAt)}</Td>
                    <Td className="whitespace-nowrap">
                      {t.lastUsedAt ? formatDate(t.lastUsedAt) : "Not yet"}
                    </Td>
                    <Td className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setRevoking(t)}>
                        <Trash2 aria-hidden /> Revoke
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <AmountsSetting orgId={orgId} canEdit={isAdmin} />

      <ConfirmDialog
        open={revoking != null}
        onClose={() => setRevoking(null)}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
        title="Revoke this calendar feed?"
        description="Calendars subscribed with this link stop updating and the link stops working. Events already in those calendars may stay until the app next refreshes."
        confirmLabel="Revoke feed"
        tone="danger"
        loading={revoke.isPending}
      />
    </div>
  );
}

function WhatsInTheFeed() {
  return (
    <Alert tone="info" title="What a calendar feed shows">
      <ul className="list-disc space-y-0.5 pl-5">
        <li>Application deadlines, with a reminder 3 days before</li>
        <li>Deadlines of grants you shortlisted</li>
        <li>Follow-ups, such as status checks and report due dates</li>
        <li>Reviews waiting, due 3 days before the deadline</li>
      </ul>
      <p className="mt-2">
        Each event has the grant's title, the date and a link back here. Drafts, notes and documents
        are never included. <strong>Anyone who has the link can see these titles</strong>, so treat
        it like a password: don't post it publicly, and revoke it if it gets shared.
      </p>
    </Alert>
  );
}

function NewFeed({ created, onDone }: { created: CreatedCalendarTokenDto; onDone: () => void }) {
  const links = calendarSubscribeLinks(created.url);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(created.url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it yourself.");
    }
  };
  const external = { target: "_blank", rel: "noopener noreferrer" } as const;
  return (
    <div className="space-y-4 rounded-lg border border-success-200 bg-success-50/50 p-4">
      <div>
        <p className="font-medium text-neutral-900">Your feed is ready</p>
        <p className="text-sm text-neutral-600">
          Copy the link now: for your security it won't be shown again. If you lose it, revoke this
          feed and create a new one.
        </p>
      </div>
      <div className="flex gap-2">
        <label htmlFor="calendar-feed-url" className="sr-only">
          Calendar feed link
        </label>
        <Input
          id="calendar-feed-url"
          readOnly
          value={created.url}
          onFocus={(e) => e.currentTarget.select()}
          className="font-mono text-xs"
        />
        <Button variant="secondary" onClick={copy}>
          <Copy aria-hidden /> Copy
        </Button>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-neutral-900">Or add it in one click</p>
        <div className="flex flex-wrap gap-2">
          <a
            href={links.google}
            {...external}
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            Google Calendar <ExternalLink aria-hidden />
          </a>
          <a
            href={links.outlook}
            {...external}
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            Outlook.com <ExternalLink aria-hidden />
          </a>
          <a
            href={links.office365}
            {...external}
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            Outlook (work or school) <ExternalLink aria-hidden />
          </a>
          <a href={links.apple} className={buttonClass({ variant: "secondary", size: "sm" })}>
            Apple Calendar
          </a>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Using another app? Look for “Subscribe to calendar” or “Add calendar from URL” and paste
          the link.
        </p>
      </div>
      <Button size="sm" variant="ghost" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}

function AmountsSetting({ orgId, canEdit }: { orgId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: settingsKey(orgId),
    queryFn: () => api<CalendarSettingsDto>(orgApi(orgId, "/calendar/settings")),
  });
  const update = useMutation({
    mutationFn: (includeAmounts: boolean) =>
      api<CalendarSettingsDto>(orgApi(orgId, "/calendar/settings"), {
        method: "PATCH",
        body: { includeAmounts },
      }),
    onSuccess: (data) => qc.setQueryData(settingsKey(orgId), data),
    onError: () => toast.error("Couldn't save the setting"),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Amounts in event titles</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        {settings.isPending ? (
          <Spinner label="Loading" />
        ) : settings.isError ? (
          <ErrorMessage error={settings.error} />
        ) : (
          <Switch
            id="calendar-include-amounts"
            checked={settings.data.includeAmounts}
            disabled={!canEdit || update.isPending}
            onCheckedChange={(v) => update.mutate(v)}
            label="Show dollar amounts"
            description="Adds the requested amount (or the grant's maximum award) to event titles in every feed. Off by default, because anyone with a feed link would see them."
          />
        )}
        {!canEdit && (
          <p className="text-sm text-neutral-500">
            Only admins of your organization can change this.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
