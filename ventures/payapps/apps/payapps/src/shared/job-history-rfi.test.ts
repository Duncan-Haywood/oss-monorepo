// The job history rows for RFI changes (rfiEvents in ./job-history.ts) and the sentences they read as.
import { describe, expect, it } from "vitest";
import { describeJobEvent, type RfiHistoryFacts, rfiEvents } from "./job-history";

const rfi = (over: Partial<RfiHistoryFacts> = {}): RfiHistoryFacts => ({
  number: 3,
  subject: "Ceiling height at corridor 2",
  question: "Can the ceiling drop to 8'-6\"?",
  suggestion: null,
  reference: "M-201",
  sentOn: null,
  responseDueOn: null,
  answeredOn: null,
  answer: null,
  answeredBy: null,
  costImpact: null,
  timeImpact: null,
  changeOrderId: null,
  changeOrderNumber: null,
  ...over,
});

const texts = (before: RfiHistoryFacts | null, after: RfiHistoryFacts | null) =>
  rfiEvents(before, after).map((e) => describeJobEvent(e.action, e.data));

describe("rfiEvents", () => {
  it("a new RFI: entered, plus answered and linked when entered that way", () => {
    expect(texts(null, rfi())).toEqual([
      "RFI 003 entered: Ceiling height at corridor 2, not sent yet",
    ]);
    expect(
      texts(
        null,
        rfi({
          sentOn: "2026-11-02",
          answeredOn: "2026-11-05",
          answeredBy: "Dana Ruiz",
          changeOrderId: "co_1",
          changeOrderNumber: "CO-4",
        }),
      ),
    ).toEqual([
      "RFI 003 entered: Ceiling height at corridor 2, sent to the GC 2026-11-02",
      "RFI 003 answered on 2026-11-05 by Dana Ruiz",
      "RFI 003 linked to change order CO-4",
    ]);
  });

  it("sent, answered and cleared each get their own row with the dates entered", () => {
    const sent = rfi({ sentOn: "2026-11-02", responseDueOn: "2026-11-09" });
    expect(texts(rfi(), sent)).toEqual([
      "RFI 003: sent to the GC 2026-11-02",
      "RFI 003 changed: response due date 2026-11-09",
    ]);
    const answered = { ...sent, answeredOn: "2026-11-06", answeredBy: "Dana Ruiz", answer: "Yes" };
    expect(texts(sent, answered)).toEqual([
      "RFI 003 answered on 2026-11-06 by Dana Ruiz",
      "RFI 003 changed: answer",
    ]);
    expect(texts(answered, { ...answered, answeredOn: "2026-11-07" })).toEqual([
      "RFI 003: date answered changed from 2026-11-06 to 2026-11-07 by Dana Ruiz",
    ]);
    expect(texts(answered, { ...answered, answeredOn: null })).toEqual([
      "RFI 003: date answered (2026-11-06) cleared, open again",
    ]);
    expect(texts(sent, { ...sent, sentOn: null, responseDueOn: null })).toEqual([
      "RFI 003: date sent cleared",
      "RFI 003 changed: response due date cleared",
    ]);
  });

  it("linking, relinking and unlinking a change order name the numbers", () => {
    const linked = rfi({ changeOrderId: "co_1", changeOrderNumber: "CO-4" });
    expect(texts(rfi(), linked)).toEqual(["RFI 003 linked to change order CO-4"]);
    expect(texts(linked, { ...linked, changeOrderId: "co_2", changeOrderNumber: "CO-5" })).toEqual([
      "RFI 003: change order CO-4 unlinked",
      "RFI 003 linked to change order CO-5",
    ]);
    expect(texts(linked, rfi())).toEqual(["RFI 003: change order CO-4 unlinked"]);
  });

  it("other fields are one row naming them; nothing changed writes nothing", () => {
    expect(
      texts(
        rfi(),
        rfi({ subject: "Ceiling at corridor 2", costImpact: "possible", reference: null }),
      ),
    ).toEqual(["RFI 003 changed: subject, drawing or spec reference, cost impact"]);
    expect(rfiEvents(rfi(), rfi())).toEqual([]);
    expect(rfiEvents(null, null)).toEqual([]);
  });

  it("a deleted RFI keeps its number and subject in the row", () => {
    const events = rfiEvents(rfi(), null);
    expect(events).toEqual([
      {
        action: "rfi_deleted",
        data: { rfiNumber: 3, description: "Ceiling height at corridor 2" },
      },
    ]);
    expect(texts(rfi(), null)).toEqual(["RFI 003 deleted: Ceiling height at corridor 2"]);
  });
});
