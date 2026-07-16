import { describe, expect, it } from "vitest";
import {
  MAX_PREVIEW_OPEN_ATTR_PARAM_LENGTH,
  MAX_PREVIEW_OPENED_AT_LENGTH,
  OUTREACH_PREVIEW_SRC,
  buildPreviewOpenBeaconPath,
  previewUrlWithOutreachTracking,
  resolvePreviewOpenAttrParam,
  resolvePreviewOpenedAt,
  shouldFirePreviewOpenBeacon,
  shouldPersistPreviewOpen,
  shouldRecordPreviewOpen,
} from "./preview-open";

describe("previewUrlWithOutreachTracking", () => {
  it("adds src=outreach to a clean preview URL", () => {
    expect(previewUrlWithOutreachTracking("https://app.example/preview/acme")).toBe(
      "https://app.example/preview/acme?src=outreach",
    );
  });

  it("preserves an existing src param", () => {
    expect(
      previewUrlWithOutreachTracking("https://app.example/preview/acme?src=manual"),
    ).toBe("https://app.example/preview/acme?src=manual");
  });

  it("falls back when URL constructor would fail", () => {
    expect(previewUrlWithOutreachTracking("/preview/acme")).toContain(`src=${OUTREACH_PREVIEW_SRC}`);
  });
});

describe("shouldRecordPreviewOpen", () => {
  it("records outreach and email src", () => {
    expect(shouldRecordPreviewOpen({ src: "outreach" })).toBe(true);
    expect(shouldRecordPreviewOpen({ src: "email" })).toBe(true);
    expect(shouldRecordPreviewOpen({ utmSource: "resend" })).toBe(true);
  });

  it("records in-pipeline stages without query params", () => {
    expect(shouldRecordPreviewOpen({ stage: "outreach_sent" })).toBe(true);
    expect(shouldRecordPreviewOpen({ stage: "discovery_call" })).toBe(true);
  });

  it("skips cold browsing of discovered/site_built without attribution", () => {
    expect(shouldRecordPreviewOpen({ stage: "discovered" })).toBe(false);
    expect(shouldRecordPreviewOpen({ stage: "site_built", src: null })).toBe(false);
    expect(shouldRecordPreviewOpen({ stage: "paid" })).toBe(false);
  });
});

describe("shouldPersistPreviewOpen", () => {
  const now = Date.parse("2026-07-12T12:00:00.000Z");

  it("persists when never opened", () => {
    expect(shouldPersistPreviewOpen(undefined, now)).toBe(true);
  });

  it("debounces recent opens", () => {
    expect(shouldPersistPreviewOpen("2026-07-12T11:45:00.000Z", now)).toBe(false);
    expect(shouldPersistPreviewOpen("2026-07-12T11:00:00.000Z", now)).toBe(true);
  });
});

describe("resolvePreviewOpenAttrParam", () => {
  it("returns null for missing / empty / non-string", () => {
    expect(resolvePreviewOpenAttrParam(undefined)).toBeNull();
    expect(resolvePreviewOpenAttrParam(null)).toBeNull();
    expect(resolvePreviewOpenAttrParam("")).toBeNull();
  });

  it("returns null for over-long probes (fall-back, never soft-cap)", () => {
    const overLong = "a".repeat(MAX_PREVIEW_OPEN_ATTR_PARAM_LENGTH + 1);
    expect(resolvePreviewOpenAttrParam(overLong)).toBeNull();
  });

  it("accepts genuine short attribution tokens at exact max", () => {
    expect(resolvePreviewOpenAttrParam("outreach")).toBe("outreach");
    expect(resolvePreviewOpenAttrParam("email")).toBe("email");
    expect(resolvePreviewOpenAttrParam("resend")).toBe("resend");
    const exact = "x".repeat(MAX_PREVIEW_OPEN_ATTR_PARAM_LENGTH);
    expect(resolvePreviewOpenAttrParam(exact)).toBe(exact);
  });
});

describe("shouldFirePreviewOpenBeacon", () => {
  it("fires for short attribution tokens", () => {
    expect(shouldFirePreviewOpenBeacon({ src: "outreach" })).toBe(true);
    expect(shouldFirePreviewOpenBeacon({ utmSource: "resend" })).toBe(true);
  });

  it("fires for trackByStage even without query attrs", () => {
    expect(shouldFirePreviewOpenBeacon({ trackByStage: true })).toBe(true);
  });

  it("does not treat over-long src/utm as attribution (fall-back)", () => {
    const overLong = "a".repeat(MAX_PREVIEW_OPEN_ATTR_PARAM_LENGTH + 1);
    expect(shouldFirePreviewOpenBeacon({ src: overLong })).toBe(false);
    expect(shouldFirePreviewOpenBeacon({ utmSource: overLong })).toBe(false);
  });

  it("still fires trackByStage when over-long attrs are present", () => {
    const overLong = "a".repeat(MAX_PREVIEW_OPEN_ATTR_PARAM_LENGTH + 1);
    expect(
      shouldFirePreviewOpenBeacon({ src: overLong, trackByStage: true }),
    ).toBe(true);
  });
});

describe("buildPreviewOpenBeaconPath", () => {
  it("omits over-long src/utm_source from the fetch URL (page twin)", () => {
    const overLong = "a".repeat(MAX_PREVIEW_OPEN_ATTR_PARAM_LENGTH + 1);
    expect(
      buildPreviewOpenBeaconPath("demo-cafe", {
        src: overLong,
        utmSource: overLong,
      }),
    ).toBe("/api/preview/demo-cafe/open");
  });

  it("includes short attribution tokens", () => {
    expect(
      buildPreviewOpenBeaconPath("demo-cafe", { src: "outreach" }),
    ).toBe("/api/preview/demo-cafe/open?src=outreach");
    expect(
      buildPreviewOpenBeaconPath("demo-cafe", { utmSource: "resend" }),
    ).toBe("/api/preview/demo-cafe/open?utm_source=resend");
  });

  it("keeps short tokens and drops only the over-long twin", () => {
    const overLong = "a".repeat(MAX_PREVIEW_OPEN_ATTR_PARAM_LENGTH + 1);
    expect(
      buildPreviewOpenBeaconPath("demo-cafe", {
        src: "outreach",
        utmSource: overLong,
      }),
    ).toBe("/api/preview/demo-cafe/open?src=outreach");
  });
});

describe("resolvePreviewOpenedAt", () => {
  const serverNow = "2026-07-16T09:00:00.000Z";

  it("falls back to server now for missing / non-string / empty", () => {
    expect(resolvePreviewOpenedAt(undefined, serverNow)).toBe(serverNow);
    expect(resolvePreviewOpenedAt(null, serverNow)).toBe(serverNow);
    expect(resolvePreviewOpenedAt(123, serverNow)).toBe(serverNow);
    expect(resolvePreviewOpenedAt("", serverNow)).toBe(serverNow);
  });

  it("falls back to server now for over-long probes before Date.parse", () => {
    const overLong = `${"2".repeat(MAX_PREVIEW_OPENED_AT_LENGTH + 1)}Z`;
    expect(overLong.length).toBeGreaterThan(MAX_PREVIEW_OPENED_AT_LENGTH);
    expect(resolvePreviewOpenedAt(overLong, serverNow)).toBe(serverNow);
  });

  it("accepts exact-max length when parseable", () => {
    // 24-char ISO padded conceptually — use a real ISO under the ceiling.
    const iso = "2026-07-12T11:00:00.000Z";
    expect(iso.length).toBeLessThanOrEqual(MAX_PREVIEW_OPENED_AT_LENGTH);
    expect(resolvePreviewOpenedAt(iso, serverNow)).toBe(iso);
  });

  it("falls back when unparseable within the length ceiling", () => {
    expect(resolvePreviewOpenedAt("not-a-date", serverNow)).toBe(serverNow);
  });

  it("normalizes parseable non-ISO dates to toISOString", () => {
    expect(resolvePreviewOpenedAt("2026-07-12T11:00:00+00:00", serverNow)).toBe(
      "2026-07-12T11:00:00.000Z",
    );
  });
});
