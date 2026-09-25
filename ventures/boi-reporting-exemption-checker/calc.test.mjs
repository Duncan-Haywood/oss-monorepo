import { test } from "node:test";
import assert from "node:assert/strict";
import { boiExemptionOutcome, RULE_EFFECTIVE_DATE, IFR_CUTOFF_DATE, IFR_DEADLINE } from "./calc.mjs";

test("a US-formed entity is permanently exempt regardless of other inputs", () => {
  const result = boiExemptionOutcome({ formedInUS: true, registeredInUS: true, allOwnersUSPersons: false });
  assert.equal(result.isForeignReportingCompany, false);
  assert.equal(result.mustFile, false);
  assert.equal(result.mustReportAnyOwner, false);
  assert.equal(result.deadline, null);
  const titles = result.findings.map((f) => f.title).join(" | ");
  assert.match(titles, /permanently exempt/);
});

test("a foreign-formed entity not registered in the US has no obligation", () => {
  const result = boiExemptionOutcome({ formedInUS: false, registeredInUS: false });
  assert.equal(result.isForeignReportingCompany, false);
  assert.equal(result.mustFile, false);
  const titles = result.findings.map((f) => f.title).join(" | ");
  assert.match(titles, /not a reporting company/);
});

test("a foreign reporting company with only US-person owners must file but reports none of them", () => {
  const result = boiExemptionOutcome({
    formedInUS: false,
    registeredInUS: true,
    registrationNoticeDate: "2026-01-15",
    allOwnersUSPersons: true,
  });
  assert.equal(result.isForeignReportingCompany, true);
  assert.equal(result.mustFile, true);
  assert.equal(result.mustReportAnyOwner, false);
  const titles = result.findings.map((f) => f.title).join(" | ");
  assert.match(titles, /report none of them/);
});

test("a foreign reporting company with a non-US-person owner must report that owner", () => {
  const result = boiExemptionOutcome({
    formedInUS: false,
    registeredInUS: true,
    registrationNoticeDate: "2026-01-15",
    allOwnersUSPersons: false,
  });
  assert.equal(result.mustReportAnyOwner, true);
  const titles = result.findings.map((f) => f.title).join(" | ");
  assert.match(titles, /Report only the non-U\.S\.-person beneficial owners/);
});

test("registration before the IFR cutoff uses the fixed 2025-04-25 deadline", () => {
  const result = boiExemptionOutcome({
    formedInUS: false,
    registeredInUS: true,
    registrationNoticeDate: "2025-01-01",
    allOwnersUSPersons: true,
  });
  assert.equal(result.deadline, IFR_DEADLINE);
  assert.equal(result.isOverdue, true);
});

test("registration on the IFR cutoff date itself uses the fixed deadline (inclusive boundary)", () => {
  const result = boiExemptionOutcome({
    formedInUS: false,
    registeredInUS: true,
    registrationNoticeDate: IFR_CUTOFF_DATE,
    allOwnersUSPersons: true,
  });
  assert.equal(result.deadline, IFR_DEADLINE);
});

test("registration after the IFR cutoff uses a 30-day-from-notice deadline", () => {
  const result = boiExemptionOutcome({
    formedInUS: false,
    registeredInUS: true,
    registrationNoticeDate: "2026-06-01",
    allOwnersUSPersons: true,
  });
  assert.equal(result.deadline, "2026-07-01");
  assert.equal(result.isOverdue, true, "2026-07-01 is before the rule effective date of 2026-08-14");
});

test("a deadline after the rule effective date is not flagged overdue", () => {
  const result = boiExemptionOutcome({
    formedInUS: false,
    registeredInUS: true,
    registrationNoticeDate: "2026-08-10",
    allOwnersUSPersons: true,
  });
  assert.equal(result.deadline, "2026-09-09");
  assert.equal(result.isOverdue, false);
});

test("no registration notice date yields no computed deadline but still flags the filing requirement", () => {
  const result = boiExemptionOutcome({
    formedInUS: false,
    registeredInUS: true,
    registrationNoticeDate: "",
    allOwnersUSPersons: true,
  });
  assert.equal(result.deadline, null);
  assert.equal(result.mustFile, true);
  const titles = result.findings.map((f) => f.title).join(" | ");
  assert.match(titles, /Enter the registration notice date/);
});

test("RULE_EFFECTIVE_DATE and IFR constants are the documented dates", () => {
  assert.equal(RULE_EFFECTIVE_DATE, "2026-08-14");
  assert.equal(IFR_CUTOFF_DATE, "2025-03-26");
  assert.equal(IFR_DEADLINE, "2025-04-25");
});

test("every branch includes the not-a-filing-service caveat", () => {
  const cases = [
    { formedInUS: true, registeredInUS: true },
    { formedInUS: false, registeredInUS: false },
    { formedInUS: false, registeredInUS: true, registrationNoticeDate: "2026-01-01", allOwnersUSPersons: true },
  ];
  for (const input of cases) {
    const result = boiExemptionOutcome(input);
    const titles = result.findings.map((f) => f.title).join(" | ");
    if (result.mustFile) {
      assert.match(titles, /rule-application aid, not a filing service/);
    }
  }
});
