// "Hours from PayApps timesheets" on the certified payroll page: the job's hours for the week from
// the company's own crew timesheets (GET .../certified-payroll/timesheet-hours), put on the form the
// same way a time report is (fillFromTimesheet). Nothing is saved: the form stays in this browser
// until it is printed, as with the rest of the page.

import { formatHours } from "@shared/certified-payroll";
import {
  type FillRow,
  type FillSummary,
  type FillWorker,
  fillFromTimesheet,
} from "@shared/certified-payroll-import";
import type { TimesheetCertifiedHours } from "@shared/timesheet-certified";
import { useState } from "react";
import { api, errorMessage, projectPath } from "../lib/api";

export function TimesheetFill<R extends FillRow, W extends FillWorker<R>>(props: {
  orgId: string;
  projectId: string;
  weekEnding: string;
  workers: readonly W[];
  make: { worker: () => W; row: () => R };
  onFill: (workers: W[], summary: FillSummary) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "warn" | "error"; text: string } | null>(
    null,
  );
  const validWeek = /^\d{4}-\d{2}-\d{2}$/.test(props.weekEnding);

  async function load() {
    setBusy(true);
    setMessage(null);
    try {
      const h = await api<TimesheetCertifiedHours>(
        projectPath(
          props.orgId,
          props.projectId,
          `/certified-payroll/timesheet-hours?weekEnding=${encodeURIComponent(props.weekEnding)}`,
        ),
      );
      if (h.entries.length === 0) {
        setMessage({
          kind: "warn",
          text: `No hours on this job in the timesheets for the seven days ending ${h.weekEnding}. Nothing was changed.`,
        });
        return;
      }
      const { workers, summary } = fillFromTimesheet(props.workers, h.entries, props.make);
      props.onFill(workers, summary);
      const st = h.entries.reduce((a, e) => a + e.st.reduce((x, y) => x + y, 0), 0);
      const ot = h.entries.reduce((a, e) => a + e.ot.reduce((x, y) => x + y, 0), 0);
      const parts = [
        `Hours filled from timesheets: ${formatHours(st)} hours straight time and ${formatHours(ot)} overtime`,
        `${summary.matched} worker${summary.matched === 1 ? "" : "s"} matched, ${summary.added} added`,
      ];
      if (summary.rowsAdded > 0) parts.push(`${summary.rowsAdded} classification rows added`);
      let text = `${parts.join("; ")}.`;
      if (summary.added > 0) text += " Type the ID, address and rates for the workers added.";
      if (!h.aligned)
        text += ` The payroll week is not one of your timesheet workweeks, so the workweeks ending ${h.workweeksRead.join(" and ")} were read; overtime is as each workweek counted it.`;
      if (h.noTrade.length > 0)
        text += ` No trade on the crew list for ${h.noTrade.join(", ")}: type the classification.`;
      if (h.otherJobs.length > 0)
        text += ` Also worked other jobs this week: ${h.otherJobs
          .map((o) => `${o.name} ${formatHours(o.hundredths)} h`)
          .join(", ")}. Gross for all work must include that pay.`;
      if (summary.noHours.length > 0)
        text += ` No timesheet hours on this job for ${summary.noHours.join(", ")}: their hours are now zero; remove them if they did not work this week.`;
      setMessage({ kind: "ok", text });
    } catch (e) {
      setMessage({ kind: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn"
          disabled={busy || !validWeek}
          onClick={() => void load()}
        >
          {busy ? "Reading timesheets…" : "Fill hours from PayApps timesheets"}
        </button>
        <span className="text-xs text-slate-500">
          The hours your crew entered on this job on{" "}
          <a href={`/orgs/${encodeURIComponent(props.orgId)}/timesheets`} className="underline">
            Timesheets
          </a>{" "}
          for the week ending {props.weekEnding || "(pick a date)"}, with the overtime the timesheet
          counted (past 40 in the workweek, every job). Replaces the hours typed for those workers.
        </span>
      </div>
      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`text-sm ${
            message.kind === "ok"
              ? "text-green-800"
              : message.kind === "warn"
                ? "text-amber-800"
                : "text-red-700"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
