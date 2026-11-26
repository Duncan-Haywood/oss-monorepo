import { describe, expect, it } from "vitest";
import { sameSiteLink, verifyCandidate } from "./detect";
import { fakeDetect } from "./fake-llm";
import { feedItemLine, isFundingItem, looksLikeFeed, parseFeed } from "./rss";
import { diffLines, normalizePageText, quoteAppears } from "./text";

describe("normalizePageText / diffLines", () => {
  it("normalizes whitespace and drops blank lines", () => {
    expect(normalizePageText("  a \t b \r\n\r\n\n c  ")).toBe("a b\nc");
  });

  it("returns only added lines with context; first check is the whole page", () => {
    const prev = ["h", "a", "b", "c", "d", "e", "f"].join("\n");
    const next = ["h", "a", "b", "c", "NEW", "d", "e", "f"].join("\n");
    const d = diffLines(prev, next, 1);
    expect(d.added).toEqual(["NEW"]);
    expect(d.changedText).toBe("c\nNEW\nd");
    expect(d.removedCount).toBe(0);
    expect(diffLines(null, next).changedText).toBe(next);
    expect(diffLines(next, prev).removedCount).toBe(1);
  });
});

describe("quoteAppears", () => {
  const page = "## Spring RFP\nApplications are due “March 15, 2027” — apply online.";
  it("matches verbatim quotes ignoring case, typography and markers", () => {
    expect(quoteAppears('applications are due "March 15, 2027" - apply online.', page)).toBe(true);
  });
  it("rejects fabricated or too-short quotes", () => {
    expect(quoteAppears("Applications are due April 1, 2027 - apply online.", page)).toBe(false);
    expect(quoteAppears("Spring RFP", page)).toBe(false);
  });
});

describe("verifyCandidate", () => {
  const page = {
    url: "https://www.funder.org/grants",
    text: "## Trades Grant\nApplications are due March 15, 2027 for awards up to $75,000.\nEligibility: nonprofits in McKinley County.\nLinks on this page:\nhttps://www.funder.org/grants/trades",
    links: ["https://www.funder.org/grants/trades", "https://other.org/x"],
  };
  const base = {
    title: "Trades Grant",
    deadline: "2027-03-15",
    amountCents: 7_500_000,
    eligibility: "Eligibility: nonprofits in McKinley County.",
    link: "https://www.funder.org/grants/trades",
    evidenceQuote: "Applications are due March 15, 2027 for awards up to $75,000.",
  };
  it("keeps verified fields", () => {
    const v = verifyCandidate(base, page);
    expect(v.ok && v.candidate).toMatchObject({
      amountCents: 7_500_000,
      sourceUrl: "https://www.funder.org/grants/trades",
    });
  });
  it("drops unverifiable quotes/titles and nulls unverifiable fields", () => {
    expect(
      verifyCandidate({ ...base, evidenceQuote: "Grants of $1 million are available now." }, page),
    ).toEqual({
      ok: false,
      reason: "quote_not_on_page",
    });
    expect(verifyCandidate({ ...base, title: "Made Up Fund" }, page)).toMatchObject({ ok: false });
    const v = verifyCandidate(
      { ...base, amountCents: 100, deadline: "2028-01-01", link: "https://other.org/x" },
      page,
    );
    expect(v.ok && v.candidate).toMatchObject({
      amountCents: null,
      deadline: null,
      sourceUrl: page.url,
    });
  });
  it("only accepts same-site links that are on the page", () => {
    expect(sameSiteLink("/grants/trades", page)).toBe("https://www.funder.org/grants/trades");
    expect(sameSiteLink("https://www.funder.org/secret", page)).toBeNull();
    expect(sameSiteLink("http://169.254.169.254/", page)).toBeNull();
  });
});

describe("parseFeed", () => {
  it("parses RSS 2.0 items", () => {
    const xml = `<rss version="2.0"><channel><item><title><![CDATA[Spring Grant RFP]]></title><link>/rfp/spring</link><pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate><description>&lt;p&gt;Apply now&lt;/p&gt;</description></item></channel></rss>`;
    expect(looksLikeFeed(xml)).toBe(true);
    const [item] = parseFeed(xml, "https://funder.org/feed");
    expect(item).toMatchObject({
      title: "Spring Grant RFP",
      link: "https://funder.org/rfp/spring",
      date: "2026-11-02T10:00:00.000Z",
      description: "Apply now",
    });
    expect(item && isFundingItem(item)).toBe(true);
    expect(item && feedItemLine(item)).toContain(
      "Spring Grant RFP | https://funder.org/rfp/spring",
    );
  });
  it("parses Atom entries", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Board recap</title><link rel="alternate" href="https://funder.org/news/1"/><updated>2026-11-03T00:00:00Z</updated></entry></feed>`;
    const [item] = parseFeed(xml, "https://funder.org/atom");
    expect(item).toMatchObject({ title: "Board recap", link: "https://funder.org/news/1" });
    expect(item && isFundingItem(item)).toBe(false);
  });
});

describe("fakeDetect", () => {
  it("only quotes text present in its input", () => {
    const text =
      "## Youth Trades Grant\nProposals are due 2027-02-01 for awards up to $20,000 each.\n## News";
    const { candidates } = fakeDetect(text);
    expect(candidates).toHaveLength(1);
    expect(text).toContain(candidates[0]?.evidenceQuote ?? "∅");
    expect(candidates[0]).toMatchObject({ deadline: "2027-02-01", amountCents: 2_000_000 });
  });
});
