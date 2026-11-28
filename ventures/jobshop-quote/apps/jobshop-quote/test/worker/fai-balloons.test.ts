// First article balloons (services/rfq/balloons.ts): the drawing PDF with numbered balloons, numbered
// as the Form 3 CSV numbers its rows; refused for a scan and a file with nothing found; invisible
// across shops.

import type { RfqDetailDto } from "@shared/api";
import type { FaiSheetDto } from "@shared/fai-results";
import { describe, expect, it } from "vitest";
import { drawingPdf, scanPdf } from "../fixtures/drawing-pdf";
import { api, json, setupTenant } from "./helpers";

async function rfqWith(
  t: Awaited<ReturnType<typeof setupTenant>>,
  name: string,
  body: BlobPart,
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

// Drawing zones (services/rfq/balloons.ts drawingZones): read from a zoned border's labels, shown on
// the inspection screen as a suggestion and written into the CSV's Reference Location.
describe("drawing zones", () => {
  const ZONED = new Uint8Array(
    drawingPdf({
      titleBlock: ["DWG NO: BRK-1001 REV B", "MATERIAL: 6061-T6 ALUMINUM"],
      notes: ["1. BREAK SHARP EDGES .010 MAX", "2. 3.250 +/-.005 OVERALL"],
      zones: true,
    }),
  );

  it("fills Reference Location from the border, and the inspector's own zone wins", async () => {
    const t = await setupTenant();
    const rfq = await rfqWith(t, "BRK-1001.pdf", ZONED, "application/pdf");
    const f = rfq.files[0];
    const sheetPath = t.path(`/rfqs/${rfq.id}/files/${f?.id}/first-article`);
    const sheet = await json<FaiSheetDto>(api(sheetPath, { as: t.userId }));
    const zoneOf = (start: string) =>
      sheet.zones[sheet.rows.find((r) => r.requirement.includes(start))?.no ?? ""];
    // The notes are top left (row D, column 6); the title block's material is bottom right (A, 2).
    expect(zoneOf("BREAK SHARP")).toBe("D6");
    expect(zoneOf("3.250")).toBe("D6");
    expect(zoneOf("6061-T6")).toBe("A2");

    const csvRows = async () =>
      (
        await (
          await api(t.path(`/rfqs/${rfq.id}/files/${f?.id}/form3.csv`), { as: t.userId })
        ).text()
      )
        .trimEnd()
        .split("\r\n");
    let rows = await csvRows();
    let head = rows.findIndex((r) => r.startsWith("Char. No.,"));
    expect(rows.slice(head + 1).map((r) => r.split(",")[1])).toEqual(
      sheet.rows.map((r) => sheet.zones[r.no]),
    );
    expect(rows.find((r) => r.startsWith("Draft,"))).toContain("zone read from the border");

    // A zone the inspector typed is kept over the border's.
    const first = sheet.rows[0]?.no ?? "";
    await json<FaiSheetDto>(
      api(sheetPath, {
        method: "PUT",
        as: t.userId,
        json: { entries: { [first]: { location: "SECTION A-A" } }, added: [] },
      }),
    );
    rows = await csvRows();
    head = rows.findIndex((r) => r.startsWith("Char. No.,"));
    expect(rows[head + 1]?.split(",")[1]).toBe("SECTION A-A");
    expect(rows[head + 2]?.split(",")[1]).toBe(sheet.zones[sheet.rows[1]?.no ?? ""]);
  });

  it("gives no zones for a drawing without a zoned border", async () => {
    const t = await setupTenant();
    const rfq = await rfqWith(t, "BRK-1001.pdf", DRAWING, "application/pdf");
    const sheet = await json<FaiSheetDto>(
      api(t.path(`/rfqs/${rfq.id}/files/${rfq.files[0]?.id}/first-article`), { as: t.userId }),
    );
    expect(sheet.zones).toEqual({});
  });
});
