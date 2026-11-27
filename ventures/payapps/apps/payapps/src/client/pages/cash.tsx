// /orgs/$orgId/cash : money owed across jobs, how old it is, and retainage held (src/shared/cash-report.ts).

import {
  type CashDigest,
  DIGEST_WEEKDAYS,
  digestHourText,
  isTimeZone,
  SUGGESTED_DIGEST_HOUR,
} from "@shared/cash-digest";
import {
  AGING_BUCKETS,
  type CashReport,
  type CashReportProject,
  PENDING_CHANGE_FOLLOW_UP_DAYS,
} from "@shared/cash-report";
import { formatCents } from "@shared/money";
import { SHORT_REASON_LABELS } from "@shared/payments";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { ErrorText } from "../components/error";
import { FollowUpEmails } from "../components/follow-up-emails";
import { meQuery } from "../components/layout";
import { UnsentQuickBooksPayments } from "../components/unsent-quickbooks";
import { api, orgPath } from "../lib/api";

/** The earliest due date of a job's unpaid applications, when it has pay terms. */
const nextDue = (p: CashReportProject) =>
  p.outstanding
    .map((o) => o.dueOn)
    .filter((d): d is string => d !== null)
    .sort()[0] ?? null;

function Tile({ label, cents, note }: { label: string; cents: number; note?: string }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{formatCents(cents)}</div>
      {note && <div className="text-xs text-slate-500">{note}</div>}
    </div>
  );
}

export function CashPage() {
  const { orgId } = useParams({ from: "/orgs/$orgId/cash" });
  const report = useQuery({
    queryKey: ["cash", orgId],
    queryFn: () => api<CashReport>(orgPath(orgId, "/reports/cash")),
  });
  const me = useQuery(meQuery);
  const from = {
    name: me.data?.user.name ?? "",
    company: me.data?.memberships.find((m) => m.orgId === orgId)?.orgName ?? "",
  };
  const role = me.data?.memberships.find((m) => m.orgId === orgId)?.role ?? null;
  return (
    <div className="space-y-4">
      <CashReportView
        orgId={orgId}
        report={report.data}
        loading={report.isLoading}
        error={report.error}
        from={from}
      />
      <UnsentQuickBooksPayments orgId={orgId} role={role} />
      <DigestCard orgId={orgId} />
    </div>
  );
}

interface DigestResponse {
  setting: {
    enabled: boolean;
    lastSentOn: string | null;
    weekday: number;
    hour: number;
    timeZone: string;
    nextOn: string | null;
    delivers: boolean;
    emailVerified: boolean;
  };
  preview: CashDigest | null;
}

/** This browser's IANA time zone, or null when it cannot say. */
function browserTimeZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && isTimeZone(tz) ? tz : null;
  } catch {
    return null;
  }
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

interface DigestBody {
  enabled: boolean;
  weekday?: number;
  hour?: number;
  timeZone?: string;
}

/** The member's own weekly "money to chase" email (services/payapps/digest.ts). */
export function DigestCard({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["digest", orgId],
    queryFn: () => api<DigestResponse>(orgPath(orgId, "/digest")),
  });
  const save = useMutation({
    mutationFn: (body: DigestBody) => api(orgPath(orgId, "/digest"), { method: "PUT", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["digest", orgId] }),
  });
  const d = q.data;
  // The day shown: the saved one while on; while off, the one picked here, sent when turned on.
  const [picked, setPicked] = useState<number | null>(null);
  const weekday = d?.setting.enabled ? d.setting.weekday : (picked ?? d?.setting.weekday ?? 1);
  // Hour and zone the same way; a member turning it on gets 7:00 in this browser's zone by default.
  const here = browserTimeZone();
  const [pickedHour, setPickedHour] = useState<number | null>(null);
  const hour = d?.setting.enabled ? d.setting.hour : (pickedHour ?? SUGGESTED_DIGEST_HOUR);
  const timeZone = d?.setting.enabled ? d.setting.timeZone : (here ?? "UTC");
  const change = (body: Omit<DigestBody, "enabled">) => {
    if (d?.setting.enabled) save.mutate({ enabled: true, ...body });
  };
  return (
    <div className="card space-y-2">
      <h2 className="font-semibold">Weekly email: money to chase</h2>
      <p className="text-sm text-slate-600">
        Once a week, on the day you pick, the next steps from this report in your inbox:
        applications past due or paid short, retainage to bill, unconditional waivers owed and
        change orders waiting. Only you get it, and only in a week with something to chase.
      </p>
      <ErrorText error={q.error ?? save.error} />
      {d && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={d.setting.enabled}
                disabled={save.isPending}
                onChange={(e) =>
                  save.mutate(
                    e.target.checked
                      ? { enabled: true, weekday, hour, timeZone }
                      : { enabled: false },
                  )
                }
              />
              Email me this list every
            </label>
            <select
              className="input w-auto py-1"
              aria-label="Day of the week"
              value={weekday}
              disabled={save.isPending}
              onChange={(e) => {
                const day = Number(e.target.value);
                setPicked(day);
                change({ weekday: day });
              }}
            >
              {DIGEST_WEEKDAYS.map((name, i) => (
                <option key={name} value={i}>
                  {name}
                </option>
              ))}
            </select>
            <span>at</span>
            <select
              className="input w-auto py-1"
              aria-label="Hour of the day"
              value={hour}
              disabled={save.isPending}
              onChange={(e) => {
                const h = Number(e.target.value);
                setPickedHour(h);
                change({ hour: h });
              }}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {digestHourText(h)}
                </option>
              ))}
            </select>
            <span className="text-slate-600">{timeZone.replace(/_/g, " ")} time</span>
          </div>
          {d.setting.enabled && here && here !== d.setting.timeZone && (
            <p className="text-xs text-slate-600">
              This device is set to {here.replace(/_/g, " ")}.{" "}
              <button
                type="button"
                className="underline"
                disabled={save.isPending}
                onClick={() => change({ timeZone: here })}
              >
                Use {here.replace(/_/g, " ")} time
              </button>
            </p>
          )}
          {d.setting.enabled && d.setting.nextOn && (
            <p className="text-xs text-slate-500">
              Next list: {DIGEST_WEEKDAYS[new Date(`${d.setting.nextOn}T00:00:00Z`).getUTCDay()]}{" "}
              {d.setting.nextOn}, from {digestHourText(d.setting.hour)}{" "}
              {d.setting.timeZone.replace(/_/g, " ")} time, if anything is due. A day changed after
              this week's email takes effect the week after.
            </p>
          )}
          {d.setting.enabled && !d.setting.emailVerified && (
            <p className="text-sm text-amber-700">
              Confirm your email address first: the list only goes to confirmed addresses.
            </p>
          )}
          {d.setting.enabled && !d.setting.delivers && (
            <p className="text-sm text-amber-700">Email is not switched on for this site yet.</p>
          )}
          {d.setting.lastSentOn && (
            <p className="text-xs text-slate-500">Last sent {d.setting.lastSentOn}.</p>
          )}
          <p className="text-xs text-slate-500">
            {d.preview
              ? digestPreviewText(d.preview)
              : "Nothing to chase this week, so no email would go out. The sample job is never included."}
          </p>
        </>
      )}
    </div>
  );
}

/** "This week's list would cover 2 jobs and 1 insurance certificate to renew." */
export function digestPreviewText(p: CashDigest): string {
  const jobs = p.jobs.length + p.moreJobs;
  const certs = p.certificates.length + p.moreCertificates;
  const docs = p.documents.length + p.moreDocuments;
  const rfis = p.rfis.length + p.moreRfis;
  const subs = p.submittals.length + p.moreSubmittals;
  const tm = p.tmJobs.length + p.moreTmJobs;
  const lt = p.lowerTier.length + p.moreLowerTier;
  const gaps = p.dailyGaps.length + p.moreDailyGaps;
  const parts = [
    ...(jobs > 0 ? [`${jobs} job${jobs === 1 ? "" : "s"}`] : []),
    ...(certs > 0 ? [`${certs} insurance certificate${certs === 1 ? "" : "s"} to renew`] : []),
    ...(docs > 0
      ? [`${docs} license${docs === 1 ? "" : "s"} or document${docs === 1 ? "" : "s"} to renew`]
      : []),
    ...(rfis > 0 ? [`${rfis} overdue RFI${rfis === 1 ? "" : "s"}`] : []),
    ...(subs > 0 ? [`${subs} submittal${subs === 1 ? "" : "s"} to chase`] : []),
    ...(tm > 0 ? [`signed T&M tickets to bill on ${tm} job${tm === 1 ? "" : "s"}`] : []),
    ...(lt > 0
      ? [`lower-tier waivers still out on ${lt} pay application${lt === 1 ? "" : "s"}`]
      : []),
    ...(gaps > 0 ? [`weekdays without a daily report on ${gaps} job${gaps === 1 ? "" : "s"}`] : []),
  ];
  const list =
    parts.length > 2 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts.join(" and ");
  return `This week's list would cover ${list}.`;
}

export function CashReportView({
  orgId,
  report: r,
  loading = false,
  error = null,
  from = { name: "", company: "" },
}: {
  orgId: string;
  report: CashReport | undefined;
  loading?: boolean;
  error?: unknown;
  /** Signs the follow-up email drafts: the user's name and company. */
  from?: { name: string; company: string };
}) {
  const agingTotal = r ? AGING_BUCKETS.reduce((s, k) => s + r.totals.aging[k], 0) : 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">Cash and retainage</h1>
        <span className="space-x-3 text-sm">
          <a href={orgPath(orgId, "/reports/cash.csv")} className="underline">
            Download CSV
          </a>
          <Link to="/orgs/$orgId" params={{ orgId }} className="underline">
            Back to projects
          </Link>
        </span>
      </div>
      {loading && <p>Loading…</p>}
      <ErrorText error={error} />
      {r && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Tile
              label="Owed on sent applications"
              cents={r.totals.outstandingCents}
              note="submitted or certified, less payments received"
            />
            <Tile
              label="Retainage held"
              cents={r.totals.retainageHeldCents}
              note="across all jobs"
            />
            <Tile
              label="Retainage on finished jobs"
              cents={r.totals.retainageOnCompleteJobsCents}
              note="work complete: bill it now"
            />
            <Tile
              label="Paid"
              cents={r.totals.paidCents}
              note={`of ${formatCents(r.totals.appliedCents)} applied`}
            />
            <Tile
              label="Past due"
              cents={r.totals.pastDueCents}
              note="owed after the job's pay terms ran out"
            />
            <Tile
              label="Expected in the next 30 days"
              cents={r.totals.dueNext30Cents}
              note="owed and coming due under the pay terms"
            />
          </div>
          {r.totals.noTermsOutstandingCents > 0 && (
            <p className="text-sm text-slate-600">
              {formatCents(r.totals.noTermsOutstandingCents)} is owed on jobs with no pay terms set,
              so it is not in past due or the next 30 days. Set the terms on each job's page.
            </p>
          )}
          {r.totals.awaitingOwnerCents > 0 && (
            <p className="text-sm text-slate-600">
              {formatCents(r.totals.awaitingOwnerCents)} is owed on pay-when-paid applications whose
              owner payment to the GC is not recorded yet, so it has no due date and is not in past
              due or the next 30 days. Record the date on each application once the GC tells you, or
              set the subcontract's outer limit ("in any event within 90 days") on the job.
            </p>
          )}

          <FollowUpEmails orgId={orgId} report={r} from={from} />

          {r.totals.waiversToSend > 0 && (
            <p className="text-sm text-amber-800">
              {r.totals.waiversToSend === 1
                ? "1 unconditional lien waiver"
                : `${r.totals.waiversToSend} unconditional lien waivers`}{" "}
              not sent yet on paid applications whose conditional waiver went out. Each is named
              under "Next step" below.
            </p>
          )}

          {r.totals.pendingChangeOrders > 0 && (
            <section className="card overflow-x-auto" aria-labelledby="pending-cos">
              <h2 id="pending-cos" className="mb-1 font-semibold">
                Change orders waiting for approval: {formatCents(r.totals.pendingChangeCents)}
              </h2>
              <p className="mb-2 text-xs text-slate-500">
                Extra work you cannot bill until the GC approves it. Aged from the date it went to
                the GC (else the date entered here); over {PENDING_CHANGE_FOLLOW_UP_DAYS} days is
                flagged. Deductions are listed but not added in.
              </p>
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="td">Job</th>
                    <th className="td">Change order</th>
                    <th className="td text-right">Amount</th>
                    <th className="td text-right">Waiting</th>
                  </tr>
                </thead>
                <tbody>
                  {r.projects.flatMap((p) =>
                    p.pendingChanges.map((c) => (
                      <tr key={c.id} className="align-top">
                        <td className="td">
                          <Link
                            to="/orgs/$orgId/projects/$projectId"
                            params={{ orgId, projectId: p.id }}
                            className="underline"
                          >
                            {p.name}
                          </Link>
                          <div className="text-xs text-slate-500">{p.gcName}</div>
                        </td>
                        <td className="td">
                          <span className="font-medium">{c.number}</span> {c.description}
                        </td>
                        <td className="td text-right tabular-nums">{formatCents(c.amountCents)}</td>
                        <td
                          className={`td text-right tabular-nums ${c.amountCents > 0 && c.ageDays > PENDING_CHANGE_FOLLOW_UP_DAYS ? "font-semibold text-red-700" : ""}`}
                        >
                          {c.ageDays} days
                          <div className="text-xs font-normal text-slate-500">
                            {c.agedFrom === "sent" ? `sent ${c.submittedOn}` : "no date sent"}
                          </div>
                          {c.lastEmailedOn && (
                            <div className="text-xs font-normal text-slate-500">
                              last emailed {c.lastEmailedOn}
                            </div>
                          )}
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </section>
          )}

          {r.projects.some((p) => p.closedShort.length > 0) && (
            <section className="card overflow-x-auto" aria-labelledby="closed-short">
              <h2 id="closed-short" className="mb-1 font-semibold">
                Paid short, balance closed
              </h2>
              <p className="mb-2 text-xs text-slate-500">
                Backcharged {formatCents(r.totals.backchargedCents)} · disputed{" "}
                {formatCents(r.totals.disputedCents)} · written off{" "}
                {formatCents(r.totals.writtenOffCents)}. Counted as neither paid nor owed; reopen
                one on its application if the GC pays it after all.
              </p>
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="td">Job</th>
                    <th className="td">Application</th>
                    <th className="td">Reason</th>
                    <th className="td text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {r.projects.flatMap((p) =>
                    p.closedShort.map((c) => (
                      <tr key={c.payAppId} className="align-top">
                        <td className="td">
                          <Link
                            to="/orgs/$orgId/projects/$projectId"
                            params={{ orgId, projectId: p.id }}
                            className="underline"
                          >
                            {p.name}
                          </Link>
                          <div className="text-xs text-slate-500">{p.gcName}</div>
                        </td>
                        <td className="td">
                          #{c.number}
                          <div className="text-xs text-slate-500">closed {c.closedOn}</div>
                        </td>
                        <td className="td">
                          {SHORT_REASON_LABELS[c.reason]}
                          {c.note && <div className="text-xs text-slate-500">{c.note}</div>}
                        </td>
                        <td className="td text-right tabular-nums">{formatCents(c.cents)}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </section>
          )}

          {agingTotal > 0 && (
            <section className="card">
              <h2 className="mb-2 font-semibold">How long it has been owed</h2>
              <div className="grid grid-cols-4 gap-2 text-sm">
                {AGING_BUCKETS.map((k) => (
                  <div key={k}>
                    <div className="text-slate-500">{k} days</div>
                    <div
                      className={`tabular-nums ${k === "90+" && r.totals.aging[k] > 0 ? "font-semibold text-red-700" : ""}`}
                    >
                      {formatCents(r.totals.aging[k])}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">Counted from each application's date.</p>
            </section>
          )}

          <section className="card overflow-x-auto">
            {r.projects.length === 0 ? (
              <p className="text-sm text-slate-600">No jobs yet.</p>
            ) : (
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="td">Job</th>
                    <th className="td text-right">Contract</th>
                    <th className="td text-right">Complete</th>
                    <th className="td text-right">Owed</th>
                    <th className="td text-right">Retainage held</th>
                    <th className="td">Next step</th>
                  </tr>
                </thead>
                <tbody>
                  {r.projects.map((p) => (
                    <tr key={p.id} className="align-top">
                      <td className="td">
                        <Link
                          to="/orgs/$orgId/projects/$projectId"
                          params={{ orgId, projectId: p.id }}
                          className="font-medium underline"
                        >
                          {p.name}
                        </Link>
                        <div className="text-xs text-slate-500">
                          {p.gcName}
                          {p.status === "closed" ? " · closed" : ""}
                          {p.lastApplication
                            ? ` · last #${p.lastApplication.number} ${p.lastApplication.status}`
                            : " · not billed yet"}
                        </div>
                      </td>
                      <td className="td text-right tabular-nums">
                        {formatCents(p.contractSumToDateCents)}
                      </td>
                      <td className="td text-right tabular-nums">{p.percentComplete}%</td>
                      <td className="td text-right tabular-nums">
                        {formatCents(p.outstandingCents)}
                        {p.outstanding.length > 0 && (
                          <div className="text-xs text-slate-500">
                            oldest {Math.max(...p.outstanding.map((o) => o.ageDays))} days
                          </div>
                        )}
                        {p.outstanding.some((o) => o.receivedCents > 0) && (
                          <div className="text-xs text-amber-700">paid short</div>
                        )}
                        {p.pastDueCents > 0 && (
                          <div className="text-xs font-semibold text-red-700">
                            {formatCents(p.pastDueCents)} past due
                          </div>
                        )}
                        {p.payTermsDays !== null && p.pastDueCents === 0 && nextDue(p) && (
                          <div className="text-xs text-slate-500">next due {nextDue(p)}</div>
                        )}
                        {p.awaitingOwnerCents > 0 && (
                          <div className="text-xs text-slate-500">
                            {formatCents(p.awaitingOwnerCents)} waiting on the owner's payment
                          </div>
                        )}
                      </td>
                      <td className="td text-right tabular-nums">
                        {formatCents(p.retainageHeldCents)}
                        {p.retainageAgeDays !== null && (
                          <div className="text-xs text-slate-500">
                            since {p.retainageAgeDays} days
                          </div>
                        )}
                      </td>
                      <td className="td text-xs text-slate-700">{p.actions.join(" ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <p className="text-xs text-slate-500">
            As of {r.asOf}. Drafts are not counted. "Owed" uses the GC-certified amount where one is
            entered. A job is finished when its last sent application has no balance left on any
            line. Due dates are each application's date plus the job's pay terms, or its period end
            plus the terms on jobs whose terms count from the period end.
          </p>
        </>
      )}
    </div>
  );
}
