import { describe, expect, it } from "vitest";
import { defaultTagline } from "./default-tagline";

describe("defaultTagline", () => {
  it("gives each business category its own distinct default", () => {
    expect(defaultTagline("restaurant")).toBe("Local favorites made fresh daily");
    expect(defaultTagline("salon")).toBe("Tailored styling and care");
    expect(defaultTagline("trades")).toBe("Professional services you can count on");
    expect(defaultTagline("generic")).toBe("Your neighborhood business, online");
  });

  it("never gives generic the restaurant default", () => {
    expect(defaultTagline("generic")).not.toBe(defaultTagline("restaurant"));
  });
});
