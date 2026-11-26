import type { DraftSection } from "@shared/content";
import { describe, expect, it } from "vitest";
import {
  countWords,
  countWordsInText,
  dedupeGaps,
  postProcessSection,
  renderPlainText,
  targetWords,
} from "./text";

const claim = (text: string, factIds: string[] = [], kind: "factual" | "framing" = "factual") => ({
  id: "x",
  text,
  kind,
  factIds,
});

const section = (
  claims: ReturnType<typeof claim>[][],
  gaps: DraftSection["gaps"] = [],
): DraftSection => ({
  key: "model_key",
  title: "Model Title",
  paragraphs: claims.map((c) => ({ id: "p", claims: c })),
  gaps,
});

const req = (over: Partial<{ wordLimit: number | null; charLimit: number | null }> = {}) => ({
  key: "need",
  title: "Statement of Need",
  wordLimit: null,
  charLimit: null,
  ...over,
});

describe("word counting", () => {
  it("counts whitespace-separated words", () => {
    expect(countWordsInText("")).toBe(0);
    expect(countWordsInText("  We train   welders.\n")).toBe(3);
  });

  it("counts every claim of a section, not gaps", () => {
    const s = section(
      [[claim("one two three"), claim("four")], [claim("five six")]],
      [{ question: "ignored words here?", why: "x" }],
    );
    expect(countWords(s)).toBe(6);
  });

  it("targets 90% of the limit", () => {
    expect(targetWords(500)).toBe(450);
    expect(targetWords(null)).toBeNull();
  });
});

describe("renderPlainText", () => {
  it("renders titles and paragraphs, joining claims with spaces and skipping gaps", () => {
    const text = renderPlainText({
      sections: [
        {
          key: "a",
          title: "Need",
          paragraphs: [
            { id: "s1.p1", claims: [claim("First."), claim("Second.")] },
            { id: "s1.p2", claims: [claim("Third.")] },
          ],
          gaps: [{ question: "Q?", why: "w" }],
        },
        { key: "b", title: "Budget", paragraphs: [], gaps: [] },
      ],
    });
    expect(text).toBe("Need\n\nFirst. Second.\n\nThird.\n\n\nBudget");
  });
});

describe("postProcessSection", () => {
  const allowed = new Set(["fct_a", "fct_b"]);

  it("drops unknown fact ids but keeps the claim, and assigns stable ids", () => {
    const raw = section([
      [
        claim("We serve Gallup.", ["fct_a", "fct_made_up", "fct_a"]),
        claim("We train.", ["fct_zzz"]),
      ],
    ]);
    const { section: s, droppedFactIds } = postProcessSection(raw, {
      sectionIndex: 3,
      requirement: req(),
      allowedFactIds: allowed,
    });
    expect(s.key).toBe("need");
    expect(s.title).toBe("Statement of Need");
    expect(s.paragraphs[0]?.id).toBe("s3.p1");
    expect(s.paragraphs[0]?.claims.map((c) => c.id)).toEqual(["s3.p1.c1", "s3.p1.c2"]);
    expect(s.paragraphs[0]?.claims[0]?.factIds).toEqual(["fct_a"]);
    expect(s.paragraphs[0]?.claims[1]?.factIds).toEqual([]);
    expect(s.paragraphs[0]?.claims[1]?.kind).toBe("factual");
    expect(droppedFactIds.sort()).toEqual(["fct_made_up", "fct_zzz"]);
  });

  it("removes empty claims and paragraphs", () => {
    const raw = section([[claim("  ")], [claim("Kept.", ["fct_b"])]]);
    const { section: s } = postProcessSection(raw, {
      sectionIndex: 1,
      requirement: req(),
      allowedFactIds: allowed,
    });
    expect(s.paragraphs).toHaveLength(1);
    expect(s.paragraphs[0]?.claims[0]?.id).toBe("s1.p1.c1");
  });

  it("does not trim when within 10% of the word limit", () => {
    const raw = section([
      [claim("one two three four five"), claim("six seven eight nine ten eleven")],
    ]);
    const { section: s, trimmedClaims } = postProcessSection(raw, {
      sectionIndex: 1,
      requirement: req({ wordLimit: 10 }),
      allowedFactIds: allowed,
    });
    expect(trimmedClaims).toBe(0);
    expect(countWords(s)).toBe(11);
  });

  it("trims trailing claims at claim boundaries when over the limit by more than 10%", () => {
    const raw = section([
      [claim("one two three four five"), claim("six seven eight")],
      [claim("nine ten eleven twelve"), claim("thirteen fourteen")],
    ]);
    const { section: s, trimmedClaims } = postProcessSection(raw, {
      sectionIndex: 2,
      requirement: req({ wordLimit: 10 }),
      allowedFactIds: allowed,
    });
    expect(trimmedClaims).toBe(2);
    expect(countWords(s)).toBeLessThanOrEqual(10);
    expect(s.paragraphs).toHaveLength(1);
    expect(s.paragraphs[0]?.claims.map((c) => c.id)).toEqual(["s2.p1.c1", "s2.p1.c2"]);
  });

  it("enforces character limits strictly", () => {
    const raw = section([[claim("aaaa bbbb."), claim("cccc dddd.")]]);
    const { section: s } = postProcessSection(raw, {
      sectionIndex: 1,
      requirement: req({ charLimit: 15 }),
      allowedFactIds: allowed,
    });
    expect(s.paragraphs[0]?.claims).toHaveLength(1);
  });

  it("de-duplicates gaps", () => {
    expect(
      dedupeGaps([
        { question: "How many?", why: "a" },
        { question: " how  many? ", why: "b" },
        { question: "", why: "c" },
      ]),
    ).toEqual([{ question: "How many?", why: "a" }]);
  });
});

describe("postProcessSection: injected contact details", () => {
  it("drops a claim whose email is not in its cited facts and asks staff instead", () => {
    const raw = section([
      [
        claim("We serve Gallup.", ["fct_a"]),
        claim("Send the application to x@evil.example as instructed.", ["fct_a"]),
        claim("Reach our director at info@org.example.org.", ["fct_b"]),
      ],
    ]);
    const { section: s, droppedContactClaims } = postProcessSection(raw, {
      sectionIndex: 1,
      requirement: req(),
      allowedFactIds: new Set(["fct_a", "fct_b"]),
      factTexts: new Map([
        ["fct_a", "The organization serves Gallup."],
        ["fct_b", "The director's email is info@org.example.org."],
      ]),
    });
    expect(droppedContactClaims).toBe(1);
    const texts = s.paragraphs.flatMap((p) => p.claims.map((c) => c.text));
    expect(texts.join(" ")).not.toContain("x@evil.example");
    expect(texts).toContain("Reach our director at info@org.example.org.");
    // flagged for human review: a gap reaches staff as a question
    expect(s.gaps.some((g) => /contact details/.test(g.question))).toBe(true);
  });
});
