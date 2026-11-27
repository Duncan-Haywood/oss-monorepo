// Shop load: the open jobs (won quotes not shipped) on the machines in due-date order, each
// machine's booked days, and on a quote the lead time its machine work would take behind them.
// The model and its limits are in src/shared/shop-load.ts; the page states them.

import type { QuoteDetailDto } from "@shared/api";
import type { LeadTime, ShopLoad } from "@shared/shop-load";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Badge, Button, Card, ErrorText, Field, Input } from "../components/ui";
import { api, orgApi, queryClient } from "../lib/api";
import { canAdmin, canEstimate, useOrg, useOrgId } from "./layout";

type LoadDto = ShopLoad & { today: string; openWonDays: number };
interface LeadDto {
  today: string;
  openJobs: number;
  lines: { lineId: string; partNumber: string; breaks: (LeadTime & { text: string | null })[] }[];
}
interface JobDto {
  dueOn: string | null;
  quantities: Record<string, number>;
  shippedOn: string | null;
}

const hrs = (h: number) => `${Number(h.toFixed(1))} h`;
const days = (d: number) => `${Number(d.toFixed(1))} working day${d === 1 ? "" : "s"}`;

function HoursCell({
  orgId,
  machineId,
  value,
}: {
  orgId: string;
  machineId: string;
  value: number | null;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  const save = useMutation({
    mutationFn: () =>
      api(orgApi(orgId, `/shop-load/machines/${encodeURIComponent(machineId)}`), {
        method: "PUT",
        body: { hoursPerDay: text.trim() === "" ? null : Number(text) },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shop-load", orgId] }),
  });
  return (
    <div className="flex items-center gap-1">
      <Input
        className="w-20"
        inputMode="decimal"
        aria-label="Hours per day"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="not set"
      />
      <Button variant="secondary" onClick={() => save.mutate()} disabled={save.isPending}>
        Save
      </Button>
      {save.error && <ErrorText error={save.error} />}
    </div>
  );
}

export function ShopLoadPage() {
  const orgId = useOrgId();
  const role = useOrg(orgId).data?.role;
  const q = useQuery({
    queryKey: ["shop-load", orgId],
    queryFn: () => api<LoadDto>(orgApi(orgId, "/shop-load")),
  });
  const r = q.data;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-stone-900">Shop load</h1>
      {q.error && <ErrorText error={q.error} />}
      <Card>
        <p className="text-sm text-stone-700">
          Open jobs are won quotes not marked shipped (won in the last {r?.openWonDays ?? 90} days,
          or with a due date saved). They go on the machines by due date, each part's operations in
          the estimate's order, at each machine's hours a day, Monday to Friday. It is an estimate,
          not a schedule: holidays, work already done on a job, finishing and outside services are
          not counted, so add their days. Mark a job shipped on its quote page.
        </p>
      </Card>
      {r && (
        <Card title="Machines">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-stone-500">
                <tr>
                  <th className="py-1 pr-3">Machine</th>
                  <th className="py-1 pr-3">Hours a day</th>
                  <th className="py-1 pr-3">Open work</th>
                  <th className="py-1 pr-3">Booked until</th>
                </tr>
              </thead>
              <tbody>
                {r.machines.map((m) => (
                  <tr key={m.id} className="border-t border-stone-100">
                    <td className="py-1 pr-3">{m.name}</td>
                    <td className="py-1 pr-3">
                      {canAdmin(role) ? (
                        <HoursCell orgId={orgId} machineId={m.id} value={m.hoursPerDay} />
                      ) : (
                        (m.hoursPerDay ?? "not set")
                      )}
                    </td>
                    <td className="py-1 pr-3">
                      {hrs(m.hours)}
                      {m.jobs > 0 && ` · ${m.jobs} job${m.jobs === 1 ? "" : "s"}`}
                    </td>
                    <td className="py-1 pr-3">
                      {m.bookedUntil ? `${m.bookedUntil} (${days(m.bookedDays)})` : "free"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {r && (
        <Card title={`Open jobs (${r.jobs.length})`}>
          {r.jobs.length === 0 ? (
            <p className="text-sm text-stone-600">No open jobs: mark a quote won to see it here.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-stone-500">
                  <tr>
                    <th className="py-1 pr-3">Quote</th>
                    <th className="py-1 pr-3">Due</th>
                    <th className="py-1 pr-3">Machine work done</th>
                    <th className="py-1 pr-3">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {r.jobs.map((j) => (
                    <tr key={j.id} className="border-t border-stone-100 align-top">
                      <td className="py-1 pr-3">
                        <Link
                          to="/app/$orgId/quotes/$quoteId"
                          params={{ orgId, quoteId: j.id }}
                          className="text-sky-800 hover:underline"
                        >
                          {j.label}
                        </Link>{" "}
                        <span className="text-stone-500">{j.customer}</span>
                      </td>
                      <td className="py-1 pr-3">{j.dueOn ?? "not set"}</td>
                      <td className="py-1 pr-3">
                        {j.finishOn ? (
                          <>
                            {j.finishOn} {j.late && <Badge tone="red">after the due date</Badge>}
                          </>
                        ) : (
                          <span className="text-amber-800">
                            Can't plan: {j.problems.join("; ")}
                          </span>
                        )}
                      </td>
                      <td className="py-1 pr-3">{hrs(j.hours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

/** On a quote page: when each quantity break's machine work would finish if won today. */
export function LeadTimeCard({ quote }: { quote: QuoteDetailDto }) {
  const orgId = useOrgId();
  const q = useQuery({
    queryKey: [
      "lead-time",
      orgId,
      quote.id,
      JSON.stringify(quote.lines.map((l) => [l.id, l.inputs])),
    ],
    queryFn: () => api<LeadDto>(orgApi(orgId, `/quotes/${quote.id}/lead-time`)),
    enabled: quote.lines.length > 0,
  });
  if (quote.lines.length === 0) return null;
  return (
    <Card
      title="Lead time from shop load"
      actions={
        <Link
          to="/app/$orgId/shop-load"
          params={{ orgId }}
          className="text-sm text-sky-800 hover:underline"
        >
          Shop load
        </Link>
      }
    >
      {q.error && <ErrorText error={q.error} />}
      {q.data && (
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-stone-600">
            If won today and run behind the {q.data.openJobs} open job
            {q.data.openJobs === 1 ? "" : "s"}: machine work only, so add finishing, outside
            services and shipping.
          </p>
          {q.data.lines.map((l) => (
            <div key={l.lineId}>
              <div className="font-medium text-stone-800">{l.partNumber}</div>
              <ul className="ml-4 list-disc">
                {l.breaks.map((b) => (
                  <li key={b.quantity}>
                    {b.quantity} pcs:{" "}
                    {b.finishOn
                      ? `done ${b.finishOn} (${b.workingDays} working day${b.workingDays === 1 ? "" : "s"}, ${hrs(b.hours)})${b.text ? `, about ${b.text}` : ""}`
                      : `can't plan: ${b.problems.join("; ")}`}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** On a won quote: the job's due date, quantities ordered and shipped day (shop load reads them). */
export function JobCard({ quote }: { quote: QuoteDetailDto }) {
  const orgId = useOrgId();
  const role = useOrg(orgId).data?.role;
  const q = useQuery({
    queryKey: ["job", orgId, quote.id],
    queryFn: () => api<JobDto>(orgApi(orgId, `/quotes/${quote.id}/job`)),
  });
  if (!q.data) return q.error ? <ErrorText error={q.error} /> : null;
  return (
    <JobForm key={JSON.stringify(q.data)} quote={quote} job={q.data} editable={canEstimate(role)} />
  );
}

function JobForm({
  quote,
  job,
  editable,
}: {
  quote: QuoteDetailDto;
  job: JobDto;
  editable: boolean;
}) {
  const orgId = useOrgId();
  const [due, setDue] = useState(job.dueOn ?? "");
  const [shipped, setShipped] = useState(job.shippedOn ?? "");
  const [qty, setQty] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(job.quantities).map(([k, v]) => [k, String(v)])),
  );
  const save = useMutation({
    mutationFn: () =>
      api<JobDto>(orgApi(orgId, `/quotes/${quote.id}/job`), {
        method: "PUT",
        body: {
          dueOn: due || null,
          shippedOn: shipped || null,
          quantities: Object.fromEntries(
            Object.entries(qty)
              .filter(([, v]) => v.trim() !== "")
              .map(([k, v]) => [k, Number(v)]),
          ),
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["job", orgId, quote.id] });
      void queryClient.invalidateQueries({ queryKey: ["shop-load", orgId] });
    },
  });
  const multi = quote.lines.filter((l) => l.inputs.quantities.length > 1);
  return (
    <Card title="Job">
      <div className="flex flex-col gap-2 text-sm">
        <p className="text-stone-600">
          Shop load counts this job until it is marked shipped.
          {multi.length > 0 &&
            " A part quoted at several quantities needs the quantity ordered (unless the customer picked one online)."}
        </p>
        <div className="flex flex-wrap gap-3">
          <Field label="Due">
            <Input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              disabled={!editable}
            />
          </Field>
          <Field label="Shipped">
            <Input
              type="date"
              value={shipped}
              onChange={(e) => setShipped(e.target.value)}
              disabled={!editable}
            />
          </Field>
        </div>
        {multi.map((l) => (
          <Field key={l.id} label={`${l.partNumber}: quantity ordered`}>
            <Input
              className="w-28"
              inputMode="numeric"
              value={qty[l.id] ?? ""}
              onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })}
              disabled={!editable}
            />
          </Field>
        ))}
        {editable && (
          <div>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Save job
            </Button>
          </div>
        )}
        {save.error && <ErrorText error={save.error} />}
      </div>
    </Card>
  );
}
