// Change order request: the pure model (@shared/change-order-request) and its PDF.

import {
  buildChangeOrderRequest,
  type ChangeOrderRequestInput,
  changeOrderFileName,
  scheduleText,
} from "@shared/change-order-request";
import { changeOrderPdf } from "@worker/services/export/change-order-pdf";
import { describe, expect, it } from "vitest";

const decode = (b: Uint8Array) => new TextDecoder().decode(b);

function input(overrides: Partial<ChangeOrderRequestInput> = {}): ChangeOrderRequestInput {
  return {
    contractor: { name: "Volt Electric" },
    project: {
      name: "Riverside Clinic",
      number: "RC-12",
      location: "Tucson, AZ",
      gcName: "Harbor Builders",
      gcAddress: null,
      ownerName: null,
      contractDate: "2026-03-01",
      originalContractSumCents: 10_000_000,
    },
    sov: [
      { id: "L1", itemNumber: "1", description: "Rough-in", changeOrderId: null },
      { id: "L2", itemNumber: "2", description: "Fixtures", changeOrderId: null },
      { id: "L3", itemNumber: "CO1-1", description: "EV chargers", changeOrderId: "co1" },
      { id: "L4", itemNumber: "CO3-1", description: "Generator", changeOrderId: "co3" },
    ],
    changeOrders: [
      {
        id: "co1",
        number: "1",
        description: "Add two EV chargers in the garage",
        status: "pending",
        approvedOn: null,
        submittedOn: "2026-10-02",
        scheduleDays: 5,
        items: [
          { sovLineId: "L3", amountCents: 1_250_000 },
          { sovLineId: "L2", amountCents: -50_000 },
        ],
      },
      {
        id: "co2",
        number: "2",
        description: "Delete exterior lighting",
        status: "approved",
        approvedOn: "2026-06-01",
        submittedOn: null,
        scheduleDays: null,
        items: [{ sovLineId: "L2", amountCents: -300_000 }],
      },
      {
        id: "co3",
        number: "3",
        description: "Standby generator",
        status: "pending",
        approvedOn: null,
        submittedOn: null,
        scheduleDays: null,
        items: [{ sovLineId: "L4", amountCents: 4_000_000 }],
      },
      {
        id: "co4",
        number: "4",
        description: "Rejected extra",
        status: "rejected",
        approvedOn: null,
        submittedOn: null,
        scheduleDays: null,
        items: [{ sovLineId: "L1", amountCents: 99_999 }],
      },
    ],
    changeOrderId: "co1",
    today: "2026-11-25",
    ...overrides,
  };
}

describe("buildChangeOrderRequest", () => {
  it("prices the change by line and puts the contract before and after it", () => {
    const d = buildChangeOrderRequest(input());
    expect(d.lines).toEqual([
      { itemNumber: "CO1-1", description: "EV chargers", newLine: true, amountCents: 1_250_000 },
      { itemNumber: "2", description: "Fixtures", newLine: false, amountCents: -50_000 },
    ]);
    expect(d.totalCents).toBe(1_200_000);
    expect(d.contract).toEqual({
      originalCents: 10_000_000,
      approvedChangesCents: -300_000, // co2 only: pending co3 and rejected co4 never count
      beforeCents: 9_700_000,
      afterCents: 10_900_000,
      otherPendingCents: 4_000_000,
      otherPendingCount: 1,
    });
    expect(d.date).toBe("2026-10-02"); // the date sent, when recorded
    expect(d.project).not.toHaveProperty("originalContractSumCents");
  });

  it("dates an unsent request today and leaves an approved one out of its own 'before'", () => {
    const d = buildChangeOrderRequest(input({ changeOrderId: "co2" }));
    expect(d.date).toBe("2026-11-25");
    expect(d.contract.approvedChangesCents).toBe(0);
    expect(d.contract.beforeCents).toBe(10_000_000);
    expect(d.contract.afterCents).toBe(9_700_000);
    expect(d.contract.otherPendingCount).toBe(2);
    expect(d.contract.otherPendingCents).toBe(5_200_000);
  });

  it("lists the backup files by kind, without the signed change order", () => {
    expect(buildChangeOrderRequest(input()).backup).toEqual([]);
    const d = buildChangeOrderRequest(
      input({
        files: [
          { fileName: "Quote 5512.pdf", category: "backup" },
          { fileName: "CO1 signed.pdf", category: "signed" },
          { fileName: "Wall.jpg", category: "photo" },
          { fileName: "Notes.txt", category: "other" },
        ],
      }),
    );
    expect(d.backup).toEqual([
      { fileName: "Quote 5512.pdf", kind: "Pricing backup" },
      { fileName: "Wall.jpg", kind: "Photo of the condition or work" },
      { fileName: "Notes.txt", kind: "Other" },
    ]);
    const text = decode(changeOrderPdf(d));
    expect(text).toContain("(Backup attached) Tj");
    expect(text).toContain("(Quote 5512.pdf) Tj");
    expect(text).not.toContain("CO1 signed.pdf");
  });

  it("throws for a change order that is not in the project", () => {
    expect(() => buildChangeOrderRequest(input({ changeOrderId: "nope" }))).toThrow();
  });

  it("names the file after the change order and the job", () => {
    expect(changeOrderFileName(buildChangeOrderRequest(input()))).toBe("co-1-rc-12.pdf");
    const unnamed = input();
    unnamed.project.number = null;
    expect(changeOrderFileName(buildChangeOrderRequest(unnamed))).toBe("co-1-riverside-clinic.pdf");
  });
});

describe("scheduleText", () => {
  it("states not stated, none, one day and many", () => {
    expect(scheduleText(null)).toContain("not stated");
    expect(scheduleText(0)).toContain("no change");
    expect(scheduleText(1)).toContain("1 calendar day ");
    expect(scheduleText(14)).toContain("14 calendar days");
  });
});

describe("change order request PDF", () => {
  it("prints the request, its lines, the contract sum and both signature blocks", () => {
    const text = decode(changeOrderPdf(buildChangeOrderRequest(input())));
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("(Change Order Request 1) Tj");
    expect(text).toContain("(Add two EV chargers in the garage) Tj");
    expect(text).toContain("(New line) Tj");
    expect(text).toContain("(\\(500.00\\)) Tj"); // a deduction, in parentheses
    expect(text).toContain("($12,000.00) Tj");
    expect(text).toContain("(Contract sum if this change order is approved) Tj");
    expect(text).toContain("($109,000.00) Tj");
    expect(text).toContain("1 other change order awaiting approval, net $40,000.00.");
    expect(text).toContain("(Accepted by \\(general contractor\\)) Tj");
    expect(text).toContain("Not an AIA document");
    expect(text).not.toContain("REJECTED");
    expect(text).toContain("(Contract time: an extension of 5 calendar days is requested.) Tj");
    // Every xref offset points at the start of its object.
    const xref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    const offsets = [...text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) =>
      Number(m[1]),
    );
    offsets.forEach((o, i) => {
      expect(text.slice(o).startsWith(`${i + 1} 0 obj`)).toBe(true);
    });
  });

  it("titles an approved change order by its approval and banners a rejected one", () => {
    const approved = decode(
      changeOrderPdf(buildChangeOrderRequest(input({ changeOrderId: "co2" }))),
    );
    expect(approved).toContain("(Change Order 2) Tj");
    expect(approved).toContain("(Approved 2026-06-01) Tj");
    expect(approved).toContain("(Contract sum including this change order) Tj");
    expect(approved).toContain("(\\($3,000.00\\)) Tj"); // a deduction: sign outside the dollar
    const rejected = decode(
      changeOrderPdf(buildChangeOrderRequest(input({ changeOrderId: "co4" }))),
    );
    expect(rejected).toContain("REJECTED BY THE GC - FOR RECORDS ONLY");
  });

  it("runs a long change order over more pages with the footer on each", () => {
    const base = input();
    const sov = Array.from({ length: 80 }, (_, i) => ({
      id: `X${i}`,
      itemNumber: `X${i}`,
      description: `Line ${i}`,
      changeOrderId: null,
    }));
    const co = base.changeOrders[0];
    if (!co) throw new Error("fixture");
    co.items = sov.map((l) => ({ sovLineId: l.id, amountCents: 10_000 }));
    co.description = "Long scope. ".repeat(120);
    const text = decode(
      changeOrderPdf(buildChangeOrderRequest({ ...base, sov: [...base.sov, ...sov] })),
    );
    const pages = Number(/\/Count (\d+)/.exec(text)?.[1]);
    expect(pages).toBeGreaterThanOrEqual(3);
    expect(text).toContain(`(CO 1 - page ${pages}/${pages}) Tj`);
    expect(text).toContain("($8,000.00) Tj");
  });
});
