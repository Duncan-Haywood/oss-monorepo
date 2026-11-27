// The history of a pay application, of every application on a job, of the job itself (terms,
// schedule of values, opening balance, change orders, RFIs) or of one change order: who did what, and
// when, newest first.
// Read-only; the rows are written by the Worker after each change (src/shared/pay-app-history.ts,
// src/shared/job-history.ts). Loaded when opened, and again whenever `version` changes (the
// page passes the time its pay-app data last changed).
import type { JobEventDto, PayAppEventDto } from "@shared/api/types";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { ErrorText } from "./error";

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function HistoryPanel(props: {
  /**
   * `.../pay-apps/:payAppId` for one application, `.../pay-apps` for every application on the job,
   * the job itself for its terms, schedule of values, opening balance and change orders.
   */
  base: string;
  title: string;
  version?: number;
  /** Offer the CSV download (`${base}/history.csv`). */
  csv?: boolean;
  /** Start open (a panel the user just asked for, such as a change order's row). */
  initiallyOpen?: boolean;
}) {
  const { base, title, version, csv } = props;
  const [open, setOpen] = useState(props.initiallyOpen ?? false);
  const q = useQuery({
    queryKey: ["pay-app-history", base, version],
    queryFn: () => api<{ items: (PayAppEventDto | JobEventDto)[] }>(`${base}/history`),
    enabled: open,
  });
  const items = q.data?.items ?? [];
  return (
    <details className="card" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer font-semibold">{title}</summary>
      <div className="mt-2 space-y-2">
        <div className="flex gap-3 text-sm">
          <button type="button" className="link" onClick={() => void q.refetch()}>
            Refresh
          </button>
          {csv && (
            <a className="link" href={`${base}/history.csv`}>
              Download CSV
            </a>
          )}
        </div>
        <ErrorText error={q.error} />
        {q.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
        {q.isSuccess && items.length === 0 && (
          <p className="text-sm text-slate-500">
            Nothing recorded yet. Changes made before the history started are not listed.
          </p>
        )}
        {items.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="th">When</th>
                <th className="th">What happened</th>
                <th className="th">By</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id}>
                  <td className="td whitespace-nowrap">{when(e.at)}</td>
                  <td className="td">{e.text}</td>
                  <td className="td">
                    {e.actor ? e.actor.name || e.actor.email : "(deleted user)"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </details>
  );
}
