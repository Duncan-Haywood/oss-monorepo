import { describe, expect, it } from "vitest";

import { dashboardRowActionAriaLabel } from "./dashboard-row-aria-labels";

describe("dashboardRowActionAriaLabel", () => {
  it("combines action, business name, and slug", () => {
    expect(dashboardRowActionAriaLabel("Add catalog", "Example Bakery", "example-bakery")).toBe(
      "Add catalog — Example Bakery (example-bakery)",
    );
  });

  it("appends optional detail after a colon", () => {
    expect(
      dashboardRowActionAriaLabel(
        "Send Buy now recovery",
        "Example Bakery",
        "example-bakery",
        "Latte",
      ),
    ).toBe("Send Buy now recovery — Example Bakery (example-bakery): Latte");
  });

  it("omits the colon entirely when detail is not provided", () => {
    expect(dashboardRowActionAriaLabel("Mark live", "Example Bakery", "example-bakery")).not.toContain(
      ":",
    );
  });

  it("produces distinct labels for the same action across two different leads", () => {
    const a = dashboardRowActionAriaLabel("Manage billing", "Example Bakery", "example-bakery");
    const b = dashboardRowActionAriaLabel("Manage billing", "Joe's Plumbing", "joes-plumbing");
    expect(a).not.toBe(b);
  });

  it("produces distinct labels for two rows sharing a lead when detail differs", () => {
    const a = dashboardRowActionAriaLabel(
      "Archive",
      "Example Bakery",
      "example-bakery",
      "Jane Doe",
    );
    const b = dashboardRowActionAriaLabel(
      "Archive",
      "Example Bakery",
      "example-bakery",
      "John Smith",
    );
    expect(a).not.toBe(b);
  });
});
