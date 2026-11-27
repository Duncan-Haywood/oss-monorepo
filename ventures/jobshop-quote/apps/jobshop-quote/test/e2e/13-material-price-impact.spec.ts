// Material price lists, part 2: "quotes this changes". A draft and a sent quote are priced with
// aluminum at $4.50/lb; the admin types the supplier's new $4.86/lb on the rate card, and the
// Materials card lists both quotes with the move (up 8.0%), linked to each quote. A 10% threshold
// hides them; Re-price on the draft takes it off the list. The panel fits a 390 px phone.
import { expect, test } from "@playwright/test";
import type { QuoteDetailDto, RateCardDto } from "../../src/shared/api";
import { addBasicRateCard, api, card, field, signUpWithShop } from "./helpers";

test("a new material price lists the open quotes priced at the old one", async ({
  page,
  baseURL,
}) => {
  const { orgId, orgPath } = await signUpWithShop(page, {
    tag: "price-impact",
    shop: "E2E Price Impact",
  });
  await addBasicRateCard(page);
  const base = baseURL ?? "";
  const call = <T>(method: string, path: string, data?: unknown) =>
    api<T>(page.request, base, method, `/api/orgs/${orgId}${path}`, data);

  const rc = await call<RateCardDto>("GET", "/rate-card");
  const newQuote = async (customerCompany: string) => {
    const q = await call<QuoteDetailDto>("POST", "/quotes", { customerCompany });
    await call("POST", `/quotes/${q.id}/lines`, {
      partNumber: "PI-1",
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
    return q;
  };
  const draft = await newQuote("Draft Co");
  const sent = await newQuote("Sent Co");
  await call("POST", `/quotes/${sent.id}/send`);

  await page.goto(`${orgPath}/rate-card`);
  const materials = card(page, "Materials");
  await expect(materials.getByText(/priced at a material price/)).toHaveCount(0);
  await materials.getByRole("button", { name: "New price" }).click();
  await field(materials, "New $/lb").fill("4.86");
  await materials.getByRole("button", { name: "Save price" }).click();

  await expect(
    materials.getByText(
      "2 open quotes were priced at a material price the rate card no longer has",
    ),
  ).toBeVisible();
  await expect(materials.getByText(/the card now has \$4\.86\/lb/)).toBeVisible();
  const draftRow = materials.getByRole("listitem").filter({ hasText: "Draft Co" });
  await expect(draftRow).toContainText("priced at $4.50/lb, up 8.0%");
  await expect(draftRow).toContainText("Re-price it on the quote.");
  await expect(materials.getByRole("listitem").filter({ hasText: "Sent Co" })).toContainText(
    "Sent at the old price",
  );

  // A 10% threshold hides an 8% move.
  await materials.getByLabel("Moved by at least").selectOption("10");
  await expect(materials.getByText("None moved by 10% or more.")).toBeVisible();
  await materials.getByLabel("Moved by at least").selectOption("0");

  // Fits a phone: the page itself never scrolls sideways.
  await page.setViewportSize({ width: 390, height: 844 });
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1280, height: 800 });

  // Re-price the draft from its quote page: only the sent quote is left.
  await draftRow.getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`/quotes/${draft.id}$`));
  await page.getByRole("button", { name: "Re-price" }).click();
  await expect(page.getByText(/This line was priced with/)).toHaveCount(0);
  await page.goto(`${orgPath}/rate-card`);
  await expect(
    card(page, "Materials").getByText(
      "1 open quote was priced at a material price the rate card no longer has",
    ),
  ).toBeVisible();
});
