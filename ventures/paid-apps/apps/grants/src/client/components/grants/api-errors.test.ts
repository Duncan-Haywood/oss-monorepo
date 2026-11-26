import { ApiError } from "@client/lib/api";
import { isExtracting } from "@client/routes/org/interviews/shared";
import { parseStatusParam } from "@client/routes/org/knowledge/facts";
import { describe, expect, it } from "vitest";
import { friendlyError, isPaymentRequired } from "./api-errors";

describe("friendlyError", () => {
  it("maps known codes to actionable messages and lets call sites override", () => {
    expect(friendlyError(new ApiError(422, "robots_disallowed", "robots"))).toMatch(/upload it/);
    expect(friendlyError(new ApiError(413, "file_too_large", "x"))).toMatch(/too large/);
    expect(friendlyError(new ApiError(415, "unsupported_file_type", "x"))).toMatch(/file type/);
    expect(friendlyError(new ApiError(422, "fetch_failed", "x"), { fetch_failed: "custom" })).toBe(
      "custom",
    );
  });

  it("keeps specific server messages and hides opaque 5xx errors", () => {
    expect(
      friendlyError(new ApiError(409, "duplicate_document", 'Already uploaded as "Report"')),
    ).toBe('Already uploaded as "Report"');
    expect(friendlyError(new ApiError(400, "weird_code", "Audio too short"))).toBe(
      "Audio too short",
    );
    expect(friendlyError(new ApiError(500, "internal_error", "Something went wrong"))).toMatch(
      /our side/,
    );
    expect(friendlyError(new ApiError(502, "http_error", "Bad Gateway"))).toMatch(/our side/);
    expect(friendlyError(new TypeError("Failed to fetch"))).toMatch(/connection/);
  });

  it("detects 402 payment_required", () => {
    expect(isPaymentRequired(new ApiError(402, "payment_required", "Choose a plan"))).toBe(true);
    expect(isPaymentRequired(new ApiError(409, "conflict", "x"))).toBe(false);
  });
});

describe("facts ?status= param", () => {
  it("defaults to the review queue, supports all, CSV and drops unknown values", () => {
    expect(parseStatusParam(undefined)).toBe("proposed");
    expect(parseStatusParam("confirmed")).toBe("confirmed");
    expect(parseStatusParam("all")).toBe("");
    expect(parseStatusParam("proposed,confirmed")).toBe("proposed,confirmed");
    expect(parseStatusParam("bogus")).toBe("");
  });
});

describe("isExtracting", () => {
  const now = Date.parse("2026-11-19T12:00:00Z");
  const iv = {
    status: "completed" as const,
    factCount: 0,
    completedAt: "2026-11-19T11:59:00Z",
    turns: [{ role: "respondent", content: "We train 40 youth a year." }] as never,
  };
  it("is true right after completion while factCount is still 0", () => {
    expect(isExtracting(iv, now)).toBe(true);
    expect(isExtracting({ ...iv, factCount: 3 }, now)).toBe(false);
    expect(isExtracting({ ...iv, completedAt: "2026-11-19T10:00:00Z" }, now)).toBe(false);
    expect(isExtracting({ ...iv, turns: [] }, now)).toBe(false);
  });
});
