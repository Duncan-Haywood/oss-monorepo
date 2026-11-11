import { describe, expect, it } from "vitest";
import { groupRanking } from "./groupRanking";
import { coverage } from "./groupRanking";
import { resultsReportHtml, safeColour, safeLogo } from "./resultsReport";
import { buyLink, checkLicence, cleanKey, interpret } from "./licence";

const items = [{ id: "a", label: "Tea <b>" }, { id: "b", label: "Coffee" }, { id: "c", label: "Water" }];
const rows = [
  ...[1700, 1690, 1710].map((r) => ({ itemId: "a", rating: r, rd: 80 })),
  ...[1500, 1510, 1490].map((r) => ({ itemId: "b", rating: r, rd: 80 })),
  { itemId: "c", rating: 1300, rd: 80 },
];
const ranked = groupRanking(items, rows);
const cov = coverage(ranked, 3);

describe("resultsReportHtml", () => {
  it("escapes labels, title and brand", () => {
    const h = resultsReportHtml("<script>x</script>", ranked, cov, 3, { name: "A&B", note: "<img onerror=1>" }, "2026-11-04");
    expect(h).not.toContain("<script>x");
    expect(h).not.toContain("<img onerror");
    expect(h).toContain("Tea &lt;b&gt;");
    expect(h).toContain("A&amp;B");
  });
  it("flags thin options and carries the estimate disclaimer", () => {
    const h = resultsReportHtml("T", ranked, cov, 3);
    expect(h).toContain("Too few people rated: Water");
    expect(h).toContain("not a fact about any person");
  });
  it("shows the respondent-agreement note, escaped, only when the route passes one", () => {
    expect(resultsReportHtml("T", ranked, cov, 3)).not.toContain("rank agreement");
    const h = resultsReportHtml("T", ranked, cov, 3, { agreement: "2 of 9 respondents ... (rank agreement under 0.2) <b>" });
    expect(h).toContain("2 of 9 respondents ... (rank agreement under 0.2) &lt;b&gt;");
  });
  it("shows tied places as a range", () => {
    const tied = [{ ...ranked[0], tied: true, bestRank: 1, worstRank: 2 }];
    expect(resultsReportHtml("T", tied, cov, 3)).toContain("1–2");
  });
  it("handles an empty ranking", () => {
    expect(resultsReportHtml("T", [], coverage([], 0), 0)).toContain("<tbody></tbody>");
  });
});

describe("allow-lists", () => {
  it("accepts https and image data URIs only", () => {
    expect(safeLogo("https://x.org/a.png")).toBe("https://x.org/a.png");
    expect(safeLogo("data:image/png;base64,AAAA")).toBeTruthy();
    expect(safeLogo("javascript:alert(1)")).toBeNull();
    expect(safeLogo("http://x.org/a.png")).toBeNull();
    expect(safeLogo("data:image/svg+xml;base64,AAAA")).toBeNull();
    expect(safeLogo("https://u:p@x.org/a.png")).toBeNull();
  });
  it("accepts 6-digit hex colours only", () => {
    expect(safeColour("#12abEF")).toBe("#12abEF");
    expect(safeColour("red;}</style>")).toBe("#1f4e79");
  });
  it("a hostile colour never reaches the page", () => {
    expect(resultsReportHtml("T", ranked, cov, 3, { colour: "red;}</style><script>" })).not.toContain("<script>");
  });
});

describe("licence", () => {
  it("cleans keys and links", () => {
    expect(cleanKey(" abcd-1234-efgh ")).toBe("abcd-1234-efgh");
    expect(cleanKey("short")).toBeNull();
    expect(buyLink("http://x")).toBeNull();
    expect(buyLink("https://x.org/buy")).toBe("https://x.org/buy");
  });
  it("only an explicit valid on a live key unlocks", () => {
    expect(interpret({ valid: true, license_key: { status: "active" } }).valid).toBe(true);
    expect(interpret({ valid: true, license_key: { status: "disabled" } }).valid).toBe(false);
    expect(interpret({ valid: "true" }).valid).toBe(false);
    expect(interpret(null).valid).toBe(false);
  });
  it("never throws offline and never unlocks", async () => {
    const f = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    expect((await checkLicence("abcd-1234-efgh", { fetch: f, url: "https://x.org/v" })).valid).toBe(false);
    expect((await checkLicence("abcd-1234-efgh", { url: "" })).valid).toBe(false);
  });
});
