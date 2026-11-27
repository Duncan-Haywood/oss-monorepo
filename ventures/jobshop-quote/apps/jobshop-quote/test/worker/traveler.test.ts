// Job traveler for a won quote (services/quotes/traveler.ts): the floor's sheet per part, with the
// quantity ordered, material, operations and the estimate's times, never a price; refused for a
// quote not won, a multi-break line with no quantity, and across shops.
import type { QuoteDetailDto } from "@shared/api";
import type { CostInputs } from "@shared/costing";
import type { CreatedCustomerLinkDto } from "@shared/customer-link";
import { describe, expect, it } from "vitest";
import { addMember, api, json, seedRateCard, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;

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

const traveler = (t: Tenant, id: string, query = "", as = t.userId) =>
  api(t.path(`/quotes/${id}/traveler.pdf${query}`), { as });

const text = async (res: Response) => new TextDecoder("latin1").decode(await res.arrayBuffer());

describe("job traveler", () => {
  it("prints the operations, material and quantities for the floor, and no prices", async () => {
    const t = await setupTenant();
    const r = await seedRateCard(t);
    const q = await quoteWith(t, [
      {
        partNumber: "BRK-1001",
        inputs: {
          quantities: [50],
          falloutBps: 400,
          material: { materialId: r.ss, blank: null, partsPerStock: 20 },
          operations: [
            {
              machineId: r.mill,
              label: "OP10 face and profile",
              setupMinutes: 90,
              cycleMinutesPerPart: 6,
            },
          ],
          finishing: [{ opId: r.passivate }],
        },
      },
    ]);
    await win(t, q.id);

    const res = await traveler(t, q.id, "?due=2026-12-18");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("traveler.pdf");
    const pdf = await text(res);
    expect(pdf).toContain("JOB TRAVELER");
    expect(pdf).toContain("BRK-1001 Rev B");
    expect(pdf).toContain("PO: PO-7781");
    expect(pdf).toContain("Due 2026-12-18");
    expect(pdf).toContain("Quantity ordered: 50");
    // 50 good at 4% fallout: 53 started; 20 a bar is 3 bars.
    // PDF strings escape parentheses.
    expect(pdf).toContain("Start 53 \\(4% expected fallout\\)");
    expect(pdf).toContain("pull 3 pieces");
    expect(pdf).toContain("303 Stainless bar");
    expect(pdf).toContain("Haas VF-2");
    expect(pdf).toContain("OP10 face and profile");
    // 6 min x 53 = 318 min run.
    expect(pdf).toContain("5 h 18 min");
    expect(pdf).toContain("Passivate");
    expect(pdf).toContain("Outside service");
    // Never a price on the floor's copy.
    expect(pdf).not.toMatch(/\$\d/);
  });

  it("needs the quantity ordered for a line quoted at several breaks", async () => {
    const t = await setupTenant();
    const r = await seedRateCard(t);
    const q = await quoteWith(t, [
      {
        partNumber: "SPC-220",
        inputs: {
          quantities: [10, 100],
          material: {
            materialId: r.al,
            blank: { shape: "weight", weightLb: 1 },
            partsPerStock: null,
          },
          operations: [
            { machineId: r.mill, label: "OP10", setupMinutes: 30, cycleMinutesPerPart: 2 },
          ],
        },
      },
    ]);
    await win(t, q.id);
    const missing = await traveler(t, q.id);
    expect(missing.status).toBe(400);
    expect(await missing.text()).toContain("SPC-220");

    const lineId = q.lines[0]?.id ?? "";
    const ok = await traveler(t, q.id, `?qty.${lineId}=60`);
    expect(ok.status).toBe(200);
    expect(await text(ok)).toContain("Quantity ordered: 60");

    expect((await traveler(t, q.id, `?qty.${lineId}=0`)).status).toBe(400);
    expect((await traveler(t, q.id, `?qty.${lineId}=60&due=next-week`)).status).toBe(400);
    expect((await traveler(t, q.id, "?qty.not-a-line=5")).status).toBe(400);
  });

  it("takes the quantities the customer accepted online and leaves off what they did not order", async () => {
    const t = await setupTenant();
    const r = await seedRateCard(t);
    const inputs: Partial<CostInputs> = {
      quantities: [10, 100],
      material: { materialId: r.al, blank: { shape: "weight", weightLb: 1 }, partsPerStock: null },
      operations: [{ machineId: r.mill, label: "OP10", setupMinutes: 30, cycleMinutesPerPart: 2 }],
    };
    const q = await quoteWith(t, [
      { partNumber: "BRK-1001", inputs },
      { partNumber: "SPC-220", inputs },
    ]);
    const link = await json<CreatedCustomerLinkDto>(
      api(t.path(`/quotes/${q.id}/customer-links`), { method: "POST", as: t.userId }),
      201,
    );
    const token = decodeURIComponent(link.url.split("/q/")[1] ?? "");
    const first = q.lines[0]?.id ?? "";
    const second = q.lines[1]?.id ?? "";
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

    const res = await traveler(t, q.id);
    expect(res.status).toBe(200);
    const pdf = await text(res);
    expect(pdf).toContain("Quantity ordered: 100");
    expect(pdf).toContain("Part 1 of 1");
    expect(pdf).not.toContain("SPC-220");

    // The shop can still add the part the customer left off, or change a quantity.
    const both = await text(await traveler(t, q.id, `?qty.${second}=25&qty.${first}=90`));
    expect(both).toContain("Quantity ordered: 90");
    expect(both).toContain("Quantity ordered: 25");
    expect(both).toContain("Part 2 of 2");
  });

  it("is refused before the quote is won, readable by a viewer, and never across shops", async () => {
    const t = await setupTenant();
    const r = await seedRateCard(t);
    const q = await quoteWith(t, [
      {
        partNumber: "BRK-1001",
        inputs: {
          quantities: [5],
          material: {
            materialId: r.al,
            blank: { shape: "weight", weightLb: 1 },
            partsPerStock: null,
          },
          operations: [
            { machineId: r.mill, label: "OP10", setupMinutes: 10, cycleMinutesPerPart: 1 },
          ],
        },
      },
    ]);
    expect((await traveler(t, q.id)).status).toBe(409);
    await win(t, q.id);

    const viewer = await addMember(t.orgId, "viewer");
    expect((await traveler(t, q.id, "", viewer)).status).toBe(200);

    const other = await setupTenant();
    // Another shop's member, on their own path and on ours.
    expect((await traveler(other, q.id)).status).toBe(404);
    expect((await traveler(t, q.id, "", other.userId)).status).toBeGreaterThanOrEqual(403);
  });
});
