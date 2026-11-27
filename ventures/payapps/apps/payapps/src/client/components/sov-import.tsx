// Import a schedule of values from the contractor's own Excel workbook or CSV. The file is read in the browser and
// never uploaded; the preview shows every line, what was left out and why, and how the total compares with the
// contract sum. Only the confirmed lines go to the bulk SOV endpoint.
import type { ProjectDetailDto, ProjectDto } from "@shared/api/types";
import { formatCents } from "@shared/money";
import { findSov, importSovFile, parseCsv, type SovImportResult } from "@shared/sov-import";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, orgPath, projectPath } from "../lib/api";
import { browserOcr } from "../lib/ocr";
import { ErrorText } from "./error";

const REASON = { total: "total", subtotal: "subtotal", change_order: "change order" } as const;

type Source = "file" | "paste" | "copy";

/** Another job's original schedule (change-order lines left out) as an import preview. */
export function copyFromJob(other: ProjectDetailDto, withAmounts: boolean): SovImportResult {
  const lines = other.sovLines
    .filter((l) => !l.changeOrderId)
    .map((l) => ({
      itemNumber: l.itemNumber,
      description: l.description,
      originalCents: withAmounts ? l.originalCents : 0,
      source: other.name,
    }));
  if (!lines.length) {
    const error = `${other.name} has no original schedule of values lines to copy.`;
    return { ok: false, error, errors: [error] };
  }
  const fromCos = other.sovLines.length - lines.length;
  return {
    ok: true,
    lines,
    skipped: [],
    checks: [],
    notes: [
      ...(fromCos
        ? [`${fromCos} line${fromCos === 1 ? "" : "s"} added there by change orders left out.`]
        : []),
      ...(withAmounts
        ? []
        : ["Amounts set to $0.00: enter this job's values on each line after adding."]),
    ],
    header: `copied from ${other.name}`,
    totalCents: lines.reduce((a, l) => a + l.originalCents, 0),
    changeOrderLines: [],
    billingColumns: [],
    applicationNumber: null,
    retainageWorkBps: null,
    retainageStoredBps: null,
    periodTo: null,
    sheetTotalCents: null,
    billedToDateCents: null,
  };
}

export function SovImport({
  orgId,
  project,
  bulkPath,
  onImported,
}: {
  orgId: string;
  project: ProjectDetailDto;
  bulkPath: string;
  onImported: (d: ProjectDetailDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<Source>("file");
  const [paste, setPaste] = useState("");
  const [copyFrom, setCopyFrom] = useState("");
  const [result, setResult] = useState<SovImportResult | null>(null);
  const [withAmounts, setWithAmounts] = useState(true);
  const jobs = useQuery({
    queryKey: ["projects", orgId],
    queryFn: () => api<{ items: ProjectDto[] }>(orgPath(orgId, "/projects")),
    enabled: open && source === "copy",
  });
  const others = (jobs.data?.items ?? []).filter((x) => x.id !== project.id);
  const copy = useMutation({
    mutationFn: async () =>
      copyFromJob(await api<ProjectDetailDto>(projectPath(orgId, copyFrom)), withAmounts),
    onSuccess: setResult,
  });
  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState(false);
  // While a scan with no text is read by OCR: the page it is on, of how many.
  const [ocrPage, setOcrPage] = useState<[number, number] | null>(null);

  const save = useMutation({
    mutationFn: () => {
      if (!result?.ok) throw new Error("Nothing to import");
      return api<ProjectDetailDto>(bulkPath, {
        method: "POST",
        body: {
          lines: result.lines.map(({ itemNumber, description, originalCents }) => ({
            itemNumber,
            description,
            originalCents,
          })),
        },
      });
    },
    onSuccess: (d) => {
      onImported(d);
      setResult(null);
      setFileName("");
      setOpen(false);
    },
  });

  async function onFile(file: File | undefined) {
    if (!file) return;
    setReading(true);
    setFileName(file.name);
    save.reset();
    try {
      setResult(
        await importSovFile(file.name, new Uint8Array(await file.arrayBuffer()), {
          ocr: browserOcr,
          onOcrProgress: (page, pages) => setOcrPage([page, pages]),
        }),
      );
    } finally {
      setReading(false);
      setOcrPage(null);
    }
  }

  if (!open)
    return (
      <button type="button" className="btn-secondary mt-3" onClick={() => setOpen(true)}>
        Import from Excel, CSV, PDF or another job
      </button>
    );

  const existing = project.sovTotalCents;
  const contract = project.originalContractSumCents;
  const after = result?.ok ? existing + result.totalCents : existing;

  return (
    <div className="mt-4 rounded border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Import a schedule of values</h3>
        <button type="button" className="text-sm underline" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {(
          [
            ["file", "Excel or CSV file"],
            ["paste", "Paste rows"],
            ["copy", "Copy from another job"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={source === k}
            className={source === k ? "btn" : "btn-secondary"}
            onClick={() => {
              setSource(k);
              setResult(null);
              save.reset();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {source === "file" && (
        <>
          <p className="mt-1 text-sm text-slate-600">
            Choose the bid breakdown, SOV tab or continuation sheet you already keep (.xlsx, CSV, or
            a PDF printed from a spreadsheet or estimating program, or a scanned PDF, read by OCR;
            check a scan's figures against the paper). It is read in your browser and not uploaded;
            nothing is saved until you add the lines. Subtotals, totals and change-order lines are
            left out.
          </p>
          <label className="mt-2 block text-sm">
            <span className="sr-only">Spreadsheet or PDF file</span>
            <input
              type="file"
              accept=".xlsx,.xlsm,.csv,.tsv,.txt,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/pdf"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </label>
          {reading && (
            <p className="mt-2 text-sm" aria-live="polite">
              Reading {fileName}…
              {ocrPage &&
                ` Reading the scan's text, page ${ocrPage[0]} of ${ocrPage[1]} (a few seconds a page; the first scan also loads the text reader, about 7 MB).`}
            </p>
          )}
        </>
      )}
      {source === "paste" && (
        <form
          className="mt-2 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.reset();
            setResult(findSov(parseCsv(paste)));
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">
              Copy the rows from Excel or Google Sheets, header row included (Item, Description,
              Scheduled value), and paste them here.
            </span>
            <textarea
              className="input h-40 w-full font-mono text-xs"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
            />
          </label>
          <button type="submit" className="btn" disabled={!paste.trim()}>
            Preview
          </button>
        </form>
      )}
      {source === "copy" && (
        <form
          className="mt-2 flex flex-wrap items-end gap-2 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            save.reset();
            copy.mutate();
          }}
        >
          <label>
            <span className="mb-1 block text-slate-600">
              Start from another job's original schedule (change-order lines are left out)
            </span>
            <select
              className="input"
              value={copyFrom}
              onChange={(e) => setCopyFrom(e.target.value)}
              required
            >
              <option value="">Choose a job…</option>
              {others.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                  {x.number ? ` (${x.number})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={withAmounts}
              onChange={(e) => setWithAmounts(e.target.checked)}
            />
            Copy the amounts too
          </label>
          <button type="submit" className="btn" disabled={!copyFrom || copy.isPending}>
            Preview
          </button>
          {jobs.isSuccess && !others.length && (
            <p className="w-full text-slate-600">There is no other job in this organization yet.</p>
          )}
          <ErrorText error={copy.error ?? jobs.error} />
        </form>
      )}

      {result && !result.ok && (
        <div role="alert" className="mt-2 text-sm text-red-700">
          <p>{result.error}</p>
          {result.errors.length > 1 && (
            <ul className="list-disc pl-5">
              {result.errors.slice(1, 6).map((e) => (
                <li key={e}>{e}</li>
              ))}
              {result.errors.length > 6 && <li>…and {result.errors.length - 6} more</li>}
            </ul>
          )}
        </div>
      )}

      {result?.ok && (
        <div className="mt-3 space-y-2 text-sm">
          <p>
            Found {result.lines.length} line{result.lines.length === 1 ? "" : "s"} totalling{" "}
            <strong>{formatCents(result.totalCents)}</strong> ({result.header}).
          </p>
          {result.checks.map((c) => (
            <p
              key={c.message}
              className={c.severity === "high" ? "text-red-700" : "text-amber-700"}
            >
              {c.message}
            </p>
          ))}
          {after !== contract && (
            <p className="text-amber-700">
              After this import the schedule totals {formatCents(after)}
              {existing > 0 && ` (${formatCents(existing)} already on the project)`}; the contract
              sum is {formatCents(contract)}, {formatCents(after - contract)} apart. They must match
              before you submit a pay app: fix the sheet and import again, or edit the lines after.
            </p>
          )}
          {after === contract && (
            <p className="text-green-700">The schedule will total the contract sum exactly.</p>
          )}
          {project.sovLines.length > 0 && (
            <p className="text-amber-700">
              The project already has {project.sovLines.length} line
              {project.sovLines.length === 1 ? "" : "s"}; these are added after them, not in place
              of them.
            </p>
          )}
          {result.billedToDateCents !== null && result.billedToDateCents > 0 && (
            <p className="text-amber-700">
              This sheet shows {formatCents(result.billedToDateCents)} already billed on these
              lines. Only the scheduled values are imported. To carry that billing over, enter your
              last application under "Already billing this job somewhere else?" once the lines are
              in: work completed per line, without stored materials.
            </p>
          )}
          {result.notes.length > 0 && (
            <ul className="list-disc pl-5 text-slate-600">
              {result.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <div className="max-h-80 overflow-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Item</th>
                  <th className="th">Description</th>
                  <th className="th text-right">Scheduled value</th>
                  <th className="th">From</th>
                </tr>
              </thead>
              <tbody>
                {result.lines.map((l, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a fixed preview; copied lines share a source
                  <tr key={i}>
                    <td className="td">{l.itemNumber}</td>
                    <td className="td">{l.description}</td>
                    <td className="td text-right">{formatCents(l.originalCents)}</td>
                    <td className="td text-xs text-slate-500">{l.source}</td>
                  </tr>
                ))}
                {result.skipped.map((s) => (
                  <tr key={`skip-${s.source}`} className="text-slate-400">
                    <td className="td" />
                    <td className="td line-through">{s.label}</td>
                    <td className="td text-right text-xs">left out ({REASON[s.reason]})</td>
                    <td className="td text-xs">{s.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="btn"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            Add {result.lines.length} line{result.lines.length === 1 ? "" : "s"} to the schedule
          </button>
          <ErrorText error={save.error} />
        </div>
      )}
    </div>
  );
}
