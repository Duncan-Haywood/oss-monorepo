import { describe, expect, it } from "vitest";
import { isUnderBase, normalizeBasePath, stripBase, withBase } from "./base-path";

describe("normalizeBasePath", () => {
  it("treats empty values as the host root", () => {
    for (const raw of [undefined, null, "", "/", "//", " / "])
      expect(normalizeBasePath(raw)).toBe("");
  });

  it("normalizes slashes", () => {
    for (const raw of ["/grants", "grants", "/grants/", "grants/", "//grants//"]) {
      expect(normalizeBasePath(raw)).toBe("/grants");
    }
    expect(normalizeBasePath("/a/b/")).toBe("/a/b");
  });

  it("rejects anything that is not a plain path", () => {
    for (const raw of [
      "https://x.org/grants",
      "/../x",
      "/a b",
      "/grants?x=1",
      "/gr%61nts",
      "/./x",
    ]) {
      expect(() => normalizeBasePath(raw)).toThrow(/Invalid base path/);
    }
  });
});

describe("withBase", () => {
  it("is a no-op without a base", () => {
    expect(withBase("", "/api/me")).toBe("/api/me");
    expect(withBase("", "/")).toBe("/");
  });

  it("prefixes root-relative paths", () => {
    expect(withBase("/grants", "/api/me")).toBe("/grants/api/me");
    expect(withBase("/grants", "/")).toBe("/grants/");
    expect(withBase("/grants", "/login?next=/orgs/x")).toBe("/grants/login?next=/orgs/x");
    expect(withBase("/grants", "/grantsx")).toBe("/grants/grantsx");
  });

  it("is idempotent", () => {
    for (const p of ["/grants", "/grants/", "/grants/api/me", "/grants?x=1", "/grants#top"]) {
      expect(withBase("/grants", p)).toBe(p);
      expect(withBase("/grants", withBase("/grants", p))).toBe(p);
    }
  });

  it("leaves non root-relative values alone", () => {
    for (const p of [
      "https://x.org/a",
      "//evil.test/a",
      "/\\evil",
      "#help",
      "mailto:a@b.c",
      "me",
    ]) {
      expect(withBase("/grants", p)).toBe(p);
    }
  });
});

describe("stripBase / isUnderBase", () => {
  it("strips the prefix", () => {
    expect(stripBase("/grants", "/grants/api/me")).toBe("/api/me");
    expect(stripBase("/grants", "/grants/")).toBe("/");
    expect(stripBase("/grants", "/grants")).toBe("/");
    expect(stripBase("", "/api/me")).toBe("/api/me");
  });

  it("returns null outside the base", () => {
    expect(stripBase("/grants", "/")).toBeNull();
    expect(stripBase("/grants", "/api/me")).toBeNull();
    expect(stripBase("/grants", "/grantsx/api")).toBeNull();
  });

  it("matches whole segments only", () => {
    expect(isUnderBase("/grants", "/grants/x")).toBe(true);
    expect(isUnderBase("/grants", "/grantsx")).toBe(false);
    expect(isUnderBase("", "/anything")).toBe(true);
  });
});
