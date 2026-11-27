import { describe, expect, it } from "vitest";
import { apiUrl, appPath, BASE_PATH, routerPath, safeNextPath } from "./base-path";

// Unit tests build without a base (Vite's BASE_URL is "/"); the prefixing rules themselves are covered
// in src/shared/base-path.test.ts.
describe("client base path", () => {
  it("is empty in tests and dev", () => {
    expect(BASE_PATH).toBe("");
  });

  it("builds API URLs", () => {
    expect(apiUrl("/api/me")).toBe("/api/me");
    expect(apiUrl("me")).toBe("/api/me");
    expect(apiUrl("orgs/o1/sales")).toBe("/api/orgs/o1/sales");
  });

  it("passes app paths and router paths through", () => {
    expect(appPath("/legal/terms")).toBe("/legal/terms");
    expect(appPath("https://example.org/x")).toBe("https://example.org/x");
    expect(routerPath("/orgs/o1")).toBe("/orgs/o1");
  });
});

describe("safeNextPath", () => {
  it("keeps same-origin paths with their query and hash", () => {
    expect(safeNextPath("/orgs")).toBe("/orgs");
    expect(safeNextPath("/invite?token=abc")).toBe("/invite?token=abc");
    expect(safeNextPath("/o/o1#sales")).toBe("/o/o1#sales");
  });

  it("refuses anything that leaves the origin or isn't a path", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "orgs",
      "https://evil.example/",
      "//evil.example/",
      "/\\evil.example/",
      "/\t/evil.example/",
      "javascript:alert(1)",
    ]) {
      expect(safeNextPath(bad)).toBeNull();
    }
  });
});
