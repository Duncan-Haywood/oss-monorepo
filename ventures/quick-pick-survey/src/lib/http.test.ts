import { describe, expect, it } from "vitest";
import { assertRetentionOutlivesWindow, requestBodyTooLarge } from "@/lib/http";

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

/**
 * The guard each database-backed limiter runs at module load. It is the only
 * thing that makes the coupling between a limiter's window and its retention
 * sweep a checked fact rather than a comment: a retention at or below the
 * window deletes the rows the count depends on, and the limiter then admits
 * traffic while every `MAX_*` constant still reads correctly.
 */
describe("assertRetentionOutlivesWindow", () => {
  const WINDOW = 15 * 60 * 1000;

  it("accepts a retention that outlives the window", () => {
    expect(() => assertRetentionOutlivesWindow("test", WINDOW, 24 * 60 * 60 * 1000)).not.toThrow();
    expect(() => assertRetentionOutlivesWindow("test", WINDOW, WINDOW + 1)).not.toThrow();
  });

  it("rejects a retention shorter than the window", () => {
    expect(() => assertRetentionOutlivesWindow("test", WINDOW, 60 * 1000)).toThrow(/must outlive/);
  });

  it("rejects a retention equal to the window, where the sweep races the count", () => {
    expect(() => assertRetentionOutlivesWindow("test", WINDOW, WINDOW)).toThrow(/must outlive/);
  });

  it("rejects a retention of zero rather than reading it as no sweep", () => {
    expect(() => assertRetentionOutlivesWindow("test", WINDOW, 0)).toThrow(/must outlive/);
  });

  it("rejects non-finite or non-positive numbers on either side", () => {
    expect(() => assertRetentionOutlivesWindow("test", WINDOW, Number.NaN)).toThrow(/must outlive/);
    expect(() => assertRetentionOutlivesWindow("test", Number.NaN, 1000)).toThrow(/positive number/);
    expect(() => assertRetentionOutlivesWindow("test", 0, 1000)).toThrow(/positive number/);
    expect(() => assertRetentionOutlivesWindow("test", -1, 1000)).toThrow(/positive number/);
  });

  it("names the limiter that is misconfigured", () => {
    expect(() => assertRetentionOutlivesWindow("admin login limiter", WINDOW, 1)).toThrow(/admin login limiter/);
  });
});
