// The Miller Act 90-day notice, drafted from a federal job (services/payapps/miller-notice.ts,
// packages/lien-waivers/src/us-miller.ts). Shown inside the lien deadline panel once the job is
// marked federal and the company did not contract with the prime itself. The job, the company, the
// party it billed, the saved last day and the unpaid amount from the cash report are filled in; the
// prime's name and address are typed. Printing saves nothing. Crew plan and up, like the other
// notices.
import type { MillerNoticeDto } from "@shared/api/types";
import { formatCents } from "@shared/money";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, downloadPost } from "../lib/api";
import { ErrorText } from "./error";

const ROWS: Record<string, number> = {
  primeContractor: 3,
  claimant: 3,
  project: 2,
  furnishedTo: 2,
  workDescription: 2,
};

export function MillerNoticeDraft(props: { path: string; savedKey: string }) {
  const { path, savedKey } = props;
  const url = `${path}/notices/miller`;
  const q = useQuery({
    queryKey: ["miller-notice", url, savedKey],
    queryFn: () => api<MillerNoticeDto>(url),
  });
  const o = q.data;
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!o) return;
    setValues(Object.fromEntries(o.notice.fields.map((f) => [f.key, o.prefill[f.key] ?? ""])));
  }, [o]);

  const print = useMutation({
    mutationFn: () => {
      const fields: Record<string, string> = {};
      for (const [k, v] of Object.entries(values)) if (v.trim()) fields[k] = v.trim();
      return downloadPost(`${path}/notices/miller.pdf`, { fields }, "miller-act-notice.pdf");
    },
  });

  if (q.error) return <ErrorText error={q.error} />;
  if (!o || o.applies === "not-federal" || o.applies === "not-covered") return null;
  if (o.applies === "not-needed") return null;
  if (!o.enabled) {
    return (
      <p className="text-slate-600">
        The 90-day notice, drafted from this job and printed as a PDF, comes with lien waivers and
        notices in the Crew plan and up.
      </p>
    );
  }
  const n = o.notice;
  return (
    <div className="rounded border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          The 90-day notice to the prime · {n.citation}
          {o.noticeDueOn && <span className="font-normal"> · send by {o.noticeDueOn}</span>}
        </p>
        <button type="button" className="btn" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide the notice" : "Draft the notice"}
        </button>
      </div>
      {open && (
        <div className="mt-2 grid gap-2">
          <p>
            Send it to {n.sendTo}: the general contractor on the federal contract, not the
            subcontractor that hired you.
            {o.applies === "unsure" &&
              " Who you contracted with is not saved above: if it was the prime itself, you need no 90-day notice."}
          </p>
          <p className="text-slate-600">
            Unpaid on this job: {formatCents(o.outstandingCents)} billed and not paid
            {o.retainageHeldCents > 0
              ? `, plus ${formatCents(o.retainageHeldCents)} retainage held`
              : ""}
            . The amount below starts from their sum; correct it to what you are owed for labor and
            material on this contract (the statute asks for it with substantial accuracy).
            {!o.lastFurnishedOn && " Save the last day above, or type it below."}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {n.fields.map((f) => (
              <div key={f.key} className={f.type === "multiline" ? "sm:col-span-2" : ""}>
                <label htmlFor={`miller-${f.key}`} className="text-slate-600">
                  {f.label}
                  {f.required ? " *" : ""}
                </label>
                {f.type === "multiline" ? (
                  <textarea
                    id={`miller-${f.key}`}
                    className="input"
                    rows={ROWS[f.key] ?? 2}
                    value={values[f.key] ?? ""}
                    placeholder={f.help}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                ) : (
                  <input
                    id={`miller-${f.key}`}
                    className="input"
                    type={f.type === "date" ? "date" : "text"}
                    value={values[f.key] ?? ""}
                    title={f.help}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>
          <div>
            <button
              type="button"
              className="btn"
              disabled={print.isPending}
              onClick={() => print.mutate()}
            >
              Print the notice (PDF)
            </button>
          </div>
          {print.error && <ErrorText error={print.error} />}
          <ul className="list-disc pl-5 text-xs text-slate-600">
            {n.notes.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
