import { describe, expect, it } from "vitest";
import {
  hashPassword,
  hashToken,
  isValidEmail,
  normalizeEmail,
  passwordProblem,
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
