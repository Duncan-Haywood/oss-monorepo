// OWNER: integrations — Settings → Integrations: Slack / Microsoft Teams notification destinations
// and the Slack `/grants` slash command (connect workspace, link my account). Admins manage
// destinations and workspaces; editors link their own Slack account; everyone can read.
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  ErrorMessage,
  Field,
  Input,
  Kbd,
  Select,
  Spinner,
  Switch,
  toast,
} from "@client/components/ui";
import { api, formatDate, orgApi } from "@client/lib/api";
import {
  DEFAULT_INTEGRATION_EVENTS,
  type DestinationTestResultDto,
  INTEGRATION_EVENT_LABELS,
  INTEGRATION_EVENTS,
  INTEGRATION_PROVIDER_LABELS,
  type IntegrationDestinationDto,
  type IntegrationEventKind,
  type IntegrationProvider,
  type IntegrationsOverviewDto,
  type LinkCodeDto,
} from "@shared/integrations";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Copy, MessageSquare, Plus, Send, ShieldCheck, Trash2 } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { ReadOnlyNotice, SettingsPage } from "./settings-nav";
import { hasRole, type OrgDetail } from "./use-org";

const integrationsKey = (orgId: string) => ["org", orgId, "integrations"] as const;

export function IntegrationsSettingsPage() {
  return (
    <SettingsPage
      tab="integrations"
      title="Settings"
      description="Get grant updates in Slack or Microsoft Teams, and share quick updates from Slack."
    >
      {({ orgId, org }) => <Integrations orgId={orgId} org={org} />}
    </SettingsPage>
  );
}

function Integrations({ orgId, org }: { orgId: string; org: OrgDetail }) {
  const overview = useQuery({
    queryKey: integrationsKey(orgId),
    queryFn: () => api<IntegrationsOverviewDto>(orgApi(orgId, "/integrations")),
  });
  if (overview.isPending) return <Spinner label="Loading integrations" />;
  if (overview.isError) return <ErrorMessage error={overview.error} />;
  const isAdmin = hasRole(org.role, "admin");
  return (
    <div className="space-y-6">
      {!isAdmin && <ReadOnlyNotice />}
      <DestinationsCard orgId={orgId} isAdmin={isAdmin} destinations={overview.data.destinations} />
      <SlackCommandCard orgId={orgId} org={org} slack={overview.data.slack} />
      <ApprovalsCard />
    </div>
  );
}

// --- outbound notifications ------------------------------------------------------------------------

function DestinationsCard({
  orgId,
  isAdmin,
  destinations,
}: {
  orgId: string;
  isAdmin: boolean;
  destinations: IntegrationDestinationDto[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="h-4 w-4" aria-hidden /> Chat notifications
        </CardTitle>
        <CardDescription>
          Post to a Slack or Teams channel when something needs your team. Messages include titles,
          counts and a link back here. They never include your documents or facts.
        </CardDescription>
      </CardHeader>
      <CardBody className="space-y-4">
        {destinations.length === 0 ? (
          <EmptyState
            title="No channels yet"
            description={
              isAdmin
                ? "Add a Slack or Teams channel below."
                : "An admin can connect a Slack or Teams channel."
            }
          />
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
            {destinations.map((d) => (
              <DestinationRow key={d.id} orgId={orgId} d={d} isAdmin={isAdmin} />
            ))}
          </ul>
        )}
        {isAdmin && <AddDestinationForm orgId={orgId} />}
        <ProviderHelp />
      </CardBody>
    </Card>
  );
}

function EventPicker({
  value,
  onChange,
  disabled,
  idPrefix,
}: {
  value: IntegrationEventKind[];
  onChange: (next: IntegrationEventKind[]) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  return (
    <fieldset className="grid gap-2 sm:grid-cols-2" disabled={disabled}>
      <legend className="mb-1 text-sm font-medium text-neutral-900">Send these events</legend>
      {INTEGRATION_EVENTS.map((e) => {
        const id = `${idPrefix}-${e}`;
        return (
          <label key={e} htmlFor={id} className="flex items-center gap-2 text-sm text-neutral-700">
            <Checkbox
              id={id}
              checked={value.includes(e)}
              onChange={(ev) =>
                onChange(ev.currentTarget.checked ? [...value, e] : value.filter((x) => x !== e))
              }
            />
            {INTEGRATION_EVENT_LABELS[e]}
          </label>
        );
      })}
    </fieldset>
  );
}

function DestinationRow({
  orgId,
  d,
  isAdmin,
}: {
  orgId: string;
  d: IntegrationDestinationDto;
  isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const idPrefix = useId();
  const [confirm, setConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [events, setEvents] = useState<IntegrationEventKind[]>(d.events);
  const path = orgApi(orgId, `/integrations/destinations/${encodeURIComponent(d.id)}`);
  const invalidate = () => qc.invalidateQueries({ queryKey: integrationsKey(orgId) });

  const patch = useMutation({
    mutationFn: (body: { enabled?: boolean; events?: IntegrationEventKind[] }) =>
      api<IntegrationDestinationDto>(path, { method: "PATCH", body }),
    onSuccess: () => {
      invalidate();
      setEditing(false);
    },
    onError: (e) => toast.error("Could not save", e),
  });
  const test = useMutation({
    mutationFn: () => api<DestinationTestResultDto>(`${path}/test`, { method: "POST" }),
    onSuccess: (r) => {
      invalidate();
      if (r.ok) toast.success("Test message sent", `Check ${d.label}.`);
      else toast.error("The test message failed", r.error ?? `Status ${r.status ?? "unknown"}`);
    },
    onError: (e) => toast.error("The test message failed", e),
  });
  const remove = useMutation({
    mutationFn: () => api<void>(path, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      setConfirm(false);
      toast.success("Channel removed");
    },
    onError: (e) => toast.error("Could not remove the channel", e),
  });

  return (
    <li className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={d.provider === "slack" ? "accent" : "info"}>
              {INTEGRATION_PROVIDER_LABELS[d.provider]}
            </Badge>
            <span className="font-medium text-neutral-900">{d.label}</span>
            {!d.enabled && <Badge tone="neutral">Paused</Badge>}
            {d.lastStatus === "ok" && (
              <Badge tone="success" dot>
                Working
              </Badge>
            )}
            {d.lastStatus === "error" && (
              <Badge tone="danger" dot>
                Last delivery failed{d.lastError ? ` (${d.lastError})` : ""}
              </Badge>
            )}
          </div>
          <p className="truncate font-mono text-xs text-neutral-500">{d.urlHint}</p>
          <p className="text-sm text-neutral-600">
            {d.events.length
              ? d.events.map((e) => INTEGRATION_EVENT_LABELS[e]).join(" · ")
              : "No events selected"}
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <Switch
              checked={d.enabled}
              onCheckedChange={(enabled) => patch.mutate({ enabled })}
              label={d.enabled ? "On" : "Off"}
              disabled={patch.isPending}
            />
            <Button size="sm" variant="secondary" onClick={() => setEditing((v) => !v)}>
              Events
            </Button>
            <Button
              size="sm"
              variant="secondary"
              loading={test.isPending}
              onClick={() => test.mutate()}
            >
              <Send aria-hidden /> Test
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Remove ${d.label}`}
              onClick={() => setConfirm(true)}
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        )}
      </div>
      {editing && (
        <div className="space-y-3 rounded-md bg-neutral-50 p-3">
          <EventPicker value={events} onChange={setEvents} idPrefix={idPrefix} />
          <div className="flex gap-2">
            <Button size="sm" loading={patch.isPending} onClick={() => patch.mutate({ events })}>
              Save events
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => remove.mutate()}
        title={`Remove ${d.label}?`}
        description="Grant Autopilot will stop posting to this channel. You can add it again later."
        confirmLabel="Remove"
        tone="danger"
        loading={remove.isPending}
      />
    </li>
  );
}

function AddDestinationForm({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const idPrefix = useId();
  const [provider, setProvider] = useState<IntegrationProvider>("slack");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<IntegrationEventKind[]>(DEFAULT_INTEGRATION_EVENTS);
  const [error, setError] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () =>
      api<IntegrationDestinationDto>(orgApi(orgId, "/integrations/destinations"), {
        method: "POST",
        body: { provider, label: label.trim(), url: url.trim(), events },
      }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: integrationsKey(orgId) });
      setLabel("");
      setUrl("");
      setError(null);
      toast.success("Channel added", `Use Test to check that ${d.label} gets messages.`);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not add the channel"),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate();
  };
  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-lg border border-dashed border-neutral-300 p-4"
    >
      <p className="text-sm font-medium text-neutral-900">Add a channel</p>
      <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
        <Field label="App" htmlFor={`${idPrefix}-provider`}>
          <Select
            id={`${idPrefix}-provider`}
            value={provider}
            onChange={(e) => setProvider(e.currentTarget.value as IntegrationProvider)}
          >
            <option value="slack">Slack</option>
            <option value="teams">Microsoft Teams</option>
          </Select>
        </Field>
        <Field
          label="Name"
          htmlFor={`${idPrefix}-label`}
          hint="For example, #grants or Development team"
        >
          <Input
            id={`${idPrefix}-label`}
            value={label}
            maxLength={80}
            onChange={(e) => setLabel(e.currentTarget.value)}
            required
          />
        </Field>
      </div>
      <Field
        label="Webhook URL"
        htmlFor={`${idPrefix}-url`}
        hint={
          provider === "slack"
            ? "Starts with https://hooks.slack.com/services/"
            : "The link from the Teams Workflows app (…powerplatform.com or …logic.azure.com)"
        }
        error={error ?? undefined}
      >
        <Input
          id={`${idPrefix}-url`}
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
          required
        />
      </Field>
      <EventPicker value={events} onChange={setEvents} idPrefix={`${idPrefix}-ev`} />
      <p className="text-xs text-neutral-500">
        The webhook URL works like a password. We store it encrypted and never show it again.
      </p>
      <Button type="submit" loading={add.isPending} disabled={!label.trim() || !url.trim()}>
        <Plus aria-hidden /> Add channel
      </Button>
    </form>
  );
}

function ProviderHelp() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <details className="rounded-lg border border-neutral-200 p-3 text-sm">
        <summary className="cursor-pointer font-medium text-neutral-900">
          How to get a Slack webhook URL
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-neutral-600">
          <li>
            Go to <span className="font-mono">api.slack.com/apps</span> and open your Grant
            Autopilot app (or create an app for your workspace).
          </li>
          <li>
            Open <strong>Incoming Webhooks</strong> and turn it on.
          </li>
          <li>
            Click <strong>Add New Webhook</strong>, pick the channel (for example #grants), and
            allow it.
          </li>
          <li>Copy the webhook URL and paste it above.</li>
        </ol>
      </details>
      <details className="rounded-lg border border-neutral-200 p-3 text-sm">
        <summary className="cursor-pointer font-medium text-neutral-900">
          How to get a Microsoft Teams webhook URL
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-neutral-600">
          <li>
            In Teams, go to the channel, select <strong>More options (…)</strong>, then{" "}
            <strong>Workflows</strong>.
          </li>
          <li>
            Choose the template <strong>Send webhook alerts to a channel</strong> (it uses the
            trigger “When a Teams webhook request is received”).
          </li>
          <li>Pick the team and channel, then save.</li>
          <li>Copy the webhook link it shows and paste it above.</li>
        </ol>
        <p className="mt-2 text-neutral-500">
          Office 365 Connector webhooks (…webhook.office.com) were retired by Microsoft and won't
          work. The workflow belongs to whoever created it, so add a co-owner in the Workflows app
          so it keeps working if that person leaves.
        </p>
      </details>
    </div>
  );
}

// --- inbound slash command -------------------------------------------------------------------------

function CodeBox({ code, onDone }: { code: LinkCodeDto; onDone: () => void }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code.command);
      toast.success("Copied", "Paste it in any Slack channel or DM.");
    } catch {
      toast.info("Copy the command by hand", code.command);
    }
  };
  return (
    <Alert
      tone="brand"
      title="Type this in Slack"
      action={
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={copy}>
            <Copy aria-hidden /> Copy
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            Done
          </Button>
        </div>
      }
    >
      <Kbd className="text-sm">{code.command}</Kbd>
      <p className="mt-1">
        Works once, until {formatDate(code.expiresAt)}{" "}
        {new Date(code.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.
      </p>
    </Alert>
  );
}

function SlackCommandCard({
  orgId,
  org,
  slack,
}: {
  orgId: string;
  org: OrgDetail;
  slack: IntegrationsOverviewDto["slack"];
}) {
  const qc = useQueryClient();
  const isAdmin = hasRole(org.role, "admin");
  const isEditor = hasRole(org.role, "editor");
  const [code, setCode] = useState<LinkCodeDto | null>(null);
  const [disconnect, setDisconnect] = useState<string | null>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: integrationsKey(orgId) });

  const makeCode = useMutation({
    mutationFn: (purpose: "connect" | "link") =>
      api<LinkCodeDto>(orgApi(orgId, `/integrations/slack/${purpose}-code`), { method: "POST" }),
    onSuccess: setCode,
    onError: (e) => toast.error("Could not create a code", e),
  });
  const unlink = useMutation({
    mutationFn: () => api<void>(orgApi(orgId, "/integrations/slack/link"), { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      toast.success("Your Slack account is unlinked");
    },
    onError: (e) => toast.error("Could not unlink", e),
  });
  const removeWorkspace = useMutation({
    mutationFn: (teamId: string) =>
      api<void>(orgApi(orgId, `/integrations/slack/workspaces/${encodeURIComponent(teamId)}`), {
        method: "DELETE",
      }),
    onSuccess: () => {
      invalidate();
      setDisconnect(null);
      toast.success("Slack workspace disconnected");
    },
    onError: (e) => toast.error("Could not disconnect", e),
  });

  const connected = slack.workspaces.length > 0;
  const manifest = JSON.stringify(
    {
      display_information: { name: "Grant Autopilot" },
      features: {
        bot_user: { display_name: "Grant Autopilot", always_online: false },
        slash_commands: [
          {
            command: "/grants",
            url: slack.commandUrl,
            description: "Share a quick update with Grant Autopilot",
            usage_hint: "update <what's new>",
            should_escape: false,
          },
        ],
      },
      oauth_config: { scopes: { bot: ["commands", "incoming-webhook"] } },
      settings: {
        org_deploy_enabled: false,
        socket_mode_enabled: false,
        token_rotation_enabled: false,
      },
    },
    null,
    2,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" aria-hidden /> Quick updates from Slack
        </CardTitle>
        <CardDescription>
          Type <Kbd>/grants update We opened a second food pantry in March</Kbd> in Slack. We save
          it as an update note and propose facts from it. Your team still reviews every fact here
          before it can be used in an application.
        </CardDescription>
      </CardHeader>
      <CardBody className="space-y-5">
        {!slack.commandsConfigured && (
          <Alert tone="warning" title="Slack commands aren't set up for this deployment yet">
            Whoever runs Grant Autopilot needs to finish step 1 below.
          </Alert>
        )}
        {code && <CodeBox code={code} onDone={() => setCode(null)} />}

        <ol className="space-y-4 text-sm text-neutral-700">
          <li className="space-y-2">
            <p className="font-medium text-neutral-900">
              1. Create the Slack app (once, by whoever runs Grant Autopilot)
            </p>
            <ol className="list-[lower-alpha] space-y-1 pl-5">
              <li>
                Go to <span className="font-mono">api.slack.com/apps</span> →{" "}
                <strong>Create New App</strong> → <strong>From a manifest</strong>, pick your
                workspace, and paste the manifest below.
              </li>
              <li>Install the app to your workspace.</li>
              <li>
                Under <strong>Basic Information</strong>, copy the <strong>Signing Secret</strong>{" "}
                and set it on the server: <Kbd>wrangler secret put SLACK_SIGNING_SECRET</Kbd>.
              </li>
            </ol>
            <details className="rounded-md border border-neutral-200 p-2">
              <summary className="cursor-pointer text-neutral-900">App manifest</summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded bg-neutral-900 p-3 text-xs text-neutral-100">
                {manifest}
              </pre>
            </details>
            <p className="text-neutral-500">
              Request URL for the slash command:{" "}
              <span className="font-mono">{slack.commandUrl}</span>
            </p>
          </li>

          <li className="space-y-2">
            <p className="font-medium text-neutral-900">
              2. Connect your Slack workspace (an admin)
            </p>
            {connected ? (
              <ul className="space-y-2">
                {slack.workspaces.map((w) => (
                  <li key={w.teamId} className="flex flex-wrap items-center gap-2">
                    <Badge tone="success" dot>
                      Connected
                    </Badge>
                    <span>
                      {w.teamDomain ? `${w.teamDomain}.slack.com` : w.teamId} · {w.linkedUsers}{" "}
                      linked {w.linkedUsers === 1 ? "person" : "people"} · since{" "}
                      {formatDate(w.connectedAt)}
                    </span>
                    {isAdmin && (
                      <Button size="xs" variant="ghost" onClick={() => setDisconnect(w.teamId)}>
                        Disconnect
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-neutral-500">No Slack workspace is connected yet.</p>
            )}
            {isAdmin && (
              <Button
                size="sm"
                variant="secondary"
                loading={makeCode.isPending && makeCode.variables === "connect"}
                onClick={() => makeCode.mutate("connect")}
              >
                Create a connect code
              </Button>
            )}
          </li>

          <li className="space-y-2">
            <p className="font-medium text-neutral-900">
              3. Link your own Slack account (each person)
            </p>
            {slack.myLink ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="success" dot>
                  Linked
                </Badge>
                <span>since {formatDate(slack.myLink.linkedAt)}</span>
                <Button
                  size="xs"
                  variant="ghost"
                  loading={unlink.isPending}
                  onClick={() => unlink.mutate()}
                >
                  Unlink
                </Button>
              </div>
            ) : isEditor ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={!connected}
                loading={makeCode.isPending && makeCode.variables === "link"}
                onClick={() => makeCode.mutate("link")}
              >
                Link my Slack account
              </Button>
            ) : (
              <p className="text-neutral-500">Sharing updates from Slack needs editor access.</p>
            )}
          </li>

          <li>
            <p className="font-medium text-neutral-900">4. Share an update</p>
            <p>
              <Kbd>/grants update &lt;what's new&gt;</Kbd>: Slack replies only to you with how many
              facts were proposed and a link to review them. <Kbd>/grants help</Kbd> lists the
              commands.
            </p>
          </li>
        </ol>
        <ConfirmDialog
          open={disconnect !== null}
          onClose={() => setDisconnect(null)}
          onConfirm={() => disconnect && removeWorkspace.mutate(disconnect)}
          title="Disconnect this Slack workspace?"
          description="Slash commands from it will stop working and everyone's Slack link is removed. Updates already shared stay in Grant Autopilot."
          confirmLabel="Disconnect"
          tone="danger"
          loading={removeWorkspace.isPending}
        />
      </CardBody>
    </Card>
  );
}

function ApprovalsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" aria-hidden /> Why approvals stay in Grant Autopilot
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-2 text-sm text-neutral-600">
        <p>
          Slack and Teams messages link to the review screen, but you can't approve, confirm or
          submit from chat. Approving an application sends it to a funder, so we want the person to
          see the full draft, its sources and any warnings first, signed in to their own account.
        </p>
        <p>
          Chat buttons can be clicked by anyone in the channel, and messages get forwarded. Keeping
          approvals here means each one is tied to a signed-in person and recorded in your audit
          log.
        </p>
      </CardBody>
    </Card>
  );
}
