import { describe, expect, it } from "vitest";
import { safeFileName } from "../evidence";
import { poamCsv } from "./index";

describe("poamCsv", () => {
  it("quotes and neutralises formula cells", () => {
    const csv = poamCsv([
      {
        id: "poa_1",
        orgId: "org_1",
        controlId: "AC.L2-3.1.8",
        weakness: '=cmd|"a,b"',
        remediation: "",
        milestones: "line1\nline2",
        responsible: "+1",
        scheduledCompletion: "2027-01-01",
        status: "open",
        closedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        eligible: true,
        eligibilityReason: "1-point requirement",
        overdue: false,
      },
    ]);
    const row = csv.split("\r\n")[1] ?? "";
    expect(row).toContain(`"'=cmd|""a,b"""`);
    expect(row).toContain("'+1");
    expect(row).toContain('"line1\nline2"');
  });
});

describe("safeFileName", () => {
  it("drops paths and control characters", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("C:\\x\\a\u0000b.pdf")).toBe("a_b.pdf");
    expect(safeFileName("")).toBe("file");
  });
});
