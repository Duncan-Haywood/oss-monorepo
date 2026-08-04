/**
 * The rate limiter is the only thing standing between the anonymous write
 * endpoints and unbounded row creation, and it had no test.
 * `docs/PULL-REQUEST-BACKLOG.md` recorded it as the one genuinely distinct,
 * uncarried item across twenty-five pull requests — PR #4 wrote one, but
 * against a different table design (`RateLimitEvent`, not `AnonRequestLog`),
 * so it could not be ported.
 *
 * What is worth asserting here is narrow but real: the boundary condition (a
 * limit of `max` must allow `max` requests and reject the next, not `max - 1`),
 * the window, and the fact that the count is scoped to one IP and one route
 * rather than shared. An off-by-one in either direction is invisible in
 * production — it either locks out a real couple or lets a script through —
 * and neither shows up as an error anywhere.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type CountArgs = { where: { ip: string; route: string; createdAt: { gte: Date } } };

const count = vi.fn<(args: CountArgs) => Promise<number>>(async () => 0);
const create = vi.fn<(args: { data: { ip: string; route: string } }) => Promise<object>>(async () => ({}));
const deleteMany = vi.fn(async () => ({ count: 0 }));
const transaction = vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations));

vi.mock("@/lib/prisma", () => ({
  prisma: { anonRequestLog: { count, create, deleteMany }, $transaction: transaction },
}));

const { getClientIp, isWriteRateLimited, recordWrite } = await import("@/lib/rateLimit");
const { rateLimitKey } = await import("@/lib/http");

beforeEach(() => {
  count.mockClear();
  create.mockClear();
  deleteMany.mockClear();
  transaction.mockClear();
});

/** The `where` clause the limiter built for its count query. */
function whereClause(): CountArgs["where"] {
  return count.mock.calls[0][0].where;
}

describe("isWriteRateLimited", () => {
  it("allows a caller who is exactly at the limit minus one", async () => {
    count.mockResolvedValueOnce(4);
    expect(await isWriteRateLimited("1.2.3.4", "session/start", 5)).toBe(false);
  });

  it("rejects the request that would exceed the limit, not the one before it", async () => {
    // The boundary that matters: `max` requests are allowed, the next is not.
    count.mockResolvedValueOnce(5);
    expect(await isWriteRateLimited("1.2.3.4", "session/start", 5)).toBe(true);
  });

  it("stays rejected once past the limit", async () => {
    count.mockResolvedValueOnce(500);
    expect(await isWriteRateLimited("1.2.3.4", "session/start", 5)).toBe(true);
  });

  it("counts only this IP and this route", async () => {
    await isWriteRateLimited("9.9.9.9", "couple/create", 3);
    const where = whereClause();
    expect(where.ip).toBe(rateLimitKey("9.9.9.9"));
    expect(where.ip).not.toContain("9.9.9.9");
    expect(where.route).toBe("couple/create");
  });

  it("counts only inside the fifteen-minute window", async () => {
    const before = Date.now();
    await isWriteRateLimited("1.2.3.4", "session/start", 5);
    const after = Date.now();

    const gte = whereClause().createdAt.gte.getTime();
    const WINDOW_MS = 15 * 60 * 1000;
    // Bounded on both sides rather than compared to a re-computed `Date.now()`,
    // which would be flaky whenever the clock ticks mid-test.
    expect(gte).toBeGreaterThanOrEqual(before - WINDOW_MS);
    expect(gte).toBeLessThanOrEqual(after - WINDOW_MS);
  });

  it("does not write anything while checking", async () => {
    await isWriteRateLimited("1.2.3.4", "session/start", 5);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("recordWrite", () => {
  it("logs a keyed digest rather than the raw IP", async () => {
    await recordWrite("5.6.7.8", "feedback");
    expect(create).toHaveBeenCalledWith({
      data: { ip: rateLimitKey("5.6.7.8"), route: "feedback" },
    });
    expect(create.mock.calls[0][0].data.ip).not.toContain("5.6.7.8");
  });
});

describe("getClientIp", () => {
  it("takes the leftmost x-forwarded-for entry — the real client behind the proxy", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9, 70.41.3.18, 150.172.238.178" });
    expect(getClientIp(headers)).toBe("203.0.113.9");
  });

  it("trims whitespace around the entry", () => {
    expect(getClientIp(new Headers({ "x-forwarded-for": "  203.0.113.9  , 70.41.3.18" }))).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip", () => {
    expect(getClientIp(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("prefers x-forwarded-for when both are present", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9", "x-real-ip": "198.51.100.1" });
    expect(getClientIp(headers)).toBe("203.0.113.9");
  });

  it("returns a constant rather than throwing when neither header is set", () => {
    // Every caller with no proxy headers shares one bucket. That is coarse and
    // deliberate: it fails toward limiting an unknown caller, not toward
    // exempting them.
    expect(getClientIp(new Headers())).toBe("unknown");
  });
});
