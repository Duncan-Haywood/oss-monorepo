// Add an estimate's cost lines from a spreadsheet: a bid sheet (.xlsx or CSV), a supplier's quote,
// the takeoff's material list, or rows copied from Excel and pasted. Read in the browser
// (src/shared/estimate-import.ts): the file never leaves it. The lines the user keeps go into the
// estimate's editor, where they are checked and saved with "Save lines" like typed ones. With
// target "price-list" the same reader fills the company's price list from a supplier's price sheet
// (no bid item; the quantity is read and not used).
import {
  type EstimateImportResult,
  type ImportedEstimateLine,
  importEstimateFile,
  readEstimatePaste,
} from "@shared/estimate-import";
import { COST_CATEGORIES, COST_CATEGORY_LABELS, type CostCategory } from "@shared/job-cost";
import { formatCents } from "@shared/money";
import { extendCents, formatQuantity, formatUnitPrice } from "@shared/unit-price";
import { useState } from "react";

interface Row extends ImportedEstimateLine {
  rowId: number;
  keep: boolean;
}

export function EstimateImport({
  existingLines,
  defaultBidItem,
  onAdd,
  target = "estimate",
}: {
  existingLines: number;
  defaultBidItem: string;
  onAdd: (lines: ImportedEstimateLine[]) => void;
  target?: "estimate" | "price-list";
}) {
  const forList = target === "price-list";
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const [paste, setPaste] = useState("");
  const [category, setCategory] = useState<CostCategory>("material");
  const [bidItem, setBidItem] = useState(defaultBidItem);
  const [result, setResult] = useState<EstimateImportResult | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [done, setDone] = useState<string | null>(null);

  const options = () => ({
    defaultCategory: category,
    defaultBidItem: bidItem.trim() || "Base bid",
    existingLines,
  });
  const show = (r: EstimateImportResult) => {
    setResult(r);
    setDone(null);
    setRows(r.ok ? r.lines.map((l, i) => ({ ...l, rowId: i, keep: true })) : []);
  };
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    try {
      show(
        await importEstimateFile(file.name, new Uint8Array(await file.arrayBuffer()), options()),
      );
    } finally {
      setReading(false);
    }
  };

  if (!open)
    return (
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        Import from a spreadsheet
      </button>
    );

  const kept = rows.filter((r) => r.keep);
  return (
    <div className="mt-3 space-y-2 rounded border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{forList ? "Import prices" : "Import cost lines"}</h3>
        <button
          type="button"
          className="text-xs text-slate-500 underline"
          onClick={() => setOpen(false)}
        >
          Close
        </button>
      </div>
      <p className="text-sm text-slate-600">
        Choose your bid sheet, a supplier's quote or a takeoff material list (.xlsx or CSV), or copy
        the rows in Excel or Google Sheets, header row included, and paste them below. Columns are
        found by their headers: description, quantity, unit, unit cost or total, and if you have
        them, bid item and category (or a unit cost per category: material, labor, equipment, sub).
        The file is read in this browser and never uploaded.
      </p>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        {!forList && (
          <label className="block">
            <span className="text-xs text-slate-500">Bid item when the sheet has none</span>
            <input className="input" value={bidItem} onChange={(e) => setBidItem(e.target.value)} />
          </label>
        )}
        <label className="block">
          <span className="text-xs text-slate-500">Category when the sheet has none</span>
          <select
            className="input"
            value={category}
            onChange={(e) => setCategory(e.target.value as CostCategory)}
          >
            {COST_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {COST_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <input
          type="file"
          aria-label="Bid sheet or quote"
          accept=".xlsx,.xlsm,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          onChange={(e) => void onFile(e.target.files?.[0])}
          disabled={reading}
        />
      </div>
      <textarea
        className="input h-24 w-full font-mono text-xs"
        aria-label="Pasted rows"
        placeholder={"Description\tQty\tUnit\tUnit cost\n26 ga duct\t1200\tLB\t2.15"}
        value={paste}
        onChange={(e) => setPaste(e.target.value)}
      />
      <button
        type="button"
        className="btn-secondary"
        disabled={!paste.trim()}
        onClick={() => show(readEstimatePaste(paste, options()))}
      >
        Read pasted rows
      </button>
      {reading && <p className="text-sm text-slate-500">Reading…</p>}
      {done && <p className="text-sm text-emerald-700">{done}</p>}
      {result && !result.ok && <p className="text-sm text-red-700">{result.error}</p>}
      {result?.ok && (
        <div className="space-y-2">
          <p className="text-sm">
            {rows.length} cost lines read (columns: {result.columns.join(", ")}).
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
          <div className="max-h-96 overflow-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th />
                  {!forList && <th>Bid item</th>}
                  <th>Category</th>
                  <th>Description</th>
                  <th className="text-right">Qty</th>
                  <th>Unit</th>
                  <th className="text-right">Unit cost</th>
                  <th className="text-right">Cost</th>
                  <th>Check</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.rowId} className="border-t border-slate-100 align-top">
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Add ${r.source}`}
                        checked={r.keep}
                        onChange={(e) =>
                          setRows(
                            rows.map((x, k) => (k === i ? { ...x, keep: e.target.checked } : x)),
                          )
                        }
                      />
                    </td>
                    {!forList && <td>{r.bidItem}</td>}
                    <td>{COST_CATEGORY_LABELS[r.category]}</td>
                    <td>{r.description}</td>
                    <td className="text-right tabular-nums">{formatQuantity(r.quantityMilli)}</td>
                    <td>{r.unit ?? ""}</td>
                    <td className="text-right tabular-nums">{formatUnitPrice(r.unitCostMicros)}</td>
                    <td className="text-right tabular-nums">
                      {formatCents(extendCents(r.quantityMilli, r.unitCostMicros))}
                    </td>
                    <td className="text-xs text-amber-700">
                      {r.source}
                      {r.flags.map((f) => (
                        <div key={f}>{f}</div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="btn"
            disabled={kept.length === 0}
            onClick={() => {
              onAdd(kept.map(({ rowId: _r, keep: _k, ...l }) => l));
              setDone(
                forList
                  ? `Sent ${kept.length} price${kept.length === 1 ? "" : "s"} to the price list.`
                  : `Added ${kept.length} line${kept.length === 1 ? "" : "s"} below. Check them, then Save lines.`,
              );
              setResult(null);
              setRows([]);
              setPaste("");
            }}
          >
            {forList
              ? `Add or update ${kept.length} price${kept.length === 1 ? "" : "s"} on the price list`
              : `Add ${kept.length} line${kept.length === 1 ? "" : "s"} to the estimate`}
          </button>
        </div>
      )}
    </div>
  );
}
