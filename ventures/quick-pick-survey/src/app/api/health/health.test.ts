import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

describe("liveness", () => {
  it("does not depend on the database", async () => {
    const originalRevision = process.env.RELEASE_REVISION;
    delete process.env.RELEASE_REVISION;
    const response = await GET();
    if (originalRevision === undefined) delete process.env.RELEASE_REVISION;
    else process.env.RELEASE_REVISION = originalRevision;
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("identifies the deployed revision when one is injected", async () => {
    const originalRevision = process.env.RELEASE_REVISION;
    process.env.RELEASE_REVISION = "0123456789abcdef0123456789abcdef01234567";
    const response = await GET();
    if (originalRevision === undefined) delete process.env.RELEASE_REVISION;
    else process.env.RELEASE_REVISION = originalRevision;
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      revision: "0123456789abcdef0123456789abcdef01234567",
    });
  });
});
