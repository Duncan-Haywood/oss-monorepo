// Packing slip and certificate of conformance for a won quote (services/quotes/shipment.ts): what
// ships per part, the revision, material, outside processing and heat/lot typed, never a price;
// quantities from the saved job or a typed partial; refused before the win, for a multi-break line
// with no quantity, for bad query values, and across shops.
import type { QuoteDetailDto } from "@shared/api";
import type { CostInputs } from "@shared/costing";
import { describe, expect, it } from "vitest";
import { addMember, api, json, seedRateCard, setupTenant } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;

async function quoteWith(
  t: Tenant,
  lines: { partNumber: string; revision?: string | null; inputs: Partial<CostInputs> }[],
) {
  const q = await json<QuoteDetailDto>(
    api(t.path("/quotes"), {
      method: "POST",
      as: t.userId,
      json: { customerCompany: "Example Robotics LLC" },
    }),
    201,
  );
  await json(
    api(t.path(`/quotes/${q.id}`), {
      method: "PATCH",
      as: t.userId,
      json: { customerContact: "Sam Buyer" },
    }),
  );
  for (const l of lines) {
    await json(
      api(t.path(`/quotes/${q.id}/lines`), {
        method: "POST",
        as: t.userId,
        json: {
          partNumber: l.partNumber,
          revision: l.revision === undefined ? "B" : l.revision,
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

const shipment = (t: Tenant, id: string, query = "", as = t.userId) =>
  api(t.path(`/quotes/${id}/shipment.pdf${query}`), { as });

const text = async (res: Response) => new TextDecoder("latin1").decode(await res.arrayBuffer());

describe("packing slip and certificate of conformance", () => {
  it("prints what ships, the revision, material, outside processing and lot, and no prices", async () => {
    const t = await setupTenant();
    const r = await seedRateCard(t);
    const q = await quoteWith(t, [
      {
        partNumber: "BRK-1001",
        inputs: {
          quantities: [50],
          material: { materialId: r.ss, blank: null, partsPerStock: 20 },
          operations: [
            { machineId: r.mill, label: "OP10", setupMinutes: 90, cycleMinutesPerPart: 6 },
          ],
          finishing: [{ opId: r.passivate }],
        },
      },
      {
        partNumber: "SPC-220",
        revision: null,
        inputs: {
          quantities: [10],
          customerSuppliedMaterial: true,
          material: null,
          operations: [
            { machineId: r.mill, label: "OP10", setupMinutes: 30, cycleMinutesPerPart: 2 },
          ],
        },
      },
    ]);
    await win(t, q.id);
    const first = q.lines[0]?.id ?? "";

    const query = new URLSearchParams({
      ship: "2026-12-10",
      [`lot.${first}`]: "H-88213",
      signer: "Pat Lee, Quality Manager",
      to: "Example Robotics LLC\nReceiving dock 3\n12 Main St",
    });
    const res = await shipment(t, q.id, `?${query}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("packing slip.pdf");
    const pdf = await text(res);
    expect(pdf).toContain("PACKING SLIP");
    expect(pdf).toContain("CERTIFICATE OF CONFORMANCE");
    expect(pdf).toContain("PO: PO-7781");
    expect(pdf).toContain("Ship date: 2026-12-10");
    expect(pdf).toContain("Receiving dock 3");
    expect(pdf).toContain("BRK-1001");
    expect(pdf).toContain("303 Stainless bar");
    expect(pdf).toContain("H-88213");
    expect(pdf).toContain("Outside processing: Passivate");
    expect(pdf).toContain("Customer-supplied");
    // A part with no revision says so on the certificate rather than leaving it out.
    expect(pdf).toContain("not given");
    expect(pdf).toContain("Name and title: Pat Lee, Quality Manager");
    expect(pdf).toContain("2 part numbers, 60 pieces shipped");
    expect(pdf).toContain("We certify that the parts listed above");
    expect(pdf).not.toMatch(/\$\d/);

    // The packing slip alone.
    const slip = await text(await shipment(t, q.id, "?coc=0"));
    expect(slip).toContain("PACKING SLIP");
    expect(slip).not.toContain("CERTIFICATE OF CONFORMANCE");
    // Ship-to defaults to the customer and contact.
    expect(slip).toContain("Attn: Sam Buyer");
  });

  it("takes the saved job's quantities and ship day, and prints a typed partial shipment", async () => {
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
    const lineId = q.lines[0]?.id ?? "";

    const missing = await shipment(t, q.id);
    expect(missing.status).toBe(400);
    expect(await missing.text()).toContain("SPC-220");

    await json(
      api(t.path(`/quotes/${q.id}/job`), {
        method: "PUT",
        as: t.userId,
        json: { quantities: { [lineId]: 100 }, shippedOn: "2026-12-12" },
      }),
    );
    const full = await text(await shipment(t, q.id));
    expect(full).toContain("Ship date: 2026-12-12");
    expect(full).toContain("1 part number, 100 pieces shipped");
    expect(full).not.toContain("Partial shipment");

    const partial = await text(await shipment(t, q.id, `?qty.${lineId}=40`));
    expect(partial).toContain("40 pieces shipped");
    expect(partial).toContain("Partial shipment");
  });

  it("refuses bad values, a quote not won, and other shops; a viewer may print", async () => {
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
    expect((await shipment(t, q.id)).status).toBe(409);
    await win(t, q.id);
    const lineId = q.lines[0]?.id ?? "";

    expect((await shipment(t, q.id, "?ship=2026-02-30")).status).toBe(400);
    expect((await shipment(t, q.id, `?qty.${lineId}=0`)).status).toBe(400);
    expect((await shipment(t, q.id, `?lot.${lineId}=${"x".repeat(61)}`)).status).toBe(400);
    expect((await shipment(t, q.id, "?lot.not-a-line=H1")).status).toBe(400);
    expect((await shipment(t, q.id, "?coc=yes")).status).toBe(400);
    expect((await shipment(t, q.id, `?signer=${"y".repeat(81)}`)).status).toBe(400);

    const viewer = await addMember(t.orgId, "viewer");
    expect((await shipment(t, q.id, "", viewer)).status).toBe(200);

    const other = await setupTenant();
    expect((await shipment(other, q.id)).status).toBe(404);
    expect((await shipment(t, q.id, "", other.userId)).status).toBeGreaterThanOrEqual(403);
  });
});
