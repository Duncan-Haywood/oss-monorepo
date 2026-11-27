import { describe, expect, it } from "vitest";
import {
  centsToDecimal,
  formatBps,
  formatCents,
  parseDollarsToCents,
  parsePercentToBps,
} from "./money";

describe("money", () => {
  it("formats cents", () => {
    expect(formatCents(123_456)).toBe("$1,234.56");
    expect(formatCents(-5)).toBe("-$0.05");
    expect(centsToDecimal(123_456)).toBe("1234.56");
    expect(centsToDecimal(-5)).toBe("-0.05");
    expect(centsToDecimal(0)).toBe("0.00");
  });

  it("parses dollars", () => {
    expect(parseDollarsToCents("$1,234.5")).toBe(123_450);
    expect(parseDollarsToCents("20")).toBe(2000);
    expect(parseDollarsToCents("-20.01")).toBe(-2001);
    expect(parseDollarsToCents("(1,000.00)")).toBe(-100_000);
    expect(parseDollarsToCents(".5")).toBe(50);
    expect(parseDollarsToCents("1.234")).toBeNull();
    expect(parseDollarsToCents("abc")).toBeNull();
    expect(parseDollarsToCents("")).toBeNull();
  });

  it("formats and parses percentages as basis points", () => {
    expect(formatBps(1000)).toBe("10%");
    expect(formatBps(750)).toBe("7.5%");
    expect(formatBps(1234)).toBe("12.34%");
    expect(parsePercentToBps("10")).toBe(1000);
    expect(parsePercentToBps("7.5%")).toBe(750);
    expect(parsePercentToBps("101")).toBeNull();
    expect(parsePercentToBps("-1")).toBeNull();
  });
});
