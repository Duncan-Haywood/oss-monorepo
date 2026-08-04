import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: query } }));

import { GET } from "@/app/api/health/ready/route";

describe("readiness during a database outage", () => {
  beforeEach(() => {
    query.mockReset();
  });

  it("returns a retryable 503 without leaking the database error", async () => {
    query.mockRejectedValueOnce(new Error("postgres://secret@host/database"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Retry-After")).toBe("5");
    await expect(response.json()).resolves.toEqual({ status: "unavailable" });
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });
});
