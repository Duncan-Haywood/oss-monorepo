import { describe, expect, it } from "vitest";
import { stageFunnelBarWidthClass } from "./stage-funnel-bar-width";

describe("stageFunnelBarWidthClass", () => {
  it("returns the full-width class when count equals max", () => {
    expect(stageFunnelBarWidthClass(10, 10)).toBe("w-[100%]");
  });

  it("returns the zero-width class when count is zero", () => {
    expect(stageFunnelBarWidthClass(0, 10)).toBe("w-[0%]");
  });

  it("buckets an exact halfway value to the nearest 5%", () => {
    expect(stageFunnelBarWidthClass(5, 10)).toBe("w-[50%]");
  });

  it("rounds a non-bucket-aligned percentage to the nearest 5%", () => {
    // 3/7 = ~42.86% -> nearest bucket is 45%
    expect(stageFunnelBarWidthClass(3, 7)).toBe("w-[45%]");
    // 1/7 = ~14.29% -> nearest bucket is 15%
    expect(stageFunnelBarWidthClass(1, 7)).toBe("w-[15%]");
  });

  it("every returned class is a literal, static Tailwind arbitrary-value class", () => {
    for (let count = 0; count <= 20; count += 1) {
      const cls = stageFunnelBarWidthClass(count, 20);
      expect(cls).toMatch(/^w-\[\d{1,3}%\]$/);
    }
  });

  it("clamps a count above max to the full-width class (defensive — callers should not exceed max)", () => {
    expect(stageFunnelBarWidthClass(15, 10)).toBe("w-[100%]");
  });

  it("clamps a negative count to the zero-width class", () => {
    expect(stageFunnelBarWidthClass(-5, 10)).toBe("w-[0%]");
  });

  it("falls back to the zero-width class when maxCount is zero, negative, or non-finite", () => {
    expect(stageFunnelBarWidthClass(3, 0)).toBe("w-[0%]");
    expect(stageFunnelBarWidthClass(3, -1)).toBe("w-[0%]");
    expect(stageFunnelBarWidthClass(3, Number.NaN)).toBe("w-[0%]");
    expect(stageFunnelBarWidthClass(3, Number.POSITIVE_INFINITY)).toBe("w-[0%]");
  });

  it("falls back to the zero-width class when count is non-finite", () => {
    expect(stageFunnelBarWidthClass(Number.NaN, 10)).toBe("w-[0%]");
    expect(stageFunnelBarWidthClass(Number.POSITIVE_INFINITY, 10)).toBe("w-[0%]");
  });
});
