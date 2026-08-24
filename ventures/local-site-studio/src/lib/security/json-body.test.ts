import { describe, expect, it } from "vitest";
import {
  MAX_PUBLIC_JSON_BODY_BYTES,
  MAX_PUBLIC_REQUEST_BODY_BYTES,
  contentLengthExceedsLimit,
  readFormBodyWithByteLimit,
  readJsonBodyWithByteLimit,
  readTextBodyWithByteLimit,
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

  it("stops reading a chunked (no Content-Length) stream as soon as it exceeds the max, instead of buffering the whole body", async () => {
    // Simulates a chunked-transfer request: no Content-Length header, body
    // arrives as a stream. A malicious/misbehaving client could keep this
    // stream open indefinitely; the reader must bail after ~maxBytes rather
    // than draining every chunk first (the DoS this guards against).
    const chunkBytes = new TextEncoder().encode("a".repeat(1024));
    const totalChunksToOffer = 10_000; // far more than needed to cross the cap
    let chunksPulled = 0;
    let cancelled = false;

    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (cancelled || chunksPulled >= totalChunksToOffer) {
          controller.close();
          return;
        }
        chunksPulled += 1;
        controller.enqueue(chunkBytes);
      },
      cancel() {
        cancelled = true;
      },
    });

    const req = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stream,
      // @ts-expect-error - required by undici/Node's fetch impl for streamed bodies
      duplex: "half",
    });
    expect(req.headers.get("content-length")).toBeNull();

    const result = await readJsonBodyWithByteLimit(req);

    expect(result).toEqual({ ok: false, reason: "too_large" });
    // Must have stopped well short of offering all 10,000 chunks (~10 MiB) —
    // bounds the number of chunks actually buffered before bailing.
    const chunksNeededToExceedCap = Math.ceil(
      MAX_PUBLIC_JSON_BODY_BYTES / chunkBytes.byteLength,
    );
    expect(chunksPulled).toBeLessThanOrEqual(chunksNeededToExceedCap + 1);
    expect(cancelled).toBe(true);
  });
});

describe("readTextBodyWithByteLimit", () => {
  it("returns the raw text unmodified for a small body", async () => {
    const req = jsonRequest("not-json-but-that-is-fine-here");
    const result = await readTextBodyWithByteLimit(req);
    expect(result).toEqual({ ok: true, value: "not-json-but-that-is-fine-here" });
  });

  it("rejects when Content-Length exceeds the max before reading", async () => {
    const req = jsonRequest("x", {
      "content-length": String(MAX_PUBLIC_JSON_BODY_BYTES + 50),
    });
    const result = await readTextBodyWithByteLimit(req);
    expect(result).toEqual({ ok: false, reason: "too_large" });
  });

  it("rejects when the consumed body exceeds the max without Content-Length", async () => {
    const huge = "a".repeat(MAX_PUBLIC_JSON_BODY_BYTES + 1);
    const req = jsonRequest(huge);
    const result = await readTextBodyWithByteLimit(req);
    expect(result).toEqual({ ok: false, reason: "too_large" });
  });

  it("accepts a body exactly at the max", async () => {
    const exact = "b".repeat(MAX_PUBLIC_JSON_BODY_BYTES);
    const req = jsonRequest(exact, {
      "content-length": String(MAX_PUBLIC_JSON_BODY_BYTES),
    });
    const result = await readTextBodyWithByteLimit(req);
    expect(result).toEqual({ ok: true, value: exact });
  });

  it("respects a custom maxBytes override", async () => {
    const req = jsonRequest("abcdef");
    const result = await readTextBodyWithByteLimit(req, 3);
    expect(result).toEqual({ ok: false, reason: "too_large" });
  });

  it("returns an empty string for an empty body", async () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-length": "0" },
      body: "",
    });
    const result = await readTextBodyWithByteLimit(req);
    expect(result).toEqual({ ok: true, value: "" });
  });
});

function formRequest(
  body: string,
  headers: Record<string, string> = {},
): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body,
  });
}

describe("readFormBodyWithByteLimit", () => {
  it("shares the JSON whole-body ceiling", () => {
    expect(MAX_PUBLIC_REQUEST_BODY_BYTES).toBe(MAX_PUBLIC_JSON_BODY_BYTES);
  });

  it("parses a small urlencoded body", async () => {
    const req = formRequest("name=Pat&email=visitor%40example.com");
    const result = await readFormBodyWithByteLimit(req);
    expect(result).toEqual({
      ok: true,
      value: { name: "Pat", email: "visitor@example.com" },
    });
  });

  it("rejects when Content-Length exceeds the max before reading", async () => {
    const req = formRequest("name=Pat", {
      "content-length": String(MAX_PUBLIC_REQUEST_BODY_BYTES + 50),
    });
    const result = await readFormBodyWithByteLimit(req);
    expect(result).toEqual({ ok: false, reason: "too_large" });
  });

  it("rejects when the consumed body exceeds the max without Content-Length", async () => {
    const huge = `message=${"m".repeat(MAX_PUBLIC_REQUEST_BODY_BYTES)}`;
    expect(new TextEncoder().encode(huge).byteLength).toBeGreaterThan(
      MAX_PUBLIC_REQUEST_BODY_BYTES,
    );
    const req = formRequest(huge);
    const result = await readFormBodyWithByteLimit(req);
    expect(result).toEqual({ ok: false, reason: "too_large" });
  });

  it("accepts a body exactly at the max", async () => {
    const prefix = "message=";
    const fill = MAX_PUBLIC_REQUEST_BODY_BYTES - prefix.length;
    expect(fill).toBeGreaterThan(0);
    const exact = `${prefix}${"c".repeat(fill)}`;
    expect(new TextEncoder().encode(exact).byteLength).toBe(
      MAX_PUBLIC_REQUEST_BODY_BYTES,
    );
    const req = formRequest(exact, {
      "content-length": String(MAX_PUBLIC_REQUEST_BODY_BYTES),
    });
    const result = await readFormBodyWithByteLimit(req);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(String(result.value.message)).toHaveLength(fill);
    }
  });

  it("returns empty object for empty form body", async () => {
    const req = formRequest("");
    const result = await readFormBodyWithByteLimit(req);
    expect(result).toEqual({ ok: true, value: {} });
  });
});
