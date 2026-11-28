// Follow-up emails (shared/quote-email.ts): the drafted message, the subject that joins the quote
// email's conversation, the footer, and the thread built from the RFQ and the emails already sent.
import { describe, expect, it } from "vitest";
import {
  asMessageId,
  composeFollowUpEmail,
  defaultFollowUpMessage,
  type FollowUpEmailFacts,
  followUpSubject,
  followUpThread,
  MAX_REFERENCES,
} from "./quote-email";

const facts: FollowUpEmailFacts = {
  shopName: "Acme Machine",
  quoteLabel: "Q-1001",
  attachedFileName: "Q-1001.pdf",
  senderName: "Dana Estimator",
  senderEmail: "dana@acme.example",
  sentDay: "2026-11-20",
  validUntil: "2026-12-20",
  signature: "Acme Machine\n555-0100",
};

describe("defaultFollowUpMessage", () => {
  it("greets the contact, names the quote and the day it went, and signs", () => {
    const m = defaultFollowUpMessage({
      customerName: "Sam Lee",
      quoteLabel: "Q-1001",
      sentDay: "2026-11-20",
      senderName: "Dana",
    });
    expect(
      m.startsWith("Hello Sam Lee,\n\nI'm following up on our quote Q-1001, sent on 2026-11-20."),
    ).toBe(true);
    expect(m.endsWith("Best regards,\nDana")).toBe(true);
  });

  it("says 'again' after a first follow-up, and copes with no name or day", () => {
    const m = defaultFollowUpMessage({
      customerName: "  ",
      quoteLabel: "Q-7 Rev 2",
      sentDay: null,
      previous: 1,
    });
    expect(m).toContain("Hello,\n\nI'm checking in again on our quote Q-7 Rev 2. Do you");
    expect(m.endsWith("Best regards,")).toBe(true);
  });
});

describe("followUpSubject", () => {
  it("replies to the last email sent for the quote", () => {
    expect(followUpSubject("Quote Q-1001 from Acme Machine", facts)).toBe(
      "Re: Quote Q-1001 from Acme Machine",
    );
    expect(followUpSubject("Re: RFQ - brackets", facts)).toBe("Re: RFQ - brackets");
  });

  it("names the quote when nothing was emailed from the app", () => {
    expect(followUpSubject(null, facts)).toBe("Following up: Quote Q-1001 from Acme Machine");
    expect(followUpSubject("  ", facts)).toBe("Following up: Quote Q-1001 from Acme Machine");
  });
});

describe("composeFollowUpEmail", () => {
  it("puts the message, the signature, then a footer naming the quote and the attachment", () => {
    const mail = composeFollowUpEmail(facts, null, "Hi Sam,\n\nAny questions?");
    expect(mail.subject).toBe("Following up: Quote Q-1001 from Acme Machine");
    expect(mail.text).toBe(
      [
        "Hi Sam,",
        "",
        "Any questions?",
        "",
        "Acme Machine",
        "555-0100",
        "",
        "--",
        "Following up on quote Q-1001 from Acme Machine, sent 2026-11-20.",
        "Attached again: Q-1001.pdf.",
        "Prices are valid until 2026-12-20.",
        "Reply to this email to reach Dana Estimator (dana@acme.example).",
        "",
      ].join("\n"),
    );
  });

  it("leaves out the attachment line when the PDF is not attached, and escapes the HTML", () => {
    const mail = composeFollowUpEmail(
      { ...facts, attachedFileName: null, sentDay: null, validUntil: null },
      "Quote Q-1001 from Acme Machine",
      "<script>alert(1)</script> & more",
    );
    expect(mail.subject).toBe("Re: Quote Q-1001 from Acme Machine");
    expect(mail.text).not.toContain("Attached");
    expect(mail.text).toContain("Following up on quote Q-1001 from Acme Machine.\n");
    expect(mail.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; more");
    expect(mail.html).not.toContain("<script>");
  });
});

describe("asMessageId", () => {
  it("keeps a bracketed id, brackets a bare one, refuses anything else", () => {
    expect(asMessageId("<a1@mail.example>")).toBe("<a1@mail.example>");
    expect(asMessageId("a1@mail.example")).toBe("<a1@mail.example>");
    expect(asMessageId("fake-email-1")).toBeNull();
    expect(asMessageId("a@b>\r\nBcc: x@evil.example")).toBeNull();
    expect(asMessageId("a b@c")).toBeNull();
    expect(asMessageId(null)).toBeNull();
    expect(asMessageId("")).toBeNull();
  });
});

describe("followUpThread", () => {
  it("chains the RFQ thread, then the emails sent, and replies to the newest", () => {
    const t = followUpThread({ references: "<root@buyer.example> <rfq@buyer.example>" }, [
      "q1@cf.example",
      null,
      "internal-id",
      "<f1@cf.example>",
    ]);
    expect(t).toEqual({
      inReplyTo: "<f1@cf.example>",
      references: "<root@buyer.example> <rfq@buyer.example> <q1@cf.example> <f1@cf.example>",
    });
  });

  it("is null with nothing to reply to, and drops repeats", () => {
    expect(followUpThread(null, [])).toBeNull();
    expect(followUpThread(null, ["nope", null])).toBeNull();
    expect(followUpThread({ references: "<a@x>" }, ["<a@x>"])).toEqual({
      inReplyTo: "<a@x>",
      references: "<a@x>",
    });
  });

  it("keeps the root and the newest ids when the chain is long", () => {
    const ids = Array.from({ length: 40 }, (_, i) => `<m${i}@x.example>`);
    const t = followUpThread(null, ids);
    const refs = t?.references.split(" ") ?? [];
    expect(refs.length).toBeLessThanOrEqual(MAX_REFERENCES);
    expect(refs[0]).toBe("<m0@x.example>");
    expect(refs[refs.length - 1]).toBe("<m39@x.example>");
    expect(t?.inReplyTo).toBe("<m39@x.example>");
  });
});
