// The job's preliminary notice of right to lien, where the state's statute prescribes one
// (California's §§ 8102 and 8202 for private works and Wyoming's § 29-10-101(a) today, from
// packages/lien-waivers). The values come from the job and the company; the user checks them, adds
// what the job does not know (the work, the legal description) and prints the notice (Wyoming's
// with the blank lien waiver form it says is attached). Printing saves nothing; for California the
// notices given are recorded below it (ca-notice-log.tsx). Crew plan and up, like lien waivers.
import type { NoticeOverviewDto } from "@shared/api/types";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, downloadPost } from "../lib/api";
import { CaNoticeLog } from "./ca-notice-log";
import { ErrorText } from "./error";

const STATE_NAMES: Record<string, string> = { CA: "California", WY: "Wyoming" };

export function LienNoticesPanel(props: { orgId: string; base: string }) {
  const { orgId, base } = props;
  const [state, setState] = useState("");
  const url = `${base}/notices${state.length === 2 ? `?state=${state}` : ""}`;
  const q = useQuery({ queryKey: ["notices", url], queryFn: () => api<NoticeOverviewDto>(url) });
  const o = q.data;
  const notice = o?.notices[0];
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!notice || !o) return;
    setValues(Object.fromEntries(notice.fields.map((f) => [f.key, o.prefill[f.key] ?? ""])));
  }, [notice, o]);

  const print = useMutation({
    mutationFn: () => {
      if (!notice) throw new Error("Enter the job's state first");
      const fields: Record<string, string> = {};
      for (const f of notice.fields) {
        const v = values[f.key]?.trim();
        if (v) fields[f.key] = v;
      }
      return downloadPost(
        `${base}/notices/notice.pdf`,
        { state, formId: notice.id, fields },
        `preliminary-notice-${state}.pdf`,
      );
    },
  });

  const supported = (o?.states ?? []).map((s) => STATE_NAMES[s] ?? s).join(", ");
  return (
    <details className="card max-w-3xl">
      <summary className="cursor-pointer font-semibold">
        Preliminary notice of right to lien
      </summary>
      <div className="mt-2 grid gap-3 text-sm">
        <p className="text-slate-600">
          Some states set the wording or the contents of the notice a subcontractor or supplier
          sends the property's owner early in a job. PayApps prints it where the statute's text is
          encoded
          {supported ? ` (${supported} today)` : ""}.
        </p>
        {q.error && <ErrorText error={q.error} />}
        {o && !o.enabled && (
          <p>
            Preliminary notices come with lien waivers in the Crew plan and up.{" "}
            <Link className="link" to="/orgs/$orgId/billing" params={{ orgId }}>
              See plans
            </Link>
          </p>
        )}
        {o?.enabled && (
          <label>
            <span className="text-slate-600">Job's state</span>{" "}
            <input
              className="input w-20 uppercase"
              maxLength={2}
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase())}
              aria-label="Job's state for the notice (two letters)"
            />
          </label>
        )}
        {o?.enabled && o.state && !notice && (
          <p>
            PayApps has no statutory preliminary notice for {o.state}. Check that state's lien law
            for whether one is required and its form.
          </p>
        )}
        {o?.enabled && notice && (
          <>
            <div>
              <p className="font-medium">
                {notice.title} · {notice.citation}
              </p>
              <p>
                Send it to {notice.sendTo}
                {o.ownerName
                  ? ` (the owner on this job: ${o.ownerName}; check the county record)`
                  : ""}
                .
              </p>
              {notice.notes.map((n) => (
                <p key={n} className="text-xs text-slate-600">
                  {n}
                </p>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {notice.fields.map((f) => (
                <div key={f.key} className={f.type === "multiline" ? "sm:col-span-2" : ""}>
                  <label htmlFor={`notice-${f.key}`} className="text-slate-600">
                    {f.label}
                    {f.required ? " *" : ""}
                  </label>
                  {f.type === "multiline" ? (
                    <textarea
                      id={`notice-${f.key}`}
                      className="input"
                      rows={
                        [
                          "claimantContact",
                          "ownerNameAddress",
                          "directContractor",
                          "lender",
                        ].includes(f.key)
                          ? 3
                          : 2
                      }
                      value={values[f.key] ?? ""}
                      placeholder={f.help}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    />
                  ) : (
                    <input
                      id={`notice-${f.key}`}
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
                Print notice (PDF)
              </button>
            </div>
            {print.error && <ErrorText error={print.error} />}
            {o.ca && <CaNoticeLog base={base} log={o.ca} />}
          </>
        )}
        <p className="text-xs text-slate-500">
          Not legal advice. The statute's own wording is copied word for word; whether and when you
          must send a notice, and how, depends on the state and the job, so check with counsel.
        </p>
      </div>
    </details>
  );
}
