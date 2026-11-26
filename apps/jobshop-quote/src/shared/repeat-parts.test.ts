import { describe, expect, it } from "vitest";
import type { CostInputs } from "./costing";
import {
  copyInputs,
  hasNoCostInputs,
  isLookupablePartNumber,
  type PrefillCandidate,
  partNumberKey,
  pickPrefillSource,
  prefillLabelStale,
  prefillSource,
  revisionMatchesForPrefill,
  sameRevision,
  shouldPrefillOnSave,
  wonAtOtherRevision,
} from "./repeat-parts";

describe("repeat parts", () => {
  it("compares part numbers by case and spacing, never by dropping characters", () => {
    expect(partNumberKey(" brk-1001 ")).toBe("BRK-1001");
    expect(partNumberKey("BRK  1001")).toBe("BRK 1001");
    expect(partNumberKey("ABC-100")).not.toBe(partNumberKey("ABC100"));
    expect(partNumberKey("ABC-10")).not.toBe(partNumberKey("ABC-100"));
  });

  it("does not look up empty or placeholder part numbers", () => {
    expect(isLookupablePartNumber("")).toBe(false);
    expect(isLookupablePartNumber("  ")).toBe(false);
    expect(isLookupablePartNumber("New part")).toBe(false);
    expect(isLookupablePartNumber("BRK-1001")).toBe(true);
  });

  it("copies the cost inputs with this line's quantities, as a fresh object", () => {
    const past: CostInputs = {
      quantities: [10, 50],
      customerSuppliedMaterial: false,
      material: { materialId: "mat_1", blank: null, partsPerStock: 4 },
      operations: [{ machineId: "mch_1", label: "OP10", setupMinutes: 45, cycleMinutesPerPart: 3 }],
      finishing: [{ opId: "fin_1" }],
      extras: [{ label: "Cert", perPartCents: 0, lotCents: 2_500 }],
    };
    const out = copyInputs(past, { quantities: [25] });
    expect(out).toEqual({ ...past, quantities: [25] });
    out.operations[0] = { ...past.operations[0], setupMinutes: 1 } as CostInputs["operations"][0];
    expect(past.operations[0]?.setupMinutes).toBe(45);
    expect(past.quantities).toEqual([10, 50]);
  });

  it("says whether revisions match only when both lines have one", () => {
    expect(sameRevision("b", "B")).toBe(true);
    expect(sameRevision("B", "C")).toBe(false);
    expect(sameRevision(null, "C")).toBeNull();
    expect(sameRevision("B", " ")).toBeNull();
  });
});

describe("pre-fill from the last won quote (repeat parts, part 2)", () => {
  const inputs = (machineId: string): CostInputs => ({
    quantities: [10],
    customerSuppliedMaterial: true,
    material: null,
    operations: [{ machineId, label: "", setupMinutes: 30, cycleMinutesPerPart: 4 }],
    finishing: [],
    extras: [],
  });
  const cand = (over: Partial<PrefillCandidate>): PrefillCandidate => ({
    lineId: "qln_a",
    quoteId: "quo_a",
    quoteNumber: 1001,
    revNumber: 1,
    customerCompany: "Example Robotics LLC",
    partNumber: "BRK-1001",
    revision: "B",
    wonAt: new Date("2026-10-01T12:00:00Z"),
    decidedAt: new Date("2026-10-01T12:00:00Z"),
    inputs: inputs("m1"),
    ...over,
  });

  it("matches revisions strictly: both blank is the same part, one blank is not", () => {
    expect(revisionMatchesForPrefill("B", " b ")).toBe(true);
    expect(revisionMatchesForPrefill(null, "  ")).toBe(true);
    expect(revisionMatchesForPrefill(null, "B")).toBe(false);
    expect(revisionMatchesForPrefill("B", "C")).toBe(false);
  });

  it("picks the newest won line of the same part number and revision", () => {
    const older = cand({ lineId: "old", decidedAt: new Date("2026-09-01T00:00:00Z") });
    const newer = cand({ lineId: "new", quoteNumber: 1005 });
    const otherRev = cand({ lineId: "revc", revision: "C", decidedAt: new Date("2026-11-01") });
    const otherPart = cand({ lineId: "spc", partNumber: "SPC-220" });
    const pick = pickPrefillSource({ partNumber: " brk-1001", revision: "b" }, [
      older,
      otherRev,
      newer,
      otherPart,
    ]);
    expect(pick?.lineId).toBe("new");
    expect(
      pickPrefillSource({ partNumber: "BRK-1001", revision: "C" }, [older, otherRev])?.lineId,
    ).toBe("revc");
    expect(
      pickPrefillSource({ partNumber: "BRK-1001", revision: null }, [older, newer]),
    ).toBeNull();
  });

  it("breaks a tie on the decision time by quote number, then revision", () => {
    const a = cand({ lineId: "a", quoteNumber: 1001, revNumber: 2 });
    const b = cand({ lineId: "b", quoteNumber: 1001, revNumber: 3 });
    const c = cand({ lineId: "c", quoteNumber: 1000, revNumber: 9 });
    expect(pickPrefillSource({ partNumber: "BRK-1001", revision: "B" }, [a, c, b])?.lineId).toBe(
      "b",
    );
  });

  it("never pre-fills a blank or placeholder part number", () => {
    const blank = cand({ partNumber: "New part" });
    expect(pickPrefillSource({ partNumber: null, revision: "B" }, [blank])).toBeNull();
    expect(pickPrefillSource({ partNumber: "new part", revision: "B" }, [blank])).toBeNull();
  });

  it("labels the source with the won day, or null when it was never recorded", () => {
    expect(prefillSource(cand({}))).toEqual({
      lineId: "qln_a",
      quoteId: "quo_a",
      quoteNumber: 1001,
      revNumber: 1,
      customerCompany: "Example Robotics LLC",
      wonOn: "2026-10-01",
    });
    expect(prefillSource(cand({ wonAt: null })).wonOn).toBeNull();
  });
});

describe("pre-fill a line added by hand (repeat parts, part 3)", () => {
  const blank: CostInputs = {
    quantities: [10],
    customerSuppliedMaterial: false,
    material: null,
    operations: [],
    finishing: [],
    extras: [],
  };

  it("treats a line as blank only when nothing beyond its quantities was entered", () => {
    expect(hasNoCostInputs(blank)).toBe(true);
    expect(hasNoCostInputs({ ...blank, quantities: [1, 50, 500] })).toBe(true);
    expect(hasNoCostInputs({ ...blank, customerSuppliedMaterial: true })).toBe(false);
    expect(
      hasNoCostInputs({
        ...blank,
        material: { materialId: "al", blank: null, partsPerStock: null },
      }),
    ).toBe(false);
    expect(
      hasNoCostInputs({
        ...blank,
        operations: [{ machineId: "vmc", label: "", setupMinutes: 0, cycleMinutesPerPart: 1 }],
      }),
    ).toBe(false);
    expect(hasNoCostInputs({ ...blank, finishing: [{ opId: "anod" }] })).toBe(false);
  });

  it("pre-fills when a blank line gets a part number it did not have", () => {
    const fresh = { partNumber: "New part", prefilled: false };
    expect(shouldPrefillOnSave(fresh, { partNumber: "BRK-1001", inputs: blank })).toBe(true);
    // Added through the API with a part number straight away.
    expect(
      shouldPrefillOnSave(
        { partNumber: "", prefilled: false },
        { partNumber: "BRK-1001", inputs: blank },
      ),
    ).toBe(true);
    // A line from an RFQ part with no part number ("Part 1") is the same case.
    expect(
      shouldPrefillOnSave(
        { partNumber: "Part 1", prefilled: false },
        { partNumber: "BRK-1001", inputs: blank },
      ),
    ).toBe(true);
  });

  it("never pre-fills over typed inputs, twice, or on the same part number", () => {
    const fresh = { partNumber: "New part", prefilled: false };
    expect(
      shouldPrefillOnSave(fresh, {
        partNumber: "BRK-1001",
        inputs: { ...blank, finishing: [{ opId: "anod" }] },
      }),
    ).toBe(false);
    expect(
      shouldPrefillOnSave(
        { partNumber: "New part", prefilled: true },
        { partNumber: "BRK-1001", inputs: blank },
      ),
    ).toBe(false);
    // Re-saving the same part (case and spacing ignored) keeps a line cleared on purpose blank.
    expect(
      shouldPrefillOnSave(
        { partNumber: "BRK-1001", prefilled: false },
        { partNumber: " brk-1001", inputs: blank },
      ),
    ).toBe(false);
    // Placeholder and blank part numbers are never looked up.
    expect(shouldPrefillOnSave(fresh, { partNumber: "new part ", inputs: blank })).toBe(false);
    expect(shouldPrefillOnSave(fresh, { partNumber: "  ", inputs: blank })).toBe(false);
  });
});

describe("a stale label and a part won at another revision (repeat parts, part 4)", () => {
  it("calls the label stale when the part number or revision changes, not on case or spacing", () => {
    const at = (partNumber: string, revision: string | null) => ({ partNumber, revision });
    expect(prefillLabelStale(at("BRK-1001", "B"), at(" brk-1001", "b"))).toBe(false);
    expect(prefillLabelStale(at("BRK-1001", null), at("BRK-1001", "  "))).toBe(false);
    expect(prefillLabelStale(at("BRK-1001", "B"), at("BRK-1002", "B"))).toBe(true);
    expect(prefillLabelStale(at("BRK-1001", "B"), at("BRK-1001", "C"))).toBe(true);
    expect(prefillLabelStale(at("BRK-1001", null), at("BRK-1001", "A"))).toBe(true);
    expect(prefillLabelStale(at("BRK-1001", "A"), at("BRK-1001", null))).toBe(true);
  });

  it("names the newest won quote at another revision only when none was won at this one", () => {
    const h = (id: string, status: string, revision: string | null) => ({ id, status, revision });
    const history = [h("q4", "lost", "C"), h("q3", "won", "B"), h("q2", "won", "A")];
    const free = { prefilled: false };
    expect(wonAtOtherRevision({ ...free, revision: "C" }, history)?.id).toBe("q3");
    expect(wonAtOtherRevision({ ...free, revision: null }, history)?.id).toBe("q3");
    // Won at this revision (case and spaces aside): nothing to warn about.
    expect(wonAtOtherRevision({ ...free, revision: " a" }, history)).toBeNull();
    // Never won at all, or the line already names its source.
    expect(wonAtOtherRevision({ ...free, revision: "C" }, [h("q4", "lost", "B")])).toBeNull();
    expect(wonAtOtherRevision({ prefilled: true, revision: "C" }, history)).toBeNull();
    // A won line with no revision is a different revision from C.
    expect(wonAtOtherRevision({ ...free, revision: "C" }, [h("q1", "won", null)])?.id).toBe("q1");
  });
});
