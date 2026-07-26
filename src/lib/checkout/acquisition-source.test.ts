import { describe, expect, it } from "vitest";
import {
  CHECKOUT_ACQUISITION_SOURCES,
  checkoutAcquisitionSourceLabel,
  parseCheckoutAcquisitionSource,
} from "./acquisition-source";

describe("parseCheckoutAcquisitionSource", () => {
  it("accepts every allowlisted token", () => {
    for (const source of CHECKOUT_ACQUISITION_SOURCES) {
      expect(parseCheckoutAcquisitionSource(source)).toBe(source);
    }
  });

  it("rejects an unknown token", () => {
    expect(parseCheckoutAcquisitionSource("google-ads")).toBeUndefined();
  });

  it("rejects free text / injection attempts rather than passing them through", () => {
    expect(parseCheckoutAcquisitionSource("<script>alert(1)</script>")).toBeUndefined();
    expect(parseCheckoutAcquisitionSource("home; DROP TABLE orders;")).toBeUndefined();
  });

  it("rejects missing/wrong-typed values", () => {
    expect(parseCheckoutAcquisitionSource(undefined)).toBeUndefined();
    expect(parseCheckoutAcquisitionSource(null)).toBeUndefined();
    expect(parseCheckoutAcquisitionSource(123)).toBeUndefined();
    expect(parseCheckoutAcquisitionSource("")).toBeUndefined();
  });
});

describe("checkoutAcquisitionSourceLabel", () => {
  it("returns a distinct human label for every allowlisted source", () => {
    const labels = CHECKOUT_ACQUISITION_SOURCES.map(checkoutAcquisitionSourceLabel);
    expect(new Set(labels).size).toBe(CHECKOUT_ACQUISITION_SOURCES.length);
    for (const label of labels) {
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
