// The legal pages render through this renderer: it must never emit raw HTML or unsafe links, and it
// must read every construct the bundled documents use (headings, lists, the draft blockquote, the
// subprocessor table). Node environment: React's static renderer, no DOM needed.
import { LEGAL_DOC_KEYS } from "@shared/legal";
import { LEGAL_DOCUMENTS } from "@worker/services/legal/documents";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown, parseMarkdown, safeHref } from "./markdown";

const html = (source: string) => renderToStaticMarkup(createElement(Markdown, { source }));

describe("safeHref", () => {
  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "//evil.example.com",
    "/\\evil.example.com",
  ])("rejects %j", (href) => {
    expect(safeHref(href)).toBeNull();
  });

  it.each(["https://example.org/x", "/legal/privacy", "#section-2", "mailto:help@example.org"])(
    "allows %j",
    (href) => {
      expect(safeHref(href)).toBe(href);
    },
  );
});

describe("Markdown", () => {
  it("renders raw HTML as text", () => {
    const out = html('<script>alert(1)</script> and <img src=x onerror="alert(1)">');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;script&gt;");
  });

  it("drops an unsafe link target but keeps its text", () => {
    const out = html("[click](javascript:alert(1))");
    expect(out).not.toContain("javascript:");
    expect(out).toContain("click");
  });

  it.each(LEGAL_DOC_KEYS)("renders the %s document's headings, lists and notes", (key) => {
    const md = LEGAL_DOCUMENTS[key].markdown;
    const blocks = parseMarkdown(md);
    expect(blocks[0]).toMatchObject({ t: "h", level: 1 });
    expect(blocks.some((b) => b.t === "ul")).toBe(true);
    const out = html(md);
    expect(out).toContain("<h1");
    expect(out).toContain("<strong");
    expect(out).not.toContain("**");
  });

  it("renders the privacy policy's subprocessor table", () => {
    const out = html(LEGAL_DOCUMENTS.privacy.markdown);
    expect(out).toContain("<table");
    expect(out).toContain("Cloudflare, Inc.");
  });
});
