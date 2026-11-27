import { describe, expect, it } from "vitest";
import { personnelCsv } from "./personnel";
import {
  isCompletedStatus,
  parseDepartureKind,
  parseYesNo,
  personRowsIn,
  planPersonnelImport,
} from "./personnel-import";

const today = "2026-11-26";

describe("planPersonnelImport: rosters", () => {
  it("reads a roster's columns by their headers, with yes/no cells and dates", () => {
    const csv = [
      "Name,Email,Job title,CUI access,Security duties,Duties,Screened on,Access granted on,Security awareness training,Insider threat training,Notes",
      "Ana Ruiz,ana@example.com,Programmer,Yes,No,,2025-01-10,2025-01-15,2026-02-01,2026-02-01,",
      "Ben Ode,BEN@example.com,IT lead,y,yes,Firewall and backups,2024-06-01,2024-06-03,03/04/2026,,Part time",
    ].join("\n");
    const plan = planPersonnelImport(csv, { today });
    expect(plan.mode).toBe("roster");
    expect(plan.columns.awarenessOn).toBe("Security awareness training");
    expect(plan.columns.insiderThreatOn).toBe("Insider threat training");
    expect(plan.columns.cuiAccess).toBe("CUI access");
    expect(plan.columns.securityDuties).toBe("Security duties");
    expect(plan.columns.dutiesDescription).toBe("Duties");
    expect(plan.rows).toEqual([
      {
        line: 2,
        name: "Ana Ruiz",
        fields: {
          email: "ana@example.com",
          jobTitle: "Programmer",
          cuiAccess: true,
          securityDuties: false,
          screenedOn: "2025-01-10",
          accessGrantedOn: "2025-01-15",
          awarenessOn: "2026-02-01",
          insiderThreatOn: "2026-02-01",
        },
      },
      {
        line: 3,
        name: "Ben Ode",
        fields: {
          email: "BEN@example.com",
          jobTitle: "IT lead",
          cuiAccess: true,
          securityDuties: true,
          dutiesDescription: "Firewall and backups",
          screenedOn: "2024-06-01",
          accessGrantedOn: "2024-06-03",
          awarenessOn: "2026-03-04",
          notes: "Part time",
        },
      },
    ]);
    // A numeric date with no order evidence is read month first, and the preview says so.
    expect(plan.issues.map((i) => i.message).join(" ")).toContain("month/day/year");
  });

  it("reads its own People export back, ignoring the Next due columns", () => {
    const exported = personnelCsv(
      [
        {
          id: "per_1",
          name: "=Ana",
          jobTitle: "Programmer",
          email: "ana@example.com",
          cuiAccess: true,
          securityDuties: true,
          dutiesDescription: "Backups",
          screenedOn: "2025-01-10",
          screeningMethod: "Reference check",
          accessGrantedOn: "2025-01-15",
          awarenessOn: "2026-02-01",
          roleBasedOn: "2026-02-02",
          insiderThreatOn: "2026-02-03",
          leftOn: "2026-10-01",
          departureKind: "transfer",
          accessRemovedOn: "2026-10-02",
          notes: "",
        },
      ],
      today,
      12,
    );
    const plan = planPersonnelImport(exported, { today });
    expect(plan.issues).toEqual([]);
    expect(plan.rows[0]).toEqual({
      line: 2,
      name: "=Ana",
      fields: {
        email: "ana@example.com",
        jobTitle: "Programmer",
        cuiAccess: true,
        securityDuties: true,
        dutiesDescription: "Backups",
        screenedOn: "2025-01-10",
        screeningMethod: "Reference check",
        accessGrantedOn: "2025-01-15",
        awarenessOn: "2026-02-01",
        roleBasedOn: "2026-02-02",
        insiderThreatOn: "2026-02-03",
        leftOn: "2026-10-01",
        departureKind: "transfer",
        accessRemovedOn: "2026-10-02",
      },
    });
  });

  it("joins first and last names, and leaves blank cells out so they keep what is recorded", () => {
    const plan = planPersonnelImport("First name,Last name,Role\nAna,Ruiz,\nBen,,Lead\n", {
      today,
    });
    expect(plan.rows).toEqual([
      { line: 2, name: "Ana Ruiz", fields: {} },
      { line: 3, name: "Ben", fields: { jobTitle: "Lead" } },
    ]);
  });

  it("refuses future dates, unreadable dates, bad emails and unclear yes/no cells cell by cell", () => {
    const csv = [
      "Name,Email,CUI access,Security awareness training,Screened on",
      "Ana,not-an-email,maybe,2027-01-01,soon",
    ].join("\n");
    const plan = planPersonnelImport(csv, { today });
    expect(plan.rows).toEqual([{ line: 2, name: "Ana", fields: {} }]);
    const text = plan.issues.map((i) => i.message).join("\n");
    expect(text).toContain("not an email address");
    expect(text).toContain("not yes or no");
    expect(text).toContain("in the future");
    expect(text).toContain('"soon"');
  });

  it("reads day-first dates when the file can only be day first, or when chosen", () => {
    const csv = "Name,Security awareness training\nAna,31/01/2026\nBen,03/04/2026\n";
    const detected = planPersonnelImport(csv, { today });
    expect(detected.dates.order).toBe("dmy");
    expect(detected.rows.map((r) => r.fields.awarenessOn)).toEqual(["2026-01-31", "2026-04-03"]);
    const chosen = planPersonnelImport("Name,Security awareness training\nBen,03/04/2026\n", {
      today,
      dateOrder: "dmy",
    });
    expect(chosen.rows[0]?.fields.awarenessOn).toBe("2026-04-03");
  });

  it("keeps the first of two rows for the same person", () => {
    const plan = planPersonnelImport("Name,Email\nAna,a@x.com\nANA,\nOther,A@X.COM\n", { today });
    expect(plan.rows.map((r) => r.line)).toEqual([2]);
    expect(plan.issues.filter((i) => i.message.includes("same person as line 2"))).toHaveLength(2);
  });

  it("says what to name the columns when no header names people", () => {
    const plan = planPersonnelImport("Course,Date\nX,2026-01-01\n", { today });
    expect(plan.rows).toEqual([]);
    expect(plan.issues[0]?.message).toContain('"Name"');
  });
});

describe("planPersonnelImport: training provider completion exports", () => {
  const EXPORT = [
    "First Name,Last Name,Email,Module Name,Status,Enrollment Date,Completion Date",
    "Ana,Ruiz,ana@example.com,2026 Security Awareness,Completed,2026-01-02,2026-01-20",
    "Ana,Ruiz,ana@example.com,2026 Security Awareness,Passed,2026-05-01,2026-05-10",
    "Ben,Ode,ben@example.com,2026 Security Awareness,Not Started,2026-01-02,",
    "Ben,Ode,ben@example.com,Insider Threat Basics,Completed,2026-01-02,2026-02-01",
    "Cy,Lee,cy@example.com,Phishing Simulation,Completed,2026-01-02,2026-02-01",
  ].join("\n");

  it("lists the courses and changes nothing until each is matched to a requirement", () => {
    const plan = planPersonnelImport(EXPORT, { today });
    expect(plan.mode).toBe("completions");
    expect(plan.columns.completedOn).toBe("Completion Date");
    expect(plan.columns.course).toBe("Module Name");
    expect(plan.courses.map((c) => [c.key, c.rows, c.counts])).toEqual([
      ["2026 security awareness", 2, []],
      ["insider threat basics", 1, []],
      ["phishing simulation", 1, []],
    ]);
    expect(plan.rows.every((r) => Object.keys(r.fields).every((k) => k === "email"))).toBe(true);
    const text = plan.issues.map((i) => i.message).join("\n");
    expect(text).toContain("1 row is not completed");
    expect(text).toContain("never reads that from the course title");
  });

  it("records the latest completion per person for the trainings each course counts for", () => {
    const plan = planPersonnelImport(EXPORT, {
      today,
      courseMap: {
        "2026 security awareness": ["awareness", "insiderThreat"],
        "insider threat basics": ["insiderThreat"],
      },
    });
    expect(plan.rows).toEqual([
      {
        line: 2,
        name: "Ana Ruiz",
        fields: {
          email: "ana@example.com",
          awarenessOn: "2026-05-10",
          insiderThreatOn: "2026-05-10",
        },
      },
      {
        line: 5,
        name: "Ben Ode",
        fields: { email: "ben@example.com", insiderThreatOn: "2026-02-01" },
      },
      { line: 6, name: "Cy Lee", fields: { email: "cy@example.com" } },
    ]);
  });

  it("treats a file without a course column as one course", () => {
    const plan = planPersonnelImport("Learner,Date completed\nAna,2026-03-01\n", {
      today,
      courseMap: { "": ["awareness"] },
    });
    expect(plan.courses).toEqual([
      { key: "", name: "(no course column)", rows: 1, counts: ["awareness"] },
    ]);
    expect(plan.rows).toEqual([{ line: 2, name: "Ana", fields: { awarenessOn: "2026-03-01" } }]);
  });

  it("uses per-training columns over a generic completion date", () => {
    const plan = planPersonnelImport(
      "Name,Security awareness,Completed\nAna,2026-03-01,2026-04-01\n",
      { today },
    );
    expect(plan.mode).toBe("roster");
    expect(plan.rows[0]?.fields).toEqual({ awarenessOn: "2026-03-01" });
  });
});

describe("cell readers", () => {
  it("reads yes/no, departures and completed statuses", () => {
    expect([parseYesNo("Yes"), parseYesNo(" n "), parseYesNo("✓"), parseYesNo("maybe")]).toEqual([
      true,
      false,
      true,
      null,
    ]);
    expect(parseDepartureKind("Left the organization")).toBe("termination");
    expect(parseDepartureKind("Resigned")).toBe("termination");
    expect(parseDepartureKind("Transferred to a role without this access")).toBe("transfer");
    expect(parseDepartureKind("Vacation")).toBeNull();
    expect(["Completed", "PASSED", "100%", "100 %"].map(isCompletedStatus)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(["In progress", "Not started", "Failed"].map(isCompletedStatus)).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("counts the people a sheet would import", () => {
    expect(personRowsIn("Name\nAna\nBen\n", today)).toBe(2);
    expect(personRowsIn("Nothing,Here\n1,2\n", today)).toBe(0);
  });
});
