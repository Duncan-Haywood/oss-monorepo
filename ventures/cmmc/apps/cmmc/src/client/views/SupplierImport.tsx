// Import an approved-supplier list: a shop that keeps its ASL in Excel (or this register's own CSV
// export) chooses the file, previews which suppliers would be added or updated, and applies it. A
// workbook is read here in the browser and only the chosen sheet is sent as CSV; the server reads that
// text (src/shared/suppliers-import.ts, services/suppliers/import.ts).
import { gridToCsv, looksLikeWorkbook } from "@shared/controls/sheet-import";
import {
  type InfoFlowed,
  SUPPLIER_LEVEL_LABEL,
  SUPPLIER_STATUS_LABEL,
  type SupplierLevel,
  type SupplierStatus,
} from "@shared/suppliers";
import { type SupplierColumnKind, supplierRowsIn } from "@shared/suppliers-import";
import { readXlsx } from "@shared/xlsx";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { btnCls, btnGhostCls, Card, ErrorText } from "../ui";

type Field =
  | "supplies"
  | "infoFlowed"
  | "cots"
  | "requiredLevel"
  | "status"
  | "statusDate"
  | "affirmedOn"
  | "cmmcUids"
  | "clauseFlowedDown"
  | "subcontractRef"
  | "checkedOn"
  | "awardedOn"
  | "notes";

export interface SupplierImportPreview {
  columns: Record<SupplierColumnKind, string | null>;
  dates: { order: "mdy" | "dmy"; source: "chosen" | "detected" | "default"; numeric: number };
  changes: {
    line: number;
    name: string;
    kind: "new" | "update";
    infoFlowed: InfoFlowed;
    infoSource: "file" | "choice" | "kept";
    requiredLevel: SupplierLevel | null;
    status: SupplierStatus | null;
    fields: Field[];
  }[];
  unchanged: number;
  issues: { line: number | null; message: string }[];
  needInfo: number;
  existing: number;
  max: number;
  needsLevel2Plan: boolean;
  applied: boolean;
}

const COLUMN_LABEL: Record<SupplierColumnKind, string> = {
  name: "Supplier",
  supplies: "What they supply",
  infoFlowed: "Information flowed",
  cots: "COTS",
  requiredLevel: "Level flowed down",
  status: "CMMC status",
  statusDate: "CMMC Status Date",
  affirmedOn: "Latest affirmation",
  cmmcUids: "CMMC UIDs",
  clauseFlowedDown: "Clause in the subcontract",
  subcontractRef: "Subcontract or PO",
  checkedOn: "Checked on",
  awardedOn: "Awarded on",
  notes: "Notes",
};

const FIELD_LABEL: Record<Field, string> = {
  supplies: "what they supply",
  infoFlowed: "information flowed",
  cots: "COTS",
  requiredLevel: "level",
  status: "status",
  statusDate: "status date",
  affirmedOn: "affirmation",
  cmmcUids: "UIDs",
  clauseFlowedDown: "clause",
  subcontractRef: "PO",
  checkedOn: "checked on",
  awardedOn: "awarded on",
  notes: "notes",
};

const INFO_SHORT: Record<InfoFlowed, string> = { cui: "CUI", fci: "FCI only", none: "Neither" };

interface SheetOption {
  name: string;
  csv: string;
  rows: number;
}

export function SupplierImport({
  orgId,
  today,
  level2,
  infoOptions,
  onClose,
}: {
  orgId: string;
  today: string;
  level2: boolean;
  infoOptions: { key: InfoFlowed; label: string }[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [sheets, setSheets] = useState<SheetOption[] | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [infoDefault, setInfoDefault] = useState<InfoFlowed | null>(null);
  const [dateOrder, setDateOrder] = useState<"mdy" | "dmy" | undefined>(undefined);
  const sheetNote = sheets ? ` (${sheets[sheetIdx]?.name ?? "sheet"})` : "";
  const run = useMutation({
    mutationFn: (v: {
      apply: boolean;
      csv: string | null;
      infoDefault: InfoFlowed | null;
      dateOrder?: "mdy" | "dmy";
    }) =>
      api<SupplierImportPreview>(`/api/orgs/${orgId}/suppliers/import`, {
        method: "POST",
        json: v,
      }),
    onSuccess: (p) => {
      if (p.applied) qc.invalidateQueries({ queryKey: ["suppliers", orgId] });
    },
  });
  const ask = (apply: boolean, over: { info?: InfoFlowed | null; order?: "mdy" | "dmy" } = {}) =>
    run.mutate({
      apply,
      csv,
      infoDefault: over.info !== undefined ? over.info : infoDefault,
      dateOrder: over.order ?? dateOrder,
    });
  const preview = run.data;
  const rowWord = sheets ? "Row" : "Line";
  const added = preview?.changes.filter((c) => c.kind === "new").length ?? 0;
  const updated = (preview?.changes.length ?? 0) - added;
  const summary = `${added} new supplier${added === 1 ? "" : "s"}, ${updated} updated`;
  const overCap = preview ? preview.existing + added > preview.max : false;
  const planBlocked = preview ? preview.needsLevel2Plan && !level2 : false;
  return (
    <Card
      title="Import a supplier list from a spreadsheet"
      actions={
        <button type="button" className={btnGhostCls} onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="space-y-3 text-sm text-stone-800">
        <p>
          Choose your approved-supplier list (.xlsx) or a CSV, such as this register's own export. A
          workbook is read in this browser and only the sheet you pick is sent. Each row needs a
          supplier name in a column headed "Supplier", "Vendor" or "Subcontractor". What they
          supply, information flowed (CUI, FCI or none), COTS, the level flowed down, the CMMC
          status and its date, the latest affirmation, CMMC UIDs, the clause, the PO, the dates
          checked and awarded and notes are read when there. A row with the same name as a supplier
          already here updates it; blank cells leave it as it is.
        </p>
        <p className="text-stone-600">
          What the order sends decides every check, so it is never guessed. Your list's "Status"
          column (Approved, Conditional) is your approval, not the CMMC status, and is not read; a
          CMMC status is read only from a column headed "CMMC status".
        </p>
        <input
          type="file"
          accept=".xlsx,.csv,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="Supplier list file"
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
                return { name: s.name, csv: text, rows: supplierRowsIn(text, today) };
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
                  {s.name} ({s.rows} supplier{s.rows === 1 ? "" : "s"})
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-wrap items-center gap-2">
          <span>Rows that do not say what the order sends</span>
          <select
            aria-label="Rows that do not say what the order sends"
            className="rounded border border-stone-300 px-2 py-1"
            value={infoDefault ?? ""}
            onChange={(e) => {
              const v = (e.target.value || null) as InfoFlowed | null;
              setInfoDefault(v);
              if (preview && !preview.applied) ask(false, { info: v });
            }}
          >
            <option value="">Leave them out</option>
            {infoOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {preview && preview.dates.numeric > 0 && (
          <label className="flex flex-wrap items-center gap-2">
            <span>Dates like 03/04/2026 are</span>
            <select
              aria-label="Date order"
              className="rounded border border-stone-300 px-2 py-1"
              value={preview.dates.order}
              onChange={(e) => {
                const v = e.target.value as "mdy" | "dmy";
                setDateOrder(v);
                if (!preview.applied) ask(false, { order: v });
              }}
            >
              <option value="mdy">month/day/year</option>
              <option value="dmy">day/month/year</option>
            </select>
            {preview.dates.source === "detected" && (
              <span className="text-xs text-stone-500">(read from the file's own dates)</span>
            )}
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
          {preview &&
            !preview.applied &&
            preview.changes.length > 0 &&
            !overCap &&
            !planBlocked && (
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
        {planBlocked && (
          <p role="note" className="rounded bg-brand-50 p-2 text-stone-800">
            Some of these suppliers get CUI or a Level 2 or 3 requirement, which needs the Level 2
            plan. Suppliers that get FCI only at Level 1 import on every plan.
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
                {preview.unchanged ? `, ${preview.unchanged} already match` : ""}
                {preview.needInfo
                  ? `, ${preview.needInfo} left out until you choose what they send`
                  : ""}
                .
              </p>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-xs">
              {(Object.keys(COLUMN_LABEL) as SupplierColumnKind[]).map((k) => (
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
                      <th className="py-1 pr-2">Supplier</th>
                      <th className="py-1 pr-2">Sends</th>
                      <th className="py-1 pr-2">Level / status</th>
                      <th className="py-1">Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {preview.changes.map((c) => (
                      <tr key={c.line} className="align-top">
                        <td className="py-1 pr-2">{c.line}</td>
                        <td className="py-1 pr-2">{c.name}</td>
                        <td className="py-1 pr-2">
                          {INFO_SHORT[c.infoFlowed]}
                          {c.infoSource === "choice" && (
                            <span className="text-stone-500"> (your choice)</span>
                          )}
                        </td>
                        <td className="py-1 pr-2">
                          {c.requiredLevel ? SUPPLIER_LEVEL_LABEL[c.requiredLevel] : "no level"}
                          {" / "}
                          {c.status ? SUPPLIER_STATUS_LABEL[c.status] : "no status"}
                        </td>
                        <td className="py-1">
                          {c.kind === "new"
                            ? "new"
                            : `update ${c.fields.map((f) => FIELD_LABEL[f]).join(", ")}`}
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
