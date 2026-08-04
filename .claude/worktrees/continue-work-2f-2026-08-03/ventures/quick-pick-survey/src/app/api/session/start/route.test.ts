/**
 * The first test against an API route in this repo.
 *
 * There is no Postgres in CI or in an agent sandbox, so the real integration
 * gap (see docs/TESTING.md) is still open. This stands in for the part of it
 * that matters most here: what this route is willing to write about a person.
 * Prisma is stubbed and the assertion is on the payload handed to it, which
 * is exactly the thing a database would not tell you anyway — a column that
 * should never have been written looks identical to one nobody filled in.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn(async (args: { data: Record<string, unknown> }) => ({ id: `p-${args.data.surveyId}` }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    survey: { findMany: vi.fn(async () => [{ id: "s1", slug: "activities", title: "Activities", kind: "ITEMS" }]) },
    participant: {
      create: (args: { data: Record<string, unknown> }) => create(args),
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
  },
}));

// Anonymous callers only — a signed-in account takes the reuse path instead
// of creating anything, which is not what these tests are about.
vi.mock("@/lib/auth", () => ({ getSessionUser: vi.fn(async () => null) }));

vi.mock("@/lib/rateLimit", () => ({
  getClientIp: () => "127.0.0.1",
  isWriteRateLimited: async () => false,
  recordWrite: async () => {},
}));

import { POST } from "./route";

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as never
  );
}

describe("POST /api/session/start", () => {
  beforeEach(() => {
    create.mockClear();
  });

  it("creates a participant from a first name and a perspective", async () => {
    const res = await post({ firstName: "Ada", perspective: "PARTNER" });

    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).toEqual({
      surveyId: "s1",
      userId: null,
      perspective: "PARTNER",
      firstName: "Ada",
    });
  });

  it("stores nothing from the profile fields the old intro form used to send", async () => {
    // The exact body the deleted form posted. Every field here is either
    // special-category data or directly identifying, and no screen in the
    // product asks for any of it any more. Sending it must not be a way to
    // get it into the database.
    await post({
      firstName: "Ada",
      perspective: "SELF",
      lastName: "Lovelace",
      email: "ada@example.com",
      sex: "Female",
      age: 36,
      ethnicity: "British",
      countryOfResidence: "England",
    });

    const written = create.mock.calls[0][0].data;
    for (const field of ["lastName", "email", "sex", "age", "ethnicity", "countryOfResidence"]) {
      expect(written).not.toHaveProperty(field);
    }
  });

  it("rejects a request with no first name rather than inventing one", async () => {
    const res = await post({ perspective: "SELF" });

    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});
