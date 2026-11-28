// Inventory: lots (bulk buys, cost spread over items) and single items.
import { type MemberRole, ROLE_RANK } from "@shared/enums";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { PurchaseReceipts } from "../components/expense-receipts";
import { SheetImport } from "../components/sheet-import";
import { StockCount } from "../components/stock-count";
import { api, dollarsToCents, orgPath, today, usd } from "../lib/api";
import { useOrgId } from "./org";
import { ErrorText, useMe } from "./public";

interface Lot {
  id: string;
  name: string;
  acquiredDate: string;
  vendor: string | null;
  totalCostCents: number;
  splitBy: "even" | "value";
  missingValueCount: number;
  itemCount: number;
  soldCount: number;
  unallocatedCents: number;
  receiptCount: number;
}

interface Item {
  id: string;
  title: string;
  sku: string | null;
  source: string | null;
  acquiredDate: string;
  costCents: number;
  costIsManual: boolean;
  estimatedValueCents: number | null;
  lotId: string | null;
  status: string;
  disposedDate: string | null;
  receiptCount: number;
  /** Receipts on the item's lot, which cover its cost too. */
  lotReceiptCount: number;
}

interface Proof {
  year: number;
  items: number;
  covered: number;
  coveredCents: number;
  zeroCost: number;
  missing: number;
  missingCents: number;
  missingItems: {
    id: string;
    title: string;
    sku: string | null;
    acquiredDate: string;
    costCents: number;
  }[];
}

/**
 * How much of the year's stock purchases has a receipt behind it (a lot's receipt covers its items), and
 * the costliest items with none, so the seller knows which receipts to find or photograph.
 */
function PurchaseProof({ orgId }: { orgId: string }) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const proof = useQuery({
    queryKey: ["items", orgId, "proof", year],
    queryFn: () => api<Proof>(orgPath(orgId, `/inventory/receipts/proof?year=${year}`)),
  });
  const p = proof.data;
  return (
    <section className="card space-y-2" aria-labelledby="proof-h">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="proof-h" className="font-medium">
          Receipts for what you paid
        </h2>
        <select
          className="input w-auto py-0 text-sm"
          aria-label="Year"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        >
          {[0, 1, 2].map((n) => {
            const y = new Date().getFullYear() - n;
            return (
              <option key={y} value={y}>
                {y}
              </option>
            );
          })}
        </select>
      </div>
      <p className="text-sm text-stone-600">
        Cost of goods is usually a reseller's largest deduction. IRS Publication 583 asks for
        documents that show the amount paid and that it was for inventory: a receipt, an invoice, a
        card slip or a canceled check. Attach one (a photo is fine) to the lot it paid for, which
        covers every item in it, or to an item bought on its own.
      </p>
      {p && p.items === 0 && (
        <p className="text-sm text-stone-600">No stock bought in {p.year} is in the books.</p>
      )}
      {p && p.items > 0 && (
        <>
          <p className="text-sm">
            <strong>
              {p.covered} of {p.items - p.zeroCost}
            </strong>{" "}
            item{p.items - p.zeroCost === 1 ? "" : "s"} bought in {p.year} with a cost have a
            receipt ({usd(p.coveredCents)}).{" "}
            {p.missing > 0 ? (
              <span className="text-accent-700">
                {p.missing} have none: {usd(p.missingCents)} of cost with no receipt attached.
              </span>
            ) : (
              "Every one is covered."
            )}
          </p>
          {p.missingItems.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm underline">
                The costliest items with no receipt
              </summary>
              <ul className="mt-1 space-y-0.5 text-sm">
                {p.missingItems.map((i) => (
                  <li key={i.id}>
                    {i.acquiredDate} · {i.title}
                    {i.sku && <span className="text-xs text-stone-500"> {i.sku}</span>} ·{" "}
                    {usd(i.costCents)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

export function InventoryPage() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const role = useMe().data?.memberships.find((m) => m.orgId === orgId)?.role;
  const canEdit = role != null && (ROLE_RANK[role as MemberRole] ?? 0) >= ROLE_RANK.editor;
  const [openReceipts, setOpenReceipts] = useState<string | null>(null);
  const receiptsButton = (id: string, n: number, covered = 0) => (
    <button
      type="button"
      className="text-xs underline"
      aria-expanded={openReceipts === id}
      onClick={() => setOpenReceipts(openReceipts === id ? null : id)}
    >
      {n ? `${n} receipt${n > 1 ? "s" : ""}` : covered ? "Lot's receipt" : canEdit ? "Add" : "None"}
    </button>
  );
  const lots = useQuery({
    queryKey: ["lots", orgId],
    queryFn: () => api<{ items: Lot[] }>(orgPath(orgId, "/inventory/lots")),
  });
  const items = useQuery({
    queryKey: ["items", orgId, "all"],
    queryFn: () => api<{ items: Item[] }>(orgPath(orgId, "/inventory/items?limit=500")),
  });

  // New lot: name, date, cost, one item per line ("title | SKU | optional cost | optional expected price").
  const [lot, setLot] = useState({
    name: "",
    acquiredDate: today(),
    cost: "",
    vendor: "",
    splitBy: "even" as "even" | "value",
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
          splitBy: lot.splitBy,
          items: lot.lines
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l) => {
              const [title = "", sku = "", cost = "", value = ""] = l
                .split("|")
                .map((p) => p.trim());
              return {
                title,
                sku: sku || null,
                costCents: cost ? dollarsToCents(cost) : null,
                estimatedValueCents: value ? dollarsToCents(value) : null,
              };
            }),
        },
      }),
    onSuccess: () => {
      setLot({
        name: "",
        acquiredDate: today(),
        cost: "",
        vendor: "",
        splitBy: lot.splitBy,
        lines: "",
      });
      return qc.invalidateQueries();
    },
  });

  const [item, setItem] = useState({
    title: "",
    sku: "",
    source: "",
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
          source: item.source || null,
          acquiredDate: item.acquiredDate,
          costCents: item.cost ? dollarsToCents(item.cost) : null,
          lotId: item.lotId || null,
        },
      }),
    onSuccess: () => {
      setItem({ title: "", sku: "", source: "", acquiredDate: today(), cost: "", lotId: "" });
      return qc.invalidateQueries();
    },
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api(orgPath(orgId, `/inventory/items/${id}`), { method: "PATCH", body }),
    onSuccess: () => qc.invalidateQueries(),
  });
  const updateLot = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api<{ warnings: string[] }>(orgPath(orgId, `/inventory/lots/${id}`), {
        method: "PATCH",
        body,
      }),
    onSuccess: () => qc.invalidateQueries(),
  });
  const setExpected = (i: Item) => {
    const typed = prompt(
      `Expected selling price for "${i.title}" (blank clears it)`,
      i.estimatedValueCents != null ? (i.estimatedValueCents / 100).toFixed(2) : "",
    );
    if (typed === null) return;
    let cents: number | null = null;
    try {
      cents = typed.trim() ? dollarsToCents(typed) : null;
    } catch (e) {
      alert((e as Error).message);
      return;
    }
    update.mutate({ id: i.id, body: { estimatedValueCents: cents } });
  };
  const removeItem = useMutation({
    mutationFn: (id: string) => api(orgPath(orgId, `/inventory/items/${id}`), { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries(),
  });

  const lotName = (id: string | null) => lots.data?.items.find((l) => l.id === id)?.name ?? "";
  // Sources already in the books, offered as suggestions so one store keeps one spelling (the stock
  // report groups by it, ignoring case and spacing).
  const knownSources = [
    ...new Set(
      [
        ...(items.data?.items.map((i) => i.source) ?? []),
        ...(lots.data?.items.map((l) => l.vendor) ?? []),
      ].flatMap((v) => (v?.trim() ? [v.trim()] : [])),
    ),
  ].sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Inventory &amp; cost of goods</h1>
      <SheetImport orgId={orgId} />
      <StockCount orgId={orgId} />
      <PurchaseProof orgId={orgId} />
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
            <label className="col-span-2 text-sm">
              <span className="mr-2">Split the cost</span>
              <select
                className="input inline-block w-auto"
                value={lot.splitBy}
                onChange={(e) => setLot({ ...lot, splitBy: e.target.value as "even" | "value" })}
              >
                <option value="even">evenly over the items</option>
                <option value="value">by what each item should sell for</option>
              </select>
            </label>
          </div>
          <textarea
            className="input h-28 font-mono text-xs"
            placeholder={
              lot.splitBy === "value"
                ? "One item per line: title | SKU | cost (optional) | expected price\nWool coat | COAT-1 | | 120.00\nLevi's 501 | JEANS-1 | | 35.00"
                : "One item per line: title | SKU | cost (optional)\nLevi's 501 | JEANS-1\nPyrex bowl | PYREX-2 | 15.00"
            }
            value={lot.lines}
            onChange={(e) => setLot({ ...lot, lines: e.target.value })}
          />
          <p className="text-xs text-stone-500">
            {lot.splitBy === "value"
              ? "Items without a cost share what is left of the lot cost in proportion to their expected price, so a $40 bin holding one $200 coat and twenty $5 shirts puts $26.67 on the coat rather than $1.90. Until every item has a price the lot is split evenly."
              : "Items without a cost share what is left of the lot cost evenly."}{" "}
            Use the same SKU (custom label) you list with, and imported sales link to the item
            automatically.
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
            <input
              className="input col-span-2"
              placeholder={
                item.lotId
                  ? "Where bought (optional; else the lot's vendor)"
                  : "Where bought (optional)"
              }
              aria-label="Where bought"
              list="item-sources"
              maxLength={200}
              value={item.source}
              onChange={(e) => setItem({ ...item, source: e.target.value })}
            />
            <datalist id="item-sources">
              {knownSources.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
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
              <th>Split</th>
              <th className="num">Items</th>
              <th className="num">Sold</th>
              <th className="num">Not assigned to items</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            {lots.data?.items.map((l) => (
              <Fragment key={l.id}>
                <tr>
                  <td>
                    {l.name}
                    {l.vendor && <span className="ml-1 text-xs text-stone-500">{l.vendor}</span>}
                  </td>
                  <td>{l.acquiredDate}</td>
                  <td className="num">{usd(l.totalCostCents)}</td>
                  <td>
                    <select
                      className="input w-auto py-0 text-xs"
                      aria-label={`How ${l.name}'s cost is split`}
                      value={l.splitBy}
                      onChange={(e) =>
                        updateLot.mutate({ id: l.id, body: { splitBy: e.target.value } })
                      }
                    >
                      <option value="even">evenly</option>
                      <option value="value">by expected price</option>
                    </select>
                    {l.splitBy === "value" && l.missingValueCount > 0 && (
                      <span className="ml-1 text-xs text-accent-700">
                        evenly until {l.missingValueCount} more{" "}
                        {l.missingValueCount === 1 ? "item has" : "items have"} a price
                      </span>
                    )}
                  </td>
                  <td className="num">{l.itemCount}</td>
                  <td className="num">{l.soldCount}</td>
                  <td className={`num ${l.unallocatedCents ? "text-accent-700" : ""}`}>
                    {usd(l.unallocatedCents)}
                  </td>
                  <td>{receiptsButton(l.id, l.receiptCount)}</td>
                </tr>
                {openReceipts === l.id && (
                  <tr>
                    <td colSpan={8}>
                      <PurchaseReceipts
                        orgId={orgId}
                        target={{ kind: "lot", id: l.id }}
                        canEdit={canEdit}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card overflow-x-auto">
        <h2 className="mb-2 font-medium">Items</h2>
        <ErrorText error={update.error ?? updateLot.error ?? removeItem.error} />
        <table className="table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Bought</th>
              <th className="num">Cost</th>
              <th>Status</th>
              <th>Receipt</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.data?.items.map((i) => (
              <Fragment key={i.id}>
                <tr>
                  <td>
                    {i.title}
                    {i.sku && <span className="ml-1 text-xs text-stone-500">{i.sku}</span>}
                    {i.source && (
                      <span className="ml-1 text-xs text-stone-500">· from {i.source}</span>
                    )}
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
                    {i.estimatedValueCents != null && (
                      <span className="block text-xs text-stone-500">
                        expected {usd(i.estimatedValueCents)}
                      </span>
                    )}
                  </td>
                  <td>
                    {i.status.replace("_", " ")}
                    {i.disposedDate && (
                      <span className="ml-1 text-xs text-stone-500">{i.disposedDate}</span>
                    )}
                  </td>
                  <td>{receiptsButton(i.id, i.receiptCount, i.lotReceiptCount)}</td>
                  <td className="space-x-2 text-xs">
                    {i.lotId && (
                      <button type="button" className="underline" onClick={() => setExpected(i)}>
                        Expected price
                      </button>
                    )}
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
                {openReceipts === i.id && (
                  <tr>
                    <td colSpan={6}>
                      {i.lotReceiptCount > 0 && (
                        <p className="mb-1 text-xs text-stone-600">
                          The receipt on {lotName(i.lotId)} covers this item. Add one here only if
                          it was bought separately.
                        </p>
                      )}
                      <PurchaseReceipts
                        orgId={orgId}
                        target={{ kind: "item", id: i.id }}
                        canEdit={canEdit}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
