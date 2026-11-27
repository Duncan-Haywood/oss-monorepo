// Texas notices of claim for unpaid labor or materials (Tex. Prop. Code § 53.056), under the notice
// panel when the job's state is TX. The company says once whether the job is a residential
// construction project (saved with the job; the cash page and weekly email then remind); each unpaid
// application is listed with the 15th-of-the-month date that governs it, a button that puts its
// unpaid amount on the notice above, and a place to record the day and the way the notice went.
// Recording lands in the job history. Crew plan and up, like the notice itself.
import type { TxNoticeLogDto } from "@shared/api/types";
import { formatCents } from "@shared/money";
import { monthName } from "@shared/tx-notice-claims";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { ErrorText } from "./error";

const today = () => new Date().toISOString().slice(0, 10);

export function TxNoticeLog(props: {
  base: string;
  log: TxNoticeLogDto;
  /** Put an application's unpaid amount and number on the notice being filled in above. */
  onUse: (claim: { amount: string; number: number }) => void;
}) {
  const { base, log, onUse } = props;
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["notices"] });
  const label = (id: string | null, list: { id: string; label: string }[]) =>
    list.find((x) => x.id === id)?.label ?? id ?? "";

  const saveKind = useMutation({
    mutationFn: (kind: string | null) =>
      api(`${base}/notices/tx/kind`, { method: "PUT", body: { kind } }),
    onSuccess: refresh,
  });
  const [drafts, setDrafts] = useState<Record<string, { sentOn: string; method: string }>>({});
  const draftOf = (id: string) => drafts[id] ?? { sentOn: today(), method: "certified-mail" };
  const record = useMutation({
    mutationFn: (v: { payAppId: string; sent: { sentOn: string; method: string } | null }) =>
      api(`${base}/notices/tx/pay-apps/${v.payAppId}`, { method: "PUT", body: { sent: v.sent } }),
    onSuccess: refresh,
  });

  return (
    <div className="grid gap-3 border-t pt-3">
      <p className="font-medium">Notices of claim by month (Texas)</p>
      <label>
        <span className="block text-slate-600">
          Is this job a residential construction project (§ 53.001(10))?
        </span>
        <select
          className="input"
          value={log.kind ?? ""}
          disabled={saveKind.isPending}
          onChange={(e) => saveKind.mutate(e.target.value || null)}
        >
          <option value="">Off: no dates or reminders for this job</option>
          {log.kinds.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      {saveKind.error && <ErrorText error={saveKind.error} />}
      {!log.kind && (
        <p className="text-slate-600">
          Turn it on and every unpaid application on this job gets its notice date: the 15th of the
          third month after the work (the second on a residential project), and the cash page and
          the weekly email remind you 30 days ahead until a notice is recorded or the application is
          paid.
        </p>
      )}
      {log.kind && log.claims.length === 0 && (
        <p className="text-slate-600">
          No submitted or certified application on this job is unpaid, so no notice of claim is due.
          Dates appear here as soon as one is.
        </p>
      )}
      {log.kind && log.claims.length > 0 && (
        <>
          <p className="text-slate-600">
            Each date is for the first month the application's period covers, so one notice by then
            claims the whole application. A date on a Saturday or Sunday moves to the Monday (§
            53.003(e)); PayApps does not track Texas legal holidays.
          </p>
          <ul className="grid gap-2">
            {log.claims.map((c) => {
              const d = draftOf(c.payAppId);
              return (
                <li
                  key={c.payAppId}
                  className={`rounded border p-2 ${c.status === "late" ? "border-red-300" : ""}`}
                >
                  <p className="font-medium">
                    Application #{c.number}, {c.periodFrom} to {c.periodTo}:{" "}
                    {formatCents(c.unpaidCents)} unpaid
                  </p>
                  <p>
                    Work from {monthName(c.month)}: send by <strong>{c.dueOn}</strong>
                    {c.weekendExtendedTo
                      ? ` (a weekend day; the statute allows ${c.weekendExtendedTo})`
                      : ""}
                    {c.status === "sent"
                      ? `. Sent ${c.sentOn}, ${label(c.method, log.methods).split(" (")[0]?.toLowerCase()}.`
                      : c.status === "late"
                        ? ". The date has passed and no notice is recorded."
                        : c.daysLeft === 0
                          ? ", today."
                          : `, ${c.daysLeft} days from now.`}
                  </p>
                  <div className="mt-1 flex flex-wrap items-end gap-3">
                    <button
                      type="button"
                      className="link"
                      onClick={() =>
                        onUse({ amount: formatCents(c.unpaidCents), number: c.number })
                      }
                    >
                      Put this amount on the notice
                    </button>
                    {c.status === "sent" ? (
                      <button
                        type="button"
                        className="link text-red-700"
                        disabled={record.isPending}
                        onClick={() => {
                          if (window.confirm("Clear the record of this notice?"))
                            record.mutate({ payAppId: c.payAppId, sent: null });
                        }}
                      >
                        Clear record
                      </button>
                    ) : (
                      <>
                        <label>
                          <span className="block text-slate-600">Sent on</span>
                          <input
                            className="input w-44"
                            type="date"
                            value={d.sentOn}
                            onChange={(e) =>
                              setDrafts((x) => ({
                                ...x,
                                [c.payAppId]: { ...d, sentOn: e.target.value },
                              }))
                            }
                          />
                        </label>
                        <label>
                          <span className="block text-slate-600">How (§ 53.003(b))</span>
                          <select
                            className="input"
                            value={d.method}
                            onChange={(e) =>
                              setDrafts((x) => ({
                                ...x,
                                [c.payAppId]: { ...d, method: e.target.value },
                              }))
                            }
                          >
                            {log.methods.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          className="btn"
                          disabled={record.isPending || !d.sentOn}
                          onClick={() => record.mutate({ payAppId: c.payAppId, sent: d })}
                        >
                          Record as sent
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {record.error && <ErrorText error={record.error} />}
        </>
      )}
    </div>
  );
}
