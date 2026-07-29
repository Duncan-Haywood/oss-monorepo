import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

describe("liveness", () => {
  it("does not depend on the database", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});
