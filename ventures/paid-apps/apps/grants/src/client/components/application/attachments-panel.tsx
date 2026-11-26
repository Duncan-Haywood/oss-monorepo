// "Attachments & letters" panel on the application detail: the funder's attachments checklist
// (auto-matched to the org's documents; pick, upload or waive) and letters of support requested
// from partners (draft → sent → received). Missing required attachments block submission only.
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
  Spinner,
  Textarea,
  type Tone,
} from "@client/components/ui";
import { ApiError, formatDate } from "@client/lib/api";
import type {
  AttachmentItemDto,
  AttachmentItemStatus,
  SupportLetterDto,
  SupportLetterStatusDto,
} from "@shared/api/attachments";
import { FileCheck2, Mail, Paperclip } from "lucide-react";
import * as React from "react";
import {
  useAttachmentChecklist,
  useCreateLetter,
  useOrgDocuments,
  usePatchAttachment,
  usePatchLetter,
  useSendLetter,
  useSuggestAttachments,
  useSupportLetters,
  useUploadAttachment,
} from "./attachments-queries";

const STATUS: Record<AttachmentItemStatus, { label: string; tone: Tone }> = {
  missing: { label: "Missing", tone: "danger" },
  matched: { label: "Matched", tone: "info" },
  uploaded: { label: "Uploaded", tone: "success" },
  waived: { label: "Waived", tone: "neutral" },
};

const LETTER_STATUS: Record<SupportLetterStatusDto, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  sent: { label: "Waiting for partner", tone: "warning" },
  received: { label: "Received", tone: "success" },
  declined: { label: "Declined", tone: "neutral" },
};

const MB = 1024 * 1024;
const fmtMb = (n: number) => `${(n / MB).toFixed(1)} MB`;

const errorText = (e: unknown) =>
  e instanceof ApiError ? e.message : e ? "Something went wrong. Please try again." : null;

const SOURCE_LABEL: Partial<Record<NonNullable<AttachmentItemDto["matchSource"]>, string>> = {
  kind: "Auto-matched",
  keyword: "Auto-matched",
  ai: "Suggested by AI — please check",
  partner: "Uploaded by the partner",
};

export function AttachmentsPanel({
  orgId,
  applicationId,
  canEdit,
}: {
  orgId: string;
  applicationId: string;
  canEdit: boolean;
}) {
  const checklist = useAttachmentChecklist(orgId, applicationId);
  const suggest = useSuggestAttachments(orgId, applicationId);
  const data = checklist.data;
  const canSuggest = !!data?.items.some((i) => i.status === "missing" && i.matchSource === null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span id="attachments-heading">Attachments &amp; letters</span>
        </CardTitle>
        <CardDescription>
          Files the funder asks for, matched to your documents. Missing required files block
          submission, not drafting.
        </CardDescription>
      </CardHeader>
      <CardBody className="space-y-6">
        <section aria-labelledby="attachments-checklist-heading" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3
              id="attachments-checklist-heading"
              className="text-sm font-semibold text-neutral-900"
            >
              Attachments checklist
            </h3>
            {canEdit && canSuggest && (
              <Button
                size="sm"
                variant="secondary"
                loading={suggest.isPending}
                onClick={() => suggest.mutate()}
              >
                Suggest matches with AI
              </Button>
            )}
          </div>
          {checklist.isLoading && <Spinner label="Loading attachments" />}
          {checklist.error && <Alert tone="danger">{errorText(checklist.error)}</Alert>}
          {suggest.error && <Alert tone="danger">{errorText(suggest.error)}</Alert>}
          {data && data.items.length === 0 && (
            <p className="text-sm text-neutral-600">The funder doesn't list any attachments.</p>
          )}
          {data && data.missingRequired > 0 && (
            <Alert tone="warning" title="Required attachments missing">
              {data.missingRequired === 1
                ? "1 required attachment is missing. It will block submission until you add or waive it."
                : `${data.missingRequired} required attachments are missing. They will block submission until you add or waive them.`}
            </Alert>
          )}
          {data && data.totalBytes > data.emailLimitBytes && (
            <Alert tone="info">
              The attachments total {fmtMb(data.totalBytes)}, over the {fmtMb(data.emailLimitBytes)}{" "}
              email limit, so they will be listed in the manual submission guide instead of emailed.
            </Alert>
          )}
          {data && data.items.length > 0 && (
            <ul aria-label="Attachments checklist" className="divide-y divide-neutral-200">
              {data.items.map((item) => (
                <AttachmentRow
                  key={item.id}
                  item={item}
                  orgId={orgId}
                  applicationId={applicationId}
                  canEdit={canEdit}
                />
              ))}
            </ul>
          )}
        </section>
        <LettersSection orgId={orgId} applicationId={applicationId} canEdit={canEdit} />
      </CardBody>
    </Card>
  );
}

function AttachmentRow({
  item,
  orgId,
  applicationId,
  canEdit,
}: {
  item: AttachmentItemDto;
  orgId: string;
  applicationId: string;
  canEdit: boolean;
}) {
  const [mode, setMode] = React.useState<"idle" | "pick" | "waive">("idle");
  const [docId, setDocId] = React.useState("");
  const [reason, setReason] = React.useState("");
  const patch = usePatchAttachment(orgId, applicationId);
  const upload = useUploadAttachment(orgId, applicationId);
  const docs = useOrgDocuments(orgId, mode === "pick");
  const fileRef = React.useRef<HTMLInputElement>(null);
  const st = STATUS[item.status];
  const idBase = `att-${item.id}`;
  const busy = patch.isPending || upload.isPending;
  const err = errorText(patch.error) ?? errorText(upload.error);
  const done = () => {
    setMode("idle");
    setReason("");
    setDocId("");
  };
  return (
    <li className="space-y-2 py-3" aria-label={item.requirementName}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2 font-medium text-neutral-900">
            <Paperclip className="h-4 w-4 text-neutral-400" aria-hidden />
            {item.requirementName}
            <Badge tone={item.required ? "brand" : "neutral"}>
              {item.required ? "Required" : "Optional"}
            </Badge>
            <Badge tone={st.tone} dot>
              {st.label}
            </Badge>
          </p>
          {item.description && <p className="text-sm text-neutral-600">{item.description}</p>}
          {item.document && (
            <p className="text-sm text-neutral-700">
              <FileCheck2 className="mr-1 inline h-4 w-4 text-success-600" aria-hidden />
              {item.document.title}
              {item.matchSource && SOURCE_LABEL[item.matchSource] && (
                <span className="ml-2 text-neutral-500">· {SOURCE_LABEL[item.matchSource]}</span>
              )}
            </p>
          )}
          {item.status === "waived" && item.note && (
            <p className="text-sm text-neutral-600">Waived: {item.note}</p>
          )}
        </div>
        {canEdit && mode === "idle" && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setMode("pick")}
              aria-label={`Choose a document for ${item.requirementName}`}
            >
              Choose document
            </Button>
            <Button
              size="sm"
              variant="secondary"
              loading={upload.isPending}
              onClick={() => fileRef.current?.click()}
              aria-label={`Upload a file for ${item.requirementName}`}
            >
              Upload
            </Button>
            <input
              ref={fileRef}
              type="file"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              data-testid={`${idBase}-file`}
              accept=".pdf,.docx,.doc,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload.mutate({ item, file });
                e.target.value = "";
              }}
            />
            {item.status !== "waived" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setMode("waive")}
                aria-label={`Waive ${item.requirementName}`}
              >
                Waive
              </Button>
            )}
            {item.status !== "missing" && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => patch.mutate({ itemId: item.id, patch: { action: "clear" } })}
                aria-label={`Clear ${item.requirementName}`}
              >
                Clear
              </Button>
            )}
          </div>
        )}
      </div>
      {mode === "pick" && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (docId)
              patch.mutate(
                { itemId: item.id, patch: { action: "pick", documentId: docId } },
                { onSuccess: done },
              );
          }}
        >
          <Field label="Document" htmlFor={`${idBase}-doc`} className="min-w-64 flex-1">
            <Select id={`${idBase}-doc`} value={docId} onChange={(e) => setDocId(e.target.value)}>
              <option value="">{docs.isLoading ? "Loading…" : "Choose a document"}</option>
              {(docs.data?.items ?? [])
                .filter((d) => d.status !== "failed")
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
            </Select>
          </Field>
          <Button type="submit" size="sm" disabled={!docId} loading={patch.isPending}>
            Use this document
          </Button>
          <Button size="sm" variant="ghost" onClick={done}>
            Cancel
          </Button>
        </form>
      )}
      {mode === "waive" && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim().length >= 3)
              patch.mutate(
                { itemId: item.id, patch: { action: "waive", reason: reason.trim() } },
                { onSuccess: done },
              );
          }}
        >
          <Field
            label="Why is this attachment not needed?"
            htmlFor={`${idBase}-reason`}
            hint="Recorded with the submission package."
          >
            <Textarea
              id={`${idBase}-reason`}
              value={reason}
              rows={2}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={reason.trim().length < 3}
              loading={patch.isPending}
            >
              Waive attachment
            </Button>
            <Button size="sm" variant="ghost" onClick={done}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {err && <Alert tone="danger">{err}</Alert>}
    </li>
  );
}

function LettersSection({
  orgId,
  applicationId,
  canEdit,
}: {
  orgId: string;
  applicationId: string;
  canEdit: boolean;
}) {
  const letters = useSupportLetters(orgId, applicationId);
  const create = useCreateLetter(orgId, applicationId);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [due, setDue] = React.useState("");
  const items = letters.data?.items ?? [];
  return (
    <section aria-labelledby="letters-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="letters-heading" className="text-sm font-semibold text-neutral-900">
          Letters of support
        </h3>
        {canEdit && !open && (
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            Request a letter
          </Button>
        )}
      </div>
      <p className="text-sm text-neutral-600">
        We draft the request from what your records say about the partnership. We never describe a
        commitment for your partner: they write their own, using a suggested outline.
      </p>
      {letters.isLoading && <Spinner label="Loading letter requests" />}
      {letters.error && <Alert tone="danger">{errorText(letters.error)}</Alert>}
      {open && (
        <form
          aria-label="Request a letter of support"
          className="grid gap-3 rounded-md border border-neutral-200 p-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(
              {
                partnerName: name.trim(),
                partnerEmail: email.trim(),
                ...(due ? { dueAt: due } : {}),
              },
              {
                onSuccess: () => {
                  setOpen(false);
                  setName("");
                  setEmail("");
                  setDue("");
                },
              },
            );
          }}
        >
          <Field label="Partner organization" htmlFor="letter-partner" required>
            <Input id="letter-partner" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Partner email" htmlFor="letter-email" required>
            <Input
              id="letter-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field
            label="Due date"
            htmlFor="letter-due"
            hint="Defaults to a week before the deadline"
          >
            <Input
              id="letter-due"
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </Field>
          <div className="flex gap-2 sm:col-span-3">
            <Button
              type="submit"
              size="sm"
              disabled={name.trim().length < 2 || !email.includes("@")}
              loading={create.isPending}
            >
              Draft request
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          {create.error && (
            <div className="sm:col-span-3">
              <Alert tone="danger">{errorText(create.error)}</Alert>
            </div>
          )}
        </form>
      )}
      {!letters.isLoading && items.length === 0 && !open && (
        <p className="text-sm text-neutral-500">No letters requested yet.</p>
      )}
      {items.length > 0 && (
        <ul aria-label="Letter requests" className="divide-y divide-neutral-200">
          {items.map((l) => (
            <LetterRow
              key={l.id}
              letter={l}
              orgId={orgId}
              applicationId={applicationId}
              canEdit={canEdit}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function LetterRow({
  letter,
  orgId,
  applicationId,
  canEdit,
}: {
  letter: SupportLetterDto;
  orgId: string;
  applicationId: string;
  canEdit: boolean;
}) {
  const send = useSendLetter(orgId, applicationId);
  const patch = usePatchLetter(orgId, applicationId);
  const st = LETTER_STATUS[letter.status];
  const err = errorText(send.error) ?? errorText(patch.error);
  return (
    <li className="space-y-2 py-3" aria-label={`Letter from ${letter.partnerName}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="flex flex-wrap items-center gap-2 font-medium text-neutral-900">
            <Mail className="h-4 w-4 text-neutral-400" aria-hidden />
            {letter.partnerName}
            <Badge tone={st.tone} dot>
              {st.label}
            </Badge>
          </p>
          <p className="text-sm text-neutral-600">
            {letter.partnerEmail}
            {letter.dueAt && <> · due {formatDate(letter.dueAt)}</>}
            {letter.status === "sent" && letter.tokenExpiresAt && (
              <> · link expires {formatDate(letter.tokenExpiresAt)}</>
            )}
            {letter.reminderCount > 0 && (
              <>
                {" "}
                · {letter.reminderCount} reminder{letter.reminderCount === 1 ? "" : "s"} sent
              </>
            )}
          </p>
        </div>
        {canEdit && (letter.status === "draft" || letter.status === "sent") && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" loading={send.isPending} onClick={() => send.mutate(letter.id)}>
              {letter.status === "draft" ? "Send request" : "Resend link"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              loading={patch.isPending}
              onClick={() => patch.mutate({ letterId: letter.id, patch: { status: "declined" } })}
            >
              Mark declined
            </Button>
          </div>
        )}
      </div>
      {letter.status === "draft" && (
        <details className="rounded-md bg-neutral-50 p-3 text-sm">
          <summary className="cursor-pointer font-medium text-neutral-800">
            Preview the request email
          </summary>
          <div className="mt-2 space-y-2 whitespace-pre-line text-neutral-700">
            <p className="font-medium">{letter.emailSubject}</p>
            <p>{letter.emailIntro}</p>
            <p className="font-medium">Suggested outline (the partner fills in the brackets):</p>
            <ol className="list-decimal space-y-1 pl-5">
              {letter.outline.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ol>
            {letter.facts.length > 0 && (
              <p className="text-neutral-500">
                Cites {letter.facts.length} fact{letter.facts.length === 1 ? "" : "s"} from your
                records.
              </p>
            )}
          </div>
        </details>
      )}
      {letter.status === "sent" && (
        <p className="text-sm text-neutral-500">
          Reminders go out 7 and 2 days before the due date. Resending issues a new link; the old
          one stops working.
        </p>
      )}
      {err && <Alert tone="danger">{err}</Alert>}
    </li>
  );
}
