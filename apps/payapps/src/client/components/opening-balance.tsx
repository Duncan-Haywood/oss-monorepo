// Mid-job start: enter the last pay application made before the job moved here (from its summary
// and continuation sheet), so the first application here continues the numbering, column D and
// line 7. Editable only until the first application here exists.
import type { ProjectDetailDto } from "@shared/api/types";
import { formatCents } from "@shared/money";
import {
  importSovFile,
  type OpeningFill,
  openingFromImport,
  overScheduled,
  placeUnmatched,
} from "@shared/sov-import";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { ErrorText } from "./error";
import { MoneyInput } from "./money-input";

export function OpeningBalance(props: {
  project: ProjectDetailDto;
  path: string;
  onSaved: (d: ProjectDetailDto) => void;
}) {
  const { project: p, path, onSaved } = props;
  const locked = p.payApps.length > 0;
  const [open, setOpen] = useState(p.opening !== null);
  const [form, setForm] = useState(() => ({
    appNumber: String(p.opening?.appNumber ?? ""),
    periodTo: p.opening?.periodTo ?? "",
    previousCertificatesCents: p.opening?.previousCertificatesCents ?? 0,
    retainageHeldCents: p.opening?.retainageHeldCents ?? null,
    completed: Object.fromEntries(p.sovLines.map((l) => [l.id, l.openingCompletedCents])),
    released: Object.fromEntries(p.sovLines.map((l) => [l.id, l.openingReleasedCents])),
  }));
  // Retainage released on a line before the move (a finished line paid out in full, say): shown on request.
  const [showReleased, setShowReleased] = useState(() =>
    p.sovLines.some((l) => l.openingReleasedCents > 0),
  );
  /** Released before the move on a line; 0 while the column is hidden, so a hidden figure is never saved. */
  const released = (id: string) => (showReleased ? (form.released[id] ?? 0) : 0);
  const save = useMutation({
    mutationFn: () => {
      const appNumber = Number(form.appNumber);
      if (!Number.isInteger(appNumber) || appNumber < 1)
        throw new Error("Enter the number of the last application made elsewhere");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(form.periodTo))
        throw new Error("Enter the period end of that application");
      return api<ProjectDetailDto>(path, {
        method: "PUT",
        body: {
          appNumber,
          periodTo: form.periodTo,
          previousCertificatesCents: form.previousCertificatesCents,
          retainageHeldCents: form.retainageHeldCents,
          lines: p.sovLines
            .filter((l) => (form.completed[l.id] ?? 0) > 0 || released(l.id) > 0)
            .map((l) => ({
              sovLineId: l.id,
              completedCents: form.completed[l.id] ?? 0,
              ...(released(l.id) > 0 ? { releasedCents: released(l.id) } : {}),
            })),
        },
      });
    },
    onSuccess: onSaved,
  });
  const [fill, setFill] = useState<{ fileName: string; result: OpeningFill } | null>(null);
  const [reading, setReading] = useState(false);
  /** Unmatched sheet row (by its source) -> the job line the contractor put its work on. */
  const [placed, setPlaced] = useState<Record<string, string>>({});

  // Puts an unmatched row's work on the line chosen (or moves it, or takes it off with ""): the amount goes on top
  // of what the line shows and comes back off the line it was on, so figures typed by hand elsewhere stay.
  function place(source: string, cents: number, to: string) {
    const from = placed[source] ?? null;
    setPlaced(({ [source]: _, ...rest }) => (to ? { ...rest, [source]: to } : rest));
    setForm((f) => ({ ...f, completed: placeUnmatched(f.completed, cents, from, to || null) }));
  }

  // Reads the contractor's last continuation sheet in the browser (never uploaded) and fills the form from it.
  async function onSheet(file: File | undefined) {
    if (!file) return;
    setReading(true);
    save.reset();
    try {
      const sheet = await importSovFile(file.name, new Uint8Array(await file.arrayBuffer()));
      const result: OpeningFill = sheet.ok
        ? openingFromImport(sheet, p.sovLines)
        : { ok: false, error: sheet.error };
      setFill({ fileName: file.name, result });
      setPlaced({});
      if (!result.ok) return;
      setForm((f) => ({
        appNumber:
          result.applicationNumber !== null ? String(result.applicationNumber) : f.appNumber,
        periodTo: result.periodTo ?? f.periodTo,
        previousCertificatesCents: result.line6Cents ?? f.previousCertificatesCents,
        retainageHeldCents: result.line5aCents ?? f.retainageHeldCents,
        completed: result.completed,
        released: f.released,
      }));
    } finally {
      setReading(false);
    }
  }

  const clear = useMutation({
    mutationFn: () => api<ProjectDetailDto>(path, { method: "DELETE" }),
    onSuccess: (d) => {
      onSaved(d);
      setOpen(false);
    },
  });

  if (p.sovLines.length === 0) return null;
  if (locked && !p.opening) return null;
  const workTotal = p.sovLines.reduce((s, l) => s + (form.completed[l.id] ?? 0), 0);
  const releasedTotal = p.sovLines.reduce((s, l) => s + released(l.id), 0);

  if (locked && p.opening) {
    return (
      <section className="card">
        <h2 className="mb-1 font-semibold">Billed before this job moved here</h2>
        <p className="text-sm text-slate-600">
          Application #{p.opening.appNumber} through {p.opening.periodTo}: work completed{" "}
          {formatCents(p.sovLines.reduce((s, l) => s + l.openingCompletedCents, 0))}, total earned
          less retainage {formatCents(p.opening.previousCertificatesCents)}
          {p.sovLines.some((l) => l.openingReleasedCents > 0)
            ? `, retainage released before the move ${formatCents(
                p.sovLines.reduce((s, l) => s + l.openingReleasedCents, 0),
              )}`
            : ""}
          . Locked now that an application has been made here.
        </p>
      </section>
    );
  }

  if (!open) {
    return (
      <section className="card">
        <h2 className="mb-1 font-semibold">Already billing this job somewhere else?</h2>
        <p className="mb-2 text-sm text-slate-600">
          Enter your last pay application from your spreadsheet or old software. Your first
          application here continues its number, its work to date and its previous certificates.
        </p>
        <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
          Enter the last application
        </button>
      </section>
    );
  }

  return (
    <section className="card">
      <h2 className="mb-1 font-semibold">Last application made elsewhere</h2>
      <p className="mb-3 text-sm text-slate-600">
        Copy these from that application, or fill them from its continuation sheet. Work completed
        is columns D + E of the continuation sheet (not stored materials, which you enter again on
        the next application).
      </p>
      <div className="mb-3 rounded border border-slate-200 p-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Fill from your last continuation sheet</span>
          <span className="mb-2 block text-slate-600">
            The .xlsx, CSV or PDF of the last application you sent (G703 or your own layout). A
            workbook with the summary page (G702) on another tab, or a PDF with it on another page,
            gives lines 5a and 6 too, even with stored materials. It is read in your browser and not
            uploaded; nothing is saved until you check the figures and save.
          </span>
          <input
            type="file"
            accept=".xlsx,.xlsm,.csv,.tsv,.txt,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/pdf"
            onChange={(e) => void onSheet(e.target.files?.[0])}
          />
        </label>
        {reading && <p className="mt-2 text-sm">Reading…</p>}
        {fill && !fill.result.ok && (
          <p className="mt-2 text-sm text-red-700" role="alert">
            {fill.fileName}: {fill.result.error}
          </p>
        )}
        {fill?.result.ok && (
          <FillReport
            fileName={fill.fileName}
            fill={fill.result}
            lines={p.sovLines}
            placed={placed}
            over={Object.keys(placed).length ? overScheduled(form.completed, p.sovLines) : []}
            onPlace={place}
          />
        )}
      </div>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="text-sm">
            Application no.
            <input
              className="input"
              inputMode="numeric"
              value={form.appNumber}
              onChange={(e) => setForm({ ...form, appNumber: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Period to
            <input
              type="date"
              className="input"
              value={form.periodTo}
              onChange={(e) => setForm({ ...form, periodTo: e.target.value })}
            />
          </label>
          <div className="text-sm">
            Line 6, earned less retainage
            <MoneyInput
              label="Line 6, total earned less retainage"
              min={0}
              value={form.previousCertificatesCents}
              onChange={(c) => setForm({ ...form, previousCertificatesCents: c })}
            />
          </div>
          <div className="text-sm">
            Line 5a, retainage on work (optional)
            <MoneyInput
              label="Line 5a, retainage on completed work"
              min={0}
              value={form.retainageHeldCents ?? 0}
              onChange={(c) => setForm({ ...form, retainageHeldCents: c || null })}
            />
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={showReleased}
            onChange={(e) => setShowReleased(e.target.checked)}
          />
          <span>
            Some retainage was already released on certain lines (a finished line paid out in full,
            say). Enter what was released on each line up to that application, so the first
            application here holds only what is still retained.
          </span>
        </label>
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Item</th>
              <th className="th text-right">Scheduled</th>
              <th className="th text-right">Work completed to date</th>
              {showReleased && (
                <th className="th text-right">Retainage released before the move</th>
              )}
            </tr>
          </thead>
          <tbody>
            {p.sovLines.map((l) => (
              <tr key={l.id}>
                <td className="td">
                  {l.itemNumber} {l.description}
                </td>
                <td className="td text-right">{formatCents(l.currentCents)}</td>
                <td className="td">
                  <MoneyInput
                    label={`Work completed to date, item ${l.itemNumber}`}
                    min={0}
                    value={form.completed[l.id] ?? 0}
                    onChange={(c) =>
                      setForm({ ...form, completed: { ...form.completed, [l.id]: c } })
                    }
                  />
                </td>
                {showReleased && (
                  <td className="td">
                    <MoneyInput
                      label={`Retainage released before the move, item ${l.itemNumber}`}
                      min={0}
                      value={form.released[l.id] ?? 0}
                      onChange={(c) =>
                        setForm({ ...form, released: { ...form.released, [l.id]: c } })
                      }
                    />
                  </td>
                )}
              </tr>
            ))}
            <tr>
              <td className="td font-medium">Total</td>
              <td className="td" />
              <td className="td text-right font-medium">{formatCents(workTotal)}</td>
              {showReleased && (
                <td className="td text-right font-medium">{formatCents(releasedTotal)}</td>
              )}
            </tr>
          </tbody>
        </table>
        <div className="flex gap-2">
          <button type="submit" className="btn" disabled={save.isPending}>
            Save opening balance
          </button>
          {p.opening && (
            <button
              type="button"
              className="btn-secondary"
              disabled={clear.isPending}
              onClick={() => clear.mutate()}
            >
              Remove
            </button>
          )}
        </div>
        <ErrorText error={save.error ?? clear.error} />
      </form>
    </section>
  );
}

function FillReport({
  fileName,
  fill,
  lines,
  placed,
  over,
  onPlace,
}: {
  fileName: string;
  fill: Extract<OpeningFill, { ok: true }>;
  lines: ProjectDetailDto["sovLines"];
  placed: Record<string, string>;
  over: string[];
  onPlace: (source: string, cents: number, to: string) => void;
}) {
  const placeable = fill.unmatched.filter(
    (u): u is typeof u & { completedCents: number } =>
      u.completedCents !== null && u.completedCents > 0,
  );
  const filled = [
    fill.applicationNumber !== null && "the application number",
    fill.periodTo !== null && "the period end",
    fill.line6Cents !== null && "line 6",
    fill.line5aCents !== null && "line 5a",
  ].filter(Boolean);
  return (
    <div className="mt-3 space-y-2 text-sm" aria-live="polite">
      <p>
        Filled from {fileName}: work completed on {fill.matched.length} line
        {fill.matched.length === 1 ? "" : "s"} ({formatCents(fill.sheetCompletedCents)} on the sheet
        in all)
        {filled.length
          ? `, and ${filled.length > 1 ? `${filled.slice(0, -1).join(", ")} and ${filled.at(-1)}` : filled[0]}`
          : ""}
        . Check every figure against the application before saving.
      </p>
      {fill.checks.length > 0 && (
        <ul className="list-disc space-y-1 pl-5">
          {fill.checks.map((c) => (
            <li
              key={c.message}
              className={c.severity === "high" ? "text-red-700" : "text-amber-700"}
            >
              {c.message}
            </li>
          ))}
        </ul>
      )}
      {placeable.length > 0 && (
        <fieldset className="rounded border border-slate-200 p-2">
          <legend className="px-1 font-medium">Put the rows that did not match on a line</legend>
          <p className="mb-2 text-slate-600">
            Each amount is added to what the line shows (a change order that added to an existing
            line goes on that line). Leave a row on "Not on a line" to enter its work yourself.
          </p>
          <ul className="space-y-1">
            {placeable.map((u) => (
              <li key={u.source} className="flex flex-wrap items-center gap-2">
                <span>
                  {u.label} ({u.source}, {formatCents(u.completedCents)})
                </span>
                <select
                  className="input w-auto"
                  aria-label={`Line for ${u.label} (${u.source})`}
                  value={placed[u.source] ?? ""}
                  onChange={(e) => onPlace(u.source, u.completedCents, e.target.value)}
                >
                  <option value="">Not on a line</option>
                  {lines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {[l.itemNumber, l.description].filter(Boolean).join(" ")}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          {over.length > 0 && (
            <p className="mt-2 text-red-700" role="alert">
              More work completed than the line's scheduled value: {over.join("; ")}. Check the line
              chosen, or add the change order that covers it.
            </p>
          )}
        </fieldset>
      )}
      {fill.notes.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-slate-600">
          {fill.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
