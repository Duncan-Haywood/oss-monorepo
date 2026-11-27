// State payment bond claims on public work (src/shared/public-jobs.ts, stateBondClaim), worked by
// hand from each statute's text (read 2026-11-27, ventures/pay-app-guides/sources/
// state-bond-claims.txt). The example: a sub whose last day on the job was Friday 10 July 2026,
// on work the public body accepted on Monday 14 December 2026.
import { describe, expect, it } from "vitest";
import { stateBondText } from "./lien-deadline";
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
  it("covers the thirteen states read, each with a statute link on its legislature's site", () => {
    expect(STATE_BOND_STATES).toEqual([
      "AZ",
      "FL",
      "MA",
      "MI",
      "MN",
      "NC",
      "NV",
      "NY",
      "OH",
      "OR",
      "TX",
      "VA",
      "WA",
    ]);
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

  it("Massachusetts: 65 days, moved off a Sunday; the petition within a year", () => {
    const r = checked("MA", "second");
    const notice = r.steps.find((s) => s.citation === "Mass. Gen. Laws ch. 149, § 29, par. 3");
    // 10 July + 65 days = Sunday 13 September 2026 -> Friday 11 September.
    expect(notice?.statutoryOn).toBe("2026-09-13");
    expect(notice?.dueOn).toBe("2026-09-11");
    expect(dueOf(r, "Mass. Gen. Laws ch. 149, § 29, par. 2(a)")).toBe("2027-07-09");
    expect(checked("MA", "first").steps.map((s) => s.who)).toEqual(["all"]);
  });

  it("Michigan and Nevada: a 30-day start notice and a 90-day claim notice for a sub's sub", () => {
    const mi = checked("MI", "second");
    expect(mi.steps[0]?.dueOn).toBeNull();
    expect(mi.steps[0]?.waitsFor).toMatch(/first furnished/);
    expect(dueOf(mi, "MCL 129.207(b)")).toBe("2026-10-08");
    // The suit runs from final payment to the prime, which PayApps does not know.
    const suit = mi.steps.find((s) => s.citation === "MCL 129.209");
    expect(suit?.dueOn).toBeNull();
    expect(suit?.waitsFor).toMatch(/final payment/);
    const nv = checked("NV", "second");
    expect(dueOf(nv, "NRS 339.035(2)(b)")).toBe("2026-10-08");
    expect(dueOf(nv, "NRS 339.055(2)")).toBe("2027-07-09");
    expect(checked("NV", "first").steps.map((s) => s.citation)).toEqual(["NRS 339.055(2)"]);
  });

  it("Minnesota and Oregon: everyone gives the notice, first-tier subs included", () => {
    const mn = checked("MN", "first");
    // 120 days = Saturday 7 November -> Friday 6 November.
    expect(dueOf(mn, "Minn. Stat. § 574.31, subd. 2(a)")).toBe("2026-11-06");
    expect(dueOf(mn, "Minn. Stat. § 574.31, subd. 2(c)")).toBe("2027-07-09");
    const or = checked("OR", "first");
    // 10 July + 180 days = Wednesday 6 January 2027; the suit two years on, Monday 10 July 2028.
    expect(dueOf(or, "ORS 279C.600(1)(b), 279C.605(1)")).toBe("2027-01-06");
    expect(dueOf(or, "ORS 279C.610(3)")).toBe("2028-07-10");
    expect(or.dated[0]?.citation).toBe("ORS 279C.600(1)(b), 279C.605(1)");
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

// The cash page's and weekly email's line (stateBondText, src/shared/lien-deadline.ts), 45 days ahead
// and 30 days after, as the Miller Act's. Virginia second tier: notice 2026-10-08, suit 2027-07-09.
describe("state bond claim reminder on the cash page", () => {
  const owed = { outstandingCents: 1_250_000, retainageHeldCents: 250_000 };
  const va = () => checked("VA", "second");

  it("names the next step within 45 days, with the money owed", () => {
    const t = stateBondText(va(), owed, "2026-09-20", "second") ?? "";
    expect(t).toBe(
      "Virginia payment bond claim in 18 days: Give the contractor written notice of your claim by 2026-10-08 (within 90 days from your last day of labor or material, Va. Code § 2.2-4341(B)), and $15,000.00 is still owed on this job (retainage included). There is no lien on public work, so the bond is the security: send it by a method with proof of delivery (certified mail, return receipt) and ask a construction attorney if payment is not certain.",
    );
    expect(stateBondText(va(), owed, "2026-10-08", "second")).toContain("claim today:");
    expect(stateBondText(va(), owed, "2026-10-07", "second")).toContain("claim tomorrow:");
  });

  it("stays quiet more than 45 days out, with nothing owed, and off the states read", () => {
    expect(stateBondText(va(), owed, "2026-08-23", "second")).toBeNull();
    expect(stateBondText(va(), owed, "2026-08-24", "second")).toContain("in 45 days");
    expect(
      stateBondText(va(), { outstandingCents: 0, retainageHeldCents: 0 }, "2026-09-20", "second"),
    ).toBeNull();
    const ca = stateBondClaim("CA", { tier: null, lastFurnishedOn: LAST, acceptedOn: null });
    expect(ca?.kind).toBe("unsupported");
    expect(stateBondText(ca, owed, "2026-09-20")).toBeNull();
    expect(stateBondText(null, owed, "2026-09-20")).toBeNull();
    // No dates entered: nothing dated, nothing said.
    const undated = stateBondClaim("VA", {
      tier: "second",
      lastFurnishedOn: null,
      acceptedOn: null,
    });
    expect(stateBondText(undated, owed, "2026-09-20", "second")).toBeNull();
  });

  it("a step passed in the last 30 days leads, with the suit still open", () => {
    const t = stateBondText(va(), owed, "2026-10-20", "second") ?? "";
    expect(t).toContain(
      "Virginia payment bond step passed on 2026-10-08: Give the contractor written notice",
    );
    expect(t).toContain(
      "The next step still open: bring suit on the payment bond by 2027-07-09 (within one year after your last day of labor or material, Va. Code § 2.2-4341(C)).",
    );
    expect(t).toContain("Ask a construction attorney what is left on the bond.");
    // 31 days after, and the suit still months away: quiet again.
    expect(stateBondText(va(), owed, "2026-11-08", "second")).toBeNull();
    // 45 days before the suit date, it comes back.
    expect(stateBondText(va(), owed, "2027-05-25", "second")).toContain(
      "claim in 45 days: Bring suit on the payment bond by 2027-07-09",
    );
  });

  it("says when a notice is only for a sub's sub, and when a weekend moved the date", () => {
    const unsure = stateBondClaim("VA", { tier: null, lastFurnishedOn: LAST, acceptedOn: null });
    expect(stateBondText(unsure, owed, "2026-09-20", null)).toContain(
      "Give the contractor written notice of your claim (needed if you contracted with a subcontractor rather than the prime) by 2026-10-08",
    );
    // New York: 120 days from 10 July is Saturday 7 November 2026.
    const ny = checked("NY", "second");
    expect(stateBondText(ny, owed, "2026-11-01", "second")).toContain(
      "by 2026-11-06 (within 120 days from your last day of labor or material, N.Y. State Fin. Law § 137(3); the statute's date, 2026-11-07, is a weekend, so PayApps shows the Friday before)",
    );
  });

  it("a first-tier sub hears only of the suit", () => {
    const first = checked("VA", "first");
    expect(stateBondText(first, owed, "2026-09-20", "first")).toBeNull();
    expect(stateBondText(first, owed, "2027-06-30", "first")).toContain(
      "Bring suit on the payment bond",
    );
  });
});
