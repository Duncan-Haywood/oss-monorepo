/**
 * The swipe loop's own "what happens next" endpoint had no try/catch at
 * all — a database error here surfaced as an unhandled rejection with
 * nothing in the response but a blank failure. This asserts the route
 * itself turns a thrown error into a JSON 500 instead of propagating it.
 *
 * Run against the pre-fix route, `post()` below rejects instead of
 * resolving, which is what an unhandled rejection looks like from the
 * caller's side — this test fails there and passes here.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    participant: {
      findUnique: vi.fn(async () => {
        throw new Error("connection reset");
      }),
    },
  },
}));

import { POST } from "./route";

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/trials/next", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as never
  );
}

describe("POST /api/trials/next", () => {
  it("turns a database failure into a 500 instead of an unhandled rejection", async () => {
    const res = await post({ participantId: "p1" });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBeTruthy();
  });

  it("still validates the body before touching the database", async () => {
    const res = await post({});

    expect(res.status).toBe(400);
  });
});
