import { describe, expect, it } from "vitest";
import {
  daysUntil,
  deadlineUrgency,
  dollarsToCents,
  formatAwardRange,
  formatPercent,
  relativeDeadline,
  toPlainText,
} from "./format";
import { applyClientFilters, sortByExpectedValue } from "./opportunity-list";
import { inDays, makeMatch, makeOpportunity, NOW } from "./test-fixtures";

describe("deadline helpers", () => {
  it("computes calendar days and urgency buckets", () => {
    expect(daysUntil(inDays(0), NOW)).toBe(0);
    expect(daysUntil(inDays(13), NOW)).toBe(13);
    expect(deadlineUrgency(inDays(13), NOW)).toBe("urgent");
    expect(deadlineUrgency(inDays(14), NOW)).toBe("soon");
    expect(deadlineUrgency(inDays(30), NOW)).toBe("normal");
    expect(deadlineUrgency(inDays(-2), NOW)).toBe("past");
    expect(deadlineUrgency(null, NOW)).toBe("none");
  });

  it("formats relative deadlines", () => {
    expect(relativeDeadline(inDays(0), NOW)).toBe("Closes today");
    expect(relativeDeadline(inDays(1), NOW)).toBe("Closes tomorrow");
    expect(relativeDeadline(inDays(9), NOW)).toBe("Closes in 9 days");
    expect(relativeDeadline(inDays(-3), NOW)).toBe("Closed 3 days ago");
    expect(relativeDeadline(inDays(120), NOW)).toBe("Closes in ~4 months");
    expect(relativeDeadline(null, NOW)).toBe("No deadline listed");
  });
});

describe("formatting", () => {
  it("formats award ranges", () => {
    expect(formatAwardRange(5_000_000, 25_000_000)).toBe("$50,000 – $250,000");
    expect(formatAwardRange(null, 25_000_000)).toBe("Up to $250,000");
    expect(formatAwardRange(5_000_000, null)).toBe("From $50,000");
    expect(formatAwardRange(0, null)).toBe("Award amount not listed");
  });

  it("formats percentages and parses dollar inputs", () => {
    expect(formatPercent(0.346)).toBe("35%");
    expect(formatPercent(null)).toBe("—");
    expect(dollarsToCents("$12,500.50")).toBe(1_250_050);
    expect(dollarsToCents("")).toBeNull();
    expect(dollarsToCents("abc")).toBeNull();
    expect(dollarsToCents("-5")).toBeNull();
  });

  it("converts funder HTML to plain text with line breaks", () => {
    expect(toPlainText("<p>First &amp; foremost</p><p>Second<br/>line</p>")).toBe(
      "First & foremost\nSecond\nline",
    );
    expect(toPlainText("<ul><li>One</li><li>Two</li></ul>")).toBe("• One\n• Two");
    expect(toPlainText('<script>alert("x")</script>ok')).toBe("ok");
    expect(toPlainText(null)).toBe("");
  });
});

describe("opportunity list ordering", () => {
  const a = makeOpportunity({ id: "a", match: makeMatch({ expectedValueCents: 100 }) });
  const b = makeOpportunity({ id: "b", match: makeMatch({ expectedValueCents: 900 }) });
  const c = makeOpportunity({ id: "c", match: null });
  const d = makeOpportunity({
    id: "d",
    match: makeMatch({ expectedValueCents: 5000, status: "dismissed", fitScore: 90 }),
  });
  const e = makeOpportunity({
    id: "e",
    match: makeMatch({ expectedValueCents: 50, fitScore: 30 }),
  });

  it("sorts by expected value with unscored last", () => {
    expect(sortByExpectedValue([a, c, b, e]).map((o) => o.id)).toEqual(["b", "a", "e", "c"]);
  });

  it("hides dismissed unless requested and applies min fit", () => {
    expect(
      applyClientFilters([a, b, c, d, e], { minFit: 0, showDismissed: false }).map((o) => o.id),
    ).toEqual(["a", "b", "c", "e"]);
    expect(
      applyClientFilters([a, d, e, c], { minFit: 50, showDismissed: true }).map((o) => o.id),
    ).toEqual(["a", "d"]);
  });
});
