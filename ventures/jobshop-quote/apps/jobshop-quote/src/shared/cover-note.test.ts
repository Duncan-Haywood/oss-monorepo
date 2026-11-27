import { describe, expect, it } from "vitest";
import { quoteFakeHandlers } from "../worker/services/quotes/fake-llm";
import {
  type CoverNoteFacts,
  coverNoteContext,
  coverNoteProblem,
  numbersIn,
  templateCoverNote,
  ungroundedNumbers,
} from "./cover-note";

const facts: CoverNoteFacts = {
  shopName: "Acme Machine",
  customerName: "Dana Ortiz",
  quoteNumber: "Q-1001",
  validUntil: "2026-12-24",
  leadTimeText: "3 weeks ARO",
  notes: null,
  lines: [
    {
      partNumber: "BRK-1001",
      description: "Motor mount bracket",
      breaks: [{ quantity: 10, unitPriceCents: 5_807, totalCents: 58_070 }],
      includes: ["material: Aluminum 6061-T6 plate", "Mill (Haas VF-2)", "Anodize Type II"],
    },
  ],
};

describe("cover note grounding", () => {
  const context = coverNoteContext(facts);

  it("gives the model no rates, costs or markup", () => {
    expect(context).toContain("Includes: material: Aluminum 6061-T6 plate; Mill (Haas VF-2)");
    expect(context).not.toMatch(/\/h|markup|setup/i);
  });

  it("parses money and decimals", () => {
    expect(numbersIn("$1,234.50 and 0.005 and Rev 3")).toEqual([1234.5, 0.005, 3]);
  });

  it("accepts a note that restates only given numbers", () => {
    expect(ungroundedNumbers("Qty 10 at $58.07 each, $580.70 total, 3 weeks.", context)).toEqual(
      [],
    );
  });

  it("flags invented numbers (a discount, a different price)", () => {
    expect(ungroundedNumbers("We can do 10% off, so $52.26 each.", context)).toEqual([52.26]);
  });

  it("rejects prices, percentages, discounts and swapped numbers", () => {
    expect(coverNoteProblem("Qty 10 at $58.07 each.", context)).toMatch(/price/);
    expect(coverNoteProblem("We can take 10% off.", context)).toMatch(/price or percentage/);
    expect(coverNoteProblem("Ten percent off this week.", context)).not.toBeNull();
    expect(coverNoteProblem("A discount applies.", context)).toMatch(/terms/);
    expect(coverNoteProblem("Pricing for 10 pieces of BRK-1001 is attached.", context)).toBeNull();
    expect(coverNoteProblem("Pricing for 37 pieces is attached.", context)).toMatch(/37/);
  });

  it("the template and the fake LLM note are both grounded", async () => {
    expect(ungroundedNumbers(templateCoverNote(facts), context)).toEqual([]);
    const handler = quoteFakeHandlers["quote.cover_note"];
    const note = String(
      await handler?.({ purpose: "quote.cover_note", system: "", prompt: "", context }),
    );
    expect(note).toContain("Q-1001");
    expect(ungroundedNumbers(note, context)).toEqual([]);
    expect(coverNoteProblem(note, context)).toBeNull();
    expect(coverNoteProblem(templateCoverNote(facts), context)).toBeNull();
  });
});
