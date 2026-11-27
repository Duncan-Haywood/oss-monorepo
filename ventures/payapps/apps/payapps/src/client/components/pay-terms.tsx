// Pay terms on a job: the days the subcontract gives the GC to pay, counted from the application date
// from the end of the period billed or from the owner's payment to the GC (pay-when-paid, with an
// optional outer limit, "and in any event within 90 days"). The cash report dates each unpaid application from them
// (src/shared/cash-report.ts, payDueOn), and so does the QuickBooks invoice.
import type { ProjectDetailDto } from "@shared/api/types";
import { parseOuterLimitDays, parsePayTermsDays } from "@shared/cash-report";
import type { PayTermsBasis } from "@shared/enums";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { ErrorText } from "./error";

export function PayTerms({
  path,
  days,
  basis,
  outerDays,
  onSaved,
}: {
  /** The project's API path. */
  path: string;
  days: number | null;
  basis: PayTermsBasis;
  /** Pay-when-paid outer limit in days from the application date, or null. */
  outerDays: number | null;
  onSaved: () => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(days === null ? "" : String(days));
  const [from, setFrom] = useState<PayTermsBasis>(basis);
  const [outerText, setOuterText] = useState(outerDays === null ? "" : String(outerDays));
  const save = useMutation({
    mutationFn: () => {
      const payTermsDays = parsePayTermsDays(text);
      if (payTermsDays === undefined) {
        throw new Error("Enter a number of days from 0 to 365, or leave it blank");
      }
      const outer = from === "owner_paid" ? parseOuterLimitDays(outerText) : null;
      if (outer === undefined) {
        throw new Error(
          "Enter the outer limit as a number of days from 1 to 365, or leave it blank",
        );
      }
      return api<ProjectDetailDto>(path, {
        method: "PATCH",
        body: { payTermsDays, payTermsBasis: from, payTermsOuterDays: outer },
      });
    },
    onSuccess: async () => {
      setEditing(false);
      await onSaved();
    },
  });
  if (!editing) {
    return (
      <span>
        Pay terms: {days === null ? "not set" : payTermsLabel(days, basis, outerDays)}{" "}
        <button
          type="button"
          className="underline"
          onClick={() => {
            setText(days === null ? "" : String(days));
            setFrom(basis);
            setOuterText(outerDays === null ? "" : String(outerDays));
            setEditing(true);
          }}
        >
          {days === null ? "set" : "change"}
        </button>
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
      <label className="text-sm" htmlFor="pay-terms-days">
        Days the GC has to pay
      </label>
      <input
        id="pay-terms-days"
        className="input w-24"
        inputMode="numeric"
        placeholder="e.g. 30"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <label className="sr-only" htmlFor="pay-terms-basis">
        Counted from
      </label>
      <PayTermsBasisSelect id="pay-terms-basis" value={from} onChange={setFrom} />
      {from === "owner_paid" && (
        <OuterLimitInput id="pay-terms-outer" value={outerText} onChange={setOuterText} />
      )}
      <button className="btn" type="submit" disabled={save.isPending}>
        Save
      </button>
      <button type="button" className="underline text-sm" onClick={() => setEditing(false)}>
        Cancel
      </button>
      <span className="w-full text-xs text-slate-500">
        From your subcontract's payment clause: "net 30" counts from the application date; "30 days
        after the end of the month" counts from the period end; "within 7 days after the contractor
        is paid by the owner" counts from the owner's payment, which you record on each application
        once the GC tells you. If the clause adds "and in any event within 90 days", enter that
        outer limit too: the application is then due by that day even if the owner never pays. Blank
        clears it. The cash report then shows what is past due and what is expected in the next 30
        days.
      </span>
      <ErrorText error={save.error} />
    </form>
  );
}

/**
 * "30 days after the application date", "30 days after the period end", "7 days after the owner pays
 * the GC (pay-when-paid)", plus ", in any event within 90 days of the application date" with an outer
 * limit.
 */
export function payTermsLabel(
  days: number,
  basis: PayTermsBasis,
  outerDays: number | null = null,
): string {
  const d = `${days} day${days === 1 ? "" : "s"}`;
  if (basis === "period_end") return `${d} after the period end`;
  if (basis === "owner_paid") {
    const outer = outerDays
      ? `, in any event within ${outerDays} day${outerDays === 1 ? "" : "s"} of the application date`
      : "";
    return `${d} after the owner pays the GC (pay-when-paid)${outer}`;
  }
  return `${d} after the application date`;
}

/** The pay-when-paid outer limit: "and in any event within [90] days of the application date". */
export function OuterLimitInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <span className="flex items-center gap-2 text-sm">
      <label htmlFor={id}>and in any event within</label>
      <input
        id={id}
        className="input w-20"
        inputMode="numeric"
        placeholder="none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span>days of the application date (optional)</span>
    </span>
  );
}

export function PayTermsBasisSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: PayTermsBasis;
  onChange: (b: PayTermsBasis) => void;
}) {
  return (
    <select
      id={id}
      className="input w-auto"
      value={value}
      onChange={(e) =>
        onChange(
          e.target.value === "period_end" || e.target.value === "owner_paid"
            ? e.target.value
            : "application_date",
        )
      }
    >
      <option value="application_date">after the application date</option>
      <option value="period_end">after the period end</option>
      <option value="owner_paid">after the owner pays the GC (pay-when-paid)</option>
    </select>
  );
}
