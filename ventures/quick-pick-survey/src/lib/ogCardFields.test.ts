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

  /**
   * Every member of the stripped class, pinned at its boundaries.
   *
   * The class in `ogCardFields.ts` is one regex holding five ranges, and the
   * tests above reach two of them by example. A narrowing edit — dropping the
   * C1 range, or collapsing the two bidi ranges into one — keeps those examples
   * green while silently letting a control character back into an image served
   * from the product's own domain. Boundaries rather than samples, because an
   * off-by-one at a range edge is exactly what an edit like that produces.
   */
  it("strips every codepoint in the class, at both edges of every range", () => {
<<<<<<< HEAD
    // Annotated rather than inferred: without this the literal widens to
    // (string | number)[][], `lo` and `hi` arrive as `string | number`, and
    // String.fromCodePoint(cp) fails to typecheck. `npm test` never saw it
    // because vitest transpiles without checking types — only `npm run
    // typecheck`, which pairwise-ci.yml runs as its own step, does.
    const stripped: ReadonlyArray<readonly [string, number, number]> = [
=======
    // Annotated rather than inferred: without it the rows widen to
    // `(string | number)[]`, `lo`/`hi` come out as `string | number`, and
    // `tsc --noEmit` — the first step of this venture's verify — fails on the
    // `String.fromCodePoint` below.
    const stripped: [string, number, number][] = [
>>>>>>> agent/pairwise-funnel-telemetry
      ["C0 controls", 0x0000, 0x001f],
      ["C1 controls", 0x007f, 0x009f],
      ["LRM/RLM", 0x200e, 0x200f],
      ["bidi embedding and overrides", 0x202a, 0x202e],
      ["bidi isolates", 0x2066, 0x2069],
    ];
    for (const [label, lo, hi] of stripped) {
      for (const cp of [lo, hi]) {
        const ch = String.fromCodePoint(cp);
        const rendered = cardField(
          params(`title=${encodeURIComponent(`A${ch}B`)}`),
          "title",
          "fallback",
        );
        const at = `U+${cp.toString(16).toUpperCase().padStart(4, "0")} (${label})`;
        expect(rendered, `${at} must be stripped`).toBe("AB");
      }
    }
  });

  it("leaves the codepoints just outside each range alone", () => {
    // The other half of a boundary: a class that over-strips eats legitimate
    // copy. U+0020 and U+00A0 are spaces, U+200D joins emoji, U+2028 is a
    // separator no wider range should swallow, and U+2065 / U+206A sit one
    // either side of the isolate range.
    for (const cp of [0x0020, 0x00a0, 0x200d, 0x2010, 0x2065, 0x206a]) {
      const ch = String.fromCodePoint(cp);
      const rendered = cardField(
        params(`title=${encodeURIComponent(`A${ch}B`)}`),
        "title",
        "fallback",
      );
      const at = `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
      expect(rendered, `${at} must survive cleaning`).toBe(`A${ch}B`);
    }
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
