// Rate-card import (POST /rate-card/import) and the partial PATCH routes it shares a fix with.
import type { MachineDto, RateCardDto, RateCardImportResultDto } from "@shared/api";
import { describe, expect, it } from "vitest";
import { addMember, api, json, seedRateCard, setupTenant } from "./helpers";

const card = (t: { userId: string; path: (p?: string) => string }) =>
  json<RateCardDto>(api(t.path("/rate-card"), { as: t.userId }));

const post = (t: { userId: string; path: (p?: string) => string }, body: unknown, as = t.userId) =>
  api(t.path("/rate-card/import"), { method: "POST", as, json: body });

describe("rate-card import", () => {
  it("updates rates by name, keeps the columns the sheet lacks and adds new ones", async () => {
    const t = await setupTenant();
    await seedRateCard(t);
    await json(
      api(t.path("/rate-card/machines"), {
        method: "POST",
        as: t.userId,
        json: {
          name: "Okuma LB3000",
          kind: "lathe",
          hourlyRateCents: 10_000,
          defaultSetupMinutes: 60,
        },
      }),
      201,
    );
    const res = await json<RateCardImportResultDto>(
      post(t, {
        kind: "machines",
        rows: [
          { row: 2, values: { name: "okuma  lb3000", hourlyRateCents: 11_500 } },
          { row: 3, values: { name: "Brother S700", kind: "mill_3axis", hourlyRateCents: 8_500 } },
        ],
      }),
    );
    expect(res).toEqual({ created: 1, updated: 1 });
    const after = await card(t);
    const okuma = after.machines.find((m) => m.name === "Okuma LB3000");
    expect(okuma).toMatchObject({
      hourlyRateCents: 11_500,
      defaultSetupMinutes: 60,
      kind: "lathe",
    });
    expect(after.machines.find((m) => m.name === "Brother S700")).toMatchObject({
      hourlyRateCents: 8_500,
      setupRateCents: null,
      active: true,
    });
  });

  it("counts and writes only the rows that change something", async () => {
    const t = await setupTenant();
    await seedRateCard(t);
    await json(
      api(t.path("/rate-card/machines"), {
        method: "POST",
        as: t.userId,
        json: { name: "Okuma LB3000", kind: "lathe", hourlyRateCents: 10_000 },
      }),
      201,
    );
    const before = await card(t);
    const [a, b] = before.machines;
    if (!a || !b) throw new Error("two machines expected");
    // The same sheet imported twice: once with one new rate, once unchanged.
    const rows = (rate: number) => [
      { row: 2, values: { name: a.name, hourlyRateCents: rate } },
      { row: 3, values: { name: b.name, hourlyRateCents: b.hourlyRateCents } },
    ];
    const res = await json<RateCardImportResultDto>(
      post(t, { kind: "machines", rows: rows(a.hourlyRateCents + 500) }),
    );
    expect(res).toEqual({ created: 0, updated: 1 });
    const again = await json<RateCardImportResultDto>(
      post(t, { kind: "machines", rows: rows(a.hourlyRateCents + 500) }),
    );
    expect(again).toEqual({ created: 0, updated: 0 });
    const after = await card(t);
    expect(after.machines.find((m) => m.id === b.id)).toEqual(b);
  });

  it("saves nothing when one row is bad, and names the row", async () => {
    const t = await setupTenant();
    await seedRateCard(t);
    const before = await card(t);
    const res = await post(t, {
      kind: "materials",
      rows: [
        { row: 2, values: { name: "Aluminum 6061-T6 plate", pricePerLbCents: 500 } },
        // A new per-stock material with no stock price: refused by the editor's own rule.
        { row: 3, values: { name: "Titanium Gr5 bar", pricingBasis: "per_stock" } },
      ],
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { details: { row: number; message: string }[] } };
    expect(body.error.details).toEqual([{ row: 3, message: expect.stringMatching(/stock price/) }]);
    expect(await card(t)).toEqual(before);
  });

  it("refuses duplicate names and rows that try to set ids or another shop", async () => {
    const t = await setupTenant();
    const dup = await post(t, {
      kind: "finishing-ops",
      rows: [
        { row: 2, values: { name: "Anodize", perPartCents: 300 } },
        { row: 3, values: { name: "ANODIZE", perPartCents: 350 } },
      ],
    });
    expect(dup.status).toBe(400);
    // Unknown keys are dropped by the schema: the row is created in the caller's shop with a new id.
    const other = await setupTenant();
    await json(
      post(t, {
        kind: "finishing-ops",
        rows: [
          {
            row: 2,
            values: { name: "Passivate", perPartCents: 50, id: "fin_x", orgId: other.orgId },
          },
        ],
      }),
    );
    const mine = await card(t);
    expect(mine.finishingOps.map((f) => f.name)).toEqual(["Passivate"]);
    expect(mine.finishingOps[0]?.id).not.toBe("fin_x");
    expect((await card(other)).finishingOps).toEqual([]);
  });

  it("only touches the caller's shop when names match another shop's rates", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    await seedRateCard(a);
    await json(
      post(b, {
        kind: "machines",
        rows: [{ row: 2, values: { name: "Haas VF-2", hourlyRateCents: 1 } }],
      }),
    );
    expect((await card(a)).machines[0]?.hourlyRateCents).toBe(9_500);
    expect((await card(b)).machines.map((m) => m.hourlyRateCents)).toEqual([1]);
    // B's user on A's path: not found, nothing written.
    const cross = await api(a.path("/rate-card/import"), {
      method: "POST",
      as: b.userId,
      json: {
        kind: "machines",
        rows: [{ row: 2, values: { name: "Haas VF-2", hourlyRateCents: 2 } }],
      },
    });
    expect(cross.status).toBe(404);
    expect((await card(a)).machines[0]?.hourlyRateCents).toBe(9_500);
  });

  it("is admin-only", async () => {
    const t = await setupTenant();
    const estimator = await addMember(t.orgId, "estimator");
    const res = await post(
      t,
      { kind: "machines", rows: [{ row: 2, values: { name: "Saw", hourlyRateCents: 4_000 } }] },
      estimator,
    );
    expect(res.status).toBe(403);
  });

  it("caps the rows per import", async () => {
    const t = await setupTenant();
    const rows = Array.from({ length: 501 }, (_, i) => ({
      row: i + 2,
      values: { name: `M${i}`, hourlyRateCents: 1 },
    }));
    expect((await post(t, { kind: "machines", rows })).status).toBe(400);
  });
});

describe("partial PATCH of a rate", () => {
  it("changes only the fields sent (no defaults reset the rest, no un-retiring)", async () => {
    const t = await setupTenant();
    const m = await json<MachineDto>(
      api(t.path("/rate-card/machines"), {
        method: "POST",
        as: t.userId,
        json: {
          name: "DMG 5-axis",
          kind: "mill_5axis",
          hourlyRateCents: 15_000,
          setupRateCents: 12_000,
          defaultSetupMinutes: 90,
          removalRateIn3PerMin: 4,
        },
      }),
      201,
    );
    await json(api(t.path(`/rate-card/machines/${m.id}`), { method: "DELETE", as: t.userId }));
    const patched = await json<MachineDto>(
      api(t.path(`/rate-card/machines/${m.id}`), {
        method: "PATCH",
        as: t.userId,
        json: { hourlyRateCents: 16_000 },
      }),
    );
    expect(patched).toMatchObject({
      hourlyRateCents: 16_000,
      setupRateCents: 12_000,
      defaultSetupMinutes: 90,
      removalRateIn3PerMin: 4,
      active: false,
    });
  });
});
