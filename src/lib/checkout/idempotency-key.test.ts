import { describe, expect, it } from "vitest";
import {
  nextClientIdempotencyKey,
  parseClientIdempotencyKey,
} from "./idempotency-key";

describe("parseClientIdempotencyKey", () => {
  it("accepts a v4-shaped UUID", () => {
    const uuid = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
    expect(parseClientIdempotencyKey(uuid)).toBe(uuid);
  });

  it("accepts uppercase hex", () => {
    const uuid = "3FA85F64-5717-4562-B3FC-2C963F66AFA6";
    expect(parseClientIdempotencyKey(uuid)).toBe(uuid);
  });

  it("rejects non-string values", () => {
    expect(parseClientIdempotencyKey(undefined)).toBeUndefined();
    expect(parseClientIdempotencyKey(null)).toBeUndefined();
    expect(parseClientIdempotencyKey(12345)).toBeUndefined();
    expect(parseClientIdempotencyKey({})).toBeUndefined();
  });

  it("rejects malformed strings", () => {
    expect(parseClientIdempotencyKey("not-a-uuid")).toBeUndefined();
    expect(parseClientIdempotencyKey("")).toBeUndefined();
    expect(
      parseClientIdempotencyKey("3fa85f64-5717-4562-b3fc-2c963f66afa6-extra"),
    ).toBeUndefined();
  });

  it("rejects a CR/LF header-injection attempt disguised as a key", () => {
    expect(
      parseClientIdempotencyKey(
        "3fa85f64-5717-4562-b3fc-2c963f66afa6\r\nX-Injected: 1",
      ),
    ).toBeUndefined();
  });
});

describe("nextClientIdempotencyKey", () => {
  it("mints a fresh key when there is no previous attempt", () => {
    const attempt = nextClientIdempotencyKey("params-a", null, () => "key-1");
    expect(attempt).toEqual({ paramsKey: "params-a", idempotencyKey: "key-1" });
  });

  it("reuses the previous key when paramsKey is unchanged (retry)", () => {
    const first = nextClientIdempotencyKey("params-a", null, () => "key-1");
    let called = false;
    const second = nextClientIdempotencyKey("params-a", first, () => {
      called = true;
      return "key-2";
    });
    expect(second).toBe(first);
    expect(called).toBe(false);
  });

  it("mints a fresh key when paramsKey changed (different attempt)", () => {
    const first = nextClientIdempotencyKey("params-a", null, () => "key-1");
    const second = nextClientIdempotencyKey("params-b", first, () => "key-2");
    expect(second).toEqual({ paramsKey: "params-b", idempotencyKey: "key-2" });
  });
});
