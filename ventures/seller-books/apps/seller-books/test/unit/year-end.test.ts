import { parseCsv, toCsv } from "@shared/csv";
import { buildScheduleC, onHandAt } from "@worker/services/books/schedule-c";
import {
  closingInventoryList,
  expenseList,
  type InventoryListItem,
  mileageLog,
} from "@worker/services/books/year-end";
import { describe, expect, it } from "vitest";

const item = (over: Partial<InventoryListItem>): InventoryListItem => ({
  sku: null,
  title: "Item",
  acquiredDate: "2026-03-01",
  costCents: 1000,
  costIsManual: true,
  status: "in_stock",
  disposedDate: null,
  lotName: null,
  ...over,
});

const items: InventoryListItem[] = [
  item({ title: "Still in stock", sku: "A-1", acquiredDate: "2025-11-02", costCents: 1250 }),
  item({ title: "Sold in July", status: "sold", disposedDate: "2026-07-04", costCents: 900 }),
  // Sold in January of the next year: on hand at the year end.
  item({
    title: "Sold next January",
    status: "sold",
    disposedDate: "2027-01-08",
    costCents: 700,
    costIsManual: false,
    lotName: "Estate sale",
  }),
  item({ title: "Bought next year", acquiredDate: "2027-01-02", costCents: 5000 }),
  item({ title: "Written off, no date", status: "written_off", costCents: 300 }),
];

describe("onHandAt", () => {
  it("counts an item from the day it is bought until the day it leaves", () => {
    const it2 = { acquiredDate: "2026-02-01", status: "sold", disposedDate: "2026-05-01" };
    expect(onHandAt(it2, "2026-01-31")).toBe(false);
    expect(onHandAt(it2, "2026-02-01")).toBe(true);
    expect(onHandAt(it2, "2026-04-30")).toBe(true);
    expect(onHandAt(it2, "2026-05-01")).toBe(false);
    expect(onHandAt({ ...it2, disposedDate: null }, "2030-01-01")).toBe(true);
  });
});

describe("closing inventory list", () => {
  it("lists the items on hand on December 31 and totals to worksheet line 41", () => {
    const list = closingInventoryList(2026, items);
    expect(list.count).toBe(3);
    expect(list.totalCents).toBe(1250 + 700 + 300);

    const ws = buildScheduleC({
      year: 2026,
      sales: [],
      charges: [],
      expenses: [],
      items,
      unallocatedLots: [],
      businessMiles: 0,
      mileageRateCents: null,
    });
    expect(ws.partIII.find((l) => l.line === "41")?.amountCents).toBe(list.totalCents);

    const rows = parseCsv(toCsv(list.rows));
    const header = rows.findIndex((r) => r[0] === "Acquired");
    const data = rows.slice(header + 1, header + 1 + list.count);
    // Oldest first, then SKU, then title.
    expect(data.map((r) => r[2])).toEqual([
      "Still in stock",
      "Sold next January",
      "Written off, no date",
    ]);
    const next = data.find((r) => r[2] === "Sold next January") ?? [];
    expect(next[3]).toBe("Estate sale");
    expect(next[5]).toBe("Share of lot cost");
    expect(next[6]).toBe("On hand; left 2027-01-08");
    expect(rows[header + 1 + list.count]?.[4]).toBe("22.50");
    expect(rows.some((r) => /1 item\(s\) are marked .* with no date/.test(r[0] ?? ""))).toBe(true);
    expect(rows[1]?.[0]).toMatch(/not tax advice/);
  });

  it("an empty year still gives a header and a zero total", () => {
    const list = closingInventoryList(2024, items);
    expect(list.count).toBe(0);
    expect(list.totalCents).toBe(0);
  });
});

describe("mileage log", () => {
  it("counts a round trip twice and works out line 9 at the chosen rate", () => {
    const log = mileageLog(
      2026,
      [
        {
          date: "2026-05-06",
          purpose: "Estate sale pickup",
          startPlace: "Home",
          endPlace: "Elm St",
          milesTenths: 125,
          roundTrip: true,
        },
        {
          date: "2026-02-01",
          purpose: "Post office",
          startPlace: null,
          endPlace: null,
          milesTenths: 33,
          roundTrip: false,
        },
      ],
      70,
    );
    expect(log.miles).toBe(28.3);
    const rows = parseCsv(toCsv(log.rows));
    const header = rows.findIndex((r) => r[0] === "Date");
    expect(rows[header + 1]?.[1]).toBe("Post office");
    expect(rows[header + 2]?.slice(4)).toEqual(["12.5", "Yes", "25.0", "70", "17.50"]);
    expect(rows[header + 3]?.[6]).toBe("28.3");
    // 28.3 × 70 = 1981 cents, as the worksheet rounds it.
    expect(rows.some((r) => /Line 9 .* is \$19\.81/.test(r[0] ?? ""))).toBe(true);
    expect(log.line9Cents).toBe(1981);
    expect(mileageLog(2026, [], null).rows.some((r) => /No trips logged/.test(String(r[0])))).toBe(
      true,
    );
  });
});

describe("expense list", () => {
  it("lists each expense with its worksheet line and notes the meals half", () => {
    const list = expenseList(
      2026,
      [
        {
          date: "2026-05-05",
          category: "supplies",
          amountCents: 1299,
          vendor: "Uline",
          memo: null,
          platform: null,
        },
        {
          date: "2026-03-01",
          category: "shipping_postage",
          amountCents: 450,
          vendor: "=HYPERLINK(evil)",
          memo: "Poly mailers",
          platform: "ebay",
        },
        {
          date: "2026-06-01",
          category: "meals",
          amountCents: 3001,
          vendor: "Diner",
          memo: null,
          platform: null,
        },
      ],
      { category: (c) => c, platform: (p) => (p === "ebay" ? "eBay" : p) },
    );
    expect(list.totalCents).toBe(1299 + 450 + 3001);
    const csv = toCsv(list.rows);
    const rows = parseCsv(csv);
    const header = rows.findIndex((r) => r[0] === "Date");
    expect(rows[header + 1]).toEqual([
      "2026-03-01",
      "'=HYPERLINK(evil)",
      "shipping_postage",
      "27a",
      "4.50",
      "eBay",
      "Poly mailers",
    ]);
    expect(rows[header + 2]?.[3]).toBe("22");
    expect(rows[header + 3]?.[3]).toBe("24b");
    expect(
      rows.some((r) => /full \$30\.01 paid; .* counts half \(\$15\.01\)/.test(r[0] ?? "")),
    ).toBe(true);
  });
});
