import { describe, expect, it } from "vitest";
import { parseCsv, parseStatus, planImport, resolveControlId } from "./csv-import";

describe("parseCsv", () => {
  it("reads quotes, doubled quotes, quoted newlines, CRLF and a BOM", () => {
    expect(parseCsv('﻿a,"b, c","say ""hi""\nthere"\r\n1,2,3')).toEqual([
      ["a", "b, c", 'say "hi"\nthere'],
      ["1", "2", "3"],
    ]);
  });
  it("detects semicolon and tab exports", () => {
    expect(parseCsv("a;b;c\n1;2;3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("resolveControlId", () => {
  it("reads CMMC ids and NIST numbers at Level 2", () => {
    expect(resolveControlId("AC.L2-3.1.1", 2)).toEqual({ ok: true, controlId: "AC.L2-3.1.1" });
    expect(resolveControlId("3.1.10", 2)).toEqual({ ok: true, controlId: "AC.L2-3.1.10" });
    expect(resolveControlId("3.1.1 Limit system access", 2)).toEqual({
      ok: true,
      controlId: "AC.L2-3.1.1",
    });
    expect(resolveControlId("NIST SP 800-171 Rev. 2 3.13.11", 2)).toEqual({
      ok: true,
      controlId: "SC.L2-3.13.11",
    });
  });
  it("maps Level 1 ids, FAR items and their NIST numbers at Level 1", () => {
    expect(resolveControlId("AC.L1-b.1.i", 1)).toEqual({ ok: true, controlId: "AC.L1-b.1.i" });
    expect(resolveControlId("(b)(1)(xv)", 1)).toEqual({ ok: true, controlId: "SI.L1-b.1.xv" });
    expect(resolveControlId("AC.L1-3.1.1", 1)).toEqual({ ok: true, controlId: "AC.L1-b.1.i" });
    expect(resolveControlId("3.10.4", 1)).toEqual({ ok: true, controlId: "PE.L1-b.1.ix" });
  });
  it("refuses ids at the wrong level and numbers that are no requirement", () => {
    expect(resolveControlId("AC.L1-b.1.i", 2)).toMatchObject({ ok: false });
    expect(resolveControlId("3.1.3", 1)).toMatchObject({ ok: false });
    expect(resolveControlId("3.1.99", 2)).toMatchObject({ ok: false });
  });
  it("is null for cells that are not ids", () => {
    for (const s of ["", "Access Control", "Total", "110", "2026-01-01", "v3.1.1x"]) {
      expect(resolveControlId(s, 2)).toBeNull();
    }
  });
});

describe("parseStatus", () => {
  it("reads the usual phrases and nothing else", () => {
    expect(parseStatus("Met")).toBe("implemented");
    expect(parseStatus("NOT MET")).toBe("not_implemented");
    expect(parseStatus("Partially Implemented")).toBe("partially_implemented");
    expect(parseStatus("N/A")).toBe("not_applicable");
    expect(parseStatus("Planned to be Implemented")).toBe("not_implemented");
    expect(parseStatus("Alternative implementation")).toBeNull();
    expect(parseStatus("mostly")).toBeNull();
  });
});

describe("planImport", () => {
  const sheet = [
    "Acme Machining NIST 800-171 self-assessment,,,,",
    "",
    "Control,Requirement,Status,Implementation Statement,Comments,Owner",
    "Access Control,,,,,",
    '3.1.1,Limit system access,Met,"Accounts are issued by IT, reviewed quarterly.",,it@acme.test',
    "3.1.2,Limit transactions,Not Met,,Needs role matrix,",
    "3.1.3,Control CUI flow,Alternative implementation,,,Pat",
    "3.1.1,duplicate,Not met,,,",
    "3.1.99,typo,Met,,,",
    "3.1.4,Separation of duties,,,,",
  ].join("\n");

  it("finds the columns, skips headings and blanks, and reports what it cannot read", () => {
    const plan = planImport(sheet, 2);
    expect(plan.columns).toEqual({
      id: "Control",
      status: "Status",
      owner: "Owner",
      notes: "Comments",
      statement: "Implementation Statement",
    });
    expect(plan.rows).toEqual([
      {
        line: 5,
        controlId: "AC.L2-3.1.1",
        status: "implemented",
        ownerEmail: "it@acme.test",
        statement: "Accounts are issued by IT, reviewed quarterly.",
      },
      { line: 6, controlId: "AC.L2-3.1.2", status: "not_implemented", notes: "Needs role matrix" },
    ]);
    expect(plan.issues.map((i) => i.line)).toEqual([7, 7, 8, 9]);
    expect(plan.issues[2]?.message).toContain("also on line 5");
  });

  it("finds an unlabelled status column by its contents", () => {
    const plan = planImport("3.1.1,x,yes\n3.1.2,y,no\n", 2);
    expect(plan.columns.status).toBe("column 3");
    expect(plan.rows.map((r) => r.status)).toEqual(["implemented", "not_implemented"]);
  });

  it("explains a sheet with no id column, or nothing but ids", () => {
    expect(planImport("a,b\n1,2", 2).issues[0]?.message).toContain("No column of requirement ids");
    expect(planImport("Control\n3.1.1\n3.1.2", 2).issues[0]?.message).toContain(
      "Only a requirement id",
    );
  });

  it("refuses oversized files", () => {
    expect(planImport("x".repeat(1_000_001), 2).issues[0]?.message).toContain("over 1 MB");
  });
});
