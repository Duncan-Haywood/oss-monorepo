// The submittal log page's form checks and status line (src/client/pages/submittals.tsx).

import { submittalStatus } from "@shared/submittals";
import { describe, expect, it } from "vitest";
import { stampCandidates } from "../../src/client/components/stamp-reader";
import { statusText, submittalBody, transmittalHref } from "../../src/client/pages/submittals";

const form = {
  number: "",
  specSection: " 23 31 13 ",
  title: " Ductwork shop drawings ",
  type: "shop_drawings" as const,
  gcReference: "",
  submittedOn: "2026-11-02",
  requiredBy: "2026-11-16",
  returnedOn: "",
  action: "" as const,
  neededOnSite: "2027-01-15",
  leadTimeDays: "35",
  reviewDays: "",
  notes: "",
};

it("trims text, blanks empty fields and reads whole days", () => {
  expect(submittalBody(form)).toEqual({
    specSection: "23 31 13",
    title: "Ductwork shop drawings",
    type: "shop_drawings",
    gcReference: null,
    submittedOn: "2026-11-02",
    requiredBy: "2026-11-16",
    returnedOn: null,
    action: null,
    neededOnSite: "2027-01-15",
    leadTimeDays: 35,
    reviewDays: null,
    notes: null,
  });
});

it("refuses a missing title, fractional days and a returned date with no action", () => {
  expect(() => submittalBody({ ...form, title: " " })).toThrow(/what is being submitted/);
  expect(() => submittalBody({ ...form, leadTimeDays: "3.5" })).toThrow(/whole days/);
  expect(() => submittalBody({ ...form, returnedOn: "2026-11-10" })).toThrow(/action/);
});

it("says how long it has been out and how late", () => {
  const st = submittalStatus({ ...submittalBody(form), number: 1, revision: 0 }, "2026-11-26");
  expect(statusText(st)).toBe("With the GC · 24 days out · 10 days overdue");
  const late = submittalStatus(
    { ...submittalBody({ ...form, submittedOn: "", requiredBy: "" }), number: 1, revision: 0 },
    "2026-12-20",
  );
  expect(statusText(late)).toBe("Not submitted · was due to go by 2026-12-11 · delivery at risk");
});

it("links the transmittal with the user's date and, when picked, the action requested", () => {
  const base = "/api/orgs/o1/projects/p1/submittals";
  expect(transmittalHref(base, "smt_1", "2026-11-26", "")).toBe(
    `${base}/smt_1/transmittal.pdf?today=2026-11-26`,
  );
  expect(transmittalHref(base, "smt_1", "2026-11-26", "review")).toBe(
    `${base}/smt_1/transmittal.pdf?today=2026-11-26&requested=review`,
  );
});

describe("stampCandidates", () => {
  it("offers the stamped copy first, then other PDFs, and never a photo", () => {
    const f = (id: string, category: string, contentType = "application/pdf") => ({
      id,
      fileName: `${id}.pdf`,
      contentType,
      category,
    });
    expect(
      stampCandidates([
        f("data", "backup"),
        f("photo", "photo", "image/jpeg"),
        f("stamped", "signed"),
      ]).map((x) => x.id),
    ).toEqual(["stamped", "data"]);
  });
});
