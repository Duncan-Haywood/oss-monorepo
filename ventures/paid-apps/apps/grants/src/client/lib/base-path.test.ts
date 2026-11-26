import { describe, expect, it } from "vitest";
import { apiUrl, appPath, BASE_PATH, routerPath } from "./base-path";

// Unit tests build without a base (Vite's BASE_URL is "/"); the prefixing rules themselves are covered
// in src/shared/base-path.test.ts.
describe("client base path", () => {
  it("is empty in tests and dev", () => {
    expect(BASE_PATH).toBe("");
  });

  it("builds API URLs", () => {
    expect(apiUrl("/api/me")).toBe("/api/me");
    expect(apiUrl("me")).toBe("/api/me");
    expect(apiUrl("orgs/o1/facts")).toBe("/api/orgs/o1/facts");
  });

  it("passes app paths and router paths through", () => {
    expect(appPath("/legal/terms")).toBe("/legal/terms");
    expect(appPath("https://example.org/x")).toBe("https://example.org/x");
    expect(routerPath("/orgs/o1")).toBe("/orgs/o1");
  });
});
