// "Follow-up emails" on the cash page: a draft to the GC for each unpaid application, from the
// report's own figures (src/shared/follow-up-email.ts). Nothing is sent from PayApps: the contractor
// edits the draft, then copies it or opens it in their own mail program.

import { FOLLOW_UP_ANCHOR_PREFIX, followUpAnchor } from "@shared/cash-digest";
import type { CashReport, CashReportProject, OutstandingApp } from "@shared/cash-report";
import {
  type FollowUpKind,
  followUpEmail,
  mailtoHref,
  needsFollowUp,
} from "@shared/follow-up-email";
import { formatCents } from "@shared/money";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

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
  app,
  from,
}: {
  orgId: string;
  job: CashReportProject;
  app: OutstandingApp;
  from: From;
}) {
  const initial = followUpEmail(job, app, from);
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
      <p className="text-xs text-slate-500">{KIND_LABELS[initial.kind]}. Edit before sending.</p>
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
            {open === rowKey(app) && <Draft orgId={orgId} job={job} app={app} from={from} />}
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
