import { describe, expect, it } from "vitest";
import { markdownCell } from "./markdown";

/** Splits one table row on unescaped pipes, the way a GFM renderer finds cell boundaries. */
const cells = (row: string) => row.split(/(?<!\\)(?:\\\\)*\|/).length;

describe("markdownCell", () => {
  it("escapes pipes and flattens line breaks", () => {
    expect(markdownCell("a|b\r\nc\nd")).toBe("a\\|b c d");
  });

  it("escapes backslashes before pipes, so a trailing backslash cannot unescape the pipe", () => {
    expect(markdownCell("a\\|b")).toBe("a\\\\\\|b");
    expect(markdownCell("C:\\temp\\")).toBe("C:\\\\temp\\\\");
    expect(cells(`| ${markdownCell("x\\|y")} | z |`)).toBe(cells("| v | z |"));
  });
});
