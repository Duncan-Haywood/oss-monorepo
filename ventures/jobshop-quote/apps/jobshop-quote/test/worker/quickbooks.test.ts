// QuickBooks Online (services/quickbooks.ts, docs/QUICKBOOKS.md): an admin connects the shop's
// company through Intuit's OAuth (the fake gateway in tests), and an estimator sends a won quote as
// an invoice at its quoted breaks. Refused: a quote not won, no connection, a quantity never quoted,
// a line with several breaks and no pick, another currency's books, a second send, the wrong role,
// and anything across shops.
import type {
  QuickBooksItemsDto,
  QuickBooksStatusDto,
  QuoteDetailDto,
  QuoteQuickBooksDto,
} from "@shared/api";
import type { CostInputs } from "@shared/costing";
import type { CreatedCustomerLinkDto } from "@shared/customer-link";
import { fakeQuickBooks, fakeQuickBooksSettings } from "@worker/ports/accounting";
import { afterEach, describe, expect, it } from "vitest";
import { addMember, api, BASE, json, seedRateCard, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;

afterEach(() => {
  fakeQuickBooksSettings.value = "USD";
});

async function quoteWith(t: Tenant, lines: { partNumber: string; inputs: Partial<CostInputs> }[]) {
  const q = await json<QuoteDetailDto>(
    api(t.path("/quotes"), {
      method: "POST",
      as: t.userId,
      json: { customerCompany: "Example Robotics LLC" },
    }),
    201,
  );
  for (const l of lines) {
    await json(
      api(t.path(`/quotes/${q.id}/lines`), {
        method: "POST",
        as: t.userId,
        json: {
          partNumber: l.partNumber,
          revision: "B",
          description: "Motor bracket",
          inputs: l.inputs,
        },
      }),
      201,
    );
  }
  await json(api(t.path(`/quotes/${q.id}/send`), { method: "POST", as: t.userId }));
  return json<QuoteDetailDto>(api(t.path(`/quotes/${q.id}`), { as: t.userId }));
}

const win = (t: Tenant, id: string) =>
  json(
    api(t.path(`/quotes/${id}/outcome`), {
      method: "POST",
      as: t.userId,
      json: { outcome: "won", poNumber: "PO-7781" },
    }),
  );

/** Connect through the fake Intuit page: start as `as`, then follow the callback as the same user. */
async function connect(t: Tenant, as = t.userId) {
  const { url } = await json<{ url: string }>(
    api(t.path("/quickbooks/connect"), { method: "POST", as }),
  );
  const res = await api(url.replace(BASE, ""), { as, redirect: "manual" });
  expect(res.status).toBe(302);
  return res.headers.get("Location") ?? "";
}

const status = (t: Tenant) =>
  json<QuickBooksStatusDto>(api(t.path("/quickbooks"), { as: t.userId }));

const send = (t: Tenant, quoteId: string, choices: unknown[] = [], as = t.userId) =>
  api(t.path(`/quotes/${quoteId}/quickbooks`), { method: "POST", as, json: { choices } });

const booksOf = async (t: Tenant) => {
  const realmId = (await status(t)).connection?.realmId ?? "";
  return fakeQuickBooks.books(realmId);
};

async function setup() {
  const t = await setupTenant();
  const r = await seedRateCard(t);
  const one = (quantities: number[]): Partial<CostInputs> => ({
    quantities,
    material: { materialId: r.al, blank: { shape: "weight", weightLb: 1 }, partsPerStock: null },
    operations: [{ machineId: r.mill, label: "OP10", setupMinutes: 30, cycleMinutesPerPart: 2 }],
  });
  return { t, r, one };
}

describe("QuickBooks connection", () => {
  it("connects through Intuit's consent for an admin, and disconnects", async () => {
    const { t } = await setup();
    expect((await status(t)).connection).toBeNull();
    expect((await status(t)).available).toBe(true);
    const location = await connect(t);
    expect(location).toBe(`/app/${t.orgId}/rate-card?quickbooks_connected=1#quickbooks`);
    const s = await status(t);
    expect(s.mode).toBe("fake");
    expect(s.connection?.realmId).toMatch(/^9130\d+$/);

    const revokedBefore = fakeQuickBooks.revoked.length;
    const after = await json<QuickBooksStatusDto>(
      api(t.path("/quickbooks"), { method: "DELETE", as: t.userId }),
    );
    expect(after.connection).toBeNull();
    expect(fakeQuickBooks.revoked.length).toBe(revokedBefore + 1);
  });

  it("lets only owners and admins connect, and a state works once, for the user who started it", async () => {
    const { t } = await setup();
    const estimator = await addMember(t.orgId, "estimator");
    const viewer = await addMember(t.orgId, "viewer");
    for (const as of [estimator, viewer]) {
      expect((await api(t.path("/quickbooks/connect"), { method: "POST", as })).status).toBe(403);
      expect((await api(t.path("/quickbooks"), { method: "DELETE", as })).status).toBe(403);
    }
    const admin = await addMember(t.orgId, "admin");
    const { url } = await json<{ url: string }>(
      api(t.path("/quickbooks/connect"), { method: "POST", as: admin }),
    );
    // Another member following the admin's link gets nothing, and the state is spent.
    const stolen = await api(url.replace(BASE, ""), { as: estimator, redirect: "manual" });
    expect(stolen.headers.get("Location")).toBe("/app?quickbooks_error=unknown_state");
    const replay = await api(url.replace(BASE, ""), { as: admin, redirect: "manual" });
    expect(replay.headers.get("Location")).toBe("/app?quickbooks_error=unknown_state");
    expect((await status(t)).connection).toBeNull();
  });

  it("is per shop: another shop's member cannot read or change it", async () => {
    const { t } = await setup();
    await connect(t);
    const other = await setupTenant();
    expect((await api(t.path("/quickbooks"), { as: other.userId })).status).toBe(404);
    expect(
      (await api(t.path("/quickbooks/connect"), { method: "POST", as: other.userId })).status,
    ).toBe(404);
    expect((await status(other)).connection).toBeNull();
  });
});

describe("a won quote as a QuickBooks invoice", () => {
  it("bills each part at its quoted break with the PO, once", async () => {
    const { t, one } = await setup();
    const q = await quoteWith(t, [
      { partNumber: "BRK-1001", inputs: one([50]) },
      { partNumber: "SPC-220", inputs: one([10, 100]) },
    ]);
    await win(t, q.id);
    await connect(t);
    const [brk, spc] = q.lines;
    const spc100 = spc?.breaks?.find((b) => b.quantity === 100);
    const brk50 = brk?.breaks?.[0];
    if (!brk || !spc || !spc100 || !brk50) throw new Error("lines not priced");

    const before = await json<QuoteQuickBooksDto>(
      api(t.path(`/quotes/${q.id}/quickbooks`), { as: t.userId }),
    );
    expect(before.invoice).toBeNull();
    expect(before.connected).toBe(true);
    expect(before.docNumber).toBe(`Q${q.quoteNumber}`);
    expect(before.memo).toBe(`Your PO PO-7781. Per our quote Q-${q.quoteNumber}.`);

    // SPC-220 was quoted at 10 and 100: without a pick it is refused by name.
    const unpicked = await send(t, q.id);
    expect(unpicked.status).toBe(400);
    expect(await unpicked.text()).toContain("SPC-220");
    // A quantity never quoted is refused, never priced.
    const unquoted = await send(t, q.id, [{ lineId: spc.id, quantity: 60 }]);
    expect(unquoted.status).toBe(400);
    expect(await unquoted.text()).toContain("not quoted at a quantity of 60");

    const sent = await json<QuoteQuickBooksDto>(send(t, q.id, [{ lineId: spc.id, quantity: 100 }]));
    expect(sent.invoice?.docNumber).toBe(`Q${q.quoteNumber}`);
    expect(sent.invoice?.totalCents).toBe(brk50.totalCents + spc100.totalCents);
    expect(sent.invoice?.lines.map((l) => [l.partNumber, l.quantity])).toEqual([
      ["BRK-1001", 50],
      ["SPC-220", 100],
    ]);

    const books = await booksOf(t);
    const invoice = [...books.invoices.values()].find((i) => i.docNumber === `Q${q.quoteNumber}`);
    expect(invoice?.totalCents).toBe(sent.invoice?.totalCents);
    expect(invoice?.customerMemo).toBe(`Your PO PO-7781. Per our quote Q-${q.quoteNumber}.`);
    expect(invoice?.lines).toEqual([
      expect.objectContaining({
        description: "BRK-1001 Rev B, Motor bracket",
        qty: 50,
        unitPriceCents: brk50.unitPriceCents,
        amountCents: brk50.totalCents,
      }),
      expect.objectContaining({
        description: "SPC-220 Rev B, Motor bracket",
        qty: 100,
        unitPriceCents: spc100.unitPriceCents,
        amountCents: spc100.totalCents,
      }),
    ]);
    const customer = books.customers.get(invoice?.customerId ?? "");
    expect(customer?.displayName).toBe("Example Robotics LLC");
    const item = books.items.get(invoice?.lines[0]?.itemId ?? "");
    expect(item?.name).toBe("Machined parts");

    // Once only.
    const again = await send(t, q.id, [{ lineId: spc.id, quantity: 100 }]);
    expect(again.status).toBe(409);
    expect(books.invoices.size).toBe(1);
    // Disconnecting keeps the record of what was sent.
    await json(api(t.path("/quickbooks"), { method: "DELETE", as: t.userId }));
    const kept = await json<QuoteQuickBooksDto>(
      api(t.path(`/quotes/${q.id}/quickbooks`), { as: t.userId }),
    );
    expect(kept.invoice?.docNumber).toBe(`Q${q.quoteNumber}`);
    expect(kept.connected).toBe(false);
  });

  it("uses the breaks the customer accepted online and leaves off what they did not order", async () => {
    const { t, one } = await setup();
    const q = await quoteWith(t, [
      { partNumber: "BRK-1001", inputs: one([10, 100]) },
      { partNumber: "SPC-220", inputs: one([10, 100]) },
    ]);
    const link = await json<CreatedCustomerLinkDto>(
      api(t.path(`/quotes/${q.id}/customer-links`), { method: "POST", as: t.userId }),
      201,
    );
    const token = decodeURIComponent(link.url.split("/q/")[1] ?? "");
    const first = q.lines[0]?.id ?? "";
    await json(
      api(`/api/quote-links/${encodeURIComponent(token)}/respond`, {
        method: "POST",
        json: {
          decision: "accept",
          name: "Sam Buyer",
          poNumber: "PO-4471",
          choices: [{ lineId: first, quantity: 100 }],
        },
      }),
    );
    await connect(t);
    const info = await json<QuoteQuickBooksDto>(
      api(t.path(`/quotes/${q.id}/quickbooks`), { as: t.userId }),
    );
    expect(info.accepted).toEqual([{ lineId: first, quantity: 100 }]);
    const sent = await json<QuoteQuickBooksDto>(send(t, q.id));
    expect(sent.invoice?.lines.map((l) => [l.partNumber, l.quantity])).toEqual([["BRK-1001", 100]]);
    expect(sent.invoice?.totalCents).toBe(
      q.lines[0]?.breaks?.find((b) => b.quantity === 100)?.totalCents,
    );
  });

  it("is refused before the win, without a connection, for a viewer, and across shops", async () => {
    const { t, one } = await setup();
    const q = await quoteWith(t, [{ partNumber: "BRK-1001", inputs: one([25]) }]);
    await connect(t);
    const early = await send(t, q.id);
    expect(early.status).toBe(409);
    expect(await early.text()).toContain("won quote");
    await win(t, q.id);
    const viewer = await addMember(t.orgId, "viewer");
    expect((await send(t, q.id, [], viewer)).status).toBe(403);
    // A viewer may read what would be sent.
    expect((await api(t.path(`/quotes/${q.id}/quickbooks`), { as: viewer })).status).toBe(200);
    const other = await setupTenant();
    expect((await api(t.path(`/quotes/${q.id}/quickbooks`), { as: other.userId })).status).toBe(
      404,
    );
    expect((await send(t, q.id, [], other.userId)).status).toBe(404);
    // Another shop's own path to this quote id finds nothing either.
    expect((await api(other.path(`/quotes/${q.id}/quickbooks`), { as: other.userId })).status).toBe(
      404,
    );

    await json(api(t.path("/quickbooks"), { method: "DELETE", as: t.userId }));
    const unconnected = await send(t, q.id);
    expect(unconnected.status).toBe(409);
    expect(await unconnected.text()).toContain("Connect QuickBooks first");
  });

  it("refuses books kept in another currency, and sends once they match", async () => {
    const { t, one } = await setup();
    const q = await quoteWith(t, [{ partNumber: "BRK-1001", inputs: one([25]) }]);
    await win(t, q.id);
    await connect(t);
    fakeQuickBooksSettings.value = "CAD";
    const res = await send(t, q.id);
    expect(res.status).toBe(409);
    expect(await res.text()).toContain("keeps its books in CAD");
    expect((await booksOf(t)).invoices.size).toBe(0);
    fakeQuickBooksSettings.value = "USD";
    expect((await send(t, q.id)).status).toBe(200);
  });

  it("reuses an invoice already in QuickBooks under the quote's number only at the same total", async () => {
    const { t, one } = await setup();
    const q = await quoteWith(t, [{ partNumber: "BRK-1001", inputs: one([25]) }]);
    await win(t, q.id);
    await connect(t);
    const books = await booksOf(t);
    const income = await books.ensureAccount({ name: "Sales", accountType: "Income" });
    const item = await books.ensureItem({
      name: "Other",
      type: "Service",
      incomeAccountId: income.id,
    });
    const c = await books.upsertCustomer({ displayName: "Someone Else" });
    await books.createInvoice({
      customerId: c.id,
      docNumber: `Q${q.quoteNumber}`,
      lines: [{ itemId: item.id, amountCents: 100 }],
    });
    const res = await send(t, q.id);
    expect(res.status).toBe(409);
    expect(await res.text()).toContain("for a different amount");
    expect(books.invoices.size).toBe(1);
  });
});

describe("the shop's own QuickBooks item and income account", () => {
  const setItem = (t: Tenant, itemId: string | null, as = t.userId) =>
    api(t.path("/quickbooks/item"), { method: "PUT", as, json: { itemId } });
  const items = (t: Tenant, as = t.userId) => api(t.path("/quickbooks/items"), { as });

  async function withSaleItems(t: Tenant) {
    const books = await booksOf(t);
    const machining = await books.ensureAccount({
      name: "Machining Income",
      accountType: "Income",
    });
    const own = await books.ensureItem({
      name: "CNC machining",
      type: "Service",
      incomeAccountId: machining.id,
    });
    // An Inventory item, as QuickBooks Plus companies have: never a choice for quote lines.
    books.items.set("inv-1", {
      id: "inv-1",
      syncToken: "0",
      name: "Bar stock",
      type: "Inventory",
      incomeAccountId: machining.id,
    });
    return { books, own, machining };
  }

  it("lists the company's sale items, saves a choice, and bills won quotes with it", async () => {
    const { t, one } = await setup();
    const q = await quoteWith(t, [{ partNumber: "BRK-1001", inputs: one([25]) }]);
    await win(t, q.id);
    await connect(t);
    const { books, own, machining } = await withSaleItems(t);

    const listed = await json<QuickBooksItemsDto>(items(t));
    expect(listed.current).toBeNull();
    expect(listed.defaultItemName).toBe("Machined parts");
    expect(listed.defaultAccountName).toBe("Sales of Product Income");
    expect(listed.items).toEqual([
      { id: own.id, name: "CNC machining", type: "Service", incomeAccountName: "Machining Income" },
    ]);
    expect((await status(t)).connection?.invoiceItem).toEqual({
      id: null,
      name: "Machined parts",
      custom: false,
    });

    const saved = await json<QuickBooksItemsDto>(setItem(t, own.id));
    expect(saved.current).toEqual({ id: own.id, name: "CNC machining" });
    expect((await status(t)).connection?.invoiceItem).toEqual({
      id: own.id,
      name: "CNC machining",
      custom: true,
    });

    expect((await send(t, q.id)).status).toBe(200);
    const invoice = [...books.invoices.values()][0];
    expect(invoice?.lines.map((l) => l.itemId)).toEqual([own.id]);
    // The default item and account were never created.
    expect(await books.findItemByName("Machined parts")).toBeNull();
    expect(await books.findAccountByName("Sales of Product Income")).toBeNull();
    expect(books.items.get(own.id)?.incomeAccountId).toBe(machining.id);
  });

  it("goes back to Machined parts on null", async () => {
    const { t, one } = await setup();
    const q = await quoteWith(t, [{ partNumber: "BRK-1001", inputs: one([25]) }]);
    await win(t, q.id);
    await connect(t);
    const { books, own } = await withSaleItems(t);
    await json(setItem(t, own.id));
    const cleared = await json<QuickBooksItemsDto>(setItem(t, null));
    expect(cleared.current).toBeNull();
    expect((await send(t, q.id)).status).toBe(200);
    const invoice = [...books.invoices.values()][0];
    expect(books.items.get(invoice?.lines[0]?.itemId ?? "")?.name).toBe("Machined parts");
  });

  it("refuses an unknown, inactive or Inventory item, and refuses the send if the item went inactive", async () => {
    const { t, one } = await setup();
    const q = await quoteWith(t, [{ partNumber: "BRK-1001", inputs: one([25]) }]);
    await win(t, q.id);
    await connect(t);
    const { books, own } = await withSaleItems(t);

    const unknown = await setItem(t, "no-such-item");
    expect(unknown.status).toBe(400);
    expect(await unknown.text()).toContain("not in QuickBooks");
    const inventory = await setItem(t, "inv-1");
    expect(inventory.status).toBe(400);
    expect(await inventory.text()).toContain("Inventory item");

    await json(setItem(t, own.id));
    books.inactiveItems.add(own.id);
    const res = await send(t, q.id);
    expect(res.status).toBe(409);
    expect(await res.text()).toContain("is no longer active in QuickBooks");
    expect(books.invoices.size).toBe(0);
    expect(
      (await json<QuoteQuickBooksDto>(api(t.path(`/quotes/${q.id}/quickbooks`), { as: t.userId })))
        .invoice,
    ).toBeNull();
  });

  it("is an admin's choice, per shop, and forgotten when another company is connected", async () => {
    const { t } = await setup();
    await connect(t);
    const { own } = await withSaleItems(t);
    const estimator = await addMember(t.orgId, "estimator");
    expect((await items(t, estimator)).status).toBe(403);
    expect((await setItem(t, own.id, estimator)).status).toBe(403);
    const other = await setupTenant();
    expect((await setItem(t, own.id, other.userId)).status).toBe(404);
    expect((await items(t, other.userId)).status).toBe(404);
    // The other shop has no connection of its own.
    const theirs = await setItem(other, own.id, other.userId);
    expect(theirs.status).toBe(409);

    await json(setItem(t, own.id));
    // Reconnecting (the fake gives a new company each time) falls back to the default.
    await connect(t);
    expect((await status(t)).connection?.invoiceItem.custom).toBe(false);
    expect((await json<QuickBooksItemsDto>(items(t))).current).toBeNull();
  });
});
