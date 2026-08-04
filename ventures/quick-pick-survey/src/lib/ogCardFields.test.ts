import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cardField, MAX_LENGTH } from "@/lib/ogCardFields";

const ROUTE = join(process.cwd(), "src/app/api/og/couple-card/route.tsx");

function params(query: string): URLSearchParams {
  return new URL(`https://example.test/api/og/couple-card?${query}`).searchParams;
}

describe("og card fields", () => {
  it("passes an ordinary value through unchanged", () => {
    expect(cardField(params("title=The+Steady+Builders"), "title", "fallback")).toBe(
      "The Steady Builders",
    );
  });

  it("falls back when the parameter is absent", () => {
    expect(cardField(params(""), "title", "The Adventurous Anchors")).toBe(
      "The Adventurous Anchors",
    );
  });

  it("clamps a value longer than the field allows", () => {
    // The pre-fix route read this straight into the layout. On the edge runtime
    // there is no per-IP limiter behind it, so length is the only bound.
    const long = "a".repeat(5000);
    const rendered = cardField(params(`insight=${long}`), "insight", "fallback");
    expect(rendered).toHaveLength(MAX_LENGTH.insight);
  });

  it("clamps every field to its own limit rather than a shared one", () => {
    for (const [name, limit] of Object.entries(MAX_LENGTH)) {
      const rendered = cardField(
        params(`${name}=${"b".repeat(limit + 50)}`),
        name as keyof typeof MAX_LENGTH,
        "fallback",
      );
      expect(rendered, `${name} should clamp at ${limit}`).toHaveLength(limit);
    }
  });

  it("strips newlines, which rearrange the card", () => {
    const rendered = cardField(
      params(`title=${encodeURIComponent("Verified\n\nAccount notice")}`),
      "title",
      "fallback",
    );
    expect(rendered).toBe("VerifiedAccount notice");
  });

  it("strips bidirectional overrides", () => {
    // U+202E reverses the run that follows it, so text can be laid out in an
    // order the link's own query string does not read as.
    const rendered = cardField(
      params(`names=${encodeURIComponent("You ‮dnapartner")}`),
      "names",
      "fallback",
    );
    expect(rendered).not.toContain("‮");
    // Without the override the run stays in the order the query string gives.
    expect(rendered).toBe("You dnapartner");
  });

  it("falls back when cleaning leaves nothing", () => {
    // Otherwise a query of only control characters renders a blank line where
    // the archetype should be, which reads as a broken card.
    const rendered = cardField(
      params(`title=${encodeURIComponent("‎‏  ")}`),
      "title",
      "The Adventurous Anchors",
    );
    expect(rendered).toBe("The Adventurous Anchors");
  });

  it("treats an empty parameter as absent", () => {
    expect(cardField(params("score="), "score", "88%")).toBe("88%");
  });

  it("is what the route actually uses for every rendered field", () => {
    // The clamp is only worth anything if nothing reads searchParams directly.
    // A new field added with `searchParams.get(...)` would render unbounded.
    const source = readFileSync(ROUTE, "utf8");
    const direct = [...source.matchAll(/searchParams\.get\s*\(/g)];
    expect(
      direct.length,
      "src/app/api/og/couple-card/route.tsx reads searchParams directly. Every " +
        "value rendered into the image must go through cardField(), or it is " +
        "unbounded caller-controlled text on the edge runtime.",
    ).toBe(0);
    expect(
      /cardField\s*\(/.test(source),
      "The route no longer calls cardField(); these tests cover code the route " +
        "does not run.",
    ).toBe(true);
  });
});
