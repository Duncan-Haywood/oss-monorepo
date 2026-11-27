// The job's lien deadline: the last day this company can record (or file) a mechanics lien on the
// property, from the job's state and the day it last furnished labor or materials, or, until that
// is entered, estimated from the billing (src/shared/lien-deadline.ts). Saved through the job's PATCH;
// the cash page and the weekly email name the date once money is owed and it is near.
import type { ProjectDetailDto } from "@shared/api/types";
import { daysUntil, LIEN_DEADLINE_RULES, LIEN_DEADLINE_STATES } from "@shared/lien-deadline";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ErrorText } from "./error";

const today = () => new Date().toISOString().slice(0, 10);

function whenText(dueOn: string): string {
  const left = daysUntil(today(), dueOn);
  if (left < 0) return `passed ${-left} day${left === -1 ? "" : "s"} ago`;
  if (left === 0) return "today";
  if (left === 1) return "tomorrow";
  return `in ${left} days`;
}

export function LienDeadlinePanel(props: {
  path: string;
  project: ProjectDetailDto;
  onSaved: () => void | Promise<void>;
}) {
  const { path, project: p, onSaved } = props;
  const [state, setState] = useState(p.lienState ?? "");
  const [residential, setResidential] = useState(p.lienResidential);
  const [last, setLast] = useState(p.lastFurnishedOn ?? "");
  const [completed, setCompleted] = useState(p.workCompletedOn ?? "");
  const [noc, setNoc] = useState(p.noticeOfCompletionOn ?? "");
  useEffect(() => {
    setState(p.lienState ?? "");
    setResidential(p.lienResidential);
    setLast(p.lastFurnishedOn ?? "");
    setCompleted(p.workCompletedOn ?? "");
    setNoc(p.noticeOfCompletionOn ?? "");
  }, [
    p.lienState,
    p.lienResidential,
    p.lastFurnishedOn,
    p.workCompletedOn,
    p.noticeOfCompletionOn,
  ]);

  const save = useMutation({
    mutationFn: () => {
      const s = state.trim().toUpperCase();
      if (s && !/^[A-Z]{2}$/.test(s)) throw new Error("Enter the state's two-letter code, like CA");
      const completionState = s === "CA" || s === "AZ";
      return api<ProjectDetailDto>(path, {
        method: "PATCH",
        body: {
          lienState: s || null,
          lienResidential: residential,
          lastFurnishedOn: last || null,
          workCompletedOn: completionState ? completed || null : null,
          noticeOfCompletionOn: completionState ? noc || null : null,
        },
      });
    },
    onSuccess: () => onSaved(),
  });

  const r = p.lienDeadline;
  const d = r.kind === "deadline" ? r.deadline : null;
  const upper = state.trim().toUpperCase();
  const rule = (LIEN_DEADLINE_STATES as readonly string[]).includes(upper)
    ? LIEN_DEADLINE_RULES[upper as keyof typeof LIEN_DEADLINE_RULES]
    : null;
  const completionState = upper === "CA" || upper === "AZ";

  return (
    <details className="card max-w-3xl" open={d !== null}>
      <summary className="cursor-pointer font-semibold">
        Lien deadline
        {d && (
          <span className="font-normal text-slate-600">
            {" "}
            · {d.dueOn} ({whenText(d.dueOn)})
          </span>
        )}
      </summary>
      <div className="mt-2 grid gap-3 text-sm">
        <p className="text-slate-600">
          The last day to record a mechanics lien on this job if you are not paid. Lien rights end
          on that date whether or not anyone reminds you. PayApps counts it for a subcontractor or
          supplier on a private job in{" "}
          {LIEN_DEADLINE_STATES.map((s) => LIEN_DEADLINE_RULES[s].name).join(", ")}.
        </p>

        {d && (
          <div
            className={`rounded border p-3 ${daysUntil(today(), d.dueOn) <= 45 ? "border-amber-400 bg-amber-50" : "border-slate-200"}`}
          >
            <p className="font-medium">
              {d.stateName}: {d.act} by {d.dueOn} ({whenText(d.dueOn)})
            </p>
            <p className="text-slate-700">
              {d.rule} ({d.citation})
              {d.statutoryOn !== d.dueOn &&
                `. The statute's date, ${d.statutoryOn}, is a weekend, so this is the Friday before it`}
              .
            </p>
            {d.basis === "estimated" && (
              <p className="text-amber-800">
                Estimated: no last day on the job is entered, so PayApps counted from the start of
                Pay App #{d.fromPayAppNumber}'s period ({d.fromOn}), the earliest your last day of
                work can be. Enter the real day below for the exact date.
              </p>
            )}
            <ul className="mt-1 list-disc pl-5 text-slate-600">
              {d.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        )}
        {r.kind === "unsupported" && (
          <p>
            PayApps does not count the lien deadline for {r.state} yet. Check that state's lien law
            for the date.
          </p>
        )}
        {r.kind === "no-dates" && (
          <p>
            Enter the day you last furnished labor or materials (or bill a pay application with work
            on it) and PayApps will date the {r.stateName} lien deadline.
          </p>
        )}

        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid">
              <span className="text-slate-600">Property's state</span>
              <input
                className="input w-20 uppercase"
                maxLength={2}
                value={state}
                onChange={(e) => setState(e.target.value.toUpperCase())}
                aria-label="State the property is in (two letters)"
              />
            </label>
            <label className="grid">
              <span className="text-slate-600">Last day you furnished labor or materials</span>
              <input
                className="input"
                type="date"
                value={last}
                onChange={(e) => setLast(e.target.value)}
                aria-label="Last day you furnished labor or materials"
              />
            </label>
            {rule?.residential && (
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={residential}
                  onChange={(e) => setResidential(e.target.checked)}
                />
                <span>Residential: {rule.residentialMeaning}</span>
              </label>
            )}
          </div>
          {completionState && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid">
                <span className="text-slate-600">Whole project completed (if known)</span>
                <input
                  className="input"
                  type="date"
                  value={completed}
                  onChange={(e) => setCompleted(e.target.value)}
                  aria-label="Completion of the whole project"
                />
              </label>
              <label className="grid">
                <span className="text-slate-600">Notice of completion recorded on</span>
                <input
                  className="input"
                  type="date"
                  value={noc}
                  onChange={(e) => setNoc(e.target.value)}
                  aria-label="Day the owner recorded a notice of completion"
                />
              </label>
            </div>
          )}
          <div>
            <button type="submit" className="btn" disabled={save.isPending}>
              Save
            </button>
          </div>
          {save.error && <ErrorText error={save.error} />}
        </form>
        <p className="text-xs text-slate-500">
          A date lookup, not legal advice. It does not cover public jobs (payment bond claims), a
          sub-subcontractor's supplier, contract terms or holidays, and a lien also needs the
          notices your state requires and the right content and service. Confirm with a construction
          attorney or the statute before relying on it.
        </p>
      </div>
    </details>
  );
}
