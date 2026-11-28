// Import an existing gauge list: a shop that keeps its calibration list in Excel (or this register's
// own CSV export) chooses the file, previews which gauges would be added, with each one's interval and
// last calibration, and applies it. A workbook is read here in the browser and only the chosen sheet is
// sent as CSV; the server reads that text (src/shared/gauges-import.ts, services/calibration/import.ts).
// The preview works on every plan; adding needs Level 2 + Quality.
import {
  CAL_PERFORMER_LABEL,
  type CalPerformer,
  GAUGE_KIND_LABEL,
  GAUGE_STATUS_LABEL,
  type GaugeKind,
  type GaugeStatus,
} from "@shared/calibration";
import { gridToCsv, looksLikeWorkbook } from "@shared/controls/sheet-import";
import { type GaugeColumnKind, gaugeRowsIn } from "@shared/gauges-import";
import { readXlsx } from "@shared/xlsx";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { btnCls, btnGhostCls, Card, ErrorText } from "../ui";

export interface GaugeImportPreview {
  columns: Record<GaugeColumnKind, string | null>;
  dates: { order: "mdy" | "dmy"; source: "chosen" | "detected" | "default"; numeric: number };
  changes: {
    line: number;
    tag: string;
    description: string;
    kind: GaugeKind;
    kindSource: "file" | "description" | "default";
    status: GaugeStatus;
    intervalMonths: number | null;
    intervalSource: "file" | "due" | null;
    calibration: {
      calibratedOn: string;
      asFound: "in_tolerance" | "out_of_tolerance";
      performer: CalPerformer;
      performedBy: string;
      dueOn: string | null;
      resultSource: "file" | "statement";
    } | null;
  }[];
  alreadyListed: number;
  needResult: number;
  needPerformer: number;
  issues: { line: number | null; message: string }[];
  existing: number;
  max: number;
  applied: boolean;
}

const COLUMN_LABEL: Record<GaugeColumnKind, string> = {
  tag: "Gauge id",
  description: "Description",
  kind: "Kind",
  manufacturer: "Manufacturer",
  serial: "Serial",
  range: "Range",
  location: "Location",
  owner: "Owner",
  assignedTo: "Assigned to",
  status: "Status",
  interval: "Interval",
  lastCalibratedOn: "Last calibrated",
  dueOn: "Due",
  calibratedBy: "Calibrated by",
  result: "Result",
  certificateNo: "Certificate",
  traceability: "Traceability",
  method: "Method",
  notes: "Notes",
};

interface SheetOption {
  name: string;
  csv: string;
  rows: number;
}

interface Options {
  lastCalPassed: boolean;
  performerDefault: CalPerformer | null;
  dateOrder?: "mdy" | "dmy";
}

export function GaugeImport({
  orgId,
  today,
  canAdd,
  onUpgrade,
  onClose,
}: {
  orgId: string;
  today: string;
  /** On the quality plan: false shows the preview with a note instead of the import button. */
  canAdd: boolean;
  onUpgrade?: () => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [sheets, setSheets] = useState<SheetOption[] | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [opts, setOpts] = useState<Options>({ lastCalPassed: false, performerDefault: null });
  const sheetNote = sheets ? ` (${sheets[sheetIdx]?.name ?? "sheet"})` : "";
  const run = useMutation({
    mutationFn: (v: Options & { apply: boolean; csv: string | null }) =>
      api<GaugeImportPreview>(`/api/orgs/${orgId}/gauges/import`, { method: "POST", json: v }),
    onSuccess: (p) => {
      if (p.applied) qc.invalidateQueries({ queryKey: ["gauges", orgId] });
    },
  });
  const ask = (apply: boolean, next: Options = opts) => run.mutate({ apply, csv, ...next });
  const change = (patch: Partial<Options>) => {
    const next = { ...opts, ...patch };
    setOpts(next);
    if (run.data && !run.data.applied) ask(false, next);
  };
  const preview = run.data;
  const rowWord = sheets ? "Row" : "Line";
  const n = preview?.changes.length ?? 0;
  const withCal = preview?.changes.filter((c) => c.calibration).length ?? 0;
  const summary = `${n} gauge${n === 1 ? "" : "s"}, ${withCal} with a last calibration`;
  const overCap = preview ? preview.existing + n > preview.max : false;
  return (
    <Card
      title="Import a gauge list from a spreadsheet"
      actions={
        <button type="button" className={btnGhostCls} onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="space-y-3 text-sm text-stone-800">
        <p>
          Choose the gauge or calibration list you keep now (.xlsx) or a CSV, such as this
          register's own export. A workbook is read in this browser and only the sheet you pick is
          sent. Each row needs a gauge id and a description, and a gauge in use needs its
          calibration interval (or a last calibration and due date a whole number of months apart).
          The kind, serial, manufacturer, range, location, owner, status, last calibration, due
          date, who calibrated it, the result, the certificate and what it traces to are read when
          there. Ids already on this list are left as they are.
        </p>
        <p className="text-stone-600">
          A last calibration is recorded only when its result is known, from a result column or from
          your statement below, so the list never shows a calibration nobody can vouch for. Without
          one the gauge comes in as never calibrated until you record its certificate.
        </p>
        <input
          type="file"
          accept=".xlsx,.csv,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="Gauge list file"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            run.reset();
            setCsv(null);
            setSheets(null);
            setFileError(null);
            if (!file) return;
            setFileName(file.name);
            const bytes = new Uint8Array(await file.arrayBuffer());
            if (!looksLikeWorkbook(bytes)) {
              setCsv(new TextDecoder().decode(bytes));
              return;
            }
            try {
              const options = (await readXlsx(bytes)).map((s) => {
                const text = gridToCsv(s.grid);
                return { name: s.name, csv: text, rows: gaugeRowsIn(text, today) };
              });
              let best = 0;
              options.forEach((o, i) => {
                if (o.rows > (options[best]?.rows ?? 0)) best = i;
              });
              setSheets(options);
              setSheetIdx(best);
              setCsv(options[best]?.csv ?? null);
            } catch (err) {
              setFileError(err instanceof Error ? err.message : "This workbook could not be read.");
            }
          }}
        />
        {fileError && (
          <p role="alert" className="text-red-700">
            {fileError}
          </p>
        )}
        {sheets && sheets.length > 1 && (
          <label className="flex flex-wrap items-center gap-2">
            <span>Sheet</span>
            <select
              className="rounded border border-stone-300 px-2 py-1"
              value={sheetIdx}
              onChange={(e) => {
                const idx = Number(e.target.value);
                run.reset();
                setSheetIdx(idx);
                setCsv(sheets[idx]?.csv ?? null);
              }}
            >
              {sheets.map((s, i) => (
                <option key={s.name} value={i}>
                  {s.name} ({s.rows} gauge{s.rows === 1 ? "" : "s"})
                </option>
              ))}
            </select>
          </label>
        )}
        {preview && preview.dates.numeric > 0 && (
          <label className="flex flex-wrap items-center gap-2">
            <span>Dates like 03/04/2026 are</span>
            <select
              aria-label="Date order"
              className="rounded border border-stone-300 px-2 py-1"
              value={preview.dates.order}
              onChange={(e) => change({ dateOrder: e.target.value as "mdy" | "dmy" })}
            >
              <option value="mdy">month/day/year</option>
              <option value="dmy">day/month/year</option>
            </select>
            {preview.dates.source === "detected" && (
              <span className="text-xs text-stone-500">(read from the file's own dates)</span>
            )}
          </label>
        )}
        {preview && !preview.applied && (preview.needResult > 0 || opts.lastCalPassed) && (
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={opts.lastCalPassed}
              onChange={(e) => change({ lastCalPassed: e.target.checked })}
            />
            <span>
              The last calibrations this list gives without a result were all found in tolerance and
              went back into use. (Each record says it was stated at import.)
            </span>
          </label>
        )}
        {preview && !preview.applied && (preview.needPerformer > 0 || opts.performerDefault) && (
          <label className="flex flex-wrap items-center gap-2">
            <span>Rows that do not say who calibrated them were calibrated</span>
            <select
              aria-label="Calibrated by"
              className="rounded border border-stone-300 px-2 py-1"
              value={opts.performerDefault ?? ""}
              onChange={(e) =>
                change({ performerDefault: (e.target.value || null) as CalPerformer | null })
              }
            >
              <option value="">not stated (leave those calibrations out)</option>
              <option value="in_house">{CAL_PERFORMER_LABEL.in_house.toLowerCase()}</option>
              <option value="external">by an outside lab</option>
            </select>
          </label>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={btnCls}
            disabled={!csv || run.isPending}
            onClick={() => ask(false)}
          >
            Preview
          </button>
          {preview && !preview.applied && n > 0 && !overCap && canAdd && (
            <button
              type="button"
              className={btnCls}
              disabled={run.isPending}
              onClick={() => ask(true)}
            >
              Import ({summary})
            </button>
          )}
        </div>
        <ErrorText error={run.error} />
        {preview && !preview.applied && n > 0 && !canAdd && (
          <p role="note" className="rounded bg-brand-50 p-2 text-stone-800">
            Adding these to the gauge list needs the Level 2 + Quality plan.{" "}
            {onUpgrade && (
              <button type="button" className="underline" onClick={onUpgrade}>
                See plans
              </button>
            )}
          </p>
        )}
        {preview && (
          <div className="space-y-3">
            {preview.applied ? (
              <p role="status" className="rounded bg-emerald-50 p-2 text-emerald-900">
                Imported from {fileName}
                {sheetNote}: {summary}.
              </p>
            ) : (
              <p>
                {fileName}
                {sheetNote}: {summary}
                {preview.alreadyListed ? `, ${preview.alreadyListed} already on the list` : ""}.
              </p>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-xs">
              {(Object.keys(COLUMN_LABEL) as GaugeColumnKind[]).map((k) => (
                <div key={k} className="contents">
                  <dt className="text-stone-500">{COLUMN_LABEL[k]}</dt>
                  <dd>{preview.columns[k] ?? "not found"}</dd>
                </div>
              ))}
            </dl>
            {n > 0 && (
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-stone-500">
                      <th className="py-1 pr-2">{rowWord}</th>
                      <th className="py-1 pr-2">Gauge</th>
                      <th className="py-1 pr-2">Kind</th>
                      <th className="py-1 pr-2">Status</th>
                      <th className="py-1 pr-2">Interval</th>
                      <th className="py-1 pr-2">Last calibrated</th>
                      <th className="py-1">Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {preview.changes.map((c) => (
                      <tr key={c.line} className="align-top">
                        <td className="py-1 pr-2">{c.line}</td>
                        <td className="py-1 pr-2">
                          {c.tag} {c.description}
                        </td>
                        <td className="py-1 pr-2">
                          {GAUGE_KIND_LABEL[c.kind]}
                          {c.kindSource === "description" && (
                            <span className="text-stone-500"> (from the description)</span>
                          )}
                        </td>
                        <td className="py-1 pr-2">{GAUGE_STATUS_LABEL[c.status]}</td>
                        <td className="py-1 pr-2">
                          {c.intervalMonths ? `${c.intervalMonths} mo` : ""}
                          {c.intervalSource === "due" && (
                            <span className="text-stone-500"> (from the due date)</span>
                          )}
                        </td>
                        <td className="py-1 pr-2">
                          {c.calibration ? (
                            <>
                              {c.calibration.calibratedOn},{" "}
                              {c.calibration.asFound === "in_tolerance" ? "in" : "out of"} tolerance
                              {c.calibration.resultSource === "statement" && (
                                <span className="text-stone-500"> (as stated)</span>
                              )}
                            </>
                          ) : (
                            <span className="text-amber-800">none recorded</span>
                          )}
                        </td>
                        <td className="py-1">{c.calibration?.dueOn ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {preview.issues.length > 0 && (
              <div>
                <p className="font-medium text-amber-800">
                  Left out or noted ({preview.issues.length}):
                </p>
                <ul className="max-h-48 list-disc overflow-auto pl-5 text-xs text-amber-900">
                  {preview.issues.map((i) => (
                    <li key={`${i.line}:${i.message}`}>
                      {i.line ? `${rowWord} ${i.line}: ` : ""}
                      {i.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
