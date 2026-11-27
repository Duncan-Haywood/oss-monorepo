// The first-run checklist on the Profit & loss page: what a new shop still has to do before the
// figures mean anything. Every step is read from the books themselves (GET
// /api/orgs/:orgId/getting-started counts the rows), so it is the same on every device and for every
// member, and it ticks itself the moment the data is there; nothing is stored about the checklist.

export interface GettingStartedCounts {
  /** Marketplace reports imported (import batches). */
  imports: number;
  /** Platforms with at least one sale or charge booked. */
  platforms: number;
  /** Inventory items (typed in, from a lot, or from a sourcing sheet). */
  items: number;
  /** Order rows (kind "order"). */
  orders: number;
  /** Order rows with no inventory item linked, so no cost of goods. */
  ordersWithoutCost: number;
  /** Expenses plus mileage trips. */
  expensesAndTrips: number;
}

export type GettingStartedStepKey = "import" | "cost" | "link" | "expenses";

export interface GettingStartedStep {
  key: GettingStartedStepKey;
  title: string;
  /** Why it matters, or what is left, in one sentence. */
  detail: string;
  done: boolean;
  /** App path under /o/$orgId where the step is done. */
  to: "/imports" | "/inventory" | "/sales" | "/expenses";
}

export interface GettingStarted {
  steps: GettingStartedStep[];
  doneCount: number;
  allDone: boolean;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function gettingStarted(c: GettingStartedCounts): GettingStarted {
  const linked = c.orders - c.ordersWithoutCost;
  const steps: GettingStartedStep[] = [
    {
      key: "import",
      title: "Import a marketplace report",
      detail:
        c.imports > 0
          ? `${plural(c.imports, "report")} imported from ${plural(c.platforms, "platform")}.`
          : "Download the sales or payments report from eBay, Etsy, Poshmark, Mercari or another platform and upload it as it is.",
      done: c.imports > 0,
      to: "/imports",
    },
    {
      key: "cost",
      title: "Add what you paid for your stock",
      detail:
        c.items > 0
          ? `${plural(c.items, "item")} in inventory.`
          : "Type in items, a lot with its total cost, or upload your sourcing sheet; without a cost, profit is overstated.",
      done: c.items > 0,
      to: "/inventory",
    },
    {
      key: "link",
      title: "Link sales to the items they sold",
      // Done once any sale carries a cost. Old sales whose cost is lost may never be linked, so all of
      // them is not the bar; the count left is shown instead.
      detail:
        c.orders === 0
          ? "Once a report is in, sales whose SKU matches an item link themselves; the rest are linked by hand."
          : c.ordersWithoutCost === 0
            ? c.orders === 1
              ? "The one sale has a cost of goods."
              : `All ${c.orders} sales have a cost of goods.`
            : `${plural(c.ordersWithoutCost, "sale")} of ${c.orders} still without a cost of goods.`,
      done: linked > 0,
      to: "/sales",
    },
    {
      key: "expenses",
      title: "Log expenses and mileage",
      detail:
        c.expensesAndTrips > 0
          ? `${plural(c.expensesAndTrips, "expense or trip", "expenses and trips")} logged.`
          : "Supplies, shipping materials and sourcing trips lower your Schedule C profit; a card statement CSV fills them in.",
      done: c.expensesAndTrips > 0,
      to: "/expenses",
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  return { steps, doneCount, allDone: doneCount === steps.length };
}
