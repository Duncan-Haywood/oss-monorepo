import { describe, expect, it } from "vitest";
import {
  addDays,
  type CompanySubmittalInput,
  daysBetween,
  defaultTransmittalRequest,
  latestRevisionIds,
  nextSubmittalNumber,
  type SubmittalFacts,
  type SubmittalRow,
  submittalLabel,
  submittalProblem,
  submittalStatus,
  submittalsToChase,
  submittalToChaseText,
  summarizeSubmittals,
  transmittalReturnBy,
} from "./submittals";

const base: SubmittalFacts = {
  number: 1,
  revision: 0,
  specSection: "23 31 13",
  title: "Ductwork shop drawings",
  type: "shop_drawings",
  submittedOn: null,
  requiredBy: null,
  returnedOn: null,
  action: null,
  neededOnSite: null,
  leadTimeDays: null,
  reviewDays: null,
};
const s = (over: Partial<SubmittalFacts>): SubmittalFacts => ({ ...base, ...over });

describe("dates", () => {
  it("counts calendar days across a month and a leap day", () => {
    expect(daysBetween("2028-02-27", "2028-03-01")).toBe(3);
    expect(addDays("2028-03-01", -2)).toBe("2028-02-28");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });
});

describe("submittalStatus", () => {
  it("is not submitted until a sent date is typed", () => {
    const st = submittalStatus(base, "2026-11-26");
    expect(st.state).toBe("not_submitted");
    expect(st.daysWithGc).toBeNull();
    expect(st.submitBy).toBeNull();
    expect(st.deliveryAtRisk).toBeNull();
  });

  it("counts days with the GC and flags overdue past the required-back date", () => {
    const st = submittalStatus(
      s({ submittedOn: "2026-11-02", requiredBy: "2026-11-16" }),
      "2026-11-26",
    );
    expect(st.state).toBe("with_gc");
    expect(st.daysWithGc).toBe(24);
    expect(st.overdue).toBe(true);
    expect(st.daysOverdue).toBe(10);
  });

  it("is not overdue on the required-back date itself", () => {
    const st = submittalStatus(
      s({ submittedOn: "2026-11-02", requiredBy: "2026-11-26" }),
      "2026-11-26",
    );
    expect(st.overdue).toBe(false);
  });

  it("closes on approved, approved as noted and for record; resubmit on the others", () => {
    const back = { submittedOn: "2026-11-02", returnedOn: "2026-11-12" };
    expect(submittalStatus(s({ ...back, action: "approved" }), "2026-11-26").state).toBe(
      "approved",
    );
    expect(submittalStatus(s({ ...back, action: "approved_as_noted" }), "2026-11-26").state).toBe(
      "approved",
    );
    expect(submittalStatus(s({ ...back, action: "for_record" }), "2026-11-26").state).toBe(
      "approved",
    );
    const r = submittalStatus(s({ ...back, action: "revise_resubmit" }), "2026-11-26");
    expect(r.state).toBe("resubmit");
    expect(r.daysWithGc).toBe(10);
    expect(submittalStatus(s({ ...back, action: "rejected" }), "2026-11-26").state).toBe(
      "resubmit",
    );
  });

  it("works back a submit-by date from needed on site, lead time and review days", () => {
    const facts = s({ neededOnSite: "2027-03-01", leadTimeDays: 42, reviewDays: 14 });
    const early = submittalStatus(facts, "2027-01-01");
    expect(early.submitBy).toBe("2027-01-04");
    expect(early.lateToSubmit).toBe(false);
    expect(early.deliveryAtRisk).toBe(false);
    const late = submittalStatus(facts, "2027-01-10");
    expect(late.lateToSubmit).toBe(true);
    expect(late.deliveryAtRisk).toBe(true);
  });

  it("takes review days as zero when none are typed", () => {
    const st = submittalStatus(s({ neededOnSite: "2027-03-01", leadTimeDays: 28 }), "2027-01-01");
    expect(st.submitBy).toBe("2027-02-01");
  });

  it("judges an out submittal by its required-back date, or today once that has passed", () => {
    const facts = s({
      submittedOn: "2027-01-04",
      requiredBy: "2027-01-18",
      neededOnSite: "2027-03-01",
      leadTimeDays: 42,
    });
    expect(submittalStatus(facts, "2027-01-10").deliveryAtRisk).toBe(false);
    // Still out on 1 Feb: back today at the earliest, plus six weeks, is past 1 March.
    expect(submittalStatus(facts, "2027-02-01").deliveryAtRisk).toBe(true);
  });

  it("uses the sent date plus review days when no required-back date is typed", () => {
    const facts = s({
      submittedOn: "2027-01-04",
      reviewDays: 21,
      neededOnSite: "2027-03-01",
      leadTimeDays: 42,
    });
    // Expected back 25 Jan, plus 42 days is 8 March: late.
    expect(submittalStatus(facts, "2027-01-10").deliveryAtRisk).toBe(true);
  });

  it("judges an approved one by its returned date", () => {
    const facts = s({
      submittedOn: "2027-01-04",
      returnedOn: "2027-01-15",
      action: "approved",
      neededOnSite: "2027-03-01",
      leadTimeDays: 42,
    });
    expect(submittalStatus(facts, "2027-02-20").deliveryAtRisk).toBe(false);
  });

  it("judges a resubmittal from today through another review", () => {
    const facts = s({
      submittedOn: "2027-01-04",
      returnedOn: "2027-01-15",
      action: "revise_resubmit",
      neededOnSite: "2027-03-01",
      leadTimeDays: 28,
      reviewDays: 10,
    });
    expect(submittalStatus(facts, "2027-01-16").deliveryAtRisk).toBe(false);
    expect(submittalStatus(facts, "2027-01-25").deliveryAtRisk).toBe(true);
  });

  it("drops a superseded revision out of the flags", () => {
    const st = submittalStatus(
      s({ submittedOn: "2026-11-02", requiredBy: "2026-11-09" }),
      "2026-11-26",
      true,
    );
    expect(st.state).toBe("superseded");
    expect(st.overdue).toBe(false);
    expect(st.deliveryAtRisk).toBeNull();
  });
});

describe("log helpers", () => {
  const rows: SubmittalRow[] = [
    {
      ...s({ submittedOn: "2026-11-01", returnedOn: "2026-11-10", action: "revise_resubmit" }),
      id: "a",
    },
    { ...s({ revision: 1, submittedOn: "2026-11-12", requiredBy: "2026-11-20" }), id: "b" },
    { ...s({ number: 2, title: "Diffusers" }), id: "c" },
    {
      ...s({ number: 3, submittedOn: "2026-11-01", returnedOn: "2026-11-05", action: "approved" }),
      id: "d",
    },
  ];

  it("keeps the newest revision of each number", () => {
    expect([...latestRevisionIds(rows)].sort()).toEqual(["b", "c", "d"]);
    expect(nextSubmittalNumber(rows)).toBe(4);
    expect(nextSubmittalNumber([])).toBe(1);
  });

  it("summarizes the newest revisions only", () => {
    const { summary, status } = summarizeSubmittals(rows, "2026-11-26");
    expect(summary).toEqual({
      total: 3,
      notSubmitted: 1,
      withGc: 1,
      overdue: 1,
      closed: 1,
      resubmit: 0,
      lateToSubmit: 0,
      deliveryAtRisk: 0,
    });
    expect(status.get("a")?.state).toBe("superseded");
  });

  it("labels with the spec section and revision", () => {
    expect(submittalLabel({ number: 7, revision: 0, specSection: null })).toBe("#7");
    expect(submittalLabel({ number: 7, revision: 2, specSection: "08 71 00" })).toBe(
      "08 71 00 #7 Rev 2",
    );
  });
});

describe("submittalProblem", () => {
  it("accepts a consistent record", () => {
    expect(
      submittalProblem(
        s({ submittedOn: "2026-11-01", returnedOn: "2026-11-05", action: "approved" }),
      ),
    ).toBeNull();
  });
  it("refuses a returned date without a sent date, or before it", () => {
    expect(submittalProblem(s({ returnedOn: "2026-11-05", action: "approved" }))).toMatch(/sent/);
    expect(
      submittalProblem(
        s({ submittedOn: "2026-11-06", returnedOn: "2026-11-05", action: "approved" }),
      ),
    ).toMatch(/before/);
  });
  it("needs a returned date and an action together", () => {
    expect(submittalProblem(s({ submittedOn: "2026-11-01", action: "approved" }))).toMatch(
      /came back/,
    );
    expect(submittalProblem(s({ submittedOn: "2026-11-01", returnedOn: "2026-11-05" }))).toMatch(
      /action/,
    );
  });
  it("refuses a required-back date before the sent date", () => {
    expect(submittalProblem(s({ submittedOn: "2026-11-06", requiredBy: "2026-11-05" }))).toMatch(
      /required-back/,
    );
  });
});

describe("transmittal", () => {
  it("asks for record on close-out and test documents, approval on the rest", () => {
    expect(defaultTransmittalRequest("shop_drawings")).toBe("approval");
    expect(defaultTransmittalRequest("samples")).toBe("approval");
    expect(defaultTransmittalRequest("other")).toBe("approval");
    expect(defaultTransmittalRequest("o_and_m")).toBe("record");
    expect(defaultTransmittalRequest("warranty")).toBe("record");
    expect(defaultTransmittalRequest("test_report")).toBe("record");
  });

  it("asks for it back by the required-back date, else sent plus review days", () => {
    expect(
      transmittalReturnBy({ requiredBy: "2026-11-16", submittedOn: "2026-11-02", reviewDays: 10 }),
    ).toBe("2026-11-16");
    expect(
      transmittalReturnBy({ requiredBy: null, submittedOn: "2026-11-25", reviewDays: 14 }),
    ).toBe("2026-12-09");
    expect(transmittalReturnBy({ requiredBy: null, submittedOn: null, reviewDays: 14 })).toBeNull();
    expect(
      transmittalReturnBy({ requiredBy: null, submittedOn: "2026-11-25", reviewDays: null }),
    ).toBeNull();
  });
});

describe("submittalsToChase", () => {
  const today = "2026-11-23";
  const c = (id: string, over: Partial<CompanySubmittalInput>): CompanySubmittalInput => ({
    ...base,
    id,
    projectId: "p1",
    projectName: "Clinic TI",
    projectNumber: null,
    gcName: "Harbor Builders",
    ...over,
  });

  it("lists overdue-back, late-to-send and resubmit, newest revision only, at-risk first", () => {
    const list = submittalsToChase(
      [
        // Overdue back 7 days, no delivery dates: not at risk.
        c("a", { number: 1, submittedOn: "2026-11-02", requiredBy: "2026-11-16" }),
        // Late to send: needed 2026-12-20 minus 30 lead minus 10 review = 2026-11-10, 13 days ago.
        c("b", { number: 2, neededOnSite: "2026-12-20", leadTimeDays: 30, reviewDays: 10 }),
        // Returned for resubmittal 3 days ago.
        c("c", {
          number: 3,
          submittedOn: "2026-11-01",
          returnedOn: "2026-11-20",
          action: "revise_resubmit",
        }),
        // Rev 0 rejected, Rev 1 approved: nothing to chase.
        c("d0", {
          number: 4,
          submittedOn: "2026-10-01",
          returnedOn: "2026-10-10",
          action: "rejected",
        }),
        c("d1", {
          number: 4,
          revision: 1,
          submittedOn: "2026-10-12",
          returnedOn: "2026-10-20",
          action: "approved",
        }),
        // With the GC, required back in the future: not overdue.
        c("e", { number: 5, submittedOn: "2026-11-20", requiredBy: "2026-12-04" }),
        // Not sent, no dates to tell: never late.
        c("f", { number: 6 }),
        // Same number on another job is its own submittal.
        c("g", {
          projectId: "p2",
          projectName: "Annex",
          number: 4,
          submittedOn: "2026-11-01",
          requiredBy: "2026-11-22",
        }),
      ],
      today,
    );
    expect(list.map((x) => [x.id, x.reason, x.days, x.deliveryAtRisk])).toEqual([
      ["b", "late_to_send", 13, true],
      ["a", "overdue_back", 7, false],
      ["c", "resubmit", 3, false],
      ["g", "overdue_back", 1, false],
    ]);
  });

  it("says why in words", () => {
    const [late, back, resub] = submittalsToChase(
      [
        c("b", {
          number: 2,
          neededOnSite: "2026-12-20",
          leadTimeDays: 30,
          reviewDays: 10,
          specSection: null,
          title: "VAV boxes",
        }),
        c("a", {
          number: 1,
          projectNumber: "2207",
          submittedOn: "2026-11-02",
          requiredBy: "2026-11-22",
        }),
        c("c", {
          number: 3,
          revision: 1,
          submittedOn: "2026-11-01",
          returnedOn: today,
          action: "rejected",
          title: " Grilles ",
        }),
      ],
      today,
    );
    expect(late && submittalToChaseText(late)).toBe(
      "Clinic TI, #2 VAV boxes: not sent, last day to send was 2026-11-10, 13 days ago (Harbor Builders). Delivery on site is at risk.",
    );
    expect(back && submittalToChaseText(back)).toBe(
      "Clinic TI (#2207), 23 31 13 #1 Ductwork shop drawings: back from the GC by 2026-11-22, 1 day overdue (Harbor Builders).",
    );
    expect(resub && submittalToChaseText(resub)).toBe(
      "Clinic TI, 23 31 13 #3 Rev 1 Grilles: returned for resubmittal 2026-11-23, today: send Rev 2 (Harbor Builders).",
    );
  });
});
