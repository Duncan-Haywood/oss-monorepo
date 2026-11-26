import { describe, expect, it } from "vitest";
import { api } from "./helpers";

describe("GET /api/health", () => {
  it("reports ok with the database reachable", async () => {
    const res = await api("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, env: "test" });
  });

  it("returns JSON 404 for unknown API routes", async () => {
    const res = await api("/api/nope");
    expect(res.status).toBe(404);
  });
});
