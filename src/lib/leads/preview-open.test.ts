import { describe, expect, it } from "vitest";
import {
  OUTREACH_PREVIEW_SRC,
  previewUrlWithOutreachTracking,
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
