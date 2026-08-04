import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/ready/route";

describe("readiness", () => {
  it("reports ready only after Postgres accepts a query", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ready" });
  });
});
