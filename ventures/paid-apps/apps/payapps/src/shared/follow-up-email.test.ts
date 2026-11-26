import { describe, expect, it } from "vitest";
import type { OutstandingApp } from "./cash-report";
import {
  type FollowUpJob,
  followUpEmail,
  followUpKind,
  mailtoHref,
  needsFollowUp,
} from "./follow-up-email";

const job = (over: Partial<FollowUpJob> = {}): FollowUpJob => ({
  name: "Harbor Warehouse",
  number: "24-031",
  gcName: "Harbor Builders",
  payTermsDays: 30,
  payTermsBasis: "application_date",
  ...over,
});

const app = (over: Partial<OutstandingApp> = {}): OutstandingApp => ({
  payAppId: "pa_1",
  number: 3,
  applicationDate: "2026-09-25",
  periodTo: "2026-09-30",
  amountCents: 4_275_000,
  expectedCents: 4_275_000,
  receivedCents: 0,
  lastReceivedOn: null,
  status: "submitted",
  ageDays: 40,
  bucket: "31-60",
  dueOn: "2026-10-25",
  daysPastDue: 10,
  ownerPaidOn: null,
  awaitingOwner: false,
  dueByOuterLimit: false,
  ...over,
});

const from = { name: "Dana Ruiz", company: "Ruiz Electric LLC" };

describe("followUpKind", () => {
  it("is a status check before the due date", () => {
    expect(followUpKind(job(), app({ daysPastDue: 0, ageDays: 10 }))).toBe("status");
    expect(needsFollowUp(job(), app({ daysPastDue: 0 }))).toBe(false);
  });
  it("is a reminder once past due, and a second request after 30 days past due", () => {
    expect(followUpKind(job(), app({ daysPastDue: 1 }))).toBe("reminder");
    expect(followUpKind(job(), app({ daysPastDue: 30 }))).toBe("reminder");
    expect(followUpKind(job(), app({ daysPastDue: 31 }))).toBe("second");
  });
  it("asks about the balance whenever something was received", () => {
    expect(followUpKind(job(), app({ receivedCents: 100, daysPastDue: 0 }))).toBe("balance");
    expect(needsFollowUp(job(), app({ receivedCents: 100, daysPastDue: 0 }))).toBe(true);
  });
  it("without pay terms, uses the report's 30-days-old rule", () => {
    const noTerms = job({ payTermsDays: null });
    const a = { dueOn: null, daysPastDue: 0 };
    expect(followUpKind(noTerms, app({ ...a, ageDays: 30 }))).toBe("status");
    expect(followUpKind(noTerms, app({ ...a, ageDays: 31 }))).toBe("reminder");
    expect(followUpKind(noTerms, app({ ...a, ageDays: 61 }))).toBe("second");
  });
});

describe("followUpEmail", () => {
  it("states only the report's figures and signs with the user's name and company", () => {
    const e = followUpEmail(job(), app(), from);
    expect(e.kind).toBe("reminder");
    expect(e.subject).toBe(
      "Past due: Harbor Warehouse (job 24-031), pay application #3, $42,750.00",
    );
    expect(e.body).toContain("Hello Harbor Builders accounts payable,");
    expect(e.body).toContain(
      "pay application #3 on Harbor Warehouse (job 24-031) (dated 2026-09-25, for work through 2026-09-30) for $42,750.00 has not been paid yet.",
    );
    expect(e.body).toContain(
      "Under our subcontract's pay terms (30 days) it was due on 2026-10-25.",
    );
    expect(e.body.trimEnd().endsWith("Thank you,\nDana Ruiz\nRuiz Electric LLC")).toBe(true);
    // Never claims an attachment, a lien right or a legal step.
    expect(e.body).not.toMatch(/attached|lien rights|attorney|legal action|interest/i);
  });

  it("names the period-end basis and a certified application", () => {
    const e = followUpEmail(
      job({ payTermsBasis: "period_end" }),
      app({ status: "certified", dueOn: "2026-10-30", daysPastDue: 40, ageDays: 75 }),
      from,
    );
    expect(e.kind).toBe("second");
    expect(e.subject.startsWith("Second request:")).toBe(true);
    expect(e.body).toContain("(30 days after the period end) it was due on 2026-10-30.");
    expect(e.body).toContain("It has been certified.");
    expect(e.body).toContain("still unpaid 75 days after the application date");
  });

  it("asks what a short payment's balance is held for", () => {
    const e = followUpEmail(
      job(),
      app({
        expectedCents: 4_275_000,
        receivedCents: 4_150_000,
        amountCents: 125_000,
        lastReceivedOn: "2026-10-20",
      }),
      from,
    );
    expect(e.kind).toBe("balance");
    expect(e.subject).toBe(
      "Balance on Harbor Warehouse (job 24-031), pay application #3: $1,250.00",
    );
    expect(e.body).toContain(
      "Thank you for the $41,500.00 received (last on 2026-10-20) against our pay application #3",
    );
    expect(e.body).toContain("The application was for $42,750.00, which leaves $1,250.00 unpaid.");
    expect(e.body).toContain("what the balance is held for");
  });

  it("before the due date, checks it is in for processing; no job number and no terms", () => {
    const e = followUpEmail(
      job({ number: null, payTermsDays: null }),
      app({ dueOn: null, daysPastDue: 0, ageDays: 5 }),
      { name: " ", company: "" },
    );
    expect(e.kind).toBe("status");
    expect(e.subject).toBe("Harbor Warehouse: pay application #3, $42,750.00");
    expect(e.body).toContain("reached you and is in for processing");
    expect(e.body).not.toContain("pay terms");
    expect(e.body).not.toContain("\n\n\n");
    expect(e.body.trimEnd().endsWith("[your name]\n[your company]")).toBe(true);
  });
});

it("mailtoHref encodes the subject and body and leaves the recipient to the user", () => {
  const href = mailtoHref({ subject: "A & B #3", body: "Line 1\nLine 2" });
  expect(href).toBe("mailto:?subject=A%20%26%20B%20%233&body=Line%201%0ALine%202");
});

describe("GC billing contact", () => {
  it("greets the contact by name and addresses the draft to them", () => {
    const e = followUpEmail(
      job({ gcBillingName: " Pat Lee ", gcBillingEmail: " ap@harborbuilders.com " }),
      app(),
      from,
    );
    expect(e.body.startsWith("Hello Pat Lee,\n")).toBe(true);
    expect(e.to).toBe("ap@harborbuilders.com");
    expect(mailtoHref(e)).toMatch(/^mailto:ap@harborbuilders\.com\?subject=Past%20due/);
  });

  it("with only an address, keeps the accounts payable greeting", () => {
    const e = followUpEmail(job({ gcBillingEmail: "ap@harborbuilders.com" }), app(), from);
    expect(e.body.startsWith("Hello Harbor Builders accounts payable,\n")).toBe(true);
    expect(e.to).toBe("ap@harborbuilders.com");
  });

  it("with no contact, leaves the recipient blank", () => {
    const e = followUpEmail(job({ gcBillingName: "  ", gcBillingEmail: null }), app(), from);
    expect(e.to).toBeNull();
    expect(e.body.startsWith("Hello Harbor Builders accounts payable,\n")).toBe(true);
    expect(mailtoHref(e).startsWith("mailto:?subject=")).toBe(true);
  });

  it("encodes an address so it cannot add a recipient or a header", () => {
    const href = mailtoHref({ to: "a@b.com?cc=x@y.com&bcc=z@w.com", subject: "S", body: "B" });
    expect(href).toBe("mailto:a@b.com%3Fcc%3Dx@y.com%26bcc%3Dz@w.com?subject=S&body=B");
    expect(href.split("?").length).toBe(2);
  });
});

describe("pay-when-paid, owner's payment not recorded", () => {
  const wpw = job({ payTermsDays: 7, payTermsBasis: "owner_paid" });
  const waiting = { dueOn: null, daysPastDue: 0, awaitingOwner: true };

  it("is a status check up to 30 days, then asks whether the owner has paid", () => {
    expect(followUpKind(wpw, app({ ...waiting, ageDays: 30 }))).toBe("status");
    expect(needsFollowUp(wpw, app({ ...waiting, ageDays: 30 }))).toBe(false);
    expect(followUpKind(wpw, app({ ...waiting, ageDays: 31 }))).toBe("owner");
    expect(needsFollowUp(wpw, app({ ...waiting, ageDays: 31 }))).toBe(true);
    // A short payment still asks about the balance.
    expect(followUpKind(wpw, app({ ...waiting, ageDays: 90, receivedCents: 100 }))).toBe("balance");
  });

  it("drafts a question about the owner's payment, with no due date and no legal claim", () => {
    const e = followUpEmail(wpw, app({ ...waiting, ageDays: 45 }), from);
    expect(e.kind).toBe("owner");
    expect(e.subject).toBe(
      "Harbor Warehouse (job 24-031): pay application #3, $42,750.00, has the owner paid?",
    );
    expect(e.body).toContain(
      "Our subcontract pays 7 days after the owner pays the GC. Has the owner paid you for this period yet, and if so, on what date?",
    );
    expect(e.body).not.toMatch(/due on|lien right|legal|attached/i);
  });

  it("once the owner's payment is recorded, uses the normal reminder with the due date", () => {
    const e = followUpEmail(
      wpw,
      app({ dueOn: "2026-10-25", daysPastDue: 5, ownerPaidOn: "2026-10-18" }),
      from,
    );
    expect(e.kind).toBe("reminder");
    expect(e.body).toContain(
      "Under our subcontract's pay terms (7 days after the owner pays the GC) it was due on 2026-10-25.",
    );
  });
});

describe("pay-when-paid with an outer limit", () => {
  const capped = job({ payTermsDays: 7, payTermsBasis: "owner_paid", payTermsOuterDays: 90 });
  const unknown = { ownerPaidOn: null, awaitingOwner: false, dueByOuterLimit: true };

  it("asks whether the owner has paid, and names the outer date", () => {
    const a = app({ ...unknown, ageDays: 45, dueOn: "2026-12-24", daysPastDue: 0 });
    expect(followUpKind(capped, a)).toBe("owner");
    const e = followUpEmail(capped, a, from);
    expect(e.body).toContain(
      "Our subcontract pays 7 days after the owner pays the GC, and in any event within 90 days of the application date. Has the owner paid you for this period yet",
    );
    expect(e.body).toContain("Either way, under that outer limit it is due on 2026-12-24.");
    expect(e.body).not.toMatch(/lien right|legal|attached/i);
  });

  it("is a normal reminder once the outer date has passed", () => {
    const a = app({ ...unknown, ageDays: 95, dueOn: "2026-12-24", daysPastDue: 5 });
    const e = followUpEmail(capped, a, from);
    expect(e.kind).toBe("reminder");
    expect(e.body).toContain(
      "Under our subcontract's pay terms (7 days after the owner pays the GC, and in any event within 90 days of the application date) it was due on 2026-12-24.",
    );
  });

  it("a status check up to 30 days", () => {
    const a = app({ ...unknown, ageDays: 20, dueOn: "2026-12-24", daysPastDue: 0 });
    expect(followUpKind(capped, a)).toBe("status");
  });
});
