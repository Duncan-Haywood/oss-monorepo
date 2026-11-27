// Fill a GC's Procore Subcontractor SOV template from this job's schedule of values, in the browser.
// The GC's file is read here and the filled copy downloaded; neither is uploaded (src/shared/gc-export).
// The placement (which line under which GC position, and the positions' numbers, descriptions and
// amounts) can be saved with the job, so each pay application's Procore invoice sheet totals by it.
import type { ProjectDetailDto } from "@shared/api/types";
import type { ProcoreSsovPlacement } from "@shared/gc-export/procore-placement";
import {
  fillSsov,
  PROCORE_SSOV_HELP_URL,
  readSsovTemplate,
  type SsovLine,
  type SsovTemplate,
  suggestPositions,
} from "@shared/gc-export/procore-ssov";
import { formatCents } from "@shared/money";
import { MAX_IMPORT_BYTES } from "@shared/sov-import";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api } from "../lib/api";
import { ErrorText } from "./error";

/** The base contract's lines: Procore keeps commitment change orders apart from the SOV positions. */
export function ssovLines(p: ProjectDetailDto): SsovLine[] {
  return p.sovLines
    .filter((l) => l.changeOrderId === null)
    .map((l) => ({
      id: l.id,
      description: l.itemNumber ? `${l.itemNumber} ${l.description}` : l.description,
      cents: l.originalCents,
    }));
}

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

/** The saved placement's choices that still fit this template and these lines. */
export function savedChoices(
  saved: ProcoreSsovPlacement | null,
  t: SsovTemplate,
  lines: SsovLine[],
): Record<string, string> {
  if (!saved) return {};
  const known = new Set(t.positions.map((p) => p.position));
  const out: Record<string, string> = {};
  for (const l of lines) {
    const pos = saved.placed[l.id];
    if (pos !== undefined && known.has(pos)) out[l.id] = pos;
  }
  return out;
}

export function ProcoreSsov({
  project,
  path,
  onSaved,
}: {
  project: ProjectDetailDto;
  /** The procore-ssov API path; without it the placement is not offered for saving. */
  path?: string;
  onSaved?: (p: ProjectDetailDto) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [template, setTemplate] = useState<SsovTemplate | null>(null);
  const [fileName, setFileName] = useState("");
  const [placed, setPlaced] = useState<Record<string, string>>({});
  const lines = useMemo(() => ssovLines(project), [project]);
  const fill = useMemo(
    () => (template ? fillSsov(template, lines, placed) : null),
    [template, lines, placed],
  );

  const saved = project.procoreSsov ?? null;
  const save = useMutation({
    mutationFn: () => {
      if (!template || !path) throw new Error("Choose the GC's template first");
      const placedNow: Record<string, string> = {};
      for (const l of lines) {
        const pos = placed[l.id];
        if (pos) placedNow[l.id] = pos;
      }
      return api<ProjectDetailDto>(path, {
        method: "PUT",
        body: {
          positions: template.positions.map((p) => ({
            position: p.position,
            description: p.description,
            amountCents: p.amountCents,
          })),
          placed: placedNow,
        },
      });
    },
    onSuccess: (d) => onSaved?.(d),
  });
  const forget = useMutation({
    mutationFn: () => {
      if (!path) throw new Error("Not available here");
      return api<ProjectDetailDto>(path, { method: "DELETE" });
    },
    onSuccess: (d) => onSaved?.(d),
  });

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setTemplate(null);
    if (file.size > MAX_IMPORT_BYTES) {
      setError("This file is over 10 MB; Procore's template is a small CSV.");
      return;
    }
    const r = readSsovTemplate(await file.text());
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setFileName(file.name);
    setTemplate(r.template);
    setPlaced({
      ...suggestPositions(r.template, lines),
      ...savedChoices(saved, r.template, lines),
    });
  }

  if (!open)
    return (
      <button
        type="button"
        className="btn-secondary mt-3 ml-2"
        title="Fill the GC's Procore Subcontractor SOV CSV template with this job's lines"
        onClick={() => setOpen(true)}
      >
        Procore subcontractor SOV
      </button>
    );

  return (
    <div className="mt-4 rounded border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Fill a Procore subcontractor SOV template</h3>
        <button type="button" className="text-sm underline" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        When a GC on Procore asks for your detailed schedule of values, get their CSV template (in
        Procore: the commitment's Subcontractor Schedule of Values tab, Edit SSOV, Import CSV,
        Download CSV Template, or ask the GC to send it). Choose it here, place each of your lines
        under one of the GC's positions, and download the filled copy to import with Import CSV. The
        file stays in your browser. Columns, their order and the GC's cells are kept as they are;
        only the subcontractor description and amount are written.{" "}
        <a className="underline" href={PROCORE_SSOV_HELP_URL} target="_blank" rel="noreferrer">
          Procore's instructions
        </a>
      </p>
      {saved && path && (
        <p className="mt-2 text-sm">
          Saved for the Procore invoice sheet
          {saved.savedOn ? ` on ${saved.savedOn}` : ""}: {saved.positions.length} GC position
          {saved.positions.length === 1 ? "" : "s"}, {Object.keys(saved.placed).length} of your line
          {Object.keys(saved.placed).length === 1 ? "" : "s"} placed. Each pay application's invoice
          sheet totals by them.{" "}
          <button
            type="button"
            className="underline"
            disabled={forget.isPending}
            onClick={() => forget.mutate()}
          >
            Forget it
          </button>
        </p>
      )}
      <ErrorText error={forget.error} />
      {lines.length === 0 ? (
        <p className="mt-2 text-sm">Add the job's schedule of values first.</p>
      ) : (
        <label className="mt-2 block text-sm">
          Procore template (.csv){" "}
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="Procore subcontractor SOV template"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </label>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {template && fill && (
        <>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr>
                <th className="td text-left">Your line</th>
                <th className="td text-right">Amount</th>
                <th className="td text-left">GC position</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="td">{l.description}</td>
                  <td className="td text-right">{formatCents(l.cents)}</td>
                  <td className="td">
                    <select
                      className="input"
                      aria-label={`GC position for ${l.description}`}
                      value={placed[l.id] ?? ""}
                      onChange={(e) => {
                        setPlaced({ ...placed, [l.id]: e.target.value });
                        save.reset();
                      }}
                    >
                      <option value="">Leave out</option>
                      {template.positions.map((p) => (
                        <option key={p.position} value={p.position}>
                          {p.position}
                          {p.description ? ` ${p.description}` : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <h4 className="mt-3 font-medium">Totals by GC position</h4>
          <ul className="text-sm">
            {fill.checks.map((c) => {
              const diff = c.gcCents === null ? null : c.subCents - c.gcCents;
              return (
                <li key={c.position}>
                  {c.position}
                  {c.description ? ` ${c.description}` : ""}: yours {formatCents(c.subCents)} (
                  {c.lines} line{c.lines === 1 ? "" : "s"})
                  {c.gcCents === null
                    ? ", GC amount not readable"
                    : diff === 0
                      ? `, matches the GC's ${formatCents(c.gcCents)}`
                      : `, GC's ${formatCents(c.gcCents)}: ${diff !== null && diff > 0 ? "over" : "under"} by ${formatCents(Math.abs(diff ?? 0))}`}
                </li>
              );
            })}
          </ul>
          {fill.unplaced.length > 0 && (
            <p className="mt-2 text-sm text-amber-800">
              {fill.unplaced.length} line{fill.unplaced.length === 1 ? " is" : "s are"} left out of
              the file. Place {fill.unplaced.length === 1 ? "it" : "them"} under a position to
              include {fill.unplaced.length === 1 ? "it" : "them"}.
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Change orders are not included: Procore keeps commitment change orders apart from the
            SOV positions. If the GC's SSOV already has detail lines, choose to replace them when
            you import, or they are added alongside these.
          </p>
          <button
            type="button"
            className="btn mt-3"
            onClick={() => download(`${fileName.replace(/\.csv$/i, "")}-filled.csv`, fill.csv)}
          >
            Download filled template
          </button>
          {path && (
            <>
              <button
                type="button"
                className="btn-secondary mt-3 ml-2"
                disabled={save.isPending}
                title="Each pay application's Procore invoice sheet then totals your lines by these positions"
                onClick={() => save.mutate()}
              >
                {save.isSuccess ? "Saved for the invoice sheet" : "Save for the invoice sheet"}
              </button>
              <ErrorText error={save.error} />
            </>
          )}
        </>
      )}
    </div>
  );
}
