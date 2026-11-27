// Inventory page: import a sourcing sheet saved as CSV. Preview first (dryRun), then import.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, orgPath, usd } from "../lib/api";
import { ErrorText } from "../routes/public";

interface SheetSummary {
  dryRun: boolean;
  rowCount: number;
  itemsCreated: number;
  duplicatesSkipped: number;
  rowsSkipped: number;
  salesLinked: number;
  totalCostCents: number;
  skipped: { line: number; reason: string }[];
  warnings: string[];
  matched: Record<string, string>;
}

const MAX_BYTES = 5 * 1024 * 1024;

const FIELD_LABELS: Record<string, string> = {
  title: "Item",
  sku: "SKU",
  quantity: "Quantity",
  unitCost: "Unit cost",
  totalCost: "Row total",
  bought: "Date bought",
  status: "Status",
  removed: "Date removed",
  sold: "Date sold (not used)",
};

export function SheetImport({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const send = useMutation({
    mutationFn: async (dryRun: boolean) => {
      if (!file) throw new Error("Choose a CSV file");
      if (file.size > MAX_BYTES) throw new Error("File is larger than 5 MB: split the sheet.");
      const csv = await file.text();
      return api<SheetSummary>(orgPath(orgId, "/inventory/items/import"), {
        method: "POST",
        body: { fileName: file.name, csv, dryRun },
      });
    },
    onSuccess: (s) => (s.dryRun ? undefined : qc.invalidateQueries()),
  });
  const s = send.data;
  return (
    <section className="card space-y-2">
      <h2 className="font-medium">Import your sourcing sheet</h2>
      <p className="text-sm text-stone-600">
        Save the spreadsheet you track purchases in as CSV. It needs a date bought, a cost (each or
        for the row) and an item name or SKU; quantity, status ("kept", "donated") and date removed
        are read when present. Nothing is saved until you press Import, and importing the same sheet
        again adds only new rows.
      </p>
      <input
        className="input"
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          send.reset();
        }}
      />
      <div className="space-x-2">
        <button
          className="btn"
          type="button"
          disabled={!file || send.isPending}
          onClick={() => send.mutate(true)}
        >
          Preview
        </button>
        {s?.dryRun && s.itemsCreated > 0 && (
          <button
            className="btn"
            type="button"
            disabled={send.isPending}
            onClick={() => send.mutate(false)}
          >
            Import {s.itemsCreated} items
          </button>
        )}
      </div>
      <ErrorText error={send.error} />
      {s && (
        <div className="space-y-1 text-sm">
          <p>
            {s.dryRun ? "Would add" : "Added"} {s.itemsCreated} items costing{" "}
            {usd(s.totalCostCents)} from {s.rowCount} rows. {s.duplicatesSkipped} already in your
            books, {s.rowsSkipped} rows skipped, {s.salesLinked} earlier{" "}
            {s.salesLinked === 1 ? "sale" : "sales"} {s.dryRun ? "would be" : ""} linked by SKU.
          </p>
          <p className="text-xs text-stone-500">
            Columns read:{" "}
            {Object.entries(s.matched)
              .map(([k, v]) => `${FIELD_LABELS[k] ?? k} ← "${v}"`)
              .join(", ")}
          </p>
          {s.warnings.map((w) => (
            <p key={w} className="text-accent-700">
              {w}
            </p>
          ))}
          {s.skipped.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-stone-600">
              {s.skipped.map((k) => (
                <li key={k.line}>
                  Line {k.line}: {k.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
