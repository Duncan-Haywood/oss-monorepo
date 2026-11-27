import { describe, expect, it } from "vitest";
import { type WaiverFollowUpInput, waiversToSend, waiverToSendText } from "./waiver-followup";

const paid = { id: "P1", number: 3, status: "paid" as const };
const w = (
  kind: WaiverFollowUpInput["kind"],
  status: WaiverFollowUpInput["status"] = "sent",
  extra: Partial<WaiverFollowUpInput> = {},
): WaiverFollowUpInput => ({ kind, status, state: "AZ", ...extra });

describe("waiversToSend", () => {
  it("asks for the unconditional waiver once a paid application's conditional one went out", () => {
    expect(waiversToSend(paid, [w("conditional-progress")])).toEqual([
      { payAppId: "P1", number: 3, scope: "progress", state: "AZ", reason: "missing" },
    ]);
  });

  it("says nothing before the application is paid, even when paid short", () => {
    for (const status of ["draft", "submitted", "certified"] as const) {
      expect(waiversToSend({ ...paid, status }, [w("conditional-progress")])).toEqual([]);
    }
  });

  it("says nothing when no conditional waiver was sent (a draft one, or none at all)", () => {
    expect(waiversToSend(paid, [])).toEqual([]);
    expect(waiversToSend(paid, [w("conditional-progress", "draft")])).toEqual([]);
  });

  it("a sent unconditional waiver of the same scope settles it; a saved draft is 'unsent'", () => {
    expect(waiversToSend(paid, [w("conditional-progress"), w("unconditional-progress")])).toEqual(
      [],
    );
    expect(
      waiversToSend(paid, [w("conditional-progress"), w("unconditional-progress", "draft")]),
    ).toEqual([{ payAppId: "P1", number: 3, scope: "progress", state: "AZ", reason: "unsent" }]);
  });

  it("an unconditional progress waiver does not settle a final one, but a final settles progress", () => {
    expect(
      waiversToSend(paid, [w("conditional-final"), w("unconditional-progress")]).map(
        (x) => x.scope,
      ),
    ).toEqual(["final"]);
    expect(
      waiversToSend(paid, [
        w("conditional-progress"),
        w("conditional-final"),
        w("unconditional-final"),
      ]),
    ).toEqual([]);
  });

  it("leaves out a state with no unconditional form (Utah)", () => {
    expect(
      waiversToSend(paid, [
        w("conditional-progress", "sent", { state: "UT", noUnconditionalForm: true }),
      ]),
    ).toEqual([]);
  });

  it("names the application, the scope and the GC", () => {
    const [x] = waiversToSend(paid, [w("conditional-final")]);
    if (!x) throw new Error("expected one");
    expect(waiverToSendText(x, "Copper State Builders")).toBe(
      "Application #3 is paid and you sent a conditional final waiver for it: the unconditional final waiver for that payment is next, if Copper State Builders or the subcontract asks for one.",
    );
    expect(waiverToSendText({ ...x, reason: "unsent" }, "Copper State Builders")).toMatch(
      /saved but not marked sent: send it to Copper State Builders/,
    );
  });
});

describe("waiversToSend with amounts (partial payments)", () => {
  const paidFull = { ...paid, paidCents: 4_500_000 };
  const amt = (
    kind: WaiverFollowUpInput["kind"],
    amountCents: number,
    status: WaiverFollowUpInput["status"] = "sent",
  ) => w(kind, status, { amountCents });

  it("one unconditional waiver for the first check leaves the second check's waiver owed", () => {
    const out = waiversToSend(paidFull, [
      amt("conditional-progress", 4_500_000),
      amt("unconditional-progress", 3_000_000),
    ]);
    expect(out).toEqual([
      {
        payAppId: "P1",
        number: 3,
        scope: "progress",
        state: "AZ",
        reason: "missing",
        remainingCents: 1_500_000,
      },
    ]);
    expect(waiverToSendText(out[0] as (typeof out)[0], "Copper State")).toContain("$15,000.00");
  });

  it("a draft for the rest is a send step, still with the remaining amount", () => {
    const out = waiversToSend(paidFull, [
      amt("conditional-progress", 4_500_000),
      amt("unconditional-progress", 3_000_000),
      amt("unconditional-progress", 1_500_000, "draft"),
    ]);
    expect(out.map((x) => [x.reason, x.remainingCents])).toEqual([["unsent", 1_500_000]]);
  });

  it("sent waivers adding up to the paid amount settle it", () => {
    expect(
      waiversToSend(paidFull, [
        amt("conditional-progress", 4_500_000),
        amt("unconditional-progress", 3_000_000),
        amt("unconditional-progress", 1_500_000),
      ]),
    ).toEqual([]);
  });

  it("without the paid amount or a waiver amount, a sent unconditional still settles it", () => {
    expect(
      waiversToSend(paid, [amt("conditional-progress", 1), amt("unconditional-progress", 1)]),
    ).toEqual([]);
    expect(
      waiversToSend(paidFull, [amt("conditional-progress", 1), w("unconditional-progress")]),
    ).toEqual([]);
  });

  it("a sent unconditional final waiver still settles progress", () => {
    expect(
      waiversToSend(paidFull, [
        amt("conditional-progress", 4_500_000),
        amt("unconditional-progress", 1_000_000),
        amt("unconditional-final", 1),
      ]).filter((x) => x.scope === "progress"),
    ).toEqual([]);
  });
});

describe("waiversToSend on an application paid in part", () => {
  const amt = (
    kind: WaiverFollowUpInput["kind"],
    amountCents: number,
    status: WaiverFollowUpInput["status"] = "sent",
  ) => w(kind, status, { amountCents });
  const part = { id: "P2", number: 4, status: "certified" as const, receivedCents: 3_000_000 };

  it("asks for the unconditional progress waiver for the money received only", () => {
    for (const status of ["submitted", "certified"] as const) {
      expect(waiversToSend({ ...part, status }, [w("conditional-progress")])).toEqual([
        {
          payAppId: "P2",
          number: 4,
          scope: "progress",
          state: "AZ",
          reason: "missing",
          remainingCents: 3_000_000,
          partial: true,
        },
      ]);
    }
  });

  it("says nothing with no money in, no conditional waiver sent, or on a draft", () => {
    expect(waiversToSend({ ...part, receivedCents: 0 }, [w("conditional-progress")])).toEqual([]);
    expect(
      waiversToSend({ ...part, receivedCents: undefined }, [w("conditional-progress")]),
    ).toEqual([]);
    expect(waiversToSend(part, [w("conditional-progress", "draft")])).toEqual([]);
    expect(waiversToSend({ ...part, status: "draft" }, [w("conditional-progress")])).toEqual([]);
  });

  it("never asks for a final waiver while a balance is owed", () => {
    expect(waiversToSend(part, [w("conditional-final")])).toEqual([]);
    expect(
      waiversToSend(part, [w("conditional-progress"), w("conditional-final")]).map((x) => x.scope),
    ).toEqual(["progress"]);
    // An unconditional final already sent: nothing more to ask for.
    expect(waiversToSend(part, [w("conditional-progress"), w("unconditional-final")])).toEqual([]);
  });

  it("subtracts the unconditional progress waivers already sent", () => {
    // Two checks in so far, $10,000 then $20,000; the first one's waiver went out.
    const out = waiversToSend(part, [
      amt("conditional-progress", 4_500_000),
      amt("unconditional-progress", 1_000_000),
    ]);
    expect(out.map((x) => [x.reason, x.remainingCents])).toEqual([["missing", 2_000_000]]);
    expect(
      waiversToSend(part, [
        amt("conditional-progress", 4_500_000),
        amt("unconditional-progress", 3_000_000),
      ]),
    ).toEqual([]);
    // A sent waiver with no amount on record settles it, as for a paid application.
    expect(waiversToSend(part, [w("conditional-progress"), w("unconditional-progress")])).toEqual(
      [],
    );
  });

  it("a saved but unsent unconditional progress waiver is 'unsent'", () => {
    const out = waiversToSend(part, [
      w("conditional-progress"),
      amt("unconditional-progress", 3_000_000, "draft"),
    ]);
    expect(out.map((x) => [x.reason, x.remainingCents, x.partial])).toEqual([
      ["unsent", 3_000_000, true],
    ]);
  });

  it("leaves out a state with no unconditional form (Utah)", () => {
    expect(
      waiversToSend(part, [w("conditional-progress", "sent", { noUnconditionalForm: true })]),
    ).toEqual([]);
  });

  it("names the amount received and warns off the balance", () => {
    const [x] = waiversToSend(part, [w("conditional-progress")]);
    if (!x) throw new Error("expected one");
    const text = waiverToSendText(x, "Copper State Builders");
    expect(text).toContain("paid in part");
    expect(text).toContain("$30,000.00 received");
    expect(text).toContain("never the balance still owed");
    expect(waiverToSendText({ ...x, reason: "unsent" }, "Copper State Builders")).toMatch(
      /not marked sent.*\$30,000\.00 received and no more/,
    );
  });

  it("once the rest is paid, asks only for the later check's waiver", () => {
    const paidLater = { id: "P2", number: 4, status: "paid" as const, paidCents: 4_500_000 };
    const out = waiversToSend(paidLater, [
      amt("conditional-progress", 4_500_000),
      amt("unconditional-progress", 3_000_000),
    ]);
    expect(out.map((x) => [x.remainingCents, x.partial])).toEqual([[1_500_000, undefined]]);
  });
});
