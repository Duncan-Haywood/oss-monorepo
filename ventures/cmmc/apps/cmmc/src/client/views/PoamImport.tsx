// Import an existing POA&M: a shop that tracks its open items in Excel chooses the workbook (.xlsx)
// or a CSV, previews which items would be added or updated, and applies it. A workbook is read here
// in the browser and only the chosen sheet is sent as CSV (src/shared/controls/sheet-import.ts); the
// server reads that text (src/shared/controls/poam-import.ts).
import {
  gridToCsv,
  looksLikeWorkbook,
  readWorkbookForImport,
  type WorkbookRead,
} from "@shared/controls/sheet-import";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { btnCls, btnGhostCls, Card, ErrorText } from "../ui";

type Field = "remediation" | "milestones" | "responsible" | "scheduledCompletion" | "status";

type DateOrder = "mdy" | "dmy";

export interface PoamImportPreview {
  level: 1 | 2;
  dates: {
    order: DateOrder;
    source: "chosen" | "detected" | "default";
    numeric: number;
    evidenceLine: number | null;
  };
  columns: Record<
    | "id"
    | "weakness"
    | "remediation"
    | "milestones"
    | "responsible"
    | "scheduledCompletion"
    | "status",
    string | null
  >;
  changes: {
    line: number;
    controlId: string;
    weakness: string;
    kind: "new" | "update";
    fields: Field[];
    scheduledCompletion: string;
    eligible: boolean;
    eligibilityReason: string;
  }[];
  unchanged: number;
  issues: { line: number | null; message: string }[];
  applied: boolean;
}

const COLUMN_LABEL = {
  id: "Requirement",
  weakness: "Weakness",
  remediation: "Remediation plan",
  milestones: "Milestones",
  responsible: "Responsible",
  scheduledCompletion: "Scheduled completion",
  status: "Status",
} as const;

const FIELD_LABEL: Record<Field, string> = {
  remediation: "remediation",
  milestones: "milestones",
  responsible: "responsible",
  scheduledCompletion: "date",
  status: "status",
};

export function PoamImport({
  orgId,
  level,
  onClose,
}: {
  orgId: string;
  level: 1 | 2;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [workbook, setWorkbook] = useState<WorkbookRead | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [dateOrder, setDateOrder] = useState<"auto" | DateOrder>("auto");
  const rowWord = workbook ? "Row" : "Line";
  const sheetNote = workbook ? ` (${workbook.sheets[sheetIdx]?.name ?? "sheet"})` : "";
  const run = useMutation({
    mutationFn: (apply: boolean) =>
      api<PoamImportPreview>(`/api/orgs/${orgId}/poam/import`, {
        method: "POST",
        json: { level, csv, apply, ...(dateOrder === "auto" ? {} : { dateOrder }) },
      }),
    onSuccess: (p) => {
      if (p.applied) qc.invalidateQueries({ queryKey: ["poam", orgId] });
    },
  });
  const preview = run.data;
  const added = preview?.changes.filter((c) => c.kind === "new").length ?? 0;
  const updated = (preview?.changes.length ?? 0) - added;
  const summary = `${added} new item${added === 1 ? "" : "s"}, ${updated} updated`;
  return (
    <Card
      title="Import a POA&M from a spreadsheet"
      actions={
        <button type="button" className={btnGhostCls} onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="space-y-3 text-sm text-stone-800">
        <p>
          Choose your POA&M workbook (.xlsx) or the sheet saved as CSV. A workbook is read in this
          browser and only the sheet you pick is sent. Each row needs a requirement id (
          {level === 2 ? "AC.L2-3.1.1 or 3.1.1" : "AC.L1-b.1.i or (b)(1)(i)"}), a weakness and a
          scheduled completion date, in columns headed "Weakness" and "Scheduled completion" (or
          "Due date"); remediation, milestones, responsible and status (open, closed) are read when
          there. Dates are read as 2026-12-31, 31 Dec 2026, an Excel date, or numbers in one order
          for the whole sheet: month first (12/31/2026) unless you pick day first or the sheet shows
          it (31/12/2026); anything else is listed, never guessed. A row with the same requirement
          and weakness as an item already here updates it; blank cells leave it as it is.
        </p>
        <input
          type="file"
          accept=".xlsx,.csv,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="POA&M spreadsheet file"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            run.reset();
            setCsv(null);
            setWorkbook(null);
            setFileError(null);
            if (!file) return;
            setFileName(file.name);
            const bytes = new Uint8Array(await file.arrayBuffer());
            if (!looksLikeWorkbook(bytes)) {
              setCsv(new TextDecoder().decode(bytes));
              return;
            }
            try {
              const wb = await readWorkbookForImport(bytes, level);
              const idx = Math.max(0, wb.best);
              setWorkbook(wb);
              setSheetIdx(idx);
              setCsv(gridToCsv(wb.grids[idx] ?? []));
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
        {workbook && workbook.sheets.length > 1 && (
          <label className="flex flex-wrap items-center gap-2">
            <span>Sheet</span>
            <select
              className="rounded border border-stone-300 px-2 py-1"
              value={sheetIdx}
              onChange={(e) => {
                const idx = Number(e.target.value);
                run.reset();
                setSheetIdx(idx);
                setCsv(gridToCsv(workbook.grids[idx] ?? []));
              }}
            >
              {workbook.sheets.map((s, i) => (
                <option key={s.name} value={i}>
                  {s.name} ({s.idCells} requirement id{s.idCells === 1 ? "" : "s"})
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-wrap items-center gap-2">
          <span>Dates like 03/04/2026 are</span>
          <select
            className="rounded border border-stone-300 px-2 py-1"
            value={dateOrder}
            onChange={(e) => {
              run.reset();
              setDateOrder(e.target.value as "auto" | DateOrder);
            }}
          >
            <option value="auto">
              read from the sheet (month first unless it shows day first)
            </option>
            <option value="mdy">month/day/year (3 April 2026)</option>
            <option value="dmy">day/month/year (4 March 2026)</option>
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={btnCls}
            disabled={!csv || run.isPending}
            onClick={() => run.mutate(false)}
          >
            Preview
          </button>
          {preview && !preview.applied && preview.changes.length > 0 && (
            <button
              type="button"
              className={btnCls}
              disabled={run.isPending}
              onClick={() => run.mutate(true)}
            >
              Import ({summary})
            </button>
          )}
        </div>
        <ErrorText error={run.error} />
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
                {preview.unchanged ? `, ${preview.unchanged} already match` : ""}.
              </p>
            )}
            {preview.dates.numeric > 0 && (
              <p className="text-xs text-stone-600">
                {preview.dates.numeric} numeric date{preview.dates.numeric === 1 ? "" : "s"} read as{" "}
                {preview.dates.order === "dmy" ? "day/month/year" : "month/day/year"}
                {preview.dates.source === "detected"
                  ? ` (${rowWord.toLowerCase()} ${preview.dates.evidenceLine} can only be day first)`
                  : preview.dates.source === "chosen"
                    ? " (your choice)"
                    : ""}
                .
              </p>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-xs">
              {(Object.keys(COLUMN_LABEL) as (keyof typeof COLUMN_LABEL)[]).map((k) => (
                <div key={k} className="contents">
                  <dt className="text-stone-500">{COLUMN_LABEL[k]}</dt>
                  <dd>{preview.columns[k] ?? "not found"}</dd>
                </div>
              ))}
            </dl>
            {preview.changes.length > 0 && (
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-stone-500">
                      <th className="py-1 pr-2">{rowWord}</th>
                      <th className="py-1 pr-2">Requirement</th>
                      <th className="py-1 pr-2">Weakness</th>
                      <th className="py-1 pr-2">Due</th>
                      <th className="py-1 pr-2">Change</th>
                      <th className="py-1">Allowed on POA&M?</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {preview.changes.map((c) => (
                      <tr key={c.line} className="align-top">
                        <td className="py-1 pr-2">{c.line}</td>
                        <td className="py-1 pr-2 font-mono">{c.controlId}</td>
                        <td className="py-1 pr-2">{c.weakness}</td>
                        <td className="py-1 pr-2 whitespace-nowrap">{c.scheduledCompletion}</td>
                        <td className="py-1 pr-2">
                          {c.kind === "new"
                            ? "new"
                            : `update ${c.fields.map((f) => FIELD_LABEL[f]).join(", ")}`}
                        </td>
                        <td className="py-1">
                          {c.eligible ? "Yes" : "No"}
                          {!c.eligible && <p className="text-stone-500">{c.eligibilityReason}</p>}
                        </td>
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
