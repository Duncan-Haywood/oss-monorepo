import { describe, expect, it, vi } from "vitest";
import { listAllPages } from "./list-all-pages";

type Item = { id: string; key?: string };

function pageOf(ids: string[], has_more: boolean): { data: Item[]; has_more: boolean } {
  return { data: ids.map((id) => ({ id })), has_more };
}

describe("listAllPages", () => {
  it("returns a single page when has_more is false", async () => {
    const fetchPage = vi.fn(async () => pageOf(["a", "b"], false));
    await expect(listAllPages(fetchPage)).resolves.toEqual([{ id: "a" }, { id: "b" }]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(undefined);
  });

  it("walks has_more/starting_after until the list is exhausted", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(pageOf(["p1", "p2"], true))
      .mockResolvedValueOnce(pageOf(["p3"], true))
      .mockResolvedValueOnce(pageOf(["p4", "p5"], false));

    await expect(listAllPages(fetchPage)).resolves.toEqual([
      { id: "p1" },
      { id: "p2" },
      { id: "p3" },
      { id: "p4" },
      { id: "p5" },
    ]);
    expect(fetchPage.mock.calls).toEqual([[undefined], ["p2"], ["p3"]]);
  });

  it("stops early when until matches an item on the current page", async () => {
    const fetchPage = vi
      .fn<(startingAfter?: string) => Promise<{ data: Item[]; has_more: boolean }>>()
      .mockResolvedValueOnce({
        data: [
          { id: "prod_1", key: "other" },
          { id: "prod_2", key: "target" },
          { id: "prod_3", key: "later" },
        ],
        has_more: true,
      })
      .mockResolvedValueOnce(pageOf(["should_not_fetch"], false));

    const listed = await listAllPages(fetchPage, (item) => item.key === "target");
    expect(listed.map((item) => item.id)).toEqual(["prod_1", "prod_2", "prod_3"]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("keeps paging when until does not match until a later page", async () => {
    const fetchPage = vi
      .fn<(startingAfter?: string) => Promise<{ data: Item[]; has_more: boolean }>>()
      .mockResolvedValueOnce({
        data: [{ id: "prod_1", key: "no" }],
        has_more: true,
      })
      .mockResolvedValueOnce({
        data: [{ id: "prod_2", key: "yes" }],
        has_more: true,
      })
      .mockResolvedValueOnce(pageOf(["should_not_fetch"], false));

    const listed = await listAllPages(fetchPage, (item) => item.key === "yes");
    expect(listed.map((item) => item.id)).toEqual(["prod_1", "prod_2"]);
    expect(fetchPage.mock.calls).toEqual([[undefined], ["prod_1"]]);
  });

  it("stops when a page returns empty data even if has_more is true", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(pageOf(["only"], true))
      .mockResolvedValueOnce({ data: [], has_more: true });

    await expect(listAllPages(fetchPage)).resolves.toEqual([{ id: "only" }]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(2, "only");
  });

  it("returns an empty array for an empty first page", async () => {
    const fetchPage = vi.fn(async () => pageOf([], false));
    await expect(listAllPages(fetchPage)).resolves.toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
