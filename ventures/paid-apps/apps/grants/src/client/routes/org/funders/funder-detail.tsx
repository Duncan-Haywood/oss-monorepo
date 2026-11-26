// One funder: stage, owner and next step, quick actions (log a call, set the next step, start an
// application from an open opportunity), the merged timeline, the people you talk to, the
// interactions log and the foundation's 990-PF giving (with ProPublica attribution).

import { DraftApplicationButton } from "@client/components/grants/draft-application";
import { useOrgId } from "@client/components/grants/queries";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Dialog,
  ErrorMessage,
  Field,
  Input,
  Select,
  SkeletonCard,
  Textarea,
  toast,
} from "@client/components/ui";
import { formatCents, formatDate } from "@client/lib/api";
import { appPath } from "@client/lib/base-path";
import {
  FUNDER_INTERACTION_KINDS,
  FUNDER_INTERACTION_LABELS,
  FUNDER_STAGE_LABELS,
  FUNDER_STAGES,
  type FunderContactDto,
  type FunderDetailResponse,
  type FunderInteractionKind,
  type FunderStage,
  type FunderTimelineItem,
  PREFERRED_CONTACT_METHODS,
  type PreferredContactMethod,
} from "@shared/api/funders";
import { Link, useParams } from "@tanstack/react-router";
import { CalendarClock, ExternalLink, Pencil, Phone, Trash2, UserPlus } from "lucide-react";
import * as React from "react";
import { fromLocalInput, nextStepUrgency, STAGE_TONE, toLocalInput } from "./model";
import {
  useDeleteContact,
  useDeleteInteraction,
  useFunder,
  useLogInteraction,
  useSaveContact,
  useUpdateFunder,
} from "./queries";

export function FunderDetailPage({ now = new Date() }: { now?: Date } = {}) {
  const orgId = useOrgId();
  const { funderId = "" } = useParams({ strict: false }) as { funderId?: string };
  const query = useFunder(orgId, funderId);
  if (query.isPending) return <SkeletonCard />;
  if (query.isError)
    return <ErrorMessage error={query.error} title="We couldn't load this funder" />;
  return <FunderDetail orgId={orgId} data={query.data} now={now} />;
}

type DialogKind = "interaction" | "next_step" | "contact" | null;

export function FunderDetail({
  orgId,
  data,
  now,
}: {
  orgId: string;
  data: FunderDetailResponse;
  now: Date;
}) {
  const { relation, canEdit } = data;
  const update = useUpdateFunder(orgId, relation.id);
  const [dialog, setDialog] = React.useState<DialogKind>(null);
  const [interactionKind, setInteractionKind] = React.useState<FunderInteractionKind>("call");
  const [editingContact, setEditingContact] = React.useState<FunderContactDto | null>(null);
  const urgency = nextStepUrgency(relation.nextStepAt, now);

  const openInteraction = (kind: FunderInteractionKind) => {
    setInteractionKind(kind);
    setDialog("interaction");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link to="/orgs/$orgId/funders" params={{ orgId }} className="text-sm text-link">
            ← All funders
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-strong">{relation.displayName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Badge tone={STAGE_TONE[relation.stage]} dot>
              {FUNDER_STAGE_LABELS[relation.stage]}
            </Badge>
            {relation.stageSource === "auto" && <span>Stage follows your applications</span>}
            {relation.tags.map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
            {data.funder?.websiteUrl && (
              <a
                href={data.funder.websiteUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-link"
              >
                Website <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            )}
          </div>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => openInteraction("call")}>
              <Phone aria-hidden /> Log a call
            </Button>
            <Button variant="secondary" onClick={() => setDialog("next_step")}>
              <CalendarClock aria-hidden /> Set next step
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Next step</CardTitle>
            </CardHeader>
            <CardBody>
              {relation.nextStepAt ? (
                <p className={urgency === "overdue" ? "font-medium text-danger-700" : undefined}>
                  {urgency === "overdue" ? "Overdue since " : "Due "}
                  {formatDate(relation.nextStepAt)}
                  {relation.nextStepNote ? ` — ${relation.nextStepNote}` : ""}
                </p>
              ) : (
                <p className="text-muted">
                  No next step yet. Small, regular touches (a thank-you, an update, an invitation)
                  keep a funder close between applications.
                </p>
              )}
            </CardBody>
          </Card>

          <OpenOpportunities orgId={orgId} data={data} />

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardBody>
              <Timeline data={data} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="flex items-center justify-between gap-2">
              <CardTitle>Interactions</CardTitle>
              {canEdit && (
                <Button size="sm" variant="ghost" onClick={() => openInteraction("email")}>
                  Log an interaction
                </Button>
              )}
            </CardHeader>
            <CardBody>
              <InteractionsLog orgId={orgId} data={data} />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Relationship</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <Field label="Stage" htmlFor="funder-stage">
                <Select
                  id="funder-stage"
                  value={relation.stageSource === "auto" ? "auto" : relation.stage}
                  disabled={!canEdit || update.isPending}
                  onChange={(e) =>
                    update.mutate(
                      { stage: e.target.value as FunderStage | "auto" },
                      { onSuccess: () => toast.success("Stage updated") },
                    )
                  }
                >
                  <option value="auto">Automatic ({FUNDER_STAGE_LABELS[relation.stage]})</option>
                  {FUNDER_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {FUNDER_STAGE_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Owner" htmlFor="funder-owner">
                <Select
                  id="funder-owner"
                  value={relation.ownerId ?? ""}
                  disabled={!canEdit || update.isPending}
                  onChange={(e) => update.mutate({ ownerId: e.target.value || null })}
                >
                  <option value="">Nobody yet</option>
                  {data.members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="flex items-center justify-between gap-2">
              <CardTitle>People</CardTitle>
              {canEdit && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditingContact(null);
                    setDialog("contact");
                  }}
                >
                  <UserPlus aria-hidden /> Add
                </Button>
              )}
            </CardHeader>
            <CardBody>
              <Contacts
                orgId={orgId}
                data={data}
                onEdit={(c) => {
                  setEditingContact(c);
                  setDialog("contact");
                }}
              />
            </CardBody>
          </Card>

          {data.prospect && <ProspectCard prospect={data.prospect} />}
        </div>
      </div>

      <InteractionDialog
        orgId={orgId}
        relationId={relation.id}
        contacts={data.contacts}
        open={dialog === "interaction"}
        initialKind={interactionKind}
        now={now}
        onClose={() => setDialog(null)}
      />
      <NextStepDialog
        orgId={orgId}
        relationId={relation.id}
        open={dialog === "next_step"}
        initialAt={relation.nextStepAt}
        initialNote={relation.nextStepNote}
        onClose={() => setDialog(null)}
      />
      <ContactDialog
        orgId={orgId}
        relationId={relation.id}
        open={dialog === "contact"}
        contact={editingContact}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}

function OpenOpportunities({ orgId, data }: { orgId: string; data: FunderDetailResponse }) {
  if (data.openOpportunities.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Open opportunities from this funder</CardTitle>
      </CardHeader>
      <CardBody>
        <ul className="divide-y divide-line-subtle">
          {data.openOpportunities.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <Link
                  to="/orgs/$orgId/opportunities/$opportunityId"
                  params={{ orgId, opportunityId: o.id }}
                  className="font-medium text-link hover:underline"
                >
                  {o.title}
                </Link>
                <p className="text-xs text-muted">
                  {o.closeDate ? `Closes ${formatDate(o.closeDate)}` : "No deadline announced"}
                  {o.awardCeilingCents != null
                    ? ` · up to ${formatCents(o.awardCeilingCents)}`
                    : ""}
                </p>
              </div>
              {o.hasActiveApplication ? (
                <Badge tone="brand">Application in progress</Badge>
              ) : (
                data.canEdit && (
                  <DraftApplicationButton
                    orgId={orgId}
                    opportunityId={o.id}
                    label="Start an application"
                  />
                )
              )}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function Timeline({ data }: { data: FunderDetailResponse }) {
  const { upcoming, past } = data.timeline;
  if (upcoming.length === 0 && past.length === 0) {
    return (
      <p className="text-sm text-muted">
        Nothing yet. Applications, awards, reports, watchlist finds and the interactions you log all
        show up here.
      </p>
    );
  }
  return (
    <div className="space-y-5">
      {upcoming.length > 0 && <TimelineList label="Coming up" items={upcoming} />}
      {past.length > 0 && <TimelineList label="History" items={past} />}
    </div>
  );
}

function TimelineList({ label, items }: { label: string; items: FunderTimelineItem[] }) {
  const orgId = useOrgId();
  return (
    <section aria-label={label}>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">{label}</h3>
      <ol className="space-y-3 border-l border-line pl-4">
        {items.map((i) => (
          <li key={i.id} data-kind={i.kind}>
            <p className="text-xs text-muted">{formatDate(i.at)}</p>
            <p className="text-sm font-medium text-strong">
              {i.link ? (
                <a href={appPath(`/orgs/${orgId}${i.link}`)} className="hover:underline">
                  {i.title}
                </a>
              ) : (
                i.title
              )}
            </p>
            {i.detail && <p className="text-sm text-muted">{i.detail}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}

function InteractionsLog({ orgId, data }: { orgId: string; data: FunderDetailResponse }) {
  const remove = useDeleteInteraction(orgId, data.relation.id);
  const [confirm, setConfirm] = React.useState<string | null>(null);
  if (data.interactions.length === 0) {
    return <p className="text-sm text-muted">No calls, emails or meetings logged yet.</p>;
  }
  return (
    <>
      <ul className="divide-y divide-line-subtle" aria-label="Interactions">
        {data.interactions.map((i) => (
          <li key={i.id} className="flex items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-sm">
                <Badge>{FUNDER_INTERACTION_LABELS[i.kind]}</Badge>{" "}
                <span className="text-muted">
                  {formatDate(i.occurredAt)}
                  {i.createdByName ? ` · ${i.createdByName}` : ""}
                </span>
              </p>
              <p className="mt-1 whitespace-pre-line text-sm">{i.summary}</p>
            </div>
            {data.canEdit && (
              <Button
                size="icon"
                variant="ghost"
                aria-label="Delete interaction"
                onClick={() => setConfirm(i.id)}
              >
                <Trash2 aria-hidden />
              </Button>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && remove.mutate(confirm, { onSuccess: () => setConfirm(null) })}
        title="Delete this interaction?"
        confirmLabel="Delete"
        tone="danger"
        loading={remove.isPending}
      />
    </>
  );
}

function Contacts({
  orgId,
  data,
  onEdit,
}: {
  orgId: string;
  data: FunderDetailResponse;
  onEdit: (c: FunderContactDto) => void;
}) {
  const remove = useDeleteContact(orgId, data.relation.id);
  if (data.contacts.length === 0) {
    return <p className="text-sm text-muted">Add the program officer or anyone you talk to.</p>;
  }
  return (
    <ul className="space-y-3" aria-label="People">
      {data.contacts.map((c) => (
        <li key={c.id} className="flex items-start justify-between gap-2">
          <div className="min-w-0 text-sm">
            <p className="font-medium text-strong">{c.name}</p>
            {c.role && <p className="text-muted">{c.role}</p>}
            {c.email && (
              <a href={`mailto:${c.email}`} className="block truncate text-link">
                {c.email}
              </a>
            )}
            {c.phone && <p>{c.phone}</p>}
            {c.preferredContact && (
              <p className="text-xs text-subtle">Prefers {c.preferredContact}</p>
            )}
          </div>
          {data.canEdit && (
            <div className="flex shrink-0">
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Edit ${c.name}`}
                onClick={() => onEdit(c)}
              >
                <Pencil aria-hidden />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Remove ${c.name}`}
                onClick={() => remove.mutate(c.id)}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function ProspectCard({ prospect }: { prospect: NonNullable<FunderDetailResponse["prospect"]> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Foundation giving</CardTitle>
      </CardHeader>
      <CardBody className="space-y-2 text-sm">
        <p>
          {prospect.latestFilingYear != null && prospect.totalGivingCents != null
            ? `Grants paid in ${prospect.latestFilingYear} (Form 990-PF): ${formatCents(prospect.totalGivingCents)}`
            : "Giving not reported in the latest filing."}
        </p>
        {prospect.totalAssetsCents != null && (
          <p className="text-muted">Total assets: {formatCents(prospect.totalAssetsCents)}</p>
        )}
        {prospect.fitScore != null && <p className="text-muted">Fit score: {prospect.fitScore}</p>}
        <p className="text-xs text-subtle">
          {prospect.attribution.text}{" "}
          {prospect.attribution.url && (
            <a
              href={prospect.attribution.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-link"
            >
              {prospect.attribution.source}
            </a>
          )}
        </p>
      </CardBody>
    </Card>
  );
}

function InteractionDialog({
  orgId,
  relationId,
  contacts,
  open,
  initialKind,
  now,
  onClose,
}: {
  orgId: string;
  relationId: string;
  contacts: FunderContactDto[];
  open: boolean;
  initialKind: FunderInteractionKind;
  now: Date;
  onClose: () => void;
}) {
  const log = useLogInteraction(orgId, relationId);
  const [kind, setKind] = React.useState<FunderInteractionKind>(initialKind);
  const [at, setAt] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [contactId, setContactId] = React.useState("");
  React.useEffect(() => {
    if (open) {
      setKind(initialKind);
      setAt(toLocalInput(now.toISOString()));
      setSummary("");
      setContactId("");
      log.reset();
    }
  }, [open, initialKind, now, log.reset]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const occurredAt = fromLocalInput(at);
    if (!summary.trim() || !occurredAt) return;
    log.mutate(
      { kind, occurredAt, summary: summary.trim(), contactId: contactId || null },
      {
        onSuccess: () => {
          toast.success(`${FUNDER_INTERACTION_LABELS[kind]} logged`);
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={kind === "call" ? "Log a call" : "Log an interaction"}
      dismissible={!log.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={log.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="funder-interaction-form" loading={log.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id="funder-interaction-form" onSubmit={submit} className="space-y-4">
        <Field label="Kind" htmlFor="interaction-kind">
          <Select
            id="interaction-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as FunderInteractionKind)}
          >
            {FUNDER_INTERACTION_KINDS.map((k) => (
              <option key={k} value={k}>
                {FUNDER_INTERACTION_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="When" htmlFor="interaction-at" required>
          <Input
            id="interaction-at"
            type="datetime-local"
            value={at}
            onChange={(e) => setAt(e.target.value)}
            required
          />
        </Field>
        {contacts.length > 0 && (
          <Field label="With" htmlFor="interaction-contact">
            <Select
              id="interaction-contact"
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
            >
              <option value="">Not recorded</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="What happened" htmlFor="interaction-summary" required>
          <Textarea
            id="interaction-summary"
            rows={4}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            required
            maxLength={5000}
          />
        </Field>
        {log.error && <ErrorMessage error={log.error} title="Couldn't save" />}
      </form>
    </Dialog>
  );
}

function NextStepDialog({
  orgId,
  relationId,
  open,
  initialAt,
  initialNote,
  onClose,
}: {
  orgId: string;
  relationId: string;
  open: boolean;
  initialAt: string | null;
  initialNote: string;
  onClose: () => void;
}) {
  const update = useUpdateFunder(orgId, relationId);
  const [at, setAt] = React.useState("");
  const [note, setNote] = React.useState("");
  React.useEffect(() => {
    if (open) {
      setAt(toLocalInput(initialAt));
      setNote(initialNote);
      update.reset();
    }
  }, [open, initialAt, initialNote, update.reset]);

  const save = (clear: boolean) =>
    update.mutate(
      clear
        ? { nextStepAt: null, nextStepNote: "" }
        : { nextStepAt: fromLocalInput(at), nextStepNote: note.trim() },
      {
        onSuccess: () => {
          toast.success(clear ? "Next step cleared" : "Next step saved");
          onClose();
        },
      },
    );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Set next step"
      description="We'll remind the owner (or your editors) in notifications when it's due."
      dismissible={!update.isPending}
      footer={
        <>
          {initialAt && (
            <Button variant="ghost" onClick={() => save(true)} disabled={update.isPending}>
              Clear
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button onClick={() => save(false)} loading={update.isPending} disabled={!at}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Date" htmlFor="next-step-at" required>
          <Input
            id="next-step-at"
            type="datetime-local"
            value={at}
            onChange={(e) => setAt(e.target.value)}
          />
        </Field>
        <Field label="What" htmlFor="next-step-note">
          <Textarea
            id="next-step-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
          />
        </Field>
        {update.error && <ErrorMessage error={update.error} title="Couldn't save" />}
      </div>
    </Dialog>
  );
}

function ContactDialog({
  orgId,
  relationId,
  open,
  contact,
  onClose,
}: {
  orgId: string;
  relationId: string;
  open: boolean;
  contact: FunderContactDto | null;
  onClose: () => void;
}) {
  const save = useSaveContact(orgId, relationId);
  const [form, setForm] = React.useState({
    name: "",
    role: "",
    email: "",
    phone: "",
    notes: "",
    preferredContact: "" as PreferredContactMethod | "",
  });
  React.useEffect(() => {
    if (open) {
      setForm({
        name: contact?.name ?? "",
        role: contact?.role ?? "",
        email: contact?.email ?? "",
        phone: contact?.phone ?? "",
        notes: contact?.notes ?? "",
        preferredContact: contact?.preferredContact ?? "",
      });
      save.reset();
    }
  }, [open, contact, save.reset]);
  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    save.mutate(
      {
        id: contact?.id,
        name: form.name.trim(),
        role: form.role.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        notes: form.notes,
        preferredContact: form.preferredContact || null,
      },
      {
        onSuccess: () => {
          toast.success(contact ? "Contact updated" : "Contact added");
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={contact ? "Edit contact" : "Add a contact"}
      description="Contact details are personal data: only members of your organization can see them, and they are included in your data export and deleted with your organization."
      dismissible={!save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="funder-contact-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id="funder-contact-form" onSubmit={submit} className="space-y-4">
        <Field label="Name" htmlFor="contact-name" required>
          <Input
            id="contact-name"
            value={form.name}
            onChange={set("name")}
            required
            maxLength={200}
          />
        </Field>
        <Field label="Role" htmlFor="contact-role">
          <Input id="contact-role" value={form.role} onChange={set("role")} maxLength={200} />
        </Field>
        <Field label="Email" htmlFor="contact-email">
          <Input id="contact-email" type="email" value={form.email} onChange={set("email")} />
        </Field>
        <Field label="Phone" htmlFor="contact-phone">
          <Input id="contact-phone" value={form.phone} onChange={set("phone")} maxLength={50} />
        </Field>
        <Field label="Prefers" htmlFor="contact-preferred">
          <Select
            id="contact-preferred"
            value={form.preferredContact}
            onChange={set("preferredContact")}
          >
            <option value="">No preference</option>
            {PREFERRED_CONTACT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes" htmlFor="contact-notes">
          <Textarea id="contact-notes" rows={3} value={form.notes} onChange={set("notes")} />
        </Field>
        {save.error && <ErrorMessage error={save.error} title="Couldn't save the contact" />}
      </form>
    </Dialog>
  );
}
