// /orgs/$orgId/wip : the work-in-progress schedule across active jobs (services/payapps/job-cost.ts).
import type { WipReportDto } from "@shared/api/types";
import { formatBps, formatCents } from "@shared/money";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ErrorText } from "../components/error";
import { api, orgPath } from "../lib/api";
import { JOB_COST_NOTE, overUnderText } from "./job-cost";

const money = (c: number | null) => (c === null ? "—" : formatCents(c));

export function WipPage() {
  const { orgId } = useParams({ from: "/orgs/$orgId/wip" });
  const q = useQuery({
    queryKey: ["wip", orgId],
    queryFn: () => api<WipReportDto>(orgPath(orgId, "/reports/wip")),
  });
  if (q.error) return <ErrorText error={q.error} />;
  if (!q.data) return <p className="text-sm text-slate-500">Loading…</p>;
  const r = q.data;
  return (
    <div className="space-y-4">
      <div>
        <Link to="/orgs/$orgId" params={{ orgId }} className="text-sm text-slate-600 underline">
          ← Projects
        </Link>
        <h1 className="text-2xl font-semibold">WIP schedule</h1>
        <p className="text-sm text-slate-600">
          Active jobs, each worked from its latest sent pay application and the costs dated up to
          its period end.{" "}
          <a className="underline" href={orgPath(orgId, "/reports/wip.csv")}>
            Download CSV
          </a>{" "}
          ·{" "}
          <a className="underline" href={orgPath(orgId, "/reports/wip.pdf")}>
            PDF for your surety or bank
          </a>
        </p>
        {!r.canEdit && (
          <p className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
            Entering budgets and costs is in the Crew plan and up.{" "}
            <Link to="/orgs/$orgId/billing" params={{ orgId }} className="underline">
              Plans
            </Link>
          </p>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Contract to date", r.totals.contractCents],
          ["Earned revenue", r.totals.earnedRevenueCents],
          ["Over billed (billings in excess)", r.totals.overBilledCents],
          ["Under billed (costs in excess)", r.totals.underBilledCents],
        ].map(([label, cents]) => (
          <div key={label as string} className="card">
            <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
            <div className="text-xl font-semibold tabular-nums">{formatCents(cents as number)}</div>
          </div>
        ))}
      </div>
      {r.incompleteJobs > 0 && (
        <p className="text-sm text-amber-800">
          {r.incompleteJobs} job{r.incompleteJobs === 1 ? " is" : "s are"} left out of the totals
          until every line has a cost budget.
        </p>
      )}
      <section className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Job</th>
              <th className="th text-right">Contract</th>
              <th className="th text-right">Est. cost</th>
              <th className="th text-right">Cost to date</th>
              <th className="th text-right">% complete</th>
              <th className="th text-right">Earned</th>
              <th className="th text-right">Billed</th>
              <th className="th text-right">Over / under</th>
              <th className="th text-right">Projected profit</th>
            </tr>
          </thead>
          <tbody>
            {r.rows.map((j) => (
              <tr key={j.projectId}>
                <td className="td">
                  <Link
                    to="/orgs/$orgId/projects/$projectId/job-cost"
                    params={{ orgId, projectId: j.projectId }}
                    className="font-medium underline"
                  >
                    {j.projectName}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {j.gcName}
                    {j.billedThrough
                      ? ` · through #${j.billedThrough.number}`
                      : " · not billed yet"}
                    {j.missingBudgets > 0 && ` · ${j.missingBudgets} line(s) with no budget`}
                    {j.overBudgetLines > 0 && ` · ${j.overBudgetLines} over budget`}
                  </div>
                </td>
                <td className="td text-right tabular-nums">{money(j.totals.contractCents)}</td>
                <td className="td text-right tabular-nums">
                  {money(j.totals.estimateAtCompletionCents)}
                </td>
                <td className="td text-right tabular-nums">{money(j.totals.costToDateCents)}</td>
                <td className="td text-right tabular-nums">
                  {j.totals.percentCompleteBps === null
                    ? "—"
                    : formatBps(j.totals.percentCompleteBps)}
                </td>
                <td className="td text-right tabular-nums">{money(j.totals.earnedRevenueCents)}</td>
                <td className="td text-right tabular-nums">{money(j.totals.billedToDateCents)}</td>
                <td className="td text-right">{overUnderText(j.totals.overUnderBilledCents)}</td>
                <td className="td text-right tabular-nums">
                  {money(j.totals.projectedGrossProfitCents)}
                </td>
              </tr>
            ))}
            {r.rows.length === 0 && (
              <tr>
                <td className="td text-slate-500" colSpan={9}>
                  No active jobs.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-slate-500">{JOB_COST_NOTE}</p>
    </div>
  );
}
