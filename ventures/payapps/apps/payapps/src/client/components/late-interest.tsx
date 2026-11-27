// Interest on late payment on a job: the rate from the subcontract's late-payment clause, or one of
// the prompt payment statutes PayApps has read (src/shared/late-interest.ts). The cash report then
// shows what has accrued on each past-due application, and the second follow-up request states it.
import type { ProjectDetailDto } from "@shared/api/types";
import {
  LATE_INTEREST_PRESETS,
  type LateInterestMethod,
  type LateInterestPer,
  lateInterestTermsOf,
  MAX_LATE_INTEREST_SOURCE,
  parseRatePct,
  presetSource,
  rateLabel,
} from "@shared/late-interest";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { ErrorText } from "./error";

export function LateInterestSetting({
  path,
  project,
  onSaved,
}: {
  /** The project's API path. */
  path: string;
  project: Pick<
    ProjectDetailDto,
    "lateInterestBps" | "lateInterestPer" | "lateInterestMethod" | "lateInterestSource"
  >;
  onSaved: () => void | Promise<void>;
}) {
  const terms = lateInterestTermsOf(project);
  const [editing, setEditing] = useState(false);
  const [rate, setRate] = useState("");
  const [per, setPer] = useState<LateInterestPer>("month");
  const [method, setMethod] = useState<LateInterestMethod>("prorata");
  const [source, setSource] = useState("");
  const start = () => {
    setRate(terms ? String(terms.bps / 100) : "");
    setPer(terms?.per ?? "month");
    setMethod(terms?.method ?? "prorata");
    setSource(terms?.source ?? "");
    setEditing(true);
  };
  const save = useMutation({
    mutationFn: () => {
      const bps = parseRatePct(rate, per);
      if (bps === undefined) {
        throw new Error(
          per === "month"
            ? "Enter the rate as a percent a month, like 1.5 (at most 5), or leave it blank"
            : "Enter the rate as a percent a year, like 10 (at most 60), or leave it blank",
        );
      }
      return api<ProjectDetailDto>(path, {
        method: "PATCH",
        body: {
          lateInterestBps: bps,
          lateInterestPer: per,
          lateInterestMethod: per === "month" ? method : "prorata",
          lateInterestSource: bps === null ? null : source.trim() || null,
        },
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
        Late-payment interest:{" "}
        {terms ? `${rateLabel(terms)}${terms.source ? ` (${terms.source})` : ""}` : "not tracked"}{" "}
        <button type="button" className="underline" onClick={start}>
          {terms ? "change" : "set"}
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
      <label className="text-sm" htmlFor="late-interest-preset">
        Fill from a statute
      </label>
      <select
        id="late-interest-preset"
        className="input w-auto"
        value=""
        onChange={(e) => {
          const p = LATE_INTEREST_PRESETS.find((x) => x.key === e.target.value);
          if (!p) return;
          setRate(String(p.bps / 100));
          setPer(p.per);
          setMethod(p.method);
          setSource(presetSource(p));
        }}
      >
        <option value="">choose…</option>
        {LATE_INTEREST_PRESETS.map((p) => (
          <option key={p.key} value={p.key}>
            {p.state}: {rateLabel(p)}, {p.law}
          </option>
        ))}
      </select>
      <span className="w-full" />
      <label className="text-sm" htmlFor="late-interest-rate">
        Rate
      </label>
      <input
        id="late-interest-rate"
        className="input w-20"
        inputMode="decimal"
        placeholder="e.g. 1.5"
        value={rate}
        onChange={(e) => setRate(e.target.value)}
      />
      <label className="sr-only" htmlFor="late-interest-per">
        Per
      </label>
      <select
        id="late-interest-per"
        className="input w-auto"
        value={per}
        onChange={(e) => setPer(e.target.value === "year" ? "year" : "month")}
      >
        <option value="month">% a month</option>
        <option value="year">% a year</option>
      </select>
      {per === "month" && (
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={method === "fraction"}
            onChange={(e) => setMethod(e.target.checked ? "fraction" : "prorata")}
          />
          a part month counts as a whole month
        </label>
      )}
      <label className="text-sm" htmlFor="late-interest-source">
        From
      </label>
      <input
        id="late-interest-source"
        className="input w-64"
        maxLength={MAX_LATE_INTEREST_SOURCE}
        placeholder="e.g. Subcontract § 5.3"
        value={source}
        onChange={(e) => setSource(e.target.value)}
      />
      <button className="btn" type="submit" disabled={save.isPending}>
        Save
      </button>
      <button type="button" className="underline text-sm" onClick={() => setEditing(false)}>
        Cancel
      </button>
      <span className="w-full text-xs text-slate-500">
        The rate your subcontract's late-payment clause sets, or a prompt payment statute. The cash
        report then shows the interest accrued on each past-due application (simple interest from
        the day after it was due, on the balance still owed, a month counted as 30 days), and the
        second follow-up request to the GC states it. Whether a statute covers this job (private or
        public work, your tier, what the subcontract says) is for you or your attorney to check:
        PayApps does not decide it, and this is not legal advice. Statutes:{" "}
        {LATE_INTEREST_PRESETS.map((p, i) => (
          <span key={p.key}>
            {i > 0 && "; "}
            <a className="underline" href={p.url} target="_blank" rel="noreferrer">
              {p.law}
            </a>{" "}
            ({p.scope})
          </span>
        ))}
        . Blank clears it.
      </span>
      <ErrorText error={save.error} />
    </form>
  );
}
