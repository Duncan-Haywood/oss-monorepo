import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    });
  });

  /**
   * The second line, from the rival branch that fixed this same defect.
   * `resolveBcryptRounds` decides what cost to *ask* for; these read the cost
   * back out of the hash that was actually *produced*. The distinction is the
   * whole point: a hash at four rounds and a hash at twelve are the same
   * shape, verify identically, and are invisible to every caller in this app,
   * so a future edit that passes a cost of its own — or a hashing library that
   * ignores the one it is given — would otherwise leave no observable trace.
   */
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

  describe("assertHashStrength", () => {
    it("refuses a hash below the production floor rather than storing it", async () => {
      const weak = await bcrypt.hash("SuperSecretPassword123", TEST_BCRYPT_ROUNDS);
      expect(bcryptCost(weak)).toBe(TEST_BCRYPT_ROUNDS);
      expect(() => assertHashStrength(weak, { NODE_ENV: "production" })).toThrow(
        new RegExp(`Refusing to store a password hashed at ${TEST_BCRYPT_ROUNDS} rounds in production`),
      );
    });

    it("refuses a string whose cost cannot be read at all", () => {
      expect(() => assertHashStrength("not-a-bcrypt-hash", { NODE_ENV: "production" })).toThrow(
        /unreadable number of rounds/,
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

    it("is wired into hashPassword, not merely exported", async () => {
      // The check can only be *observed* where the requested cost and the
      // produced cost disagree, and in a healthy build they never do — so the
      // disagreement is forced here by making bcrypt return a four-round hash
      // for a twelve-round request. That is not a hypothetical: it is what a
      // library swap, a wrapper, or a later edit passing its own cost would
      // look like from this module's side.
      //
      // Written this way because the obvious version of this test — hash, then
      // assert the result passes the floor — holds whether or not hashPassword
      // calls the guard at all, and so pins nothing. `bcryptjs` is mocked
      // rather than `./auth`: the behaviour under test lives in `./auth`, and
      // mocking that is how a test like this ends up green with the fix
      // reverted.
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("VITEST", "");
      vi.resetModules();
      const weak = await bcrypt.hash("SuperSecretPassword123", TEST_BCRYPT_ROUNDS);
      vi.doMock("bcryptjs", () => ({
        default: { hash: async () => weak, compare: async () => false },
      }));

      const freshAuth = await import("./auth");
      await expect(freshAuth.hashPassword("SuperSecretPassword123")).rejects.toThrow(
        /Refusing to store a password/,
      );

      vi.doUnmock("bcryptjs");
      vi.unstubAllEnvs();
      vi.resetModules();
    });
  });

  /**
   * The module as a misconfigured production deployment would really load it:
   * no injected env object, no mock — `NODE_ENV=production` with `VITEST`
   * still set, which is precisely the leak that started this.
   *
   * `resolveBcryptRounds` refuses that combination, and the point of running
   * it here is that the refusal survives the real import path rather than
   * living only in a function called with a hand-built argument. A signup that
   * throws is recoverable by unsetting one variable; a signup that quietly
   * stores four-round hashes is recoverable only by making every account that
   * was created since change its password.
   */
  describe("the module as a leaked-VITEST production image would load it", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    it("refuses to hash rather than hashing below the floor", async () => {
      vi.stubEnv("NODE_ENV", "production");
      expect(process.env.VITEST, "the suite's own runner signal is what leaks").toBeTruthy();
      vi.resetModules();
      const freshAuth = await import("./auth");

      await expect(freshAuth.hashPassword("SuperSecretPassword123")).rejects.toThrow(
        /NODE_ENV=production/,
      );
      await expect(freshAuth.absentAccountHash()).rejects.toThrow(/NODE_ENV=production/);
    });

    it("hashes at the production cost once the leaked signal is cleared", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("VITEST", "");
      vi.resetModules();
      const freshAuth = await import("./auth");

      const hash = await freshAuth.hashPassword("SuperSecretPassword123");
      expect(freshAuth.bcryptCost(hash)).toBe(PRODUCTION_BCRYPT_ROUNDS);
      expect(await freshAuth.verifyPassword("SuperSecretPassword123", hash)).toBe(true);
    });
  });
});
