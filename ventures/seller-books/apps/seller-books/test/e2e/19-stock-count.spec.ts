// A stock count on the Inventory page: three items on the books at December 31, one ticked by scanning
// its SKU, one marked found on the downloaded count sheet read back, the third not found and written
// off on December 31 so it leaves line 41; then undo puts it back. Figures match
// test/worker/stock-count.test.ts's rules (line 41 is what is on hand at the year end).
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { card, labelled, nav, signUpWithShop } from "./helpers";

test("a year-end stock count ticks by SKU and by sheet, writes off what is missing, and undoes it", async ({
  page,
}) => {
  await signUpWithShop(page, { tag: "count", shop: "Shelf Check Resale" });
  await nav(page, "Inventory");
  const single = card(page, "Add a single item");
  for (const [title, sku, cost] of [
    ["Wool coat", "COAT-1", "35.00"],
    ["Brass lamp", "LAMP-1", "12.00"],
    ["Pyrex bowl", "PYREX-2", "8.00"],
  ] as const) {
    await single.getByPlaceholder("Title").fill(title);
    await single.getByPlaceholder("SKU (optional)").fill(sku);
    await single.locator('input[type="date"]').fill("2026-02-01");
    await single.getByPlaceholder("Cost, e.g. 4.99").fill(cost);
    await single.getByRole("button", { name: "Add item" }).click();
    await expect(card(page, "Items").getByRole("row", { name: new RegExp(title) })).toBeVisible();
  }

  await page.getByRole("button", { name: "Start a count" }).click();
  const count = page.getByRole("region", { name: "Stock count" });
  await labelled(count, "Count date").fill("2026-12-31");
  await expect(count.getByText("3 items, $55.00")).toBeVisible();

  await count.getByLabel("Scan or type a SKU").fill("coat-1");
  await count.getByLabel("Scan or type a SKU").press("Enter");
  await expect(count.getByText("Found: Wool coat (COAT-1)")).toBeVisible();
  await count.getByLabel("Scan or type a SKU").fill("NOPE-9");
  await count.getByLabel("Scan or type a SKU").press("Enter");
  await expect(count.getByText(/No item in stock has SKU "NOPE-9"/)).toBeVisible();

  // The count sheet carries the coat already ticked (Y); filled in as a spreadsheet would be, the lamp too.
  const download = page.waitForEvent("download");
  await count.getByRole("button", { name: "Download the count sheet (CSV)" }).click();
  const dl = await download;
  expect(dl.suggestedFilename()).toBe("stock-count-2026-12-31.csv");
  const sheet = await (await dl.createReadStream()).toArray();
  const rows = Buffer.concat(sheet).toString("utf8").trim().split("\r\n");
  expect(rows[0]).toBe("Item ID,SKU,Item,Lot,Where bought,Bought,Cost,Found (Y/N)");
  const filled = rows.map((r) => (r.includes(",LAMP-1,") ? r.replace(/,$/, ",Y") : r)).join("\r\n");
  const file = join(tmpdir(), `count-${Date.now()}.csv`);
  writeFileSync(file, filled);
  await count.locator('input[type="file"]').setInputFiles(file);
  await expect(count.getByText(/2 items marked found, 0 not found, 1 left blank/)).toBeVisible();

  await expect(
    count.getByRole("heading", { name: /Finish: 1 item not found \(\$8\.00\)/ }),
  ).toBeVisible();
  await expect(count.getByText(/They leave line 41 \(closing inventory\) for 2026/)).toBeVisible();
  await count.getByRole("button", { name: "Take 1 item out on 2026-12-31" }).click();
  await expect(
    count.getByText(/1 item \(\$8\.00\) taken out of inventory on 2026-12-31/),
  ).toBeVisible();
  await expect(card(page, "Items").getByRole("row", { name: /Pyrex bowl/ })).toContainText(
    "written off",
  );

  await nav(page, "Schedule C worksheet");
  await labelled(page, "Tax year").fill("2026");
  const part3 = card(page, "Part III: cost of goods sold (inventory at cost)");
  await expect(part3.getByRole("row", { name: /Inventory at end of year/ })).toContainText(
    "$47.00",
  );

  // Back on the Inventory page the item is put back from its own row.
  await nav(page, "Inventory");
  await card(page, "Items")
    .getByRole("row", { name: /Pyrex bowl/ })
    .getByRole("button", { name: "Back in stock" })
    .click();
  await expect(card(page, "Items").getByRole("row", { name: /Pyrex bowl/ })).toContainText(
    "in stock",
  );
});
