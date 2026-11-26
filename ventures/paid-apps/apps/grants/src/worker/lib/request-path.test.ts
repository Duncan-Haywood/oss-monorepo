import { describe, expect, it } from "vitest";
import { withBasePath, withPathname } from "./request-path";

describe("withPathname", () => {
  it("returns the same request when nothing changes", () => {
    const req = new Request("https://marisstella.app/api/me?x=1");
    expect(withPathname(req, "/api/me")).toBe(req);
  });

  it("moves the request and keeps method, headers, query and body", async () => {
    const req = new Request("https://marisstella.app/grants/api/orgs?x=1", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://marisstella.app" },
      body: JSON.stringify({ a: 1 }),
    });
    const moved = withPathname(req, "/api/orgs");
    expect(moved.url).toBe("https://marisstella.app/api/orgs?x=1");
    expect(moved.method).toBe("POST");
    expect(moved.headers.get("origin")).toBe("https://marisstella.app");
    expect(await moved.json()).toEqual({ a: 1 });
  });
});

describe("withBasePath", () => {
  it("puts the base path back for Better Auth", () => {
    const req = new Request("https://marisstella.app/api/auth/get-session?x=1");
    expect(withBasePath(req, "/grants").url).toBe(
      "https://marisstella.app/grants/api/auth/get-session?x=1",
    );
  });

  it("is a no-op without a base path or when already prefixed", () => {
    const req = new Request("http://localhost:5173/api/auth/get-session");
    expect(withBasePath(req, "")).toBe(req);
    expect(withBasePath(req, undefined)).toBe(req);
    const prefixed = new Request("https://marisstella.app/grants/api/auth/ok");
    expect(withBasePath(prefixed, "/grants")).toBe(prefixed);
  });
});
