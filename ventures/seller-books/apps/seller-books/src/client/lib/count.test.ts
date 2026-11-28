import { describe, expect, it } from "vitest";
import { count } from "./count";

describe("count", () => {
  it("uses the singular for exactly one", () => {
    expect(count(1, "order")).toBe("1 order");
    expect(count(1, "business trip")).toBe("1 business trip");
  });
  it("uses the plural for zero and more than one", () => {
    expect(count(0, "sale")).toBe("0 sales");
    expect(count(3, "row")).toBe("3 rows");
  });
  it("takes an irregular plural", () => {
    expect(count(2, "other charge")).toBe("2 other charges");
    expect(count(2, "entry", "entries")).toBe("2 entries");
  });
});
