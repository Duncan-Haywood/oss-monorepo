import { ISO9001_CLAUSES, ISO9001_VERIFICATION, qualityReadiness } from "@shared/quality";
import { describe, expect, it } from "vitest";
import { renderQualityReport } from "./index";

const clause = ISO9001_CLAUSES[0];
if (!clause) throw new Error("no ISO 9001 clauses");

describe("renderQualityReport", () => {
  it("escapes backslashes before pipes in user text, so a table cell cannot be split", () => {
    const md = renderQualityReport(
      "Org",
      {
        standard: ISO9001_VERIFICATION.standard,
        verification: ISO9001_VERIFICATION,
        readiness: qualityReadiness(new Map(), [clause]),
        items: [
          {
            ...clause,
            status: "gap",
            notes: "path C:\\docs\\| next",
            ownerUserId: null,
            updatedAt: null,
            evidence: [
              { id: "e1", title: "a\\|b", fileName: "a.pdf", via: "clause", linkId: "l1" },
            ],
          },
        ],
      },
      "2026-11-26",
    );
    const row = md.split("\n").find((l) => l.startsWith(`| ${clause.number} `));
    expect(row).toContain("| path C:\\\\docs\\\\\\| next |");
    expect(row).toContain("| a\\\\\\|b |");
  });
});
