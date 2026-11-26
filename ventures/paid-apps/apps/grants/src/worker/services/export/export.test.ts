// @vitest-environment happy-dom
import type { ApplicationContent } from "@shared/content";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { assertWellFormed } from "../../../../test/xml-well-formed";
import { buildApplicationDocx } from "./docx";
import { buildApplicationHtml } from "./html";
import { buildExportModel, type ExportInput, numberCitations } from "./model";
import { buildApplicationText } from "./plaintext";
import { cleanText, escapeHtml, escapeXml, exportFilename, slugify } from "./text";

// ------------------------------------------------------------------------------- fixtures

const content: ApplicationContent = {
  sections: [
    {
      key: "need_statement",
      title: "Statement of need",
      paragraphs: [
        {
          id: "s1.p1",
          claims: [
            {
              id: "s1.p1.c1",
              text: "We trained 48 adults.",
              kind: "factual",
              factIds: ["f1", "f2"],
            },
            { id: "s1.p1.c2", text: "Demand keeps growing.", kind: "factual", factIds: ["f2"] },
          ],
        },
        {
          id: "s1.p2",
          claims: [
            { id: "s1.p2.c1", text: "We welcome the partnership.", kind: "framing", factIds: [] },
          ],
        },
      ],
      gaps: [],
    },
    {
      key: "budget",
      title: "Budget narrative",
      paragraphs: [
        {
          id: "s2.p1",
          claims: [
            {
              id: "s2.p1.c1",
              text: "The budget is $640,000.",
              kind: "factual",
              factIds: ["f3", "f1"],
            },
          ],
        },
      ],
      gaps: [{ question: "What is the indirect cost rate?", why: "No fact covers it." }],
    },
  ],
};

function input(over: Partial<ExportInput> = {}): ExportInput {
  return {
    generatedAt: new Date("2026-11-19T12:00:00Z"),
    org: {
      legalName: "Red Mesa Trades Collective",
      dba: null,
      ein: "85-1234567",
      uei: null,
    },
    application: {
      id: "app_1",
      title: "Workforce Pathways 2027",
      requestedAmountCents: 7_500_000,
      deadline: null,
    },
    opportunity: {
      title: "Workforce Pathways Grant",
      funderName: "Gallup Community Foundation",
      opportunityNumber: "GCF-2027-01",
      closeDate: new Date("2026-12-01T00:00:00Z"),
    },
    requirements: {
      sections: [
        {
          key: "need_statement",
          title: "Statement of need",
          prompt: "Describe the need your program addresses.",
          kind: "narrative",
          required: true,
          wordLimit: 10,
          charLimit: null,
          guidance: "",
        },
        {
          key: "budget",
          title: "Budget",
          prompt: "Explain how funds will be used.",
          kind: "budget",
          required: true,
          wordLimit: 3,
          charLimit: 100,
          guidance: "",
        },
      ],
      attachments: [],
      eligibilityCriteria: [],
      submissionInstructions: "",
      complete: true,
    },
    version: {
      id: "ver_1",
      versionNumber: 2,
      content,
      executiveSummary: "Red Mesa requests support.\n\nSecond paragraph.",
      keyPoints: ["48 adults trained", "12 employer partners"],
    },
    facts: [
      { id: "f1", statement: "The program trained 48 adults in 2025.", sourceQuote: "trained 48" },
      { id: "f2", statement: "Demand grew in 2025.", sourceQuote: "" },
      { id: "f3", statement: "The annual budget is $640,000.", sourceQuote: "budget of $640,000" },
    ],
    ...over,
  };
}

// ------------------------------------------------------------------------------- XML checks

/** C0 control characters other than TAB, LF and CR. */
const hasControlChars = (s: string) =>
  [...s].some((ch) => {
    const c = ch.codePointAt(0) ?? 0;
    return c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d;
  });

function parseXml(xml: string): Document {
  assertWellFormed(xml);
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
  return doc;
}

/** Paragraph texts of document.xml with their style ids. */
function paragraphs(doc: Document) {
  return [...doc.getElementsByTagName("w:p")].map((p) => ({
    style: p.getElementsByTagName("w:pStyle")[0]?.getAttribute("w:val") ?? "Normal",
    text: [...p.getElementsByTagName("w:t")].map((t) => t.textContent).join(""),
  }));
}

function unzipDocx(bytes: Uint8Array): Record<string, string> {
  const files = unzipSync(bytes);
  return Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strFromU8(v)]));
}

const PARTS = [
  "[Content_Types].xml",
  "_rels/.rels",
  "word/document.xml",
  "word/styles.xml",
  "word/footer1.xml",
  "word/_rels/document.xml.rels",
  "docProps/core.xml",
  "docProps/app.xml",
];

// ------------------------------------------------------------------------------- tests

describe("text helpers", () => {
  it("escapes the five XML/HTML specials", () => {
    expect(escapeXml(`<a href="x">Tom & Jerry's</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&apos;s&lt;/a&gt;",
    );
    expect(escapeHtml(`<b>"Q" & 'A'</b>`)).toBe(
      "&lt;b&gt;&quot;Q&quot; &amp; &#39;A&#39;&lt;/b&gt;",
    );
  });

  it("strips control characters and lone surrogates but keeps tabs, newlines and unicode", () => {
    const raw = "A\u0000B\u0007C\u001bD\u007fE\u0085F\uFFFEG\uD800H\tI\r\nJ\rK 😀 Año 中文";
    expect(cleanText(raw)).toBe("ABCDEFGH\tI\nJ\nK 😀 Año 中文");
    expect(cleanText(null)).toBe("");
  });

  it("builds ASCII-only filenames", () => {
    expect(slugify('Año 2026: Need & Plan / "quoted"')).toBe("ano-2026-need-plan-quoted");
    expect(
      exportFilename({ orgName: 'Red "Mesa"\r\n', title: "../../etc", versionNumber: 3 }, "docx"),
    ).toBe("red-mesa-etc-v3.docx");
    expect(exportFilename({ orgName: "中文", title: "😀", versionNumber: 1 }, "txt")).toBe(
      "application-v1.txt",
    );
  });
});

describe("export model", () => {
  it("numbers citations by first appearance and dedupes per claim", () => {
    expect([...numberCitations(content)]).toEqual([
      ["f1", 1],
      ["f2", 2],
      ["f3", 3],
    ]);
    const m = buildExportModel(input(), { citations: true });
    expect(m.sections[0]?.paragraphs[0]?.map((r) => r.cites)).toEqual([[1, 2], [2]]);
    expect(m.sections[1]?.paragraphs[0]?.[0]?.cites).toEqual([3, 1]);
    expect(m.citations?.map((c) => [c.n, c.statement, c.sourceQuote])).toEqual([
      [1, "The program trained 48 adults in 2025.", "trained 48"],
      [2, "Demand grew in 2025.", ""],
      [3, "The annual budget is $640,000.", "budget of $640,000"],
    ]);
  });

  it("omits markers and the appendix without the citations option", () => {
    const m = buildExportModel(input());
    expect(m.citations).toBeNull();
    expect(m.sections.flatMap((s) => s.paragraphs.flat().flatMap((r) => r.cites))).toEqual([]);
  });

  it("marks facts that no longer exist", () => {
    const m = buildExportModel(input({ facts: [] }), { citations: true });
    expect(m.citations?.[0]).toMatchObject({ n: 1, factId: "f1", statement: null });
  });

  it("counts words and characters of the answer text (no markers) against funder limits", () => {
    const m = buildExportModel(input(), { citations: true });
    const [need, budget] = m.sections;
    // "We trained 48 adults. Demand keeps growing.\n\nWe welcome the partnership."
    expect(need?.text).toBe(
      "We trained 48 adults. Demand keeps growing.\n\nWe welcome the partnership.",
    );
    expect(need?.wordCount).toBe(11);
    expect(need?.charCount).toBe(need?.text.length);
    expect(need?.wordLimit).toBe(10);
    expect(need?.overWordLimit).toBe(true);
    expect(budget?.wordCount).toBe(4);
    expect(budget?.charCount).toBe("The budget is $640,000.".length);
    expect(budget?.overCharLimit).toBe(false);
    expect(budget?.gaps).toEqual(["What is the indirect cost rate?"]);
    // The drafted title wins over the requirement's; the prompt comes from the requirement.
    expect(budget?.title).toBe("Budget narrative");
    expect(budget?.prompt).toBe("Explain how funds will be used.");
    expect(m.totalWords).toBe(15);
  });

  it("keeps the cover page off unless asked", () => {
    expect(buildExportModel(input()).cover).toBeNull();
    expect(buildExportModel(input(), { cover: true }).cover?.keyPoints).toHaveLength(2);
  });
});

describe("buildApplicationDocx", () => {
  it("produces a complete OOXML package whose parts are all well-formed XML", () => {
    const files = unzipDocx(buildApplicationDocx(input(), { citations: true, cover: true }));
    expect(Object.keys(files).sort()).toEqual([...PARTS].sort());
    for (const [name, xml] of Object.entries(files)) {
      expect(() => assertWellFormed(xml), name).not.toThrow();
    }
    // Every part except the package's own bookkeeping has a content-type override.
    const types = parseXml(files["[Content_Types].xml"] ?? "");
    const overrides = [...types.getElementsByTagName("Override")].map((o) =>
      o.getAttribute("PartName"),
    );
    for (const part of PARTS.filter((p) => !p.endsWith(".rels") && !p.startsWith("[")))
      expect(overrides).toContain(`/${part}`);
    // Relationship targets resolve to parts in the zip.
    const rels = parseXml(files["word/_rels/document.xml.rels"] ?? "");
    for (const r of rels.getElementsByTagName("Relationship"))
      expect(files[`word/${r.getAttribute("Target")}`]).toBeDefined();
    const styles = parseXml(files["word/styles.xml"] ?? "");
    const styleIds = [...styles.getElementsByTagName("w:style")].map((s) =>
      s.getAttribute("w:styleId"),
    );
    for (const id of ["Normal", "Title", "Heading1", "Heading2", "Prompt"])
      expect(styleIds).toContain(id);
    expect(files["word/styles.xml"]).toContain('w:ascii="Calibri"');
    expect(files["word/styles.xml"]).toContain('<w:sz w:val="22"/>');
    expect(files["docProps/core.xml"]).toContain("<dc:title>Workforce Pathways 2027</dc:title>");
    expect(files["docProps/app.xml"]).toContain("<Words>15</Words>");
  });

  it("renders the title page, sections, prompts, counts, cover page and citations", () => {
    const files = unzipDocx(buildApplicationDocx(input(), { citations: true, cover: true }));
    const ps = paragraphs(parseXml(files["word/document.xml"] ?? ""));
    const texts = ps.map((p) => p.text);
    expect(ps.find((p) => p.style === "Title")?.text).toBe("Workforce Pathways 2027");
    expect(texts).toContain("Applicant: Red Mesa Trades Collective");
    expect(texts).toContain("EIN: 85-1234567");
    expect(texts).toContain("Opportunity: Workforce Pathways Grant (GCF-2027-01)");
    expect(texts).toContain("Deadline: December 1, 2026");
    expect(texts).toContain("Requested amount: $75,000");
    expect(ps.filter((p) => p.style === "Heading1").map((p) => p.text)).toEqual([
      "Reviewer cover page",
      "Statement of need",
      "Budget narrative",
      "Citations",
    ]);
    expect(ps.filter((p) => p.style === "Prompt").map((p) => p.text)).toEqual([
      "Describe the need your program addresses.",
      "Explain how funds will be used.",
    ]);
    expect(texts).toContain("We trained 48 adults.[1][2] Demand keeps growing.[2]");
    expect(texts).toContain("Word count: 11 / 10  ·  — over limit".replace("  ·  —", "  —"));
    expect(texts).toContain("Word count: 4 / 3  ·  Characters: 23 / 100  — over limit");
    expect(texts).toContain("Red Mesa requests support.");
    expect(texts).toContain("•48 adults trained");
    expect(texts).toContain("[1]The program trained 48 adults in 2025.");
    expect(texts).toContain("Source: “trained 48”");
    expect(texts).toContain("•What is the indirect cost rate?");
    // The prompt is italic via its style.
    expect(files["word/styles.xml"]).toMatch(/w:styleId="Prompt">.*?<w:i\/>/);
  });

  it("leaves out the internal cover page and citations by default", () => {
    const xml = unzipDocx(buildApplicationDocx(input()))["word/document.xml"] ?? "";
    expect(xml).not.toContain("Reviewer cover page");
    expect(xml).not.toContain("Red Mesa requests support.");
    expect(xml).not.toContain("Citations");
    expect(xml).not.toContain("[1]");
  });

  it("escapes markup and strips control characters from every field", () => {
    const evil = `<script>alert("x")</script> & 'q' \u0000\u0007\u001b\uD800 😀 Año`;
    const nasty = input({
      org: { legalName: `Mesa & Sons <LLC> "Inc" 'x'\u0001`, dba: evil, ein: "<1>", uei: null },
      application: { id: "a", title: evil, requestedAmountCents: null, deadline: null },
      version: {
        id: "v",
        versionNumber: 1,
        content: {
          sections: [
            {
              key: 'k"&<',
              title: evil,
              paragraphs: [
                {
                  id: "p",
                  claims: [
                    { id: "c", text: `${evil}\nline two\ttab`, kind: "factual", factIds: ["f1"] },
                  ],
                },
              ],
              gaps: [{ question: evil, why: "" }],
            },
          ],
        },
        executiveSummary: evil,
        keyPoints: [evil],
      },
      facts: [{ id: "f1", statement: evil, sourceQuote: evil }],
    });
    const files = unzipDocx(buildApplicationDocx(nasty, { citations: true, cover: true }));
    for (const [name, xml] of Object.entries(files)) {
      expect(() => assertWellFormed(xml), name).not.toThrow();
      expect(xml).not.toContain("<script>");
      expect(hasControlChars(xml)).toBe(false);
    }
    const doc = files["word/document.xml"] ?? "";
    expect(doc).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &apos;q&apos;");
    expect(doc).toContain("😀 Año");
    expect(doc).toContain("<w:br/>");
    expect(doc).toContain("<w:tab/>");
    const texts = paragraphs(parseXml(doc)).map((p) => p.text);
    expect(texts).toContain(
      `Applicant: Mesa & Sons <LLC> "Inc" 'x' (DBA <script>alert("x")</script> & 'q'  😀 Año)`,
    );
    expect(files["docProps/core.xml"]).toContain("<dc:creator>Mesa &amp; Sons &lt;LLC&gt;");
  });
});

describe("buildApplicationHtml", () => {
  it("is a standalone print document with page breaks between sections", () => {
    const html = buildApplicationHtml(input(), { citations: true });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("@page { size: letter; margin: 1in; }");
    expect(html).not.toMatch(/<script|<link|src=/i);
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.title).toBe("Workforce Pathways 2027 — Red Mesa Trades Collective");
    const sections = [...doc.querySelectorAll("section.section")];
    expect(sections.map((s) => s.querySelector("h1")?.textContent)).toEqual([
      "Statement of need",
      "Budget narrative",
    ]);
    for (const s of sections) expect(s.classList.contains("page")).toBe(true);
    expect(sections[0]?.querySelector(".prompt")?.textContent).toBe(
      "Describe the need your program addresses.",
    );
    expect(sections[0]?.querySelector(".count")?.textContent).toBe(
      "Word count: 11 / 10 — over limit",
    );
    expect(sections[0]?.querySelectorAll("a.cite")).toHaveLength(3);
    expect(doc.querySelectorAll("ol.citations li")).toHaveLength(3);
    expect(doc.querySelector("#cite-3")?.textContent).toContain("The annual budget is $640,000.");
    expect(doc.querySelector(".cover")).toBeNull();
  });

  it("escapes everything", () => {
    const evil = `<img src=x onerror=alert(1)> & "q" 'a' \u0000\u001b`;
    const html = buildApplicationHtml(
      input({
        application: { id: "a", title: evil, requestedAmountCents: null, deadline: null },
        version: { ...input().version, executiveSummary: evil, keyPoints: [evil] },
        facts: [{ id: "f1", statement: evil, sourceQuote: evil }],
      }),
      { citations: true, cover: true },
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot; &#39;a&#39;");
    expect(hasControlChars(html)).toBe(false);
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelectorAll("img")).toHaveLength(0);
    expect(doc.querySelector(".cover .internal")?.textContent).toContain("Internal");
  });
});

describe("buildApplicationText", () => {
  it("gives each section's prompt, answer and word/character counts", () => {
    const txt = buildApplicationText(input());
    expect(txt).toContain(
      [
        "1. Statement of need",
        "=".repeat(72),
        "",
        "PROMPT:",
        "Describe the need your program addresses.",
        "",
        "ANSWER:",
        "We trained 48 adults. Demand keeps growing.",
        "",
        "We welcome the partnership.",
        "",
        "Words: 11 / 10 words (OVER LIMIT by 1)",
        "Characters (with spaces): 72 characters",
      ].join("\n"),
    );
    expect(txt).toContain("Words: 4 / 3 words (OVER LIMIT by 1)");
    expect(txt).toContain("Characters (with spaces): 23 / 100 characters");
    expect(txt).toContain("  - What is the indirect cost rate?");
    expect(txt).toContain("EIN: 85-1234567");
    expect(txt).toContain("Deadline: December 1, 2026");
    expect(txt).not.toContain("[1]");
    expect(txt).not.toContain("REVIEWER NOTES");
  });

  it("adds markers and a sources list with citations, and strips control characters", () => {
    const txt = buildApplicationText(
      input({ org: { ...input().org, legalName: "Mesa\u0000 & <Co>" } }),
      { citations: true, cover: true },
    );
    expect(txt).toContain("We trained 48 adults.[1][2] Demand keeps growing.[2]");
    expect(txt).toContain("(Counts exclude the [n] citation markers.)");
    expect(txt).toContain('[3] The annual budget is $640,000.\n    Source: "budget of $640,000"');
    expect(txt).toContain("REVIEWER NOTES (internal, do not paste into the portal)");
    expect(txt).toContain("Applicant: Mesa & <Co>");
  });
});
