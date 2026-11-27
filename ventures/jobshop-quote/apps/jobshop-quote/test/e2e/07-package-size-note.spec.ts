// The New RFQ form counts the drawing pages of the files picked, in the browser, by the worker's
// rule (shared/upload-pages.ts), and says before submit how many AI-read RFQs the package uses
// (ROADMAP item 4). A fresh early-access shop has 40 left, so a 27-page set "uses 3" and fits.
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { card, field, signUpWithShop } from "./helpers";

const pdf = (name: string) => fileURLToPath(new URL(`../fixtures/pdf/${name}`, import.meta.url));

test("a multi-page drawing set says how many AI-read RFQs it uses before submit", async ({
  page,
}) => {
  await signUpWithShop(page, { tag: "pkgnote", shop: "E2E Package Shop" });
  await page.getByRole("link", { name: "RFQs" }).click();
  const newRfq = card(page, "New RFQ");
  const files = field(newRfq, "Drawings and attachments");

  // One 12-page set is 2 RFQs; adding a 15-page set makes 27 pages, 3 RFQs.
  await files.setInputFiles([pdf("drawings-12-chrome.pdf")]);
  const note = newRfq.getByTestId("intake-package-note");
  await expect(note).toContainText("12 pages");
  await expect(note).toContainText("uses 2 of this month's AI-read RFQs");
  await files.setInputFiles([pdf("drawings-12-chrome.pdf"), pdf("sheets-15-libreoffice.pdf")]);
  await expect(note).toContainText("27 pages");
  await expect(note).toContainText("uses 3 of this month's AI-read RFQs");
  await expect(note).toContainText("40 are left");
  // It fits, so the button still reads the package.
  await expect(newRfq.getByRole("button", { name: "Create and extract" })).toBeVisible();

  // A one-page drawing counts once, as an RFQ always does: no note.
  await files.setInputFiles([pdf("drawing-1-chrome.pdf")]);
  await expect(note).toHaveCount(0);
});
