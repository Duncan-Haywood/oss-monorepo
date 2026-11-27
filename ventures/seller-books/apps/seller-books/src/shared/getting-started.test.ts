import { describe, expect, it } from "vitest";
import { gettingStarted } from "./getting-started";

const empty = {
  imports: 0,
  platforms: 0,
  items: 0,
  orders: 0,
  ordersWithoutCost: 0,
  expensesAndTrips: 0,
};

describe("gettingStarted", () => {
  it("a new shop has every step to do, in order", () => {
    const g = gettingStarted(empty);
    expect(g.steps.map((s) => [s.key, s.done, s.to])).toEqual([
      ["import", false, "/imports"],
      ["cost", false, "/inventory"],
      ["link", false, "/sales"],
      ["expenses", false, "/expenses"],
    ]);
    expect(g.doneCount).toBe(0);
    expect(g.allDone).toBe(false);
  });

  it("linking is done once any sale has a cost, and says how many are left", () => {
    const g = gettingStarted({
      ...empty,
      imports: 2,
      platforms: 1,
      items: 5,
      orders: 10,
      ordersWithoutCost: 7,
    });
    const link = g.steps.find((s) => s.key === "link");
    expect(link?.done).toBe(true);
    expect(link?.detail).toBe("7 sales of 10 still without a cost of goods.");
    expect(g.steps[0]?.detail).toBe("2 reports imported from 1 platform.");
  });

  it("sales with no cost at all leave the link step open", () => {
    const g = gettingStarted({
      ...empty,
      imports: 1,
      platforms: 1,
      orders: 3,
      ordersWithoutCost: 3,
    });
    expect(g.steps.find((s) => s.key === "link")?.done).toBe(false);
  });

  it("is all done when every step is", () => {
    const g = gettingStarted({
      imports: 1,
      platforms: 1,
      items: 1,
      orders: 1,
      ordersWithoutCost: 0,
      expensesAndTrips: 1,
    });
    expect(g.allDone).toBe(true);
    expect(g.doneCount).toBe(4);
    expect(g.steps.find((s) => s.key === "link")?.detail).toBe("The one sale has a cost of goods.");
    expect(g.steps.find((s) => s.key === "expenses")?.detail).toBe("1 expense or trip logged.");
  });
});
