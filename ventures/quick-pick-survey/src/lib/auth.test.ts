import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import {
  assertHashStrength,
  bcryptCost,
  hashPassword,
  hashToken,
  isValidEmail,
  normalizeEmail,
  passwordProblem,
  PRODUCTION_BCRYPT_ROUNDS,
  resolveBcryptRounds,
  TEST_BCRYPT_ROUNDS,
  unknownAccountHash,
  verifyPassword,
} from "./auth";

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

  const AUTH_SOURCE_PATH = join(process.cwd(), "src/lib/auth.ts");
  const LOGIN_ROUTE_PATH = join(process.cwd(), "src/app/api/auth/login/route.ts");

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

    it("uses the cheap cost only for NODE_ENV=test, so the suite stays fast", () => {
      expect(resolveBcryptRounds({ NODE_ENV: "test" })).toBe(TEST_BCRYPT_ROUNDS);
      expect(TEST_BCRYPT_ROUNDS).toBeLessThan(PRODUCTION_BCRYPT_ROUNDS);
      // Vitest sets NODE_ENV itself, which is why dropping the VITEST disjunct
      // costs the suite nothing.
      expect(process.env.NODE_ENV).toBe("test");
    });

    it("consults no environment variable other than NODE_ENV", () => {
      const code = codeOf(AUTH_SOURCE_PATH);
      const start = code.indexOf("export function resolveBcryptRounds");
      expect(start, "resolveBcryptRounds must be exported from src/lib/auth.ts").toBeGreaterThan(-1);
      const body = code.slice(start, code.indexOf("\n}", start) + 2);
      expect(body).toContain("NODE_ENV");
      const reads = [...body.matchAll(/(?:process\.)?\benv\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]);
      expect(reads.length).toBeGreaterThan(0);
      expect([...new Set(reads)]).toEqual(["NODE_ENV"]);
    });

    it("is the only thing that decides the cost, and nothing reads VITEST", () => {
      const code = codeOf(AUTH_SOURCE_PATH);
      // Guard against a stripper that ate the file and made this vacuous.
      expect(code).toContain("export async function hashPassword");
      expect(code).toMatch(/const BCRYPT_ROUNDS\s*=\s*resolveBcryptRounds\(\)/);
      expect(code).not.toContain("VITEST");
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
  });

  describe("the module as production actually loads it", () => {
    it("hashes at the production cost when NODE_ENV=production and VITEST is set", async () => {
      // No mocks and no injected env: this re-imports the real module the way
      // a leaked-VITEST production image would have loaded it, and asks the
      // real hashPassword what it produced.
      vi.stubEnv("NODE_ENV", "production");
      expect(process.env.VITEST).toBeTruthy();
      vi.resetModules();
      const freshAuth = await import("./auth");
      const hash = await freshAuth.hashPassword("SuperSecretPassword123");
      expect(bcryptCost(hash)).toBe(PRODUCTION_BCRYPT_ROUNDS);
      expect(await freshAuth.verifyPassword("SuperSecretPassword123", hash)).toBe(true);
    });

    it("hashes at the cheap cost under the suite's own env", async () => {
      expect(bcryptCost(await hashPassword("SuperSecretPassword123"))).toBe(TEST_BCRYPT_ROUNDS);
    });
  });

  describe("the stand-in hash for an unknown account", () => {
    it("costs exactly what a real password costs, or it is an enumeration oracle", async () => {
      expect(bcryptCost(await unknownAccountHash())).toBe(resolveBcryptRounds(process.env));
      expect(bcryptCost(await unknownAccountHash())).toBe(bcryptCost(await hashPassword("Whatever123")));
    });

    it("tracks the production cost when the module loads as production", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.resetModules();
      const freshAuth = await import("./auth");
      expect(bcryptCost(await freshAuth.unknownAccountHash())).toBe(PRODUCTION_BCRYPT_ROUNDS);
    });

    it("is stable across calls, and matches no password anyone can type", async () => {
      expect(await unknownAccountHash()).toBe(await unknownAccountHash());
      expect(await verifyPassword("", await unknownAccountHash())).toBe(false);
      expect(await verifyPassword("password", await unknownAccountHash())).toBe(false);
    });

    it("is not written down as a literal anywhere the login path can drift from", () => {
      const route = codeOf(LOGIN_ROUTE_PATH);
      expect(route).toContain("verifyPassword");
      expect(route).toContain("unknownAccountHash");
      expect(route).not.toMatch(/\$2[aby]\$\d{2}\$/);
    });
  });
});
