import { describe, expect, it } from "vitest";
import {
  encodeLeadSlugPathSegment,
  isPublicLeadSlugPathLengthOk,
  leadContactAbsoluteUrl,
  leadContactApiPath,
  leadPreviewAbsoluteUrl,
  leadPreviewPath,
  leadSlugAsDnsLabel,
  MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH,
} from "./slug-path";

describe("encodeLeadSlugPathSegment", () => {
  it("is a no-op for conforming [a-z0-9-]+ slugs", () => {
    expect(encodeLeadSlugPathSegment("pine-cafe")).toBe("pine-cafe");
    expect(encodeLeadSlugPathSegment("organic-a1b2c3")).toBe("organic-a1b2c3");
  });

  it("percent-encodes slash so path construction stays one segment", () => {
    expect(encodeLeadSlugPathSegment("evil/../../dashboard")).toBe(
      "evil%2F..%2F..%2Fdashboard",
    );
    expect(encodeLeadSlugPathSegment("a/b")).toBe("a%2Fb");
  });

  it("encodes spaces and other reserved characters", () => {
    expect(encodeLeadSlugPathSegment("Blue Cafe!")).toBe("Blue%20Cafe!");
  });
});

describe("leadPreviewPath / leadContactApiPath", () => {
  it("builds encoded app-relative paths", () => {
    expect(leadPreviewPath("pine-cafe")).toBe("/preview/pine-cafe");
    expect(leadContactApiPath("pine-cafe")).toBe("/api/contact/pine-cafe");
    expect(leadPreviewPath("a/../b")).toBe("/preview/a%2F..%2Fb");
    expect(leadContactApiPath("a/../b")).toBe("/api/contact/a%2F..%2Fb");
  });
});

describe("leadPreviewAbsoluteUrl / leadContactAbsoluteUrl", () => {
  it("joins base origin without double slashes", () => {
    expect(leadPreviewAbsoluteUrl("https://app.example.com", "pine-cafe")).toBe(
      "https://app.example.com/preview/pine-cafe",
    );
    expect(leadPreviewAbsoluteUrl("https://app.example.com/", "a/b")).toBe(
      "https://app.example.com/preview/a%2Fb",
    );
    expect(leadContactAbsoluteUrl("http://localhost:3000", "demo")).toBe(
      "http://localhost:3000/api/contact/demo",
    );
  });
});

describe("leadSlugAsDnsLabel", () => {
  it("passes conforming slugs through lowercased", () => {
    expect(leadSlugAsDnsLabel("Pine-Cafe")).toBe("pine-cafe");
  });

  it("collapses path separators and junk into a single DNS label", () => {
    expect(leadSlugAsDnsLabel("evil/../../dashboard")).toBe("evil-dashboard");
    expect(leadSlugAsDnsLabel("Foo Bar!")).toBe("foo-bar");
  });

  it("falls back to lead when sanitization empties the string", () => {
    expect(leadSlugAsDnsLabel("...")).toBe("lead");
    expect(leadSlugAsDnsLabel("///")).toBe("lead");
  });

  it("caps at 63 so suggestedHost is always a valid DNS label", () => {
    const overlong = `legacy-free-form-${"z".repeat(80)}`;
    const label = leadSlugAsDnsLabel(overlong);
    expect(label.length).toBeLessThanOrEqual(63);
    expect(label).not.toMatch(/^-|-$/);
  });
});

describe("isPublicLeadSlugPathLengthOk", () => {
  it("rejects empty and over-max path slugs", () => {
    expect(isPublicLeadSlugPathLengthOk("")).toBe(false);
    expect(
      isPublicLeadSlugPathLengthOk("a".repeat(MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH + 1)),
    ).toBe(false);
  });

  it("accepts exact-max and typical create-path slugs", () => {
    expect(
      isPublicLeadSlugPathLengthOk("a".repeat(MAX_PUBLIC_LEAD_SLUG_PATH_LENGTH)),
    ).toBe(true);
    expect(isPublicLeadSlugPathLengthOk("demo-cafe")).toBe(true);
  });
});
