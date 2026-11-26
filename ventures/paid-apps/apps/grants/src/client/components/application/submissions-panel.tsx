// Submission records for one application: channel, status, package fingerprint + integrity check,
// package downloads, and — for manual submissions — the step-by-step guide with "Mark as submitted".
import { ApiErrorAlert } from "@client/components/grants/api-error-alert";
import { timeAgo } from "@client/components/grants/format";
import {
  Badge,
  Button,
  buttonClass,
  Field,
  Input,
  StatusBadge,
  Tooltip,
  toast,
} from "@client/components/ui";
import { formatDate } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import type { SubmissionDto } from "@shared/api/types";
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
} from "lucide-react";
import * as React from "react";
import { CHANNEL_LABEL, readGuide, safeExternalUrl, shortSha } from "./model";
import { packageUrl, useConfirmSubmission, usePackageIntegrity } from "./queries";

export function CopyButton({
  text,
  label,
  className,
}: {
  text: string;
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <Button
      size="xs"
      variant="ghost"
      aria-label={copied ? `${label} (copied)` : label}
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        } catch {
          toast.error("Couldn't copy", "Select the text and copy it manually.");
        }
      }}
    >
      {copied ? <Check aria-hidden className="text-success-600" /> : <Copy aria-hidden />}
      <span aria-hidden>{copied ? "Copied" : "Copy"}</span>
    </Button>
  );
}

export function IntegrityBadge({ orgId, submissionId }: { orgId: string; submissionId: string }) {
  const q = usePackageIntegrity(orgId, submissionId);
  if (q.isPending) return <Badge tone="neutral">Checking integrity…</Badge>;
  if (q.error) {
    return (
      <Badge tone="neutral">
        <ShieldQuestion className="h-3 w-3" aria-hidden /> Integrity not checked
      </Badge>
    );
  }
  if (q.data.integrity === "verified") {
    return (
      <Badge tone="success">
        <ShieldCheck className="h-3 w-3" aria-hidden /> Integrity verified
      </Badge>
    );
  }
  if (q.data.integrity === "mismatch") {
    return (
      <Badge tone="danger">
        <ShieldAlert className="h-3 w-3" aria-hidden /> Fingerprint mismatch
      </Badge>
    );
  }
  return <Badge tone="neutral">Integrity unknown</Badge>;
}

export function PackageDownloads({ orgId, submissionId }: { orgId: string; submissionId: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={packageUrl(orgId, submissionId, { download: true })}
        download={`submission-${submissionId}.json`}
        className={buttonClass({ variant: "secondary", size: "xs" })}
      >
        <Download aria-hidden /> Package (JSON)
      </a>
      <a
        href={packageUrl(orgId, submissionId, { format: "md", download: true })}
        download={`submission-${submissionId}.md`}
        className={buttonClass({ variant: "secondary", size: "xs" })}
      >
        <Download aria-hidden /> Package (Markdown)
      </a>
    </div>
  );
}

export function SubmissionsPanel({
  submissions,
  orgId,
  canConfirm,
  sectionTexts = [],
}: {
  submissions: SubmissionDto[];
  orgId: string;
  canConfirm: boolean;
  /** Current version's section text, offered as copy buttons for manual submission. */
  sectionTexts?: { key: string; title: string; text: string; versionId: string }[];
}) {
  if (submissions.length === 0) return null;
  return (
    <section
      aria-labelledby="submissions-heading"
      className="rounded-xl border border-neutral-200 bg-white shadow-card"
    >
      <div className="border-b border-neutral-100 px-5 py-4">
        <h2
          id="submissions-heading"
          className="text-base font-semibold tracking-tight text-neutral-900"
        >
          Submission
        </h2>
      </div>
      <ul className="divide-y divide-neutral-100">
        {submissions.map((s) => (
          <li key={s.id} className="px-5 py-4">
            <SubmissionItem
              submission={s}
              orgId={orgId}
              canConfirm={canConfirm}
              sectionTexts={sectionTexts.filter((t) => t.versionId === s.versionId)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function SubmissionItem({
  submission: s,
  orgId,
  canConfirm,
  sectionTexts,
}: {
  submission: SubmissionDto;
  orgId: string;
  canConfirm: boolean;
  sectionTexts: { key: string; title: string; text: string }[];
}) {
  const guide = s.channel === "manual" ? readGuide(s.metadata) : null;
  const done = s.status === "sent" || s.status === "confirmed";
  return (
    <div className="space-y-3 text-sm">
      {done ? (
        <p className="flex items-center gap-2 font-medium text-success-800">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          Submitted {formatDate(s.confirmedAt ?? s.sentAt ?? s.updatedAt)}
          {s.channel === "email" && s.recipient ? ` by email to ${s.recipient}` : ""}
        </p>
      ) : s.status === "pending" ? (
        <p className="font-medium text-neutral-800">
          Submission recorded {timeAgo(s.createdAt)} — package ready
          {s.channel === "manual" ? ", waiting for you to submit it" : ""}.
        </p>
      ) : (
        <p className="font-medium text-danger-800">
          This submission failed{s.error ? `: ${s.error}` : "."}
        </p>
      )}

      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">Channel</dt>
          <dd className="mt-0.5 text-neutral-900">
            {CHANNEL_LABEL[s.channel]}
            {s.recipient && s.channel !== "manual" ? ` · ${s.recipient}` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">Status</dt>
          <dd className="mt-0.5">
            <StatusBadge
              status={s.status}
              kind="submission"
              label={
                s.status === "pending" && s.channel === "manual"
                  ? "Waiting for you"
                  : s.status === "confirmed"
                    ? "Confirmed"
                    : undefined
              }
            />
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Package fingerprint (SHA-256)
          </dt>
          <dd className="mt-0.5 flex flex-wrap items-center gap-2">
            <Tooltip content={s.packageSha256}>
              <button
                type="button"
                className="rounded font-mono text-xs text-neutral-700 focus-visible:outline-2 focus-visible:outline-focus"
                aria-label={`Fingerprint ${s.packageSha256}`}
              >
                {shortSha(s.packageSha256)}
              </button>
            </Tooltip>
            <IntegrityBadge orgId={orgId} submissionId={s.id} />
          </dd>
        </div>
        {s.externalRef && (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Confirmation number
            </dt>
            <dd className="mt-0.5 font-mono text-xs text-neutral-900">{s.externalRef}</dd>
          </div>
        )}
      </dl>

      <PackageDownloads orgId={orgId} submissionId={s.id} />

      {guide && s.status === "pending" && (
        <ManualGuidePanel
          guide={guide}
          submissionId={s.id}
          orgId={orgId}
          canConfirm={canConfirm}
          sectionTexts={sectionTexts}
        />
      )}
    </div>
  );
}

export function ManualGuidePanel({
  guide,
  submissionId,
  orgId,
  canConfirm,
  sectionTexts = [],
}: {
  guide: NonNullable<ReturnType<typeof readGuide>>;
  submissionId: string;
  orgId: string;
  canConfirm: boolean;
  sectionTexts?: { key: string; title: string; text: string }[];
}) {
  const [ref, setRef] = React.useState("");
  const confirm = useConfirmSubmission(orgId);
  const refId = React.useId();
  const url = safeExternalUrl(guide.url);
  const host = url ? new URL(url).host : null;

  return (
    <div className="space-y-4 rounded-lg border border-brand-200 bg-brand-50/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold text-neutral-900">{guide.title}</h3>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className={buttonClass({ variant: "outline", size: "sm" })}
          >
            <ExternalLink aria-hidden /> Open{host ? ` ${host}` : ""}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
      </div>
      {guide.steps.length > 0 && (
        <ol className="space-y-2" aria-label="Submission steps">
          {guide.steps.map((step, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: steps are a fixed, ordered list (text may repeat)
            <li key={i} className="flex items-start gap-3">
              <span
                aria-hidden
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white"
              >
                {i + 1}
              </span>
              <p className="min-w-0 flex-1 leading-relaxed text-neutral-800">
                <span className="sr-only">Step {i + 1}: </span>
                {step}
              </p>
              <CopyButton text={step} label={`Copy step ${i + 1}`} />
            </li>
          ))}
        </ol>
      )}
      {guide.notes.length > 0 && (
        <ul className="space-y-1 rounded-md bg-warning-50 px-3 py-2 text-xs text-warning-950 ring-1 ring-warning-200 ring-inset">
          {guide.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {sectionTexts.length > 0 && (
        <details className="rounded-md border border-neutral-200 bg-white px-3 py-2">
          <summary className="cursor-pointer select-none text-sm font-medium text-neutral-700">
            Section text to paste ({sectionTexts.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {sectionTexts.map((t) => (
              <li key={t.key} className="flex items-center justify-between gap-2">
                <span className="truncate text-neutral-700">{t.title}</span>
                <CopyButton text={t.text} label={`Copy “${t.title}” text`} />
              </li>
            ))}
          </ul>
        </details>
      )}
      {canConfirm ? (
        <form
          className="flex flex-wrap items-end gap-2 border-t border-brand-100 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            confirm.mutate(
              { submissionId, externalRef: ref.trim() || undefined },
              {
                onSuccess: () => toast.success("Marked as submitted", "Follow-ups are scheduled."),
              },
            );
          }}
        >
          <Field
            label="Confirmation / tracking number (optional)"
            htmlFor={refId}
            className="min-w-56 flex-1"
          >
            <Input
              id={refId}
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              maxLength={200}
              placeholder="e.g. GRANT12345678"
              autoComplete="off"
            />
          </Field>
          <Button type="submit" loading={confirm.isPending}>
            <CheckCircle2 aria-hidden /> Mark as submitted
          </Button>
          <ApiErrorAlert
            error={confirm.error}
            title="Couldn't mark as submitted"
            className={cn("w-full")}
          />
        </form>
      ) : (
        <p className="text-xs text-neutral-600">
          An editor can mark this as submitted once it's sent.
        </p>
      )}
    </div>
  );
}
