// First article balloons (services/rfq/balloons.ts): the drawing PDF with numbered balloons, numbered
// as the Form 3 CSV numbers its rows; refused for a scan and a file with nothing found; invisible
// across shops.

import type { RfqDetailDto } from "@shared/api";
import { describe, expect, it } from "vitest";
import { drawingPdf, scanPdf } from "../fixtures/drawing-pdf";
import { api, json, setupTenant } from "./helpers";

async function rfqWith(
  t: Awaited<ReturnType<typeof setupTenant>>,
  name: string,
  body: Uint8Array | string,
  type: string,
) {
  const form = new FormData();
  form.set("subject", "RFQ - bracket");
  form.set("bodyText", "Please quote BRK-1001, qty 10.");
  form.append("files", new File([body], name, { type }));
  return json<RfqDetailDto>(
    api(t.path("/rfqs"), { method: "POST", as: t.userId, body: form }),
    201,
  );
}

const DRAWING = new Uint8Array(
  drawingPdf({
    titleBlock: ["DWG NO: BRK-1001 REV B", "MATERIAL: 6061-T6 ALUMINUM"],
    notes: ["1. BREAK SHARP EDGES .010 MAX", "2. 3.250 +/-.005 OVERALL"],
  }),
);

describe("ballooned drawing", () => {
  it("returns the PDF with the original bytes first and one balloon per listed characteristic", async () => {
    const t = await setupTenant();
    const rfq = await rfqWith(t, "BRK-1001.pdf", DRAWING, "application/pdf");
    const f = rfq.files[0];
    expect(f?.hasText).toBe(true);
    const res = await api(t.path(`/rfqs/${rfq.id}/files/${f?.id}/ballooned.pdf`), {
      as: t.userId,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("BRK-1001-ballooned.pdf");
    const out = new Uint8Array(await res.arrayBuffer());
    expect(out.length).toBeGreaterThan(DRAWING.length);
    expect(Buffer.from(out.subarray(0, DRAWING.length)).equals(Buffer.from(DRAWING))).toBe(true);
    // The CSV lists notes 1 and 2 and the material: three rows, three balloons, none missed.
    const csv = await (
      await api(t.path(`/rfqs/${rfq.id}/files/${f?.id}/form3.csv`), { as: t.userId })
    ).text();
    const rows = csv.trimEnd().split("\r\n");
    const head = rows.findIndex((r) => r.startsWith("Char. No.,"));
    expect(rows.length - head - 1).toBe(Number(res.headers.get("x-balloons-placed")));
    expect(res.headers.get("x-balloons-unplaced")).toBe("");
  });

  it("refuses a scan, and another shop's file", async () => {
    const t = await setupTenant();
    const scan = await rfqWith(t, "scan.pdf", new Uint8Array(scanPdf()), "application/pdf");
    const none = await api(t.path(`/rfqs/${scan.id}/files/${scan.files[0]?.id}/ballooned.pdf`), {
      as: t.userId,
    });
    expect(none.status).toBe(400);

    const rfq = await rfqWith(t, "BRK-1001.pdf", DRAWING, "application/pdf");
    const other = await setupTenant();
    const cross = await api(other.path(`/rfqs/${rfq.id}/files/${rfq.files[0]?.id}/ballooned.pdf`), {
      as: other.userId,
    });
    expect(cross.status).toBe(404);
  });
});
