// Import an existing master list of controlled documents: a shop that keeps its list in Excel (or
// this register's own CSV export) chooses the file, previews which documents would be added, with
// the revision in force and its approval, and applies it. A workbook is read here in the browser and
// only the chosen sheet is sent as CSV; the server reads that text (src/shared/documents-import.ts,
// services/documents/import.ts). The preview works on every plan; adding needs Level 2 + Quality.
import { gridToCsv, looksLikeWorkbook } from "@shared/controls/sheet-import";
import {
  DOC_KIND_LABEL,
  DOC_STATUS_LABEL,
  type DocKind,
  type DocOrigin,
  type DocStatus,
} from "@shared/document-control";
import { type DocColumnKind, documentRowsIn } from "@shared/documents-import";
import { readXlsx } from "@shared/xlsx";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { btnCls, btnGhostCls, Card, ErrorText } from "../ui";

export interface DocumentImportPreview {
  columns: Record<DocColumnKind, string | null>;
  dates: { order: "mdy" | "dmy"; source: "chosen" | "detected" | "default"; numeric: number };
  changes: {
    line: number;
    docNumber: string;
    title: string;
    kind: DocKind;
    kindSource: "file" | "title" | "default";
    origin: DocOrigin;
    status: DocStatus;
    revision: string;
    approvedOn: string | null;
    approver: string;
    approverMatched: boolean;
    owner: string;
    reviewDue: string | null;
  }[];
  alreadyListed: number;
  issues: { line: number | null; message: string }[];
  existing: number;
  max: number;
  applied: boolean;
}

const COLUMN_LABEL: Record<DocColumnKind, string> = {
  docNumber: "Document number",
  title: "Title",
  kind: "Type",
  origin: "Origin",
  issuer: "Issued by",
  revision: "Revision",
  status: "Status",
  approvedBy: "Approved by",
  approvedOn: "Approved on",
  effectiveOn: "Effective on",
  lastReviewedOn: "Last reviewed",
  reviewDue: "Review due",
  withdrawnOn: "Withdrawn on",
  owner: "Owner",
  location: "Location",
  reviewMonths: "Review every",
  notes: "Notes",
};

interface SheetOption {
  name: string;
  csv: string;
  rows: number;
}

export function DocumentImport({
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
  const [dateOrder, setDateOrder] = useState<"mdy" | "dmy" | undefined>(undefined);
  const sheetNote = sheets ? ` (${sheets[sheetIdx]?.name ?? "sheet"})` : "";
  const run = useMutation({
    mutationFn: (v: { apply: boolean; csv: string | null; dateOrder?: "mdy" | "dmy" }) =>
      api<DocumentImportPreview>(`/api/orgs/${orgId}/documents/import`, {
        method: "POST",
        json: v,
      }),
    onSuccess: (p) => {
      if (p.applied) qc.invalidateQueries({ queryKey: ["documents", orgId] });
    },
  });
  const ask = (apply: boolean, order?: "mdy" | "dmy") =>
    run.mutate({ apply, csv, dateOrder: order ?? dateOrder });
  const preview = run.data;
  const rowWord = sheets ? "Row" : "Line";
  const n = preview?.changes.length ?? 0;
  const released = preview?.changes.filter((c) => c.status === "released").length ?? 0;
  const summary = `${n} document${n === 1 ? "" : "s"}, ${released} with a released revision`;
  const overCap = preview ? preview.existing + n > preview.max : false;
  return (
    <Card
      title="Import a master list from a spreadsheet"
      actions={
        <button type="button" className={btnGhostCls} onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="space-y-3 text-sm text-stone-800">
        <p>
          Choose the master list you keep now (.xlsx) or a CSV, such as this register's own export.
          A workbook is read in this browser and only the sheet you pick is sent. Each row needs a
          document number and a title. The type, origin, who issued it, the revision, its status,
          who approved it and when, the effective date, the last review, the next review or the
          review interval, the owner, where the controlled copy is kept and notes are read when
          there. Numbers already on this list are left as they are.
        </p>
        <p className="text-stone-600">
          A revision counts as released only when the row gives the revision and the date it was
          approved or released; otherwise the document comes in as a draft, so the list shows what
          still needs an approval on record. Names are matched to members of this workspace by name
          or email; invite people first to have approvers and owners filled.
        </p>
        <input
          type="file"
          accept=".xlsx,.csv,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="Master list file"
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
                return { name: s.name, csv: text, rows: documentRowsIn(text, today) };
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
                  {s.name} ({s.rows} document{s.rows === 1 ? "" : "s"})
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
              onChange={(e) => {
                const v = e.target.value as "mdy" | "dmy";
                setDateOrder(v);
                if (!preview.applied) ask(false, v);
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
            Adding these to the master list needs the Level 2 + Quality plan.{" "}
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
              {(Object.keys(COLUMN_LABEL) as DocColumnKind[]).map((k) => (
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
                      <th className="py-1 pr-2">Document</th>
                      <th className="py-1 pr-2">Type</th>
                      <th className="py-1 pr-2">Status</th>
                      <th className="py-1 pr-2">Approved</th>
                      <th className="py-1">Review due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {preview.changes.map((c) => (
                      <tr key={c.line} className="align-top">
                        <td className="py-1 pr-2">{c.line}</td>
                        <td className="py-1 pr-2">
                          {c.docNumber} {c.title}
                          {c.origin === "external" && (
                            <span className="text-stone-500"> (external)</span>
                          )}
                        </td>
                        <td className="py-1 pr-2">
                          {DOC_KIND_LABEL[c.kind]}
                          {c.kindSource === "title" && (
                            <span className="text-stone-500"> (from the title)</span>
                          )}
                        </td>
                        <td className="py-1 pr-2">
                          {DOC_STATUS_LABEL[c.status]}
                          {c.revision ? ` rev ${c.revision}` : ""}
                        </td>
                        <td className="py-1 pr-2">
                          {c.approvedOn ?? ""}
                          {c.approver && (
                            <span className={c.approverMatched ? "" : "text-amber-800"}>
                              {c.approvedOn ? ", " : ""}
                              {c.approver}
                              {c.approverMatched ? "" : " (not a member)"}
                            </span>
                          )}
                        </td>
                        <td className="py-1">{c.reviewDue ?? ""}</td>
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
