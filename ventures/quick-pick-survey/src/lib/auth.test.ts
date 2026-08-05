import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import {
  PRODUCTION_BCRYPT_ROUNDS,
  TEST_BCRYPT_ROUNDS,
  absentAccountHash,
  assertHashStrength,
  bcryptCost,
  hashPassword,
  hashToken,
  isValidEmail,
  normalizeEmail,
  passwordProblem,
  resolveBcryptRounds,
  verifyPassword,
} from "./auth";

/** The cost baked into a modular-crypt bcrypt string: `$2b$12$…` → 12. */
function costOf(hash: string): number {
  const match = /^\$2[aby]\$(\d{2})\$/.exec(hash);
  if (!match) throw new Error(`not a bcrypt hash: ${hash.slice(0, 12)}…`);
  return Number(match[1]);
}

describe("auth helpers", () => {
  describe("normalizeEmail", () => {
    it("lowercases and trims email addresses", () => {
      expect(normalizeEmail("  USER@Example.COM  ")).toBe("user@example.com");
      expect(normalizeEmail("Test.Name@Domain.org")).toBe("test.name@domain.org");
    });
  });

  describe("isValidEmail", () => {
    it("accepts valid structural email addresses", () => {
      expect(isValidEmail("user@example.com")).toBe(true);
      expect(isValidEmail("first.last+tag@sub.domain.co.uk")).toBe(true);
    });

    it("rejects malformed email addresses", () => {
      expect(isValidEmail("plainaddress")).toBe(false);
      expect(isValidEmail("@missingusername.com")).toBe(false);
      expect(isValidEmail("user@.com")).toBe(false);
      expect(isValidEmail("user@domain")).toBe(false);
      expect(isValidEmail("user name@domain.com")).toBe(false);
      expect(isValidEmail("a".repeat(201) + "@example.com")).toBe(false);
    });
  });

  describe("passwordProblem", () => {
    it("returns null for strong compliant passwords", () => {
      expect(passwordProblem("SecurePass123")).toBeNull();
      expect(passwordProblem("aLongEnoughPasswordWith1Digit")).toBeNull();
    });

    it("requires at least 10 characters", () => {
      expect(passwordProblem("Short1")).toBe("Password must be at least 10 characters.");
    });

    it("requires at least one letter and one number", () => {
      expect(passwordProblem("1234567890")).toBe("Password needs at least one letter and one number.");
      expect(passwordProblem("abcdefghijk")).toBe("Password needs at least one letter and one number.");
    });

    it("rejects excessively long passwords", () => {
      const hugePassword = "a1" + "b".repeat(200);
      expect(passwordProblem(hugePassword)).toBe("Password is too long.");
    });
  });

  describe("hashToken", () => {
    it("produces deterministic sha256 hex digest", () => {
      const token = "sample-secret-token";
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("hashPassword & verifyPassword", () => {
    it("hashes password securely and verifies match", async () => {
      const plain = "SuperSecretPassword123";
      const hash = await hashPassword(plain);
      expect(hash).not.toBe(plain);
      expect(await verifyPassword(plain, hash)).toBe(true);
      expect(await verifyPassword("WrongPassword123", hash)).toBe(false);
    });
  });

  /**
   * The cheap cost is a test-suite convenience. These pin the only environment
   * that may reach it. Delete or widen the guard in `resolveBcryptRounds` and
   * every case below that names a non-test environment goes red.
   */
  describe("resolveBcryptRounds", () => {
    it("keeps the production floor at twelve rounds or more", () => {
      expect(PRODUCTION_BCRYPT_ROUNDS).toBeGreaterThanOrEqual(12);
      expect(TEST_BCRYPT_ROUNDS).toBeLessThan(PRODUCTION_BCRYPT_ROUNDS);
    });

    it("uses the cheap cost only when NODE_ENV=test and VITEST agree", () => {
      expect(resolveBcryptRounds({ NODE_ENV: "test", VITEST: "true" })).toBe(TEST_BCRYPT_ROUNDS);
    });

    it("ignores VITEST on its own — it is ambient and can leak anywhere", () => {
      // The original defect: `VITEST` alone dropped every newly created hash
      // to four rounds, in whatever environment happened to carry the variable.
      expect(resolveBcryptRounds({ VITEST: "true" })).toBe(PRODUCTION_BCRYPT_ROUNDS);
      expect(resolveBcryptRounds({ NODE_ENV: "development", VITEST: "1" })).toBe(
        PRODUCTION_BCRYPT_ROUNDS
      );
      expect(resolveBcryptRounds({ NODE_ENV: "staging", VITEST: "true" })).toBe(
        PRODUCTION_BCRYPT_ROUNDS
      );
    });

    it("ignores NODE_ENV=test on its own — no runner is present to justify it", () => {
      expect(resolveBcryptRounds({ NODE_ENV: "test" })).toBe(PRODUCTION_BCRYPT_ROUNDS);
    });

    it("refuses to hash at all when a runner signal appears in production", () => {
      expect(() => resolveBcryptRounds({ NODE_ENV: "production", VITEST: "true" })).toThrow(
        /NODE_ENV=production/
      );
    });

    it("treats a falsey VITEST as absent rather than as a conflict", () => {
      for (const value of ["", "0", "false", "  FALSE  "]) {
        expect(resolveBcryptRounds({ NODE_ENV: "production", VITEST: value })).toBe(
          PRODUCTION_BCRYPT_ROUNDS
        );
      }
    });

    it("defaults to the production cost when nothing is set", () => {
      expect(resolveBcryptRounds({})).toBe(PRODUCTION_BCRYPT_ROUNDS);
      expect(resolveBcryptRounds({ NODE_ENV: "production" })).toBe(PRODUCTION_BCRYPT_ROUNDS);
    });

    it("is the cost that actually lands in the hash", async () => {
      const hash = await hashPassword("SuperSecretPassword123");
      expect(costOf(hash)).toBe(resolveBcryptRounds());
    });
  });

  /**
   * The login route compares against `absentAccountHash()` when no account
   * matches so that timing cannot answer "is this email registered?". That
   * only works while the stand-in costs what a real stored hash costs.
   */
  describe("absentAccountHash", () => {
    it("costs exactly what hashPassword is issuing", async () => {
      const real = await hashPassword("SuperSecretPassword123");
      expect(costOf(await absentAccountHash())).toBe(costOf(real));
      expect(costOf(await absentAccountHash())).toBe(resolveBcryptRounds());
    });

    it("is a real bcrypt hash that no submitted password can match", async () => {
      const stand = await absentAccountHash();
      expect(stand).toMatch(/^\$2[aby]\$\d{2}\$/);
      expect(await verifyPassword("", stand)).toBe(false);
      expect(await verifyPassword("SuperSecretPassword123", stand)).toBe(false);
    });

    it("is stable within a process so the comparison is not re-derived per login", async () => {
      expect(await absentAccountHash()).toBe(await absentAccountHash());
    });

    it("is what the login route compares against — no literal hash in the source", () => {
      const routePath = fileURLToPath(new URL("../app/api/auth/login/route.ts", import.meta.url));
      const source = readFileSync(routePath, "utf8");
      // A pinned literal is pinned at one cost, and the timing equalisation
      // silently stops equalising the moment the issuing cost moves away.
      expect(source).not.toMatch(/\$2[aby]\$\d{2}\$/);
      expect(source).toContain("absentAccountHash");
      // The stand-in only equalises anything if it is what the comparison
      // actually receives.
      expect(source).toContain("verifyPassword");
      expect(source).toMatch(/verifyPassword\(password, user\?\.passwordHash \?\? absent\)/);
    });

    it("is awaited on every login path, not only the one with no account", () => {
      // Awaited behind `??` it is constructed only when an unknown email
      // arrives, which makes its one-time construction the very signal the
      // comparison exists to remove.
      const routePath = fileURLToPath(new URL("../app/api/auth/login/route.ts", import.meta.url));
      const source = readFileSync(routePath, "utf8");
      expect(source).toMatch(/const absent = await absentAccountHash\(\);/);
      expect(source).not.toMatch(/\?\?\s*\(await absentAccountHash\(\)\)/);
    });
  });
});

/**
 * The cost factor a password is hashed at, and the two ways it has gone wrong
 * here.
 *
 * The first is reachability: the cheap test cost used to be selected by
 * `process.env.VITEST` as well as by `NODE_ENV`. `VITEST` is an ordinary
 * environment variable, so any of the usual ways one leaks — an image built in
 * a job that ran the suite, an exported shell variable, a platform env applied
 * to the running service — would have dropped every newly created password
 * hash to 4 rounds, in production, permanently, with nothing anywhere that
 * reads a stored hash's cost back and so nothing that could ever have
 * reported it.
 *
 * The second is coupling. The login route compares against a stand-in hash for
 * emails that have no account, so that "no such account" and "wrong password"
 * take the same time. bcrypt's compare cost is fixed by the cost factor stored
 * inside the hash it is given — so the stand-in only equalises anything while
 * its cost equals the cost real passwords are hashed at. It was a `$2b$12$`
 * literal in the route file and the real cost was a constant in `auth.ts`,
 * with nothing between them: the first defect, by moving real hashes to 4
 * rounds, would have turned this defence into the enumeration oracle it exists
 * to close, and the accounts it exposed would have been exactly the ones
 * created after the leak.
 */
describe("password hashing cost", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // The login route's own checks live in the `absentAccountHash` block above,
  // which reads it unstripped — a bcrypt literal is worth flagging even in a
  // comment there.
  const AUTH_SOURCE_PATH = join(process.cwd(), "src/lib/auth.ts");

  /** Comments describe the rule; only code can break it. */
  function codeOf(path: string): string {
    return readFileSync(path, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
  }


  describe("bcryptCost", () => {
    it("reads the cost factor back out of a real bcrypt hash", async () => {
      expect(bcryptCost(await bcrypt.hash("cost-probe", 4))).toBe(4);
      expect(bcryptCost(await bcrypt.hash("cost-probe", 6))).toBe(6);
    });

    it("returns null for anything that is not a bcrypt hash", () => {
      expect(bcryptCost("")).toBeNull();
      expect(bcryptCost("not-a-hash")).toBeNull();
      expect(bcryptCost(hashToken("a sha256 digest is not a bcrypt hash"))).toBeNull();
    });
  });

  describe("resolveBcryptRounds", () => {
    it("keeps the production cost when VITEST leaks into a production environment", () => {
      // The regression this whole block exists for. VITEST is set right now,
      // in this very process, which is what made the old expression so easy to
      // get wrong: it was true in the only environment anyone ever ran it in.
      expect(process.env.VITEST).toBeTruthy();
      expect(resolveBcryptRounds({ NODE_ENV: "production" })).toBe(PRODUCTION_BCRYPT_ROUNDS);
    });

    it("keeps the production cost in every environment that is not the test suite", () => {
      for (const nodeEnv of ["production", "development", "preview", "staging", undefined]) {
        expect(resolveBcryptRounds({ NODE_ENV: nodeEnv })).toBe(PRODUCTION_BCRYPT_ROUNDS);
      }
    });

    it("costs the suite nothing, because the runner sets both signals itself", () => {
      // Vitest sets NODE_ENV and VITEST, so requiring both leaves the suite at
      // the cheap cost while removing every single-signal route to it.
      expect(process.env.NODE_ENV).toBe("test");
      expect(process.env.VITEST).toBeTruthy();
      expect(resolveBcryptRounds(process.env)).toBe(TEST_BCRYPT_ROUNDS);
      expect(TEST_BCRYPT_ROUNDS).toBeLessThan(PRODUCTION_BCRYPT_ROUNDS);
    });

    it("consults no environment variable beyond the two that name a test runner", () => {
      // A third variable appearing here is a third system with a say in what a
      // password costs, which is the class of defect this replaced.
      const code = codeOf(AUTH_SOURCE_PATH);
      const start = code.indexOf("export function resolveBcryptRounds");
      expect(start, "resolveBcryptRounds must be exported from src/lib/auth.ts").toBeGreaterThan(-1);
      const body = code.slice(start, code.indexOf("\n}", start) + 2);
      expect(body).toContain("NODE_ENV");
      const reads = [...body.matchAll(/(?:process\.)?\benv\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]);
      expect(reads.length).toBeGreaterThan(0);
      expect([...new Set(reads)].sort()).toEqual(["NODE_ENV", "VITEST"]);
    });

    it("is the only thing that decides the cost — no literal cost at any call site", () => {
      const code = codeOf(AUTH_SOURCE_PATH);
      // Guard against a stripper that ate the file and made this vacuous.
      expect(code).toContain("export async function hashPassword");
      expect(code).toMatch(/bcrypt\.hash\(plain,\s*resolveBcryptRounds\(\)\)/);
      // Every bcrypt cost in this module comes from the resolver. A numeric
      // literal here is a second, unguarded decision about what a password
      // costs — exactly how the four-round path got in.
      const literalCosts = [...code.matchAll(/bcrypt\.hash\([^;]*?,\s*(\d+)\s*\)/g)].map((m) => m[1]);
      expect(literalCosts).toEqual([]);
    });
  });

  describe("assertHashStrength", () => {
    it("refuses a weak hash in production rather than storing it", async () => {
      const weak = await bcrypt.hash("SuperSecretPassword123", TEST_BCRYPT_ROUNDS);
      expect(bcryptCost(weak)).toBe(TEST_BCRYPT_ROUNDS);
      expect(() => assertHashStrength(weak, { NODE_ENV: "production" })).toThrow(
        /Refusing to store a password hashed at 4 rounds in production/
      );
      expect(() => assertHashStrength("not-a-bcrypt-hash", { NODE_ENV: "production" })).toThrow(
        /Refusing to store a password/
      );
    });

    it("passes a hash at the production floor straight through", async () => {
      const strong = await bcrypt.hash("SuperSecretPassword123", PRODUCTION_BCRYPT_ROUNDS);
      expect(assertHashStrength(strong, { NODE_ENV: "production" })).toBe(strong);
    });

    it("leaves the cheap test cost alone outside production", async () => {
      const weak = await bcrypt.hash("SuperSecretPassword123", TEST_BCRYPT_ROUNDS);
      expect(assertHashStrength(weak, { NODE_ENV: "test" })).toBe(weak);
      expect(assertHashStrength(weak, { NODE_ENV: "development" })).toBe(weak);
    });

    it("is wired into hashPassword, so no caller can skip the floor", () => {
      const code = codeOf(AUTH_SOURCE_PATH);
      expect(code).toMatch(/assertHashStrength\(await bcrypt\.hash\(plain,/);
    });
  });

  describe("the module as production actually loads it", () => {
    it("hashes at the production cost when the module loads as production", async () => {
      // No mocks: this re-imports the real module the way a production image
      // loads it, and asks the real hashPassword what cost it produced.
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("VITEST", "");
      vi.resetModules();
      const freshAuth = await import("./auth");
      const hash = await freshAuth.hashPassword("SuperSecretPassword123");
      expect(bcryptCost(hash)).toBe(PRODUCTION_BCRYPT_ROUNDS);
      expect(await freshAuth.verifyPassword("SuperSecretPassword123", hash)).toBe(true);
    });

    it("refuses to hash at all when a leaked VITEST meets NODE_ENV=production", async () => {
      // The leak the first defect depended on. Under the old expression this
      // produced a 4-round hash; it now produces no hash.
      vi.stubEnv("NODE_ENV", "production");
      expect(process.env.VITEST).toBeTruthy();
      vi.resetModules();
      const freshAuth = await import("./auth");
      await expect(freshAuth.hashPassword("SuperSecretPassword123")).rejects.toThrow(
        /NODE_ENV=production/
      );
    });

    it("hashes at the cheap cost under the suite's own env", async () => {
      expect(bcryptCost(await hashPassword("SuperSecretPassword123"))).toBe(TEST_BCRYPT_ROUNDS);
    });
  });

  describe("the stand-in hash for an absent account", () => {
    it("tracks the production cost when the module loads as production", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("VITEST", "");
      vi.resetModules();
      const freshAuth = await import("./auth");
      expect(bcryptCost(await freshAuth.absentAccountHash())).toBe(PRODUCTION_BCRYPT_ROUNDS);
    });

    it("is rebuilt at the new cost if the issuing cost ever moves", async () => {
      // The cache is keyed by the cost it was derived at, so a cost change
      // cannot leave a stale stand-in behind at the old one — which would be
      // the enumeration oracle reopening from the comparison side.
      expect(bcryptCost(await absentAccountHash())).toBe(TEST_BCRYPT_ROUNDS);
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("VITEST", "");
      expect(bcryptCost(await absentAccountHash())).toBe(PRODUCTION_BCRYPT_ROUNDS);
      vi.unstubAllEnvs();
      expect(bcryptCost(await absentAccountHash())).toBe(TEST_BCRYPT_ROUNDS);
    });
  });
});
