// Upload marketplace reports; list past imports; sales list with item linking.
import { FEE_KIND_LABELS, type FeeKind, PLATFORM_LABELS, type Platform } from "@shared/enums";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, orgPath, usd } from "../lib/api";
import { useOrgId } from "./org";
import { ErrorText } from "./public";

interface ReportDef {
  key: string;
  platform: string;
  label: string;
}

interface Summary {
  salesCreated: number;
  chargesCreated: number;
  duplicatesSkipped: number;
  rowsSkipped: number;
  itemsLinked: number;
  skipped: { line: number; reason: string }[];
  warnings: string[];
}

interface Batch {
  id: string;
  platform: string;
  reportKind: string;
  fileName: string;
  salesCreated: number;
  chargesCreated: number;
  duplicatesSkipped: number;
  rowsSkipped: number;
  createdAt: string;
}

const MAX_BYTES = 5 * 1024 * 1024;

export function ImportsPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const reports = useQuery({
    queryKey: ["reports"],
    queryFn: () => api<{ items: ReportDef[] }>("/api/reference/reports"),
  });
  const batches = useQuery({
    queryKey: ["imports", orgId],
    queryFn: () => api<{ items: Batch[] }>(orgPath(orgId, "/imports")),
  });
  const [report, setReport] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a CSV file");
      if (file.size > MAX_BYTES)
        throw new Error("File is larger than 5 MB: split it by date range.");
      const csv = await file.text();
      return api<Summary>(orgPath(orgId, "/imports"), {
        method: "POST",
        body: { report: report || reports.data?.items[0]?.key, fileName: file.name, csv },
      });
    },
    onSuccess: () => qc.invalidateQueries(),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(orgPath(orgId, `/imports/${id}`), { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries(),
  });
  const s = upload.data;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Imports</h1>
      <section className="card space-y-3">
        <p className="text-sm text-stone-600">
          Download the report from the marketplace and upload it here. Fees come only from the
          report's own columns; importing the same file twice skips rows already imported.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <label>
            <span className="label">Report</span>
            <select className="input" value={report} onChange={(e) => setReport(e.target.value)}>
              {reports.data?.items.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">CSV file</span>
            <input
              className="input"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        <button
          type="button"
          className="btn"
          disabled={!file || upload.isPending}
          onClick={() => upload.mutate()}
        >
          {upload.isPending ? "Importing…" : "Import"}
        </button>
        <ErrorText error={upload.error} />
        {s && (
          <div className="rounded-md bg-brand-50 p-3 text-sm">
            <p>
              {s.salesCreated} sales and {s.chargesCreated} other charges imported;{" "}
              {s.duplicatesSkipped} already imported; {s.rowsSkipped} rows skipped; {s.itemsLinked}{" "}
              sales matched to inventory by SKU.
            </p>
            {s.warnings.map((w) => (
              <p key={w} className="text-accent-700">
                {w}
              </p>
            ))}
            {s.skipped.length > 0 && (
              <details className="mt-2">
                <summary>Skipped rows</summary>
                <ul>
                  {s.skipped.map((r) => (
                    <li key={r.line}>
                      Line {r.line}: {r.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </section>
      <section className="card">
        <h2 className="mb-2 font-medium">Past imports</h2>
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>File</th>
              <th>Platform</th>
              <th className="num">Sales</th>
              <th className="num">Charges</th>
              <th className="num">Duplicates</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {batches.data?.items.map((b) => (
              <tr key={b.id}>
                <td>{new Date(b.createdAt).toLocaleString()}</td>
                <td>{b.fileName}</td>
                <td>{PLATFORM_LABELS[b.platform as Platform] ?? b.platform}</td>
                <td className="num">{b.salesCreated}</td>
                <td className="num">{b.chargesCreated}</td>
                <td className="num">{b.duplicatesSkipped}</td>
                <td>
                  <button
                    type="button"
                    className="text-xs text-red-700 underline"
                    onClick={() => {
                      if (confirm("Delete this import and every sale and charge it created?"))
                        remove.mutate(b.id);
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

interface SaleRow {
  id: string;
  platform: string;
  kind: string;
  date: string;
  title: string | null;
  sku: string | null;
  itemCents: number;
  shippingChargedCents: number;
  refundCents: number;
  shippingLabelCents: number;
  netCents: number | null;
  inventoryItemId: string | null;
  fees: { kind: string; amountCents: number; sourceColumn: string }[];
}

interface ItemRow {
  id: string;
  title: string;
  sku: string | null;
  costCents: number;
}

export function SalesPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const [unlinked, setUnlinked] = useState(false);
  const sales = useQuery({
    queryKey: ["sales", orgId, unlinked],
    queryFn: () =>
      api<{ items: SaleRow[] }>(
        orgPath(orgId, `/sales?limit=500${unlinked ? "&unlinked=true" : ""}`),
      ),
  });
  const stock = useQuery({
    queryKey: ["items", orgId, "in_stock"],
    queryFn: () =>
      api<{ items: ItemRow[] }>(orgPath(orgId, "/inventory/items?status=in_stock&limit=500")),
  });
  const link = useMutation({
    mutationFn: ({ saleId, itemId }: { saleId: string; itemId: string | null }) =>
      itemId
        ? api(orgPath(orgId, `/sales/${saleId}/link-item`), { method: "POST", body: { itemId } })
        : api(orgPath(orgId, `/sales/${saleId}/link-item`), { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries(),
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <h1 className="mr-auto text-2xl font-semibold">Sales</h1>
        <label className="text-sm">
          <input
            type="checkbox"
            checked={unlinked}
            onChange={(e) => setUnlinked(e.target.checked)}
          />{" "}
          Only orders without an item
        </label>
      </div>
      <ErrorText error={link.error} />
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Platform</th>
              <th>Item</th>
              <th className="num">Sale</th>
              <th>Fees (from report)</th>
              <th className="num">Net</th>
              <th>Inventory item</th>
            </tr>
          </thead>
          <tbody>
            {sales.data?.items.map((s) => (
              <tr key={s.id}>
                <td>{s.date}</td>
                <td>{PLATFORM_LABELS[s.platform as Platform] ?? s.platform}</td>
                <td>
                  {s.kind === "refund" && (
                    <span className="mr-1 rounded bg-red-50 px-1 text-xs text-red-700">refund</span>
                  )}
                  {s.title ?? "—"}
                  {s.sku && <span className="ml-1 text-xs text-stone-500">{s.sku}</span>}
                </td>
                <td className="num">
                  {s.kind === "refund"
                    ? `−${usd(s.refundCents)}`
                    : usd(s.itemCents + s.shippingChargedCents)}
                </td>
                <td className="text-xs">
                  {s.fees.map((f) => (
                    <div key={`${f.kind}-${f.sourceColumn}`} title={`Column: ${f.sourceColumn}`}>
                      {FEE_KIND_LABELS[f.kind as FeeKind] ?? f.kind}: {usd(f.amountCents)}
                    </div>
                  ))}
                  {s.shippingLabelCents > 0 && <div>Postage: {usd(s.shippingLabelCents)}</div>}
                </td>
                <td className="num">{usd(s.netCents)}</td>
                <td>
                  {s.kind === "order" &&
                    (s.inventoryItemId ? (
                      <button
                        type="button"
                        className="text-xs underline"
                        onClick={() => link.mutate({ saleId: s.id, itemId: null })}
                      >
                        Linked · unlink
                      </button>
                    ) : (
                      <select
                        className="input text-xs"
                        value=""
                        onChange={(e) =>
                          e.target.value && link.mutate({ saleId: s.id, itemId: e.target.value })
                        }
                      >
                        <option value="">Link item…</option>
                        {stock.data?.items.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.title} ({usd(i.costCents)})
                          </option>
                        ))}
                      </select>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
