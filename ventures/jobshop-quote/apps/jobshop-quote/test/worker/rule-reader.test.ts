// "Extract" on a deployment with no AI key: the rule reader reads the RFQ, the same verification
// runs, the read is labelled, and it uses none of the plan's RFQ allowance (no model, no cost).
import type { RfqDetailDto } from "@shared/api";
import { testFakes } from "@worker/context";
import { RULES_NOTE } from "@worker/services/rfq";
import { afterEach, describe, expect, it } from "vitest";
import { DRAWING_TEXT, RFQ_EMAIL } from "../fixtures/rfq";
import { api, json, seedRateCard, setupTenant } from "./helpers";

afterEach(() => {
  testFakes.rfqReader = null;
  testFakes.llmHandlers.clear();
});

describe("RFQ extraction by rules", () => {
  it("reads the email and drawing without the model and counts no allowance", async () => {
    testFakes.rfqReader = "rules";
    // The model must not be called on this path.
    testFakes.llmHandlers.set("rfq.extract", () => {
      throw new Error("the model was called");
    });
    const t = await setupTenant();
    const rates = await seedRateCard(t);
    const form = new FormData();
    form.set("subject", "RFQ - brackets and spacers");
    form.set("bodyText", RFQ_EMAIL);
    form.append("files", new File([DRAWING_TEXT], "BRK-1001.pdf", { type: "application/pdf" }));
    const rfq = await json<RfqDetailDto>(
      api(t.path("/rfqs"), { method: "POST", as: t.userId, body: form }),
      201,
    );
    expect(rfq.reader).toBe("rules");

    const ex = await json<RfqDetailDto>(
      api(t.path(`/rfqs/${rfq.id}/extract`), { method: "POST", as: t.userId }),
    );
    expect(ex.status).toBe("extracted");
    expect(ex.extractionWarnings).toEqual([RULES_NOTE]);
    expect(ex.customerCompany).toBe("Example Robotics LLC");
    expect(ex.allowance.counted).toBe(0);
    const [brk, spc] = ex.parts;
    expect(brk).toMatchObject({
      partNumber: "BRK-1001",
      revision: "B",
      quantities: [10, 50, 100],
      materialId: rates.al,
      finishingOpIds: [rates.anodize],
      dueDate: "2026-12-18",
      confirmed: false,
    });
    expect(brk?.sources.quantities?.quote).toBe("Qty: 10, 50, 100");
    expect(spc).toMatchObject({ partNumber: "SPC-220", materialId: rates.ss, quantities: [250] });
  });
});
