// The numbers to type into a GC's Procore subcontractor invoice, from this pay application
// (src/shared/gc-export/procore-invoice.ts). Read only: nothing here changes the pay app. When the job
// has a saved Procore SOV placement, the sheet is totalled by the GC's SOV positions
// (src/shared/gc-export/procore-placement.ts), the lines one click away.
import type { PayAppDetailDto, ProjectDetailDto } from "@shared/api/types";
import {
  PROCORE_INVOICE_HELP_URL,
  type ProcoreInvoiceRow,
  procoreInvoiceSheet,
} from "@shared/gc-export/procore-invoice";
import {
  invoiceByPosition,
  type ProcoreInvoiceByPosition,
} from "@shared/gc-export/procore-placement";
import { formatCents } from "@shared/money";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, projectPath } from "../lib/api";

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Copy({ cents, label }: { cents: number; label: string }) {
  const [done, setDone] = useState(false);
  const text = (cents / 100).toFixed(2);
  return (
    <button
      type="button"
      className="ml-1 text-xs underline"
      aria-label={`Copy ${label}`}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? "copied" : "copy"}
    </button>
  );
}

function Amounts({
  r,
  label,
}: {
  r: Pick<ProcoreInvoiceRow, "workThisPeriodCents" | "storedNowCents" | "newStoredCents">;
  label: string;
}) {
  return (
    <>
      <td className="td text-right">
        {formatCents(r.workThisPeriodCents)}
        <Copy cents={r.workThisPeriodCents} label={`work this period for ${label}`} />
      </td>
      <td className="td text-right">
        {formatCents(r.storedNowCents)}
        <Copy cents={r.storedNowCents} label={`materials stored for ${label}`} />
      </td>
      <td className="td text-right">
        {r.newStoredCents === null ? (
          <span className="text-amber-800">check</span>
        ) : (
          <>
            {formatCents(r.newStoredCents)}
            <Copy cents={r.newStoredCents} label={`new materials stored for ${label}`} />
          </>
        )}
      </td>
    </>
  );
}

function ByPosition({ g }: { g: ProcoreInvoiceByPosition }) {
  const extra = (title: string, rows: ProcoreInvoiceRow[]) =>
    rows.length === 0 ? null : (
      <>
        <tr>
          <td className="td pt-3 font-medium" colSpan={6}>
            {title}
          </td>
        </tr>
        {rows.map((r) => (
          <tr key={r.sovLineId}>
            <td className="td">{r.description}</td>
            <td className="td text-right">{formatCents(r.scheduledValueCents)}</td>
            <Amounts r={r} label={r.description} />
            <td className="td text-right">
              {r.percentComplete === null ? "" : `${r.percentComplete}%`}
            </td>
          </tr>
        ))}
      </>
    );
  return (
    <>
      {g.positions.map((p) => {
        const label = `position ${p.position}`;
        return (
          <tr key={`pos-${p.position}`}>
            <td className="td">
              <span className="font-medium">
                {p.position}
                {p.description ? ` ${p.description}` : ""}
              </span>
              {p.lines.length > 0 ? (
                <span className="block text-xs text-slate-500">
                  {p.lines.map((r) => r.description).join("; ")}
                </span>
              ) : (
                <span className="block text-xs text-slate-500">none of your lines</span>
              )}
            </td>
            <td className="td text-right">{formatCents(p.scheduledValueCents)}</td>
            <Amounts r={p} label={label} />
            <td className="td text-right">
              {p.percentComplete === null ? "" : `${p.percentComplete}%`}
            </td>
          </tr>
        );
      })}
      {extra(
        "Change orders (Procore lists commitment change orders as their own lines)",
        g.changeOrders,
      )}
      {extra("Not placed under a GC position", g.unplaced)}
    </>
  );
}

export function ProcoreInvoicePanel({
  orgId,
  project,
  app,
}: {
  orgId: string;
  project: ProjectDetailDto;
  app: PayAppDetailDto;
}) {
  const [open, setOpen] = useState(false);
  const previous = project.payApps.find((p) => p.number === app.number - 1) ?? null;
  const prev = useQuery({
    queryKey: ["pay-app", orgId, project.id, previous?.id],
    queryFn: () =>
      api<PayAppDetailDto>(projectPath(orgId, project.id, `/pay-apps/${previous?.id}`)),
    enabled: open && previous !== null,
  });
  const coLines = useMemo(
    () => new Set(project.sovLines.filter((l) => l.changeOrderId !== null).map((l) => l.id)),
    [project.sovLines],
  );
  const ready = previous === null || prev.data !== undefined;
  const sheet = useMemo(
    () =>
      ready
        ? procoreInvoiceSheet({
            lines: app.computed.lines,
            previousLines: previous === null ? null : (prev.data?.computed.lines ?? []),
            changeOrderLineIds: coLines,
            openedMidJob: project.opening !== null,
          })
        : null,
    [ready, app.computed.lines, previous, prev.data, coLines, project.opening],
  );

  const placement = project.procoreSsov ?? null;
  const [byLine, setByLine] = useState(false);
  const grouped = useMemo(
    () => (sheet && placement ? invoiceByPosition(sheet, placement) : null),
    [sheet, placement],
  );
  const showGrouped = grouped !== null && !byLine;

  if (!open)
    return (
      <section className="card">
        <button
          type="button"
          className="btn-secondary"
          title="The amounts to enter on the GC's Procore invoice for this pay application"
          onClick={() => setOpen(true)}
        >
          Procore invoice sheet
        </button>
      </section>
    );

  return (
    <section className="card overflow-x-auto">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Procore invoice sheet</h2>
        <button type="button" className="text-sm underline" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        When the GC bills through Procore, you also type this pay application into their Procore
        invoice (the commitment, Create Invoice), line by line; Procore has no file import for it.
        These are the amounts from this application, so the two match. Enter{" "}
        <em>Work Completed This Period</em> from the first column. For stored materials, Procore's
        older form asks for <em>Materials Presently Stored</em>; the newer one asks for{" "}
        <em>New Materials Stored</em>, only materials added this period, and shows it only when the
        GC bills stored materials separately.{" "}
        <a className="underline" href={PROCORE_INVOICE_HELP_URL} target="_blank" rel="noreferrer">
          Procore's instructions
        </a>
      </p>
      {app.status === "draft" && (
        <p className="mt-2 text-sm text-amber-800">
          This application is still a draft: save your changes first, as the sheet shows the saved
          figures.
        </p>
      )}
      {previous !== null && prev.isError && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          Could not load application #{previous.number} to compare stored materials with.
        </p>
      )}
      {!sheet ? (
        !prev.isError && <p className="mt-2 text-sm">Loading…</p>
      ) : (
        <>
          {grouped && (
            <p className="mt-2 text-sm">
              {showGrouped
                ? `Totalled by the GC's ${grouped.positions.length} Procore SOV position${grouped.positions.length === 1 ? "" : "s"}, as placed on the job page${placement?.savedOn ? ` (saved ${placement.savedOn})` : ""}: enter one amount per position. `
                : "By your own lines. "}
              <button type="button" className="underline" onClick={() => setByLine(!byLine)}>
                {showGrouped ? "Show your lines instead" : "Total by the GC's SOV positions"}
              </button>
            </p>
          )}
          <table className="mt-3 w-full min-w-[800px] text-sm">
            <thead>
              <tr>
                <th className="th text-left">{showGrouped ? "GC SOV position" : "Line"}</th>
                <th className="th text-right">Scheduled value</th>
                <th className="th text-right">Work Completed This Period</th>
                <th className="th text-right">Materials Presently Stored</th>
                <th className="th text-right">New Materials Stored</th>
                <th className="th text-right">% complete</th>
              </tr>
            </thead>
            <tbody>
              {showGrouped && grouped && <ByPosition g={grouped} />}
              {!showGrouped &&
                sheet.rows.map((r) => (
                  <tr key={r.sovLineId}>
                    <td className="td">
                      {r.description}
                      {r.changeOrder && (
                        <span className="ml-1 text-xs text-slate-500">(change order)</span>
                      )}
                    </td>
                    <td className="td text-right">{formatCents(r.scheduledValueCents)}</td>
                    <td className="td text-right">
                      {formatCents(r.workThisPeriodCents)}
                      <Copy
                        cents={r.workThisPeriodCents}
                        label={`work this period for ${r.description}`}
                      />
                    </td>
                    <td className="td text-right">
                      {formatCents(r.storedNowCents)}
                      <Copy
                        cents={r.storedNowCents}
                        label={`materials stored for ${r.description}`}
                      />
                    </td>
                    <td className="td text-right">
                      {r.newStoredCents === null ? (
                        <span className="text-amber-800">check</span>
                      ) : (
                        <>
                          {formatCents(r.newStoredCents)}
                          <Copy
                            cents={r.newStoredCents}
                            label={`new materials stored for ${r.description}`}
                          />
                        </>
                      )}
                    </td>
                    <td className="td text-right">
                      {r.percentComplete === null ? "" : `${r.percentComplete}%`}
                    </td>
                  </tr>
                ))}
              <tr className="font-semibold">
                <td className="td">Total</td>
                <td className="td" />
                <td className="td text-right">{formatCents(sheet.totals.workThisPeriodCents)}</td>
                <td className="td text-right">{formatCents(sheet.totals.storedNowCents)}</td>
                <td className="td text-right">
                  {sheet.totals.newStoredCents === null
                    ? "check"
                    : formatCents(sheet.totals.newStoredCents)}
                </td>
                <td className="td" />
              </tr>
            </tbody>
          </table>
          {showGrouped && grouped && grouped.unplaced.length > 0 && (
            <p className="mt-2 text-sm text-amber-800">
              {grouped.unplaced.length === 1
                ? "One of your lines is"
                : `${grouped.unplaced.length} of your lines are`}{" "}
              not placed under a GC position (added since the placement was saved, or left out
              then). Place {grouped.unplaced.length === 1 ? "it" : "them"} with the Procore
              subcontractor SOV on the job page and save again, or add{" "}
              {grouped.unplaced.length === 1 ? "its" : "their"} amounts to the right position by
              hand.
            </p>
          )}
          {showGrouped && grouped && grouped.amountMismatches.length > 0 && (
            <p className="mt-2 text-sm text-amber-800">
              Your scheduled values under{" "}
              {grouped.amountMismatches
                .map(
                  (m) =>
                    `position ${m.position} (${formatCents(m.scheduledValueCents)} against the GC's ${formatCents(m.gcAmountCents ?? 0)})`,
                )
                .join(", ")}{" "}
              do not add up to the GC's amount. Procore checks a position's billing against its own
              amount, so settle the difference with the GC before you submit.
            </p>
          )}
          {sheet.storedFell.length > 0 && (
            <p className="mt-2 text-sm text-amber-800">
              Stored materials went down on {sheet.storedFell.map((r) => r.description).join(", ")}:
              materials stored earlier were installed and are in this period's work. Any delivered
              in the same period can't be told apart from the balance, so enter New Materials Stored
              for {sheet.storedFell.length === 1 ? "that line" : "those lines"} from your delivery
              records, and ask the GC how their form wants installed materials shown.
            </p>
          )}
          {sheet.noPreviousStored && (
            <p className="mt-2 text-sm text-amber-800">
              This job's earlier applications were made elsewhere, so the materials stored on the
              last of them aren't known here: enter New Materials Stored from your delivery records
              this month.
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            {placement
              ? "If the GC's invoice lists your detail lines (their Procore has the subcontractor SOV turned on), show your lines instead. "
              : "The lines are this job's schedule of values. If the GC's invoice lists their own SOV positions instead of your detail lines, place your lines under them once with the Procore subcontractor SOV on the job page and save it: this sheet then totals by position. "}
            Retainage is set on the GC's side in Procore; compare their invoice total with line 8
            here before you submit.
          </p>
          <button
            type="button"
            className="btn-secondary mt-3"
            onClick={() =>
              download(
                `pay-app-${app.number}-procore-invoice-sheet${showGrouped ? "-by-position" : ""}.csv`,
                showGrouped && grouped ? grouped.csv : sheet.csv,
              )
            }
          >
            Download as CSV (a worksheet, not a Procore import)
          </button>
        </>
      )}
    </section>
  );
}
