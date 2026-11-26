import { describe, expect, it } from "vitest";
import { queryTerms, splitHighlights } from "./highlight";
import { centsToDollarInput, parseDollarsToCents } from "./labels";

describe("money helpers", () => {
  it("parses dollars to integer cents", () => {
    expect(parseDollarsToCents("$12,500.50")).toBe(1250050);
    expect(parseDollarsToCents("150000")).toBe(15000000);
    expect(parseDollarsToCents("1.5")).toBe(150);
    expect(parseDollarsToCents("  ")).toBeNull();
    expect(parseDollarsToCents("12.345")).toBeNaN();
    expect(parseDollarsToCents("-5")).toBeNaN();
  });
  it("formats cents for inputs", () => {
    expect(centsToDollarInput(1250050)).toBe("12500.50");
    expect(centsToDollarInput(15000000)).toBe("150000");
    expect(centsToDollarInput(null)).toBe("");
  });
});

describe("highlight", () => {
  it("extracts terms and marks case-insensitive matches", () => {
    expect(queryTerms("How many trades graduates?")).toEqual(["graduates", "trades", "many"]);
    expect(splitHighlights("Trades graduates in Gallup", ["graduates", "trades"])).toEqual([
      { text: "Trades", match: true },
      { text: " ", match: false },
      { text: "graduates", match: true },
      { text: " in Gallup", match: false },
    ]);
  });
});
