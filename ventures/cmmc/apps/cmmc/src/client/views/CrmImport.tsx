// Fill a provider's requirement marks from its customer responsibility matrix (CRM). The file is
// read in this browser (a workbook's chosen sheet as CSV) by @shared/crm-import; nothing is sent
// until the person saves the provider, and the server checks the marks again then.

import { countIdCells, gridToCsv, looksLikeWorkbook } from "@shared/controls/sheet-import";
import { applyCrmMarks, type CrmImportPlan, crmSummary, planCrmImport } from "@shared/crm-import";
import type { ControlShare } from "@shared/service-providers";
import { readXlsx } from "@shared/xlsx";
import { useState } from "react";
import { btnGhostCls } from "../ui";

interface SheetOption {
  name: string;
  csv: string;
}

export function CrmImport({
  providerName,
  controls,
  onApply,
  onFile,
}: {
  providerName: string;
  controls: ControlShare[];
  onApply: (next: ControlShare[]) => void;
  /** The file chosen, so the form can offer to keep it as the provider's CRM evidence. */
  onFile?: (file: File | null) => void;
}) {
  const [csv, setCsv] = useState<string | null>(null);
  const [sheets, setSheets] = useState<SheetOption[] | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [fileError, setFileError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const plan: CrmImportPlan | null = csv === null ? null : planCrmImport(csv, providerName);
  const sum = plan ? crmSummary(plan) : null;
  const where = sheets ? "Row" : "Line";
  return (
    <div className="my-2 space-y-2 rounded border border-stone-200 bg-stone-50 p-2 text-xs text-stone-700">
      <p>
        <strong>Fill from the matrix.</strong> Choose the provider's CRM (.xlsx or CSV). It is read
        in this browser: each row needs a requirement id (AC.L2-3.1.1, 3.1.1 or an objective like
        3.1.1[a]) and who carries it, in a responsibility column (Customer, Provider, Shared,
        Inherited) or a column per party marked with an X. Requirements the file does not list keep
        their marks; nothing is saved until you save the provider.
      </p>
      <input
        type="file"
        accept=".xlsx,.csv,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        aria-label="Customer responsibility matrix file"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          setCsv(null);
          setSheets(null);
          setFileError(null);
          setApplied(false);
          onFile?.(file ?? null);
          if (!file) return;
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (!looksLikeWorkbook(bytes)) {
            setCsv(new TextDecoder().decode(bytes));
            return;
          }
          try {
            const read = await readXlsx(bytes);
            const options = read.map((s) => ({ name: s.name, csv: gridToCsv(s.grid) }));
            let best = 0;
            read.forEach((s, i) => {
              if (countIdCells(s.grid, 2) > countIdCells(read[best]?.grid ?? [], 2)) best = i;
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
          Sheet
          <select
            className="rounded border border-stone-300 px-1 py-0.5"
            value={sheetIdx}
            onChange={(e) => {
              const idx = Number(e.target.value);
              setSheetIdx(idx);
              setCsv(sheets[idx]?.csv ?? null);
              setApplied(false);
            }}
          >
            {sheets.map((s, i) => (
              <option key={s.name} value={i}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {plan && sum && (
        <div className="space-y-1" aria-live="polite">
          {plan.layout && (
            <p>
              Read requirement ids from <q>{plan.columns.id}</q> and who carries them from{" "}
              {plan.layout === "column" ? (
                <q>{plan.columns.responsibility}</q>
              ) : (
                (["customer", "provider", "shared"] as const)
                  .filter((p) => plan.columns[p])
                  .map((p) => `"${plan.columns[p]}" (${p})`)
                  .join(", ")
              )}
              .
            </p>
          )}
          {plan.marks.length > 0 && (
            <p>
              {plan.marks.length} requirement{plan.marks.length === 1 ? "" : "s"} listed:{" "}
              {sum.provider} provider, {sum.shared} shared, {sum.customer} yours
              {sum.na > 0 ? `, ${sum.na} not applicable (left yours)` : ""}.
            </p>
          )}
          {plan.notices.length > 0 && (
            <ul className="list-disc pl-5 text-stone-800">
              {plan.notices.map((n) => (
                <li key={n.message}>
                  {n.line !== null && `${where} ${n.line}: `}
                  {n.message}
                </li>
              ))}
            </ul>
          )}
          {plan.issues.length > 0 && (
            <ul className="list-disc pl-5 text-amber-900">
              {plan.issues.slice(0, 50).map((i) => (
                <li key={`${i.line}-${i.message}`}>
                  {i.line !== null && `${where} ${i.line}: `}
                  {i.message}
                </li>
              ))}
              {plan.issues.length > 50 && <li>…and {plan.issues.length - 50} more.</li>}
            </ul>
          )}
          {plan.marks.length > 0 && (
            <button
              type="button"
              className={btnGhostCls}
              disabled={applied}
              onClick={() => {
                onApply(applyCrmMarks(controls, plan));
                setApplied(true);
              }}
            >
              {applied ? "Marks filled in: review them below, then save" : "Use these marks"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
