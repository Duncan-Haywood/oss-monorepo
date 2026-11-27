// E2E part 3: a DXF flat pattern attached to an RFQ, measured by the real parser (packages/cad-features),
// pre-fills the laser cut, the press-brake bend and the sheet blank on the quote line; then the quote is
// won and the win/loss CSV download carries it. The DXF is written here by cad-features' own test writer:
// a 4 × 2 in plate with two Ø0.25 in holes and one bend line on a BEND layer, in inches.
import { readFileSync } from "node:fs";
import { expect, type Locator, test } from "@playwright/test";
import {
  circle,
  dxf,
  line,
  lwpolyline,
} from "../../../../packages/cad-features/test/helpers/dxf-writer";
import { card, field, RFQ_EMAIL, signUpWithShop } from "./helpers";

/** Every input of a repeated <Field label="..."> (one per operation row), matched exactly. */
function fields(scope: Locator, label: string): Locator {
  return scope
    .locator("label", { has: scope.page().locator("span", { hasText: new RegExp(`^${label}$`) }) })
    .locator("input");
}

function bracketDxf(): Buffer {
  const text = dxf(
    [
      lwpolyline(
        "CUT",
        [
          [0, 0],
          [4, 0],
          [4, 2],
          [0, 2],
        ],
        true,
      ),
      circle("CUT", 1, 1, 0.125),
      circle("CUT", 3, 1, 0.125),
      line("BEND", 2, 0, 2, 2),
    ],
    { insunits: 1 },
  );
  return Buffer.from(text);
}

test("DXF flat pattern pre-fills cut, bend and sheet blank; the won quote is in the CSV", async ({
  page,
}) => {
  const { orgPath } = await signUpWithShop(page, { tag: "dxf", shop: "E2E Sheet Metal" });

  // Rate card: a fiber laser with a cut speed and pierce time, a press brake with seconds per bend,
  // and a sheet material with its thickness (so a flat pattern can size the blank).
  const machines = card(page, "Machines and work centers");
  await field(machines, "Name").fill("Fiber laser");
  await field(machines, "Kind").selectOption("laser");
  await field(machines, "$/hour").fill("150");
  await field(machines, "Setup min").fill("15");
  await field(machines, "Cut speed in/min").fill("300");
  await field(machines, "Pierce seconds").fill("1.5");
  await machines.getByRole("button", { name: "Add machine" }).click();
  await expect(machines.getByRole("cell", { name: "Fiber laser" })).toBeVisible();

  await field(machines, "Name").fill("Press brake");
  await field(machines, "Kind").selectOption("press_brake");
  await field(machines, "$/hour").fill("85");
  await field(machines, "Setup min").fill("20");
  await field(machines, "Seconds per bend").fill("8");
  await machines.getByRole("button", { name: "Add machine" }).click();
  await expect(machines.getByRole("cell", { name: "Press brake" })).toBeVisible();

  const materials = card(page, "Materials");
  await field(materials, "Name").fill("6061-T6 sheet, 0.125");
  await field(materials, "$/lb").fill("5");
  await field(materials, "Density lb/in³").fill("0.0975");
  await field(materials, "Sheet thickness (in)").fill("0.125");
  await field(materials, "Scrap %").fill("20");
  await materials.getByRole("button", { name: "Add material" }).click();
  await expect(materials.getByRole("cell", { name: "6061-T6 sheet, 0.125" })).toBeVisible();

  // The RFQ with the part's flat pattern; the file name carries the part number, which links them.
  await page.getByRole("link", { name: "RFQs" }).click();
  const newRfq = card(page, "New RFQ");
  await field(newRfq, "Subject").fill("RFQ - bracket flat pattern");
  await field(newRfq, "Paste the RFQ email").fill(RFQ_EMAIL);
  await field(newRfq, "Drawings and attachments").setInputFiles({
    name: "BRK-1001.dxf",
    mimeType: "application/dxf",
    buffer: bracketDxf(),
  });
  await newRfq.getByRole("button", { name: "Create and extract" }).click();
  await page.waitForURL(/\/rfqs\/[^/]+$/);

  // Measured at upload: perimeter 12 in plus two Ø0.25 circles (0.785 in each) is 13.57 in of cut,
  // three pierces (the outline and two holes), one bend line, 8 in² less two holes' 0.0982 in².
  const source = card(page, "Source");
  await expect(source.getByRole("link", { name: "BRK-1001.dxf" })).toBeVisible();
  await expect(
    source.getByText(
      /^Flat pattern 4×2 in · cut 13\.5708 in · 3 pierces · 1 bend lines · net 7\.9018 in²/,
    ),
  ).toBeVisible();

  await expect(source.getByText("Holes: 2× Ø0.25")).toBeVisible();

  // Confirm against the sheet material (the RFQ says "plate"; the shop picks its own sheet row).
  const bracket = card(page, /^BRK-1001/);
  await field(bracket, "Rate-card material").selectOption({ label: "6061-T6 sheet, 0.125" });
  await bracket.getByRole("button", { name: "Confirm" }).click();
  await expect(bracket.getByText("confirmed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Quote 1 confirmed part" }).click();
  await page.waitForURL(/\/quotes\/[^/]+$/);

  // The blank is the flat pattern's 4 × 2 in at the sheet's thickness (rounded up to the 1/8 in, no
  // margin: the nest's waste is in the 20% scrap).
  const ql = card(page, /^BRK-1001/);
  await expect(field(ql, "Blank")).toHaveValue("rect");
  await expect(field(ql, "Length in")).toHaveValue("4");
  await expect(field(ql, "Width in")).toHaveValue("2");
  await expect(field(ql, "Thickness in")).toHaveValue("0.125");

  // Cut: 13.57 / 300 = 0.0452 min + 3 × 1.5 s = 0.075 min -> 0.1202, rounded up to 0.13.
  // Bend: 1 × 8 s = 0.1333 min, rounded up to 0.14.
  const ops = fields(ql, "Op");
  await expect(ops).toHaveCount(2);
  await expect(ops.nth(0)).toHaveValue("Cut from DXF: 13.6 in at 300 in/min + 3 pierces × 1.5 s");
  await expect(ops.nth(1)).toHaveValue("Bend from DXF: 1 bend line × 8 s");
  const setups = fields(ql, "Setup min");
  await expect(setups.nth(0)).toHaveValue("15");
  await expect(setups.nth(1)).toHaveValue("20");
  const cycles = fields(ql, "Cycle min/pc");
  await expect(cycles.nth(0)).toHaveValue("0.13");
  await expect(cycles.nth(1)).toHaveValue("0.14");
  await ql.getByRole("button", { name: "Save line" }).click();
  await expect(ql.getByText("priced", { exact: true })).toBeVisible();

  // Send and win it, then download the win/loss CSV.
  await page.getByRole("button", { name: "Mark sent" }).click();
  const outcome = card(page, "Outcome");
  await field(outcome, "Won amount $").fill("1234.5");
  await outcome.getByRole("button", { name: "Won", exact: true }).click();
  await expect(page.getByText("won", { exact: true }).first()).toBeVisible();
  const quoteLabel =
    (await page.getByRole("heading", { level: 1 }).textContent())?.match(/Q-\d+/)?.[0] ?? "";
  expect(quoteLabel).not.toBe("");

  await page.goto(`${orgPath}/win-loss`);
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download CSV" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^win-loss-365-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = readFileSync(await file.path(), "utf8");
  // A BOM first so Excel opens accented customer names as UTF-8.
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  const rows = csv.slice(1).trim().split(/\r?\n/);
  expect(rows[0]).toBe(
    "Quote,Customer,Estimator,Outcome,Decided (UTC),Quoted total (smallest quantity),Won amount,Markup on cost %,Lost reason,Part numbers,Routings",
  );
  expect(rows).toHaveLength(2);
  const cols = (rows[1] ?? "").split(",");
  expect(cols[1]).toBe("Example Robotics LLC");
  expect(cols[2]).toBe("E2E Estimator");
  expect(cols[3]).toBe("won");
  expect(cols[4]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(cols[5]).toMatch(/^\d+\.\d{2}$/);
  expect(cols[6]).toBe("1234.50");
  expect(cols[9]).toBe("BRK-1001");
  expect(cols[0]).toContain(quoteLabel);
});
