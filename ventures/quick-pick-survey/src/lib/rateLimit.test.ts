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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CountArgs = { where: { ip: string; route: string; createdAt: { gte: Date } } };
type CreateArgs = { data: { ip: string; route: string } };
type DeleteManyArgs = { where: { createdAt: { lt: Date } } };

/**
 * A standing `AnonRequestLog`, so the sweep and the count meet the same rows
 * they meet in production instead of two unrelated mock return values.
 * `createdAt` is stamped at insert time because the real column is
 * `@default(now())` — the database decides it, and both the sweep and the
 * count key off it.
 */
let rows: { ip: string; route: string; createdAt: Date }[] = [];

const count = vi.fn<(args: CountArgs) => Promise<number>>(
  async ({ where }) =>
    rows.filter((row) => row.ip === where.ip && row.route === where.route && row.createdAt >= where.createdAt.gte)
      .length,
);
const create = vi.fn<(args: CreateArgs) => Promise<object>>(async ({ data }) => {
  const row = { ...data, createdAt: new Date() };
  rows.push(row);
  return row;
});
const deleteMany = vi.fn<(args: DeleteManyArgs) => Promise<{ count: number }>>(async ({ where }) => {
  const before = rows.length;
  rows = rows.filter((row) => row.createdAt >= where.createdAt.lt);
  return { count: before - rows.length };
});
const transaction = vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations));

vi.mock("@/lib/prisma", () => ({
  prisma: { anonRequestLog: { count, create, deleteMany }, $transaction: transaction },
}));

const { getClientIp, isWriteRateLimited, recordWrite, RETENTION_MS, WINDOW_MS } = await import("@/lib/rateLimit");
const { rateLimitKey } = await import("@/lib/http");

beforeEach(() => {
  rows = [];
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
    expect(WINDOW_MS).toBe(15 * 60 * 1000);
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

/**
 * The window and the retention period are two constants that read as
 * independent and are not. `recordWrite` sweeps rows older than RETENTION_MS
 * in the same `$transaction` that inserts the new row, and those are the rows
 * `isWriteRateLimited` counts — so the window actually enforced is
 * `min(WINDOW_MS, RETENTION_MS)`.
 *
 * Set retention below the window and every anonymous write limit loosens
 * silently: no error, no log, `MAX_STARTS_PER_IP` and its five siblings still
 * read exactly as before, and the endpoints keep returning 200. These tests
 * fail on that inversion with the module-load guard removed, which is the
 * point — the guard and the behaviour it protects are checked separately.
 */
describe("the retention sweep must outlive the counting window", () => {
  const IP = "198.51.100.7";
  const ROUTE = "session/start";

  afterEach(() => {
    vi.useRealTimers();
  });

  it("still counts earlier writes in the window after a later write sweeps", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    // Three writes as the window opens...
    await recordWrite(IP, ROUTE);
    await recordWrite(IP, ROUTE);
    await recordWrite(IP, ROUTE);

    // ...and a fourth a minute before it closes. Its sweep runs in the same
    // transaction as its insert and must not carry off the first three.
    vi.advanceTimersByTime(WINDOW_MS - 60_000);
    await recordWrite(IP, ROUTE);

    // Four writes inside one window is the fourth caller's limit reached. With
    // retention below the window this is `false`: the sweep emptied the table
    // and the caller may keep going indefinitely.
    expect(await isWriteRateLimited(IP, ROUTE, 4)).toBe(true);
  });

  it("sweeps only rows already older than the window it counts", async () => {
    const before = Date.now();
    await recordWrite(IP, ROUTE);
    const after = Date.now();

    const cutoff = deleteMany.mock.calls[0][0].where.createdAt.lt.getTime();
    // Nothing the count can still see may be eligible for deletion.
    expect(cutoff).toBeLessThan(before - WINDOW_MS);
    expect(cutoff).toBeGreaterThanOrEqual(before - RETENTION_MS);
    expect(cutoff).toBeLessThanOrEqual(after - RETENTION_MS);
  });

  it("declares retention longer than the window", () => {
    expect(RETENTION_MS).toBeGreaterThan(WINDOW_MS);
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
