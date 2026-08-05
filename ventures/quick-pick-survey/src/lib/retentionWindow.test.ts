/**
 * The invariant behind every rate limiter in this app: a limiter's retention
 * must outlast the window it counts over.
 *
 * The failure this file exists to prevent is silent. `recordWrite` and
 * `recordLoginAttempt` each run a `deleteMany` of rows older than retention in
 * the same transaction as the row they are recording, while
 * `isWriteRateLimited` and `isLoginRateLimited` count rows newer than the
 * window. Lower retention below the window — the obvious, well-intentioned
 * edit for a data-minimisation pass, made in a different file from the one
 * that counts — and the reaper deletes the evidence before it can be counted.
 * Every count comes back near zero. All seven anonymous write limiters and
 * both login lockouts stop limiting. No error is raised, no `MAX_*` constant
 * changes, no test that mocks the database notices, and the endpoints keep
 * answering 200. The only observable difference is that abuse succeeds.
 *
 * Three kinds of check, because each catches a different way the invariant can
 * be lost:
 *
 *   - the guard itself rejects an unsafe pair (someone lowers a number),
 *   - the real limiter modules are wired to the guard, checked by reading
 *     their source (someone removes the call and keeps the numbers), and
 *   - a sweep over `src` catches a *new* limiter that never enrolled.
 *
 * The source-level checks are deliberate. A test that mocked
 * `@/lib/retentionWindow` would pass with the guard deleted, which is exactly
 * the regression worth catching, so nothing here mocks it. `@/lib/prisma` is
 * mocked — the database is not where this invariant lives.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { MIN_RETENTION_FACTOR, checkedRetentionMs } from "@/lib/retentionWindow";

const count = vi.fn<(args: { where: { createdAt: { gte: Date } } }) => Promise<number>>(async () => 0);
const deleteMany = vi.fn<(args: { where: { createdAt: { lt: Date } } }) => Promise<object>>(async () => ({ count: 0 }));
const create = vi.fn(async () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    anonRequestLog: { count, create, deleteMany },
    loginAttempt: { count, create, deleteMany },
    adminLoginAttempt: { count, create, deleteMany },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  },
}));

const MINUTE = 60 * 1000;

describe("checkedRetentionMs", () => {
  it("returns the retention it was given when it safely covers the window", () => {
    expect(checkedRetentionMs("test", 15 * MINUTE, 24 * 60 * MINUTE)).toBe(24 * 60 * MINUTE);
  });

  it("throws when retention is shorter than the window", () => {
    // The data-minimisation edit: 15-minute window, 5-minute retention. The
    // reaper now deletes rows two thirds of the way through the window it is
    // counted over, so no caller ever reaches their limit.
    expect(() => checkedRetentionMs("test", 15 * MINUTE, 5 * MINUTE)).toThrow(/at least/i);
  });

  it("throws when retention exactly equals the window", () => {
    // Equal is not safe: two serverless instances with clocks a second apart
    // put the reaper's cutoff inside the other's counting window.
    expect(() => checkedRetentionMs("test", 15 * MINUTE, 15 * MINUTE)).toThrow();
  });

  it("throws when retention clears the window but not the required margin", () => {
    expect(() => checkedRetentionMs("test", 15 * MINUTE, 15 * MINUTE * MIN_RETENTION_FACTOR - 1)).toThrow();
    expect(checkedRetentionMs("test", 15 * MINUTE, 15 * MINUTE * MIN_RETENTION_FACTOR)).toBeGreaterThan(0);
  });

  it("keeps a margin of more than one window", () => {
    expect(MIN_RETENTION_FACTOR).toBeGreaterThan(1);
  });

  it("names the limiter and both numbers, so the fix is obvious from the error alone", () => {
    let message = "";
    try {
      checkedRetentionMs("auth.loginAttempt", 15 * MINUTE, MINUTE);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("auth.loginAttempt");
    expect(message).toContain(String(MINUTE));
    expect(message).toContain(String(15 * MINUTE));
  });

  it("rejects a window or retention that is not a positive number", () => {
    expect(() => checkedRetentionMs("test", 0, 60 * MINUTE)).toThrow();
    expect(() => checkedRetentionMs("test", -1, 60 * MINUTE)).toThrow();
    expect(() => checkedRetentionMs("test", Number.NaN, 60 * MINUTE)).toThrow();
    expect(() => checkedRetentionMs("test", 15 * MINUTE, 0)).toThrow();
    expect(() => checkedRetentionMs("test", 15 * MINUTE, Number.NaN)).toThrow();
    expect(() => checkedRetentionMs("test", 15 * MINUTE, Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe("the limiters this app actually runs", () => {
  it("keeps every retention safely clear of its own window", async () => {
    const rateLimit = await import("@/lib/rateLimit");
    const auth = await import("@/lib/auth");
    const adminAuth = await import("@/lib/adminAuth");

    const pairs: Array<[string, number, number]> = [
      ["anonymous writes", rateLimit.WINDOW_MS, rateLimit.RETENTION_MS],
      ["account login", auth.WINDOW_MS, auth.ATTEMPT_RETENTION_MS],
      ["admin login", adminAuth.RATE_LIMIT_WINDOW_MS, adminAuth.ATTEMPT_RETENTION_MS],
    ];

    for (const [name, windowMs, retentionMs] of pairs) {
      expect(windowMs, `${name}: window`).toBeGreaterThan(0);
      expect(retentionMs, `${name}: retention must outlast its window`).toBeGreaterThanOrEqual(
        windowMs * MIN_RETENTION_FACTOR,
      );
    }
  });
});

describe("recordWrite's reaper against isWriteRateLimited's window", () => {
  beforeEach(() => {
    count.mockClear();
    create.mockClear();
    deleteMany.mockClear();
  });

  it("never deletes a row the counter would still have counted", async () => {
    // Expressed against the two queries the module really builds, so it holds
    // whatever the constants are named or how they are computed.
    const { isWriteRateLimited, recordWrite } = await import("@/lib/rateLimit");

    await isWriteRateLimited("1.2.3.4", "feedback", 5);
    const windowStart = count.mock.calls[0][0].where.createdAt.gte.getTime();

    await recordWrite("1.2.3.4", "feedback");
    const reaperCutoff = deleteMany.mock.calls[0][0].where.createdAt.lt.getTime();

    expect(reaperCutoff).toBeLessThan(windowStart);
  });
});

/**
 * Reading source rather than behaviour: these fail when the guard is removed
 * while the numbers still happen to be fine, which is the state in which the
 * next well-meant retention edit lands unchecked.
 */
const LIMITER_SOURCES = [
  {
    file: "src/lib/rateLimit.ts",
    subject: "rateLimit.anonRequestLog",
    retention: "RETENTION_MS",
    window: "WINDOW_MS",
  },
  {
    file: "src/lib/auth.ts",
    subject: "auth.loginAttempt",
    retention: "ATTEMPT_RETENTION_MS",
    window: "WINDOW_MS",
  },
  {
    file: "src/lib/adminAuth.ts",
    subject: "adminAuth.adminLoginAttempt",
    retention: "ATTEMPT_RETENTION_MS",
    window: "RATE_LIMIT_WINDOW_MS",
  },
] as const;

function read(file: string): string {
  return readFileSync(join(process.cwd(), file), "utf8");
}

describe.each(LIMITER_SOURCES)("$file declares its retention through the guard", (limiter) => {
  it("imports the guard", () => {
    expect(read(limiter.file)).toMatch(/import \{[^}]*checkedRetentionMs[^}]*\} from "@\/lib\/retentionWindow"/);
  });

  it("assigns its retention constant from checkedRetentionMs, against its own window constant", () => {
    const declaration = new RegExp(
      `${limiter.retention}\\s*=\\s*checkedRetentionMs\\(\\s*"${limiter.subject}",\\s*${limiter.window}\\s*,`,
    );
    expect(read(limiter.file)).toMatch(declaration);
  });

  it("reaps with the checked retention constant, not a separate number", () => {
    const reaper = new RegExp(`deleteMany\\([\\s\\S]{0,200}?Date\\.now\\(\\) - ${limiter.retention}\\)`);
    expect(read(limiter.file)).toMatch(reaper);
  });

  it("counts over the same window constant the guard was given", () => {
    expect(read(limiter.file)).toMatch(new RegExp(`Date\\.now\\(\\) - ${limiter.window}\\)`));
  });
});

describe("enrolment", () => {
  function sourceFiles(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next") continue;
        sourceFiles(full, found);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        found.push(full);
      }
    }
    return found;
  }

  it("routes every windowed-count-plus-reaper module through the guard", () => {
    // A limiter added later has the same two halves and the same silent
    // failure. Anything that both counts rows inside a window and deletes rows
    // outside a retention has to say how the two relate.
    const unenrolled = sourceFiles(join(process.cwd(), "src"))
      .map((file) => ({ file, text: readFileSync(file, "utf8") }))
      .filter(({ text }) => /\.count\(/.test(text) && /createdAt: \{ gte:/.test(text))
      .filter(({ text }) => /deleteMany\(/.test(text) && /createdAt: \{ lt:/.test(text))
      .filter(({ text }) => !/checkedRetentionMs\(/.test(text))
      .map(({ file }) => relative(process.cwd(), file));

    expect(unenrolled).toEqual([]);
  });

  it("still sees the three limiters it was written for", () => {
    // Guards the sweep above against becoming vacuous: if the detection stops
    // matching, the previous test passes over an empty set.
    const enrolled = sourceFiles(join(process.cwd(), "src"))
      .map((file) => ({ file, text: readFileSync(file, "utf8") }))
      .filter(({ text }) => /\.count\(/.test(text) && /createdAt: \{ gte:/.test(text))
      .filter(({ text }) => /deleteMany\(/.test(text) && /createdAt: \{ lt:/.test(text))
      .map(({ file }) => relative(process.cwd(), file))
      .sort();

    expect(enrolled).toEqual(LIMITER_SOURCES.map(({ file }) => file).slice().sort());
  });
});
