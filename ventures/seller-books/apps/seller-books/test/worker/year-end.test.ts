// Year-end records: the closing inventory list, the mileage log and the expense list, downloaded as CSV,
// each totalling to its worksheet figure, and invisible to other shops.
import { parseCsv } from "@shared/csv";
import { describe, expect, it } from "vitest";
import { api, json, setupTenant } from "./helpers";

const csvRows = async (res: Response) => parseCsv(await res.text());
const totalRow = (rows: string[][]) => rows.find((r) => r[0] === "Total") ?? [];

describe("year-end records", () => {
  it("each list totals to the worksheet's own figure", async () => {
    const { userId, orgId } = await setupTenant();
    const lot = await json<{ id: string }>(
      await api(`/api/orgs/${orgId}/inventory/lots`, {
        method: "POST",
        as: userId,
        json: {
          name: "Estate sale haul",
          acquiredDate: "2026-04-01",
          totalCostCents: 3000,
          items: [
            { title: "Blue glass vase", sku: "VASE-03" },
            { title: "Candle holders", sku: "CANDLE-1" },
            { title: "Brass bell", sku: null, costCents: 1000 },
          ],
        },
      }),
    );
    const detail = await json<{ items: { id: string; title: string }[] }>(
      await api(`/api/orgs/${orgId}/inventory/lots/${lot.id}`, { as: userId }),
    );
    const bell = detail.items.find((i) => i.title === "Brass bell");
    // Written off in the year: not on hand at the year end.
    const off = await api(`/api/orgs/${orgId}/inventory/items/${bell?.id}`, {
      method: "PATCH",
      as: userId,
      json: { status: "written_off", disposedDate: "2026-09-01" },
    });
    expect(off.status).toBe(200);
    // Bought next year: not in this year's list.
    await api(`/api/orgs/${orgId}/inventory/items`, {
      method: "POST",
      as: userId,
      json: { title: "Next year's tote", acquiredDate: "2027-01-03", costCents: 800 },
    });
    await api(`/api/orgs/${orgId}/mileage`, {
      method: "POST",
      as: userId,
      json: { date: "2026-05-06", purpose: "Estate sale pickup", miles: 12.5, roundTrip: true },
    });
    await api(`/api/orgs/${orgId}/mileage`, {
      method: "POST",
      as: userId,
      json: { date: "2025-12-30", purpose: "Last year's trip", miles: 40 },
    });
    for (const e of [
      { date: "2026-05-05", category: "supplies", amountCents: 1299, vendor: "Uline" },
      { date: "2026-06-01", category: "meals", amountCents: 3000, vendor: "Diner" },
      { date: "2027-01-02", category: "supplies", amountCents: 999, vendor: "Next year" },
    ]) {
      await api(`/api/orgs/${orgId}/expenses`, { method: "POST", as: userId, json: e });
    }

    const ws = await json<{
      lines: { line: string; amountCents: number | null }[];
      partIII: { line: string; amountCents: number }[];
      businessMiles: number;
    }>(await api(`/api/orgs/${orgId}/reports/schedule-c?year=2026&mileageRate=70`, { as: userId }));
    const line41 = ws.partIII.find((l) => l.line === "41")?.amountCents ?? -1;
    expect(line41).toBe(2000);

    const inv = await api(`/api/orgs/${orgId}/reports/closing-inventory.csv?year=2026`, {
      as: userId,
    });
    expect(inv.status).toBe(200);
    expect(inv.headers.get("Content-Type")).toMatch(/text\/csv/);
    expect(inv.headers.get("Content-Disposition")).toBe(
      "attachment; filename=closing-inventory-2026.csv",
    );
    const invRows = await csvRows(inv);
    expect(totalRow(invRows)[4]).toBe((line41 / 100).toFixed(2));
    expect(totalRow(invRows)[2]).toBe("2 item(s)");
    const header = invRows.findIndex((r) => r[0] === "Acquired");
    expect(invRows.slice(header + 1, header + 3).map((r) => [r[1], r[3], r[5]])).toEqual([
      ["CANDLE-1", "Estate sale haul", "Share of lot cost"],
      ["VASE-03", "Estate sale haul", "Share of lot cost"],
    ]);

    const log = await csvRows(
      await api(`/api/orgs/${orgId}/reports/mileage-log.csv?year=2026&mileageRate=70`, {
        as: userId,
      }),
    );
    expect(totalRow(log)[6]).toBe(ws.businessMiles.toFixed(1));
    expect(totalRow(log)[8]).toBe(
      ((ws.lines.find((l) => l.line === "9")?.amountCents ?? -1) / 100).toFixed(2),
    );
    expect(totalRow(log)[1]).toBe("1 trip(s)");
    const line9 = ws.lines.find((l) => l.line === "9")?.amountCents ?? -1;
    expect(log.some((r) => (r[0] ?? "").includes(`is $${(line9 / 100).toFixed(2)}`))).toBe(true);

    const exp = await csvRows(
      await api(`/api/orgs/${orgId}/reports/expenses.csv?year=2026`, { as: userId }),
    );
    expect(totalRow(exp)[4]).toBe("42.99");
    expect(totalRow(exp)[1]).toBe("2 expense(s)");
    expect(exp.find((r) => r[1] === "Uline")?.slice(2, 4)).toEqual(["Supplies", "22"]);
    expect(ws.lines.find((l) => l.line === "24b")?.amountCents).toBe(1500);
    expect(exp.some((r) => /counts half \(\$15\.00\)/.test(r[0] ?? ""))).toBe(true);

    expect(
      (await api(`/api/orgs/${orgId}/reports/expenses.csv?year=1999`, { as: userId })).status,
    ).toBe(400);
  });

  it("with no rate typed in, line 9 and the log price each trip at the IRS rate on its date", async () => {
    const { userId, orgId } = await setupTenant();
    for (const t of [
      { date: "2026-06-30", purpose: "Thrift run", miles: 20 },
      { date: "2026-07-01", purpose: "Flea market", miles: 15, roundTrip: true },
    ]) {
      await api(`/api/orgs/${orgId}/mileage`, { method: "POST", as: userId, json: t });
    }
    const ws = await json<{
      lines: { line: string; amountCents: number | null; note?: string }[];
      warnings: string[];
      mileagePricing: { byRate: { cents: number; miles: number }[] };
    }>(await api(`/api/orgs/${orgId}/reports/schedule-c?year=2026`, { as: userId }));
    const l9 = ws.lines.find((l) => l.line === "9");
    // 20 × 72.5 = 1450 and 30 × 76 = 2280.
    expect(l9?.amountCents).toBe(3730);
    expect(ws.mileagePricing.byRate.map((g) => [g.cents, g.miles])).toEqual([
      [72.5, 20],
      [76, 30],
    ]);
    expect(ws.warnings.join(" ")).not.toMatch(/mileage/i);
    const log = await csvRows(
      await api(`/api/orgs/${orgId}/reports/mileage-log.csv?year=2026`, { as: userId }),
    );
    expect(totalRow(log)[8]).toBe("37.30");

    // The quarterly estimates read the same rule: through June 30, only the first trip counts.
    const est = await json<{ rows: { profitToDate: number | null }[] }>(
      await api(`/api/orgs/${orgId}/reports/estimated-tax`, {
        method: "POST",
        as: userId,
        json: { year: 2026, asOf: "2026-12-31" },
      }),
    );
    // Periods end March 31, May 31, August 31 and December 31: no income, so profit is minus line 9.
    expect(est.rows.map((r) => r.profitToDate)).toEqual([0, 0, -3730, -3730]);
  });

  it("another shop gets 404 for every list", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    for (const path of [
      "/reports/closing-inventory.csv?year=2026",
      "/reports/mileage-log.csv?year=2026",
      "/reports/expenses.csv?year=2026",
      "/reports/year-end.zip?year=2026",
    ]) {
      expect((await api(`/api/orgs/${a.orgId}${path}`, { as: b.userId })).status, path).toBe(404);
      expect((await api(`/api/orgs/${a.orgId}${path}`, { as: a.userId })).status, path).toBe(200);
    }
  });

  it("the year-end ZIP holds each single download byte for byte, with a README", async () => {
    const { userId, orgId } = await setupTenant();
    await api(`/api/orgs/${orgId}/inventory/items`, {
      method: "POST",
      as: userId,
      json: { title: "Wool coat", acquiredDate: "2026-02-01", costCents: 1500 },
    });
    await api(`/api/orgs/${orgId}/mileage`, {
      method: "POST",
      as: userId,
      json: { date: "2026-05-06", purpose: "Estate sale pickup", miles: 12.5, roundTrip: true },
    });
    await api(`/api/orgs/${orgId}/expenses`, {
      method: "POST",
      as: userId,
      json: { date: "2026-05-05", category: "supplies", amountCents: 1299, vendor: "Uline" },
    });
    await api(`/api/orgs/${orgId}/sales`, {
      method: "POST",
      as: userId,
      json: { date: "2026-03-14", title: "Brass bell", itemCents: 4500 },
    });

    const res = await api(`/api/orgs/${orgId}/reports/year-end.zip?year=2026&mileageRate=70`, {
      as: userId,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    expect(res.headers.get("Content-Disposition")).toBe(
      "attachment; filename=seller-books-year-end-2026.zip",
    );
    const files = unzipStored(new Uint8Array(await res.arrayBuffer()));
    expect([...files.keys()]).toEqual([
      "README.txt",
      "schedule-c-worksheet-2026.csv",
      "sales-ledger-2026-01-01-to-2026-12-31.csv",
      "closing-inventory-2026.csv",
      "mileage-log-2026.csv",
      "expenses-2026.csv",
      "quickbooks-journal-2026.csv",
    ]);
    const single = async (path: string) =>
      (await api(`/api/orgs/${orgId}/reports/${path}`, { as: userId })).text();
    expect(files.get("schedule-c-worksheet-2026.csv")).toBe(
      await single("schedule-c.csv?year=2026&mileageRate=70"),
    );
    expect(files.get("sales-ledger-2026-01-01-to-2026-12-31.csv")).toBe(
      await single("sales-ledger.csv?from=2026-01-01&to=2026-12-31"),
    );
    expect(files.get("closing-inventory-2026.csv")).toBe(
      await single("closing-inventory.csv?year=2026"),
    );
    expect(files.get("mileage-log-2026.csv")).toBe(
      await single("mileage-log.csv?year=2026&mileageRate=70"),
    );
    expect(files.get("expenses-2026.csv")).toBe(await single("expenses.csv?year=2026"));
    expect(files.get("quickbooks-journal-2026.csv")).toBe(
      await single("quickbooks-journal.csv?from=2026-01-01&to=2026-12-31"),
    );
    const readme = files.get("README.txt") ?? "";
    expect(readme).toMatch(/Line 41 +Inventory at end of year +\$15\.00/);
    expect(readme).toContain("1 trip(s), 25.0 mile(s)");
    expect(readme).toContain("line 9 $17.50");
    expect(readme).toContain("at 70 cents a mile");
    expect(readme).toContain("1 expense(s), $12.99 paid");
    expect(readme).toContain("not tax advice");

    expect(
      (await api(`/api/orgs/${orgId}/reports/year-end.zip?year=1999`, { as: userId })).status,
    ).toBe(400);
  });
});

/** Reads a stored-only ZIP (the app writes no compression) through its central directory. */
function unzipStored(buf: Uint8Array): Map<string, string> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const eocd = buf.length - 22;
  expect(view.getUint32(eocd, true)).toBe(0x06054b50);
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(p, true)).toBe(0x02014b50);
    expect(view.getUint16(p + 10, true)).toBe(0);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    out.set(name, dec.decode(buf.subarray(start, start + size)));
    p += 46 + nameLen;
  }
  return out;
}
