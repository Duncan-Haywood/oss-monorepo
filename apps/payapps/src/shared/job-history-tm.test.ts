// The job history rows for T&M ticket changes (tmTicketEvents in ./job-history.ts) and the
// sentences they read as.
import { describe, expect, it } from "vitest";
import { describeJobEvent, type TmTicketHistoryFacts, tmTicketEvents } from "./job-history";

const ticket = (over: Partial<TmTicketHistoryFacts> = {}): TmTicketHistoryFacts => ({
  number: 7,
  workDate: "2026-11-23",
  description: "Relocate two receptacles",
  location: "Level 2",
  directedBy: "Dana Ortiz",
  reference: null,
  notes: null,
  labor: [{ trade: "Electrician", workers: 2, hoursEach: 3.5, rateCents: 9850 }],
  material: [{ description: "EMT", quantity: 40, unit: "ft", unitCostCents: null }],
  equipment: [{ description: "Scissor lift", hours: 4, rateCents: 3500 }],
  laborMarkupBps: 1500,
  materialMarkupBps: 1000,
  equipmentMarkupBps: 0,
  signedName: null,
  signedTitle: null,
  signedOn: null,
  hasSignatureImage: false,
  ...over,
});

const signed = (over: Partial<TmTicketHistoryFacts> = {}) =>
  ticket({
    signedName: "Dana Ortiz",
    signedTitle: "Superintendent",
    signedOn: "2026-11-24",
    hasSignatureImage: true,
    ...over,
  });

const texts = (before: TmTicketHistoryFacts | null, after: TmTicketHistoryFacts | null) =>
  tmTicketEvents(before, after).map((e) => describeJobEvent(e.action, e.data));

describe("tmTicketEvents", () => {
  it("a new ticket names its number, the day and the work; a delete the same", () => {
    expect(texts(null, ticket())).toEqual([
      "T&M 7 written up for work on 2026-11-23: Relocate two receptacles",
    ]);
    expect(texts(ticket(), null)).toEqual([
      "T&M 7 for work on 2026-11-23 deleted: Relocate two receptacles",
    ]);
    expect(tmTicketEvents(null, null)).toEqual([]);
  });

  it("an edit names quantities apart from rates, and a renumbering or moved date both values", () => {
    expect(
      texts(
        ticket(),
        ticket({ material: [{ description: "EMT", quantity: 40, unit: "ft", unitCostCents: 87 }] }),
      ),
    ).toEqual(["T&M 7 changed: material unit costs"]);
    expect(
      texts(
        ticket(),
        ticket({ labor: [{ trade: "Electrician", workers: 3, hoursEach: 3.5, rateCents: 9850 }] }),
      ),
    ).toEqual(["T&M 7 changed: labor (trades, workers or hours)"]);
    expect(
      texts(ticket(), ticket({ number: 8, workDate: "2026-11-22", equipmentMarkupBps: 500 })),
    ).toEqual([
      "T&M 8 changed: renumbered from 7, work date changed from 2026-11-23 to 2026-11-22, markups",
    ]);
    expect(texts(ticket(), ticket({ equipment: [] }))).toEqual([
      "T&M 7 changed: equipment (items or hours), equipment rates",
    ]);
  });

  it("no change writes nothing", () => {
    expect(tmTicketEvents(ticket(), ticket())).toEqual([]);
    expect(tmTicketEvents(signed(), signed())).toEqual([]);
  });

  it("a signature, its removal and a re-signature by someone else each get a row", () => {
    expect(texts(ticket(), signed())).toEqual([
      "T&M 7 signed for the GC by Dana Ortiz (Superintendent) on 2026-11-24, signature drawn on the device",
    ]);
    expect(texts(ticket(), signed({ signedTitle: null, hasSignatureImage: false }))).toEqual([
      "T&M 7 signed for the GC by Dana Ortiz on 2026-11-24, on paper",
    ]);
    expect(texts(signed(), ticket())).toEqual([
      "T&M 7: signature by Dana Ortiz (Superintendent) dated 2026-11-24 taken off",
    ]);
    expect(texts(signed(), signed({ signedName: "Lee Park", signedTitle: "PM" }))).toEqual([
      "T&M 7: signature by Dana Ortiz (Superintendent) dated 2026-11-24 taken off",
      "T&M 7 signed for the GC by Lee Park (PM) on 2026-11-24, signature drawn on the device",
    ]);
  });

  it("billing and files read as sentences", () => {
    expect(
      describeJobEvent("tm_ticket_billed", {
        ticketNumber: 7,
        changeOrderNumber: "CO-4",
        amountCents: 123_456,
      }),
    ).toBe("T&M 7 billed on change order CO-4 for $1,234.56");
    expect(describeJobEvent("tm_ticket_file_added", { ticketNumber: 7, fileName: "a.jpg" })).toBe(
      "T&M 7: file attached, a.jpg",
    );
    expect(describeJobEvent("tm_ticket_file_deleted", { ticketNumber: 7, fileName: "a.jpg" })).toBe(
      "T&M 7: file removed, a.jpg",
    );
  });
});
