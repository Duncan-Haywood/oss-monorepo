import { describe, expect, it } from "vitest";
import {
  CHANGE_ORDER_DESCRIPTION_MAX,
  type CompanyRfiInput,
  canStartChangeOrder,
  changeOrderDraftFromRfi,
  daysOutstanding,
  daysOverdue,
  impactText,
  needsChangeOrder,
  nextRfiNumber,
  overdueRfis,
  overdueRfiText,
  type RfiFacts,
  rfiDateProblem,
  rfiEmail,
  rfiLabel,
  rfiStatus,
  suggestedDueDate,
  summarizeRfis,
} from "./rfi";

const rfi = (over: Partial<RfiFacts> = {}): RfiFacts => ({
  number: 1,
  subject: "Ceiling height at corridor 2",
  question: "Duct at grid C/4 conflicts with the 9'-0\" ceiling. Can the ceiling drop to 8'-6\"?",
  suggestion: null,
  reference: null,
  sentOn: null,
  responseDueOn: null,
  answeredOn: null,
  answer: null,
  answeredBy: null,
  costImpact: null,
  timeImpact: null,
  changeOrderId: null,
  ...over,
});
const TODAY = "2026-11-26";

describe("rfiStatus", () => {
  it("is draft until sent, open until its due date passes, then overdue, answered once answered", () => {
    expect(rfiStatus(rfi(), TODAY)).toBe("draft");
    expect(rfiStatus(rfi({ sentOn: "2026-11-20" }), TODAY)).toBe("open");
    expect(rfiStatus(rfi({ sentOn: "2026-11-20", responseDueOn: TODAY }), TODAY)).toBe("open");
    expect(rfiStatus(rfi({ sentOn: "2026-11-10", responseDueOn: "2026-11-25" }), TODAY)).toBe(
      "overdue",
    );
    expect(
      rfiStatus(
        rfi({ sentOn: "2026-11-10", responseDueOn: "2026-11-17", answeredOn: "2026-11-24" }),
        TODAY,
      ),
    ).toBe("answered");
  });
});

describe("days", () => {
  it("counts days outstanding from sent to answered, or to today while open", () => {
    expect(daysOutstanding(rfi(), TODAY)).toBeNull();
    expect(daysOutstanding(rfi({ sentOn: "2026-11-20" }), TODAY)).toBe(6);
    expect(daysOutstanding(rfi({ sentOn: "2026-11-20", answeredOn: "2026-11-23" }), TODAY)).toBe(3);
  });
  it("counts days overdue only while unanswered and past due", () => {
    expect(daysOverdue(rfi({ sentOn: "2026-11-10", responseDueOn: "2026-11-19" }), TODAY)).toBe(7);
    expect(daysOverdue(rfi({ sentOn: "2026-11-20", responseDueOn: "2026-11-27" }), TODAY)).toBe(0);
    expect(
      daysOverdue(
        rfi({ sentOn: "2026-11-10", responseDueOn: "2026-11-19", answeredOn: "2026-11-25" }),
        TODAY,
      ),
    ).toBe(0);
  });
  it("suggests a response date seven calendar days after sending", () => {
    expect(suggestedDueDate("2026-11-26")).toBe("2026-12-03");
    expect(suggestedDueDate("2026-12-30", 10)).toBe("2027-01-09");
  });
});

describe("needsChangeOrder", () => {
  const answered = { sentOn: "2026-11-10", answeredOn: "2026-11-20" };
  it("flags an answered RFI with a cost or time impact and no change order", () => {
    expect(needsChangeOrder(rfi({ ...answered, costImpact: "yes" }))).toBe(true);
    expect(needsChangeOrder(rfi({ ...answered, timeImpact: "possible" }))).toBe(true);
    expect(needsChangeOrder(rfi({ ...answered, costImpact: "yes", changeOrderId: "cor_1" }))).toBe(
      false,
    );
    expect(needsChangeOrder(rfi({ ...answered, costImpact: "none", timeImpact: "none" }))).toBe(
      false,
    );
    expect(needsChangeOrder(rfi({ ...answered }))).toBe(false);
  });
  it("does not flag one still waiting on its answer", () => {
    expect(needsChangeOrder(rfi({ sentOn: "2026-11-10", costImpact: "yes" }))).toBe(false);
  });
});

describe("summarizeRfis", () => {
  it("counts each status, the answers that need a change order, and the average and oldest", () => {
    const s = summarizeRfis(
      [
        rfi({ number: 1, sentOn: "2026-11-01", answeredOn: "2026-11-05", costImpact: "yes" }),
        rfi({ number: 2, sentOn: "2026-11-02", answeredOn: "2026-11-12", changeOrderId: "c" }),
        rfi({ number: 3, sentOn: "2026-11-03", responseDueOn: "2026-11-10" }),
        rfi({ number: 4, sentOn: "2026-11-20" }),
        rfi({ number: 5 }),
      ],
      TODAY,
    );
    expect(s).toEqual({
      total: 5,
      draft: 1,
      open: 1,
      overdue: 1,
      answered: 2,
      needChangeOrder: 1,
      averageDaysToAnswer: 7,
      oldestOpen: { number: 3, days: 23 },
    });
  });
  it("has no average or oldest on an empty log", () => {
    const s = summarizeRfis([], TODAY);
    expect(s.averageDaysToAnswer).toBeNull();
    expect(s.oldestOpen).toBeNull();
  });
});

describe("numbers and dates", () => {
  it("numbers one past the highest used, never reusing a deleted one", () => {
    expect(nextRfiNumber([])).toBe(1);
    expect(nextRfiNumber([1, 2, 5])).toBe(6);
  });
  it("labels RFIs padded to three digits", () => {
    expect(rfiLabel(3)).toBe("RFI 003");
    expect(rfiLabel(1204)).toBe("RFI 1204");
  });
  it("refuses dates out of order or in the future", () => {
    expect(
      rfiDateProblem({ sentOn: "2026-11-27", responseDueOn: null, answeredOn: null }, TODAY),
    ).toMatch(/future/);
    expect(
      rfiDateProblem(
        { sentOn: "2026-11-20", responseDueOn: "2026-11-19", answeredOn: null },
        TODAY,
      ),
    ).toMatch(/response date/);
    expect(
      rfiDateProblem(
        { sentOn: "2026-11-20", responseDueOn: null, answeredOn: "2026-11-19" },
        TODAY,
      ),
    ).toMatch(/before the date sent/);
    expect(
      rfiDateProblem({ sentOn: null, responseDueOn: null, answeredOn: "2026-11-19" }, TODAY),
    ).toMatch(/sent before/);
    expect(
      rfiDateProblem({ sentOn: null, responseDueOn: "2026-11-30", answeredOn: null }, TODAY),
    ).toMatch(/sent before/);
    expect(
      rfiDateProblem(
        { sentOn: "2026-11-20", responseDueOn: "2026-12-30", answeredOn: "2026-11-21" },
        TODAY,
      ),
    ).toBeNull();
  });
  it("words each impact", () => {
    expect(impactText("Cost", null)).toBe("Cost impact: not stated");
    expect(impactText("Time", "none")).toBe("Time impact: none expected");
    expect(impactText("Cost", "yes")).toMatch(/change order will follow/);
  });
});

describe("rfiEmail", () => {
  const job = {
    name: "Riverside Clinic",
    number: "RC-12",
    gcName: "Harbor Builders",
    gcPmName: "Dana Ruiz",
    gcPmEmail: "dana@harbor.example",
  };
  const from = { name: "Sam Lee", company: "Lee Mechanical" };

  it("sends a new RFI to the PM with the question, reference, proposal, impacts and due date", () => {
    const e = rfiEmail(
      job,
      rfi({ number: 4, reference: "M-201 detail 3", suggestion: "Drop the ceiling 6 in." }),
      from,
      TODAY,
    );
    expect(e?.kind).toBe("send");
    expect(e?.to).toBe("dana@harbor.example");
    expect(e?.subject).toBe("RFI 004: Ceiling height at corridor 2 (Riverside Clinic (job RC-12))");
    expect(e?.body).toContain("Hello Dana Ruiz,");
    expect(e?.body).toContain("Reference: M-201 detail 3");
    expect(e?.body).toContain("Our proposed solution: Drop the ceiling 6 in.");
    expect(e?.body).toContain("Cost impact: not stated");
    // No response date entered: the default window from today.
    expect(e?.body).toContain("Please respond by 2026-12-03.");
    expect(e?.body).toContain("Sam Lee\nLee Mechanical");
  });

  it("chases an overdue RFI, counting the days past its response date", () => {
    const e = rfiEmail(
      { ...job, gcPmName: null, gcPmEmail: null },
      rfi({ number: 2, sentOn: "2026-11-10", responseDueOn: "2026-11-17" }),
      { name: "", company: "Lee Mechanical" },
      TODAY,
    );
    expect(e?.kind).toBe("follow-up");
    expect(e?.to).toBeNull();
    expect(e?.subject).toMatch(/^Following up: RFI 002/);
    expect(e?.body).toContain("Hello Harbor Builders project team,");
    expect(e?.body).toContain("sent 2026-11-10");
    expect(e?.body).toContain("9 days ago");
    expect(e?.body).toContain("[your name]");
  });

  it("has no draft once answered", () => {
    expect(
      rfiEmail(job, rfi({ sentOn: "2026-11-10", answeredOn: "2026-11-12" }), from, TODAY),
    ).toBeNull();
  });
});

describe("overdueRfis", () => {
  const r = (over: Partial<CompanyRfiInput>): CompanyRfiInput => ({
    id: "r",
    projectId: "p",
    projectName: "Clinic TI",
    projectNumber: null,
    gcName: "Harbor Builders",
    number: 1,
    subject: " Ceiling height ",
    sentOn: "2026-11-01",
    responseDueOn: "2026-11-16",
    answeredOn: null,
    ...over,
  });
  const today = "2026-11-23";

  it("keeps only sent, unanswered RFIs past the date entered, most days overdue first", () => {
    const list = overdueRfis(
      [
        r({ id: "a", responseDueOn: "2026-11-20" }), // 3 days
        r({ id: "b", projectName: "Annex", number: 4 }), // 7 days
        r({ id: "c", projectName: "Clinic TI", number: 2 }), // 7 days, after Annex
        r({ id: "due-today", responseDueOn: today }),
        r({ id: "no-date", responseDueOn: null }),
        r({ id: "draft", sentOn: null, responseDueOn: null }),
        r({ id: "answered", answeredOn: "2026-11-22" }),
      ],
      today,
    );
    expect(list.map((x) => [x.id, x.daysOverdue])).toEqual([
      ["b", 7],
      ["c", 7],
      ["a", 3],
    ]);
    expect(list[0]?.subject).toBe("Ceiling height");
  });

  it("reads as one line with the job, RFI number, due date and GC", () => {
    const [one] = overdueRfis([r({ projectNumber: "2207", number: 4 })], today);
    expect(one && overdueRfiText(one)).toBe(
      "Clinic TI (#2207), RFI 004: Ceiling height: answer due 2026-11-16, 7 days overdue (Harbor Builders).",
    );
    const [day] = overdueRfis([r({ responseDueOn: "2026-11-22" })], today);
    expect(day && overdueRfiText(day)).toContain("2026-11-22, 1 day overdue");
  });
});

describe("starting a change order from an RFI", () => {
  it("is offered once the RFI is answered and nothing prices it", () => {
    expect(canStartChangeOrder({ answeredOn: null, changeOrderId: null })).toBe(false);
    expect(canStartChangeOrder({ answeredOn: "2026-11-20", changeOrderId: null })).toBe(true);
    expect(canStartChangeOrder({ answeredOn: "2026-11-20", changeOrderId: "cor_1" })).toBe(false);
  });

  it("names the RFI and carries its subject as the description", () => {
    expect(
      changeOrderDraftFromRfi({ number: 4, subject: "  Ceiling height at corridor 2 " }),
    ).toEqual({ description: "RFI 004: Ceiling height at corridor 2" });
  });

  it("cuts a long subject to what a new schedule-of-values line takes", () => {
    const { description } = changeOrderDraftFromRfi({ number: 12, subject: "x".repeat(400) });
    expect(description.length).toBe(CHANGE_ORDER_DESCRIPTION_MAX);
    expect(description.startsWith("RFI 012: xxx")).toBe(true);
    expect(description.endsWith("\u2026")).toBe(true);
  });
});
