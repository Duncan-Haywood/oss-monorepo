// Inventory: lots (bulk buys, cost spread over items) and single items.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SheetImport } from "../components/sheet-import";
import { api, dollarsToCents, orgPath, today, usd } from "../lib/api";
import { useOrgId } from "./org";
import { ErrorText } from "./public";

interface Lot {
  id: string;
  name: string;
  acquiredDate: string;
  vendor: string | null;
  totalCostCents: number;
  itemCount: number;
  soldCount: number;
  unallocatedCents: number;
}

interface Item {
  id: string;
  title: string;
  sku: string | null;
  acquiredDate: string;
  costCents: number;
  costIsManual: boolean;
  lotId: string | null;
  status: string;
  disposedDate: string | null;
}

export function InventoryPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const lots = useQuery({
    queryKey: ["lots", orgId],
    queryFn: () => api<{ items: Lot[] }>(orgPath(orgId, "/inventory/lots")),
  });
  const items = useQuery({
    queryKey: ["items", orgId, "all"],
    queryFn: () => api<{ items: Item[] }>(orgPath(orgId, "/inventory/items?limit=500")),
  });

  // New lot: name, date, cost, one item per line ("title | SKU | optional cost").
  const [lot, setLot] = useState({
    name: "",
    acquiredDate: today(),
    cost: "",
    vendor: "",
    lines: "",
  });
  const addLot = useMutation({
    mutationFn: () =>
      api<{ warnings: string[] }>(orgPath(orgId, "/inventory/lots"), {
        method: "POST",
        body: {
          name: lot.name,
          acquiredDate: lot.acquiredDate,
          vendor: lot.vendor || null,
          totalCostCents: dollarsToCents(lot.cost),
          items: lot.lines
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l) => {
              const [title = "", sku = "", cost = ""] = l.split("|").map((p) => p.trim());
              return { title, sku: sku || null, costCents: cost ? dollarsToCents(cost) : null };
            }),
        },
      }),
    onSuccess: () => {
      setLot({ name: "", acquiredDate: today(), cost: "", vendor: "", lines: "" });
      return qc.invalidateQueries();
    },
  });

  const [item, setItem] = useState({
    title: "",
    sku: "",
    acquiredDate: today(),
    cost: "",
    lotId: "",
  });
  const addItem = useMutation({
    mutationFn: () =>
      api(orgPath(orgId, "/inventory/items"), {
        method: "POST",
        body: {
          title: item.title,
          sku: item.sku || null,
          acquiredDate: item.acquiredDate,
          costCents: item.cost ? dollarsToCents(item.cost) : null,
          lotId: item.lotId || null,
        },
      }),
    onSuccess: () => {
      setItem({ title: "", sku: "", acquiredDate: today(), cost: "", lotId: "" });
      return qc.invalidateQueries();
    },
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api(orgPath(orgId, `/inventory/items/${id}`), { method: "PATCH", body }),
    onSuccess: () => qc.invalidateQueries(),
  });
  const removeItem = useMutation({
    mutationFn: (id: string) => api(orgPath(orgId, `/inventory/items/${id}`), { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries(),
  });

  const lotName = (id: string | null) => lots.data?.items.find((l) => l.id === id)?.name ?? "";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Inventory &amp; cost of goods</h1>
      <SheetImport orgId={orgId} />
      <div className="grid gap-4 lg:grid-cols-2">
        <form
          className="card space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            addLot.mutate();
          }}
        >
          <h2 className="font-medium">Add a lot (bin, pallet, estate-sale haul)</h2>
          <div className="grid grid-cols-2 gap-2">
            <input
              className="input"
              placeholder="Lot name"
              required
              value={lot.name}
              onChange={(e) => setLot({ ...lot, name: e.target.value })}
            />
            <input
              className="input"
              type="date"
              required
              value={lot.acquiredDate}
              onChange={(e) => setLot({ ...lot, acquiredDate: e.target.value })}
            />
            <input
              className="input"
              placeholder="Total cost, e.g. 120.00"
              required
              value={lot.cost}
              onChange={(e) => setLot({ ...lot, cost: e.target.value })}
            />
            <input
              className="input"
              placeholder="Where (optional)"
              value={lot.vendor}
              onChange={(e) => setLot({ ...lot, vendor: e.target.value })}
            />
          </div>
          <textarea
            className="input h-28 font-mono text-xs"
            placeholder={
              "One item per line: title | SKU | cost (optional)\nLevi's 501 | JEANS-1\nPyrex bowl | PYREX-2 | 15.00"
            }
            value={lot.lines}
            onChange={(e) => setLot({ ...lot, lines: e.target.value })}
          />
          <p className="text-xs text-stone-500">
            Items without a cost share what is left of the lot cost evenly. Use the same SKU (custom
            label) you list with, and imported sales link to the item automatically.
          </p>
          <button className="btn" type="submit" disabled={addLot.isPending}>
            Add lot
          </button>
          <ErrorText error={addLot.error} />
          {addLot.data?.warnings.map((w) => (
            <p key={w} className="text-sm text-accent-700">
              {w}
            </p>
          ))}
        </form>
        <form
          className="card space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            addItem.mutate();
          }}
        >
          <h2 className="font-medium">Add a single item</h2>
          <div className="grid grid-cols-2 gap-2">
            <input
              className="input"
              placeholder="Title"
              required
              value={item.title}
              onChange={(e) => setItem({ ...item, title: e.target.value })}
            />
            <input
              className="input"
              placeholder="SKU (optional)"
              value={item.sku}
              onChange={(e) => setItem({ ...item, sku: e.target.value })}
            />
            <input
              className="input"
              type="date"
              value={item.acquiredDate}
              onChange={(e) => setItem({ ...item, acquiredDate: e.target.value })}
            />
            <input
              className="input"
              placeholder="Cost, e.g. 4.99"
              value={item.cost}
              onChange={(e) => setItem({ ...item, cost: e.target.value })}
            />
            <select
              className="input col-span-2"
              value={item.lotId}
              onChange={(e) => setItem({ ...item, lotId: e.target.value })}
            >
              <option value="">Not part of a lot</option>
              {lots.data?.items.map((l) => (
                <option key={l.id} value={l.id}>
                  Add to lot: {l.name}
                </option>
              ))}
            </select>
          </div>
          <button className="btn" type="submit" disabled={addItem.isPending}>
            Add item
          </button>
          <ErrorText error={addItem.error} />
        </form>
      </div>

      <section className="card overflow-x-auto">
        <h2 className="mb-2 font-medium">Lots</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Lot</th>
              <th>Bought</th>
              <th className="num">Cost</th>
              <th className="num">Items</th>
              <th className="num">Sold</th>
              <th className="num">Not assigned to items</th>
            </tr>
          </thead>
          <tbody>
            {lots.data?.items.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.name}
                  {l.vendor && <span className="ml-1 text-xs text-stone-500">{l.vendor}</span>}
                </td>
                <td>{l.acquiredDate}</td>
                <td className="num">{usd(l.totalCostCents)}</td>
                <td className="num">{l.itemCount}</td>
                <td className="num">{l.soldCount}</td>
                <td className={`num ${l.unallocatedCents ? "text-accent-700" : ""}`}>
                  {usd(l.unallocatedCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="mb-2 font-medium">Items</h2>
        <ErrorText error={update.error ?? removeItem.error} />
        <table className="table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Bought</th>
              <th className="num">Cost</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.data?.items.map((i) => (
              <tr key={i.id}>
                <td>
                  {i.title}
                  {i.sku && <span className="ml-1 text-xs text-stone-500">{i.sku}</span>}
                  {i.lotId && (
                    <span className="ml-1 text-xs text-stone-500">· {lotName(i.lotId)}</span>
                  )}
                </td>
                <td>{i.acquiredDate}</td>
                <td className="num">
                  {usd(i.costCents)}
                  {i.lotId && !i.costIsManual && (
                    <span className="ml-1 text-xs text-stone-500">(lot share)</span>
                  )}
                </td>
                <td>
                  {i.status.replace("_", " ")}
                  {i.disposedDate && (
                    <span className="ml-1 text-xs text-stone-500">{i.disposedDate}</span>
                  )}
                </td>
                <td className="space-x-2 text-xs">
                  {i.status === "in_stock" && (
                    <>
                      <button
                        type="button"
                        className="underline"
                        onClick={() =>
                          update.mutate({
                            id: i.id,
                            body: { status: "written_off", disposedDate: today() },
                          })
                        }
                      >
                        Write off
                      </button>
                      <button
                        type="button"
                        className="underline"
                        onClick={() =>
                          update.mutate({
                            id: i.id,
                            body: { status: "personal_use", disposedDate: today() },
                          })
                        }
                      >
                        Personal use
                      </button>
                    </>
                  )}
                  {(i.status === "written_off" || i.status === "personal_use") && (
                    <button
                      type="button"
                      className="underline"
                      onClick={() => update.mutate({ id: i.id, body: { status: "in_stock" } })}
                    >
                      Back in stock
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-red-700 underline"
                    onClick={() => confirm("Delete this item?") && removeItem.mutate(i.id)}
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
