import { describe, expect, it } from "vitest";
import {
  commerceBuyNowClientReceiptSubject,
  formatCommerceBuyNowClientReceiptHtml,
  leadEligibleForCommerceBuyNowClientReceipt,
} from "./client-receipt";

describe("leadEligibleForCommerceBuyNowClientReceipt", () => {
  it("requires a non-empty email", () => {
    expect(leadEligibleForCommerceBuyNowClientReceipt({ email: "a@b.co" })).toBe(
      true,
    );
    expect(leadEligibleForCommerceBuyNowClientReceipt({ email: "  a@b.co " })).toBe(
      true,
    );
    expect(leadEligibleForCommerceBuyNowClientReceipt({ email: "" })).toBe(false);
    expect(leadEligibleForCommerceBuyNowClientReceipt({ email: "   " })).toBe(false);
    expect(leadEligibleForCommerceBuyNowClientReceipt({ email: null })).toBe(false);
    expect(leadEligibleForCommerceBuyNowClientReceipt({})).toBe(false);
  });
});

describe("commerceBuyNowClientReceiptSubject", () => {
  it("names the SKU and business", () => {
    expect(commerceBuyNowClientReceiptSubject("Acme Cafe", "Latte")).toBe(
      "New order: Latte — Acme Cafe",
    );
  });
});

describe("formatCommerceBuyNowClientReceiptHtml", () => {
  it("includes sku, amount, session id, and escapes HTML", () => {
    const html = formatCommerceBuyNowClientReceiptHtml({
      businessName: "Acme <Cafe>",
      skuName: "Latte & Tea",
      amountTotalUsd: 12.5,
      customerEmail: "buyer@example.com",
      stripeSessionId: "cs_test_123",
      previewUrl: "https://example.com/preview/acme",
    });

    expect(html).toContain("New paid order");
    expect(html).toContain("Acme &lt;Cafe&gt;");
    expect(html).toContain("Latte &amp; Tea");
    expect(html).toContain("$12.50");
    expect(html).toContain("buyer@example.com");
    expect(html).toContain("cs_test_123");
    expect(html).toContain("https://example.com/preview/acme");
    expect(html).not.toContain("Acme <Cafe>");
  });

  it("notes when customer email is missing", () => {
    const html = formatCommerceBuyNowClientReceiptHtml({
      businessName: "Acme",
      skuName: "Latte",
      amountTotalUsd: 5,
      stripeSessionId: "cs_test_x",
    });
    expect(html).toContain("No customer email was collected");
  });

  it("shows the purchased quantity when known, so the business knows how many units to fulfill", () => {
    const html = formatCommerceBuyNowClientReceiptHtml({
      businessName: "Acme",
      skuName: "Latte",
      amountTotalUsd: 15,
      stripeSessionId: "cs_test_x",
      quantity: 3,
    });
    expect(html).toContain("<strong>Quantity:</strong> 3");
  });

  it("omits the quantity line entirely when quantity is unknown (legacy order)", () => {
    const html = formatCommerceBuyNowClientReceiptHtml({
      businessName: "Acme",
      skuName: "Latte",
      amountTotalUsd: 5,
      stripeSessionId: "cs_test_x",
    });
    expect(html).not.toContain("Quantity:");
  });
});
