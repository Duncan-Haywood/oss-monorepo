import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  checkProviders,
  controlSharesProblem,
  ESP_QUOTES,
  ESP_RULE_VERIFICATION,
  espScope,
  hasDocument,
  type ProviderLike,
  shareSentence,
  sharesByControl,
} from "./service-providers";

const p = (over: Partial<ProviderLike>): ProviderLike => ({
  id: "esp_1",
  name: "Provider",
  data: "cui",
  isCsp: false,
  services: "Managed IT",
  fedrampBasis: "",
  serviceDescriptionRef: "MSA exhibit A",
  crmRef: "CRM v3 (evidence)",
  notes: "",
  controls: [{ controlId: "AC.L2-3.1.1", responsibility: "shared" }],
  ...over,
});

describe("ESP quotes", () => {
  it("are pinned: changing one means re-reading 32 CFR 170.19 and updating readOn", () => {
    // Every quote was checked by script as a verbatim substring of the eCFR file (sha256 in the
    // module header) on the readOn date. A new hash here needs that check again.
    const hash = createHash("sha256").update(JSON.stringify(ESP_QUOTES)).digest("hex");
    expect(hash).toBe("12c2b8b22e18d6d6101f7e00cc1c843c25c445f11b27ae97fd9e51859af60b3a");
    expect(ESP_RULE_VERIFICATION).toMatchObject({ readOn: "2026-11-26", checkedAgainstRule: true });
  });
});

describe("table 4 scoping", () => {
  it("maps each cell of the table", () => {
    expect(espScope("cui", true)).toMatchObject({
      inScope: true,
      isEsp: true,
      rule: ESP_QUOTES.cspCui,
    });
    expect(espScope("cui", false)).toMatchObject({
      inScope: true,
      isEsp: true,
      rule: ESP_QUOTES.espCui,
    });
    expect(espScope("spd", true)).toMatchObject({
      inScope: true,
      isEsp: true,
      rule: ESP_QUOTES.cspSpd,
    });
    expect(espScope("spd", false)).toMatchObject({
      inScope: true,
      isEsp: true,
      rule: ESP_QUOTES.espSpd,
    });
    for (const csp of [true, false])
      expect(espScope("neither", csp)).toMatchObject({
        inScope: false,
        isEsp: false,
        rule: ESP_QUOTES.neither,
        needs: [],
      });
  });

  it("asks a cloud provider holding CUI for its FedRAMP basis, and only that cell", () => {
    expect(espScope("cui", true).needs[0]).toContain("252.204-7012(b)(2)(ii)(D)");
    expect(espScope("cui", false).needs.join(" ")).not.toContain("FedRAMP");
    expect(espScope("spd", true).needs.join(" ")).not.toContain("FedRAMP");
  });
});

describe("provider checks", () => {
  it("is quiet for a complete ESP", () => {
    expect(checkProviders([p({})])).toEqual({ total: 1, inScope: 1, issues: [] });
  });

  it("flags a cloud provider holding CUI with no FedRAMP basis", () => {
    const c = checkProviders([p({ name: "GCC High", isCsp: true })]);
    expect(c.issues.map((i) => i.message)).toEqual([
      expect.stringContaining("GCC High: record the FedRAMP basis"),
    ]);
    expect(checkProviders([p({ isCsp: true, fedrampBasis: "FedRAMP High" })]).issues).toEqual([]);
  });

  it("flags missing services, service description and CRM, in that order", () => {
    const c = checkProviders([
      p({ name: "MSP", data: "spd", services: "", serviceDescriptionRef: "", crmRef: "" }),
    ]);
    expect(c.issues.map((i) => i.message)).toEqual([
      "MSP: say which services it provides.",
      "MSP: attach its service description from Evidence, or note where it is kept.",
      "MSP: attach its customer responsibility matrix (CRM) from Evidence, or note where it is kept.",
    ]);
  });

  it("counts a linked evidence file as the service description or CRM", () => {
    const c = checkProviders([
      p({
        name: "MSP",
        serviceDescriptionRef: "",
        crmRef: "",
        serviceDescriptionEvidenceId: "evd_1",
        crmEvidenceId: "evd_2",
      }),
    ]);
    expect(c.issues).toEqual([]);
    expect(hasDocument("  ", null)).toBe(false);
    expect(hasDocument("", "evd_1")).toBe(true);
    expect(hasDocument("SharePoint/ESP", null)).toBe(true);
  });

  it("asks for the requirements once a CRM is on file", () => {
    const c = checkProviders([p({ name: "MSP", controls: [] })]);
    expect(c.issues.map((i) => i.message)).toEqual([
      expect.stringContaining("MSP: mark the requirements its CRM says it carries"),
    ]);
  });

  it("wants a reason for a non-ESP and no requirements on it", () => {
    const c = checkProviders([p({ name: "Payroll", data: "neither" })]);
    expect(c.inScope).toBe(0);
    expect(c.issues.map((i) => i.message)).toEqual([
      expect.stringContaining("Payroll: add a note saying why"),
      expect.stringContaining(
        "Payroll: requirements are marked as carried by a provider that is not an ESP",
      ),
    ]);
    expect(
      checkProviders([p({ data: "neither", notes: "Only names and pay rates", controls: [] })])
        .issues,
    ).toEqual([]);
  });
});

describe("requirement shares", () => {
  it("accepts Level 2 ids once each", () => {
    expect(
      controlSharesProblem([
        { controlId: "AC.L2-3.1.1", responsibility: "provider" },
        { controlId: "SC.L2-3.13.11", responsibility: "shared" },
      ]),
    ).toBeNull();
    expect(controlSharesProblem([{ controlId: "AC.L1-b.1.i", responsibility: "provider" }])).toBe(
      "AC.L1-b.1.i is not a Level 2 requirement.",
    );
    expect(controlSharesProblem([{ controlId: "XX-9", responsibility: "provider" }])).toContain(
      "not a Level 2 requirement",
    );
    expect(
      controlSharesProblem([
        { controlId: "AC.L2-3.1.1", responsibility: "provider" },
        { controlId: "AC.L2-3.1.1", responsibility: "shared" },
      ]),
    ).toBe("AC.L2-3.1.1 is listed twice.");
  });

  it("groups providers per requirement, leaving out non-ESPs", () => {
    const by = sharesByControl([
      p({ name: "GCC High", controls: [{ controlId: "AC.L2-3.1.1", responsibility: "provider" }] }),
      p({
        name: "MSP",
        data: "spd",
        controls: [{ controlId: "AC.L2-3.1.1", responsibility: "shared" }],
      }),
      p({
        name: "Payroll",
        data: "neither",
        controls: [{ controlId: "AC.L2-3.1.1", responsibility: "provider" }],
      }),
    ]);
    const lines = by.get("AC.L2-3.1.1") ?? [];
    expect(lines.map((l) => l.name)).toEqual(["GCC High", "MSP"]);
    expect(shareSentence(lines)).toBe("carried by GCC High; shared with MSP");
    expect(by.has("AC.L2-3.1.2")).toBe(false);
  });
});
