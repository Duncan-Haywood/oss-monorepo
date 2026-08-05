import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PRODUCTION_BCRYPT_ROUNDS,
  TEST_BCRYPT_ROUNDS,
  absentAccountHash,
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
});
