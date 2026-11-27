// Pay-when-paid: on a job whose pay terms count from the owner's payment to the GC, each sent
// application records the day the owner paid the GC for it. Until it is recorded the application has
// no due date (the cash report never guesses when the owner pays); once it is, the due date is that
// day plus the job's days, capped by the job's outer limit when it has one ("and in any event within
// 90 days"), which also dates the application while the owner's payment is unknown
// (src/shared/cash-report.ts, payDueOn).
import type { PayAppDetailDto, PayAppDto, ProjectDetailDto } from "@shared/api/types";
import { payDueOn } from "@shared/cash-report";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { ErrorText } from "./error";

const today = () => new Date().toISOString().slice(0, 10);

export function OwnerPaymentPanel(props: {
  base: string;
  app: PayAppDetailDto;
  /** The job's pay terms in days (null: not set). */
  payTermsDays: number | null;
  /** The job's pay-when-paid outer limit in days from the application date, or null. */
  payTermsOuterDays: number | null;
  gcName: string;
  onChanged: (d: PayAppDetailDto) => void;
}) {
  const { base, app, payTermsDays, payTermsOuterDays, gcName } = props;
  const [date, setDate] = useState(app.ownerPaidOn ?? today());
  const save = useMutation({
    mutationFn: (ownerPaidOn: string | null) =>
      api<PayAppDetailDto>(`${base}/owner-paid`, { method: "PUT", body: { ownerPaidOn } }),
    onSuccess: props.onChanged,
  });
  if (app.status === "draft") return null;
  const due = payDueOn(payTermsDays, "owner_paid", app, payTermsOuterDays);
  return (
    <section className="card max-w-2xl">
      <h2 className="mb-1 font-semibold">Owner's payment to {gcName}</h2>
      <p className="mb-2 text-sm text-slate-600">
        This job is pay-when-paid: the days count from the day the owner pays {gcName} for this
        period.{" "}
        {app.ownerPaidOn ? (
          <>
            Recorded as paid on <span className="font-semibold">{app.ownerPaidOn}</span>
            {due ? (
              <>
                , so this application is due on <span className="font-semibold">{due}</span>.
              </>
            ) : (
              "."
            )}
          </>
        ) : (
          <>
            Not recorded yet, so{" "}
            {due ? (
              <>
                this application is due by the job's outer limit,{" "}
                <span className="font-semibold">{due}</span>. An earlier owner payment can make it
                due sooner: ask the GC, then enter the date they give you.
              </>
            ) : (
              "this application has no due date: ask the GC, then enter the date they give you."
            )}
          </>
        )}
      </p>
      {app.status !== "paid" || app.ownerPaidOn ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(date);
          }}
        >
          <label className="text-sm" htmlFor="owner-paid-on">
            Owner paid the GC on
          </label>
          <input
            id="owner-paid-on"
            type="date"
            className="input w-auto"
            value={date}
            max={today()}
            min={app.periodFrom}
            onChange={(e) => setDate(e.target.value)}
          />
          <button className="btn" type="submit" disabled={save.isPending || !date}>
            {app.ownerPaidOn ? "Change" : "Record"}
          </button>
          {app.ownerPaidOn && (
            <button
              type="button"
              className="text-sm underline"
              disabled={save.isPending}
              onClick={() => save.mutate(null)}
            >
              Clear
            </button>
          )}
        </form>
      ) : null}
      <p className="mt-2 text-xs text-slate-500">
        PayApps only counts days from the date you enter; it does not judge your subcontract's
        payment clause.
      </p>
      <ErrorText error={save.error} />
    </section>
  );
}

/**
 * Pay-when-paid, several applications at once: the GC reports one owner payment that covered more
 * than one period. Lists the job's sent applications, ticks the ones still waiting (no date yet and
 * money still owed), and records one date on every ticked one (PUT .../pay-apps/owner-paid, all or
 * nothing). Shown on the job page when at least two sent applications could take a date.
 */
export function OwnerPaymentsBulk(props: {
  /** `/api/orgs/:orgId/projects/:projectId/pay-apps`. */
  base: string;
  apps: readonly PayAppDto[];
  gcName: string;
  onChanged: (d: ProjectDetailDto) => void;
}) {
  const sent = props.apps.filter((a) => a.status !== "draft");
  const waiting = (a: PayAppDto) => a.ownerPaidOn === null && a.status !== "paid";
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(sent.filter(waiting).map((a) => a.id)),
  );
  const [date, setDate] = useState(today());
  const save = useMutation({
    mutationFn: (payAppIds: string[]) =>
      api<ProjectDetailDto>(`${props.base}/owner-paid`, {
        method: "PUT",
        body: { payAppIds, ownerPaidOn: date },
      }),
    onSuccess: (d) => {
      setPicked(new Set());
      props.onChanged(d);
    },
  });
  if (sent.length < 2) return null;
  const chosen = sent.filter((a) => picked.has(a.id));
  // The date cannot be before any chosen period began: the latest start (src/shared/payments.ts).
  const min = chosen.reduce<string | undefined>(
    (m, a) => (m === undefined || a.periodFrom > m ? a.periodFrom : m),
    undefined,
  );
  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <section className="card">
      <h2 className="mb-1 font-semibold">Owner's payment for several applications</h2>
      <p className="mb-2 text-sm text-slate-600">
        When {props.gcName} says one owner payment covered more than one period, tick those
        applications and enter the date once. Each application's due date then counts from it, and
        each gets its own history row.
      </p>
      <table className="w-full">
        <thead>
          <tr>
            <th className="th" />
            <th className="th">#</th>
            <th className="th">Period</th>
            <th className="th">Status</th>
            <th className="th">Owner paid the GC</th>
          </tr>
        </thead>
        <tbody>
          {sent.map((a) => (
            <tr key={a.id}>
              <td className="td">
                <input
                  type="checkbox"
                  aria-label={`Application #${a.number}`}
                  checked={picked.has(a.id)}
                  onChange={() => toggle(a.id)}
                />
              </td>
              <td className="td">#{a.number}</td>
              <td className="td">
                {a.periodFrom} – {a.periodTo}
              </td>
              <td className="td">{a.status}</td>
              <td className="td">{a.ownerPaidOn ?? "not recorded"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="mt-2 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(chosen.map((a) => a.id));
        }}
      >
        <label className="text-sm" htmlFor="owner-paid-many-on">
          Owner paid the GC on
        </label>
        <input
          id="owner-paid-many-on"
          type="date"
          className="input w-auto"
          value={date}
          max={today()}
          min={min}
          onChange={(e) => setDate(e.target.value)}
        />
        <button
          className="btn"
          type="submit"
          disabled={save.isPending || !date || chosen.length === 0}
        >
          Record for {chosen.length} {chosen.length === 1 ? "application" : "applications"}
        </button>
      </form>
      <p className="mt-2 text-xs text-slate-500">
        PayApps only counts days from the date you enter; it does not judge your subcontract's
        payment clause. To clear a date, open that application.
      </p>
      <ErrorText error={save.error} />
    </section>
  );
}
