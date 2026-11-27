import { describe, expect, it } from "vitest";
import { nestYield, sheetStockOf } from "./nest";

const sheet = (widthIn: number, lengthIn: number, gapIn = 0) => ({ widthIn, lengthIn, gapIn });

describe("nestYield", () => {
  it("fills a sheet exactly when the part divides it", () => {
    const r = nestYield(12, 24, sheet(48, 96));
    expect(r?.partsPerSheet).toBe(16);
    expect(r?.upperBound).toBe(16);
    expect(r?.utilisation).toBeCloseTo(1, 9);
  });

  it("takes either side order of the part", () => {
    expect(nestYield(24, 12, sheet(48, 96))?.partsPerSheet).toBe(16);
  });

  it("keeps the gap between parts and from both sheet edges", () => {
    // 11.5 + 0.25 pitch: 0.25 + 4 × 11.75 = 47.25 ≤ 48 across, 0.25 + 4 × 23.75 = 95.25 ≤ 96 along.
    expect(nestYield(11.5, 23.5, sheet(48, 96, 0.25))?.partsPerSheet).toBe(16);
    // 11.75 + 0.25: four across would need 48.25 in, so a plain fill is 3 × 3; the 23.75 in left
    // along the length takes one more part turned (24 across, 12 along), so at least 10 (the
    // search may find another layout of the same count).
    const r = nestYield(11.75, 23.75, sheet(48, 96, 0.25));
    expect(r?.partsPerSheet).toBe(10);
    expect(r?.blocks.reduce((n, b) => n + b.across * b.along, 0)).toBe(10);
  });

  it("does not lose a part to floating point at an exact fit", () => {
    expect(nestYield(8, 8, sheet(48, 48))?.partsPerSheet).toBe(36);
    expect(nestYield(0.1, 0.3, sheet(0.3, 0.9))?.partsPerSheet).toBe(9);
  });

  it("mixes orientations when one block beside another fits more", () => {
    // 2 × 3 parts on a 7 × 5 sheet: one plain row of three (3 in along) and two turned in the
    // 7 × 2 strip after it make 5, the area bound; either orientation alone fits 3 or 4.
    const r = nestYield(2, 3, sheet(7, 5));
    expect(r?.partsPerSheet).toBe(5);
    expect(r?.upperBound).toBe(5);
    expect(r?.blocks.reduce((n, b) => n + b.across * b.along, 0)).toBe(5);
    expect(r?.blocks.some((b) => b.turned)).toBe(true);
    expect(r?.blocks.some((b) => !b.turned)).toBe(true);
    expect(r?.utilisation).toBeCloseTo(30 / 35, 9);
  });

  it("turns the part when only the turned way fits", () => {
    // 10 × 30 on a 40 wide × 20 long sheet: the long side must run across.
    const r = nestYield(10, 30, sheet(40, 20));
    expect(r?.partsPerSheet).toBe(2);
    expect(r?.blocks).toEqual([{ across: 1, along: 2, turned: true }]);
  });

  it("is null when nothing fits or an input is missing", () => {
    expect(nestYield(50, 60, sheet(48, 48))).toBeNull();
    expect(nestYield(48, 48, sheet(48, 48, 0.1))).toBeNull();
    expect(nestYield(0, 5, sheet(48, 96))).toBeNull();
    expect(nestYield(5, 5, sheet(48, -1))).toBeNull();
    expect(nestYield(5, 5, sheet(48, 96, -0.1))).toBeNull();
    expect(nestYield(Number.NaN, 5, sheet(48, 96))).toBeNull();
    expect(nestYield(5, 5, sheet(0.1, 96, 0.1))).toBeNull();
  });

  it("never counts more than the area bound and never less than a plain fill", () => {
    // A small deterministic generator, so a failure names its case.
    let seed = 12345;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let k = 0; k < 300; k++) {
      const pw = Math.round((0.5 + rnd() * 20) * 8) / 8;
      const pl = Math.round((0.5 + rnd() * 30) * 8) / 8;
      const s = sheet(
        [36, 48, 60][k % 3] as number,
        [96, 120, 144][(k >> 1) % 3] as number,
        [0, 0.125, 0.25][k % 3] as number,
      );
      const r = nestYield(pw, pl, s);
      const pitchS = Math.min(pw, pl) + s.gapIn;
      const pitchL = Math.max(pw, pl) + s.gapIn;
      const W = s.widthIn - s.gapIn;
      const L = s.lengthIn - s.gapIn;
      const plain = Math.max(
        Math.floor(W / pitchS + 1e-9) * Math.floor(L / pitchL + 1e-9),
        Math.floor(W / pitchL + 1e-9) * Math.floor(L / pitchS + 1e-9),
      );
      if (plain === 0) {
        expect(r, `${pw}×${pl}`).toBeNull();
        continue;
      }
      expect(r?.partsPerSheet, `${pw}×${pl} on ${JSON.stringify(s)}`).toBeGreaterThanOrEqual(plain);
      expect(r?.partsPerSheet as number).toBeLessThanOrEqual(r?.upperBound as number);
      expect(r?.blocks.reduce((n, b) => n + b.across * b.along, 0)).toBe(r?.partsPerSheet);
      expect(r?.utilisation as number).toBeLessThanOrEqual(1);
    }
  });

  it("stays quick for tiny parts on a large sheet", () => {
    const t = performance.now();
    const r = nestYield(0.375, 0.5, sheet(60, 144, 0.0625));
    expect(r?.partsPerSheet).toBeGreaterThan(30_000);
    expect(performance.now() - t).toBeLessThan(2_000);
  });
});

describe("sheetStockOf", () => {
  it("needs width, length and gap, and keeps a gap of 0", () => {
    expect(sheetStockOf({ sheetWidthIn: 48, sheetLengthIn: 96, nestGapIn: 0 })).toEqual(
      sheet(48, 96, 0),
    );
    expect(sheetStockOf({ sheetWidthIn: 48, sheetLengthIn: 96, nestGapIn: null })).toBeNull();
    expect(sheetStockOf({ sheetWidthIn: null, sheetLengthIn: 96, nestGapIn: 0.1 })).toBeNull();
  });
});
