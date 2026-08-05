import { describe, expect, it } from "vitest";
import { requestBodyTooLarge } from "@/lib/http";

describe("requestBodyTooLarge", () => {
  it("allows ordinary and streaming requests", () => {
    expect(requestBodyTooLarge(new Headers({ "content-length": "1024" }))).toBe(false);
    expect(requestBodyTooLarge(new Headers())).toBe(false);
  });

  it("rejects oversized or malformed declared lengths", () => {
    expect(requestBodyTooLarge(new Headers({ "content-length": "65537" }))).toBe(true);
    expect(requestBodyTooLarge(new Headers({ "content-length": "-1" }))).toBe(true);
    expect(requestBodyTooLarge(new Headers({ "content-length": "not-a-number" }))).toBe(true);
  });
});
