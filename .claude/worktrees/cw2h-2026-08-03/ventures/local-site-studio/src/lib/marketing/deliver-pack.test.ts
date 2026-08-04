import { describe, expect, it } from "vitest";
import {
  formatMarketingPackEmailHtml,
  leadEligibleForMarketingPackDelivery,
  marketingPackDeliverySubject,
} from "./deliver-pack";
import type { MarketingContentVariant } from "./types";

describe("leadEligibleForMarketingPackDelivery", () => {
  it("requires Growth/Complete paid/live plus email", () => {
    expect(
      leadEligibleForMarketingPackDelivery(
        { stage: "paid", email: "a@example.com" },
        [{ tier: "growth" }],
      ),
    ).toBe(true);
    expect(
      leadEligibleForMarketingPackDelivery(
        { stage: "live", email: "a@example.com" },
        [{ tier: "complete" }],
      ),
    ).toBe(true);
    expect(
      leadEligibleForMarketingPackDelivery(
        { stage: "paid", email: "  " },
        [{ tier: "growth" }],
      ),
    ).toBe(false);
    expect(
      leadEligibleForMarketingPackDelivery(
        { stage: "paid" },
        [{ tier: "growth" }],
      ),
    ).toBe(false);
    expect(
      leadEligibleForMarketingPackDelivery(
        { stage: "paid", email: "a@example.com" },
        [{ tier: "starter" }],
      ),
    ).toBe(false);
    expect(
      leadEligibleForMarketingPackDelivery(
        { stage: "outreach_sent", email: "a@example.com" },
        [{ tier: "growth" }],
      ),
    ).toBe(false);
  });
});

describe("marketingPackDeliverySubject", () => {
  it("includes business name and month", () => {
    expect(marketingPackDeliverySubject("Acme Salon", "2026-07")).toBe(
      "Acme Salon — marketing pack for 2026-07",
    );
  });
});

describe("formatMarketingPackEmailHtml", () => {
  const variants: MarketingContentVariant[] = [
    {
      contentType: "gbp_post",
      title: "Weekend special",
      body: "Come visit us this weekend.\nBring a friend.",
      cta: "Book now",
      hashtags: ["#local", "#salon"],
    },
    {
      contentType: "email_campaign",
      body: "Hello customers,\n\nWe miss you.",
    },
  ];

  it("escapes HTML in titles/bodies and includes labels", () => {
    const html = formatMarketingPackEmailHtml({
      businessName: "Acme <Salon>",
      yearMonth: "2026-07",
      variants: [
        {
          contentType: "gbp_post",
          title: "<script>x</script>",
          body: "Safe & sound <b>hi</b>",
        },
      ],
      previewUrl: "https://example.com/preview/acme",
    });
    expect(html).toContain("Acme &lt;Salon&gt;");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(html).toContain("Safe &amp; sound &lt;b&gt;hi&lt;/b&gt;");
    expect(html).toContain("GBP post");
    expect(html).toContain("https://example.com/preview/acme");
    expect(html).not.toContain("<script>");
  });

  it("renders multiple variants with CTA and hashtags", () => {
    const html = formatMarketingPackEmailHtml({
      businessName: "Acme Salon",
      yearMonth: "2026-07",
      variants,
    });
    expect(html).toContain("1. GBP post");
    expect(html).toContain("2. Email campaign");
    expect(html).toContain("Book now");
    expect(html).toContain("#local #salon");
    expect(html).toContain("2026-07 marketing pack");
  });
});
