// CAD files over 1 MB: stored at upload without measuring (a slow STEP must not fail the upload),
// then measured in a request of their own ("Measure"), which links the RFQ's parts to the file.

import type { QuoteDetailDto, RfqDetailDto } from "@shared/api";
import type { GeometryFeatures } from "@shared/geometry";
import { testFakes } from "@worker/context";
import {
  INLINE_GEOMETRY_MAX_BYTES,
  MAX_MEASURE_BYTES,
  MEASURE_FAILED,
  TOO_LARGE_TO_MEASURE,
} from "@worker/services/rfq";
import { describe, expect, it } from "vitest";
import { RFQ_EMAIL } from "../fixtures/rfq";
import { addMember, api, json, seedRateCard, setupTenant } from "./helpers";

const SOLID: GeometryFeatures = {
  format: "step",
  volumeIn3: 1.5,
  boundingBoxIn: { xIn: 3.9, yIn: 1, zIn: 0.5 },
  surfaceAreaIn2: null,
  holes: [],
  flat: null,
  confidence: { boundingBox: "high", volume: "high", holes: "high" },
  flags: [],
  source: "fake",
};

/** A file just over the inline limit (contents do not matter to the fake extractor). */
const big = (name: string) => new File([new Uint8Array(INLINE_GEOMETRY_MAX_BYTES + 1)], name);

async function upload(t: Awaited<ReturnType<typeof setupTenant>>, file: File) {
  const form = new FormData();
  form.set("bodyText", RFQ_EMAIL);
  form.append("files", file);
  return json<RfqDetailDto>(
    api(t.path("/rfqs"), { method: "POST", as: t.userId, body: form }),
    201,
  );
}

describe("measuring large CAD files on request", () => {
  it("skips a large STEP at upload, measures it on request and links the part", async () => {
    const t = await setupTenant();
    const rates = await seedRateCard(t);
    testFakes.geometry.set("BRK-1001-large.step", SOLID);
    const rfq = await upload(t, big("BRK-1001-large.step"));
    const file = rfq.files[0];
    expect(file?.geometry).toBeNull();
    expect(file?.geometryPending).toBe(true);

    // Extraction before measuring: the part has no geometry file yet.
    const ex = await json<RfqDetailDto>(
      api(t.path(`/rfqs/${rfq.id}/extract`), { method: "POST", as: t.userId }),
    );
    const brk = ex.parts.find((p) => p.partNumber === "BRK-1001");
    expect(brk?.geometryFileId).toBeNull();

    const measured = await json<RfqDetailDto>(
      api(t.path(`/rfqs/${rfq.id}/files/${file?.id}/measure`), { method: "POST", as: t.userId }),
    );
    expect(measured.files[0]?.geometry?.boundingBoxIn).toEqual(SOLID.boundingBoxIn);
    expect(measured.files[0]?.geometryPending).toBe(false);
    expect(measured.parts.find((p) => p.id === brk?.id)?.geometryFileId).toBe(file?.id);
    // The other part (SPC-220) does not match the file name and is left alone.
    expect(measured.parts.find((p) => p.partNumber === "SPC-220")?.geometryFileId).toBeNull();

    // A second Measure is refused: nothing is pending.
    const again = await api(t.path(`/rfqs/${rfq.id}/files/${file?.id}/measure`), {
      method: "POST",
      as: t.userId,
    });
    expect(again.status).toBe(409);

    // The quote made afterwards gets the CAD blank, like a file measured at upload.
    await json(
      api(t.path(`/rfqs/${rfq.id}/parts/${brk?.id}`), {
        method: "PATCH",
        as: t.userId,
        json: { confirmed: true },
      }),
    );
    const q = await json<QuoteDetailDto>(
      api(t.path("/quotes"), { method: "POST", as: t.userId, json: { rfqId: rfq.id } }),
      201,
    );
    expect(q.lines[0]?.inputs.material?.materialId).toBe(rates.al);
    expect(q.lines[0]?.inputs.material?.blank).not.toBeNull();
  });

  it("still measures a small STEP at upload", async () => {
    const t = await setupTenant();
    testFakes.geometry.set("BRK-1001-small.step", SOLID);
    const rfq = await upload(t, new File(["ISO-10303-21;"], "BRK-1001-small.step"));
    expect(rfq.files[0]?.geometry?.volumeIn3).toBe(1.5);
    expect(rfq.files[0]?.geometryPending).toBe(false);
  });

  it("records a failed measure once, and never offers it for other CAD types", async () => {
    const t = await setupTenant();
    // No fixture registered: the extractor finds nothing.
    const rfq = await upload(t, big("UNREADABLE-1.step"));
    const after = await json<RfqDetailDto>(
      api(t.path(`/rfqs/${rfq.id}/files/${rfq.files[0]?.id}/measure`), {
        method: "POST",
        as: t.userId,
      }),
    );
    expect(after.files[0]?.conversionError).toBe(MEASURE_FAILED);
    expect(after.files[0]?.geometryPending).toBe(false);

    // A native SolidWorks part is stored but not measured by packages/cad-features, so it is never pending.
    const native = await upload(t, big("PLATE-1.sldprt"));
    expect(native.files[0]?.geometryPending).toBe(false);
    // IGES is measured now: a large one waits for "Measure" like STEP.
    const iges = await upload(t, big("PLATE-2.igs"));
    expect(iges.files[0]?.geometryPending).toBe(true);
  });

  it("stores a CAD file over the measure limit with the reason, and never offers Measure", async () => {
    const t = await setupTenant();
    // Registered, so only the size keeps it from being measured.
    testFakes.geometry.set("ASSY-1.step", SOLID);
    const rfq = await upload(t, new File([new Uint8Array(MAX_MEASURE_BYTES + 1)], "ASSY-1.step"));
    const file = rfq.files[0];
    expect(file?.geometry).toBeNull();
    expect(file?.geometryPending).toBe(false);
    expect(file?.conversionError).toBe(TOO_LARGE_TO_MEASURE);
    const res = await api(t.path(`/rfqs/${rfq.id}/files/${file?.id}/measure`), {
      method: "POST",
      as: t.userId,
    });
    expect(res.status).toBe(409);
    // Exactly at the limit still waits for Measure.
    testFakes.geometry.set("ASSY-2.step", SOLID);
    const edge = await upload(t, new File([new Uint8Array(MAX_MEASURE_BYTES)], "ASSY-2.step"));
    expect(edge.files[0]?.geometryPending).toBe(true);
    expect(edge.files[0]?.conversionError).toBeNull();
    // A large non-CAD-measured file (native SolidWorks) gets no such note.
    const native = await upload(
      t,
      new File([new Uint8Array(MAX_MEASURE_BYTES + 1)], "ASSY-3.sldprt"),
    );
    expect(native.files[0]?.conversionError).toBeNull();
  });

  it("is for estimators of the same shop only", async () => {
    const t = await setupTenant();
    testFakes.geometry.set("BRK-1001-role.step", SOLID);
    const rfq = await upload(t, big("BRK-1001-role.step"));
    const path = t.path(`/rfqs/${rfq.id}/files/${rfq.files[0]?.id}/measure`);
    const viewer = await addMember(t.orgId, "viewer");
    expect((await api(path, { method: "POST", as: viewer })).status).toBe(403);
    const other = await setupTenant();
    const cross = await api(other.path(`/rfqs/${rfq.id}/files/${rfq.files[0]?.id}/measure`), {
      method: "POST",
      as: other.userId,
    });
    expect(cross.status).toBe(404);
    // Still pending for the owning shop.
    const still = await json<RfqDetailDto>(api(t.path(`/rfqs/${rfq.id}`), { as: t.userId }));
    expect(still.files[0]?.geometryPending).toBe(true);
  });
});
