// The GC's monthly billing cutoff on a job: the day of the month the pay application must reach the
// GC to make that month's draw. The job page shows the next cutoff and whether this cycle's
// application went out; the cash page and the weekly email remind a week ahead and after a missed
// one (src/shared/billing-cutoff.ts).
import type { ProjectDetailDto } from "@shared/api/types";
import {
  billingCutoff,
  billingCutoffStatus,
  billingDayPhrase,
  parseBillingDay,
} from "@shared/billing-cutoff";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { ErrorText } from "./error";

export function BillingCutoff({
  path,
  day,
  payApps,
  onSaved,
}: {
  /** The project's API path. */
  path: string;
  day: number | null;
  payApps: ProjectDetailDto["payApps"];
  onSaved: () => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(day === null ? "" : String(day));
  const save = useMutation({
    mutationFn: () => {
      const billingDay = parseBillingDay(text);
      if (billingDay === undefined) {
        throw new Error(
          "Enter a day of the month from 1 to 31 (31 for the last day), or leave it blank",
        );
      }
      return api<ProjectDetailDto>(path, { method: "PATCH", body: { billingDay } });
    },
    onSuccess: async () => {
      setEditing(false);
      await onSaved();
    },
  });
  if (!editing) {
    const status =
      day === null
        ? null
        : billingCutoffStatus(
            billingCutoff(
              day,
              payApps.map((a) => ({
                number: a.number,
                status: a.status,
                applicationDate: a.applicationDate,
                submittedOn: a.submittedAt ? a.submittedAt.slice(0, 10) : null,
              })),
              new Date().toISOString().slice(0, 10),
            ),
          );
    return (
      <span>
        Billing cutoff: {day === null ? "not set" : `${billingDayPhrase(day)} of each month`}{" "}
        <button
          type="button"
          className="underline"
          onClick={() => {
            setText(day === null ? "" : String(day));
            setEditing(true);
          }}
        >
          {day === null ? "set" : "change"}
        </button>
        {status && <span className="block text-xs text-slate-500">{status}</span>}
      </span>
    );
  }
  return (
    <form
      className="mt-1 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <label className="text-sm" htmlFor="billing-day">
        Pay application due to the GC by day
      </label>
      <input
        id="billing-day"
        className="input w-20"
        inputMode="numeric"
        placeholder="e.g. 25"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <span className="text-sm">of each month</span>
      <button className="btn" type="submit" disabled={save.isPending}>
        Save
      </button>
      <button type="button" className="underline text-sm" onClick={() => setEditing(false)}>
        Cancel
      </button>
      <span className="w-full text-xs text-slate-500">
        From the subcontract or the GC's billing instructions ("pay applications are due by the 25th
        for that month's draw"). Use 31 for the last day of the month; in shorter months the cutoff
        falls on the last day. The cash page and the weekly email then remind you a week before each
        cutoff when nothing has gone out, and say so when a draft missed one. Blank clears it.
      </span>
      <ErrorText error={save.error} />
    </form>
  );
}
