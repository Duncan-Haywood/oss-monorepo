// The pencil review on a draft pay application: print the pencil copy for the GC, type or paste the
// figures the GC's PM marked up, see what changed, put them into the draft, and copy a cover note
// listing the revised lines for the official application (src/shared/pencil-review.ts).
import { formatCents } from "@shared/money";
import {
  applyPencil,
  type PencilEntry,
  type PencilMarks,
  parsePastedColumn,
  pencilDiff,
  pencilNote,
} from "@shared/pencil-review";
import { useState } from "react";
import { MoneyInput } from "./money-input";

export interface PencilReviewProps {
  base: string;
  rows: readonly { id: string; itemNumber: string; description: string }[];
  entries: Readonly<Record<string, PencilEntry>>;
  editable: boolean;
  jobName: string;
  applicationNumber: number;
  periodTo: string;
  gcPmName: string | null;
  contractorName: string;
  /** Puts the GC's figures into the editor (the page's Save then stores them). */
  onApply: (entries: Record<string, PencilEntry>) => void;
}

type Field = "workThisPeriodCents" | "storedMaterialsCents";

export function PencilReviewPanel(p: PencilReviewProps) {
  const [open, setOpen] = useState(false);
  const [marks, setMarks] = useState<PencilMarks>({});
  const [reviewedOn, setReviewedOn] = useState("");
  const [paste, setPaste] = useState("");
  const [pasteField, setPasteField] = useState<Field>("workThisPeriodCents");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  // The draft's figures as the pencil had them, taken when the markup is first opened, so the
  // comparison and the note still read "ours to the GC's" after the GC's figures are put in.
  const [baseline, setBaseline] = useState<Record<string, PencilEntry> | null>(null);

  const current = (r: { id: string }) => p.entries[r.id];
  const lines = p.rows.map((r) => {
    const e = baseline ? baseline[r.id] : current(r);
    return {
      sovLineId: r.id,
      itemNumber: r.itemNumber,
      description: r.description,
      workThisPeriodCents: e?.workThisPeriodCents ?? 0,
      storedMaterialsCents: e?.storedMaterialsCents ?? 0,
    };
  });
  const toggle = () => {
    if (!open && baseline === null) setBaseline({ ...p.entries });
    setOpen(!open);
  };
  const startOver = () => {
    setBaseline({ ...p.entries });
    setMarks({});
    setApplied(false);
  };
  const diff = pencilDiff(lines, marks);
  const note = pencilNote({
    gcContactName: p.gcPmName,
    jobName: p.jobName,
    applicationNumber: p.applicationNumber,
    periodTo: p.periodTo,
    reviewedOn: reviewedOn || null,
    diff,
    contractorName: p.contractorName,
  });

  const mark = (id: string, field: Field, cents: number) => {
    setMarks((m) => ({ ...m, [id]: { ...m[id], [field]: cents } }));
    setApplied(false);
  };

  const fillFromPaste = () => {
    const { amounts, badRows } = parsePastedColumn(paste);
    if (badRows.length) {
      setPasteError(`Not an amount on row ${badRows.join(", ")}`);
      return;
    }
    if (amounts.length !== p.rows.length) {
      setPasteError(
        `${amounts.length} rows pasted for ${p.rows.length} lines: paste one cell per line, in the continuation sheet's order`,
      );
      return;
    }
    setPasteError(null);
    setMarks((m) => {
      const next = { ...m };
      p.rows.forEach((r, i) => {
        const v = amounts[i];
        if (v !== null && v !== undefined) next[r.id] = { ...next[r.id], [pasteField]: v };
      });
      return next;
    });
    setApplied(false);
  };

  return (
    <section className="card">
      <h2 className="mb-1 font-semibold">Pencil draft for the GC</h2>
      <p className="text-sm text-slate-600">
        GC asks for a pencil copy before the official application? Send this draft marked "Pencil
        draft - for GC review, not for payment", then enter the figures the GC marks up and submit
        on them.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <a className="btn-secondary" href={`${p.base}/application.pdf?pencil=1`}>
          Pencil PDF
        </a>
        <a className="btn-secondary" href={`${p.base}/packet.pdf?pencil=1`}>
          Pencil PDF with backup
        </a>
        <button type="button" className="btn-secondary" onClick={toggle}>
          {open ? "Hide the GC's markup" : "Enter the GC's markup"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          <label className="block max-w-xs text-sm">
            <span className="text-slate-600">Day the GC returned the pencil (optional)</span>
            <input
              type="date"
              className="input"
              value={reviewedOn}
              onChange={(e) => setReviewedOn(e.target.value)}
            />
          </label>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr>
                  <th className="th">Item</th>
                  <th className="th">Description</th>
                  <th className="th text-right">Our work this period</th>
                  <th className="th text-right">GC's work this period</th>
                  <th className="th text-right">Our stored</th>
                  <th className="th text-right">GC's stored</th>
                  <th className="th text-right">Change</th>
                </tr>
              </thead>
              <tbody>
                {diff.lines.map((l) => (
                  <tr key={l.sovLineId} className={l.changed ? "bg-amber-50" : ""}>
                    <td className="td">{l.itemNumber}</td>
                    <td className="td">{l.description}</td>
                    <td className="td text-right">{formatCents(l.oursWorkCents)}</td>
                    <td className="td w-36">
                      <MoneyInput
                        label={`GC's work this period, item ${l.itemNumber}`}
                        value={l.gcWorkCents}
                        onChange={(v) => mark(l.sovLineId, "workThisPeriodCents", v)}
                      />
                    </td>
                    <td className="td text-right">{formatCents(l.oursStoredCents)}</td>
                    <td className="td w-36">
                      <MoneyInput
                        label={`GC's stored materials, item ${l.itemNumber}`}
                        value={l.gcStoredCents}
                        min={0}
                        onChange={(v) => mark(l.sovLineId, "storedMaterialsCents", v)}
                      />
                    </td>
                    <td className="td text-right">
                      {l.changeCents === 0 ? "" : formatCents(l.changeCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer">Paste a column from the GC's spreadsheet</summary>
            <div className="mt-2 space-y-2">
              <label className="block">
                <span className="text-slate-600">The column fills</span>
                <select
                  className="input max-w-xs"
                  value={pasteField}
                  onChange={(e) => setPasteField(e.target.value as Field)}
                >
                  <option value="workThisPeriodCents">Work this period</option>
                  <option value="storedMaterialsCents">Stored materials</option>
                </select>
              </label>
              <textarea
                aria-label="Pasted column"
                className="input h-28 font-mono"
                placeholder="One amount per line, in the continuation sheet's order; a blank or - leaves the line as billed"
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
              />
              <button type="button" className="btn-secondary" onClick={fillFromPaste}>
                Fill from the pasted column
              </button>
              {pasteError && <p className="text-red-700">{pasteError}</p>}
            </div>
          </details>

          <p className="text-sm" data-testid="pencil-summary">
            {diff.changedCount === 0
              ? "The GC's figures match the draft."
              : `${diff.changedCount} line${diff.changedCount === 1 ? "" : "s"} changed: this period's work and stored ${formatCents(diff.oursTotalCents)} to ${formatCents(diff.gcTotalCents)} (${formatCents(diff.changeCents)} before retainage).`}
          </p>

          {p.editable && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn"
                disabled={diff.changedCount === 0}
                onClick={() => {
                  p.onApply(applyPencil(p.entries, marks));
                  setApplied(true);
                }}
              >
                Put the GC's figures in this draft
              </button>
              <button type="button" className="btn-secondary" onClick={startOver}>
                Start over from the draft as it is now
              </button>
              {applied && (
                <span className="text-sm text-amber-700">
                  In the continuation sheet above: Save to update the summary and line 8.
                </span>
              )}
            </div>
          )}

          <label className="block text-sm">
            <span className="text-slate-600">
              Cover note for the official application (edit before sending)
            </span>
            <textarea aria-label="Cover note" className="input h-40" readOnly value={note} />
          </label>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void navigator.clipboard?.writeText(note)}
          >
            Copy note
          </button>
        </div>
      )}
    </section>
  );
}
