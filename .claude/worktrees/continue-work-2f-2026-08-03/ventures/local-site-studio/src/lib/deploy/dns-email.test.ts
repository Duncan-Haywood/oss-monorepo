import { describe, expect, it } from "vitest";
import { formatDnsInstructionsForEmail } from "./dns-email";
import type { DeployHandoff } from "./types";

function sampleHandoff(overrides: Partial<DeployHandoff> = {}): DeployHandoff {
  return {
    id: "h1",
    leadSlug: "bob-auto",
    businessName: `Bob's Auto & <Truck> Repair`,
    tier: "starter",
    commerceAddon: false,
    stripeSessionId: "cs_test_1",
    customerEmail: "bob@example.com",
    previewUrl: "https://example.com/preview/bob-auto?x=<script>",
    suggestedHost: "bob-auto.localsitestudio.com",
    contactFormUrl: "https://example.com/api/contact/bob-auto",
    dnsInstructions: [
      {
        type: "CNAME",
        host: "www.<evil>",
        value: "cname.vercel-dns.com",
        purpose: `Point www to <platform>`,
      },
    ],
    status: "awaiting_dns",
    notes: [],
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
    ...overrides,
  };
}

describe("formatDnsInstructionsForEmail", () => {
  it("escapes dynamic DNS/host/URL fields in the HTML body", () => {
    const html = formatDnsInstructionsForEmail(sampleHandoff());
    expect(html).toContain("www.&lt;evil&gt;");
    expect(html).toContain("Point www to &lt;platform&gt;");
    expect(html).toContain("preview/bob-auto?x=&lt;script&gt;");
    expect(html).not.toContain("www.<evil>");
    expect(html).not.toContain("?x=<script>");
  });
});
