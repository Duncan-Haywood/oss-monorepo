import { describe, expect, it } from "vitest";
import { CONTROLS } from "./controls";
import { applyCrmMarks, crmSummary, parseCrmParty, planCrmImport } from "./crm-import";
import { controlSharesProblem } from "./service-providers";

const partyOf = (plan: ReturnType<typeof planCrmImport>, id: string) =>
  plan.marks.find((m) => m.controlId === id)?.party;

describe("parseCrmParty", () => {
  it("reads the usual words for each party", () => {
    expect(parseCrmParty("Customer")).toBe("customer");
    expect(parseCrmParty("OSC Responsibility")).toBe("customer");
    expect(parseCrmParty("Not inherited")).toBe("customer");
    expect(parseCrmParty("Inherited")).toBe("provider");
    expect(parseCrmParty("Service Provider")).toBe("provider");
    expect(parseCrmParty("MSP")).toBe("provider");
    expect(parseCrmParty("Shared")).toBe("shared");
    expect(parseCrmParty("Hybrid")).toBe("shared");
    expect(parseCrmParty("Partially inherited")).toBe("shared");
    expect(parseCrmParty("Customer / Provider")).toBe("shared");
    expect(parseCrmParty("N/A")).toBe("na");
  });
  it("reads the provider's own name", () => {
    expect(parseCrmParty("Microsoft", "Microsoft 365 GCC High")).toBe("provider");
    expect(parseCrmParty("Acme IT responsibility", "Acme IT")).toBe("provider");
    expect(parseCrmParty("Customer and Microsoft", "Microsoft 365 GCC High")).toBe("shared");
  });
  it("never guesses from anything else", () => {
    expect(parseCrmParty("Configure MFA for all users")).toBeNull();
    expect(parseCrmParty("Microsoft")).toBeNull();
    expect(parseCrmParty("")).toBeNull();
    expect(parseCrmParty("X")).toBeNull();
  });
});

describe("planCrmImport, one responsibility column", () => {
  const csv = [
    "Acme IT customer responsibility matrix,,",
    "Requirement,Responsibility,Notes",
    "AC.L2-3.1.1,Shared,Acme runs AD; you approve accounts",
    "AC.L2-3.1.2,Inherited,",
    "3.1.3,Customer,",
    "3.5.3,Acme IT,MFA on the RMM",
    "3.13.11,N/A,",
    "3.14.1,Configure it,",
    "AC.L1-b.1.i,Provider,",
  ].join("\n");
  const plan = planCrmImport(csv, "Acme IT");
  it("finds the columns", () => {
    expect(plan.layout).toBe("column");
    expect(plan.columns.id).toBe("Requirement");
    expect(plan.columns.responsibility).toBe("Responsibility");
  });
  it("reads each party", () => {
    expect(partyOf(plan, "AC.L2-3.1.1")).toBe("shared");
    expect(partyOf(plan, "AC.L2-3.1.2")).toBe("provider");
    expect(partyOf(plan, "AC.L2-3.1.3")).toBe("customer");
    expect(partyOf(plan, "IA.L2-3.5.3")).toBe("provider");
    expect(partyOf(plan, "SC.L2-3.13.11")).toBe("na");
    expect(crmSummary(plan)).toEqual({ provider: 2, shared: 1, customer: 1, na: 1 });
  });
  it("lists what it cannot read, with its line, and leaves it out", () => {
    expect(partyOf(plan, "SI.L2-3.14.1")).toBeUndefined();
    expect(plan.issues).toContainEqual({
      line: 8,
      message: 'SI.L2-3.14.1: "Configure it" does not say Customer, Provider or Shared; left out.',
    });
    expect(plan.issues.some((i) => i.line === 9 && /Level 1/.test(i.message))).toBe(true);
  });
});

describe("planCrmImport, a column per party", () => {
  it("reads X marks", () => {
    const csv = [
      "Control,Description,Customer,Provider,Shared",
      "3.1.1,Limit access,,,X",
      "3.1.2,Limit transactions,,X,",
      "3.1.3,Control CUI flow,X,,",
      "3.1.4,Separate duties,X,X,",
      "3.1.5,Least privilege,,,",
    ].join("\n");
    const plan = planCrmImport(csv);
    expect(plan.layout).toBe("parties");
    expect(plan.columns).toMatchObject({
      customer: "Customer",
      provider: "Provider",
      shared: "Shared",
    });
    expect(partyOf(plan, "AC.L2-3.1.1")).toBe("shared");
    expect(partyOf(plan, "AC.L2-3.1.2")).toBe("provider");
    expect(partyOf(plan, "AC.L2-3.1.3")).toBe("customer");
    expect(partyOf(plan, "AC.L2-3.1.4")).toBe("shared");
    expect(plan.issues).toContainEqual({
      line: 6,
      message: "AC.L2-3.1.5: no party column is marked; left out.",
    });
  });
  it("reads each party's description columns, a provider column named for it, and None", () => {
    const csv = [
      "NIST 800-171 ID,Customer Responsibility,Microsoft Responsibility",
      '3.1.1,"Assign roles in Entra ID","Operates the identity platform"',
      "3.1.2,None,Enforces the tenant boundary",
      "3.1.3,Label CUI documents,N/A",
    ].join("\n");
    const plan = planCrmImport(csv, "Microsoft 365 GCC High");
    expect(plan.layout).toBe("parties");
    expect(plan.columns.provider).toBe("Microsoft Responsibility");
    expect(partyOf(plan, "AC.L2-3.1.1")).toBe("shared");
    expect(partyOf(plan, "AC.L2-3.1.2")).toBe("provider");
    expect(partyOf(plan, "AC.L2-3.1.3")).toBe("customer");
  });
  it("reads an Inherited yes/no column as the provider's", () => {
    const csv = ["Requirement,Inherited", "3.1.1,Yes", "3.1.2,No"].join("\n");
    const plan = planCrmImport(csv);
    expect(plan.layout).toBe("parties");
    expect(partyOf(plan, "AC.L2-3.1.1")).toBe("provider");
    expect(partyOf(plan, "AC.L2-3.1.2")).toBe("na");
  });
});

describe("planCrmImport, assessment objectives", () => {
  it("marks a requirement shared when its objectives disagree, and says why", () => {
    const csv = [
      "Objective,Responsibility",
      "3.1.1[a],Provider",
      "3.1.1[b],Provider",
      "3.1.1[c],Customer",
      "3.1.2[a],Provider",
      "3.1.2[b],Provider",
    ].join("\n");
    const plan = planCrmImport(csv);
    expect(partyOf(plan, "AC.L2-3.1.1")).toBe("shared");
    expect(partyOf(plan, "AC.L2-3.1.2")).toBe("provider");
    expect(plan.marks.find((m) => m.controlId === "AC.L2-3.1.1")?.lines).toEqual([2, 3, 4]);
    expect(plan.notices).toEqual([
      {
        line: 2,
        message:
          "AC.L2-3.1.1: its rows disagree (provider on 2 rows, customer on 1 row), so it is marked shared.",
      },
    ]);
  });
});

describe("planCrmImport, files it refuses", () => {
  it("says when the ids are Rev. 3 numbers", () => {
    const plan = planCrmImport("ID,Responsibility\n03.01.01,Shared\n03.01.02,Customer\n");
    expect(plan.layout).toBeNull();
    expect(plan.issues[0]?.message).toMatch(/Rev\. 3/);
  });
  it("says when there is no id column", () => {
    const plan = planCrmImport("Name,Who\nEmail,Shared\n");
    expect(plan.issues[0]?.message).toMatch(/No column of Level 2 requirement ids/);
  });
  it("says when nothing names who carries a requirement", () => {
    const plan = planCrmImport("Requirement,Description\n3.1.1,Limit access\n3.1.2,Limit use\n");
    expect(plan.layout).toBeNull();
    expect(plan.issues[0]?.message).toMatch(/No column saying who carries/);
  });
  it("refuses an oversized file", () => {
    const plan = planCrmImport("x".repeat(1_000_001));
    expect(plan.issues[0]?.message).toMatch(/over 1 MB/);
  });
});

describe("applyCrmMarks", () => {
  it("replaces the listed requirements, keeps the rest, and passes the server's check", () => {
    const plan = planCrmImport(
      ["Requirement,Responsibility", "3.1.1,Customer", "3.1.2,Shared", "3.1.3,Inherited"].join(
        "\n",
      ),
    );
    const next = applyCrmMarks(
      [
        { controlId: "AC.L2-3.1.1", responsibility: "provider" },
        { controlId: "AU.L2-3.3.1", responsibility: "shared" },
      ],
      plan,
    );
    expect(next).toEqual([
      { controlId: "AU.L2-3.3.1", responsibility: "shared" },
      { controlId: "AC.L2-3.1.2", responsibility: "shared" },
      { controlId: "AC.L2-3.1.3", responsibility: "provider" },
    ]);
    expect(controlSharesProblem(next)).toBeNull();
  });
  it("reads a full 110-row matrix in either id form", () => {
    const rows = CONTROLS[2].map((c, i) => {
      const nist = c.id.split("-")[1] ?? "";
      return `${i % 2 ? c.id : nist},${["Customer", "Shared", "Provider"][i % 3]}`;
    });
    const plan = planCrmImport(["Requirement,Responsibility", ...rows].join("\n"));
    expect(plan.marks).toHaveLength(110);
    expect(plan.issues).toEqual([]);
    expect(controlSharesProblem(applyCrmMarks([], plan))).toBeNull();
  });
});
