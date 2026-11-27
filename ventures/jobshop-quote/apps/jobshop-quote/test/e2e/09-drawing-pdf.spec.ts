// E2E part 3: a drawing PDF attached to an RFQ. The offline converter reads the PDF's own text
// (src/shared/pdf-text.ts: the notes on the page and the title block drawn as a form XObject), so
// the material and finish the email leaves out come from the drawing, each quoting the line it came
// from; the upload counts the drawing's page. A scanned sheet gives no text and the page says so.
import { expect, test } from "@playwright/test";
import { drawingPdf, scanPdf } from "../fixtures/drawing-pdf";
import { card, field, signUpWithShop } from "./helpers";

// The email names the part and the quantities only; the drawing carries the rest.
const EMAIL = `From: Dana Ortiz <dana.ortiz@example-robotics.test>
Company: Example Robotics LLC

Please quote the attached drawing.

Part number: BRK-1001 Rev B
Qty: 25, 100`;

test("a drawing PDF's title block and notes fill what the email leaves out; a scan is flagged", async ({
  page,
}) => {
  await signUpWithShop(page, { tag: "pdf", shop: "E2E Drawing Shop" });

  await page.getByRole("link", { name: "RFQs" }).click();
  const newRfq = card(page, "New RFQ");
  await field(newRfq, "Subject").fill("RFQ - bracket per drawing");
  await field(newRfq, "Paste the RFQ email").fill(EMAIL);
  await field(newRfq, "Drawings and attachments").setInputFiles([
    {
      name: "BRK-1001.pdf",
      mimeType: "application/pdf",
      buffer: drawingPdf({
        titleBlock: [
          "TITLE: MOTOR MOUNT BRACKET",
          "DWG NO: BRK-1001 REV B",
          "MATERIAL: 6061-T6 ALUMINUM",
        ],
        notes: ["1. BREAK ALL SHARP EDGES .010 MAX", "FINISH: BLACK ANODIZE TYPE II"],
      }),
    },
    { name: "scan-0001.pdf", mimeType: "application/pdf", buffer: scanPdf() },
  ]);
  await newRfq.getByRole("button", { name: "Create and extract" }).click();
  await page.waitForURL(/\/rfqs\/[^/]+$/);

  // Both files are stored and counted by their pages; only the scan is flagged as unread.
  const source = card(page, "Source");
  // A file's row is the innermost div holding its link (the card's wrapper divs hold both).
  const row = (name: string) =>
    source.locator("div", { has: page.getByRole("link", { name }) }).last();
  const drawingRow = row("BRK-1001.pdf");
  await expect(drawingRow).toContainText("(1 page)");
  await expect(drawingRow).not.toContainText("no text read");
  const scanRow = row("scan-0001.pdf");
  await expect(scanRow).toContainText("(1 page)");
  await expect(scanRow).toContainText("no text read from it, likely a scan");

  // Material and finish come from the drawing, each with the drawing's line as its source.
  const bracket = card(page, /^BRK-1001/);
  await expect(field(bracket, "Quantities")).toHaveValue("25, 100");
  await expect(field(bracket, "Material (as written)")).toHaveValue("6061-T6 ALUMINUM");
  await expect(bracket.getByText("From the RFQ: “MATERIAL: 6061-T6 ALUMINUM”")).toBeVisible();
  await expect(field(bracket, "Finish (as written)")).toHaveValue("BLACK ANODIZE TYPE II");
  await expect(bracket.getByText("From the RFQ: “FINISH: BLACK ANODIZE TYPE II”")).toBeVisible();

  // The drawing downloads byte for byte as uploaded.
  const download = await page.request.get(
    (await source.getByRole("link", { name: "BRK-1001.pdf" }).getAttribute("href")) ?? "",
  );
  expect(download.ok()).toBe(true);
  expect((await download.body()).subarray(0, 8).toString("latin1")).toBe("%PDF-1.7");
});
