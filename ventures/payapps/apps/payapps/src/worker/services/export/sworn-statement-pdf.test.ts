import { computeSwornStatement, swornStatementSchema } from "@shared/sworn-statement";
import { describe, expect, it } from "vitest";
import { SAMPLE_SWORN_MARK, swornStatementPdf } from "./sworn-statement-pdf";

const statement = (rows: number, extra: Record<string, unknown> = {}) =>
  computeSwornStatement(
    swornStatementSchema.parse({
      projectName: "Oak Park Library",
      contractorName: "Lakeside Electric LLC",
      statementDate: "2026-11-26",
      rows: Array.from({ length: rows }, (_, i) => ({
        name: `Supplier ${i + 1}`,
        address: `${i + 1} Main St`,
        contractCents: 100_000,
        paidCents: 40_000,
      })),
      ...extra,
    }),
  );
const decode = (b: Uint8Array) => new TextDecoder().decode(b);

describe("swornStatementPdf", () => {
  it("one page, landscape, with totals, affirmation and notary block", () => {
    const pdf = decode(swornStatementPdf(statement(3)));
    expect(pdf).toContain("/Count 1");
    expect(pdf).toContain("/MediaBox [0 0 792 612]");
    expect(pdf).toContain("(Supplier 3)");
    expect(pdf).toContain("(3,000.00)");
    expect(pdf).toContain("(1,800.00)"); // balance total
    expect(pdf).toContain("Subscribed and sworn to");
    expect(pdf).not.toContain("Unpaid"); // wage columns only for Michigan or when entered
  });

  it("Michigan gets the unpaid wage columns; no notary when turned off", () => {
    const pdf = decode(swornStatementPdf(statement(1, { state: "MI", notary: false })));
    expect(pdf).toContain("(Unpaid)");
    expect(pdf).not.toContain("Subscribed and sworn to");
  });

  it("many parties run onto more pages, each numbered", () => {
    const pdf = decode(swornStatementPdf(statement(60)));
    expect(pdf).toMatch(/\/Count [3-9]/);
    expect(pdf).toContain("(Supplier 60)");
    expect(pdf).toMatch(/Page 1 of [3-9]/);
  });

  it("the sample job is marked", () => {
    expect(decode(swornStatementPdf(statement(1), { sample: true }))).toContain(SAMPLE_SWORN_MARK);
  });
});
