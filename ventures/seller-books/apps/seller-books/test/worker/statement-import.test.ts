import { leftOutMerchant } from "@worker/db/schema";
import { describe, expect, it } from "vitest";
import chaseCsv from "../fixtures/statement-chase-card.csv?raw";
import { api, json, setupTenant, testDb } from "./helpers";

interface PreviewRow {
  line: number;
  date: string;
  description: string;
  amountCents: number;
  alreadyInBooks: boolean;
  suggestion: { category: string; include: boolean; reason: string | null };
}

const preview = (as: string, orgId: string, csv: string) =>
  api(`/api/orgs/${orgId}/expenses/statement`, {
    method: "POST",
    as,
    json: { fileName: "chase.csv", csv },
  });

const save = (as: string, orgId: string, rows: unknown[], leftOut?: unknown[]) =>
  api(`/api/orgs/${orgId}/expenses/batch`, {
    method: "POST",
    as,
    json: { fileName: "chase.csv", rows, leftOut },
  });

const leftOutList = async (as: string, orgId: string) =>
  (
    await json<{ merchants: { merchant: string; count: number; lastDate: string }[] }>(
      await api(`/api/orgs/${orgId}/expenses/left-out`, { as }),
    )
  ).merchants;

const ticked = (rows: PreviewRow[]) =>
  rows
    .filter((r) => r.suggestion.include && !r.alreadyInBooks)
    .map((r) => ({
      date: r.date,
      category: r.suggestion.category,
      amountCents: r.amountCents,
      vendor: r.description,
    }));

describe("expenses from a bank or card statement", () => {
  it("previews without writing, saves the ticked rows, and skips them on a second import", async () => {
    const { userId, orgId } = await setupTenant();
    const res = await preview(userId, orgId, chaseCsv);
    expect(res.status).toBe(200);
    const p = await json<{ rows: PreviewRow[] }>(res);
    expect(p.rows).toHaveLength(10);
    expect(p.rows.every((r) => !r.alreadyInBooks)).toBe(true);
    const none = await json<{ items: unknown[] }>(
      await api(`/api/orgs/${orgId}/expenses`, { as: userId }),
    );
    expect(none.items).toHaveLength(0);

    const rows = ticked(p.rows);
    expect(rows).toHaveLength(5); // three USPS, Uline, Vendoo
    const saved = await save(userId, orgId, rows);
    expect(saved.status).toBe(201);
    expect(await json(saved)).toEqual({
      created: 5,
      duplicatesSkipped: 0,
      totalCents: 1240 * 3 + 8615 + 2999,
      merchantsRemembered: 0,
    });
    const list = await json<{ items: { vendor: string; memo: string; category: string }[] }>(
      await api(`/api/orgs/${orgId}/expenses`, { as: userId }),
    );
    expect(list.items).toHaveLength(5);
    expect(list.items[0]?.memo).toBe("From chase.csv");

    // The same file again: the saved lines are marked, and saving them again adds nothing.
    const again = await json<{ rows: PreviewRow[] }>(await preview(userId, orgId, chaseCsv));
    expect(again.rows.filter((r) => r.alreadyInBooks)).toHaveLength(5);
    expect(ticked(again.rows)).toHaveLength(0);
    const dup = await json(await save(userId, orgId, rows));
    expect(dup).toMatchObject({ created: 0, duplicatesSkipped: 5 });

    // One of the two identical USPS charges deleted: a re-save adds back only that one.
    const all = await json<{ items: { id: string; date: string; vendor: string }[] }>(
      await api(`/api/orgs/${orgId}/expenses`, { as: userId }),
    );
    const usps = all.items.find((e) => e.date === "2026-01-21");
    await api(`/api/orgs/${orgId}/expenses/${usps?.id}`, { method: "DELETE", as: userId });
    expect(await json(await save(userId, orgId, rows))).toMatchObject({
      created: 1,
      duplicatesSkipped: 4,
    });

    // The worksheet counts them.
    const ws = await json<{ otherExpenses: { amountCents: number }[] }>(
      await api(`/api/orgs/${orgId}/reports/schedule-c?year=2026`, { as: userId }),
    );
    expect(JSON.stringify(ws)).toContain(String(8615));
  });

  it("starts each merchant with the shop's own latest category, and only that shop's", async () => {
    const { userId, orgId } = await setupTenant();
    const other = await setupTenant();
    const add = (as: string, org: string, vendor: string, category: string, date: string) =>
      api(`/api/orgs/${org}/expenses`, {
        method: "POST",
        as,
        json: { date, category, amountCents: 500, vendor },
      });
    // Typed by hand before any import: the cafe is where the seller meets buyers for pickups.
    expect((await add(userId, orgId, "Corner Cafe", "travel", "2025-11-02")).status).toBe(201);
    expect((await add(userId, orgId, "SQ *CORNER CAFE 77", "meals", "2025-12-14")).status).toBe(
      201,
    );
    expect((await add(userId, orgId, "AMZN Mktp US*9Z", "supplies", "2025-12-20")).status).toBe(
      201,
    );
    expect((await add(userId, orgId, "USPS", "office", "2025-12-01")).status).toBe(201);
    // Another shop filed Goodwill as supplies: that teaches this shop nothing.
    expect(
      (await add(other.userId, other.orgId, "Goodwill", "supplies", "2025-12-01")).status,
    ).toBe(201);

    const p = await json<{
      rows: (PreviewRow & { suggestion: { reason: string | null; kind: string } })[];
    }>(await preview(userId, orgId, chaseCsv));
    const by = (d: string) => p.rows.find((r) => r.description.startsWith(d))?.suggestion;
    expect(by("CORNER CAFE")).toMatchObject({ category: "meals", include: true });
    expect(by("CORNER CAFE")?.reason).toContain("from CORNER CAFE as meals (latest 2025-12-14)");
    // A store that sells everything: the category is filled in, the row still waits for the seller.
    expect(by("AMZN")).toMatchObject({ kind: "ambiguous", category: "supplies", include: false });
    // "USPS" typed by hand teaches "USPS PO ..." lines.
    expect(by("USPS")).toMatchObject({ category: "office", include: true });
    expect(by("GOODWILL")).toMatchObject({ kind: "inventory", include: false });
  });

  it("answers 400 with the expected columns for a file that is not a statement", async () => {
    const { userId, orgId } = await setupTenant();
    const res = await preview(userId, orgId, "Foo,Bar\n1,2\n");
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/transaction date/);
  });

  it("refuses viewers and other shops", async () => {
    const viewer = await setupTenant("viewer");
    expect((await preview(viewer.userId, viewer.orgId, chaseCsv)).status).toBe(403);
    const row = { date: "2026-01-03", category: "supplies", amountCents: 100, vendor: "X" };
    expect((await save(viewer.userId, viewer.orgId, [row])).status).toBe(403);

    const a = await setupTenant();
    const b = await setupTenant();
    expect((await preview(b.userId, a.orgId, chaseCsv)).status).toBe(404);
    expect((await save(b.userId, a.orgId, [row])).status).toBe(404);
    const aList = await json<{ items: unknown[] }>(
      await api(`/api/orgs/${a.orgId}/expenses`, { as: a.userId }),
    );
    expect(aList.items).toHaveLength(0);
  });

  it("validates rows: no zero amounts, a known category, at most 2000", async () => {
    const { userId, orgId } = await setupTenant();
    const ok = { date: "2026-01-03", category: "supplies", amountCents: 100, vendor: "X" };
    expect((await save(userId, orgId, [{ ...ok, amountCents: 0 }])).status).toBe(400);
    expect((await save(userId, orgId, [{ ...ok, category: "inventory" }])).status).toBe(400);
    expect((await save(userId, orgId, [])).status).toBe(400);
    const many = Array.from({ length: 2001 }, (_, i) => ({ ...ok, amountCents: i + 1 }));
    expect((await save(userId, orgId, many)).status).toBe(400);
    // 120 rows go in several inserts of one batch.
    const big = Array.from({ length: 120 }, (_, i) => ({ ...ok, amountCents: i + 1 }));
    expect(await json(await save(userId, orgId, big))).toMatchObject({ created: 120 });
  });

  it("remembers a merchant the seller left out, starts it unticked next time, and forgets it", async () => {
    const { userId, orgId } = await setupTenant();
    const p = await json<{ rows: PreviewRow[] }>(await preview(userId, orgId, chaseCsv));
    const rows = ticked(p.rows);
    const vendoo = rows.find((r) => r.vendor === "PAYPAL *VENDOO");
    expect(vendoo).toBeDefined();
    // The seller unticks Vendoo (a personal subscription, say) and asks the page to remember.
    const kept = rows.filter((r) => r !== vendoo);
    const saved = await save(userId, orgId, kept, [
      { date: vendoo?.date, description: vendoo?.vendor },
    ]);
    expect(saved.status).toBe(201);
    expect(await json(saved)).toMatchObject({ created: 4, merchantsRemembered: 1 });
    expect(await leftOutList(userId, orgId)).toEqual([
      { merchant: "VENDOO", count: 1, lastDate: "2026-01-07" },
    ]);
    // Nothing of the line but the merchant key and its date is stored.
    const stored = await testDb().select().from(leftOutMerchant);
    expect(stored.map(({ updatedAt: _u, ...r }) => r)).toEqual([
      { orgId, merchant: "VENDOO", count: 1, lastDate: "2026-01-07" },
    ]);

    const again = await json<{ rows: PreviewRow[] }>(await preview(userId, orgId, chaseCsv));
    const row = again.rows.find((r) => r.description === "PAYPAL *VENDOO");
    expect(row?.alreadyInBooks).toBe(false);
    expect(row?.suggestion.include).toBe(false);
    expect(row?.suggestion.reason).toBe(
      "You left out an earlier charge from VENDOO (latest 2026-01-07). Tick it if this one was for the business.",
    );
    expect(ticked(again.rows)).toHaveLength(0);

    // Remembering alone, with nothing ticked, is a save; nothing at all is refused.
    const cafe = { date: "2026-02-01", description: "SQ *CORNER CAFE 0412" };
    expect((await save(userId, orgId, [], [cafe])).status).toBe(201);
    expect((await save(userId, orgId, [])).status).toBe(400);
    // Another shop sees none of it and cannot forget it.
    const other = await setupTenant();
    expect(await leftOutList(other.userId, other.orgId)).toEqual([]);
    const otherForget = await api(`/api/orgs/${other.orgId}/expenses/left-out/VENDOO`, {
      method: "DELETE",
      as: other.userId,
    });
    expect(otherForget.status).toBe(404);

    // Filing a Vendoo charge later is the newer decision: it forgets the merchant.
    expect((await save(userId, orgId, [{ ...vendoo, date: "2026-02-07" }])).status).toBe(201);
    expect((await leftOutList(userId, orgId)).map((m) => m.merchant)).toEqual(["CORNER CAFE"]);

    // "Forget" deletes the row; a second forget is 404.
    const forget = () =>
      api(`/api/orgs/${orgId}/expenses/left-out/${encodeURIComponent("CORNER CAFE")}`, {
        method: "DELETE",
        as: userId,
      });
    expect((await forget()).status).toBe(200);
    expect((await forget()).status).toBe(404);
    expect(await leftOutList(userId, orgId)).toEqual([]);
  });

  it("lets viewers read the left-out list but not change it", async () => {
    const viewer = await setupTenant("viewer");
    expect(
      (await api(`/api/orgs/${viewer.orgId}/expenses/left-out`, { as: viewer.userId })).status,
    ).toBe(200);
    const res = await api(`/api/orgs/${viewer.orgId}/expenses/left-out/VENDOO`, {
      method: "DELETE",
      as: viewer.userId,
    });
    expect(res.status).toBe(403);
  });
});
