// Upload marketplace reports; list past imports; sales list with item linking; direct sales typed in.
import {
  DIRECT,
  FEE_KIND_LABELS,
  type FeeKind,
  PLATFORM_LABELS,
  type Platform,
} from "@shared/enums";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, dollarsToCents, orgPath, today, usd } from "../lib/api";
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
      <section className="card overflow-x-auto">
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

const blankDirect = {
  kind: "order" as "order" | "refund",
  date: today(),
  title: "",
  amount: "",
  shipping: "",
  fee: "",
  postage: "",
  itemId: "",
  notes: "",
};

/** Cents from an optional dollar field ("" = 0). */
const optionalCents = (s: string) => (s.trim() ? dollarsToCents(s) : 0);

/** A sale made off the marketplaces: cash, Facebook Marketplace, a market stall, a local pickup. */
function DirectSaleForm({ orgId, stock }: { orgId: string; stock: ItemRow[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [x, setX] = useState(blankDirect);
  const add = useMutation({
    mutationFn: () => {
      const order = x.kind === "order";
      return api(orgPath(orgId, "/sales"), {
        method: "POST",
        body: {
          kind: x.kind,
          date: x.date,
          title: x.title,
          ...(order
            ? {
                itemCents: dollarsToCents(x.amount),
                shippingChargedCents: optionalCents(x.shipping),
              }
            : { refundCents: dollarsToCents(x.amount) }),
          paymentFeeCents: optionalCents(x.fee),
          shippingLabelCents: optionalCents(x.postage),
          itemId: order && x.itemId ? x.itemId : null,
          notes: x.notes || null,
        },
      });
    },
    onSuccess: () => {
      setX({ ...blankDirect, date: x.date, kind: x.kind });
      return qc.invalidateQueries();
    },
  });
  if (!open)
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        Add a direct sale
      </button>
    );
  const order = x.kind === "order";
  return (
    <form
      className="card grid gap-2 md:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <h2 className="font-medium md:col-span-4">Add a direct sale</h2>
      <p className="text-sm text-stone-600 md:col-span-4">
        A sale with no marketplace report: cash at a market or flea market, Facebook Marketplace, a
        local pickup paid by Venmo, PayPal or Cash App. It counts in your profit and loss and in
        gross receipts on the Schedule C worksheet like an imported order. Enter the price before
        any sales tax. Booth fees and market rent go under Expenses.
      </p>
      <label className="text-sm">
        <span className="label">Type</span>
        <select
          className="input w-full"
          value={x.kind}
          onChange={(e) => setX({ ...x, kind: e.target.value as "order" | "refund" })}
        >
          <option value="order">Sale</option>
          <option value="refund">Refund to a buyer</option>
        </select>
      </label>
      <label className="text-sm">
        <span className="label">Date</span>
        <input
          className="input w-full"
          type="date"
          required
          max={today()}
          value={x.date}
          onChange={(e) => setX({ ...x, date: e.target.value })}
        />
      </label>
      <label className="text-sm md:col-span-2">
        <span className="label">What sold</span>
        <input
          className="input w-full"
          required
          maxLength={300}
          placeholder="Levi's 501 jacket, Facebook Marketplace"
          value={x.title}
          onChange={(e) => setX({ ...x, title: e.target.value })}
        />
      </label>
      <label className="text-sm">
        <span className="label">{order ? "Buyer paid for the item" : "Refunded"}</span>
        <input
          className="input w-full"
          required
          inputMode="decimal"
          placeholder="40.00"
          value={x.amount}
          onChange={(e) => setX({ ...x, amount: e.target.value })}
        />
      </label>
      {order && (
        <label className="text-sm">
          <span className="label">Shipping the buyer paid</span>
          <input
            className="input w-full"
            inputMode="decimal"
            placeholder="0.00"
            value={x.shipping}
            onChange={(e) => setX({ ...x, shipping: e.target.value })}
          />
        </label>
      )}
      <label className="text-sm">
        <span className="label">Payment app fee</span>
        <input
          className="input w-full"
          inputMode="decimal"
          placeholder="0.00"
          value={x.fee}
          onChange={(e) => setX({ ...x, fee: e.target.value })}
        />
      </label>
      <label className="text-sm">
        <span className="label">Postage you paid</span>
        <input
          className="input w-full"
          inputMode="decimal"
          placeholder="0.00"
          value={x.postage}
          onChange={(e) => setX({ ...x, postage: e.target.value })}
        />
      </label>
      {order && (
        <label className="text-sm md:col-span-2">
          <span className="label">Stock item sold (sets cost of goods)</span>
          <select
            className="input w-full"
            value={x.itemId}
            onChange={(e) => setX({ ...x, itemId: e.target.value })}
          >
            <option value="">None or not tracked</option>
            {stock.map((i) => (
              <option key={i.id} value={i.id}>
                {i.title} ({usd(i.costCents)})
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="text-sm md:col-span-2">
        <span className="label">Notes</span>
        <input
          className="input w-full"
          maxLength={1000}
          value={x.notes}
          onChange={(e) => setX({ ...x, notes: e.target.value })}
        />
      </label>
      <div className="flex items-center gap-2 md:col-span-4">
        <button className="btn" type="submit" disabled={add.isPending}>
          Save
        </button>
        <button type="button" className="text-sm underline" onClick={() => setOpen(false)}>
          Close
        </button>
        <ErrorText error={add.error} />
      </div>
    </form>
  );
}

interface ReturnedItemRow extends ItemRow {
  status: string;
  acquiredDate: string;
  disposedDate: string | null;
}

/**
 * On a refund: whether the item came back. Marking one puts a copy in stock from the refund's date at
 * its cost (not a purchase on the worksheet); the original stays sold on its sale date.
 */
function RefundReturn({ orgId, refundId }: { orgId: string; refundId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const data = useQuery({
    queryKey: ["returned-items", orgId, refundId],
    queryFn: () =>
      api<{ returned: ReturnedItemRow[]; candidates: ReturnedItemRow[]; fromOrder: boolean }>(
        orgPath(orgId, `/sales/${refundId}/returned-items`),
      ),
    enabled: open,
  });
  const add = useMutation({
    mutationFn: (itemId: string) =>
      api(orgPath(orgId, `/sales/${refundId}/returned-items`), {
        method: "POST",
        body: { itemId },
      }),
    onSuccess: () => qc.invalidateQueries(),
  });
  const undo = useMutation({
    mutationFn: (itemId: string) =>
      api(orgPath(orgId, `/sales/${refundId}/returned-items/${itemId}`), { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries(),
  });
  if (!open)
    return (
      <button type="button" className="text-xs underline" onClick={() => setOpen(true)}>
        Item came back?
      </button>
    );
  const d = data.data;
  return (
    <div className="space-y-1 text-xs">
      {d?.returned.map((i) => (
        <div key={i.id}>
          Back in stock: {i.title} ({usd(i.costCents)}, {i.acquiredDate})
          {i.status === "in_stock" ? (
            <button
              type="button"
              className="ml-1 underline"
              aria-label={`Undo return of ${i.title}`}
              onClick={() => undo.mutate(i.id)}
            >
              undo
            </button>
          ) : (
            <span className="ml-1 text-stone-500">sold again</span>
          )}
        </div>
      ))}
      {d && d.candidates.length > 0 && (
        <select
          className="input text-xs"
          aria-label="Item that came back"
          value=""
          onChange={(e) => e.target.value && add.mutate(e.target.value)}
        >
          <option value="">
            {d.fromOrder
              ? "Put this order's item back in stock…"
              : "Put a sold item back in stock…"}
          </option>
          {d.candidates.map((i) => (
            <option key={i.id} value={i.id}>
              {i.title} ({usd(i.costCents)}, sold {i.disposedDate})
            </option>
          ))}
        </select>
      )}
      {d && d.candidates.length === 0 && d.returned.length === 0 && (
        <div className="text-stone-500">
          No sold item to put back. Link the order to its item first.
        </div>
      )}
      <ErrorText error={data.error ?? add.error ?? undo.error} />
    </div>
  );
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
  const remove = useMutation({
    mutationFn: (saleId: string) => api(orgPath(orgId, `/sales/${saleId}`), { method: "DELETE" }),
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
      <DirectSaleForm orgId={orgId} stock={stock.data?.items ?? []} />
      <ErrorText error={link.error ?? remove.error} />
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Platform</th>
              <th>Item</th>
              <th className="num">Sale</th>
              <th>Fees</th>
              <th className="num">Net</th>
              <th>Inventory item</th>
              <th />
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
                  {s.kind === "refund" && <RefundReturn orgId={orgId} refundId={s.id} />}
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
                <td>
                  {s.platform === DIRECT && (
                    <button
                      type="button"
                      className="text-xs underline"
                      aria-label={`Delete direct sale ${s.title ?? ""}`}
                      onClick={() => remove.mutate(s.id)}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
