// Shop settings from a spreadsheet (src/shared/settings-import.ts): the browser reads label/value rows
// and sends only the settings that change through the settings editor's own PATCH, so the Worker
// check is the same schema and admin role. This pins that the import's body is accepted as built,
// saved for this shop only, and refused for an estimator.
import type { RateCardDto } from "@shared/api";
import { planSettingsImport, readSettingsSheet } from "@shared/settings-import";
import { parseCsv } from "@shared/sheet";
import { describe, expect, it } from "vitest";
import { addMember, api, json, setupTenant } from "./helpers";

const SHEET = [
  "Acme price list,,",
  "Labor markup,22%,",
  "Outside service markup,12.5%,",
  "Minimum line charge,$185.00,",
  "Quote valid (weeks),6,",
  "Default quantities,1; 10; 50,",
  ",,",
  "Machine,Kind,Hourly rate",
  "Haas VF-2,3-axis mill,$95",
].join("\n");

describe("shop settings import", () => {
  it("saves the planned patch for this shop only, and only for an admin", async () => {
    const t = await setupTenant();
    const other = await setupTenant();
    const card = (tn = t) => json<RateCardDto>(api(tn.path("/rate-card"), { as: tn.userId }));
    const before = (await card()).settings;
    const otherBefore = (await card(other)).settings;

    const sheet = readSettingsSheet(parseCsv(SHEET));
    expect(sheet.errors).toEqual([]);
    const plan = planSettingsImport(sheet.rows, before);
    expect(plan.errors).toEqual([]);

    const estimator = await addMember(t.orgId, "estimator");
    const denied = await api(t.path("/settings"), {
      method: "PATCH",
      as: estimator,
      json: plan.patch,
    });
    expect(denied.status).toBe(403);

    await json(api(t.path("/settings"), { method: "PATCH", as: t.userId, json: plan.patch }));
    const after = (await card()).settings;
    expect(after).toMatchObject({
      laborMarkupBps: 2200,
      outsideServiceMarkupBps: 1250,
      minimumLineCents: 18500,
      quoteValidDays: 42,
      defaultQuantities: [1, 10, 50],
      materialMarkupBps: before.materialMarkupBps,
      displayName: before.displayName,
    });
    expect((await card(other)).settings).toEqual(otherBefore);

    // Imported again, the same sheet changes nothing.
    expect(planSettingsImport(sheet.rows, after).patch).toEqual({});
  });
});
