import { describe, expect, it } from "vitest";
import { approxSatisfied, extractNumericTokens, type NumericToken } from "./numbers";

const norm = (text: string) => extractNumericTokens(text).map((t) => t.normalized);
const kinds = (text: string) =>
  extractNumericTokens(text).map((t: NumericToken) => `${t.kind}:${t.normalized}`);

describe("extractNumericTokens", () => {
  it("parses integers, decimals and comma thousands", () => {
    expect(norm("We trained 48 apprentices")).toEqual(["48"]);
    expect(norm("an average of 3.5 credentials")).toEqual(["3.5"]);
    expect(norm("1,200 families and 12,500 meals")).toEqual(["1200", "12500"]);
    expect(norm("1200 families")).toEqual(["1200"]);
  });

  it("does not treat sentence punctuation as decimals or thousands", () => {
    expect(norm("It opened in 2019. Then 40, then 50.")).toEqual(["2019", "40", "50"]);
  });

  it("parses dollar amounts with scale words and letters", () => {
    expect(kinds("$5,000")).toEqual(["money:$5000"]);
    expect(kinds("$1.2 million")).toEqual(["money:$1200000"]);
    expect(kinds("$1.2M")).toEqual(["money:$1200000"]);
    expect(kinds("$450K grant")).toEqual(["money:$450000"]);
    expect(kinds("5,000 dollars")).toEqual(["money:$5000"]);
    expect(kinds("a five-thousand-dollar stipend")).toEqual(["money:$5000"]);
    expect(kinds("USD 2,500")).toEqual(["money:$2500"]);
    expect(kinds("2.5 million people")).toEqual(["number:2500000"]);
  });

  it("parses percentages in all spellings", () => {
    expect(kinds("25%")).toEqual(["percent:25%"]);
    expect(kinds("25 percent")).toEqual(["percent:25%"]);
    expect(kinds("25 per cent")).toEqual(["percent:25%"]);
    expect(kinds("twenty-five percent")).toEqual(["percent:25%"]);
    expect(kinds("12.5% of youth")).toEqual(["percent:12.5%"]);
  });

  it("recognizes years and dates", () => {
    expect(kinds("since 1987")).toEqual(["year:1987"]);
    expect(kinds("in FY2025")).toEqual(["year:2025"]);
    expect(kinds("in June 2024")).toEqual(["date:2024-06"]);
    expect(kinds("by Sept. 2026")).toEqual(["date:2026-09"]);
    expect(kinds("on June 30, 2024")).toEqual(["date:2024-06-30"]);
    expect(kinds("on 6/30/2024")).toEqual(["date:2024-06-30"]);
    expect(kinds("as of 2024-06-30")).toEqual(["date:2024-06-30"]);
    expect(kinds("in 2024-06")).toEqual(["date:2024-06"]);
    expect(kinds("in FY 2024-25")).toEqual(["year:2024", "year:2025"]);
    expect(kinds("2,024 meals")).toEqual(["number:2024"]);
  });

  it("parses spelled numbers, tens and compounds", () => {
    expect(norm("zero incidents")).toEqual(["0"]);
    expect(norm("twelve trainees")).toEqual(["12"]);
    expect(norm("twenty trainees")).toEqual(["20"]);
    expect(norm("forty-eight apprentices")).toEqual(["48"]);
    expect(norm("forty eight apprentices")).toEqual(["48"]);
    expect(norm("three hundred and fifty homes")).toEqual(["350"]);
    expect(norm("two thousand meals")).toEqual(["2000"]);
    expect(norm("a dozen partners")).toEqual(["12"]);
    expect(norm("two dozen homes")).toEqual(["24"]);
    expect(norm("a hundred volunteers")).toEqual(["100"]);
    expect(kinds("a million dollars")).toEqual(["money:$1000000"]);
    expect(norm("half a million people")).toEqual(["500000"]);
  });

  it("parses fractions", () => {
    expect(kinds("half of graduates")).toEqual(["fraction:frac:0.5"]);
    expect(kinds("two-thirds of graduates")).toEqual(["fraction:frac:0.6667"]);
    expect(kinds("three quarters of trainees")).toEqual(["fraction:frac:0.75"]);
    expect(kinds("a third of homes")).toEqual(["fraction:frac:0.3333"]);
    // singular denominators without "of" are ordinals
    expect(kinds("a third cohort")).toEqual(["ordinal:ordinal:3"]);
  });

  it("parses ordinals", () => {
    expect(kinds("our 25th year")).toEqual(["ordinal:ordinal:25"]);
    expect(kinds("the 1st cohort")).toEqual(["ordinal:ordinal:1"]);
    expect(kinds("the first program")).toEqual(["ordinal:ordinal:1"]);
    expect(kinds("its twenty-first season")).toEqual(["ordinal:ordinal:21"]);
  });

  it("ignores number words used idiomatically", () => {
    expect(norm("one-on-one mentoring")).toEqual([]);
    expect(norm("one of our values")).toEqual([]);
    expect(norm("no one is turned away")).toEqual([]);
    expect(norm("a second chance")).toEqual([]);
    expect(norm("on behalf of families")).toEqual([]);
    expect(norm("We welcome this opportunity to partner with you.")).toEqual([]);
  });

  it("handles ranges and unicode dashes", () => {
    expect(norm("ages 18–24")).toEqual(["18", "24"]);
    expect(norm("2023–2024")).toEqual(["2023", "2024"]);
  });

  it("emits ratio fractions only when asked", () => {
    expect(
      extractNumericTokens("1 in 4 residents", { ratios: true }).map((t) => t.normalized),
    ).toContain("frac:0.25");
    expect(norm("1 in 4 residents")).toEqual(["1", "4"]);
    expect(
      extractNumericTokens("48 in 2024", { ratios: true }).some((t) => t.kind === "fraction"),
    ).toBe(false);
  });
});

describe("approximate qualifiers and spans of years (token annotations)", () => {
  const ann = (text: string) =>
    extractNumericTokens(text).map((t) => [t.normalized, t.qualifier ?? null, t.phrase ?? null]);

  it("tags each allowed qualifier only when it directly precedes the figure", () => {
    expect(ann("nearly 1,000 meals")).toEqual([["1000", "nearly", "nearly 1,000"]]);
    expect(ann("Almost 120 adults")).toEqual([["120", "almost", "Almost 120"]]);
    expect(ann("about 48%")).toEqual([["48%", "about", "about 48%"]]);
    expect(ann("approximately $6,000")).toEqual([
      ["$6000", "approximately", "approximately $6,000"],
    ]);
    expect(ann("roughly two-thirds of learners")).toEqual([
      ["frac:0.6667", "roughly", "roughly two-thirds"],
    ]);
    expect(ann("more than 200 adults")).toEqual([["200", "more than", "more than 200"]]);
    expect(ann("over $1.2 million")).toEqual([["$1200000", "over", "over $1.2 million"]]);
    expect(ann("at least one level")).toEqual([["1", "at least", "at least one"]]);
    expect(ann("under 18")).toEqual([["18", "under", "under 18"]]);
    expect(ann("fewer than 50 incidents")).toEqual([["50", "fewer than", "fewer than 50"]]);
    expect(ann("Nearly half of trainees")).toEqual([["frac:0.5", "nearly", "Nearly half"]]);
  });

  it("ignores qualifiers that are negated, not adjacent, or not on the list", () => {
    expect(ann("no more than 200 adults")).toEqual([["200", null, null]]);
    expect(ann("not over 300 adults")).toEqual([["300", null, null]]);
    expect(ann("about the 200 adults")).toEqual([["200", null, null]]);
    expect(ann("up to 250 adults")).toEqual([["250", null, null]]);
    expect(ann("less than 250 adults")).toEqual([["250", null, null]]);
    expect(ann("moreover 200 adults")).toEqual([["200", null, null]]);
    // years, dates and ordinals never take a qualifier
    expect(ann("over 2024")).toEqual([["2024", null, null]]);
    expect(ann("about June 2024")).toEqual([["2024-06", null, null]]);
    expect(ann("nearly first")).toEqual([["ordinal:1", null, null]]);
  });

  it("marks spans of years, including decades, but not ages", () => {
    const unit = (text: string) => extractNumericTokens(text).map((t) => [t.raw, t.unit ?? null]);
    expect(unit("for 14 years")).toEqual([["14", "years"]]);
    expect(unit("a 14-year track record")).toEqual([["14", "years"]]);
    expect(unit("for fifteen years")).toEqual([["fifteen", "years"]]);
    expect(unit("over a decade")).toEqual([["a decade", "years"]]);
    expect(unit("two decades")).toEqual([["two decades", "years"]]);
    expect(unit("3 decades")).toEqual([["3 decades", "years"]]);
    expect(norm("over a decade")).toEqual(["10"]);
    expect(norm("two decades")).toEqual(["20"]);
    expect(unit("18 years old")).toEqual([["18", null]]);
    expect(unit("an 18-year-old")).toEqual([["18", null]]);
    expect(unit("18 years of age")).toEqual([["18", null]]);
    expect(unit("14 apprentices")).toEqual([["14", null]]);
    expect(norm("decades of experience")).toEqual([]);
  });
});

describe("approxSatisfied", () => {
  it("applies each qualifier's direction and tolerance", () => {
    // more than / over: strictly above; at least: at or above
    expect(approxSatisfied("more than", 200, 214)).toBe(true);
    expect(approxSatisfied("more than", 200, 200)).toBe(false);
    expect(approxSatisfied("over", 500, 214)).toBe(false);
    expect(approxSatisfied("at least", 214, 214)).toBe(true);
    expect(approxSatisfied("at least", 215, 214)).toBe(false);
    // under / fewer than: strictly below
    expect(approxSatisfied("under", 150, 142)).toBe(true);
    expect(approxSatisfied("fewer than", 142, 142)).toBe(false);
    expect(approxSatisfied("under", 100, 142)).toBe(false);
    // nearly / almost: 0.9N <= fact < N
    expect(approxSatisfied("nearly", 50, 48)).toBe(true);
    expect(approxSatisfied("nearly", 50, 45)).toBe(true);
    expect(approxSatisfied("nearly", 50, 44.9)).toBe(false);
    expect(approxSatisfied("almost", 50, 50)).toBe(false);
    expect(approxSatisfied("nearly", 1000, 600)).toBe(false);
    expect(approxSatisfied("nearly", 200, 214)).toBe(false);
    // about / approximately / roughly: within 5% of the documented value
    expect(approxSatisfied("about", 200, 204)).toBe(true);
    expect(approxSatisfied("about", 220, 214)).toBe(true);
    expect(approxSatisfied("approximately", 225, 214)).toBe(false);
    expect(approxSatisfied("roughly", 200, 214)).toBe(false);
  });
});
