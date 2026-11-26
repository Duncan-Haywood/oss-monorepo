// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Markdown, parseMarkdown, safeHref } from "./markdown";

afterEach(cleanup);

const html = (md: string) => render(<Markdown source={md} />).container;

describe("safeHref", () => {
  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "\u0001javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "//evil.example.com",
    "/\\evil.example.com",
    "\\\\evil.example.com",
    "javascript&colon;alert(1):x",
  ])("rejects %j", (href) => {
    expect(safeHref(href)).toBeNull();
  });

  it.each([
    "https://grants.gov/x",
    "http://example.org",
    "/legal/privacy",
    "#section-2",
    "./terms",
    "../privacy",
    "privacy",
    "mailto:help@example.org",
  ])("allows %j", (href) => {
    expect(safeHref(href)).toBe(href);
  });
});

describe("<Markdown>", () => {
  it("renders raw HTML as text, never as elements", () => {
    const c = html(
      '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n<a href="javascript:alert(1)">x</a>',
    );
    expect(c.querySelector("script")).toBeNull();
    expect(c.querySelector("img")).toBeNull();
    expect(c.querySelector("a")).toBeNull();
    expect(c.textContent).toContain("<script>alert(1)</script>");
    expect(c.textContent).toContain('<img src=x onerror="alert(1)">');
  });

  it("drops unsafe link hrefs but keeps the label", () => {
    const c = html(
      "[click](javascript:alert(1)) and [data](data:text/html,hi) and [ok](https://example.org)",
    );
    const links = c.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe("https://example.org");
    expect(links[0]?.getAttribute("rel")).toContain("noopener");
    expect(links[0]?.getAttribute("target")).toBe("_blank");
    expect(c.textContent).toContain("click");
    expect(c.textContent).toContain("data");
    expect(c.innerHTML).not.toMatch(/javascript:|data:text/i);
  });

  it("does not let attributes escape through link text or href", () => {
    const c = html('[x" onmouseover="alert(1)](/ok" onclick="alert(1))');
    for (const el of Array.from(c.querySelectorAll("*"))) {
      for (const attr of Array.from(el.attributes)) expect(attr.name).not.toMatch(/^on/i);
    }
  });

  it("escapes HTML inside code, headings, lists, tables and emphasis", () => {
    const c = html(
      [
        "# <b>Title</b>",
        "",
        "- **<i>bold</i>**",
        "- `<svg onload=alert(1)>`",
        "",
        "| a | b |",
        "|---|---|",
        "| <u>x</u> | y |",
        "",
        "```",
        "<iframe src=//evil></iframe>",
        "```",
      ].join("\n"),
    );
    expect(c.querySelector("b, i, u, svg, iframe")).toBeNull();
    expect(c.querySelector("h1")?.textContent).toBe("<b>Title</b>");
    expect(c.querySelector("strong")?.textContent).toBe("<i>bold</i>");
    expect(c.querySelector("code")?.textContent).toBe("<svg onload=alert(1)>");
    expect(c.querySelector("td")?.textContent).toBe("<u>x</u>");
    expect(c.querySelector("pre")?.textContent).toContain("<iframe");
  });

  it("renders the supported subset", () => {
    const c = html(
      "## Section\n\nSome *italic* and **bold** text with a [link](/legal/terms).\n\n1. one\n2. two\n\n- a\n- b\n\n> quoted\n\n---",
    );
    expect(c.querySelector("h2")?.textContent).toBe("Section");
    expect(c.querySelector("em")?.textContent).toBe("italic");
    expect(c.querySelector("strong")?.textContent).toBe("bold");
    const a = c.querySelector("a");
    expect(a?.getAttribute("href")).toBe("/legal/terms");
    expect(a?.hasAttribute("target")).toBe(false);
    expect(c.querySelectorAll("ol li")).toHaveLength(2);
    expect(c.querySelectorAll("ul li")).toHaveLength(2);
    expect(c.querySelector("blockquote")?.textContent).toContain("quoted");
    expect(c.querySelector("hr")).not.toBeNull();
  });

  it("supports a heading offset", () => {
    const c = render(<Markdown source={"# Top"} headingOffset={1} />).container;
    expect(c.querySelector("h1")).toBeNull();
    expect(c.querySelector("h2")?.textContent).toBe("Top");
  });

  it("does not treat snake_case as emphasis", () => {
    const blocks = parseMarkdown("use org_profile_id here");
    expect(JSON.stringify(blocks)).not.toContain('"em"');
  });
});
