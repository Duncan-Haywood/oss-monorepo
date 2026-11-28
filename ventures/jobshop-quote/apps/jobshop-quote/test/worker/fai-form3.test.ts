// First article list (services/rfq characteristicsCsv): a draft AS9102 Form 3 characteristic list
// from a drawing's text, as CSV; refused for a file with no text, and invisible across shops.

import type { RfqDetailDto } from "@shared/api";
import { describe, expect, it } from "vitest";
import { api, json, setupTenant } from "./helpers";

const DRAWING = `DWG NO: BRK-1001 REV B
MATERIAL: 6061-T6 ALUMINUM
UNLESS OTHERWISE SPECIFIED: .XXX ±.005
NOTES:
1. BREAK SHARP EDGES .010 MAX
3.250 ±.005
4X Ø.201 +.003/-.000 THRU
POSITION ⌀.010 A B C`;

async function rfqWith(
  t: Awaited<ReturnType<typeof setupTenant>>,
  name: string,
  body: string,
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

describe("first article list", () => {
  it("lists the drawing's characteristics, numbered, as CSV", async () => {
    const t = await setupTenant();
    const rfq = await rfqWith(t, "BRK-1001.pdf", DRAWING, "application/pdf");
    const f = rfq.files[0];
    expect(f?.hasText).toBe(true);
    const res = await api(t.path(`/rfqs/${rfq.id}/files/${f?.id}/form3.csv`), { as: t.userId });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("BRK-1001-form3-draft.csv");
    const csv = (await res.text()).replace(/^﻿/, "");
    const rows = csv.trimEnd().split("\r\n");
    expect(rows).toContain("General tolerance,UNLESS OTHERWISE SPECIFIED: .XXX ±.005");
    const head = rows.findIndex((r) => r.startsWith("Char. No.,"));
    expect(rows.slice(head + 1).map((r) => r.split(",")[0])).toEqual([
      "1",
      "2",
      "3",
      "4.1",
      "4.2",
      "4.3",
      "4.4",
      "5",
    ]);
    expect(rows[head + 3]).toBe("3,,,3.250 ±.005,,,,Dimension,3.245,3.255,in,value,6");
  });

  it("refuses a file with no text, and another shop's file", async () => {
    const t = await setupTenant();
    const step = await rfqWith(t, "BRK-1001.step", "ISO-10303-21;", "application/octet-stream");
    const none = await api(t.path(`/rfqs/${step.id}/files/${step.files[0]?.id}/form3.csv`), {
      as: t.userId,
    });
    expect(none.status).toBe(400);

    const rfq = await rfqWith(t, "BRK-1001.pdf", DRAWING, "application/pdf");
    const other = await setupTenant();
    const cross = await api(other.path(`/rfqs/${rfq.id}/files/${rfq.files[0]?.id}/form3.csv`), {
      as: other.userId,
    });
    expect(cross.status).toBe(404);
  });
});
