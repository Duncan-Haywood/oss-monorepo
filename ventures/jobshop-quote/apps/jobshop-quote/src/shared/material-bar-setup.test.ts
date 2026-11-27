// Material price lists, part 2: a per-foot row's bar setup edited in place. The note a draft line
// shows when the card's setup changed since it was priced, and the edit form's blank check.
import { describe, expect, it } from "vitest";
import type { RateMaterial } from "./costing";
import {
  barSetupMoved,
  barSetupNote,
  barSetupText,
  blankCheckText,
  blankUseText,
  lineMaterialNotes,
} from "./material-bar-setup";

const bar: RateMaterial = {
  id: "crs",
  name: "1018 CRS 1 in round",
  pricingBasis: "per_ft",
  pricePerLbCents: null,
  densityLbPerIn3: null,
  stockPriceCents: null,
  stockDescription: "1 in round",
  pricePerFootCents: 420,
  cutAllowanceIn: 0.125,
  barLengthIn: 144,
  barRemnantIn: 3,
  scrapBps: 500,
  minChargeCents: 0,
};

describe("barSetupMoved", () => {
  it("is false for the same setup and for spellings the engine prices the same", () => {
    expect(barSetupMoved(bar, { ...bar })).toBe(false);
    // Scrap % does not price a line with a bar length (the drop is in the whole-bar count).
    expect(barSetupMoved(bar, { ...bar, scrapBps: 0 })).toBe(false);
    const noBar = { ...bar, barLengthIn: null, barRemnantIn: null, cutAllowanceIn: null };
    expect(barSetupMoved(noBar, { ...noBar, cutAllowanceIn: 0 })).toBe(false);
    // A remnant left on a row with no bar length is never read.
    expect(barSetupMoved(noBar, { ...noBar, barRemnantIn: 4 })).toBe(false);
    // Snapshots from before per-foot pricing have no bar fields at all.
    const { cutAllowanceIn: _a, barLengthIn: _b, barRemnantIn: _r, ...bare } = noBar;
    expect(barSetupMoved(bare, noBar)).toBe(false);
  });

  it("is true when the allowance, bar, remnant or (without a bar) scrap changes", () => {
    expect(barSetupMoved(bar, { ...bar, cutAllowanceIn: 0.1875 })).toBe(true);
    expect(barSetupMoved(bar, { ...bar, barLengthIn: 240 })).toBe(true);
    expect(barSetupMoved(bar, { ...bar, barRemnantIn: 0 })).toBe(true);
    expect(barSetupMoved(bar, { ...bar, barLengthIn: null })).toBe(true);
    const noBar = { ...bar, barLengthIn: null };
    expect(barSetupMoved(noBar, { ...noBar, scrapBps: 800 })).toBe(true);
  });

  it("leaves other bases and basis changes to the price note", () => {
    const lb = { ...bar, pricingBasis: "per_lb" as const };
    expect(barSetupMoved(lb, { ...lb, cutAllowanceIn: 1 })).toBe(false);
    expect(barSetupMoved(bar, lb)).toBe(false);
  });
});

describe("barSetupText", () => {
  it("says the setup the way the Materials card does", () => {
    expect(barSetupText(bar)).toBe("0.125 in cut allowance, 144 in bars (3 in remnant)");
    expect(barSetupText({ ...bar, barRemnantIn: 0 })).toBe("0.125 in cut allowance, 144 in bars");
    expect(barSetupText({ ...bar, cutAllowanceIn: null, barLengthIn: null })).toBe(
      "no cut allowance, by length used plus 5% scrap",
    );
    expect(barSetupText({ ...bar, barLengthIn: null, scrapBps: 0 })).toBe(
      "0.125 in cut allowance, by length used",
    );
  });
});

describe("blank check", () => {
  it("counts parts per bar with the engine's arithmetic", () => {
    // 2.875 + 0.125 = 3 in a part; 141 in usable: 47 parts.
    expect(blankUseText(bar, 2.875)).toBe("3 in per part, 47 parts per bar");
    // An exact fit is not lost to float error: 144 in / 3 in = 48.
    expect(blankUseText({ ...bar, barRemnantIn: 0 }, 2.875)).toBe(
      "3 in per part, 48 parts per bar",
    );
    expect(blankUseText(bar, 141)).toBe(
      "141.125 in per part, longer than the usable bar (the price is blocked)",
    );
    expect(blankUseText({ ...bar, barLengthIn: null }, 2)).toBe(
      "2.125 in per part, charged by length used",
    );
  });

  it("compares the card's setup with the form's", () => {
    expect(blankCheckText(bar, { ...bar, cutAllowanceIn: 0.1875 }, 2.875)).toBe(
      "A 2.875 in blank: 3 in per part, 47 parts per bar now; 3.0625 in per part, 46 parts per bar with these settings.",
    );
    expect(blankCheckText(bar, { ...bar }, 2.875)).toBe(
      "A 2.875 in blank: 3 in per part, 47 parts per bar, unchanged.",
    );
    expect(blankCheckText(bar, bar, 0)).toBeNull();
    expect(blankCheckText(bar, bar, Number.NaN)).toBeNull();
  });
});

describe("draft-line notes", () => {
  const card = [{ ...bar, priceSetAt: new Date().toISOString(), cutAllowanceIn: 0.1875 }];
  const line = {
    inputs: { material: { materialId: "crs" } },
    snapshot: { materials: [bar] },
  };

  it("says the setup the line was priced with and the card's now", () => {
    expect(lineMaterialNotes(line, card, 90, new Date(), "USD")).toEqual([
      "This line was priced with 1018 CRS 1 in round at 0.125 in cut allowance, 144 in bars (3 in remnant); the rate card now has 0.1875 in cut allowance, 144 in bars (3 in remnant). Re-price to use it.",
    ]);
  });

  it("follows the price note when both moved, and says nothing when neither did", () => {
    const both = [{ ...card[0], pricePerFootCents: 455 }] as typeof card;
    const notes = lineMaterialNotes(line, both, 90, new Date(), "USD");
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatch(/at \$4\.20\/ft; the rate card now has \$4\.55\/ft/);
    expect(notes[1]).toMatch(/^This line was priced with .* 0\.125 in cut allowance/);
    const same = [{ ...bar, priceSetAt: new Date().toISOString() }];
    expect(lineMaterialNotes(line, same, 90, new Date(), "USD")).toEqual([]);
    // No snapshot (never priced) or another material: nothing to compare.
    expect(barSetupNote(bar.name, undefined, bar)).toBeNull();
    expect(lineMaterialNotes({ ...line, snapshot: null }, card, 90, new Date(), "USD")).toEqual([]);
  });
});
