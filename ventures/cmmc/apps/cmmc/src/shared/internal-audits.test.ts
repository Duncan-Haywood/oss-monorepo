import { describe, expect, it } from "vitest";
import {
  type AuditLike,
  auditIssues,
  auditReportMarkdown,
  auditTiming,
  type CorrectiveActionLike,
  caIssues,
  caNextDate,
  caStage,
  checkProgramme,
  clauseCoverage,
  correctiveActionLogCsv,
  nextCaRef,
  qualityAttention,
  qualityDueDates,
  validateAuditFields,
  validateCaDates,
  validateVerification,
} from "./internal-audits";
import { ISO9001_CLAUSES } from "./quality";

const TODAY = "2026-11-26";
const known = (id: string) => ISO9001_CLAUSES.some((c) => c.id === id);
const num = (id: string) => id.replace("iso9001-", "");

const audit = (over: Partial<AuditLike> = {}): AuditLike => ({
  id: "a1",
  title: "Production audit",
  clauseIds: ["iso9001-8.5.1", "iso9001-8.6"],
  process: "",
  plannedOn: "2026-12-10",
  status: "planned",
  completedOn: null,
  auditorUserId: "u-auditor",
  auditorName: "",
  ...over,
});

const ca = (over: Partial<CorrectiveActionLike> = {}): CorrectiveActionLike => ({
  id: "c1",
  ref: "CA-0001",
  nonconformity: "Gauge out of calibration used at final inspection",
  rootCause: "",
  action: "",
  ownerUserId: "u1",
  raisedOn: "2026-11-01",
  dueOn: "2026-12-31",
  completedOn: null,
  verifyDueOn: null,
  verifiedOn: null,
  effective: null,
  closedOn: null,
  ...over,
});

describe("audit fields", () => {
  it("needs a scope, a date, an auditor and known clauses", () => {
    expect(validateAuditFields(audit(), known)).toEqual([]);
    expect(validateAuditFields(audit({ clauseIds: [], process: "Receiving" }), known)).toEqual([]);
    const bad = validateAuditFields(
      audit({ title: " ", clauseIds: [], plannedOn: "2026-13-01", auditorUserId: null }),
      known,
    );
    expect(bad).toHaveLength(4);
    expect(validateAuditFields(audit({ clauseIds: ["iso9001-11.1"] }), known)[0]).toContain(
      "Unknown clause",
    );
    expect(
      validateAuditFields(audit({ clauseIds: ["iso9001-8.6", "iso9001-8.6"] }), known),
    ).toEqual(["A clause is listed twice."]);
  });
});

describe("audit timing and issues", () => {
  it("flags overdue and soon audits, and none once done or cancelled", () => {
    expect(auditTiming(audit({ plannedOn: "2026-11-25" }), TODAY)).toBe("overdue");
    expect(auditTiming(audit({ plannedOn: "2026-12-20" }), TODAY)).toBe("due_soon");
    expect(auditTiming(audit({ plannedOn: "2027-03-01" }), TODAY)).toBe("upcoming");
    expect(auditTiming(audit({ status: "done", plannedOn: "2026-01-01" }), TODAY)).toBe("none");
  });

  it("flags an auditor who owns a clause in scope, and nonconformities with no action", () => {
    const owner = (id: string) => (id === "iso9001-8.6" ? "u-auditor" : null);
    const issues = auditIssues(
      audit({ status: "done", completedOn: "2026-11-20" }),
      [
        {
          id: "f1",
          auditId: "a1",
          kind: "minor",
          clauseId: "iso9001-8.6",
          correctiveActionId: null,
        },
        { id: "f2", auditId: "a1", kind: "observation", clauseId: null, correctiveActionId: null },
        { id: "f3", auditId: "a1", kind: "major", clauseId: null, correctiveActionId: "c9" },
      ],
      owner,
      num,
      TODAY,
    );
    expect(issues.map((i) => i.targetId)).toEqual(["a1", "f1"]);
    expect(issues[0]?.message).toContain("owns 8.6");
    expect(issues[1]?.message).toContain(
      "minor nonconformity against 8.6 has no corrective action",
    );
  });
});

describe("clause coverage", () => {
  it("counts a clause audited in the last 12 months or planned, skipping not applicable", () => {
    const audits = [
      audit({ id: "old", clauseIds: ["iso9001-7.2"], status: "done", completedOn: "2025-10-01" }),
      audit({ id: "new", clauseIds: ["iso9001-7.1.5"], status: "done", completedOn: "2026-06-01" }),
      audit({ id: "plan", clauseIds: ["iso9001-9.2"], plannedOn: "2027-02-01" }),
      audit({ id: "cx", clauseIds: ["iso9001-9.3"], status: "cancelled" }),
    ];
    const cov = clauseCoverage(
      ["iso9001-7.2", "iso9001-7.1.5", "iso9001-9.2", "iso9001-9.3", "iso9001-8.3.1"],
      audits,
      new Set(["iso9001-8.3.1"]),
      TODAY,
    );
    expect(cov.map((c) => [num(c.clauseId), c.covered])).toEqual([
      ["7.2", false],
      ["7.1.5", true],
      ["9.2", true],
      ["9.3", false],
    ]);
    expect(cov[0]?.lastAuditedOn).toBe("2025-10-01");
  });
});

describe("corrective actions", () => {
  it("reads the stage from what is filled in", () => {
    expect(caStage(ca())).toBe("cause");
    expect(caStage(ca({ rootCause: "No recall list" }))).toBe("action");
    expect(caStage(ca({ rootCause: "x", completedOn: "2026-11-10" }))).toBe("verify");
    expect(
      caStage(
        ca({
          rootCause: "x",
          completedOn: "2026-11-10",
          verifiedOn: "2026-11-20",
          effective: false,
        }),
      ),
    ).toBe("not_effective");
    expect(caStage(ca({ closedOn: "2026-11-20" }))).toBe("closed");
  });

  it("refuses future and back-to-front dates", () => {
    const base = { raisedOn: "2026-11-01", dueOn: null, completedOn: null, verifyDueOn: null };
    expect(validateCaDates(base, TODAY)).toEqual([]);
    expect(validateCaDates({ ...base, raisedOn: "2027-01-01" }, TODAY)).toHaveLength(1);
    expect(validateCaDates({ ...base, completedOn: "2026-10-01" }, TODAY)[0]).toContain("before");
    expect(validateCaDates({ ...base, completedOn: "2026-12-01" }, TODAY)[0]).toContain("future");
  });

  it("checks effect only after the cause and action are recorded", () => {
    const v = { checkedOn: "2026-11-25", effective: true, notes: "30 lots inspected, no repeats" };
    expect(validateVerification(ca(), v, TODAY)[0]).toContain("root cause");
    const ready = ca({ rootCause: "x", action: "y", completedOn: "2026-11-10" });
    expect(validateVerification(ready, v, TODAY)).toEqual([]);
    expect(validateVerification(ready, { ...v, notes: " " }, TODAY)).toHaveLength(1);
    expect(validateVerification(ready, { ...v, checkedOn: "2026-11-01" }, TODAY)[0]).toContain(
      "before the action",
    );
  });

  it("flags overdue actions and checks, and a check that found it did not work", () => {
    expect(caIssues(ca({ dueOn: "2026-11-20" }), TODAY)[0]?.message).toBe(
      "CA-0001: action was due 2026-11-20.",
    );
    expect(caIssues(ca({ dueOn: "2026-12-01" }), TODAY)[0]?.kind).toBe("soon");
    const verify = ca({ rootCause: "x", completedOn: "2026-08-01", verifyDueOn: "2026-11-01" });
    expect(caIssues(verify, TODAY)[0]?.message).toContain("check that the action worked was due");
    const failed = ca({
      rootCause: "x",
      completedOn: "2026-08-01",
      verifiedOn: "2026-11-01",
      effective: false,
      dueOn: null,
    });
    expect(caIssues(failed, TODAY)[0]?.message).toContain("did not work");
    expect(caIssues(ca({ closedOn: "2026-11-01", ownerUserId: null }), TODAY)).toEqual([]);
  });

  it("numbers the log from the highest reference", () => {
    expect(nextCaRef([])).toBe("CA-0001");
    expect(nextCaRef(["CA-0001", "CA-0007", "junk"])).toBe("CA-0008");
  });
});

describe("programme check", () => {
  it("counts audits, coverage and open actions, gaps first", () => {
    const check = checkProgramme({
      audits: [
        audit({ plannedOn: "2026-11-01" }),
        audit({ id: "a2", status: "done", completedOn: "2026-10-01", clauseIds: ["iso9001-7.2"] }),
      ],
      findings: [],
      actions: [
        ca({ dueOn: "2026-11-01" }),
        ca({ id: "c2", ref: "CA-0002", closedOn: "2026-11-02" }),
      ],
      clauseIds: ["iso9001-7.2", "iso9001-8.5.1", "iso9001-8.6", "iso9001-9.3"],
      excluded: new Set(),
      clauseOwner: () => null,
      clauseNumber: num,
      today: TODAY,
    });
    expect(check.audits).toEqual({ planned: 1, done: 1, overdue: 1 });
    expect(check.clauses).toEqual({ applicable: 4, covered: 3, uncovered: ["iso9001-9.3"] });
    expect(check.correctiveActions).toEqual({ open: 1, closed: 1, overdue: 1, notEffective: 0 });
    expect(check.issues[0]?.kind).toBe("gap");
    expect(check.issues.at(-1)?.message).toContain("not planned: 9.3");
  });
});

describe("CSV", () => {
  it("guards formulas and writes the stage", () => {
    const csv = correctiveActionLogCsv(
      [
        {
          ...ca({ nonconformity: "=HYPERLINK()" }),
          source: "customer_complaint",
          clauseId: "iso9001-8.7",
          containment: "Sorted 200 parts",
          verificationNotes: "",
        },
      ],
      () => "Pat",
      num,
    );
    const [head, row] = csv.trim().split("\r\n");
    expect(head?.startsWith("Reference,Raised on,Source")).toBe(true);
    expect(row).toContain("CA-0001,2026-11-01,Customer complaint,8.7,'=HYPERLINK()");
    expect(row).toContain("Find the cause");
  });
});

describe("quality dates for the calendar and the dashboard", () => {
  const actionStage = ca({ id: "c1", ref: "CA-0001", dueOn: "2026-12-01" });
  const verifyStage = ca({
    id: "c2",
    ref: "CA-0002",
    rootCause: "No recall list",
    action: "Recall list added",
    dueOn: "2026-11-01",
    completedOn: "2026-11-10",
    verifyDueOn: "2026-11-20",
  });
  const notEffective = ca({
    id: "c3",
    ref: "CA-0003",
    rootCause: "x",
    action: "y",
    dueOn: "2026-12-01",
    completedOn: "2026-11-01",
    verifiedOn: "2026-11-15",
    effective: false,
  });
  const closed = ca({
    id: "c4",
    ref: "CA-0004",
    rootCause: "x",
    action: "y",
    dueOn: "2026-12-01",
    completedOn: "2026-11-01",
    verifyDueOn: "2026-12-01",
    verifiedOn: "2026-11-15",
    effective: true,
    closedOn: "2026-11-15",
  });

  it("waits on the action's due date, then the check's, and on nothing once closed", () => {
    expect(caNextDate(actionStage)).toEqual({ kind: "ca_action", due: "2026-12-01" });
    expect(caNextDate(verifyStage)).toEqual({ kind: "ca_check", due: "2026-11-20" });
    expect(caNextDate(notEffective)).toEqual({ kind: "ca_action", due: "2026-12-01" });
    expect(caNextDate(closed)).toBeNull();
    expect(caNextDate(ca({ dueOn: null }))).toBeNull();
  });

  it("groups planned audits and open actions by date and kind, counts only", () => {
    const dates = qualityDueDates(
      [
        audit({ id: "a1", plannedOn: "2026-12-01" }),
        audit({ id: "a2", plannedOn: "2026-12-01" }),
        audit({ id: "a3", status: "done", completedOn: "2026-11-01", plannedOn: "2026-11-01" }),
        audit({ id: "a4", status: "cancelled", plannedOn: "2026-12-05" }),
      ],
      [actionStage, verifyStage, notEffective, closed],
    );
    expect(dates).toEqual([
      { kind: "ca_check", due: "2026-11-20", count: 1 },
      { kind: "audit", due: "2026-12-01", count: 2 },
      { kind: "ca_action", due: "2026-12-01", count: 2 },
    ]);
    expect(JSON.stringify(dates)).not.toContain("Production audit");
  });

  it("lists overdue first, then what falls due within each window", () => {
    const list = qualityAttention(
      [
        audit({ id: "late", title: "Purchasing audit", plannedOn: "2026-11-10" }),
        audit({ id: "soon", title: "Production audit", plannedOn: "2026-12-20" }),
        audit({ id: "far", title: "Design audit", plannedOn: "2027-03-01" }),
        audit({ id: "done", status: "done", completedOn: "2026-11-01", plannedOn: "2026-10-01" }),
      ],
      [actionStage, verifyStage, ca({ id: "c9", ref: "CA-0009", dueOn: "2027-01-30" }), closed],
      TODAY,
    );
    expect(list.map((a) => [a.label, a.state, a.due])).toEqual([
      ["Purchasing audit", "overdue", "2026-11-10"],
      ["CA-0002", "overdue", "2026-11-20"],
      ["CA-0001", "due_soon", "2026-12-01"],
      ["Production audit", "due_soon", "2026-12-20"],
    ]);
    expect(list[1]?.kind).toBe("ca_check");
  });
});

describe("audit report", () => {
  const title = (id: string) => ISO9001_CLAUSES.find((c) => c.id === id)?.title ?? "";
  const base = {
    orgName: "Acme Machining",
    clauseNumber: num,
    clauseTitle: title,
    clauseOwner: (_id: string): string | null => null,
    nameOf: (id: string | null) => (id === "u1" ? "Sam" : id === "u-auditor" ? "Riley" : ""),
    today: TODAY,
    disclaimer: "DISCLAIMER",
  };
  const done = audit({ status: "done", completedOn: "2026-11-20", plannedOn: "2026-11-18" });

  it("reports scope, auditor, findings with their actions, what is open, and sign-off", () => {
    const md = auditReportMarkdown({
      ...base,
      audit: { ...done, summary: "Walked the CNC cell and final inspection." },
      findings: [
        {
          id: "f-obs",
          auditId: "a1",
          kind: "observation",
          clauseId: null,
          description: "Work instructions are hard to find at the saw.",
          evidence: "",
        },
        {
          id: "f-nc",
          auditId: "a1",
          kind: "minor",
          clauseId: "iso9001-7.1.5",
          description: "Gauge out of calibration used at final inspection",
          evidence: "Micrometer M-12, sticker due 2026-09-01",
        },
        {
          id: "f-open",
          auditId: "a1",
          kind: "major",
          clauseId: "iso9001-8.6",
          description: "Parts shipped without final inspection record",
          evidence: "",
        },
        {
          id: "f-other",
          auditId: "a2",
          kind: "major",
          clauseId: null,
          description: "Belongs to another audit",
          evidence: "",
        },
      ],
      actions: [{ ...ca({ dueOn: "2026-11-10" }), findingId: "f-nc" }],
    });
    expect(md).toContain("# Internal audit report: Production audit");
    expect(md).toContain("| Status | Done on 2026-11-20 (planned for 2026-11-18) |");
    expect(md).toContain("| Auditor | Riley (member) |");
    expect(md).toContain("| ISO 9001 clauses in scope | 8.5.1, 8.6 |");
    expect(md).toContain(`| 8.5.1 | ${title("iso9001-8.5.1")} |`);
    expect(md).toContain("1 major nonconformity, 1 minor nonconformity, 1 observation");
    expect(md).not.toContain("another audit");
    // Major first, then minor, then the observation.
    expect(md.indexOf("### 1. Major nonconformity, clause 8.6")).toBeGreaterThan(0);
    expect(md.indexOf("### 2. Minor nonconformity, clause 7.1.5")).toBeGreaterThan(
      md.indexOf("### 1."),
    );
    expect(md).toContain("### 3. Observation");
    expect(md).toContain("> Micrometer M-12, sticker due 2026-09-01");
    expect(md).toContain(
      "Corrective action: **CA-0001**, find the cause (action due 2026-11-10); owner Sam.",
    );
    expect(md).toContain("Corrective action: **none opened yet**.");
    // An observation needs no action, so no "none opened" line under it.
    expect(md.split("### 3. Observation")[1]).not.toContain("Corrective action");
    expect(md).toContain("has no corrective action.");
    expect(md).toContain("- CA-0001: action was due 2026-11-10.");
    expect(md).toContain("| Auditor | | | |");
    expect(md.trimEnd().endsWith("DISCLAIMER")).toBe(true);
  });

  it("names an auditor who audits a clause they own", () => {
    const md = auditReportMarkdown({
      ...base,
      clauseOwner: (id) => (id === "iso9001-8.6" ? "u-auditor" : null),
      audit: { ...done, summary: "" },
      findings: [],
      actions: [],
    });
    expect(md).toContain("**Not independent for 8.6:**");
    expect(md).toContain("No summary recorded.");
    expect(md).toContain("| Findings | none recorded |");
    expect(md.split("## Still open")[1]).toContain("would audit their own work");
  });

  it("an outside auditor and a process scope", () => {
    const md = auditReportMarkdown({
      ...base,
      audit: {
        ...audit({
          auditorUserId: null,
          auditorName: "Jordan",
          clauseIds: [],
          process: "Shipping",
          plannedOn: "2027-03-01",
        }),
        summary: "",
      },
      findings: [],
      actions: [],
    });
    expect(md).toContain("| Auditor | Jordan (from outside) |");
    expect(md).toContain("| Process audited | Shipping |");
    expect(md).toContain("none listed (the process above)");
    expect(md).not.toContain("## Scope");
    expect(md).toContain("Planned for 2027-03-01; not marked done");
    expect(md).toContain("Nothing open for this audit");
  });

  it("keeps typed text from breaking the table or the sections", () => {
    const md = auditReportMarkdown({
      ...base,
      audit: {
        ...audit({ title: "Q1 | <script>x</script>", process: "a|b\nc" }),
        summary: "# not a heading\n---\n- not a list",
      },
      findings: [],
      actions: [],
    });
    expect(md).toContain("| Process audited | a\\|b c |");
    expect(md).toContain("> \\# not a heading");
    expect(md).toContain("> \\---");
    expect(md).toContain("> \\- not a list");
    expect(md).toContain("Q1 \\| &lt;script>x&lt;/script>");
    expect(md.split("\n").filter((l) => l === "---")).toHaveLength(1);
    expect(md).not.toMatch(/^#+ not a heading/m);
  });
});
