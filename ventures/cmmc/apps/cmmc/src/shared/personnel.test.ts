import { describe, expect, it } from "vitest";
import { controlById } from "./controls";
import {
  addMonths,
  checkPersonnel,
  PERSONNEL_CONTROL_IDS,
  type PersonCsvRow,
  type PersonLike,
  personnelCsv,
  TRAINING_INFO,
  trainingAttention,
  trainingDueDates,
  trainingStatus,
  validatePerson,
} from "./personnel";

const TODAY = "2026-11-26";

const person = (over: Partial<PersonLike> = {}): PersonLike => ({
  id: "p1",
  name: "Dana",
  cuiAccess: true,
  securityDuties: false,
  dutiesDescription: "",
  screenedOn: "2025-01-02",
  accessGrantedOn: "2025-01-06",
  awarenessOn: "2026-03-01",
  roleBasedOn: null,
  insiderThreatOn: "2026-03-01",
  leftOn: null,
  departureKind: null,
  accessRemovedOn: null,
  ...over,
});

describe("addMonths", () => {
  it("keeps the day, or the month's last day when it has fewer", () => {
    expect(addMonths("2026-03-15", 12)).toBe("2027-03-15");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-02-29", 12)).toBe("2025-02-28");
    expect(addMonths("2026-08-31", 6)).toBe("2027-02-28");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonths("2026-12-31", 24)).toBe("2028-12-31");
  });
});

describe("trainingStatus", () => {
  it("reads current, due soon, overdue and missing against the interval", () => {
    const p = person();
    expect(trainingStatus(p, "awareness", TODAY, 12)).toEqual({
      state: "current",
      lastOn: "2026-03-01",
      dueOn: "2027-03-01",
    });
    expect(trainingStatus(p, "awareness", TODAY, 6).state).toBe("overdue");
    expect(
      trainingStatus(person({ awarenessOn: "2025-12-20" }), "awareness", TODAY, 12).state,
    ).toBe("due_soon");
    // Due exactly today is not yet overdue.
    expect(
      trainingStatus(person({ awarenessOn: "2025-11-26" }), "awareness", TODAY, 12).state,
    ).toBe("due_soon");
    expect(
      trainingStatus(person({ awarenessOn: "2025-11-25" }), "awareness", TODAY, 12).state,
    ).toBe("overdue");
    expect(trainingStatus(person({ awarenessOn: null }), "awareness", TODAY, 12).state).toBe(
      "missing",
    );
  });

  it("asks role-based training only of people with security duties, and nothing of leavers", () => {
    expect(trainingStatus(person(), "roleBased", TODAY, 12).state).toBe("not_required");
    expect(trainingStatus(person({ securityDuties: true }), "roleBased", TODAY, 12).state).toBe(
      "missing",
    );
    const gone = person({ leftOn: "2026-10-01", departureKind: "termination", awarenessOn: null });
    expect(trainingStatus(gone, "awareness", TODAY, 12).state).toBe("not_required");
  });
});

describe("validatePerson", () => {
  it("refuses bad and future dates and a half-recorded departure", () => {
    expect(validatePerson(person(), TODAY)).toEqual([]);
    expect(validatePerson(person({ name: " " }), TODAY)).toEqual(["Enter the person's name."]);
    expect(validatePerson(person({ screenedOn: "2026-02-30" }), TODAY)[0]).toContain(
      "use a real date",
    );
    expect(validatePerson(person({ awarenessOn: "2026-11-27" }), TODAY)[0]).toContain("future");
    expect(validatePerson(person({ accessRemovedOn: "2026-11-01" }), TODAY)[0]).toContain(
      "date they left",
    );
    expect(validatePerson(person({ leftOn: "2026-11-01" }), TODAY)[0]).toContain(
      "left the organization or transferred",
    );
  });
});

describe("checkPersonnel", () => {
  it("names each gap with its requirement and counts what the records cover", () => {
    const people: PersonLike[] = [
      person({ id: "a", name: "Ana" }),
      person({
        id: "b",
        name: "Ben",
        securityDuties: true,
        screenedOn: "2025-02-10",
        accessGrantedOn: "2025-02-01",
        awarenessOn: "2025-06-01",
        insiderThreatOn: null,
      }),
      person({ id: "c", name: "Cy", cuiAccess: false, screenedOn: null }),
      person({ id: "d", name: "Dee", leftOn: "2026-10-31", departureKind: "termination" }),
      person({
        id: "e",
        name: "Eli",
        leftOn: "2026-09-30",
        departureKind: "transfer",
        accessRemovedOn: "2026-09-30",
      }),
    ];
    const check = checkPersonnel(people, TODAY, 12);
    expect(check.active).toBe(3);
    expect(check.departed).toBe(2);
    expect(check.issues.map((i) => [i.personId, i.controlId, i.message])).toEqual([
      [
        "b",
        "AT.L2-3.2.1",
        "Ben: security awareness was due again on 2026-06-01 (last 2025-06-01).",
      ],
      ["b", "AT.L2-3.2.2", "Ben: no role-based security training date recorded."],
      ["b", "AT.L2-3.2.3", "Ben: no insider threat awareness date recorded."],
      [
        "b",
        "AT.L2-3.2.2",
        "Ben: write down which security duties they carry, so the training can be matched to them.",
      ],
      [
        "b",
        "PS.L2-3.9.1",
        "Ben: screened on 2025-02-10, after access was granted on 2025-02-01. 3.9.1 asks for screening before access.",
      ],
      [
        "d",
        "PS.L2-3.9.2",
        "Dee: left on 2026-10-31; record when their system access and credentials were removed.",
      ],
    ]);
    const byId = Object.fromEntries(check.requirements.map((r) => [r.controlId, r]));
    expect(byId["AT.L2-3.2.1"]).toMatchObject({ applies: 3, covered: 2 });
    expect(byId["AT.L2-3.2.2"]).toMatchObject({ applies: 1, covered: 0 });
    expect(byId["AT.L2-3.2.3"]).toMatchObject({ applies: 3, covered: 2 });
    expect(byId["PS.L2-3.9.1"]).toMatchObject({ applies: 2, covered: 1 });
    expect(byId["PS.L2-3.9.2"]).toMatchObject({
      applies: 2,
      covered: 1,
      reading: "1 of 2 departures and transfers have the access removal recorded.",
    });
  });

  it("says when the roster is empty or nobody carries security duties", () => {
    expect(checkPersonnel([], TODAY, 12).issues[0]?.message).toContain("No people recorded yet");
    const none = checkPersonnel([person()], TODAY, 12);
    expect(none.issues.map((i) => i.message)).toEqual([
      expect.stringContaining("Nobody is marked as having security duties"),
    ]);
    expect(none.requirements.find((r) => r.controlId === "AT.L2-3.2.2")?.reading).toBe(
      "Nobody to count yet.",
    );
  });

  it("quotes each requirement from the control library", () => {
    for (const id of PERSONNEL_CONTROL_IDS) expect(controlById(id)?.text).toBeTruthy();
    for (const t of Object.values(TRAINING_INFO)) expect(controlById(t.controlId)).toBeDefined();
    const req = checkPersonnel([], TODAY, 12).requirements;
    expect(req.find((r) => r.controlId === "PS.L2-3.9.1")?.text).toBe(
      "Screen individuals prior to authorizing access to organizational systems containing CUI.",
    );
  });
});

describe("personnelCsv", () => {
  it("writes the roster with next due dates and defuses formulas", () => {
    const row: PersonCsvRow = {
      ...person({
        name: '=HYPERLINK("x")',
        securityDuties: true,
        dutiesDescription: "Firewall, backups",
      }),
      jobTitle: "Machinist",
      email: "dana@example.com",
      screeningMethod: "Reference check",
      notes: "",
    };
    const csv = personnelCsv([row], TODAY, 12);
    const [header, line] = csv.trimEnd().split("\r\n");
    expect(header).toContain("Security awareness training (3.2.1),Next due");
    expect(line).toBe(
      `"'=HYPERLINK(""x"")",Machinist,dana@example.com,Yes,Yes,"Firewall, backups",2025-01-02,Reference check,2025-01-06,2026-03-01,2027-03-01,,Not trained,2026-03-01,2027-03-01,,,,`,
    );
  });
});

describe("trainingDueDates", () => {
  it("groups refresher dates by training and date, current people only, names left out", () => {
    const people = [
      person({ id: "a", name: "Ann" }),
      person({ id: "b", name: "Bo" }),
      person({
        id: "c",
        name: "Cy",
        securityDuties: true,
        roleBasedOn: "2026-01-31",
        insiderThreatOn: null,
      }),
      person({ id: "d", name: "Di", leftOn: "2026-06-01", departureKind: "termination" }),
    ];
    const dates = trainingDueDates(people, 12);
    expect(dates).toEqual([
      { training: "roleBased", dueOn: "2027-01-31", people: 1 },
      { training: "awareness", dueOn: "2027-03-01", people: 3 },
      { training: "insiderThreat", dueOn: "2027-03-01", people: 2 },
    ]);
    expect(JSON.stringify(dates)).not.toMatch(/Ann|Bo|Cy|Di/);
  });

  it("follows the organization's interval and skips role-based training nobody needs", () => {
    const dates = trainingDueDates([person({ roleBasedOn: "2026-01-01" })], 6);
    expect(dates.map((d) => [d.training, d.dueOn])).toEqual([
      ["awareness", "2026-09-01"],
      ["insiderThreat", "2026-09-01"],
    ]);
    expect(trainingDueDates([], 12)).toEqual([]);
  });
});

describe("trainingAttention", () => {
  it("lists overdue first, then due soon, then missing, and leaves out what is current", () => {
    const people = [
      person({ id: "a", name: "Ann", awarenessOn: "2025-12-10", insiderThreatOn: "2026-06-01" }),
      person({ id: "b", name: "Bo", awarenessOn: "2025-10-01", insiderThreatOn: null }),
      person({ id: "c", name: "Cy", leftOn: "2026-01-01", departureKind: "transfer" }),
    ];
    expect(
      trainingAttention(people, TODAY, 12).map((a) => [a.name, a.training, a.state, a.dueOn]),
    ).toEqual([
      ["Bo", "awareness", "overdue", "2026-10-01"],
      ["Ann", "awareness", "due_soon", "2026-12-10"],
      ["Bo", "insiderThreat", "missing", null],
    ]);
  });
});
