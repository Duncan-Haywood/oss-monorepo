import { describe, expect, it } from "vitest";
import {
  type ChangeOrderEmailCo,
  type ChangeOrderEmailJob,
  changeOrderEmail,
  lastChase,
  lastEmailedText,
  pmAttentionLine,
  pmGreeting,
} from "./change-order-email";
import { mailtoHref } from "./follow-up-email";

const job = (over: Partial<ChangeOrderEmailJob> = {}): ChangeOrderEmailJob => ({
  name: "Riverside Clinic",
  number: "RC-12",
  gcName: "Harbor Builders",
  gcPmName: "Dana Ruiz",
  gcPmEmail: "dana@harbor.example",
  originalContractSumCents: 10_000_000,
  ...over,
});
const co = (over: Partial<ChangeOrderEmailCo> = {}): ChangeOrderEmailCo => ({
  id: "co2",
  number: "2",
  description: "Add two EV chargers in the garage",
  status: "pending",
  submittedOn: null,
  scheduleDays: 3,
  totalCents: 1_250_000,
  ...over,
});
const others: Pick<ChangeOrderEmailCo, "id" | "status" | "totalCents">[] = [
  { id: "co1", status: "approved", totalCents: 500_000 },
  { id: "co3", status: "pending", totalCents: 999_999 }, // pending: never added
  { id: "co4", status: "rejected", totalCents: 777_777 },
];
const from = { name: "Ana Diaz", company: "Volt Electric" };
const TODAY = "2026-11-25";

describe("change order email", () => {
  it("asks the PM to review and sign a request not yet sent, with the figures the job holds", () => {
    const e = changeOrderEmail(job(), co(), [...others, co()], from, TODAY);
    expect(e?.kind).toBe("request");
    expect(e?.to).toBe("dana@harbor.example");
    expect(e?.subject).toBe(
      "Change order request 2: Add two EV chargers in the garage (Riverside Clinic (job RC-12))",
    );
    expect(e?.body).toContain("Hello Dana Ruiz,");
    expect(e?.body).toContain("Price: an add of $12,500.00.");
    expect(e?.body).toContain("an extension of 3 calendar days is requested");
    // $100,000 + the approved $5,000 = $105,000 before; + $12,500 after.
    expect(e?.body).toContain(
      "Contract sum: $105,000.00 before this change order, $117,500.00 after it.",
    );
    expect(e?.body).toContain("return a signed change order");
    expect(e?.body.endsWith("Thank you,\nAna Diaz\nVolt Electric")).toBe(true);
    // Never claims a file is attached: the contractor attaches the PDF.
    expect(e?.body.toLowerCase()).not.toContain("attach");
  });

  it("follows up on a request sent on a recorded date, counting the days", () => {
    const e = changeOrderEmail(job(), co({ submittedOn: "2026-11-04" }), others, from, TODAY);
    expect(e?.kind).toBe("follow-up");
    expect(e?.subject).toBe("Following up: change order request 2, Riverside Clinic (job RC-12)");
    expect(e?.body).toContain("sent on 2026-11-04 (21 days ago)");
    expect(e?.body).toContain("where it stands");
    const sameDay = changeOrderEmail(job(), co({ submittedOn: TODAY }), others, from, TODAY);
    expect(sameDay?.body).toContain(`sent on ${TODAY}, for`);
  });

  it("states deducts, no price change and unstated time plainly", () => {
    const deduct = changeOrderEmail(
      job(),
      co({ totalCents: -40_000, scheduleDays: null }),
      [],
      from,
      TODAY,
    );
    expect(deduct?.body).toContain("Price: a deduct of $400.00.");
    expect(deduct?.body).toContain("Contract time: not stated in this request.");
    expect(deduct?.body).toContain("$100,000.00 before this change order, $99,600.00 after it.");
    const none = changeOrderEmail(job(), co({ totalCents: 0, scheduleDays: 0 }), [], from, TODAY);
    expect(none?.body).toContain("Price: no change in price.");
    expect(none?.body).toContain("Contract sum: $100,000.00, unchanged.");
  });

  it("drafts nothing for an approved or rejected change order", () => {
    expect(changeOrderEmail(job(), co({ status: "approved" }), [], from, TODAY)).toBeNull();
    expect(changeOrderEmail(job(), co({ status: "rejected" }), [], from, TODAY)).toBeNull();
  });

  it("greets the GC's project team and leaves the recipient blank without a PM", () => {
    const e = changeOrderEmail(
      job({ gcPmName: "  ", gcPmEmail: null, number: null }),
      co(),
      [],
      { name: "", company: "" },
      TODAY,
    );
    expect(e?.to).toBeNull();
    expect(e?.body).toContain("Hello Harbor Builders project team,");
    expect(e?.subject).toContain("(Riverside Clinic)");
    expect(e?.body).toContain("[your name]\n[your company]");
    expect(mailtoHref(e as NonNullable<typeof e>).startsWith("mailto:?subject=")).toBe(true);
  });

  it("shortens a long scope in the subject on a word and keeps it whole in the body", () => {
    const long =
      "Relocate the main switchboard to the north wall per RFI 14 and ASI 3, including new feeders\nSecond line";
    const e = changeOrderEmail(job(), co({ description: long }), [], from, TODAY);
    expect(e?.subject).toBe(
      "Change order request 2: Relocate the main switchboard to the north wall per RFI 14... (Riverside Clinic (job RC-12))",
    );
    expect(e?.body).toContain(long);
  });

  it("builds the PDF's Attn line and the greeting from the PM only", () => {
    expect(pmAttentionLine({ gcPmName: " Dana Ruiz ", gcPmEmail: "dana@harbor.example" })).toBe(
      "Attn: Dana Ruiz, dana@harbor.example",
    );
    expect(pmAttentionLine({ gcPmName: null, gcPmEmail: " d@h.example " })).toBe(
      "Attn: d@h.example",
    );
    expect(pmAttentionLine({ gcPmName: "", gcPmEmail: "" })).toBeNull();
    expect(pmGreeting({ gcName: "Harbor", gcPmName: "Dana" })).toBe("Hello Dana,");
  });
});

describe("last chased", () => {
  it("names the last follow-up in a new follow-up only when it came after the date sent", () => {
    const sent = { submittedOn: "2026-11-04" };
    const chased = changeOrderEmail(
      job(),
      co({ ...sent, lastEmailedOn: "2026-11-18" }),
      others,
      from,
      TODAY,
    );
    expect(chased?.body).toContain(
      "sent on 2026-11-04 (21 days ago), and on my follow-up of 2026-11-18, for the following change:",
    );
    // The request itself (on or before the date sent) and today's own draft are not a follow-up.
    for (const lastEmailedOn of ["2026-11-04", "2026-11-01", TODAY, null]) {
      const e = changeOrderEmail(job(), co({ ...sent, lastEmailedOn }), others, from, TODAY);
      expect(e?.body, String(lastEmailedOn)).not.toContain("my follow-up of");
    }
    expect(lastChase({ submittedOn: null, lastEmailedOn: "2026-11-18" }, TODAY)).toBeNull();
  });

  it("reads as a date and an age on the row", () => {
    expect(lastEmailedText(null, TODAY)).toBeNull();
    expect(lastEmailedText(TODAY, TODAY)).toBe("last emailed 2026-11-25 (today)");
    expect(lastEmailedText("2026-11-24", TODAY)).toBe("last emailed 2026-11-24 (yesterday)");
    expect(lastEmailedText("2026-11-15", TODAY)).toBe("last emailed 2026-11-15 (10 days ago)");
  });
});
