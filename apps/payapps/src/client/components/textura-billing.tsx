// Fill the GC's Textura "Upload Billing Amounts" template (This Period) from this pay application
// (src/shared/gc-export/textura-billing.ts). The file is read and written in the browser; nothing here
// changes the pay app or is uploaded.
import type { PayAppDetailDto, ProjectDetailDto } from "@shared/api/types";
import { procoreInvoiceSheet } from "@shared/gc-export/procore-invoice";
import {
  fillTextura,
  readTexturaGrid,
  readTexturaTemplate,
  suggestTexturaMatches,
  TEXTURA_UPLOAD_HELP_URL,
  type TexturaColumns,
  type TexturaLine,
  type TexturaRole,
  type TexturaTemplate,
  texturaRows,
} from "@shared/gc-export/textura-billing";
import { formatCents } from "@shared/money";
import { readXlsx } from "@shared/sov-import/xlsx";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, projectPath } from "../lib/api";

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

const ROLE_LABEL: Record<TexturaRole, string> = {
  work: "Work This Period (filled)",
  material: "Material Stored This Period (filled)",
  phase: "Phase code (to match rows)",
  description: "Description (to match rows)",
  budget: "Budget (to check)",
};
const ROLES: TexturaRole[] = ["work", "material", "phase", "description", "budget"];

async function readFile(file: File) {
  if (/\.xlsx$/i.test(file.name)) {
    const sheets = await readXlsx(await file.arrayBuffer());
    const first = sheets[0];
    if (!first) return { ok: false as const, error: "The workbook has no sheets." };
    return readTexturaGrid(first.grid, ",");
  }
  return readTexturaTemplate(await file.text());
}

export function TexturaBillingPanel({
  orgId,
  project,
  app,
}: {
  orgId: string;
  project: ProjectDetailDto;
  app: PayAppDetailDto;
}) {
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState<TexturaTemplate | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [col, setCol] = useState<TexturaColumns | null>(null);
  const [match, setMatch] = useState<Record<number, string>>({});

  const previous = project.payApps.find((p) => p.number === app.number - 1) ?? null;
  const prev = useQuery({
    queryKey: ["pay-app", orgId, project.id, previous?.id],
    queryFn: () =>
      api<PayAppDetailDto>(projectPath(orgId, project.id, `/pay-apps/${previous?.id}`)),
    enabled: open && previous !== null,
  });
  const ready = previous === null || prev.data !== undefined;
  const lines = useMemo<TexturaLine[] | null>(() => {
    if (!ready) return null;
    const sheet = procoreInvoiceSheet({
      lines: app.computed.lines,
      previousLines: previous === null ? null : (prev.data?.computed.lines ?? []),
      changeOrderLineIds: new Set(),
      openedMidJob: project.opening !== null,
    });
    const stored = new Map(sheet.rows.map((r) => [r.sovLineId, r.newStoredCents]));
    return app.computed.lines.map((l) => ({
      sovLineId: l.sovLineId,
      itemNumber: l.itemNumber,
      description: l.description,
      scheduledValueCents: l.scheduledValueCents,
      workThisPeriodCents: l.thisPeriodCents,
      newStoredCents: stored.get(l.sovLineId) ?? null,
    }));
  }, [ready, app.computed.lines, previous, prev.data, project.opening]);

  const fill = useMemo(
    () => (template && col && lines ? fillTextura(template, col, lines, match) : null),
    [template, col, lines, match],
  );

  async function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    setTemplate(null);
    try {
      const r = await readFile(file);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setFileName(file.name);
      setTemplate(r.template);
      setCol(r.template.col);
      setMatch(lines ? suggestTexturaMatches(r.template, lines) : {});
    } catch {
      setError(
        "This file could not be read. Choose the CSV or Excel file Textura's Download Template gave.",
      );
    }
  }

  function setRole(role: TexturaRole, value: string) {
    if (!col || !template) return;
    const next = { ...col, [role]: value === "" ? null : Number(value) };
    setCol(next);
    // A different matching column changes which rows are line items: guess the matches again.
    if (lines && (role === "phase" || role === "description" || role === "budget"))
      setMatch(suggestTexturaMatches({ rows: texturaRows(template.body, next) }, lines));
  }

  if (!open)
    return (
      <section className="card">
        <button
          type="button"
          className="btn-secondary"
          title="Fill the GC's Textura billing upload template from this pay application"
          onClick={() => setOpen(true)}
        >
          Textura billing upload
        </button>
      </section>
    );

  const shownRows = fill
    ? [...fill.filled.map((f) => f.row), ...fill.unmatchedRows].sort((a, b) => a.index - b.index)
    : [];

  return (
    <section className="card overflow-x-auto">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Textura billing upload</h2>
        <button type="button" className="text-sm underline" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        When the GC bills through Oracle Textura, you can fill their invoice from a file instead of
        typing it. In Textura's billing workflow, on the Progress tab, choose More → Upload Billing
        Amounts → <em>This Period Billing Amounts</em> → Download Template, and choose that file
        here. This fills <em>Work This Period</em> and <em>Material Stored This Period</em> on each
        of your lines from this application and keeps every other cell as Textura wrote it. Upload
        the downloaded CSV in the same dialog, then check the table Textura shows before you
        continue.{" "}
        <a className="underline" href={TEXTURA_UPLOAD_HELP_URL} target="_blank" rel="noreferrer">
          Oracle's instructions
        </a>
      </p>
      {app.status === "draft" && (
        <p className="mt-2 text-sm text-amber-800">
          This application is still a draft: save your changes first, as the file is filled from the
          saved figures.
        </p>
      )}
      {previous !== null && prev.isError && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          Could not load application #{previous.number} to work out the materials stored this
          period.
        </p>
      )}
      <label className="mt-3 block text-sm">
        Textura template (CSV or Excel)
        <input
          type="file"
          accept=".csv,.txt,.xlsx,text/csv"
          className="mt-1 block"
          disabled={!lines}
          onChange={(e) => void choose(e.target.files?.[0])}
        />
      </label>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {template && col && fill && lines && (
        <>
          {template.looksToDate && (
            <p className="mt-2 text-sm text-amber-800">
              This looks like the <em>To Date</em> template. This fills the This Period one: in
              Textura's dialog choose This Period Billing Amounts and download that template
              instead.
            </p>
          )}
          <fieldset className="mt-3 grid max-w-3xl gap-2 sm:grid-cols-2">
            <legend className="text-sm font-medium">Columns in {fileName}</legend>
            {ROLES.map((role) => (
              <label key={role} className="text-sm">
                {ROLE_LABEL[role]}
                <select
                  className="input mt-1 block w-full"
                  value={col[role] === null ? "" : String(col[role])}
                  onChange={(e) => setRole(role, e.target.value)}
                >
                  <option value="">
                    {role === "material" ? "(none: no stored materials column)" : "(none)"}
                  </option>
                  {template.header.map((h, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: a column is its position in the file
                    <option key={i} value={String(i)}>
                      {h.trim() === "" ? `Column ${i + 1}` : h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </fieldset>
          <table className="mt-3 w-full min-w-[760px] text-sm">
            <thead>
              <tr>
                <th className="th text-left">Textura row</th>
                <th className="th text-right">Budget</th>
                <th className="th text-left">Your line</th>
                <th className="th text-right">Work This Period</th>
                <th className="th text-right">Material Stored This Period</th>
              </tr>
            </thead>
            <tbody>
              {shownRows.map((r) => {
                const f = fill.filled.find((x) => x.row.index === r.index);
                const id = match[r.index] ?? "";
                return (
                  <tr key={r.index}>
                    <td className="td">
                      {r.phase && <span className="font-medium">{r.phase} </span>}
                      {r.description}
                    </td>
                    <td className="td text-right">
                      {r.budgetCents === null ? "" : formatCents(r.budgetCents)}
                    </td>
                    <td className="td">
                      <select
                        className="input"
                        aria-label={`Your line for Textura row ${r.phase || r.description}`}
                        value={id}
                        onChange={(e) => {
                          const next = { ...match };
                          if (e.target.value === "") delete next[r.index];
                          else next[r.index] = e.target.value;
                          setMatch(next);
                        }}
                      >
                        <option value="">(leave as Textura wrote it)</option>
                        {lines.map((l) => (
                          <option key={l.sovLineId} value={l.sovLineId}>
                            {l.itemNumber ? `${l.itemNumber} ` : ""}
                            {l.description}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="td text-right">{f ? formatCents(f.workCents) : ""}</td>
                    <td className="td text-right">
                      {!f || col.material === null ? (
                        ""
                      ) : f.materialCents === null ? (
                        <span className="text-amber-800">enter by hand</span>
                      ) : (
                        formatCents(f.materialCents)
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="font-semibold">
                <td className="td">Total written</td>
                <td className="td" />
                <td className="td" />
                <td className="td text-right">{formatCents(fill.totals.workCents)}</td>
                <td className="td text-right">
                  {col.material === null ? "" : formatCents(fill.totals.materialCents)}
                </td>
              </tr>
            </tbody>
          </table>
          {fill.blocking.map((b) => (
            <p key={b} role="alert" className="mt-2 text-sm text-red-700">
              {b}
            </p>
          ))}
          {fill.missingLines.length > 0 && (
            <p className="mt-2 text-sm text-amber-800">
              Billed this period but on no Textura row:{" "}
              {fill.missingLines.map((l) => l.description).join(", ")}. Choose the row for{" "}
              {fill.missingLines.length === 1 ? "it" : "each"}, or ask the GC to add the line to
              Textura's schedule of values: otherwise the upload leaves{" "}
              {fill.missingLines.length === 1 ? "its" : "their"} amount out.
            </p>
          )}
          {fill.materialUnknown.length > 0 && (
            <p className="mt-2 text-sm text-amber-800">
              Stored materials went down, or this job's earlier applications were made elsewhere, on{" "}
              {fill.materialUnknown.map((l) => l.description).join(", ")}: the materials stored this
              period can't be told from the balance, so{" "}
              {fill.materialUnknown.length === 1 ? "that cell is" : "those cells are"} left as
              Textura wrote {fill.materialUnknown.length === 1 ? "it" : "them"}. Enter the amount in
              Textura from your delivery records after the upload.
            </p>
          )}
          {fill.materialWithoutColumnCents !== 0 && (
            <p className="mt-2 text-sm text-amber-800">
              This application stores {formatCents(fill.materialWithoutColumnCents)} of new
              materials, and the template has no stored materials column: bill them on Textura's
              Stored Materials tab.
            </p>
          )}
          {fill.budgetMismatches.length > 0 && (
            <p className="mt-2 text-sm text-amber-800">
              Textura's budget differs from your scheduled value on{" "}
              {fill.budgetMismatches
                .map(
                  (m) =>
                    `${m.line.description} (${formatCents(m.row.budgetCents ?? 0)} against ${formatCents(m.line.scheduledValueCents)})`,
                )
                .join(", ")}
              . Settle it with the GC (a change order not yet in Textura?) before you submit.
            </p>
          )}
          {fill.unmatchedRows.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              {fill.unmatchedRows.length} Textura row
              {fill.unmatchedRows.length === 1 ? " is" : "s are"} left exactly as the template had{" "}
              {fill.unmatchedRows.length === 1 ? "it" : "them"}.
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Retention cells are left as the template has them: Textura holds retention by the draw's
            settings and overrides amounts in the file that don't meet them. Compare Textura's
            invoice total with this application's line 8 (current payment due) before you sign.
            Checked against Oracle's help pages, not a live Textura project.
          </p>
          <button
            type="button"
            className="btn-secondary mt-3"
            disabled={fill.csv === null}
            onClick={() => {
              if (fill.csv)
                download(
                  `${fileName.replace(/\.(csv|txt|xlsx)$/i, "") || "textura-billing"}-pay-app-${app.number}.csv`,
                  fill.csv,
                );
            }}
          >
            Download the filled CSV for Textura
          </button>
        </>
      )}
    </section>
  );
}
