import { describe, expect, it } from "vitest";
import { bandFor, formatZone, readTolerances, toleranceNote } from "./tolerance";

const zones = (text: string) => readTolerances(text).reads.map((r) => [r.kind, r.zoneIn]);

describe("readTolerances", () => {
  it("reads bilateral tolerances in the ways drawings and emails write them", () => {
    expect(zones("+/- .005 unless noted")).toEqual([["bilateral", 0.01]]);
    expect(zones("±0.0005 on the bore")).toEqual([["bilateral", 0.001]]);
    expect(zones("+- .001")).toEqual([["bilateral", 0.002]]);
    expect(zones('± .002"')).toEqual([["bilateral", 0.004]]);
    expect(zones("+ / - 0.01 in")).toEqual([["bilateral", 0.02]]);
  });

  it("reads a title block's tolerance list in order, and finds the tightest", () => {
    const s = readTolerances("X.X ±.03  X.XX ±.01  X.XXX ±.005  angles ±0.5°");
    expect(s.reads.map((r) => r.text)).toEqual(["±.03", "±.01", "±.005"]);
    expect(s.tightest?.text).toBe("±.005");
    expect(s.tightest?.band).toBe("standard");
  });

  it("reads unequal limits as their full zone, and does not read them again as bilateral", () => {
    expect(zones("Ø.5000 +.0005/-.0000")).toEqual([["unequal", 0.0005]]);
    expect(zones("+.002/-.000")).toEqual([["unequal", 0.002]]);
    expect(zones("-0.000 +0.002")).toEqual([["unequal", 0.002]]);
    expect(zones("+0.1/-0.05 mm")).toEqual([["unequal", 0.0059055]]);
  });

  it("reads millimetres and microns, with a comma decimal", () => {
    expect(zones("±0,02 mm")).toEqual([["bilateral", 0.0015748]]);
    expect(zones("±0.1mm")).toEqual([["bilateral", 0.007874]]);
    expect(zones("±5 µm")).toEqual([["bilateral", 0.0003937]]);
    // A unitless number takes the text's millimetres when the text says mm and never inches.
    expect(zones("Allgemeintoleranz ±0,1, Bohrung ±0,01 mm")).toEqual([
      ["bilateral", 0.007874],
      ["bilateral", 0.0007874],
    ]);
  });

  it("skips angles", () => {
    expect(zones("±1°")).toEqual([]);
    expect(zones("± 0.5 deg")).toEqual([]);
  });

  it("reads an ISO 2768 general class at its 6-30 mm value, flagged as a size assumption", () => {
    const s = readTolerances("General tolerances ISO 2768-mK");
    expect(s.reads).toHaveLength(1);
    expect(s.tightest).toMatchObject({ kind: "general", sizeAssumed: true, band: "standard" });
    expect(s.tightest?.zoneIn).toBe(0.015748);
    expect(readTolerances("ISO 2768 f").tightest?.band).toBe("close");
  });

  it("reads ISO 286 fits at their 18-30 mm zone, not threads, roughness grades or revisions", () => {
    const s = readTolerances("Bore H7/g6, pin h6");
    expect(s.reads.map((r) => [r.text, r.band])).toEqual([
      ["H7", "precision"],
      ["g6", "precision"],
      ["h6", "precision"],
    ]);
    expect(readTolerances("Slot H11").tightest?.band).toBe("close");
    expect(zones("M6x1 thread, M8 x 1.25, Rev H2, surface N7, 1/4-20")).toEqual([]);
    expect(zones("Bore H7.")).toHaveLength(1);
  });

  it("reads a fit at the nominal size the callout gives (ISO 286-1 table 1)", () => {
    const at = (t: string) => readTolerances(t).tightest;
    // H7: 15 µm over 6 up to 10 mm, 25 µm over 30 up to 50, 63 µm over 400 up to 500.
    expect(at("Ø8 H7")).toMatchObject({ text: "Ø8 H7", sizeMm: 8, grade: 7, sizeAssumed: false });
    expect(at("Ø8 H7")?.zoneIn).toBe(Math.round((0.015 / 25.4) * 1e7) / 1e7);
    expect(at("40H7")?.zoneIn).toBe(Math.round((0.025 / 25.4) * 1e7) / 1e7);
    expect(at("DIA 450 g6")?.zoneIn).toBe(Math.round((0.04 / 25.4) * 1e7) / 1e7);
    // A range's upper limit belongs to it: 30 mm is "over 18 up to 30".
    expect(at("Ø30 H7")?.zoneIn).toBe(at("H7")?.zoneIn);
    // A small bore is tighter than the 18-30 mm assumption: 10 µm at 3 mm for H7.
    expect(at("Ø3 H7")?.zoneIn).toBe(Math.round((0.01 / 25.4) * 1e7) / 1e7);
    // Inch sizes: marked, or written inch-style (two or more decimals) in an inch text.
    expect(at('Ø.750" H7')?.sizeMm).toBeCloseTo(19.05, 6);
    expect(at("Ø.750 H7")?.sizeMm).toBeCloseTo(19.05, 6);
    expect(at("Ø12.5 h6")?.sizeMm).toBe(12.5);
    // Past the table, not a fit; a standard's number is not a size.
    expect(at("Ø600 H7")).toBeNull();
    expect(at("ISO 286 H7")).toMatchObject({ text: "H7", sizeMm: null, sizeAssumed: true });
    // Threads and part numbers glued to letters are still not fits.
    expect(zones("M6x1 6H, BRK20H7")).toEqual([]);
  });

  it("reads limit dimensions written as two sizes", () => {
    expect(zones(".4995/.5000")).toEqual([["limits", 0.0005]]);
    expect(zones("Bore 1.2500 - 1.2510")).toEqual([["limits", 0.001]]);
    expect(zones("12.000-12.010 mm")).toEqual([["limits", 0.0003937]]);
    expect(zones("1.250 TO 1.255")).toEqual([["limits", 0.005]]);
    // Different decimals, far apart or single-decimal values are not limits.
    expect(zones(".500/.5005")).toEqual([]);
    expect(zones("2.50/7.50")).toEqual([]);
    expect(zones("1.5-1.6")).toEqual([]);
    // Unequal limits stay unequal, not read again as two sizes.
    expect(zones("+.002/-.000")).toEqual([["unequal", 0.002]]);
  });

  it("returns nothing for empty, missing or tolerance-free text", () => {
    expect(readTolerances(null)).toEqual({ reads: [], tightest: null });
    expect(readTolerances("")).toEqual({ reads: [], tightest: null });
    expect(readTolerances("per drawing")).toEqual({ reads: [], tightest: null });
    expect(readTolerances("Qty 10 - 20 pcs, 6061-T6")).toEqual({ reads: [], tightest: null });
  });
});

describe("bands", () => {
  it("puts each zone in its band at the edges", () => {
    expect(bandFor(0.01)).toBe("standard"); // ±.005
    expect(bandFor(0.0099)).toBe("close");
    expect(bandFor(0.002)).toBe("close"); // ±.001
    expect(bandFor(0.0019)).toBe("tight");
    expect(bandFor(0.001)).toBe("tight"); // ±.0005
    expect(bandFor(0.0009)).toBe("precision");
  });

  it("puts ±.0005 exactly on the tight edge despite float sums", () => {
    expect(readTolerances("±.0005").tightest?.band).toBe("tight");
    expect(readTolerances("+.0007/-.0003").tightest?.band).toBe("tight");
  });
});

describe("toleranceNote", () => {
  it("names the tightest, its zone in both units and what to check", () => {
    const note = toleranceNote("X.XX ±.01, bore ±.0005");
    expect(note?.band).toBe("tight");
    expect(note?.line).toBe("Tight: ±.0005, a 0.0010 in (0.025 mm) zone (tightest of 2 read).");
    expect(note?.advice).toMatch(/run time/);
  });

  it("says when the zone assumes a size", () => {
    expect(toleranceNote("H7")?.line).toBe(
      "Precision: H7, a 0.00083 in (0.021 mm) zone, for an 18-30 mm feature (ISO 286).",
    );
    expect(toleranceNote("ISO 2768-m")?.line).toContain("for a 6-30 mm feature (ISO 2768-1)");
  });

  it("names the size range when the callout gives the size", () => {
    expect(toleranceNote("Ø40 H7")?.line).toBe(
      "Precision: Ø40 H7, a 0.00098 in (0.025 mm) zone, IT7 for 30-50 mm (ISO 286).",
    );
    expect(toleranceNote(".4995/.5000")?.line).toBe(
      "Precision: .4995/.5000, a 0.00050 in (0.013 mm) zone.",
    );
  });

  it("is null when nothing is read", () => {
    expect(toleranceNote("see drawing")).toBeNull();
  });

  it("formats zones", () => {
    expect(formatZone(0.01)).toBe("0.0100 in (0.25 mm)");
    expect(formatZone(0.0005)).toBe("0.00050 in (0.013 mm)");
  });
});
