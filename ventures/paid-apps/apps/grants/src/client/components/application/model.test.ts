import { describe, expect, it } from "vitest";
import { paragraphFromText, splitSentences } from "./edit-model";
import {
  citationNumbers,
  claimIssue,
  formatMicros,
  readGuide,
  safeExternalUrl,
  sortFlags,
  tierReasonSentences,
} from "./model";
import { CONTENT, makeFlag } from "./test-fixtures";

describe("model helpers", () => {
  it("turns the tier reason into plain sentences", () => {
    expect(
      tierReasonSentences("ask is above the limit; 2 blocking flags must be resolved"),
    ).toEqual(["Ask is above the limit.", "2 blocking flags must be resolved."]);
    expect(tierReasonSentences(null)).toEqual([]);
  });

  it("formats micro-USD as dollars", () => {
    expect(formatMicros(420_000)).toBe("$0.42");
    expect(formatMicros(12_500_000)).toBe("$12.50");
    expect(formatMicros(4_200)).toBe("$0.0042");
    expect(formatMicros(0)).toBe("$0.00");
  });

  it("only allows http(s) links", () => {
    expect(safeExternalUrl("https://grants.gov/x")).toBe("https://grants.gov/x");
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("not a url")).toBeNull();
  });

  it("numbers citations by first appearance", () => {
    expect([...citationNumbers(CONTENT).entries()]).toEqual([
      ["fct_1", 1],
      ["fct_2", 2],
    ]);
  });

  it("puts open blockers first, then warnings, then resolved flags", () => {
    const sorted = sortFlags([
      makeFlag({ id: "a", severity: "info" }),
      makeFlag({ id: "b", severity: "blocker", status: "resolved" }),
      makeFlag({ id: "c", severity: "warning" }),
      makeFlag({ id: "d", severity: "blocker" }),
    ]);
    expect(sorted.map((f) => f.id)).toEqual(["d", "c", "a", "b"]);
  });

  it("flags unsupported claims and number mismatches red, partial support amber", () => {
    const base = { claimId: "x", reason: "", unmatchedNumbers: [], unconfirmedFactIds: [] };
    expect(claimIssue({ ...base, verdict: "supported" })).toBeNull();
    expect(claimIssue({ ...base, verdict: "unsupported", reason: "No fact says so." })).toEqual({
      level: "danger",
      reason: "No fact says so.",
    });
    expect(claimIssue({ ...base, verdict: "supported", unmatchedNumbers: ["120"] })?.level).toBe(
      "danger",
    );
    expect(claimIssue({ ...base, verdict: "partially_supported" })?.level).toBe("warning");
  });

  it("reads a manual guide defensively", () => {
    expect(readGuide(null)).toBeNull();
    expect(readGuide({ guide: { title: "T", steps: ["a", 3, "b"] } })).toEqual({
      method: "unknown",
      title: "T",
      url: null,
      steps: ["a", "b"],
      notes: [],
    });
  });
});

describe("edit model", () => {
  it("splits sentences without breaking abbreviations or decimals", () => {
    expect(
      splitSentences("The U.S. Department of Labor funds 2.5 million. We train youth! Done"),
    ).toEqual(["The U.S. Department of Labor funds 2.5 million.", "We train youth!", "Done"]);
  });

  const paragraph = CONTENT.sections[0]?.paragraphs[0];
  if (!paragraph) throw new Error("fixture");

  it("keeps the original paragraph when the text is unchanged", () => {
    const text = paragraph.claims.map((c) => c.text).join(" ");
    expect(paragraphFromText(paragraph, `  ${text}  `)).toBe(paragraph);
  });

  it("keeps citations on edited sentences and leaves new numbers uncited", () => {
    const edited =
      "Southwest Indian Foundation has proudly served Gallup since 1968. Our academy trained 85 young people last year. We placed 70 graduates in jobs.";
    const p = paragraphFromText(paragraph, edited);
    expect(p?.claims).toHaveLength(3);
    expect(p?.claims[0]).toMatchObject({ kind: "factual", factIds: ["fct_1"] });
    expect(p?.claims[1]).toMatchObject({ kind: "factual", factIds: ["fct_2"] });
    expect(p?.claims[2]).toMatchObject({ kind: "factual", factIds: [] });
    expect(new Set(p?.claims.map((c) => c.id)).size).toBe(3);
    expect(paragraphFromText(paragraph, "   ")).toBeNull();
  });
});
