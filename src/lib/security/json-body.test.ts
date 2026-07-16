import { describe, expect, it } from "vitest";
import {
  MAX_PUBLIC_JSON_BODY_BYTES,
  contentLengthExceedsLimit,
  readJsonBodyWithByteLimit,
} from "./json-body";

function jsonRequest(
  body: string,
  headers: Record<string, string> = {},
): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

describe("contentLengthExceedsLimit", () => {
  it("returns false when Content-Length is missing", () => {
    const req = jsonRequest("{}");
    expect(contentLengthExceedsLimit(req)).toBe(false);
  });

  it("returns false when Content-Length is within the max", () => {
    const req = jsonRequest("{}", {
      "content-length": String(MAX_PUBLIC_JSON_BODY_BYTES),
    });
    expect(contentLengthExceedsLimit(req)).toBe(false);
  });

  it("returns true when Content-Length exceeds the max", () => {
    const req = jsonRequest("{}", {
      "content-length": String(MAX_PUBLIC_JSON_BODY_BYTES + 1),
    });
    expect(contentLengthExceedsLimit(req)).toBe(true);
  });

  it("returns false for non-numeric Content-Length", () => {
    const req = jsonRequest("{}", { "content-length": "abc" });
    expect(contentLengthExceedsLimit(req)).toBe(false);
  });
});

describe("readJsonBodyWithByteLimit", () => {
  it("parses a small JSON object", async () => {
    const req = jsonRequest(JSON.stringify({ tier: "starter" }));
    const result = await readJsonBodyWithByteLimit<{ tier: string }>(req);
    expect(result).toEqual({ ok: true, value: { tier: "starter" } });
  });

  it("rejects when Content-Length exceeds the max before reading", async () => {
    const req = jsonRequest("{}", {
      "content-length": String(MAX_PUBLIC_JSON_BODY_BYTES + 50),
    });
    const result = await readJsonBodyWithByteLimit(req);
    expect(result).toEqual({ ok: false, reason: "too_large" });
  });

  it("rejects when the consumed body exceeds the max", async () => {
    // JSON.stringify adds quotes; a MAX-length string payload exceeds the byte ceiling.
    const huge = JSON.stringify("a".repeat(MAX_PUBLIC_JSON_BODY_BYTES));
    expect(new TextEncoder().encode(huge).byteLength).toBeGreaterThan(
      MAX_PUBLIC_JSON_BODY_BYTES,
    );
    const req = jsonRequest(huge);
    const result = await readJsonBodyWithByteLimit(req);
    expect(result).toEqual({ ok: false, reason: "too_large" });
  });

  it("accepts a body exactly at the max", async () => {
    // Build a JSON string whose UTF-8 length equals MAX exactly.
    // `"aaa..."` = 2 quotes + N chars. Prefer a number array of digits.
    const prefix = '{"k":"';
    const suffix = '"}';
    const fill = MAX_PUBLIC_JSON_BODY_BYTES - prefix.length - suffix.length;
    expect(fill).toBeGreaterThan(0);
    const exact = `${prefix}${"b".repeat(fill)}${suffix}`;
    expect(new TextEncoder().encode(exact).byteLength).toBe(
      MAX_PUBLIC_JSON_BODY_BYTES,
    );
    const req = jsonRequest(exact, {
      "content-length": String(MAX_PUBLIC_JSON_BODY_BYTES),
    });
    const result = await readJsonBodyWithByteLimit(req);
    expect(result.ok).toBe(true);
  });

  it("returns invalid_json for empty body", async () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "0" },
      body: "",
    });
    const result = await readJsonBodyWithByteLimit(req);
    expect(result).toEqual({ ok: false, reason: "invalid_json" });
  });

  it("returns invalid_json for malformed JSON under the max", async () => {
    const req = jsonRequest("{not-json");
    const result = await readJsonBodyWithByteLimit(req);
    expect(result).toEqual({ ok: false, reason: "invalid_json" });
  });
});
