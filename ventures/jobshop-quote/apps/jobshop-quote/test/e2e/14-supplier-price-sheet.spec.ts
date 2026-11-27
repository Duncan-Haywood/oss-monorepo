// Material price lists, part 2b: a supplier's price sheet pasted into the Materials import. Before
// saving, the row shows the price move ($4.50/lb to $4.86/lb, up 8.0%) and names the open draft
// priced at the old price; the supplier and the sheet's date land in the price history. 390 px fits.
import { expect, test } from "@playwright/test";
import type { QuoteDetailDto, RateCardDto } from "../../src/shared/api";
import { addBasicRateCard, api, card, field, signUpWithShop } from "./helpers";

test("a supplier's price sheet shows each move and the quotes it touches before saving", async ({
  page,
  baseURL,
}) => {
  const { orgId, orgPath } = await signUpWithShop(page, {
    tag: "supplier-sheet",
    shop: "E2E Supplier Sheet",
  });
  await addBasicRateCard(page);
  const call = <T>(method: string, path: string, data?: unknown) =>
    api<T>(page.request, baseURL ?? "", method, `/api/orgs/${orgId}${path}`, data);
  const rc = await call<RateCardDto>("GET", "/rate-card");
  const q = await call<QuoteDetailDto>("POST", "/quotes", { customerCompany: "Draft Co" });
  await call("POST", `/quotes/${q.id}/lines`, {
    partNumber: "SS-1",
    revision: "A",
    inputs: {
      quantities: [10],
      material: {
        materialId: rc.materials[0]?.id as string,
        blank: { shape: "weight", weightLb: 2 },
        partsPerStock: null,
      },
      operations: [
        {
          machineId: rc.machines[0]?.id as string,
          label: "OP10",
          setupMinutes: 60,
          cycleMinutesPerPart: 12,
        },
      ],
    },
  });

  await page.goto(`${orgPath}/rate-card`);
  const importCard = card(page, "Import from a spreadsheet");
  await importCard.getByRole("button", { name: "Import…" }).click();
  await field(importCard, "What the sheet holds").selectOption("materials");
  await field(importCard, "Supplier (optional, kept in each new price's history)").fill(
    "Acme Metals",
  );
  await field(importCard, "Price list date (optional)").fill("2026-11-20");
  await field(importCard, "…or paste the rows, header included, from Excel or Google Sheets").fill(
    "Material\tPrice per lb\nAluminum 6061-T6 plate\t4.86",
  );
  const row = importCard.locator("table tbody tr").first();
  await expect(row).toContainText("Price: $4.86/lb, up 8.0% from $4.50/lb.");
  await expect(row).toContainText("Open quotes priced at the old price:");
  await expect(row).toContainText("(Draft Co, draft)");
  await expect(importCard.getByTestId("import-price-impact")).toContainText(
    "This import changes 1 material price. 1 open quote was priced at the old prices",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1280, height: 800 });

  await importCard.getByRole("button", { name: "Save 1 row" }).click();
  await expect(importCard.getByText(/Saved: 0 added, 1 updated\. Drafts priced/)).toBeVisible();

  const materials = card(page, "Materials");
  await materials.getByRole("button", { name: "History" }).first().click();
  await expect(
    materials.getByText(/imported by .*, from Acme Metals's price list dated 2026-11-20/),
  ).toBeVisible();
});
