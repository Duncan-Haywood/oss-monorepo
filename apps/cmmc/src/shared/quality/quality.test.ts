import { describe, expect, it } from "vitest";
import { controlById } from "../controls";
import {
  type ClauseState,
  ISO9001_CLAUSES,
  ISO9001_SECTIONS,
  qualityClauseById,
  qualityReadiness,
  validateClauseState,
} from ".";

describe("ISO 9001:2015 clause library", () => {
  it("covers every requirement clause 4 to 10 once, in order", () => {
    const numbers = ISO9001_CLAUSES.map((c) => c.number);
    expect(numbers).toHaveLength(47);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers[0]).toBe("4.1");
    expect(numbers.at(-1)).toBe("10.3");
    // Every top-level clause of the 2015 structure is present.
    for (const n of [
      "4.1",
      "4.2",
      "4.3",
      "4.4",
      "5.1",
      "5.2",
      "5.3",
      "6.1",
      "6.2",
      "6.3",
      "7.2",
      "7.3",
      "7.4",
      "8.1",
      "8.3",
      "8.6",
      "8.7",
      "9.2",
      "9.3",
      "10.1",
      "10.2",
      "10.3",
    ]) {
      expect(numbers, n).toContain(n);
    }
    // Sorted numerically, part by part.
    const key = (n: string) =>
      n
        .split(".")
        .map((p) => p.padStart(3, "0"))
        .join(".");
    expect([...numbers].sort((a, b) => key(a).localeCompare(key(b)))).toEqual(numbers);
    for (const c of ISO9001_CLAUSES) {
      expect(ISO9001_SECTIONS[c.section]).toBeTruthy();
      expect(c.prompt.length).toBeGreaterThan(20);
      expect(qualityClauseById(c.id)).toBe(c);
    }
  });

  it("points only at CMMC requirements that exist", () => {
    for (const c of ISO9001_CLAUSES) {
      for (const id of c.relatedControls)
        expect(controlById(id), `${c.number} -> ${id}`).toBeTruthy();
    }
  });

  it("marks design (8.3) as the clause small shops most often exclude", () => {
    expect(ISO9001_CLAUSES.filter((c) => c.oftenExcluded).map((c) => c.number)).toEqual(["8.3"]);
  });
});

describe("validateClauseState", () => {
  it("needs a reason before a clause is marked not applicable", () => {
    expect(validateClauseState("not_applicable", "")).toHaveLength(1);
    expect(validateClauseState("not_applicable", "We build to customer print only.")).toEqual([]);
    expect(validateClauseState("gap", "")).toEqual([]);
  });
});

describe("qualityReadiness", () => {
  const st = (status: ClauseState["status"], evidenceCount = 0): ClauseState => ({
    status,
    notes: "",
    evidenceCount,
  });

  it("is empty before any answer", () => {
    const r = qualityReadiness(new Map());
    expect(r.total).toBe(ISO9001_CLAUSES.length);
    expect(r.notAssessed).toBe(r.total);
    expect(r.percentInPlace).toBeNull();
    expect(r.openItems).toEqual([]);
  });

  it("counts partial as half, leaves exclusions out, and lists the work", () => {
    const clauses = ISO9001_CLAUSES.filter((c) => ["4.1", "4.2", "4.3", "8.3"].includes(c.number));
    const states = new Map<string, ClauseState>([
      ["iso9001-4.1", st("in_place", 2)],
      ["iso9001-4.2", st("partial")],
      ["iso9001-4.3", st("in_place")],
      ["iso9001-8.3", st("not_applicable")],
    ]);
    const r = qualityReadiness(states, clauses);
    expect(r).toMatchObject({
      total: 4,
      applicable: 3,
      inPlace: 2,
      partial: 1,
      notApplicable: 1,
      // (2 + 0.5) / 3 = 83.3%
      percentInPlace: 83,
      openItems: ["4.2"],
      inPlaceWithoutEvidence: ["4.3"],
    });
    expect(r.sections.map((s) => [s.section, s.applicable])).toEqual([
      ["4", 3],
      ["8", 0],
    ]);
  });

  it("never rounds up to 100 while a clause is open", () => {
    const states = new Map<string, ClauseState>(
      ISO9001_CLAUSES.map((c) => [c.id, st("in_place", 1)]),
    );
    states.set("iso9001-10.3", st("partial"));
    expect(qualityReadiness(states).percentInPlace).toBe(98);
  });

  it("lists open items nobody owns, and leaves owned and closed ones out", () => {
    const clauses = ISO9001_CLAUSES.filter((c) =>
      ["7.2", "7.5.3", "8.4.1", "9.2", "10.2"].includes(c.number),
    );
    const states = new Map<string, ClauseState>([
      ["iso9001-7.2", { ...st("gap"), ownerUserId: "usr_a" }],
      ["iso9001-7.5.3", st("gap")],
      ["iso9001-8.4.1", { ...st("partial"), ownerUserId: null }],
      ["iso9001-9.2", st("in_place", 1)],
      // 10.2 is not assessed: not yet open work, so not listed.
    ]);
    const r = qualityReadiness(states, clauses);
    expect(r.openItems).toEqual(["7.2", "7.5.3", "8.4.1"]);
    expect(r.openWithoutOwner).toEqual(["7.5.3", "8.4.1"]);
  });
});
