// Material price lists, part 2: a per-foot row's bar setup edited in place. A draft is priced with
// 1018 bar at 0.125 in cut allowance from 144 in bars; the admin opens Bar setup, checks a 2.875 in
// blank (47 parts per bar now, 46 with a 0.1875 in allowance), saves, and the card shows the new
// setup with the price unchanged. The draft's line says it was priced with the old setup until
// Re-price. The form fits a 390 px phone.
import { expect, test } from "@playwright/test";
import type { QuoteDetailDto, RateCardDto } from "../../src/shared/api";
import { addBasicRateCard, api, card, field, signUpWithShop } from "./helpers";

test("a per-foot material's bar setup is edited in place and drafts say so", async ({
  page,
  baseURL,
}) => {
  const { orgId, orgPath } = await signUpWithShop(page, {
    tag: "bar-setup",
    shop: "E2E Bar Setup",
  });
  await addBasicRateCard(page);
  const call = <T>(method: string, path: string, data?: unknown) =>
    api<T>(page.request, baseURL ?? "", method, `/api/orgs/${orgId}${path}`, data);
  const crs = await call<{ id: string }>("POST", "/rate-card/materials", {
    name: "1018 CRS 1 in round",
    pricingBasis: "per_ft",
    pricePerFootCents: 420,
    cutAllowanceIn: 0.125,
    barLengthIn: 144,
    barRemnantIn: 3,
  });
  const rc = await call<RateCardDto>("GET", "/rate-card");
  const q = await call<QuoteDetailDto>("POST", "/quotes", { customerCompany: "Bar Co" });
  await call("POST", `/quotes/${q.id}/lines`, {
    partNumber: "PIN-1",
    revision: "A",
    inputs: {
      quantities: [47],
      material: {
        materialId: crs.id,
        blank: { shape: "round", diameterIn: 1, lengthIn: 2.875 },
        partsPerStock: null,
      },
      operations: [
        {
          machineId: rc.machines[0]?.id as string,
          label: "OP10",
          setupMinutes: 30,
          cycleMinutesPerPart: 2,
        },
      ],
    },
  });

  await page.goto(`${orgPath}/rate-card`);
  const materials = card(page, "Materials");
  const row = materials.getByRole("row", { name: /1018 CRS/ });
  await expect(row).toContainText("0.125 in cut allowance, 144 in bars (3 in remnant)");
  await row.getByRole("button", { name: "Bar setup" }).click();
  await expect(field(materials, "Bar length (in)")).toHaveValue("144");
  await field(materials, "Cut allowance (in)").fill("0.1875");
  await field(materials, "Check a blank (in)").fill("2.875");
  await expect(
    materials.getByText(
      "A 2.875 in blank: 3 in per part, 47 parts per bar now; 3.0625 in per part, 46 parts per bar with these settings.",
    ),
  ).toBeVisible();

  // Fits a phone while open.
  await page.setViewportSize({ width: 390, height: 844 });
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1280, height: 800 });

  await materials.getByRole("button", { name: "Save bar setup" }).click();
  await expect(row).toContainText("$4.20/ft");
  await expect(row).toContainText("0.1875 in cut allowance, 144 in bars (3 in remnant)");
  await expect(materials.getByRole("button", { name: "Save bar setup" })).toHaveCount(0);

  await page.goto(`${orgPath}/quotes/${q.id}`);
  await expect(
    page.getByText(
      /priced with 1018 CRS 1 in round at 0\.125 in cut allowance, 144 in bars \(3 in remnant\); the rate card now has 0\.1875 in cut allowance/,
    ),
  ).toBeVisible();
});
