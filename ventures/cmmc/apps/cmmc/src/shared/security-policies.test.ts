import { describe, expect, it } from "vitest";
import { CONTROLS } from "./controls";
import {
  addMonths,
  confirmPlaceholders,
  familyRequirements,
  POLICY_FAMILIES,
  type PolicyDocumentInput,
  policyTemplate,
  renderPolicyDocument,
  renderPolicyManual,
  replaceProcedure,
  reviewState,
} from "./security-policies";

const input = {
  orgName: "Acme Machining LLC",
  systemName: "Acme engineering enclave",
  ownerName: "Pat Lee",
  reviewMonths: 12,
  statements: new Map<string, string>(),
};

describe("policy families", () => {
  it("covers all 14 families and every Level 2 requirement exactly once", () => {
    expect(POLICY_FAMILIES).toHaveLength(14);
    const ids = POLICY_FAMILIES.flatMap((f) => familyRequirements(f).map((c) => c.id));
    expect(ids).toHaveLength(110);
    expect(new Set(ids)).toEqual(new Set(CONTROLS[2].map((c) => c.id)));
    expect(familyRequirements("AC")).toHaveLength(22);
    expect(familyRequirements("PS")).toHaveLength(2);
  });
});

describe("addMonths", () => {
  it("adds months and clamps to the month's last day, never rolling over", () => {
    expect(addMonths("2026-11-26", 12)).toBe("2027-11-26");
    expect(addMonths("2026-08-31", 6)).toBe("2027-02-28");
    expect(addMonths("2027-08-31", 6)).toBe("2028-02-29");
    expect(addMonths("2028-02-29", 12)).toBe("2029-02-28");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-12-15", 24)).toBe("2028-12-15");
  });
});

describe("reviewState", () => {
  it("reads the review date only", () => {
    expect(reviewState(null, "2026-11-26")).toBe("none");
    expect(reviewState({ reviewDue: null }, "2026-11-26")).toBe("never_approved");
    expect(reviewState({ reviewDue: "2027-11-26" }, "2026-11-26")).toBe("current");
    expect(reviewState({ reviewDue: "2027-01-25" }, "2026-11-26")).toBe("due_soon");
    expect(reviewState({ reviewDue: "2026-11-26" }, "2026-11-26")).toBe("due_soon");
    expect(reviewState({ reviewDue: "2026-11-25" }, "2026-11-26")).toBe("overdue");
  });
});

describe("policyTemplate", () => {
  it("restates each requirement of the family in its official wording", () => {
    const md = policyTemplate("PS", input);
    for (const c of familyRequirements("PS")) {
      const tail = c.text.slice(1);
      expect(md).toContain(`**${c.nistIds[0]}** ${c.text[0]?.toLowerCase()}${tail}`);
    }
    expect(md).toContain("Acme Machining LLC will:");
    expect(md).toContain("Acme engineering enclave");
    expect(md).toContain("Policy owner (Pat Lee)");
    expect(md).toContain("at least every 12 months");
    expect(md).toContain("does not set a review interval");
  });

  it("copies accepted statements in as procedures and asks for the rest", () => {
    const md = policyTemplate("PS", {
      ...input,
      statements: new Map([["PS.L2-3.9.1", "HR runs a background check.\n# not a heading"]]),
    });
    expect(md).toContain("### 3.9.1\n\nHR runs a background check.\n\\# not a heading");
    expect(md).toMatch(/### 3\.9\.2\n\n_No accepted implementation statement yet/);
  });

  it("falls back to neutral wording when names are missing", () => {
    const md = policyTemplate("AT", {
      ...input,
      orgName: " ",
      systemName: "",
      ownerName: null,
    });
    expect(md).toContain("The organization will:");
    expect(md).toContain("the system that processes, stores or transmits CUI");
    expect(md).toContain("the policy owner named in this workspace");
  });
});

const doc = (over: Partial<PolicyDocumentInput> = {}): PolicyDocumentInput => ({
  orgName: "Acme | Machining",
  family: "PS",
  title: "Personnel Security Policy",
  body: "## 1. Purpose\n\nText.",
  version: 2,
  status: "approved",
  ownerName: "Pat Lee",
  approvedByName: "Sam Ortiz",
  approvedOn: "2026-11-26",
  reviewMonths: 12,
  reviewDue: "2027-11-26",
  generatedOn: "2026-11-27",
  ...over,
});

describe("renderPolicyDocument", () => {
  it("prints the control block and the text", () => {
    const md = renderPolicyDocument(doc());
    expect(md.startsWith("# Personnel Security Policy\n")).toBe(true);
    expect(md).toContain("| Organization | Acme \\| Machining |");
    expect(md).toContain("| Requirements covered | 3.9.1, 3.9.2 |");
    expect(md).toContain("| Status | Approved by Sam Ortiz on 2026-11-26 |");
    expect(md).toContain("| Next review due | 2027-11-26 |");
    expect(md).not.toContain("**Draft.**");
    expect(md).toContain("## 1. Purpose");
  });

  it("marks a draft", () => {
    const md = renderPolicyDocument(doc({ status: "draft", approvedOn: null }));
    expect(md).toContain("| Status | Draft (not approved) |");
    expect(md).toContain("**Draft.**");
  });
});

describe("renderPolicyManual", () => {
  it("lists every family and shifts each document's headings down one level", () => {
    const md = renderPolicyManual("Acme", "2026-11-27", [doc()]);
    expect(md.match(/^\| [A-Z]{2} \|/gm)).toHaveLength(14);
    expect(md).toContain("| AC | _Not written_ |");
    expect(md).toContain(
      "| PS | Personnel Security Policy | 2 | Approved 2026-11-26 | 2027-11-26 |",
    );
    expect(md).toContain("\n## Personnel Security Policy\n");
    expect(md).toContain("\n### 1. Purpose\n");
    expect(md.match(/^# /gm)).toHaveLength(1);
  });
});

describe("replaceProcedure", () => {
  const body = policyTemplate("PS", input);
  it("replaces one requirement's procedure and leaves the others and later sections alone", () => {
    const out = replaceProcedure(body, "3.9.1", "HR screens every hire before CUI access.");
    expect(out).not.toBeNull();
    const sec = (s: string, h: string) => s.split(`### ${h}\n`)[1]?.split(/\n#{1,3} /)[0];
    expect(sec(out ?? "", "3.9.1")?.trim()).toBe("HR screens every hire before CUI access.");
    expect(sec(out ?? "", "3.9.2")).toBe(sec(body, "3.9.2"));
    expect(out).toContain("## 6. Exceptions");
    expect(out?.split("\n### 3.9.1\n")[0]).toBe(body.split("\n### 3.9.1\n")[0]);
  });
  it("replaces again without piling up blank lines (idempotent for the same text)", () => {
    const once = replaceProcedure(body, "3.9.2", "Accounts are disabled the day a person leaves.");
    expect(
      replaceProcedure(once ?? "", "3.9.2", "Accounts are disabled the day a person leaves."),
    ).toBe(once);
  });
  it("works on the last section of a text", () => {
    expect(replaceProcedure("## 5. Procedures\n\n### 3.9.2\n\nold", "3.9.2", "new")).toBe(
      "## 5. Procedures\n\n### 3.9.2\n\nnew",
    );
  });
  it("escapes headings in the procedure so it cannot start a section", () => {
    const out = replaceProcedure(body, "3.9.1", "Step one\n## 6. Exceptions\nnone") ?? "";
    expect(out.match(/^## 6\. Exceptions$/gm)).toHaveLength(1);
  });
  it("returns null when the heading is gone", () => {
    expect(replaceProcedure("## Procedures\n\nfree text", "3.9.1", "x")).toBeNull();
  });
});

describe("confirmPlaceholders", () => {
  it("finds the placeholders a draft leaves", () => {
    expect(
      confirmPlaceholders("Uses [CONFIRM: the MFA product] every [CONFIRM: how often]."),
    ).toEqual(["[CONFIRM: the MFA product]", "[CONFIRM: how often]"]);
    expect(confirmPlaceholders("No gaps.")).toEqual([]);
  });
});
