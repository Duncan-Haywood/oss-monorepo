// CAD files that do not state their units (every STL, some DXFs): measured in assumed millimetres with
// low confidence, so nothing is suggested from them, until an estimator says which units the file was
// drawn in; the file is then measured again in that unit and its blank reaches the next quote.

import type { QuoteDetailDto, RfqDetailDto } from "@shared/api";
import type { GeometryFeatures } from "@shared/geometry";
import { testFakes } from "@worker/context";
import { CadFeaturesGeometry } from "@worker/ports/geometry";
import { describe, expect, it } from "vitest";
import { binaryStl, boxMesh } from "../../../../packages/cad-features/test/helpers/stl-writer";
import { RFQ_EMAIL } from "../fixtures/rfq";
import { addMember, api, json, seedRateCard, setupTenant } from "./helpers";

const ASSUMED: GeometryFeatures = {
  format: "stl",
  volumeIn3: 0.0001,
  boundingBoxIn: { xIn: 0.1535, yIn: 0.0394, zIn: 0.0197 },
  surfaceAreaIn2: 0.02,
  holes: [],
  flat: null,
  units: { read: "mm", setBy: "assumed" },
  confidence: { boundingBox: "low", volume: "low", holes: "low", bends: "low" },
  flags: [{ code: "units-unknown", message: "An STL file has no units; read as mm." }],
  source: "fake",
};
const INCHES: GeometryFeatures = {
  ...ASSUMED,
  volumeIn3: 1.95,
  boundingBoxIn: { xIn: 3.9, yIn: 1, zIn: 0.5 },
  units: { read: "in", setBy: "estimator" },
  confidence: { boundingBox: "medium", volume: "medium", holes: "low", bends: "low" },
  flags: [],
};

async function upload(t: Awaited<ReturnType<typeof setupTenant>>, name: string) {
  const form = new FormData();
  form.set("bodyText", RFQ_EMAIL);
  form.append("files", new File(["solid x"], name));
  return json<RfqDetailDto>(
    api(t.path("/rfqs"), { method: "POST", as: t.userId, body: form }),
    201,
  );
}

describe("choosing the units of a CAD file that states none", () => {
  it("measures a real binary STL inside workerd", async () => {
    const b = binaryStl(boxMesh(0, 0, 0, 2, 1, 0.5));
    const g = await new CadFeaturesGeometry().extract({
      name: "block.stl",
      bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
      units: "in",
    });
    expect(g?.boundingBoxIn).toEqual({ xIn: 2, yIn: 1, zIn: 0.5 });
    expect(g?.volumeIn3).toBeCloseTo(1, 4);
  });

  it("suggests no blank while the units are assumed, and one once the estimator says inches", async () => {
    const t = await setupTenant();
    const rates = await seedRateCard(t);
    testFakes.geometry.set("BRK-1001.stl", ASSUMED);
    testFakes.geometry.set("BRK-1001.stl@in", INCHES);
    const rfq = await upload(t, "BRK-1001.stl");
    const file = rfq.files[0];
    expect(file?.geometry?.units).toEqual({ read: "mm", setBy: "assumed" });

    const ex = await json<RfqDetailDto>(
      api(t.path(`/rfqs/${rfq.id}/extract`), { method: "POST", as: t.userId }),
    );
    const brk = ex.parts.find((p) => p.partNumber === "BRK-1001");
    expect(brk?.geometryFileId).toBe(file?.id);
    await json(
      api(t.path(`/rfqs/${rfq.id}/parts/${brk?.id}`), {
        method: "PATCH",
        as: t.userId,
        json: { confirmed: true },
      }),
    );
    const before = await json<QuoteDetailDto>(
      api(t.path("/quotes"), { method: "POST", as: t.userId, json: { rfqId: rfq.id } }),
      201,
    );
    expect(before.lines[0]?.inputs.material?.materialId).toBe(rates.al);
    expect(before.lines[0]?.inputs.material?.blank ?? null).toBeNull();

    const set = await json<RfqDetailDto>(
      api(t.path(`/rfqs/${rfq.id}/files/${file?.id}/units`), {
        method: "POST",
        as: t.userId,
        json: { units: "in" },
      }),
    );
    expect(set.files[0]?.geometry?.units).toEqual({ read: "in", setBy: "estimator" });
    expect(set.files[0]?.geometry?.boundingBoxIn).toEqual(INCHES.boundingBoxIn);

    const after = await json<QuoteDetailDto>(
      api(t.path("/quotes"), { method: "POST", as: t.userId, json: { rfqId: rfq.id } }),
      201,
    );
    expect(after.lines[0]?.inputs.material?.blank).not.toBeNull();
  });

  it("refuses a file that states its own units, and a unit it does not know", async () => {
    const t = await setupTenant();
    testFakes.geometry.set("PLATE-9.step", { ...INCHES, format: "step", units: undefined });
    const rfq = await upload(t, "PLATE-9.step");
    const path = t.path(`/rfqs/${rfq.id}/files/${rfq.files[0]?.id}/units`);
    expect((await api(path, { method: "POST", as: t.userId, json: { units: "in" } })).status).toBe(
      409,
    );
    expect((await api(path, { method: "POST", as: t.userId, json: { units: "ft" } })).status).toBe(
      400,
    );
  });

  it("is for estimators of the same shop only", async () => {
    const t = await setupTenant();
    testFakes.geometry.set("BRK-2.stl", ASSUMED);
    testFakes.geometry.set("BRK-2.stl@in", INCHES);
    const rfq = await upload(t, "BRK-2.stl");
    const rest = `/rfqs/${rfq.id}/files/${rfq.files[0]?.id}/units`;
    const viewer = await addMember(t.orgId, "viewer");
    expect(
      (await api(t.path(rest), { method: "POST", as: viewer, json: { units: "in" } })).status,
    ).toBe(403);
    const other = await setupTenant();
    expect(
      (await api(other.path(rest), { method: "POST", as: other.userId, json: { units: "in" } }))
        .status,
    ).toBe(404);
    const still = await json<RfqDetailDto>(api(t.path(`/rfqs/${rfq.id}`), { as: t.userId }));
    expect(still.files[0]?.geometry?.units?.setBy).toBe("assumed");
  });
});
