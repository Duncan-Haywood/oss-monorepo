import { describe, expect, it } from "vitest";
import { sortOrdersNewestFirst } from "./types";

describe("sortOrdersNewestFirst", () => {
  it("orders by createdAt descending without mutating input", () => {
    const input = [
      { id: "old", createdAt: "2026-07-01T00:00:00.000Z" },
      { id: "new", createdAt: "2026-07-12T00:00:00.000Z" },
      { id: "mid", createdAt: "2026-07-06T00:00:00.000Z" },
    ];
    const sorted = sortOrdersNewestFirst(input);
    expect(sorted.map((o) => o.id)).toEqual(["new", "mid", "old"]);
    expect(input[0]?.id).toBe("old");
  });
});
