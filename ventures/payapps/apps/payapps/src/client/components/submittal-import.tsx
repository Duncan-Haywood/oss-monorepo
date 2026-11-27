// Import the job's submittals from the GC's register (.xlsx, CSV or a printed PDF) or from the spec
// sections (their SUBMITTALS articles), read in the browser (src/shared/submittal-import-file.ts):
// the file never leaves it, only the rows the user keeps go to POST .../submittals/import.
import type { SubmittalDto } from "@shared/api/types";
import {
  alreadyOnLog,
  type ImportedSubmittal,
  type RegisterImportResult,
} from "@shared/submittal-import";
import { importRegisterFile } from "@shared/submittal-import-file";
import { SUBMITTAL_TYPE_LABELS, SUBMITTAL_TYPES, type SubmittalType } from "@shared/submittals";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { ErrorText } from "./error";

interface Row extends ImportedSubmittal {
  /** Stable per read, for React's key. */
  rowId: number;
  keep: boolean;
  onLog: boolean;
}

/** The request body: the kept rows, without where they were read. */
export function importBody(rows: readonly Row[]) {
  return {
    items: rows
      .filter((r) => r.keep)
      .map((r) => ({
        specSection: r.specSection,
        title: r.title.trim(),
        type: r.type,
        gcReference: r.gcReference,
        requiredBy: r.requiredBy,
        neededOnSite: r.neededOnSite,
        leadTimeDays: r.leadTimeDays,
        reviewDays: r.reviewDays,
        notes: r.notes,
      })),
  };
}

export function SubmittalImport({
  base,
  log,
  nextNumber,
  onDone,
}: {
  base: string;
  log: readonly SubmittalDto[];
  nextNumber: number;
  onDone: () => Promise<unknown>;
}) {
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState<RegisterImportResult | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [done, setDone] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setDone(null);
    try {
      const r = await importRegisterFile(file.name, new Uint8Array(await file.arrayBuffer()));
      setResult(r);
      if (r.ok) {
        const dupes = alreadyOnLog(r.items, log);
        setRows(
          r.items.map((it, i) => ({ ...it, rowId: i, onLog: dupes.has(i), keep: !dupes.has(i) })),
        );
      } else setRows([]);
    } finally {
      setReading(false);
    }
  };

  const save = useMutation({
    mutationFn: () =>
      api<{ added: number; firstNumber: number; lastNumber: number }>(`${base}/import`, {
        method: "POST",
        body: importBody(rows),
      }),
    onSuccess: async (r) => {
      setDone(`Added ${r.added} submittals, #${r.firstNumber} to #${r.lastNumber}.`);
      setResult(null);
      setRows([]);
      await onDone();
    },
  });

  const set = (i: number, patch: Partial<Row>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const kept = rows.filter((r) => r.keep).length;

  return (
    <section className="card space-y-2">
      <h2 className="font-semibold">Import from the register or the spec</h2>
      <p className="text-sm text-slate-600">
        Choose the GC's submittal register (.xlsx, CSV, or a PDF printed from their system) or the
        spec sections for your scope as a PDF: each lettered paragraph under a section's SUBMITTALS
        article becomes a row. The file is read in this browser and never uploaded. Check the rows,
        then add them as #{nextNumber} onward.
      </p>
      <input
        type="file"
        aria-label="Register or spec file"
        accept=".xlsx,.xlsm,.csv,.tsv,.txt,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/pdf"
        onChange={(e) => void onFile(e.target.files?.[0])}
        disabled={reading}
      />
      {reading && <p className="text-sm text-slate-500">Reading…</p>}
      {done && <p className="text-sm text-emerald-700">{done}</p>}
      {result && !result.ok && <p className="text-sm text-red-700">{result.error}</p>}
      {result?.ok && (
        <div className="space-y-2">
          <p className="text-sm">
            {result.kind === "spec"
              ? `${rows.length} submittals read from the spec sections.`
              : `${rows.length} submittals read from the register (columns: ${Object.values(result.columns).join(", ")}).`}{" "}
            {rows.some((r) => r.onLog) &&
              `${rows.filter((r) => r.onLog).length} already on the log are unticked.`}
          </p>
          {result.notes.map((n) => (
            <p key={n} className="text-xs text-slate-600">
              {n}
            </p>
          ))}
          {result.skipped.length > 0 && (
            <details className="text-xs text-slate-600">
              <summary>{result.skipped.length} rows left out</summary>
              <ul className="list-disc pl-5">
                {result.skipped.map((s) => (
                  <li key={`${s.source}-${s.reason}`}>
                    {s.source}: {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th>Add</th>
                  <th>Spec</th>
                  <th>What</th>
                  <th>Type</th>
                  <th>GC's no.</th>
                  <th>Needed on site</th>
                  <th>Lead (days)</th>
                  <th>From</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.rowId} className="border-t align-top">
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Add ${r.title}`}
                        checked={r.keep}
                        onChange={(e) => set(i, { keep: e.target.checked })}
                      />
                    </td>
                    <td className="whitespace-nowrap">{r.specSection ?? "—"}</td>
                    <td>
                      <input
                        className="input w-64"
                        value={r.title}
                        onChange={(e) => set(i, { title: e.target.value })}
                      />
                      {r.onLog && <div className="text-xs text-amber-700">Already on the log</div>}
                      {r.notes && <div className="text-xs text-slate-500">{r.notes}</div>}
                    </td>
                    <td>
                      <select
                        className="input"
                        value={r.type}
                        onChange={(e) =>
                          set(i, { type: e.target.value as SubmittalType, typeFrom: "column" })
                        }
                      >
                        {SUBMITTAL_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {SUBMITTAL_TYPE_LABELS[t]}
                          </option>
                        ))}
                      </select>
                      {r.typeFrom === "title" && (
                        <div className="text-xs text-slate-500">from the words; check</div>
                      )}
                    </td>
                    <td>{r.gcReference ?? ""}</td>
                    <td className="whitespace-nowrap">{r.neededOnSite ?? ""}</td>
                    <td className="tabular-nums">{r.leadTimeDays ?? ""}</td>
                    <td className="whitespace-nowrap text-xs text-slate-500">{r.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn"
              disabled={!kept || save.isPending || rows.some((r) => r.keep && !r.title.trim())}
              onClick={() => save.mutate()}
            >
              Add {kept} to the log
            </button>
            <button
              type="button"
              className="text-sm underline"
              onClick={() => {
                setResult(null);
                setRows([]);
              }}
            >
              Cancel
            </button>
          </div>
          <ErrorText error={save.error} />
        </div>
      )}
    </section>
  );
}
