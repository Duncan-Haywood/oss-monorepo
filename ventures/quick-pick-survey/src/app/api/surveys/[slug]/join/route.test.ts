import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn(async (args: { data: Record<string, unknown> }) => ({ id: `p-${args.data.surveyId}` }));
const findUnique = vi.fn();
const limited = vi.fn(async () => false);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    survey: { findUnique: (a: unknown) => findUnique(a) },
    participant: { create: (a: { data: Record<string, unknown> }) => create(a) },
  },
}));
vi.mock("@/lib/rateLimit", () => ({
  getClientIp: () => "127.0.0.1",
  isWriteRateLimited: () => limited(),
  recordWrite: async () => {},
}));

import { POST } from "./route";

function join(slug = "movies") {
  return POST(new Request(`http://localhost/api/surveys/${slug}/join`, { method: "POST" }) as never, {
    params: Promise.resolve({ slug }),
  });
}

describe("POST /api/surveys/[slug]/join", () => {
  beforeEach(() => {
    create.mockClear();
    limited.mockResolvedValue(false);
    findUnique.mockResolvedValue({ id: "s1", kind: "ITEMS", _count: { items: 5 } });
  });

  it("creates one anonymous participant on that survey only", async () => {
    const res = await join();
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ participantId: "p-s1" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).toEqual({ surveyId: "s1", firstName: "Anonymous" });
  });

  it("404s an unknown survey and a non-item survey, writing nothing", async () => {
    findUnique.mockResolvedValueOnce(null);
    expect((await join("nope")).status).toBe(404);
    findUnique.mockResolvedValueOnce({ id: "s2", kind: "FINANCIAL", _count: { items: 9 } });
    expect((await join("fin")).status).toBe(404);
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses a survey with fewer than two items", async () => {
    findUnique.mockResolvedValueOnce({ id: "s3", kind: "ITEMS", _count: { items: 1 } });
    expect((await join()).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("429s over the per-IP limit", async () => {
    limited.mockResolvedValue(true);
    expect((await join()).status).toBe(429);
    expect(create).not.toHaveBeenCalled();
  });
});
