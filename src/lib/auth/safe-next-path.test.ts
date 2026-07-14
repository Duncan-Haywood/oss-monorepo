import { describe, expect, it } from "vitest";
import {
  DEFAULT_SAFE_NEXT_PATH,
  isSafeNextPath,
  safeNextPath,
} from "./safe-next-path";

describe("isSafeNextPath", () => {
  it("accepts the dashboard root and nested dashboard paths", () => {
    expect(isSafeNextPath("/dashboard")).toBe(true);
    expect(isSafeNextPath("/dashboard/leads")).toBe(true);
    expect(isSafeNextPath("/dashboard/leads?tab=inbox")).toBe(true);
  });

  it("rejects protocol-relative open redirects", () => {
    expect(isSafeNextPath("//evil.example")).toBe(false);
    expect(isSafeNextPath("//evil.example/phish")).toBe(false);
  });

  it("rejects backslash host tricks", () => {
    expect(isSafeNextPath("/\\evil.example")).toBe(false);
    expect(isSafeNextPath("/\\\\evil.example")).toBe(false);
    expect(isSafeNextPath("/dashboard/leads\\..\\..")).toBe(false);
  });

  it("rejects absolute URLs and scheme-smuggled paths", () => {
    expect(isSafeNextPath("https://evil.example/phish")).toBe(false);
    expect(isSafeNextPath("/https://evil.example")).toBe(false);
    expect(isSafeNextPath("/http:evil")).toBe(false);
  });

  it("rejects non-dashboard relative paths", () => {
    expect(isSafeNextPath("/")).toBe(false);
    expect(isSafeNextPath("/preview/demo-cafe")).toBe(false);
    expect(isSafeNextPath("/docs/launch-checklist")).toBe(false);
    expect(isSafeNextPath("/checkout")).toBe(false);
  });

  it("rejects the login page itself (self-redirect loop)", () => {
    expect(isSafeNextPath("/dashboard/login")).toBe(false);
    expect(isSafeNextPath("/dashboard/login?error=invalid")).toBe(false);
    expect(isSafeNextPath("/dashboard/login/")).toBe(false);
  });

  it("rejects control characters", () => {
    expect(isSafeNextPath("/dashboard/leads\r\nLocation: https://evil")).toBe(
      false,
    );
    expect(isSafeNextPath("/dashboard/\0leads")).toBe(false);
  });

  it("rejects dot-segment traversal out of /dashboard", () => {
    // Browsers collapse `/dashboard/../checkout` to `/checkout` before the
    // request is ever sent, escaping the /dashboard/* restriction even
    // though the raw string still starts with "/dashboard/".
    expect(isSafeNextPath("/dashboard/../checkout?ref=x")).toBe(false);
    expect(isSafeNextPath("/dashboard/../../evil")).toBe(false);
    expect(isSafeNextPath("/dashboard/leads/../../checkout")).toBe(false);
  });

  it("rejects percent-encoded dot-segment traversal", () => {
    expect(isSafeNextPath("/dashboard/%2e%2e/checkout")).toBe(false);
    expect(isSafeNextPath("/dashboard/%2E%2E/checkout")).toBe(false);
    expect(isSafeNextPath("/dashboard/..%2f../checkout")).toBe(false);
  });

  it("fails closed on unparsable percent-encoding", () => {
    expect(isSafeNextPath("/dashboard/%")).toBe(false);
  });

  it("still accepts a harmless single-dot segment", () => {
    expect(isSafeNextPath("/dashboard/./leads")).toBe(true);
  });
});

describe("safeNextPath", () => {
  it("returns the default fallback for nullish / empty / whitespace", () => {
    expect(safeNextPath(undefined)).toBe(DEFAULT_SAFE_NEXT_PATH);
    expect(safeNextPath(null)).toBe(DEFAULT_SAFE_NEXT_PATH);
    expect(safeNextPath("")).toBe(DEFAULT_SAFE_NEXT_PATH);
    expect(safeNextPath("   ")).toBe(DEFAULT_SAFE_NEXT_PATH);
  });

  it("trims and returns safe dashboard paths", () => {
    expect(safeNextPath("  /dashboard/leads  ")).toBe("/dashboard/leads");
  });

  it("falls back for open-redirect shapes the login page previously accepted", () => {
    // page.tsx used startsWith("/") only — //evil passes that weak check.
    expect(safeNextPath("//evil.example")).toBe(DEFAULT_SAFE_NEXT_PATH);
    expect(safeNextPath("/\\evil.example")).toBe(DEFAULT_SAFE_NEXT_PATH);
    expect(safeNextPath("https://evil.example")).toBe(DEFAULT_SAFE_NEXT_PATH);
  });

  it("honors a custom fallback", () => {
    expect(safeNextPath("//evil", "/dashboard/leads")).toBe("/dashboard/leads");
  });
});
