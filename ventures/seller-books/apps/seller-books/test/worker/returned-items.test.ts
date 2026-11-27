// A sold item that came back on a refund goes back in stock as a copy dated the return, at its cost, and is
// not a purchase: the year it sold keeps its line 41, the year it came back takes its cost out through line 41.
import { describe, expect, it } from "vitest";
import { api, json, setupTenant } from "./helpers";

type Line = { line: string; amountCents: number | null; note?: string };
type Ws = { partIII: Line[]; warnings: string[] };
type Item = { id: string; title: string; status: string; acquiredDate: string; costCents: number };
type Returned = { returned: Item[]; candidates: Item[]; fromOrder: boolean };

async function soldAndRefunded(saleDate: string, refundDate: string) {
  const t = await setupTenant();
  const p = (s: string) => `/api/orgs/${t.orgId}${s}`;
  const item = await json<{ id: string }>(
    await api(p("/inventory/items"), {
      method: "POST",
      as: t.userId,
      json: { title: "Le Creuset pot", acquiredDate: "2025-06-01", costCents: 1000 },
    }),
  );
  const sale = await api(p("/sales"), {
    method: "POST",
    as: t.userId,
    json: { date: saleDate, title: "Le Creuset pot", itemCents: 6000, itemId: item.id },
  });
  expect(sale.status).toBe(201);
  const saleId = (await json<{ id: string }>(sale)).id;
  const refund = await api(p("/sales"), {
    method: "POST",
    as: t.userId,
    json: {
      kind: "refund",
      date: refundDate,
      title: "Le Creuset pot, returned",
      refundCents: 6000,
    },
  });
  expect(refund.status).toBe(201);
  const refundId = (await json<{ id: string }>(refund)).id;
  const ws = async (year: number) =>
    json<Ws>(await api(p(`/reports/schedule-c?year=${year}`), { as: t.userId }));
  const line = (w: Ws, n: string) => w.partIII.find((l) => l.line === n);
  return { t, p, itemId: item.id, saleId, refundId, ws, line };
}

describe("items that came back on a refund", () => {
  it("restocks a copy in the same year: not a purchase, on hand at year end, cost of goods back to zero", async () => {
    const { t, p, itemId, refundId, ws, line } = await soldAndRefunded("2026-03-10", "2026-04-02");
    const before = await ws(2026);
    expect(line(before, "42")?.amountCents).toBe(1000);

    const list = await json<Returned>(
      await api(p(`/sales/${refundId}/returned-items`), { as: t.userId }),
    );
    expect(list.returned).toEqual([]);
    expect(list.fromOrder).toBe(false);
    expect(list.candidates.map((i) => i.id)).toEqual([itemId]);

    const add = await api(p(`/sales/${refundId}/returned-items`), {
      method: "POST",
      as: t.userId,
      json: { itemId },
    });
    expect(add.status).toBe(201);
    const copy = await json<Item>(add);
    expect(copy).toMatchObject({ status: "in_stock", acquiredDate: "2026-04-02", costCents: 1000 });

    const w = await ws(2026);
    expect(line(w, "35")?.amountCents).toBe(1000);
    expect(line(w, "36")?.amountCents).toBe(0);
    expect(line(w, "36")?.note).toMatch(/Leaves out \$10\.00 of items that came back on refunds/);
    expect(line(w, "41")?.amountCents).toBe(1000);
    expect(line(w, "42")?.amountCents).toBe(0);

    // The original stays sold; it comes back once.
    const again = await api(p(`/sales/${refundId}/returned-items`), {
      method: "POST",
      as: t.userId,
      json: { itemId },
    });
    expect(again.status).toBe(409);
    const after = await json<Returned>(
      await api(p(`/sales/${refundId}/returned-items`), { as: t.userId }),
    );
    expect(after.returned.map((i) => i.id)).toEqual([copy.id]);
    expect(after.candidates).toEqual([]);
  });

  it("leaves the year the item sold as filed when it comes back the next year", async () => {
    const { t, p, itemId, refundId, ws, line } = await soldAndRefunded("2025-12-10", "2026-01-05");
    const add = await api(p(`/sales/${refundId}/returned-items`), {
      method: "POST",
      as: t.userId,
      json: { itemId },
    });
    expect(add.status).toBe(201);

    const w25 = await ws(2025);
    expect(line(w25, "36")?.amountCents).toBe(1000);
    expect(line(w25, "41")?.amountCents).toBe(0);
    expect(line(w25, "42")?.amountCents).toBe(1000);

    const w26 = await ws(2026);
    expect(line(w26, "35")?.amountCents).toBe(0);
    expect(line(w26, "36")?.amountCents).toBe(0);
    expect(line(w26, "41")?.amountCents).toBe(1000);
    // Its cost was in 2025's cost of goods; back on hand, 2026 takes it out again.
    expect(line(w26, "42")?.amountCents).toBe(-1000);

    const yearEnd = await api(p("/reports/closing-inventory.csv?year=2026"), { as: t.userId });
    expect(await yearEnd.text()).toMatch(/Le Creuset pot/);
  });

  it("refuses a date before the sale, an order instead of a refund, an unsold item and a viewer", async () => {
    const { t, p, itemId, saleId, refundId } = await soldAndRefunded("2026-03-10", "2026-04-02");
    const post = (id: string, body: unknown, as = t.userId) =>
      api(p(`/sales/${id}/returned-items`), { method: "POST", as, json: body });
    expect((await post(refundId, { itemId, date: "2026-03-01" })).status).toBe(409);
    expect((await post(saleId, { itemId })).status).toBe(400);
    const fresh = await json<{ id: string }>(
      await api(p("/inventory/items"), {
        method: "POST",
        as: t.userId,
        json: { title: "Unsold mug", acquiredDate: "2026-01-01", costCents: 300 },
      }),
    );
    expect((await post(refundId, { itemId: fresh.id })).status).toBe(409);
    expect((await post(refundId, { itemId: "itm_missing" })).status).toBe(404);
  });

  it("answers 404 to another shop", async () => {
    const { p, itemId, refundId } = await soldAndRefunded("2026-03-10", "2026-04-02");
    const other = await setupTenant();
    const read = await api(p(`/sales/${refundId}/returned-items`), { as: other.userId });
    expect(read.status).toBe(404);
    const write = await api(p(`/sales/${refundId}/returned-items`), {
      method: "POST",
      as: other.userId,
      json: { itemId },
    });
    expect(write.status).toBe(404);
    // Their own shop does not see this shop's refund either.
    const own = await api(`/api/orgs/${other.orgId}/sales/${refundId}/returned-items`, {
      as: other.userId,
    });
    expect(own.status).toBe(404);
  });

  it("removes the copy when it is taken back, when the refund goes, or when the sale is unlinked", async () => {
    const { t, p, itemId, saleId, refundId, ws, line } = await soldAndRefunded(
      "2026-03-10",
      "2026-04-02",
    );
    const add = async () => {
      const r = await api(p(`/sales/${refundId}/returned-items`), {
        method: "POST",
        as: t.userId,
        json: { itemId },
      });
      expect(r.status).toBe(201);
      return json<Item>(r);
    };
    // Taken back by hand.
    let copy = await add();
    const undo = await api(p(`/sales/${refundId}/returned-items/${copy.id}`), {
      method: "DELETE",
      as: t.userId,
    });
    expect(undo.status).toBe(200);
    expect(line(await ws(2026), "41")?.amountCents).toBe(0);

    // The original back in stock (its sale unlinked): the copy goes, so the item is not counted twice.
    copy = await add();
    const unlink = await api(p(`/sales/${saleId}/link-item`), { method: "DELETE", as: t.userId });
    expect(unlink.status).toBe(200);
    expect(line(await ws(2026), "41")?.amountCents).toBe(1000);
    const stock = await json<{ items: { id: string }[] }>(
      await api(p("/inventory/items?limit=500"), { as: t.userId }),
    );
    expect(stock.items.map((i) => i.id)).toEqual([itemId]);

    // Sold again, then the refund deleted: the copy goes and the second sale is left unlinked.
    const relink = await api(p(`/sales/${saleId}/link-item`), {
      method: "POST",
      as: t.userId,
      json: { itemId },
    });
    expect(relink.status).toBe(200);
    copy = await add();
    const resale = await api(p("/sales"), {
      method: "POST",
      as: t.userId,
      json: { date: "2026-05-01", title: "Le Creuset pot again", itemCents: 5500, itemId: copy.id },
    });
    expect(resale.status).toBe(201);
    const takeBack = await api(p(`/sales/${refundId}/returned-items/${copy.id}`), {
      method: "DELETE",
      as: t.userId,
    });
    expect(takeBack.status).toBe(409);
    const del = await api(p(`/sales/${refundId}`), { method: "DELETE", as: t.userId });
    expect(del.status).toBe(200);
    const unlinked = await json<{ items: { title: string }[] }>(
      await api(p("/sales?unlinked=true"), { as: t.userId }),
    );
    expect(unlinked.items.map((s) => s.title)).toEqual(["Le Creuset pot again"]);
  });
});
