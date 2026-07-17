import { describe, expect, it } from "vitest";
import {
  MAX_PACK_VARIANT_BODY_LENGTH,
  MAX_PACK_VARIANT_TITLE_LENGTH,
} from "@/lib/packs/variant-fields";
import {
  clientVoicePackDeliverySubject,
  formatClientVoicePackEmailHtml,
  leadEligibleForClientVoicePackDelivery,
} from "./deliver-pack";
import type { ClientVoiceScriptVariant } from "./types";

describe("leadEligibleForClientVoicePackDelivery", () => {
  it("requires Complete paid/live plus email", () => {
    expect(
      leadEligibleForClientVoicePackDelivery(
        { stage: "paid", email: "a@example.com" },
        [{ tier: "complete" }],
      ),
    ).toBe(true);
    expect(
      leadEligibleForClientVoicePackDelivery(
        { stage: "live", email: "a@example.com" },
        [{ tier: "complete" }],
      ),
    ).toBe(true);
    expect(
      leadEligibleForClientVoicePackDelivery(
        { stage: "paid", email: "  " },
        [{ tier: "complete" }],
      ),
    ).toBe(false);
    expect(
      leadEligibleForClientVoicePackDelivery(
        { stage: "paid" },
        [{ tier: "complete" }],
      ),
    ).toBe(false);
    expect(
      leadEligibleForClientVoicePackDelivery(
        { stage: "paid", email: "a@example.com" },
        [{ tier: "growth" }],
      ),
    ).toBe(false);
    expect(
      leadEligibleForClientVoicePackDelivery(
        { stage: "outreach_sent", email: "a@example.com" },
        [{ tier: "complete" }],
      ),
    ).toBe(false);
  });

  it("rejects Complete orders after recurringCanceledAt", () => {
    expect(
      leadEligibleForClientVoicePackDelivery(
        { stage: "paid", email: "a@example.com" },
        [{ tier: "complete", recurringCanceledAt: 1_720_000_000_000 }],
      ),
    ).toBe(false);
    expect(
      leadEligibleForClientVoicePackDelivery(
        { stage: "paid", email: "a@example.com" },
        [
          { tier: "complete", recurringCanceledAt: 1_720_000_000_000 },
          { tier: "complete" },
        ],
      ),
    ).toBe(true);
  });
});

describe("clientVoicePackDeliverySubject", () => {
  it("includes business name", () => {
    expect(clientVoicePackDeliverySubject("Acme Salon")).toBe(
      "Acme Salon — phone FAQ / script pack",
    );
  });
});

describe("formatClientVoicePackEmailHtml", () => {
  const variants: ClientVoiceScriptVariant[] = [
    {
      scriptType: "inbound_greeting",
      title: "Main greeting",
      body: "Thanks for calling Acme.\nHow can I help?",
      cta: "Press 1 to book",
    },
    {
      scriptType: "hours_faq",
      title: "Hours",
      body: "We are open Mon–Fri 9–5.",
    },
  ];

  it("escapes HTML in titles/bodies and includes labels", () => {
    const html = formatClientVoicePackEmailHtml({
      businessName: "Acme <Salon>",
      variants: [
        {
          scriptType: "inbound_greeting",
          title: "<script>x</script>",
          body: "Safe & sound <b>hi</b>",
        },
      ],
      previewUrl: "https://example.com/preview/acme",
    });
    expect(html).toContain("Acme &lt;Salon&gt;");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(html).toContain("Safe &amp; sound &lt;b&gt;hi&lt;/b&gt;");
    expect(html).toContain("Inbound greeting");
    expect(html).toContain("https://example.com/preview/acme");
    expect(html).not.toContain("<script>");
  });

  it("soft-caps over-long persisted variant fields before HTML emit", () => {
    const longTitle = "T".repeat(MAX_PACK_VARIANT_TITLE_LENGTH + 8);
    const longBody = "B".repeat(MAX_PACK_VARIANT_BODY_LENGTH + 4);
    const html = formatClientVoicePackEmailHtml({
      businessName: "Acme Salon",
      variants: [
        {
          scriptType: "inbound_greeting",
          title: longTitle,
          body: longBody,
        },
      ],
    });
    expect(html).not.toContain(longTitle);
    expect(html).not.toContain(longBody);
    expect(html).toContain("T".repeat(MAX_PACK_VARIANT_TITLE_LENGTH));
    expect(html).toContain("B".repeat(MAX_PACK_VARIANT_BODY_LENGTH));
  });

  it("renders multiple scripts with spoken CTA", () => {
    const html = formatClientVoicePackEmailHtml({
      businessName: "Acme Salon",
      variants,
    });
    expect(html).toContain("1. Inbound greeting");
    expect(html).toContain("2. Hours FAQ");
    expect(html).toContain("Press 1 to book");
    expect(html).toContain("phone FAQ / script pack");
  });
});
