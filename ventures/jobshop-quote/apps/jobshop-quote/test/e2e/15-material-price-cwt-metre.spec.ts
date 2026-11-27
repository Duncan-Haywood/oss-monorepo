// Material price lists, part 2c: an admin adds steel plate at the supplier's $412.50/cwt and a tube
// at $10.00/m through the Materials form; the table shows each in the supplier's unit with the
// exact price it charges, and New price edits the cwt figure. The card fits a 390 px phone.
import { expect, test } from "@playwright/test";
import { card, field, signUpWithShop } from "./helpers";

test("a price per cwt or per metre is kept as the supplier quotes it", async ({ page }) => {
  await signUpWithShop(page, { tag: "cwt-metre", shop: "E2E Cwt Metre" });
  const materials = card(page, "Materials");

  await field(materials, "Name").fill("A36 plate");
  await field(materials, "Price per").selectOption("cwt");
  await field(materials, "$ per cwt (100 lb)").fill("412.50");
  await materials.getByRole("button", { name: "Add material" }).click();
  await expect(materials.getByText("$412.50/cwt ($4.125/lb)")).toBeVisible();

  await field(materials, "Name").fill("6063 tube 1 in OD");
  await field(materials, "Priced").selectOption("per_ft");
  await field(materials, "Price per").selectOption("m");
  await field(materials, "$ per metre").fill("10");
  await materials.getByRole("button", { name: "Add material" }).click();
  await expect(materials.getByText(/\$10\.00\/m \(\$3\.048\/ft\)/)).toBeVisible();

  const plate = materials.getByRole("row", { name: /A36 plate/ });
  await plate.getByRole("button", { name: "New price" }).click();
  await field(materials, "New $ per cwt").fill("440");
  await materials.getByRole("button", { name: "Save price" }).click();
  await expect(materials.getByText("$440.00/cwt ($4.40/lb)")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
