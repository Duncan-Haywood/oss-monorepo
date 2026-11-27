import { describe, expect, it } from "vitest";
import {
  commitmentForPo,
  commitmentKindFor,
  daysBetween,
  qboCostSource,
  qboPoSource,
  qboTxnLabel,
  suggestCostCategory,
} from "./job-cost-qbo";

describe("suggestCostCategory", () => {
  it("guesses from common contractor account and item names", () => {
    expect(suggestCostCategory("Job Materials", null)).toBe("material");
    expect(suggestCostCategory("Cost of Goods Sold:Subcontractors", null)).toBe("subcontract");
    expect(suggestCostCategory("Job Expenses:Equipment Rental", null)).toBe("equipment");
    expect(suggestCostCategory("Payroll Expenses:Wages", null)).toBe("labor");
    expect(suggestCostCategory("Job Expenses", "Lift rental")).toBe("equipment");
    expect(suggestCostCategory("Permits", null)).toBe("other");
    expect(suggestCostCategory(null, null)).toBe("other");
  });
});

describe("labels and keys", () => {
  it("names the transaction as a bookkeeper would", () => {
    expect(qboTxnLabel("Bill", null, 100)).toBe("Bill");
    expect(qboTxnLabel("Purchase", "CreditCard", -100)).toBe("Card credit");
    expect(qboTxnLabel("Purchase", "Check", 100)).toBe("Check");
    expect(qboTxnLabel("VendorCredit", null, -100)).toBe("Vendor credit");
    expect(qboTxnLabel("JournalEntry", null, -100)).toBe("Journal entry");
  });

  it("keys a line by company, type, transaction and line", () => {
    expect(qboCostSource("9130", "Bill", "146", "1")).toBe("9130:Bill:146:1");
    expect(daysBetween("2026-01-01", "2026-12-31")).toBe(364);
  });
});

describe("purchase orders", () => {
  const commitments = [
    { id: "a", qboSource: "9130:PurchaseOrder:201:1" },
    { id: "b", qboSource: "9130:PurchaseOrder:201:2" },
    { id: "c", qboSource: "9130:PurchaseOrder:202:1" },
    { id: "d", qboSource: null },
  ];

  it("keys the order a bill was made from, with or without its line", () => {
    expect(qboPoSource("9130", { txnId: "201", lineId: "2" })).toBe("9130:PurchaseOrder:201:2");
    expect(qboPoSource("9130", { txnId: "201" })).toBe("9130:PurchaseOrder:201");
  });

  it("finds the commitment for an order line, or the order's only line", () => {
    expect(commitmentForPo("9130:PurchaseOrder:201:2", commitments)).toBe("b");
    expect(commitmentForPo("9130:PurchaseOrder:202", commitments)).toBe("c");
    // Two lines of order 201 are commitments and QuickBooks did not say which: none is guessed.
    expect(commitmentForPo("9130:PurchaseOrder:201", commitments)).toBeNull();
    expect(commitmentForPo("9130:PurchaseOrder:203:1", commitments)).toBeNull();
    // Order 20 is not order 201.
    expect(commitmentForPo("9130:PurchaseOrder:20", commitments)).toBeNull();
    // Another company's order with the same ids is not matched.
    expect(commitmentForPo("777:PurchaseOrder:202", commitments)).toBeNull();
  });

  it("makes a subcontractor's order a subcontract", () => {
    expect(commitmentKindFor("subcontract")).toBe("subcontract");
    expect(commitmentKindFor("material")).toBe("purchase_order");
  });
});
