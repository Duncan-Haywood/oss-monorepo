// The getting-started checklist above the job list (src/shared/getting-started.ts). Shown until the
// required steps are done; "Hide" keeps it out of the way in this browser only.
import type { ReminderSettingDto } from "@shared/api/types";
import type { GettingStarted, GettingStartedTarget } from "@shared/getting-started";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { api, orgPath } from "../lib/api";
import { ErrorText } from "./error";

const hideKey = (orgId: string) => `payapps.getting-started.hidden.${orgId}`;

function readHidden(orgId: string) {
  try {
    return window.localStorage.getItem(hideKey(orgId)) === "1";
  } catch {
    return false;
  }
}

export function GettingStartedPanel({ orgId }: { orgId: string }) {
  const q = useQuery({
    queryKey: ["getting-started", orgId],
    queryFn: () => api<GettingStarted>(orgPath(orgId, "/getting-started")),
    // Steps are done on other pages: check again every time the Projects page opens.
    staleTime: 0,
  });
  const [hidden, setHidden] = useState(() => readHidden(orgId));
  if (!q.data || q.data.complete || hidden) return null;
  return (
    <GettingStartedView
      orgId={orgId}
      data={q.data}
      onHide={() => {
        try {
          window.localStorage.setItem(hideKey(orgId), "1");
        } catch {
          // Storage blocked: hide for this visit only.
        }
        setHidden(true);
      }}
      footer={<ReminderSwitch orgId={orgId} />}
    />
  );
}

/**
 * The member's own getting-started reminder emails, on or off: the same stop as the email's
 * one-click link, and the way to turn them back on. Shown only to owners, the only ones sent any.
 */
export function ReminderSwitch({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const key = ["getting-started-reminders", orgId];
  const q = useQuery({
    queryKey: key,
    queryFn: () => api<ReminderSettingDto>(orgPath(orgId, "/getting-started/reminders")),
  });
  const save = useMutation({
    mutationFn: (on: boolean) =>
      api<ReminderSettingDto>(orgPath(orgId, "/getting-started/reminders"), {
        method: "PUT",
        body: { on },
      }),
    onSuccess: (d) => qc.setQueryData(key, d),
  });
  if (!q.data?.sentToRole) return null;
  return (
    <div className="mt-3 border-t border-slate-200 pt-2 text-sm text-slate-600">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={q.data.on}
          disabled={save.isPending}
          onChange={(e) => save.mutate(e.target.checked)}
        />
        Email me a reminder about the next step
      </label>
      <p className="text-xs">
        At most two, on a Monday: one if no job is added, one if no application is sent. Each is
        sent once per company, so turning this back on never repeats one.
      </p>
      <ErrorText error={save.error} />
    </div>
  );
}

export function GettingStartedView({
  orgId,
  data,
  onHide,
  footer,
}: {
  orgId: string;
  data: GettingStarted;
  onHide?: () => void;
  footer?: React.ReactNode;
}) {
  const next = data.steps.find((s) => !s.done && !s.optional);
  return (
    <section className="card mb-6" aria-label="Getting started">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-semibold">Getting started</h2>
        <span className="flex items-baseline gap-3 text-sm text-slate-600">
          {data.requiredDone} of {data.requiredTotal} done
          {onHide && (
            <button type="button" className="text-xs underline" onClick={onHide}>
              Hide
            </button>
          )}
        </span>
      </div>
      <ol className="space-y-2 text-sm">
        {data.steps.map((s) => (
          <li key={s.key} className="flex gap-2">
            <span
              aria-hidden="true"
              className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                s.done
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-slate-400 text-transparent"
              }`}
            >
              ✓
            </span>
            <div>
              <p className={s.done ? "text-slate-500" : "font-medium"}>
                <span className="sr-only">{s.done ? "Done: " : "To do: "}</span>
                {s.target && !s.done ? (
                  <TargetLink orgId={orgId} target={s.target}>
                    {s.title}
                  </TargetLink>
                ) : (
                  s.title
                )}
                {s.optional && <span className="ml-2 text-xs text-slate-500">optional</span>}
                {next?.key === s.key && (
                  <span className="ml-2 rounded bg-sky-100 px-1.5 text-xs text-sky-800">next</span>
                )}
              </p>
              <p className="text-slate-600">{s.detail}</p>
            </div>
          </li>
        ))}
      </ol>
      {footer}
    </section>
  );
}

function TargetLink({
  orgId,
  target,
  children,
}: {
  orgId: string;
  target: GettingStartedTarget;
  children: React.ReactNode;
}) {
  const cls = "underline";
  switch (target.page) {
    case "projects":
      return (
        <a href="#new-project" className={cls}>
          {children}
        </a>
      );
    case "project":
      return (
        <Link
          to="/orgs/$orgId/projects/$projectId"
          params={{ orgId, projectId: target.projectId }}
          className={cls}
        >
          {children}
        </Link>
      );
    case "pay-app":
      return (
        <Link
          to="/orgs/$orgId/projects/$projectId/pay-apps/$payAppId"
          params={{ orgId, projectId: target.projectId, payAppId: target.payAppId }}
          className={cls}
        >
          {children}
        </Link>
      );
    case "team":
      return (
        <Link to="/orgs/$orgId/team" params={{ orgId }} className={cls}>
          {children}
        </Link>
      );
    case "quickbooks":
      return (
        <Link to="/orgs/$orgId/quickbooks" params={{ orgId }} className={cls}>
          {children}
        </Link>
      );
    case "billing":
      return (
        <Link to="/orgs/$orgId/billing" params={{ orgId }} className={cls}>
          {children}
        </Link>
      );
  }
}
