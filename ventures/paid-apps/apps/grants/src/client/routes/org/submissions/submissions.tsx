// OWNER: applications UI agent — every submission (with package fingerprint) and the follow-ups
// that come after: status checks, thank-you notes, reports due, deadline reminders.
import { CHANNEL_LABEL, shortSha } from "@client/components/application/model";
import {
  packageUrl,
  useFollowups,
  useSubmissions,
  useUpdateFollowup,
} from "@client/components/application/queries";
import type { FollowupListItem } from "@client/components/application/types";
import { ApiErrorAlert } from "@client/components/grants/api-error-alert";
import { deadlineUrgency, humanize, relativeDeadline } from "@client/components/grants/format";
import { useOrgId } from "@client/components/grants/queries";
import { GuideNextStep } from "@client/components/guide/getting-started";
import {
  Badge,
  Button,
  buttonClass,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Label,
  PageHeader,
  Select,
  SkeletonCard,
  StatusBadge,
  Table,
  Td,
  Textarea,
  Th,
  toast,
} from "@client/components/ui";
import { formatDate } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { useCurrentOrg } from "@client/lib/session";
import type { FollowupStatus } from "@shared/enums";
import { Link } from "@tanstack/react-router";
import { CalendarCheck, Check, Download, Inbox, RotateCcw, SkipForward } from "lucide-react";
import * as React from "react";

export function SubmissionsPage() {
  const orgId = useOrgId();
  return (
    <div className="space-y-8">
      <PageHeader
        title="Submissions & follow-ups"
        description="Every submission keeps the exact package that was sent, with its SHA-256 fingerprint. Follow-ups keep the relationship going after you hit submit."
      />
      <SubmissionsTable orgId={orgId} />
      <FollowupsSection orgId={orgId} />
    </div>
  );
}

function SubmissionsTable({ orgId }: { orgId: string }) {
  const q = useSubmissions(orgId);
  const items = q.data?.items ?? [];
  return (
    <section aria-labelledby="submissions-table-heading" className="space-y-3">
      <h2 id="submissions-table-heading" className="text-lg font-semibold text-neutral-900">
        Submissions
      </h2>
      {q.isPending ? (
        <SkeletonCard />
      ) : q.error ? (
        <ApiErrorAlert error={q.error} title="Couldn't load submissions" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title="No submissions yet"
          description="Approve an application and its submission package shows up here."
          action={<GuideNextStep orgId={orgId} />}
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Application</Th>
              <Th>Channel</Th>
              <Th>Status</Th>
              <Th>Fingerprint</Th>
              <Th>Reference</Th>
              <Th>Date</Th>
              <Th>
                <span className="sr-only">Package</span>
              </Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {items.map((s) => (
              <tr key={s.id} className="hover:bg-neutral-50/60">
                <Td className="min-w-56">
                  {s.application ? (
                    <Link
                      to="/orgs/$orgId/applications/$applicationId"
                      params={{ orgId, applicationId: s.application.id }}
                      className="font-medium text-neutral-900 hover:text-brand-700 hover:underline"
                    >
                      {s.application.title}
                    </Link>
                  ) : (
                    <span className="text-neutral-500">Deleted application</span>
                  )}
                </Td>
                <Td className="whitespace-nowrap">{CHANNEL_LABEL[s.channel]}</Td>
                <Td>
                  <StatusBadge
                    status={s.status}
                    kind="submission"
                    label={
                      s.status === "pending" && s.channel === "manual"
                        ? "Waiting for you"
                        : undefined
                    }
                  />
                </Td>
                <Td>
                  <code className="font-mono text-xs text-neutral-600" title={s.packageSha256}>
                    {shortSha(s.packageSha256)}
                  </code>
                </Td>
                <Td className="font-mono text-xs">{s.externalRef ?? "—"}</Td>
                <Td className="whitespace-nowrap text-neutral-500">
                  {formatDate(s.confirmedAt ?? s.sentAt ?? s.createdAt)}
                </Td>
                <Td className="text-right">
                  <a
                    href={packageUrl(orgId, s.id, { download: true })}
                    download={`submission-${s.id}.json`}
                    className={buttonClass({ variant: "ghost", size: "xs" })}
                  >
                    <Download aria-hidden /> Package
                    <span className="sr-only"> for {s.application?.title ?? s.id}</span>
                  </a>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  );
}

const FOLLOWUP_FILTERS: { value: FollowupStatus | "all"; label: string }[] = [
  { value: "pending", label: "To do" },
  { value: "done", label: "Done" },
  { value: "skipped", label: "Skipped" },
  { value: "all", label: "All" },
];

function FollowupsSection({ orgId }: { orgId: string }) {
  const [status, setStatus] = React.useState<FollowupStatus | "all">("pending");
  const q = useFollowups(orgId, status);
  const items = q.data?.items ?? [];
  const { can } = useCurrentOrg();
  const filterId = React.useId();

  return (
    <section aria-labelledby="followups-heading" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="followups-heading" className="text-lg font-semibold text-neutral-900">
          Follow-ups
        </h2>
        <div className="w-44 space-y-1.5">
          <Label htmlFor={filterId}>Show</Label>
          <Select
            id={filterId}
            value={status}
            onChange={(e) => setStatus(e.target.value as FollowupStatus | "all")}
          >
            {FOLLOWUP_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {q.isPending ? (
        <SkeletonCard />
      ) : q.error ? (
        <ApiErrorAlert error={q.error} title="Couldn't load follow-ups" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck />}
          title={status === "pending" ? "You're all caught up" : "Nothing here"}
          description="Status checks, thank-you notes and report reminders appear here after you submit."
        />
      ) : (
        <ul className="space-y-3">
          {items.map((f) => (
            <li key={f.id}>
              <FollowupCard followup={f} orgId={orgId} canEdit={can("editor")} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FollowupCard({
  followup: f,
  orgId,
  canEdit,
}: {
  followup: FollowupListItem;
  orgId: string;
  canEdit: boolean;
}) {
  const [notes, setNotes] = React.useState(f.notes);
  const update = useUpdateFollowup(orgId);
  const notesId = React.useId();
  const urgency = f.status === "pending" ? deadlineUrgency(f.dueAt) : "none";
  const dirty = notes !== f.notes;

  const act = (status: FollowupStatus, message: string) =>
    update.mutate(
      { id: f.id, status, ...(dirty ? { notes } : {}) },
      { onSuccess: () => toast.success(message) },
    );

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <h3 className="font-semibold text-neutral-900">{f.title}</h3>
          <p className="text-xs text-neutral-500">
            {humanize(f.kind)}
            {f.application && (
              <>
                {" · "}
                <Link
                  to="/orgs/$orgId/applications/$applicationId"
                  params={{ orgId, applicationId: f.application.id }}
                  className="text-brand-700 hover:underline"
                >
                  {f.application.title}
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "text-sm",
              urgency === "past" && "font-semibold text-danger-700",
              urgency === "urgent" && "font-semibold text-warning-700",
              urgency !== "past" && urgency !== "urgent" && "text-neutral-600",
            )}
          >
            {f.status === "pending"
              ? urgency === "past"
                ? `Overdue · was due ${formatDate(f.dueAt)}`
                : `${relativeDeadline(f.dueAt, undefined, { future: "Due", past: "Was due" })} · ${formatDate(f.dueAt)}`
              : `Due ${formatDate(f.dueAt)}`}
          </span>
          <StatusBadge
            status={f.status}
            kind="followup"
            label={f.status === "pending" ? "To do" : undefined}
          />
        </div>
      </CardHeader>
      <CardBody className="space-y-3">
        {canEdit ? (
          <Field label="Notes" htmlFor={notesId}>
            <Textarea
              id={notesId}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={5000}
              className="min-h-16"
              placeholder="Who did you talk to? What did they say?"
            />
          </Field>
        ) : (
          f.notes && <p className="text-sm text-neutral-700">{f.notes}</p>
        )}
        <ApiErrorAlert error={update.error} title="Couldn't update the follow-up" />
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            {f.status === "pending" ? (
              <>
                <Button
                  size="sm"
                  loading={update.isPending}
                  onClick={() => act("done", "Marked done")}
                >
                  <Check aria-hidden /> Done
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={update.isPending}
                  onClick={() => act("skipped", "Skipped")}
                >
                  <SkipForward aria-hidden /> Skip
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                loading={update.isPending}
                onClick={() => act("pending", "Moved back to To do")}
              >
                <RotateCcw aria-hidden /> Reopen
              </Button>
            )}
            {dirty && (
              <Button
                size="sm"
                variant="ghost"
                disabled={update.isPending}
                onClick={() =>
                  update.mutate(
                    { id: f.id, notes },
                    { onSuccess: () => toast.success("Notes saved") },
                  )
                }
              >
                Save notes
              </Button>
            )}
            {f.completedAt && (
              <Badge tone="neutral" className="self-center">
                Closed {formatDate(f.completedAt)}
              </Badge>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
