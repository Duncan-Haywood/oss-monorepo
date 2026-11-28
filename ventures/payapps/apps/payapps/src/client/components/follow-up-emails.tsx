// "Follow-up emails" on the cash page: a draft to the GC for each unpaid application, from the
// report's own figures (src/shared/follow-up-email.ts). Nothing is sent from PayApps: the contractor
// edits the draft, then copies it or opens it in their own mail program.

import type { QuickBooksInterestInvoicesDto } from "@shared/api/types";
import { FOLLOW_UP_ANCHOR_PREFIX, followUpAnchor } from "@shared/cash-digest";
import {
  type CashReport,
  type CashReportProject,
  type OutstandingApp,
  PAID_LATE_WINDOW_DAYS,
  type PaidLateApp,
} from "@shared/cash-report";
import {
  type FollowUpEmail,
  type FollowUpKind,
  followUpEmail,
  mailtoHref,
  needsFollowUp,
  paidLateInterestEmail,
} from "@shared/follow-up-email";
import { rateLabel } from "@shared/late-interest";
import { formatCents } from "@shared/money";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { api, projectPath } from "../lib/api";
import { ErrorText } from "./error";
import { InterestQuickBooks, useInterestInvoices } from "./interest-quickbooks";

const KIND_LABELS: Record<FollowUpKind, string> = {
  status: "Not due yet: check it is in for processing",
  reminder: "Past due: reminder",
  second: "Past due over 30 days: second request",
  balance: "Paid short: ask about the balance",
  owner: "Pay-when-paid: ask whether the owner has paid",
};

type From = { name: string; company: string };

function Draft({
  orgId,
  job,
  initial,
  note,
}: {
  orgId: string;
  job: CashReportProject;
  initial: Omit<FollowUpEmail, "kind">;
  note: string;
}) {
  const [to, setTo] = useState(initial.to ?? "");
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        `${to.trim() ? `To: ${to.trim()}\n` : ""}Subject: ${subject}\n\n${body}`,
      );
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="mt-2 space-y-2 rounded border border-slate-200 p-2">
      <p className="text-xs text-slate-500">{note}. Edit before sending.</p>
      <label className="block text-xs">
        To
        <input
          className="input mt-1 w-full"
          type="email"
          placeholder="the GC's billing address"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </label>
      {!initial.to && (
        <p className="text-xs text-slate-500">
          Save the GC's billing contact on the{" "}
          <Link
            to="/orgs/$orgId/projects/$projectId"
            params={{ orgId, projectId: job.id }}
            className="underline"
          >
            job page
          </Link>{" "}
          and every draft for this job is addressed to them.
        </p>
      )}
      <label className="block text-xs">
        Subject
        <input
          className="input mt-1 w-full"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </label>
      <label className="block text-xs">
        Message
        <textarea
          className="input mt-1 w-full font-mono text-xs"
          rows={12}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" className="btn" onClick={copy}>
          Copy
        </button>
        <a className="underline" href={mailtoHref({ to, subject, body })}>
          Open in my email
        </a>
        {copied && <span className="text-xs text-green-700">Copied</span>}
      </div>
    </div>
  );
}

function OutstandingDraft({
  orgId,
  job,
  app,
  from,
}: {
  orgId: string;
  job: CashReportProject;
  app: OutstandingApp;
  from: From;
}) {
  const initial = followUpEmail(job, app, from);
  return <Draft orgId={orgId} job={job} initial={initial} note={KIND_LABELS[initial.kind]} />;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

type SettleBody =
  | { settlement: "billed" | "waived"; on: string; note: string | null }
  | { settlement: null };

/** PUT .../pay-apps/:id/late-interest, then reload the cash report. */
function useSettle(orgId: string, job: CashReportProject, app: PaidLateApp) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SettleBody) =>
      api(
        projectPath(orgId, job.id, `/pay-apps/${encodeURIComponent(app.payAppId)}/late-interest`),
        { method: "PUT", body },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cash", orgId] }),
  });
}

/**
 * "Mark billed" / "Mark waived": the day (today by default) and an optional note, such as the invoice
 * number or why it was let go. The application then leaves the list.
 */
function SettleForm({
  orgId,
  job,
  app,
}: {
  orgId: string;
  job: CashReportProject;
  app: PaidLateApp;
}) {
  const [kind, setKind] = useState<"billed" | "waived" | null>(null);
  const [on, setOn] = useState(todayIso());
  const [note, setNote] = useState("");
  const settle = useSettle(orgId, job, app);
  if (kind === null) {
    return (
      <span className="flex gap-3 text-sm">
        <button type="button" className="underline" onClick={() => setKind("billed")}>
          Mark billed
        </button>
        <button type="button" className="underline" onClick={() => setKind("waived")}>
          Mark waived
        </button>
      </span>
    );
  }
  const id = `settle-${app.payAppId}`;
  return (
    <form
      className="mt-2 flex w-full flex-wrap items-end gap-2 rounded border border-slate-200 p-2 text-xs"
      onSubmit={(e) => {
        e.preventDefault();
        settle.mutate({ settlement: kind, on, note: note.trim() || null });
      }}
    >
      <span className="w-full text-slate-500">
        {kind === "billed"
          ? `Interest of ${formatCents(app.interestCents)} on #${app.number} billed to ${job.gcName}: on the next application or a separate invoice.`
          : `Interest of ${formatCents(app.interestCents)} on #${app.number} let go: it stays in the history.`}
      </span>
      <label htmlFor={`${id}-on`}>
        {kind === "billed" ? "Billed on" : "Waived on"}
        <input
          id={`${id}-on`}
          type="date"
          className="input ml-1"
          value={on}
          min={app.paidOn}
          max={todayIso()}
          onChange={(e) => setOn(e.target.value)}
          required
        />
      </label>
      <label htmlFor={`${id}-note`} className="grow">
        Note (optional)
        <input
          id={`${id}-note`}
          className="input ml-1 w-full max-w-xs"
          value={note}
          maxLength={500}
          placeholder={kind === "billed" ? "Invoice 1042, or pay app #7" : "Kept the relationship"}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <button type="submit" className="btn" disabled={settle.isPending}>
        {kind === "billed" ? "Mark billed" : "Mark waived"}
      </button>
      <button type="button" className="underline" onClick={() => setKind(null)}>
        Cancel
      </button>
      {settle.error && <ErrorText error={settle.error} />}
    </form>
  );
}

/** A settled application's line, with an undo that puts it back on the list. */
function SettledRow({
  orgId,
  job,
  app,
  qbo,
}: {
  orgId: string;
  job: CashReportProject;
  app: PaidLateApp;
  qbo: QuickBooksInterestInvoicesDto | undefined;
}) {
  const settle = useSettle(orgId, job, app);
  const s = app.settled;
  if (!s) return null;
  return (
    <li className="py-1">
      <span className="font-medium">{job.name}</span> · #{app.number} · {formatCents(s.cents)}{" "}
      {s.kind === "billed" ? "billed" : "waived"} on {s.on}
      {s.note ? ` · ${s.note}` : ""}{" "}
      <button
        type="button"
        className="underline"
        disabled={settle.isPending}
        onClick={() => settle.mutate({ settlement: null })}
      >
        Undo
      </button>{" "}
      <InterestQuickBooks orgId={orgId} job={job} app={app} data={qbo} />
      {settle.error && <ErrorText error={settle.error} />}
    </li>
  );
}

/**
 * "Interest earned on late payments": each application paid after its due date on a job with a
 * late-payment rate, the interest it earned up to the payment (src/shared/cash-report.ts,
 * paidLateApps) and a draft asking the GC for it. Nothing is billed or sent from here.
 */
export function PaidLateInterest({
  orgId,
  report,
  from,
}: {
  orgId: string;
  report: CashReport;
  from: From;
}) {
  const rows: { job: CashReportProject; app: PaidLateApp }[] = report.projects.flatMap((job) =>
    job.paidLate.map((app) => ({ job, app })),
  );
  const settled: { job: CashReportProject; app: PaidLateApp }[] = report.projects.flatMap((job) =>
    (job.paidLateSettled ?? []).map((app) => ({ job, app })),
  );
  if (rows.length === 0 && settled.length === 0) return null;
  return (
    <PaidLateInterestList orgId={orgId} report={report} from={from} rows={rows} settled={settled} />
  );
}

type PaidLateRow = { job: CashReportProject; app: PaidLateApp };

/** The list itself, rendered only when there is something on it (it reads QuickBooks' state). */
function PaidLateInterestList({
  orgId,
  report,
  from,
  rows,
  settled,
}: {
  orgId: string;
  report: CashReport;
  from: From;
  rows: PaidLateRow[];
  settled: PaidLateRow[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const qbo = useInterestInvoices(orgId);
  return (
    <section className="card space-y-2" aria-labelledby="paid-late-interest">
      <h2 id="paid-late-interest" className="font-semibold">
        Interest earned on late payments
      </h2>
      <p className="text-xs text-slate-500">
        Applications paid after their due date in the last {PAID_LATE_WINDOW_DAYS} days, on jobs
        with a late-payment rate set. Interest is simple interest on the unpaid balance from the due
        date to the last payment, so the figure no longer grows. Whether you can collect it depends
        on your subcontract, any statute that applies and any waiver you signed: check before you
        ask. {formatCents(report.totals.paidLateInterestCents)} in all; it is not in the totals
        above. Mark each one billed or waived once you have dealt with it
        {qbo.data?.status.connection && qbo.data.status.planIncludes
          ? ", or invoice it in QuickBooks, which marks it billed"
          : ""}
        .
      </p>
      {rows.length === 0 && (
        <p className="text-sm text-slate-600">Nothing left to decide: every one is marked.</p>
      )}
      <ul className="divide-y divide-slate-100 text-sm">
        {rows.map(({ job, app }) => (
          <li key={app.payAppId} className="py-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span>
                <span className="font-medium">{job.name}</span> · #{app.number} ·{" "}
                {formatCents(app.interestCents)} interest
                <span className="text-xs text-slate-500">
                  {" "}
                  · {job.gcName} · due {app.dueOn}, paid {app.paidOn} ({app.daysLate} days late)
                  {job.lateInterest ? ` · ${rateLabel(job.lateInterest)}` : ""}
                </span>
              </span>
              <span className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="underline"
                  aria-expanded={open === app.payAppId}
                  onClick={() => setOpen(open === app.payAppId ? null : app.payAppId)}
                >
                  {open === app.payAppId ? "Hide draft" : `Draft interest email for #${app.number}`}
                </button>
                <SettleForm orgId={orgId} job={job} app={app} />
                <InterestQuickBooks orgId={orgId} job={job} app={app} data={qbo.data} />
              </span>
            </div>
            {open === app.payAppId && (
              <Draft
                orgId={orgId}
                job={job}
                initial={paidLateInterestEmail(job, app, from)}
                note="Paid late: ask for the interest"
              />
            )}
          </li>
        ))}
      </ul>
      {settled.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-600">
            Billed or waived ({settled.length}
            {report.totals.paidLateBilledCents > 0
              ? `; ${formatCents(report.totals.paidLateBilledCents)} billed`
              : ""}
            )
          </summary>
          <ul className="divide-y divide-slate-100">
            {settled.map(({ job, app }) => (
              <SettledRow key={app.payAppId} orgId={orgId} job={job} app={app} qbo={qbo.data} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/** The pay application named by a "#follow-up-<payAppId>" link, or null. */
export function linkedPayAppId(hash: string): string | null {
  const prefix = `#${FOLLOW_UP_ANCHOR_PREFIX}`;
  if (!hash.startsWith(prefix) || hash.length === prefix.length) return null;
  try {
    return decodeURIComponent(hash.slice(prefix.length));
  } catch {
    return null;
  }
}

function rowKey(app: OutstandingApp) {
  return app.payAppId;
}

export function FollowUpEmails({
  orgId,
  report,
  from,
}: {
  orgId: string;
  report: CashReport;
  from: From;
}) {
  const rows = report.projects.flatMap((job) =>
    job.outstanding.map((app) => ({ job, app, chase: needsFollowUp(job, app) })),
  );
  // The weekly email links to ".../cash#follow-up-<payAppId>" for one application's draft, and to
  // ".../cash#follow-ups" for the list. Read once: the drafts open and scroll on the first render.
  const [target] = useState(() => linkedPayAppId(window.location.hash));
  const linked = target === null ? undefined : rows.find((r) => r.app.payAppId === target);
  const [open, setOpen] = useState<string | null>(linked ? rowKey(linked.app) : null);
  // A linked application that is no longer chased (its due date moved) is still shown.
  const [showAll, setShowAll] = useState(linked ? !linked.chase : false);
  const heading = useRef<HTMLHeadingElement>(null);
  // The report arrives after the page loads, so the browser's own jump to the anchor found nothing
  // to scroll to.
  useEffect(() => {
    if (target !== null) {
      const row = document.getElementById(followUpAnchor(target));
      (row ?? heading.current)?.scrollIntoView();
    } else if (window.location.hash === "#follow-ups") heading.current?.scrollIntoView();
  }, [target]);
  if (rows.length === 0) return null;
  const toChase = rows.filter((r) => r.chase);
  const shown = showAll ? rows : toChase;
  return (
    <section className="card space-y-2" aria-labelledby="follow-ups">
      <h2 id="follow-ups" ref={heading} className="font-semibold">
        Follow-up emails to the GC
      </h2>
      <p className="text-xs text-slate-500">
        A draft for each unpaid application, written from the figures on this page: what was billed,
        what came in, the due date under the job's pay terms. PayApps does not send it: copy it or
        open it in your own email and check it first. A job's GC billing contact, set on the job
        page, fills in the greeting and the address.
      </p>
      {target !== null && !linked && (
        <p className="text-sm text-slate-600">
          The application that link was for is no longer unpaid on this report: it was paid,
          deleted, or its payment recorded since the email went out.
        </p>
      )}
      {toChase.length === 0 && !showAll && (
        <p className="text-sm text-slate-600">Nothing past due or paid short right now.</p>
      )}
      <ul className="divide-y divide-slate-100 text-sm">
        {shown.map(({ job, app }) => (
          <li key={rowKey(app)} id={followUpAnchor(app.payAppId)} className="py-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span>
                <span className="font-medium">{job.name}</span> · #{app.number} ·{" "}
                {formatCents(app.amountCents)} owed
                <span className="text-xs text-slate-500">
                  {" "}
                  · {job.gcName}
                  {app.daysPastDue > 0
                    ? ` · ${app.daysPastDue} days past due`
                    : ` · ${app.ageDays} days old`}
                </span>
              </span>
              <button
                type="button"
                className="underline"
                aria-expanded={open === rowKey(app)}
                onClick={() => setOpen(open === rowKey(app) ? null : rowKey(app))}
              >
                {open === rowKey(app) ? "Hide draft" : `Draft email for #${app.number}`}
              </button>
            </div>
            {open === rowKey(app) && (
              <OutstandingDraft orgId={orgId} job={job} app={app} from={from} />
            )}
          </li>
        ))}
      </ul>
      {rows.length > toChase.length && (
        <button type="button" className="text-xs underline" onClick={() => setShowAll(!showAll)}>
          {showAll
            ? "Show only past due and paid short"
            : `Also show ${rows.length - toChase.length} not yet due`}
        </button>
      )}
    </section>
  );
}
