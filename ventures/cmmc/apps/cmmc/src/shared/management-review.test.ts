// The management review's pure rules: the figures each input gets from the records, what blocks
// finalising, when the next review falls due, and the minutes. Counts checked by hand.
import { describe, expect, it } from "vitest";
import {
  defaultPeriod,
  type FactsInput,
  finaliseProblems,
  REVIEW_INPUT_KEYS,
  REVIEW_INPUTS,
  REVIEW_OUTPUTS,
  type ReviewFields,
  type ReviewLike,
  reviewActionsDue,
  reviewAttention,
  reviewDueDates,
  reviewFacts,
  reviewMinutesMarkdown,
  validateReview,
} from "./management-review";

const TODAY = "2026-11-28";

const fields = (over: Partial<ReviewFields> = {}): ReviewFields => ({
  heldOn: "2026-11-20",
  periodFrom: "2025-11-21",
  periodTo: "2026-11-20",
  attendees: "Dana Ruiz (owner), Sam Lee (quality)",
  inputs: {},
  outputs: {},
  actions: [],
  nextReviewOn: null,
  ...over,
});

const empty: FactsInput = {
  periodFrom: "2025-11-21",
  periodTo: "2026-11-20",
  today: TODAY,
  previous: null,
  correctiveActions: [],
  audits: [],
  findings: [],
  gauges: [],
  calibrations: [],
  suppliers: [],
  incidents: [],
};

const ca = (over: Partial<FactsInput["correctiveActions"][number]> = {}) => ({
  ref: "CA-0001",
  source: "process" as const,
  raisedOn: "2026-03-01",
  dueOn: null,
  completedOn: null,
  verifiedOn: null,
  effective: null,
  closedOn: null,
  ...over,
});

describe("reviewFacts", () => {
  it("has nothing to say for an empty workspace, so every input needs a note", () => {
    const f = reviewFacts(empty);
    expect(Object.keys(f)).toEqual(REVIEW_INPUT_KEYS);
    for (const k of REVIEW_INPUT_KEYS) expect(f[k]).toEqual([]);
    expect(finaliseProblems(fields(), f, TODAY)).toHaveLength(
      REVIEW_INPUTS.length + REVIEW_OUTPUTS.length,
    );
  });

  it("counts corrective actions by source inside the period only", () => {
    const f = reviewFacts({
      ...empty,
      correctiveActions: [
        ca({ ref: "CA-0001", source: "customer_complaint", raisedOn: "2026-02-01" }),
        ca({
          ref: "CA-0002",
          source: "customer_return",
          raisedOn: "2026-04-01",
          closedOn: "2026-06-01",
        }),
        ca({ ref: "CA-0003", source: "customer_complaint", raisedOn: "2025-10-01" }), // before the period
        ca({ ref: "CA-0004", source: "supplier", raisedOn: "2026-05-01", dueOn: "2026-06-01" }),
        ca({
          ref: "CA-0005",
          source: "process",
          raisedOn: "2026-07-01",
          completedOn: "2026-07-10",
          verifiedOn: "2026-10-01",
          effective: false,
        }),
        ca({
          ref: "CA-0006",
          source: "internal_audit",
          raisedOn: "2026-08-01",
          completedOn: "2026-08-05",
          verifiedOn: "2026-11-01",
          effective: true,
          closedOn: "2026-11-01",
        }),
      ],
    });
    expect(f.customer_feedback).toEqual([
      "Logged as corrective actions in the period: 1 customer complaint, 1 return or rejection (CA-0001, CA-0002).",
    ]);
    // Raised in the period: 0001, 0002, 0004, 0005, 0006 = 5; closed in it: 0002 and 0006.
    expect(f.nonconformities[0]).toBe(
      "5 corrective actions raised in the period (1 from customer complaints, 1 from returns, 1 from suppliers, 1 found in the shop, 1 from internal audits); 2 closed in it.",
    );
    // Open today: 0001, 0003, 0004, 0005 = 4; 0004's action due 2026-06-01 not done; 0005 not effective.
    expect(f.nonconformities[1]).toBe(
      "Open today: 4, 1 with the action past due (CA-0004); 1 checked and found not effective (CA-0005).",
    );
    expect(f.nonconformities[2]).toBe(
      "Effectiveness checked on 2 in the period: 1 worked, 1 did not.",
    );
    expect(f.suppliers).toEqual([
      "1 supplier problem logged as corrective actions in the period (CA-0004).",
    ]);
  });

  it("says plainly when no complaint was logged, rather than claiming there were none", () => {
    const f = reviewFacts({ ...empty, correctiveActions: [ca()] });
    expect(f.customer_feedback).toEqual([
      "No customer complaint or return was logged as a corrective action in the period.",
    ]);
  });

  it("reads the last review's actions as they stand today", () => {
    const f = reviewFacts({
      ...empty,
      previous: {
        heldOn: "2025-11-20",
        actions: [
          {
            id: "a",
            text: "Buy a second height gauge",
            owner: "Sam",
            dueOn: "2026-02-01",
            doneOn: "2026-01-15",
          },
          {
            id: "b",
            text: "Train new hires on FAI",
            owner: "Dana",
            dueOn: "2026-03-01",
            doneOn: null,
          },
          { id: "c", text: "Review supplier list", owner: "", dueOn: null, doneOn: null },
        ],
      },
    });
    expect(f.previous_actions).toEqual([
      "The review of 2025-11-20 set 3 actions: 1 done, 2 open, 1 past due.",
      "Open: Train new hires on FAI (Dana, due 2026-03-01), Review supplier list.",
    ]);
  });

  it("summarises audits, findings and audits missed", () => {
    const f = reviewFacts({
      ...empty,
      audits: [
        {
          title: "Clause 8.5 production",
          status: "done",
          plannedOn: "2026-03-01",
          completedOn: "2026-03-03",
        },
        {
          title: "Clause 7.1.5 gauges",
          status: "planned",
          plannedOn: "2026-09-01",
          completedOn: null,
        },
        {
          title: "Clause 9.2 next year",
          status: "planned",
          plannedOn: "2027-03-01",
          completedOn: null,
        },
      ],
      findings: [
        { kind: "minor", auditOn: "2026-03-03" },
        { kind: "observation", auditOn: "2026-03-03" },
        { kind: "observation", auditOn: "2026-03-03" },
        { kind: "major", auditOn: "2025-01-01" }, // an older audit's
      ],
    });
    expect(f.audits).toEqual([
      "1 internal audit done in the period (Clause 8.5 production).",
      "Findings: 0 major and 1 minor nonconformities, 2 observations, 0 opportunities for improvement.",
      "1 planned audit past its date and not done (Clause 7.1.5 gauges, 2026-09-01).",
    ]);
  });

  it("reports gauges, calibrations, suppliers and incidents", () => {
    const f = reviewFacts({
      ...empty,
      gauges: [
        { tag: "CAL-01", inUse: true, dueOn: "2027-01-01" },
        { tag: "MIC-02", inUse: true, dueOn: "2026-10-01" },
        { tag: "PIN-03", inUse: true, dueOn: null },
        { tag: "OLD-04", inUse: false, dueOn: null },
      ],
      calibrations: [
        { calibratedOn: "2026-01-05", asFound: "in_tolerance", impactRecorded: false },
        { calibratedOn: "2026-02-05", asFound: "out_of_tolerance", impactRecorded: false },
        { calibratedOn: "2025-01-05", asFound: "out_of_tolerance", impactRecorded: false },
      ],
      suppliers: [
        { name: "Anodize Co", gaps: 2 },
        { name: "Steel Supply", gaps: 0 },
      ],
      incidents: [
        { discoveredOn: "2026-05-01", closedOn: "2026-05-20" },
        { discoveredOn: "2026-10-01", closedOn: null },
      ],
    });
    expect(f.monitoring).toEqual([
      "3 gauges in use; 2 calibrations recorded in the period, 1 found out of tolerance (1 without an impact record).",
      "Overdue or never calibrated today: MIC-02, PIN-03.",
    ]);
    expect(f.suppliers).toEqual([
      "CMMC flow-down register: 1 supplier of 2 with a gap today (Anodize Co).",
    ]);
    expect(f.risks).toEqual(["2 cyber incidents logged in the period, 1 still open."]);
  });
});

describe("finalising", () => {
  const facts = reviewFacts(empty);
  const allNotes = Object.fromEntries(REVIEW_INPUT_KEYS.map((k) => [k, "Nothing to report."]));
  const allOutputs = { improvements: "None.", system_changes: "None.", resource_needs: "None." };

  it("accepts minutes with every input and output answered", () => {
    expect(
      finaliseProblems(fields({ inputs: allNotes, outputs: allOutputs }), facts, TODAY),
    ).toEqual([]);
  });

  it("needs the meeting held, people named and actions owned and dated", () => {
    const p = finaliseProblems(
      fields({
        heldOn: "2026-12-05",
        periodTo: "2026-12-05",
        attendees: " ",
        inputs: allNotes,
        outputs: allOutputs,
        actions: [{ id: "x", text: "Recalibrate CMM", owner: "", dueOn: null, doneOn: null }],
      }),
      facts,
      TODAY,
    );
    expect(p).toEqual([
      "A review can only be finalised once the meeting has been held.",
      "Name who took part, top management included.",
      "Action 1 needs an owner.",
      "Action 1 needs a due date.",
    ]);
  });

  it("counts the workspace's figures as having considered an input", () => {
    const f = reviewFacts({ ...empty, correctiveActions: [ca()] });
    const p = finaliseProblems(fields({ outputs: allOutputs }), f, TODAY);
    expect(p.some((x) => x.startsWith("Nonconformities"))).toBe(false);
    expect(p.some((x) => x.startsWith("Customer satisfaction"))).toBe(false);
    expect(p.some((x) => x.startsWith("Quality objectives"))).toBe(true);
  });
});

describe("validateReview", () => {
  it("checks dates and their order", () => {
    expect(validateReview(fields())).toEqual([]);
    expect(validateReview(fields({ periodFrom: "2026-12-01" }))).toContain(
      "The period reviewed starts after it ends.",
    );
    expect(validateReview(fields({ periodTo: "2026-11-21" }))).toContain(
      "The period reviewed cannot end after the meeting.",
    );
    expect(validateReview(fields({ nextReviewOn: "2026-11-20" }))).toContain(
      "The next review has to fall after this one.",
    );
    expect(validateReview(fields({ heldOn: "2026-02-30" }))[0]).toMatch(/meeting date/);
  });
});

describe("defaultPeriod", () => {
  it("runs from the day after the last review's period, or twelve months back", () => {
    expect(defaultPeriod("2026-11-20", { periodTo: "2025-11-14" })).toEqual({
      periodFrom: "2025-11-15",
      periodTo: "2026-11-20",
    });
    expect(defaultPeriod("2026-11-20", null)).toEqual({
      periodFrom: "2025-11-20",
      periodTo: "2026-11-20",
    });
  });
});

describe("reviewAttention", () => {
  const r = (over: Partial<ReviewLike>): ReviewLike => ({
    ...fields(),
    id: "r",
    status: "final",
    finalisedOn: "2025-11-20",
    ...over,
  });
  it("is never before the first final review, and counts drafts", () => {
    expect(reviewAttention([r({ status: "draft" })], TODAY)).toMatchObject({
      timing: "never",
      drafts: 1,
    });
  });
  it("falls due twelve months after the last one unless a date was set", () => {
    expect(reviewAttention([r({ heldOn: "2025-12-15" })], TODAY)).toMatchObject({
      timing: "due_soon",
      nextDueOn: "2026-12-15",
    });
    expect(reviewAttention([r({ heldOn: "2025-11-01" })], TODAY).timing).toBe("overdue");
    expect(
      reviewAttention([r({ heldOn: "2025-11-01", nextReviewOn: "2027-01-31" })], TODAY),
    ).toMatchObject({ timing: "current", nextDueOn: "2027-01-31" });
  });
  it("counts open and overdue actions from final reviews", () => {
    const a = reviewAttention(
      [
        r({
          actions: [
            { id: "1", text: "x", owner: "a", dueOn: "2026-01-01", doneOn: null },
            { id: "2", text: "y", owner: "a", dueOn: "2027-01-01", doneOn: null },
            { id: "3", text: "z", owner: "a", dueOn: "2026-01-01", doneOn: "2026-01-02" },
          ],
        }),
      ],
      TODAY,
    );
    expect(a).toMatchObject({ actionsOpen: 2, actionsOverdue: 1 });
  });
});

describe("reviewMinutesMarkdown", () => {
  it("lists every input and output, the figures and the actions, with pipes escaped", () => {
    const facts = reviewFacts({ ...empty, correctiveActions: [ca()] });
    const text = reviewMinutesMarkdown(
      {
        ...fields({
          inputs: { objectives: "On-time delivery 94% against a 95% target." },
          outputs: { improvements: "Add a second shift inspector." },
          actions: [
            {
              id: "1",
              text: "Hire | train inspector",
              owner: "Dana",
              dueOn: "2027-02-01",
              doneOn: null,
            },
          ],
        }),
        id: "r",
        status: "final",
        finalisedOn: "2026-11-21",
      },
      facts,
      { orgName: "Ruiz Precision", generatedOn: TODAY },
    );
    expect(text).toContain("# Management review minutes: Ruiz Precision");
    for (const i of REVIEW_INPUTS) expect(text).toContain(`### ${i.label} (${i.clause})`);
    for (const o of REVIEW_OUTPUTS) expect(text).toContain(`### ${o.label} (${o.clause})`);
    expect(text).toContain(
      "- 1 corrective action raised in the period (1 found in the shop); 0 closed in it.",
    );
    expect(text).toContain("On-time delivery 94% against a 95% target.");
    expect(text).toContain("| 1 | Hire \\| train inspector | Dana | 2027-02-01 | open |");
    expect(text).toContain("- Next review: 2027-11-20");
    expect(text).toContain("does not by itself make a quality system conform");
  });
});

describe("review dates for the calendar and the dashboard", () => {
  const act = (id: string, dueOn: string | null, doneOn: string | null = null) => ({
    id,
    text: `Action ${id}`,
    owner: "Sam Lee",
    dueOn,
    doneOn,
  });
  const r = (over: Partial<ReviewLike>): ReviewLike => ({
    ...fields(),
    id: "r",
    status: "final",
    finalisedOn: "2025-11-20",
    ...over,
  });

  it("puts nothing in the calendar before the first final review", () => {
    expect(reviewDueDates([r({ status: "draft", actions: [act("a", "2027-01-10")] })])).toEqual([]);
  });

  it("dates the next review from the latest final one, and counts open actions per date", () => {
    const reviews = [
      r({
        id: "old",
        heldOn: "2025-11-10",
        nextReviewOn: "2026-11-10",
        actions: [
          act("a", "2026-03-01"),
          act("b", "2026-12-15"),
          act("c", "2026-02-01", "2026-01-20"),
        ],
      }),
      r({
        id: "new",
        heldOn: "2026-11-20",
        actions: [act("d", "2026-12-15"), act("e", null), act("f", "2026-13-40")],
      }),
      r({ id: "draft", status: "draft", heldOn: "2026-11-27", actions: [act("g", "2026-12-01")] }),
    ];
    expect(reviewDueDates(reviews)).toEqual([
      { kind: "review", due: "2027-11-20", count: 1 },
      { kind: "action", due: "2026-03-01", count: 1 },
      { kind: "action", due: "2026-12-15", count: 2 },
    ]);
  });

  it("uses the next review date the minutes set", () => {
    expect(reviewDueDates([r({ heldOn: "2026-11-20", nextReviewOn: "2027-05-20" })])).toEqual([
      { kind: "review", due: "2027-05-20", count: 1 },
    ]);
  });

  it("lists open final-review actions overdue or due within 30 days, oldest first", () => {
    const due = reviewActionsDue(
      [
        r({
          id: "r1",
          heldOn: "2025-11-20",
          actions: [
            act("a", "2026-12-20"),
            act("b", "2027-02-01"),
            act("c", "2026-10-01", "2026-10-02"),
          ],
        }),
        r({ id: "r2", heldOn: "2026-06-01", actions: [act("d", "2026-11-01")] }),
        r({ id: "r3", status: "draft", actions: [act("e", "2026-11-01")] }),
      ],
      TODAY,
    );
    expect(due.map((d) => [d.reviewId, d.text, d.dueOn, d.state])).toEqual([
      ["r2", "Action d", "2026-11-01", "overdue"],
      ["r1", "Action a", "2026-12-20", "due_soon"],
    ]);
  });

  it("counts an action due today as due soon, not overdue", () => {
    expect(reviewActionsDue([r({ actions: [act("a", TODAY)] })], TODAY)[0]?.state).toBe("due_soon");
  });
});
