// First article, part 2b (services/rfq/fai-forms.ts): AS9102 Forms 1 and 2 drafted for a drawing,
// from the RFQ's part, the won quote's PO number and the drawing's text; as JSON for the screen and
// as CSV. Refused for a file with no text, and invisible across shops.

import type { RfqDetailDto } from "@shared/api";
import type { FormsDraft } from "@shared/fai-forms";
import { quotes } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { describe, expect, it } from "vitest";
import { api, json, setupTenant, testDb } from "./helpers";

const DRAWING = `DWG NO: BRK-1001 REV B
MATERIAL: 6061-T6 ALUMINUM PER AMS 4027
FINISH: ANODIZE PER MIL-A-8625 TYPE II CLASS 2
NOTES:
1. BREAK SHARP EDGES .010 MAX
2. PENETRANT INSPECT PER ASTM E1417
3.250 ±.005`;

async function rfqWith(t: Awaited<ReturnType<typeof setupTenant>>, name: string, body: string) {
  const form = new FormData();
  form.set("subject", "RFQ - bracket");
  form.set("bodyText", "Please quote BRK-1001, qty 10.");
  form.append("files", new File([body], name, { type: "application/pdf" }));
  return json<RfqDetailDto>(
    api(t.path("/rfqs"), { method: "POST", as: t.userId, body: form }),
    201,
  );
}

describe("first article Forms 1 and 2", () => {
  it("lists the drawing's material and processes, and the won quote's PO", async () => {
    const t = await setupTenant();
    const rfq = await rfqWith(t, "BRK-1001.pdf", DRAWING);
    const f = rfq.files[0];
    const path = t.path(`/rfqs/${rfq.id}/files/${f?.id}/first-article/forms`);

    const before = await json<FormsDraft>(api(path, { as: t.userId }));
    const po = before.form1.find((x) => x.label === "PO Number");
    expect(po?.value).toBe("");
    expect(before.form1.find((x) => x.label === "Drawing Number")?.value).toBe("BRK-1001");
    expect(before.form2.map((r) => [r.kind, r.name, r.spec])).toEqual([
      ["material", "6061-T6 Aluminum", "AMS 4027"],
      ["special process", "Anodize", "MIL-A-8625"],
      ["special process", "Penetrant inspection", "ASTM E1417"],
    ]);

    await testDb()
      .insert(quotes)
      .values({
        id: newId("quo"),
        orgId: t.orgId,
        rfqId: rfq.id,
        quoteNumber: 1042,
        status: "won",
        customerCompany: "Customer",
        poNumber: "PO-5521",
      });
    const after = await json<FormsDraft>(api(path, { as: t.userId }));
    expect(after.form1.find((x) => x.label === "PO Number")).toMatchObject({
      value: "PO-5521",
      from: "won quote Q-1042",
    });

    const res = await api(t.path(`/rfqs/${rfq.id}/files/${f?.id}/forms-1-2.csv`), {
      as: t.userId,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("BRK-1001-forms-1-2-draft.csv");
    const csv = await res.text();
    expect(csv).toContain("PO Number,PO-5521,won quote Q-1042");
    expect(csv).toContain('Anodize,MIL-A-8625,"Type II, Class 2"');
  });

  it("refuses a file with no text, and another shop's file", async () => {
    const t = await setupTenant();
    const form = new FormData();
    form.set("subject", "RFQ");
    form.set("bodyText", "Please quote.");
    form.append(
      "files",
      new File(["ISO-10303-21;"], "BRK-1001.step", { type: "application/octet-stream" }),
    );
    const step = await json<RfqDetailDto>(
      api(t.path("/rfqs"), { method: "POST", as: t.userId, body: form }),
      201,
    );
    const none = await api(
      t.path(`/rfqs/${step.id}/files/${step.files[0]?.id}/first-article/forms`),
      { as: t.userId },
    );
    expect(none.status).toBe(400);

    const rfq = await rfqWith(t, "BRK-1001.pdf", DRAWING);
    const other = await setupTenant();
    for (const p of ["first-article/forms", "forms-1-2.csv"]) {
      const cross = await api(other.path(`/rfqs/${rfq.id}/files/${rfq.files[0]?.id}/${p}`), {
        as: other.userId,
      });
      expect(cross.status).toBe(404);
    }
  });
});
