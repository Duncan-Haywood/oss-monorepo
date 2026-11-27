import { describe, expect, it } from "vitest";
import { workbook } from "../../../test/unit/xlsx-writer";
import {
  numericDateOrder,
  parsePoamDate,
  parsePoamStatus,
  planPoamImport,
  poamKey,
  readDateOrder,
} from "./poam-import";
import { gridToCsv, readWorkbookForImport } from "./sheet-import";

describe("parsePoamDate", () => {
  it("reads ISO, US month/day/year, month names and Excel date numbers", () => {
    expect(parsePoamDate("2026-12-31")).toBe("2026-12-31");
    expect(parsePoamDate("2026/3/5")).toBe("2026-03-05");
    expect(parsePoamDate("2026-12-31 00:00:00")).toBe("2026-12-31");
    expect(parsePoamDate("12/31/2026")).toBe("2026-12-31");
    expect(parsePoamDate("3/5/2027")).toBe("2027-03-05");
    expect(parsePoamDate("31 Dec 2026")).toBe("2026-12-31");
    expect(parsePoamDate("31-Dec-2026")).toBe("2026-12-31");
    expect(parsePoamDate("December 31, 2026")).toBe("2026-12-31");
    expect(parsePoamDate("Sept 1 2027")).toBe("2027-09-01");
    // Excel 1900 system: 46022 is 2025-12-31 (checked: =DATE(2025,12,31) shows 46022).
    expect(parsePoamDate("46022")).toBe("2025-12-31");
    expect(parsePoamDate("46022.5")).toBe("2025-12-31");
  });
  it("refuses day/month order, impossible days and anything vague", () => {
    for (const s of [
      "31/12/2026",
      "2026-02-30",
      "2/29/2027",
      "Q3 2027",
      "TBD",
      "next month",
      "12/31/26",
      "2026",
      "110",
      "1000000",
      "31 Smarch 2026",
      "",
    ]) {
      expect(parsePoamDate(s), s).toBeNull();
    }
    expect(parsePoamDate("2/29/2028")).toBe("2028-02-29");
  });
});

describe("day/month dates", () => {
  it("reads numeric dates day first only when asked", () => {
    expect(parsePoamDate("31/12/2026", "dmy")).toBe("2026-12-31");
    expect(parsePoamDate("03/04/2026", "dmy")).toBe("2026-04-03");
    expect(parsePoamDate("03/04/2026")).toBe("2026-03-04");
    expect(parsePoamDate("31.12.2026", "dmy")).toBe("2026-12-31");
    expect(parsePoamDate("31-12-2026 00:00", "dmy")).toBe("2026-12-31");
    // Month first stays slashes only, and neither order swaps a cell that does not fit it.
    expect(parsePoamDate("31.12.2026")).toBeNull();
    expect(parsePoamDate("12/31/2026", "dmy")).toBeNull();
    expect(parsePoamDate("30/02/2026", "dmy")).toBeNull();
    // Forms that never depend on the order read the same either way.
    expect(parsePoamDate("2026-12-31", "dmy")).toBe("2026-12-31");
    expect(parsePoamDate("Dec 31, 2026", "dmy")).toBe("2026-12-31");
    expect(parsePoamDate("46022", "dmy")).toBe("2025-12-31");
  });

  it("tells which order a cell shows on its own", () => {
    expect(numericDateOrder("31/12/2026")).toBe("dmy");
    expect(numericDateOrder("12/31/2026")).toBe("mdy");
    expect(numericDateOrder("01.02.2026")).toBe("dmy");
    expect(numericDateOrder("03/04/2026")).toBe("either");
    expect(numericDateOrder("2026-03-04")).toBeNull();
    expect(numericDateOrder("31 Dec 2026")).toBeNull();
  });

  it("picks day first for a column only when nothing in it says month first", () => {
    const cells = (...v: string[]) => v.map((value, i) => ({ line: i + 2, value }));
    expect(readDateOrder(cells("03/04/2026", "31/12/2026", "2027-01-01"))).toEqual({
      order: "dmy",
      source: "detected",
      numeric: 2,
      evidenceLine: 3,
    });
    expect(readDateOrder(cells("03/04/2026", "05/06/2026")).order).toBe("mdy");
    expect(readDateOrder(cells("31/12/2026", "12/31/2026"))).toMatchObject({
      order: "mdy",
      source: "default",
    });
    expect(readDateOrder(cells("31/12/2026"), "mdy")).toMatchObject({
      order: "mdy",
      source: "chosen",
    });
  });

  it("imports a day-first sheet, says so, and lists a cell that does not fit", () => {
    const csv = [
      "Requirement,Weakness,Scheduled completion",
      "3.1.20,No external systems list,03/04/2027",
      "3.1.22,No review step,31/12/2026",
      "3.5.3,No MFA,15.01.2027",
    ].join("\n");
    const plan = planPoamImport(csv, 2);
    expect(plan.dates).toMatchObject({ order: "dmy", source: "detected", evidenceLine: 3 });
    expect(plan.rows.map((r) => r.scheduledCompletion)).toEqual([
      "2027-04-03",
      "2026-12-31",
      "2027-01-15",
    ]);
    expect(plan.issues).toHaveLength(1);
    expect(plan.issues[0]?.message).toContain("read as day/month/year (4 March 2026)");
    // The person can overrule it; the day-first cells are then listed, not swapped.
    const us = planPoamImport(csv, 2, "mdy");
    expect(us.dates.source).toBe("chosen");
    expect(us.rows.map((r) => [r.line, r.scheduledCompletion])).toEqual([[2, "2027-03-04"]]);
    const at3 = us.issues.find((i) => i.line === 3)?.message;
    expect(at3).toContain('"31/12/2026" is not a date');
    expect(at3).toContain("It can only be day/month/year");
  });

  it("keeps month first when the column mixes both orders", () => {
    const csv = [
      "Requirement,Weakness,Due date",
      "3.1.20,A,12/31/2026",
      "3.1.22,B,31/12/2026",
    ].join("\n");
    const plan = planPoamImport(csv, 2);
    expect(plan.dates).toMatchObject({ order: "mdy", source: "default", numeric: 2 });
    expect(plan.rows.map((r) => r.line)).toEqual([2]);
    expect(plan.issues.map((i) => i.line)).toEqual([3]);
  });
});

describe("parsePoamStatus", () => {
  it("reads open and closed phrases only", () => {
    expect(parsePoamStatus("Open")).toBe("open");
    expect(parsePoamStatus("In Progress")).toBe("open");
    expect(parsePoamStatus("COMPLETED")).toBe("closed");
    expect(parsePoamStatus("Closed")).toBe("closed");
    expect(parsePoamStatus("Risk accepted")).toBeNull();
    expect(parsePoamStatus("")).toBeNull();
  });
});

describe("planPoamImport", () => {
  const sheet = [
    "Plan of Action and Milestones,,,,,,",
    ",,,,,,",
    "POA&M ID,Security Requirement,Weakness / Deficiency,Planned Remediation,Milestones,Responsible,Scheduled Completion Date,Status",
    'P-1,3.1.20,No inventory of external systems,"Write the list, review yearly",Draft by Jan; approve by Feb,IT lead,12/31/2026,Open',
    "P-2,AC.L2-3.1.22,Public site has no review step,Add two-person review,,Marketing,2027-01-15,In progress",
    "P-3,3.5.3,MFA missing for local admin,Roll out tokens,,IT lead,31/12/2026,Open",
    "P-4,3.13.11,,Buy FIPS modules,,IT lead,2027-02-01,Open",
    "P-5,3.1.99,Unknown number,,,,2027-02-01,Open",
    "P-6,3.1.20,No inventory of external systems,,,,2027-03-01,Open",
    "P-7,3.14.1,Patching is late,Monthly window,,Ops,2026-11-30,Risk accepted",
    "P-8,3.4.1,Baseline missing,Write baselines,,Ops,,Open",
  ].join("\n");

  it("finds the columns by header and the id column by contents", () => {
    const plan = planPoamImport(sheet, 2);
    expect(plan.columns).toEqual({
      id: "Security Requirement",
      weakness: "Weakness / Deficiency",
      remediation: "Planned Remediation",
      milestones: "Milestones",
      responsible: "Responsible",
      scheduledCompletion: "Scheduled Completion Date",
      status: "Status",
    });
    expect(plan.rows.map((r) => [r.line, r.controlId, r.scheduledCompletion, r.status])).toEqual([
      [4, "AC.L2-3.1.20", "2026-12-31", "open"],
      [5, "AC.L2-3.1.22", "2027-01-15", "open"],
      [10, "SI.L2-3.14.1", "2026-11-30", undefined],
    ]);
    expect(plan.rows[0]).toMatchObject({
      weakness: "No inventory of external systems",
      remediation: "Write the list, review yearly",
      milestones: "Draft by Jan; approve by Feb",
      responsible: "IT lead",
    });
  });

  it("lists every row it leaves out, with its line", () => {
    const issues = planPoamImport(sheet, 2).issues;
    const at = (line: number) => issues.filter((i) => i.line === line).map((i) => i.message);
    expect(at(6)[0]).toContain('"31/12/2026" is not a date');
    expect(at(7)[0]).toContain("has no weakness");
    expect(at(8)[0]).toContain("3.1.99 is not a NIST SP 800-171 Rev. 2 requirement");
    expect(at(9)[0]).toContain("Same requirement and weakness as line 4");
    expect(at(10)[0]).toContain('"Risk accepted" is not a status');
    expect(at(11)[0]).toContain("no scheduled completion date");
    expect(issues).toHaveLength(6);
  });

  it("needs a weakness and a date column by header", () => {
    const plan = planPoamImport("Control,Notes\n3.1.1,something\n", 2);
    expect(plan.rows).toHaveLength(0);
    expect(plan.issues[0]?.message).toContain("No weakness or scheduled completion column");
    expect(planPoamImport("hello,world\n", 2).issues[0]?.message).toContain(
      "No column of requirement ids",
    );
  });

  it("reads Level 1 ids at Level 1 and refuses them at Level 2", () => {
    const csv = "Practice,Weakness,Due date\nAC.L1-b.1.i,Shared login,2027-01-01\n";
    expect(planPoamImport(csv, 1).rows[0]?.controlId).toBe("AC.L1-b.1.i");
    expect(planPoamImport(csv, 2).issues[0]?.message).toContain("is a Level 1 requirement");
  });

  it("matches the same weakness regardless of case and punctuation", () => {
    expect(poamKey("AC.L2-3.1.1", "No MFA!")).toBe(poamKey("AC.L2-3.1.1", "  no   mfa "));
    expect(poamKey("AC.L2-3.1.1", "No MFA")).not.toBe(poamKey("AC.L2-3.1.2", "No MFA"));
  });

  it("reads an Excel workbook's date numbers through the sheet reader", async () => {
    const bytes = await workbook({
      Notes: { 1: ["nothing here"] },
      POAM: {
        1: ["Requirement", "Weakness", "Scheduled completion", "Status"],
        2: ["3.1.20", "No external systems list", 46387, "Open"],
        3: ["3.1.22", "No review step", 46418, "Closed"],
      },
    });
    const wb = await readWorkbookForImport(bytes, 2);
    expect(wb.sheets[wb.best]?.name).toBe("POAM");
    const plan = planPoamImport(gridToCsv(wb.grids[wb.best] ?? []), 2);
    expect(plan.issues).toEqual([]);
    // 46387 = 2026-12-31 and 46418 = 2027-01-31 in Excel's 1900 date system.
    expect(plan.rows.map((r) => [r.line, r.scheduledCompletion, r.status])).toEqual([
      [2, "2026-12-31", "open"],
      [3, "2027-01-31", "closed"],
    ]);
  });
});
