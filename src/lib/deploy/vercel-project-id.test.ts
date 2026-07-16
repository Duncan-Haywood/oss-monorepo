import { describe, it, expect } from "vitest";
import { MAX_VERCEL_PROJECT_ID_LENGTH, parseVercelProjectId } from "./vercel-project-id";

describe("MAX_VERCEL_PROJECT_ID_LENGTH", () => {
  it("is 100", () => {
    expect(MAX_VERCEL_PROJECT_ID_LENGTH).toBe(100);
  });
});

describe("parseVercelProjectId", () => {
  it("returns the trimmed value for a valid project id", () => {
    expect(parseVercelProjectId("prj_abc123DEF")).toBe("prj_abc123DEF");
  });

  it("trims whitespace", () => {
    expect(parseVercelProjectId("  prj_abc123  ")).toBe("prj_abc123");
  });

  it("returns null for whitespace-only", () => {
    expect(parseVercelProjectId("   ")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseVercelProjectId("")).toBeNull();
  });

  it("returns null for over-long project id", () => {
    const over = "a".repeat(MAX_VERCEL_PROJECT_ID_LENGTH + 1);
    expect(parseVercelProjectId(over)).toBeNull();
  });

  it("accepts a project id at the max length", () => {
    const exact = "a".repeat(MAX_VERCEL_PROJECT_ID_LENGTH);
    expect(parseVercelProjectId(exact)).toBe(exact);
  });
});
