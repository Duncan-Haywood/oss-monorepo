import { describe, expect, it } from "vitest";
import { sameOriginPath } from "./safe-next";

const ORIGIN = "https://books.example";

describe("sameOriginPath", () => {
  it("keeps same-origin paths with their query and hash", () => {
    expect(sameOriginPath("/orgs", ORIGIN)).toBe("/orgs");
    expect(sameOriginPath("/invite/abc?x=1#top", ORIGIN)).toBe("/invite/abc?x=1#top");
  });

  it("refuses anything that resolves to another origin or scheme", () => {
    for (const bad of [
      "//evil.example/x",
      "/\\evil.example",
      "/\\/evil.example",
      "\\\\evil.example",
      "https://evil.example/",
      "javascript:alert(1)",
      "evil.example",
      "",
      null,
      undefined,
    ]) {
      expect(sameOriginPath(bad, ORIGIN), String(bad)).toBeNull();
    }
  });
});
