// "Import from a spreadsheet": a shop that already tracks NIST SP 800-171 or CMMC in Excel chooses the
// workbook (.xlsx) or a CSV, previews what would change, and applies it. A workbook is read here in the
// browser and the chosen sheet is sent as CSV (src/shared/controls/sheet-import.ts); the server reads
// that text (src/shared/controls/csv-import.ts). Blank cells never overwrite what is recorded.
import type { ImplementationStatus } from "@shared/controls";
import {
  gridToCsv,
  looksLikeWorkbook,
  readWorkbookForImport,
  type WorkbookRead,
} from "@shared/controls/sheet-import";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { btnCls, btnGhostCls, Card, ErrorText, STATUS_LABEL } from "../ui";

interface Preview {
  level: 1 | 2;
  columns: Record<"id" | "status" | "owner" | "notes" | "statement", string | null>;
  changes: {
    line: number;
    controlId: string;
    status?: { from: ImplementationStatus; to: ImplementationStatus };
    owner?: { toName: string };
    notes?: boolean;
    statement?: boolean;
  }[];
  unchanged: number;
  issues: { line: number | null; message: string }[];
  applied: boolean;
}

const COLUMN_LABEL = {
  id: "Requirement",
  status: "Status",
  owner: "Owner (e-mail)",
  notes: "Notes",
  statement: "Implementation statement",
} as const;

export function ControlImport({
  orgId,
  level,
  canApply,
  onClose,
}: {
  orgId: string;
  level: 1 | 2;
  /** false on a plan without Level 2: the preview still shows what would be imported. */
  canApply: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [workbook, setWorkbook] = useState<WorkbookRead | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  // A workbook's preview says "Row 14" (the Excel row); a CSV's says "Line 14".
  const rowWord = workbook ? "Row" : "Line";
  const sheetNote = workbook ? ` (${workbook.sheets[sheetIdx]?.name ?? "sheet"})` : "";
  const run = useMutation({
    mutationFn: ({ apply, csv }: { apply: boolean; csv: string | null }) =>
      api<Preview>(`/api/orgs/${orgId}/controls/import`, {
        method: "POST",
        json: { level, csv, apply },
      }),
    onSuccess: (p) => {
      if (!p.applied) return;
      qc.invalidateQueries({ queryKey: ["controls", orgId] });
      qc.invalidateQueries({ queryKey: ["control", orgId] });
      qc.invalidateQueries({ queryKey: ["score", orgId] });
    },
  });
  const preview = run.data;
  return (
    <Card
      title={`Import Level ${level} from a spreadsheet`}
      actions={
        <button type="button" className={btnGhostCls} onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="space-y-3 text-sm text-stone-800">
        <p>
          Choose your assessment workbook (.xlsx) or the sheet saved as CSV. A workbook is read in
          this browser and only the sheet you pick is sent. It needs one column of requirement ids (
          {level === 2 ? "AC.L2-3.1.1 or 3.1.1" : "AC.L1-b.1.i, (b)(1)(i) or 3.1.1"}) and any of: a
          status (Met, Not met, Implemented, Partially implemented, N/A), an owner's e-mail, notes,
          an implementation statement. Blank cells leave what is recorded as it is. Imported
          statements are used in the SSP, so read them before you rely on it.
        </p>
        <input
          type="file"
          accept=".xlsx,.csv,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="Spreadsheet file"
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
        {workbook && workbook.best < 0 && (
          <p className="text-amber-800">
            No sheet in this workbook has Level {level} requirement ids; the preview reads the first
            sheet.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={btnCls}
            disabled={!csv || run.isPending}
            onClick={() => run.mutate({ apply: false, csv })}
          >
            Preview
          </button>
          {preview && !preview.applied && preview.changes.length > 0 && canApply && (
            <button
              type="button"
              className={btnCls}
              disabled={run.isPending}
              onClick={() => run.mutate({ apply: true, csv })}
            >
              Import {preview.changes.length} requirement{preview.changes.length === 1 ? "" : "s"}
            </button>
          )}
        </div>
        <ErrorText error={run.error} />
        {preview && (
          <div className="space-y-3">
            {preview.applied ? (
              <p role="status" className="rounded bg-emerald-50 p-2 text-emerald-900">
                Imported {preview.changes.length} requirement
                {preview.changes.length === 1 ? "" : "s"} from {fileName}
                {sheetNote}. The score and SSP now use them.
              </p>
            ) : (
              <p>
                {fileName}
                {sheetNote}: {preview.changes.length} requirement
                {preview.changes.length === 1 ? "" : "s"} would change
                {preview.unchanged ? `, ${preview.unchanged} already match` : ""}.
                {!canApply && preview.changes.length > 0 && (
                  <strong> Importing Level 2 needs the Level 2 plan.</strong>
                )}
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
                      <th className="py-1 pr-2">Status</th>
                      <th className="py-1">Also</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {preview.changes.map((c) => (
                      <tr key={c.controlId}>
                        <td className="py-1 pr-2">{c.line}</td>
                        <td className="py-1 pr-2 font-mono">{c.controlId}</td>
                        <td className="py-1 pr-2">
                          {c.status
                            ? `${STATUS_LABEL[c.status.from]} → ${STATUS_LABEL[c.status.to]}`
                            : "unchanged"}
                        </td>
                        <td className="py-1">
                          {[
                            c.owner && `owner ${c.owner.toName}`,
                            c.notes && "notes",
                            c.statement && "statement",
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {preview.issues.length > 0 && (
              <div>
                <p className="font-medium text-amber-800">Left out ({preview.issues.length}):</p>
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
