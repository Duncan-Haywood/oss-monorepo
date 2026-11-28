// Public jobs (src/shared/public-jobs.ts): the Miller Act dates, worked by hand, and the retainage
// cap verdicts. The example is the public calculator's (ventures/pay-app-guides/millerbond.mjs): a
// second-tier sub whose last day was Monday 2 March 2026.
import { describe, expect, it } from "vitest";
import { lienDeadline, lienDeadlineText } from "./lien-deadline";
import { addOneYear, millerDates, RETAINAGE_CAPS, retainageCapCheck } from "./public-jobs";

describe("Miller Act dates", () => {
  it("counts 90 days, day 91 and one year from the last day", () => {
    const d = millerDates("2026-03-02", "second");
    // 2 March + 90 days = 31 May 2026, a Sunday: due the Friday before.
    expect(d.noticeOn).toBe("2026-05-31");
    expect(d.noticeDueOn).toBe("2026-05-29");
    expect(d.suitFromOn).toBe("2026-06-01");
    expect(d.suitByOn).toBe("2027-03-02");
    expect(d.suitDueOn).toBe("2027-03-02");
  });

  it("asks no notice of a first-tier sub", () => {
    const d = millerDates("2026-03-02", "first");
    expect(d.noticeOn).toBeNull();
    expect(d.noticeDueOn).toBeNull();
  });

  it("takes 29 February to 28 February", () => {
    expect(addOneYear("2028-02-29")).toBe("2029-02-28");
    expect(addOneYear("2026-12-31")).toBe("2027-12-31");
  });
});

describe("lienDeadline on a public job", () => {
  it("dates a federal second-tier job's notice instead of a lien", () => {
    const r = lienDeadline({
      state: "FL",
      publicOwner: "federal",
      millerTier: "second",
      lastFurnishedOn: "2026-03-02",
    });
    if (r.kind !== "deadline") throw new Error(r.kind);
    expect(r.deadline.state).toBe("US");
    expect(r.deadline.label).toBe("Miller Act notice deadline");
    expect(r.deadline.dueOn).toBe("2026-05-29");
    expect(r.deadline.statutoryOn).toBe("2026-05-31");
    expect(r.deadline.citation).toBe("40 U.S.C. § 3133(b)(2)");
    expect(r.deadline.bondSuitDueOn).toBe("2027-03-02");
    expect(r.deadline.notes.join(" ")).toContain("must be brought by 2027-03-02");
  });

  it("shows the notice when the tier is not given, and the suit limit for a first-tier sub", () => {
    const unsure = lienDeadline({
      state: null,
      publicOwner: "federal",
      lastFurnishedOn: "2026-03-02",
    });
    if (unsure.kind !== "deadline") throw new Error(unsure.kind);
    expect(unsure.deadline.dueOn).toBe("2026-05-29");
    expect(unsure.deadline.notes[0]).toContain("Who did you contract with?");
    const first = lienDeadline({
      state: null,
      publicOwner: "federal",
      millerTier: "first",
      lastFurnishedOn: "2026-03-02",
    });
    if (first.kind !== "deadline") throw new Error(first.kind);
    expect(first.deadline.label).toBe("Miller Act suit deadline");
    expect(first.deadline.dueOn).toBe("2027-03-02");
    expect(first.deadline.citation).toBe("40 U.S.C. § 3133(b)(4)");
  });

  it("estimates from billing like a lien, and says when the bond does not cover the claimant", () => {
    const r = lienDeadline({
      state: null,
      publicOwner: "federal",
      millerTier: "second",
      apps: [
        {
          number: 1,
          status: "submitted",
          periodFrom: "2026-01-01",
          periodTo: "2026-01-31",
          workThisPeriodCents: 100,
        },
      ],
    });
    if (r.kind !== "deadline") throw new Error(r.kind);
    expect(r.deadline.basis).toBe("estimated");
    expect(r.deadline.statutoryOn).toBe("2026-04-01");
    expect(lienDeadline({ state: null, publicOwner: "federal" })).toEqual({
      kind: "no-dates",
      state: "US",
      stateName: "Federal",
    });
    expect(
      lienDeadline({
        state: null,
        publicOwner: "federal",
        millerTier: "remote",
        lastFurnishedOn: "2026-03-02",
      }),
    ).toEqual({ kind: "not-covered" });
  });

  it("has no lien date on a state or local public job", () => {
    expect(
      lienDeadline({ state: "ca", publicOwner: "state_local", lastFurnishedOn: "2026-03-02" }),
    ).toEqual({
      kind: "public",
      state: "CA",
    });
  });

  it("words the cash page's line for the Miller Act, before and after the date", () => {
    const r = lienDeadline({
      state: null,
      publicOwner: "federal",
      millerTier: "second",
      lastFurnishedOn: "2026-03-02",
    });
    if (r.kind !== "deadline") throw new Error(r.kind);
    const owed = { outstandingCents: 120_000, retainageHeldCents: 0, workComplete: true };
    const before = lienDeadlineText(r.deadline, owed, "2026-05-19");
    expect(before).toBe(
      "Federal Miller Act notice deadline in 10 days: give the prime contractor written notice of your payment bond claim by 2026-05-29 (90 days after your last furnishing of labor or materials, 40 U.S.C. § 3133(b)(2)) and $1,200.00 is still owed on this job. Send it by a method with proof of delivery (certified mail, return receipt) and ask a construction attorney if payment is not certain.",
    );
    const after = lienDeadlineText(r.deadline, owed, "2026-06-05") ?? "";
    expect(after).toContain("Federal Miller Act notice deadline passed on 2026-05-29");
    expect(after).toContain("must still be brought by 2027-03-02");
    expect(after).not.toContain("lien");
  });
});

describe("retainage caps on public work", () => {
  it("covers the guide's 25 states, each with a citation and an official link", () => {
    expect(Object.keys(RETAINAGE_CAPS)).toHaveLength(25);
    for (const r of Object.values(RETAINAGE_CAPS)) {
      expect(r.url).toMatch(/^https:\/\//);
      expect(r.citation.length).toBeGreaterThan(3);
      expect(r.capBps).toBeGreaterThan(0);
    }
  });

  it("flags 10% on a California public job as over, and says the cap flows down", () => {
    const c = retainageCapCheck("ca", [1000, 1000]);
    if (c?.kind !== "checked") throw new Error("not checked");
    expect(c.verdict).toBe("over");
    expect(c.text).toBe(
      "This job holds 10%, above the 5% California allows on public work (Cal. Pub. Cont. Code § 7201). The statute applies the same limit to what the prime holds from its subcontractors.",
    );
    expect(
      retainageCapCheck("CA", [500, 500])?.kind === "checked" &&
        retainageCapCheck("CA", [500, 500]),
    ).toMatchObject({
      verdict: "within",
    });
  });

  it("reads a line's own rate, the New York bond exception and the lower stages", () => {
    expect(retainageCapCheck("WA", [500, 500, 1000])).toMatchObject({
      verdict: "over",
      jobBps: 1000,
    });
    const ny = retainageCapCheck("NY", [1000, 1000]);
    expect(ny).toMatchObject({ verdict: "exception" });
    expect(ny?.kind === "checked" && ny.text).toContain(
      "does not require full performance and payment bonds",
    );
    const pa = retainageCapCheck("PA", [1000, 1000]);
    expect(pa).toMatchObject({ verdict: "lower" });
    expect(pa?.kind === "checked" && pa.text).toContain("drops to 5% once the job is 50% complete");
    expect(pa?.kind === "checked" && pa.text).toContain(
      "whether it also limits what your GC holds",
    );
    expect(retainageCapCheck("TX", [1200, 1000])).toMatchObject({ verdict: "over", jobBps: 1200 });
    expect(retainageCapCheck("MI", [500, 500])).toMatchObject({ verdict: "lower" });
  });

  it("South Carolina caps at 3.5%, flowing down; North Dakota stops retaining at 50% complete", () => {
    // S.C. Code § 11-35-3030(4)(a): "no more than three and one-half percent", contract or subcontract.
    const sc = retainageCapCheck("SC", [500, 500]);
    expect(sc).toMatchObject({ verdict: "over", jobBps: 500 });
    expect(sc?.kind === "checked" && sc.text).toBe(
      "This job holds 5%, above the 3.5% South Carolina allows on public work (S.C. Code § 11-35-3030(4)). The statute applies the same limit to what the prime holds from its subcontractors.",
    );
    expect(retainageCapCheck("SC", [350, 0])).toMatchObject({ verdict: "within" });
    // N.D. Cent. Code § 48-01.2-13: ten percent until fifty percent complete, then none further.
    expect(retainageCapCheck("ND", [1000, 1000])).toMatchObject({ verdict: "lower" });
    expect(retainageCapCheck("ND", [1200, 1000])).toMatchObject({ verdict: "over" });
    const nd = retainageCapCheck("nd", [500, 500]);
    expect(nd?.kind === "checked" && nd.text).toContain(
      "drops to 0% on estimates after the project is 50% complete",
    );
  });

  it("reads the states added 2026-11-28: Iowa's 3%, Ohio's labor and materials split, Kansas and Missouri's 10% cases", () => {
    const ia = retainageCapCheck("IA", [500, 500]);
    expect(ia).toMatchObject({ verdict: "over", jobBps: 500 });
    expect(ia?.kind === "checked" && ia.text).toContain("above the 3% Iowa allows");
    expect(retainageCapCheck("IA", [300, 300])).toMatchObject({ verdict: "within" });
    // Ohio: 4% on labor; materials stored but not installed paid at 92%, so 8% there is the exception.
    expect(retainageCapCheck("OH", [400, 0])).toMatchObject({ verdict: "within" });
    const oh = retainageCapCheck("OH", [400, 800]);
    expect(oh).toMatchObject({ verdict: "exception" });
    expect(oh?.kind === "checked" && oh.text).toContain(
      "materials delivered but not yet installed",
    );
    expect(retainageCapCheck("OH", [1000, 1000])).toMatchObject({ verdict: "over" });
    expect(retainageCapCheck("KS", [1000, 1000])).toMatchObject({ verdict: "exception" });
    expect(retainageCapCheck("MO", [1000, 1000])).toMatchObject({ verdict: "exception" });
    expect(retainageCapCheck("MO", [1200, 1000])).toMatchObject({ verdict: "over" });
    for (const s of ["DE", "ID", "ME"])
      expect(retainageCapCheck(s, [1000, 1000])).toMatchObject({ verdict: "over" });
  });

  it("says which states it does not check, and nothing without a state", () => {
    expect(retainageCapCheck("ok", [1000])).toEqual({ kind: "unsupported", state: "OK" });
    expect(retainageCapCheck(null, [1000])).toBeNull();
  });
});
