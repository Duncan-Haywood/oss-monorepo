// The formula guard on CSV cells: text a spreadsheet would run is defused, a plain number is not.
import { describe, expect, it } from "vitest";
import { csvCell } from "./csv";

describe("csvCell", () => {
  it("prefixes every formula trigger with an apostrophe", () => {
    for (const s of ["=1+1", "+cmd", "-2+3", "@SUM(A1)", "\tx", "\rx"]) {
      expect(csvCell(s).replace(/^"|"$/g, "")).toBe(`'${s}`);
    }
  });

  it("lets a plain negative or signed-free number through as a number", () => {
    expect(csvCell("-12.50")).toBe("-12.50");
    expect(csvCell("-3")).toBe("-3");
    expect(csvCell(-12.5)).toBe("-12.5");
  });

  it("quotes commas and quotes (RFC 4180)", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell(null)).toBe("");
  });
});
