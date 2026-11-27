// The estimate email drafts: the proposal on bid day and the follow-up once sent, from the saved
// estimate only. Hand-worked expectations.

import { describe, expect, it } from "vitest";
import {
  alternateLines,
  type EstimateEmailInput,
  estimateEmail,
  estimateGreeting,
  proposalLapsesOn,
} from "./estimate-email";

const base: EstimateEmailInput = {
  label: "EST-0007",
  name: "Riverside Clinic, mechanical",
  gcName: "Harbor Builders",
  gcContactName: "Dana Ruiz",
  gcContactEmail: " dana@harbor.example ",
  location: "Riverside, CA",
  bidDueOn: "2026-12-03",
  sentOn: null,
  status: "draft",
  validDays: 30,
  totals: { priceCents: 18_450_000 },
  bidItems: [
    { description: "Ductwork", alternate: null, alternateNumber: null, priceCents: 12_000_000 },
    { description: "Generator pad", alternate: "add", alternateNumber: 2, priceCents: 420_000 },
    { description: "Controls", alternate: "deduct", alternateNumber: 1, priceCents: 150_000 },
  ],
};
const from = { name: "Sam Ortiz", company: "Ortiz Mechanical" };

describe("estimateEmail", () => {
  it("drafts the proposal for a draft estimate, open from today", () => {
    const d = estimateEmail(base, from, "2026-12-01");
    expect(d?.kind).toBe("proposal");
    expect(d?.to).toBe("dana@harbor.example");
    expect(d?.subject).toBe("Proposal EST-0007: Riverside Clinic, mechanical");
    expect(d?.body).toBe(
      [
        "Hello Dana Ruiz,",
        "",
        "We are pleased to submit our proposal EST-0007 for Riverside Clinic, mechanical (Riverside, CA), for the bid due 2026-12-03.",
        "",
        "Base bid: $184,500.00.",
        "Alternates:",
        "- Alternate No. 1 (deduct): Controls, deduct $1,500.00",
        "- Alternate No. 2 (add): Generator pad, add $4,200.00",
        "",
        "The proposal lists what is included and excluded, and is open for acceptance until 2026-12-31.",
        "",
        "If you have a question on our scope or need a breakdown, let me know and I will get it to you right away.",
        "",
        "Thank you,",
        "Sam Ortiz",
        "Ortiz Mechanical",
      ].join("\n"),
    );
  });

  it("leaves out a bid due date already past, and says bid price with no alternates", () => {
    const d = estimateEmail(
      { ...base, bidItems: [base.bidItems[0] as EstimateEmailInput["bidItems"][number]] },
      from,
      "2026-12-04",
    );
    expect(d?.body).toContain(
      "proposal EST-0007 for Riverside Clinic, mechanical (Riverside, CA).",
    );
    expect(d?.body).toContain("Bid price: $184,500.00.");
    expect(d?.body).not.toContain("Alternates");
  });

  it("follows up on a sent estimate with the days since and the open date", () => {
    const d = estimateEmail({ ...base, status: "sent", sentOn: "2026-12-01" }, from, "2026-12-08");
    expect(d?.kind).toBe("follow-up");
    expect(d?.subject).toBe("Following up: proposal EST-0007, Riverside Clinic, mechanical");
    expect(d?.body).toContain(
      "I am following up on our proposal EST-0007 for Riverside Clinic, mechanical (Riverside, CA), sent on 2026-12-01 (7 days ago).",
    );
    expect(d?.body).toContain("It is open for acceptance until 2026-12-31.");
    expect(d?.body).toContain("Could you tell me where the bid stands?");
    expect(d?.body).not.toContain("bid due");
  });

  it("says one day, and none on the day it was sent", () => {
    const one = estimateEmail(
      { ...base, status: "sent", sentOn: "2026-12-01" },
      from,
      "2026-12-02",
    );
    expect(one?.body).toContain("sent on 2026-12-01 (1 day ago).");
    const same = estimateEmail(
      { ...base, status: "sent", sentOn: "2026-12-01" },
      from,
      "2026-12-01",
    );
    expect(same?.body).toContain("sent on 2026-12-01.");
  });

  it("past the open date, offers to confirm or update the pricing", () => {
    const d = estimateEmail({ ...base, status: "sent", sentOn: "2026-10-01" }, from, "2026-11-15");
    expect(d?.body).toContain(
      "It was open for acceptance until 2026-10-31. If the job is going ahead, let me know and I will confirm our pricing or send an updated proposal.",
    );
    // The last day itself is still open.
    const last = estimateEmail(
      { ...base, status: "sent", sentOn: "2026-10-01" },
      from,
      "2026-10-31",
    );
    expect(last?.body).toContain("It is open for acceptance until 2026-10-31.");
  });

  it("greets the estimating team and leaves the recipient blank with no contact", () => {
    const d = estimateEmail(
      { ...base, gcContactName: " ", gcContactEmail: null, location: null },
      { name: "", company: "" },
      "2026-12-01",
    );
    expect(d?.to).toBeNull();
    expect(d?.body.startsWith("Hello Harbor Builders estimating team,\n")).toBe(true);
    expect(d?.body).toContain("for Riverside Clinic, mechanical, for the bid due");
    expect(d?.body.endsWith("Thank you,\n[your name]\n[your company]")).toBe(true);
  });

  it("drafts nothing for a won or lost estimate", () => {
    expect(estimateEmail({ ...base, status: "won" }, from, "2026-12-01")).toBeNull();
    expect(estimateEmail({ ...base, status: "lost" }, from, "2026-12-01")).toBeNull();
  });
});

describe("helpers", () => {
  it("dates the lapse from the date sent, else today, as the PDF does", () => {
    expect(proposalLapsesOn({ sentOn: "2026-02-15", validDays: 14 }, "2026-03-20")).toBe(
      "2026-03-01",
    );
    expect(proposalLapsesOn({ sentOn: null, validDays: 30 }, "2026-12-01")).toBe("2026-12-31");
  });

  it("greets by name when there is one", () => {
    expect(estimateGreeting({ gcName: "Harbor", gcContactName: " Pat " })).toBe("Hello Pat,");
  });

  it("lists alternates in number order", () => {
    expect(alternateLines(base.bidItems)).toEqual([
      "Alternate No. 1 (deduct): Controls, deduct $1,500.00",
      "Alternate No. 2 (add): Generator pad, add $4,200.00",
    ]);
  });
});
