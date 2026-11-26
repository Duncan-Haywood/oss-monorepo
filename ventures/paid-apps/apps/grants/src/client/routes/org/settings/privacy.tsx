// OWNER: onboarding+settings agent — consents, retention, data export, audit log, delete org.

import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  ErrorMessage,
  Field,
  Select,
  Spinner,
  Table,
  Td,
  Th,
  toast,
} from "@client/components/ui";
import { ApiError, api, orgApi } from "@client/lib/api";
import { appPath } from "@client/lib/base-path";
import type { AuditEntryDto, ConsentDto, DataExportDto, ListResponse } from "@shared/api/types";
import type { ConsentScope } from "@shared/enums";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileArchive, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { SwitchField } from "./form-bits";
import { CONSENT_SCOPE_LABELS } from "./labels";
import { ReadOnlyNotice, SettingsPage } from "./settings-nav";
import { hasRole, type OrgDetail, orgKey, useUpdateSettings } from "./use-org";

export function PrivacySettingsPage() {
  return (
    <SettingsPage
      tab="privacy"
      title="Settings"
      description="Your documents belong to you. Control what we may do with them, take a full copy, or delete everything."
    >
      {({ orgId, org }) => <Privacy orgId={orgId} org={org} />}
    </SettingsPage>
  );
}

const dateTime = (d: string | null | undefined) =>
  d
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(d),
      )
    : "—";

interface ConsentsResponse {
  items: ConsentDto[];
  /** Current decision per scope (org-level scopes, plus the viewer's own personal ones). */
  current?: Partial<Record<ConsentScope, { granted: boolean; policyVersion: string }>>;
}

/** Latest record per scope (records are append-only). */
export function latestConsents(items: ConsentDto[]): Partial<Record<ConsentScope, ConsentDto>> {
  const out: Partial<Record<ConsentScope, ConsentDto>> = {};
  for (const c of items) {
    const prev = out[c.scope];
    if (!prev || prev.createdAt < c.createdAt) out[c.scope] = c;
  }
  return out;
}

function Privacy({ orgId, org }: { orgId: string; org: OrgDetail }) {
  const isAdmin = hasRole(org.role, "admin");
  return (
    <div className="space-y-6">
      <Alert tone="brand" title="Our promise">
        Your documents and answers are used only to draft your own applications. They are never
        shared with other organizations and never used to train AI models.{" "}
        <a
          href={appPath("/legal/data-use")}
          className="font-medium underline"
          target="_blank"
          rel="noreferrer"
        >
          Read the data use policy
        </a>
        .
      </Alert>
      {!isAdmin && <ReadOnlyNotice />}
      <Permissions orgId={orgId} org={org} canEdit={isAdmin} />
      <ExportCard orgId={orgId} canExport={isAdmin} />
      {isAdmin && <AuditLog orgId={orgId} />}
      {org.role === "owner" && <DangerZone orgId={orgId} orgName={org.org.name} />}
    </div>
  );
}

function Permissions({ orgId, org, canEdit }: { orgId: string; org: OrgDetail; canEdit: boolean }) {
  const qc = useQueryClient();
  const consents = useQuery({
    queryKey: ["org", orgId, "consents"],
    queryFn: () => api<ConsentsResponse>(orgApi(orgId, "/privacy/consents")),
  });
  const record = useMutation({
    mutationFn: (v: { scope: ConsentScope; granted: boolean }) =>
      api<ConsentDto>(orgApi(orgId, "/privacy/consents"), { method: "POST", body: v }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["org", orgId, "consents"] });
      qc.invalidateQueries({ queryKey: orgKey(orgId) });
    },
  });
  const latest = latestConsents(consents.data?.items ?? []);

  // Recording website_crawl / voice_recording consent also updates the matching org setting
  // server-side (and vice versa), so one request is enough.
  const toggle = (scope: ConsentScope, granted: boolean) =>
    record.mutate(
      { scope, granted },
      {
        onSuccess: () =>
          toast.success(`${CONSENT_SCOPE_LABELS[scope]}: ${granted ? "allowed" : "turned off"}`),
      },
    );

  const busy = record.isPending;
  // ai_interview is a personal consent (each member decides); absent = not yet given.
  const aiInterview =
    consents.data?.current?.ai_interview?.granted ?? latest.ai_interview?.granted ?? false;
  const history = [...(consents.data?.items ?? [])].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Permissions</CardTitle>
        <p className="mt-1 text-sm text-neutral-500">
          You can change these at any time. Every change is recorded below.
        </p>
      </CardHeader>
      <CardBody className="space-y-5">
        <SwitchField
          label="Read our public website"
          description="Lets us read pages on your public website to learn about your programs. We only read pages you point us to, slowly and politely."
          checked={org.settings.allowWebsiteCrawl}
          disabled={!canEdit || busy}
          onChange={(v) => toggle("website_crawl", v)}
        />
        <SwitchField
          label="AI interviews (your own choice)"
          description="An AI asks you questions about your work and turns your answers into facts you approve. Each team member decides this for themselves."
          checked={aiInterview}
          disabled={busy}
          onChange={(v) => toggle("ai_interview", v)}
        />
        <SwitchField
          label="Keep voice recordings"
          description="Off: we turn spoken answers into text and delete the audio immediately. On: we keep the audio so you can listen again."
          checked={org.settings.storeVoiceRecordings}
          disabled={!canEdit || busy}
          onChange={(v) => toggle("voice_recording", v)}
        />
        <RetentionField orgId={orgId} org={org} canEdit={canEdit} />
        {record.isError && <ErrorMessage error={record.error} />}

        <div className="border-t border-neutral-100 pt-4">
          <h3 className="mb-2 text-sm font-semibold text-neutral-900">Consent history</h3>
          {consents.isPending ? (
            <Spinner label="Loading consent history" />
          ) : consents.isError ? (
            <ErrorMessage error={consents.error} />
          ) : history.length === 0 ? (
            <p className="text-sm text-neutral-500">No consent records yet.</p>
          ) : (
            <ul className="max-h-64 divide-y divide-neutral-100 overflow-y-auto text-sm">
              {history.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-neutral-800">
                    {CONSENT_SCOPE_LABELS[c.scope] ?? c.scope}
                  </span>
                  <span className="flex items-center gap-3 text-neutral-500">
                    <Badge tone={c.granted ? "success" : "neutral"}>
                      {c.granted ? "Agreed" : "Withdrawn"}
                    </Badge>
                    <span className="text-xs">policy {c.policyVersion}</span>
                    <span className="text-xs">{dateTime(c.createdAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

const RETENTION_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Keep until we delete them" },
  { value: "30", label: "Delete originals 30 days after processing" },
  { value: "90", label: "Delete originals 90 days after processing" },
  { value: "365", label: "Delete originals 1 year after processing" },
];

function RetentionField({
  orgId,
  org,
  canEdit,
}: {
  orgId: string;
  org: OrgDetail;
  canEdit: boolean;
}) {
  const save = useUpdateSettings(orgId);
  const current = org.settings.rawFileRetentionDays;
  const value = current == null ? "" : String(current);
  const options = RETENTION_OPTIONS.some((o) => o.value === value)
    ? RETENTION_OPTIONS
    : [...RETENTION_OPTIONS, { value, label: `Delete originals ${value} days after processing` }];
  return (
    <Field
      label="Original uploaded files"
      htmlFor="retention"
      hint="The text we extracted stays so drafts keep their sources. Only the original files are removed."
    >
      <Select
        id="retention"
        className="sm:max-w-md"
        value={value}
        disabled={!canEdit || save.isPending}
        onChange={(e) =>
          save.mutate({ rawFileRetentionDays: e.target.value ? Number(e.target.value) : null })
        }
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function ExportCard({ orgId, canExport }: { orgId: string; canExport: boolean }) {
  const [exportId, setExportId] = useState<string | null>(null);
  const [pollUnsupported, setPollUnsupported] = useState(false);
  const start = useMutation({
    mutationFn: () => api<DataExportDto>(orgApi(orgId, "/privacy/exports"), { method: "POST" }),
    onSuccess: (exp) => {
      setPollUnsupported(false);
      setExportId(exp.id);
    },
  });
  const status = useQuery({
    queryKey: ["org", orgId, "export", exportId],
    queryFn: async () => {
      try {
        return await api<DataExportDto>(
          orgApi(orgId, `/privacy/exports/${encodeURIComponent(exportId ?? "")}`),
        );
      } catch (e) {
        if (e instanceof ApiError && (e.status === 404 || e.status === 405)) {
          setPollUnsupported(true);
          return null;
        }
        throw e;
      }
    },
    enabled: Boolean(exportId) && !pollUnsupported,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "pending" ? 2_000 : false;
    },
  });
  const exp = status.data ?? start.data;
  const downloadHref = exportId
    ? orgApi(orgId, `/privacy/exports/${encodeURIComponent(exportId)}/download`)
    : undefined;
  const ready = exp?.status === "ready" || (pollUnsupported && exportId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export all data</CardTitle>
        <p className="mt-1 text-sm text-neutral-500">
          A ZIP with your documents, facts, interviews, applications, submissions and the audit log.
          The link works for 7 days.
        </p>
      </CardHeader>
      <CardBody className="flex flex-wrap items-center gap-4">
        <Button
          variant="secondary"
          onClick={() => start.mutate()}
          loading={start.isPending}
          disabled={!canExport || exp?.status === "pending"}
        >
          <FileArchive className="h-4 w-4" aria-hidden />
          {exportId ? "Start a new export" : "Export all data"}
        </Button>
        <div aria-live="polite" className="text-sm">
          {exp?.status === "pending" && !pollUnsupported && (
            <Spinner label="Preparing your export — this can take a minute" />
          )}
          {ready && downloadHref && (
            <a
              href={downloadHref}
              className="inline-flex items-center gap-2 font-medium text-brand-700 hover:underline"
            >
              <Download className="h-4 w-4" aria-hidden />
              {pollUnsupported
                ? "Download export (if it's still preparing, try again shortly)"
                : "Download your export"}
            </a>
          )}
          {exp?.status === "failed" && (
            <span className="text-danger-700">
              The export failed{exp.error ? `: ${exp.error}` : ""}. Please try again.
            </span>
          )}
          {exp?.status === "expired" && (
            <span className="text-neutral-500">That export has expired. Start a new one.</span>
          )}
        </div>
        {(start.isError || status.isError) && (
          <div className="w-full">
            <ErrorMessage error={start.error ?? status.error} />
          </div>
        )}
      </CardBody>
    </Card>
  );
}

const humanAction = (action: string) => {
  const s = action.replace(/[._]/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function AuditLog({ orgId }: { orgId: string }) {
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const page = cursors.length - 1;
  const cursor = cursors[page];
  const log = useQuery({
    queryKey: ["org", orgId, "audit", cursor ?? null],
    queryFn: () =>
      api<ListResponse<AuditEntryDto>>(
        orgApi(orgId, `/privacy/audit-log${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
      ),
    placeholderData: keepPreviousData,
  });

  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-brand-600" aria-hidden />
        <CardTitle>Activity record</CardTitle>
      </CardHeader>
      <CardBody>
        <p className="mb-3 text-sm text-neutral-500">
          Every upload, approval, submission and settings change — who did it and when. This record
          can't be edited.
        </p>
        {log.isPending ? (
          <Spinner label="Loading activity" />
        ) : log.isError ? (
          <ErrorMessage error={log.error} />
        ) : log.data.items.length === 0 ? (
          <EmptyState title="No activity yet" description="Actions will appear here as you work." />
        ) : (
          <>
            <Table>
              <thead className="bg-neutral-50">
                <tr>
                  <Th>When</Th>
                  <Th>What happened</Th>
                  <Th>By</Th>
                  <Th>Item</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {log.data.items.map((a) => (
                  <tr key={a.id}>
                    <Td className="whitespace-nowrap text-neutral-500">{dateTime(a.createdAt)}</Td>
                    <Td className="font-medium text-neutral-900">{humanAction(a.action)}</Td>
                    <Td>
                      <Badge
                        tone={
                          a.actorType === "autopilot"
                            ? "warning"
                            : a.actorType === "system"
                              ? "neutral"
                              : "info"
                        }
                      >
                        {a.actorType === "user"
                          ? "Team member"
                          : a.actorType === "autopilot"
                            ? "Autopilot"
                            : "System"}
                      </Badge>
                    </Td>
                    <Td className="text-xs text-neutral-500">
                      {a.targetType ? `${a.targetType} ${a.targetId ?? ""}` : "—"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm text-neutral-500">Page {page + 1}</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page === 0 || log.isFetching}
                  onClick={() => setCursors((c) => c.slice(0, -1))}
                >
                  Newer
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!log.data.nextCursor || log.isFetching}
                  onClick={() => {
                    const next = log.data.nextCursor;
                    if (next) setCursors((c) => [...c, next]);
                  }}
                >
                  Older
                </Button>
              </div>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function DangerZone({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [open, setOpen] = useState(false);
  const del = useMutation({
    mutationFn: () =>
      api(orgApi(orgId, "/privacy/org"), { method: "DELETE", body: { confirmName: orgName } }),
    onSuccess: () => {
      window.location.assign(appPath("/"));
    },
  });
  return (
    <Card className="border-danger-200">
      <CardHeader className="border-danger-100">
        <CardTitle className="text-danger-700">Danger zone</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-xl text-sm text-neutral-600">
          <p className="font-medium text-neutral-900">Delete this organization</p>
          <p>
            Permanently deletes every document, fact, interview, application and file for {orgName}.
            This can't be undone. Export your data first if you might need it.
          </p>
        </div>
        <Button variant="danger" onClick={() => setOpen(true)}>
          <Trash2 className="h-4 w-4" aria-hidden />
          Delete organization
        </Button>
      </CardBody>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => del.mutate()}
        title={`Delete ${orgName}?`}
        description="Everything will be permanently deleted for every member. Type the organization name to confirm."
        confirmLabel="Delete everything"
        tone="danger"
        loading={del.isPending}
        confirmText={orgName}
      >
        {del.isError ? <ErrorMessage error={del.error} /> : null}
      </ConfirmDialog>
    </Card>
  );
}
