// Import an existing asset list: a shop that keeps its inventory in Excel, or filled in the public CMMC
// scoping worksheet and saved its file (JSON) or exported its CSV, chooses the file, previews which assets would be added or
// updated, and applies it. A workbook is read here in the browser and only the chosen sheet is sent
// as CSV; the server reads that text (src/shared/assets-import.ts).
import type { AssetCategory, SpecializedType } from "@shared/assets";
import { CATEGORY_INFO, SPECIALIZED_LABEL } from "@shared/assets";
import { assetRowsIn } from "@shared/assets-import";
import { gridToCsv, looksLikeWorkbook } from "@shared/controls/sheet-import";
import { readXlsx } from "@shared/xlsx";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { btnCls, btnGhostCls, Card, ErrorText } from "../ui";

type Field =
  | "category"
  | "specializedType"
  | "assetType"
  | "location"
  | "provider"
  | "owner"
  | "notes";
type Column =
  | "name"
  | "category"
  | "specializedType"
  | "assetType"
  | "location"
  | "provider"
  | "owner"
  | "notes"
  | "policy"
  | "separation";

export interface AssetImportPreview {
  format: "sheet" | "worksheet-json";
  columns: Record<Column, string | null>;
  changes: {
    line: number;
    name: string;
    category: AssetCategory;
    specializedType: SpecializedType | null;
    kind: "new" | "update";
    fields: Field[];
  }[];
  unchanged: number;
  issues: { line: number | null; message: string }[];
  existing: number;
  max: number;
  applied: boolean;
}

const COLUMN_LABEL: Record<Column, string> = {
  name: "Asset",
  category: "Category",
  specializedType: "Specialized asset type",
  assetType: "Type",
  location: "Location",
  provider: "Provided by",
  owner: "Owner",
  notes: "Notes",
  policy: "Policy (into notes)",
  separation: "Separation (into notes)",
};

const FIELD_LABEL: Record<Field, string> = {
  category: "category",
  specializedType: "specialized type",
  assetType: "type",
  location: "location",
  provider: "provided by",
  owner: "owner",
  notes: "notes",
};

interface SheetOption {
  name: string;
  csv: string;
  rows: number;
}

export function AssetImport({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [sheets, setSheets] = useState<SheetOption[] | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const sheetNote = sheets ? ` (${sheets[sheetIdx]?.name ?? "sheet"})` : "";
  const run = useMutation({
    mutationFn: ({ apply, csv }: { apply: boolean; csv: string | null }) =>
      api<AssetImportPreview>(`/api/orgs/${orgId}/assets/import`, {
        method: "POST",
        json: { csv, apply },
      }),
    onSuccess: (p) => {
      if (p.applied) {
        qc.invalidateQueries({ queryKey: ["assets", orgId] });
        qc.invalidateQueries({ queryKey: ["ssp"] });
      }
    },
  });
  const preview = run.data;
  const rowWord = preview?.format === "worksheet-json" ? "Asset" : sheets ? "Row" : "Line";
  const added = preview?.changes.filter((c) => c.kind === "new").length ?? 0;
  const updated = (preview?.changes.length ?? 0) - added;
  const summary = `${added} new asset${added === 1 ? "" : "s"}, ${updated} updated`;
  const overCap = preview ? preview.existing + added > preview.max : false;
  return (
    <Card
      title="Import an asset list from a spreadsheet"
      actions={
        <button type="button" className={btnGhostCls} onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="space-y-3 text-sm text-stone-800">
        <p>
          Choose your asset list (.xlsx) or a CSV, such as this inventory's own export, or the file
          the free CMMC scoping worksheet saves (JSON) or its CSV. The worksheet's saved file holds
          your answers, and each asset gets the category the worksheet gives those answers; one it
          shows as "Not resolved" is listed with its open questions and left out. A workbook is read
          in this browser and only the sheet you pick is sent. Each row needs an asset name and its
          Level 2 category (CUI, Security Protection, Contractor Risk Managed, Specialized or
          Out-of-Scope) in columns headed "Asset" and "Category". The category is your scoping
          decision, so a row without one is listed, never guessed. A specialized asset needs its
          kind (IoT, IIoT, OT, GFE, restricted information system, test equipment). Type, location,
          provided by, owner and notes are read when there; a worksheet's policy and separation
          columns go into the notes. A row with the same name as an asset already here updates it;
          blank cells leave it as it is.
        </p>
        <input
          type="file"
          accept=".xlsx,.csv,.json,text/csv,text/plain,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="Asset list file"
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
                return { name: s.name, csv: text, rows: assetRowsIn(text) };
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
                  {s.name} ({s.rows} asset{s.rows === 1 ? "" : "s"})
                </option>
              ))}
            </select>
          </label>
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
          {preview && !preview.applied && preview.changes.length > 0 && !overCap && (
            <button
              type="button"
              className={btnCls}
              disabled={run.isPending}
              onClick={() => run.mutate({ apply: true, csv })}
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
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-xs">
              {(Object.keys(COLUMN_LABEL) as Column[]).map((k) => (
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
                      <th className="py-1 pr-2">Asset</th>
                      <th className="py-1 pr-2">Category</th>
                      <th className="py-1">Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {preview.changes.map((c) => (
                      <tr key={c.line} className="align-top">
                        <td className="py-1 pr-2">{c.line}</td>
                        <td className="py-1 pr-2">{c.name}</td>
                        <td className="py-1 pr-2">
                          {CATEGORY_INFO[c.category].label}
                          {c.specializedType && (
                            <span className="text-stone-500">
                              {" "}
                              ({SPECIALIZED_LABEL[c.specializedType]})
                            </span>
                          )}
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
