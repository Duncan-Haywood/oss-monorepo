// Delays against the job's schedule: the daily reports' lost hours grouped by the activity each one
// held up (src/shared/schedule-delays.ts through GET .../schedule/delays), with the delay log as a
// PDF; and, on a change order, the log attached as the backup for the time it asks for. Nothing is
// sent and nothing decides how much time a delay earns.
import type { DelayLogDto } from "@shared/api/types";
import { DELAY_LOG_NOTE, delayTotalsText } from "@shared/schedule-delays";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { ErrorText } from "./error";

const pdfHref = (url: string, activityId: string | null) =>
  `${url}/delays.pdf${activityId ? `?activityId=${encodeURIComponent(activityId)}` : ""}`;

/** Under the job schedule: one row per activity the daily reports say was held up. */
export function ScheduleDelays({ url }: { /** `.../projects/:projectId/schedule` */ url: string }) {
  const q = useQuery({
    queryKey: ["schedule-delays", url],
    queryFn: () => api<DelayLogDto>(`${url}/delays`),
  });
  const log = q.data;
  if (q.error) return <ErrorText error={q.error} />;
  if (!log || log.dayCount === 0) {
    return (
      <p className="mt-3 text-xs text-slate-500">
        Delays: when a daily report records hours lost, pick the activity it held up there, and the
        days collect here as a delay log for a time-extension change order.
      </p>
    );
  }
  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">
          Delays from the daily reports{" "}
          <span className="font-normal text-slate-600">
            (
            {delayTotalsText({
              dayCount: log.dayCount,
              hours: log.hours,
              hoursNotStated: log.groups.reduce((s, g) => s + g.hoursNotStated, 0),
            })}
            )
          </span>
        </h3>
        <a className="link text-sm" href={pdfHref(url, null)}>
          Delay log PDF
        </a>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="th">Activity</th>
            <th className="th text-right">Days</th>
            <th className="th text-right">Hours lost</th>
            <th className="th">First and last</th>
            <th className="th" />
          </tr>
        </thead>
        <tbody>
          {log.groups.map((g) => (
            <tr key={g.activityId ?? "untied"}>
              <td className="td">{g.label}</td>
              <td className="td text-right tabular-nums">{g.dayCount}</td>
              <td className="td text-right tabular-nums">
                {g.hours}
                {g.hoursNotStated > 0 && (
                  <div className="text-xs text-slate-500">
                    {g.hoursNotStated} without hours stated
                  </div>
                )}
              </td>
              <td className="td whitespace-nowrap">
                {g.firstOn === g.lastOn ? g.firstOn : `${g.firstOn} to ${g.lastOn}`}
              </td>
              <td className="td text-right">
                {g.activityId && (
                  <a className="text-xs underline" href={pdfHref(url, g.activityId)}>
                    PDF
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-slate-500">{DELAY_LOG_NOTE}</p>
    </div>
  );
}

/**
 * In a change order's files: print the delay log (every activity, or one) and keep it with the
 * change order as backup. `base` is `.../projects/:projectId/change-orders/:coId`.
 */
export function DelayBackup({ projectBase, base }: { projectBase: string; base: string }) {
  const qc = useQueryClient();
  const scheduleUrl = `${projectBase}/schedule`;
  const q = useQuery({
    queryKey: ["schedule-delays", scheduleUrl],
    queryFn: () => api<DelayLogDto>(`${scheduleUrl}/delays`),
  });
  const [activityId, setActivityId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const attach = useMutation({
    mutationFn: () =>
      api<{ fileName: string }>(`${base}/delay-backup`, {
        method: "POST",
        body: { activityId: activityId || null, from: from || null, to: to || null },
      }),
    onSuccess: (a) => {
      setDone(`Kept ${a.fileName} with this change order.`);
      return qc.invalidateQueries({ queryKey: ["attachments", base] });
    },
  });
  const log = q.data;
  if (!log || log.dayCount === 0 || !log.canEdit) return null;
  const tied = log.groups.filter((g) => g.activityId);
  return (
    <form
      className="mt-2 flex flex-wrap items-end gap-2 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        setDone(null);
        attach.mutate();
      }}
    >
      <span className="pb-2 font-medium">Time extension backup:</span>
      <label>
        Delays on
        <select
          className="input block"
          value={activityId}
          onChange={(e) => setActivityId(e.target.value)}
        >
          <option value="">Every activity</option>
          {tied.map((g) => (
            <option key={g.activityId} value={g.activityId ?? ""}>
              {g.label} ({g.dayCount} d)
            </option>
          ))}
        </select>
      </label>
      <label>
        From
        <input
          type="date"
          className="input block"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
      </label>
      <label>
        To
        <input
          type="date"
          className="input block"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </label>
      <button
        type="submit"
        className="btn-secondary"
        disabled={attach.isPending}
        title="Prints the delay log from the daily reports and keeps it with this change order as backup"
      >
        Attach the delay log
      </button>
      {done && <span className="pb-2 text-green-700">{done}</span>}
      <ErrorText error={attach.error} />
    </form>
  );
}
