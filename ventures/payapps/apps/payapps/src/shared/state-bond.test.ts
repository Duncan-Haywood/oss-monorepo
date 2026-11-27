// State payment bond claims on public work (src/shared/public-jobs.ts, stateBondClaim), worked by
// hand from each statute's text (read 2026-11-27, ventures/pay-app-guides/sources/
// state-bond-claims.txt). The example: a sub whose last day on the job was Friday 10 July 2026,
// on work the public body accepted on Monday 14 December 2026.
import { describe, expect, it } from "vitest";
import { STATE_BOND_RULES, STATE_BOND_STATES, stateBondClaim } from "./public-jobs";

const LAST = "2026-07-10";
const ACCEPTED = "2026-12-14";

function checked(
  state: string,
  tier: "first" | "second" | "remote" | null,
  acceptedOn: string | null = null,
) {
  const r = stateBondClaim(state, { tier, lastFurnishedOn: LAST, acceptedOn });
  if (r?.kind !== "checked") throw new Error(`expected ${state} to be checked`);
  return r;
}
const dueOf = (r: ReturnType<typeof checked>, citation: string) =>
  r.steps.find((s) => s.citation === citation)?.dueOn;

describe("state bond claims", () => {
  it("covers the eight states read, each with a statute link on its legislature's site", () => {
    expect(STATE_BOND_STATES).toEqual(["AZ", "FL", "NC", "NY", "OH", "TX", "VA", "WA"]);
    for (const s of STATE_BOND_STATES) {
      const rule = STATE_BOND_RULES[s];
      expect(rule?.url).toMatch(/^https:\/\//);
      expect(rule?.checkedOn).toBe("2026-11-27");
    }
  });

  it("Virginia: 90-day notice for a sub's sub, one-year suit for everyone", () => {
    const r = checked("VA", "second");
    // 10 July + 90 days = Thursday 8 October 2026.
    expect(dueOf(r, "Va. Code § 2.2-4341(B)")).toBe("2026-10-08");
    // 10 July 2027 is a Saturday: due the Friday before.
    const suit = r.steps.find((s) => s.citation === "Va. Code § 2.2-4341(C)");
    expect(suit?.statutoryOn).toBe("2027-07-10");
    expect(suit?.dueOn).toBe("2027-07-09");
    expect(r.dated[0]?.citation).toBe("Va. Code § 2.2-4341(B)");
  });

  it("a sub in contract with the prime gets no notice steps", () => {
    const r = checked("VA", "first");
    expect(r.steps.map((s) => s.citation)).toEqual(["Va. Code § 2.2-4341(C)"]);
    expect(checked("AZ", "first").steps.every((s) => s.who === "all")).toBe(true);
  });

  it("New York: 120 days, moved off a Saturday; the suit waits for acceptance", () => {
    const r = checked("NY", "second");
    const notice = r.steps.find((s) => s.citation === "N.Y. State Fin. Law § 137(3)");
    // 10 July + 120 days = Saturday 7 November 2026 -> Friday 6 November.
    expect(notice?.statutoryOn).toBe("2026-11-07");
    expect(notice?.dueOn).toBe("2026-11-06");
    const suit = r.steps.find((s) => s.citation === "N.Y. State Fin. Law § 137(4)(b)");
    expect(suit?.dueOn).toBeNull();
    expect(suit?.waitsFor).toMatch(/accepted/);
    expect(dueOf(checked("NY", "second", ACCEPTED), "N.Y. State Fin. Law § 137(4)(b)")).toBe(
      "2027-12-14",
    );
  });

  it("Texas: the 15th of the 2nd and 3rd months after the last month, retainage 90 days after completion", () => {
    const r = checked("TX", "second", ACCEPTED);
    expect(dueOf(r, "Tex. Gov't Code § 2253.047(c)")).toBe("2026-09-15");
    expect(dueOf(r, "Tex. Gov't Code § 2253.041")).toBe("2026-10-15");
    // 14 December + 90 days = Sunday 14 March 2027 -> Friday 12 March.
    expect(dueOf(r, "Tex. Gov't Code § 2253.046")).toBe("2027-03-12");
    // The suit runs from the day the notice is mailed, which PayApps does not know.
    const suit = r.steps.find((s) => s.citation === "Tex. Gov't Code § 2253.078(b)");
    expect(suit?.dueOn).toBeNull();
    // A November last day rolls into the next year.
    const nov = stateBondClaim("TX", {
      tier: "second",
      lastFurnishedOn: "2026-11-30",
      acceptedOn: null,
    });
    if (nov?.kind !== "checked") throw new Error("expected checked");
    expect(nov.steps[0]?.dueOn).toBe("2027-01-15");
    expect(nov.steps[1]?.dueOn).toBe("2027-02-15");
  });

  it("Florida, Arizona and North Carolina count from the last day", () => {
    const fl = checked("FL", "second");
    expect(dueOf(fl, "Fla. Stat. § 255.05(10)")).toBe("2027-07-09");
    expect(fl.steps.find((s) => s.act.startsWith("Serve a sworn notice"))?.dueOn).toBe(
      "2026-10-08",
    );
    // The 45-day notice runs from the first day, which PayApps does not keep.
    expect(fl.steps[0]?.dueOn).toBeNull();
    expect(dueOf(checked("AZ", "second"), "A.R.S. § 34-223(A)(2)")).toBe("2026-10-08");
    // 120 days = Saturday 7 November -> Friday 6 November.
    expect(dueOf(checked("NC", "second"), "N.C. Gen. Stat. § 44A-27(b)")).toBe("2026-11-06");
  });

  it("Ohio and Washington count from acceptance", () => {
    const oh = checked("OH", "first", ACCEPTED);
    expect(dueOf(oh, "Ohio Rev. Code § 153.56(A)")).toBe("2027-03-12");
    expect(dueOf(oh, "Ohio Rev. Code § 153.56(B)")).toBe("2027-12-14");
    const wa = checked("WA", "first", ACCEPTED);
    expect(dueOf(wa, "RCW 39.08.030(1)")).toBe("2027-01-13");
    expect(checked("WA", "first").dated).toEqual([]);
  });

  it("asks who you contracted with when not said, and warns below the second tier", () => {
    expect(checked("VA", null).notes[0]).toMatch(/Who did you contract with/);
    expect(checked("VA", null).steps).toHaveLength(2);
    expect(checked("VA", "remote").notes[0]).toMatch(/further down the chain/);
  });

  it("names an unsupported state and returns nothing without a state", () => {
    expect(stateBondClaim("CO", { tier: null, lastFurnishedOn: LAST, acceptedOn: null })).toEqual({
      kind: "unsupported",
      state: "CO",
    });
    expect(stateBondClaim("", { tier: null, lastFurnishedOn: LAST, acceptedOn: null })).toBeNull();
  });
});
