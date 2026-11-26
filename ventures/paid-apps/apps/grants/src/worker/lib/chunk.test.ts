import { describe, expect, it } from "vitest";
import { chunk, D1_IN_CHUNK } from "./chunk";

describe("chunk", () => {
  it("splits into consecutive slices with a shorter tail", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("returns no chunks for an empty array and one chunk when it fits", () => {
    expect(chunk([], 3)).toEqual([]);
    expect(chunk(["a", "b"], 90)).toEqual([["a", "b"]]);
  });

  it("keeps every item, in order, with no chunk over the size", () => {
    const ids = Array.from({ length: 251 }, (_, i) => `id${i}`);
    const parts = chunk(ids, D1_IN_CHUNK);
    expect(parts.map((p) => p.length)).toEqual([90, 90, 71]);
    expect(parts.flat()).toEqual(ids);
  });

  it("does not mutate the input", () => {
    const src = [1, 2, 3];
    chunk(src, 1)[0]?.push(9);
    expect(src).toEqual([1, 2, 3]);
  });

  it("rejects sizes that would loop forever", () => {
    expect(() => chunk([1], 0)).toThrow(RangeError);
    expect(() => chunk([1], -1)).toThrow(RangeError);
    expect(() => chunk([1], 1.5)).toThrow(RangeError);
  });
});
