import { readFileSync } from "node:fs";
import { classOf, parseDistance, parseMileage } from "@worker/services/importers/mileage";
import { ImportFormatError } from "@worker/services/importers/parse";
import { describe, expect, it } from "vitest";

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");

describe("mileage tracker import", () => {
  it("keeps business drives, skips the rest with reasons, and drops the total row", () => {
    const r = parseMileage(fixture("mileage-mileiq-style.csv"));
    expect(r.matched).toMatchObject({
      date: "START_DATE",
      miles: "MILES",
      classification: "CATEGORY",
      start: "START",
      end: "STOP",
    });
    expect(r.rows.map((x) => [x.line, x.date, x.milesTenths, x.startPlace, x.endPlace])).toEqual([
      [2, "2026-01-06", 124, "Home", "Goodwill - Main St"],
      [3, "2026-01-06", 121, "Goodwill - Main St", "Home"],
      [7, "2026-01-10", 32, "Home", "Post Office"],
    ]);
    expect(r.rows.every((x) => x.purpose === null && x.classification === "Business")).toBe(true);
    expect(r.skipped.map((s) => s.line)).toEqual([4, 5, 6, 8]);
    expect(r.skipped[0]?.reason).toBe("Personal trip");
    expect(r.skipped[1]?.reason).toMatch(/Not classified/);
    expect(r.skipped[2]?.reason).toMatch(/Schedule A/);
    expect(r.skipped[3]?.reason).toMatch(/No readable date/);
    expect(r.warnings.some((w) => w.includes("3 trip(s) have no business purpose"))).toBe(true);
    expect(r.unit).toBe("mi");
  });

  it("reads a purpose column that holds only a classification, with the notes as the purpose", () => {
    const r = parseMileage(fixture("mileage-everlance-style.csv"));
    expect(r.rows.map((x) => [x.line, x.milesTenths, x.purpose, x.classification])).toEqual([
      [2, 186, "Sourcing: estate sale", "Work"],
      [3, 186, null, "Work"],
      [5, 220, "Shipping supplies", "Work"],
    ]);
    expect(r.skipped).toEqual([
      { line: 4, reason: "Personal trip" },
      { line: 6, reason: 'Unreadable distance "abc"' },
    ]);
  });

  it("converts kilometres and warns when nothing says which trips were business", () => {
    const r = parseMileage(fixture("mileage-km.csv"));
    expect(r.unit).toBe("km");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      milesTenths: 100, // 16.1 km = 10.004 mi
      purpose: "Sourcing: flea market",
      startPlace: "Home",
      endPlace: "Flea market",
    });
    expect(r.skipped).toEqual([{ line: 3, reason: "No distance" }]);
    expect(r.warnings.join(" ")).toMatch(/says nothing about which trips were business/);
    expect(r.warnings.join(" ")).toMatch(/kilometres were converted/);
  });

  it("reads a unit column saying km on a Distance column", () => {
    const r = parseMileage(
      "Date,Distance,Unit,Purpose\n2026-04-01,8.05,km,Post office\n2026-04-02,5,mi,Post office\n",
    );
    expect(r.rows.map((x) => x.milesTenths)).toEqual([50, 50]);
  });

  it("refuses a file with no distance column, naming what it expected", () => {
    expect(() => parseMileage("Date,Purpose\n2026-01-01,Sourcing\n")).toThrow(ImportFormatError);
    expect(() => parseMileage("Date,Purpose\n2026-01-01,Sourcing\n")).toThrow(/no distance column/);
    expect(() => parseMileage("Miles,Purpose\n3,Sourcing\n")).toThrow(/missing required columns/);
  });

  it("parses distances and classes strictly", () => {
    expect(parseDistance("1,204.5 mi")).toBe(1204.5);
    expect(parseDistance("12 km")).toBe(12);
    expect(parseDistance("--")).toBeNull();
    expect(() => parseDistance("twelve")).toThrow();
    expect(classOf("Business")).toBe("business");
    expect(classOf(" WORK ")).toBe("business");
    expect(classOf("Commute")).toBe("commute");
    expect(classOf("Sourcing at Goodwill")).toBeNull();
  });
});
