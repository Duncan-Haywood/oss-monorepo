// On the projects page: submittals across the company's active jobs that are waiting on someone
// (overdue back from the GC, late to send, or returned for resubmittal), each linking to its job's
// submittal log. Rules: submittalsToChase in src/shared/submittals.ts.
import { type SubmittalToChase, submittalToChaseText } from "@shared/submittals";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api, orgPath } from "../lib/api";
import { localToday } from "../pages/submittals";

export function SubmittalsToChaseAlert({ orgId }: { orgId: string }) {
  const today = localToday();
  const q = useQuery({
    queryKey: ["submittals-to-chase", orgId, today],
    queryFn: () =>
      api<{ items: SubmittalToChase[] }>(
        orgPath(orgId, `/submittals/to-chase?today=${encodeURIComponent(today)}`),
      ),
  });
  const items = q.data?.items ?? [];
  if (items.length === 0) return null;
  const risk = items.filter((s) => s.deliveryAtRisk).length;
  return (
    <section role="status" className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm">
      <h2 className="mb-1 font-semibold">
        {items.length === 1 ? "1 submittal to chase" : `${items.length} submittals to chase`}
        {risk > 0 ? `, ${risk} with delivery on site at risk` : ""}
      </h2>
      <ul className="list-disc pl-5">
        {items.map((s) => (
          <li key={s.id}>
            <Link
              to="/orgs/$orgId/projects/$projectId/submittals"
              params={{ orgId, projectId: s.projectId }}
              className="underline"
            >
              {submittalToChaseText(s)}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-slate-600">
        Worked from the dates, lead times and review days you typed: overdue back from the GC, past
        the last day to send for the material to arrive in time, or returned for resubmittal with no
        next revision entered. Nothing is sent from PayApps.
      </p>
    </section>
  );
}
