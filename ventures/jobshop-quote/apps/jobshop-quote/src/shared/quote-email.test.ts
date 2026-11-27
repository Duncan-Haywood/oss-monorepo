import { describe, expect, it } from "vitest";
import {
  cleanSignature,
  composeQuoteEmail,
  composeSenderCopy,
  defaultQuoteEmailMessage,
  isEmailable,
  isSafeMessageId,
  limitReferences,
  MAX_EMAIL_CHANGE_LINES,
  MAX_REFERENCES,
  MAX_REFERENCES_CHARS,
  messageIdsIn,
  oneLine,
  parseRecipients,
  type QuoteEmailFacts,
  quoteEmailChangeLines,
  quoteEmailThread,
  replySubject,
  threadChain,
} from "./quote-email";

const facts: QuoteEmailFacts = {
  shopName: "Acme Machine",
  quoteLabel: "Q-1001 Rev 2",
  fileName: "Q-1001-R2.pdf",
  senderName: "Dana Estimator",
  senderEmail: "dana@acme.example",
  validUntil: "2026-12-24",
  replacesLabel: "Q-1001",
};

describe("parseRecipients", () => {
  it("splits on commas, semicolons and new lines, dropping duplicates by case", () => {
    expect(parseRecipients("buyer@x.example, Eng@x.example;\neng@X.example")).toEqual({
      ok: true,
      to: ["buyer@x.example", "Eng@x.example"],
    });
    expect(parseRecipients(["a@x.example", " b@x.example "])).toEqual({
      ok: true,
      to: ["a@x.example", "b@x.example"],
    });
  });

  it("refuses an empty list, a non-address, a display-name form and more than five", () => {
    expect(parseRecipients("  ")).toMatchObject({ ok: false });
    expect(parseRecipients("buyer at x")).toMatchObject({ ok: false });
    expect(parseRecipients('"Bob" <bob@x.example>')).toMatchObject({ ok: false });
    expect(parseRecipients("a@x.example\r\nBcc:c@x.example")).toMatchObject({ ok: false });
    const six = Array.from({ length: 6 }, (_, i) => `p${i}@x.example`).join(",");
    expect(parseRecipients(six)).toEqual({
      ok: false,
      error: "Send to at most 5 addresses at once",
    });
  });
});

describe("composeQuoteEmail", () => {
  it("puts the message first, then a footer naming the PDF, the revision, validity and reply-to", () => {
    const m = composeQuoteEmail(facts, "Hi Sam,\r\n\r\nQuote attached.\r\nThanks");
    expect(m.subject).toBe("Quote Q-1001 Rev 2 from Acme Machine");
    expect(m.text).toBe(
      [
        "Hi Sam,",
        "",
        "Quote attached.",
        "Thanks",
        "",
        "--",
        "Attached: Q-1001-R2.pdf, quote Q-1001 Rev 2 from Acme Machine.",
        "This revision replaces Q-1001.",
        "Prices are valid until 2026-12-24.",
        "Reply to this email to reach Dana Estimator (dana@acme.example).",
        "",
      ].join("\n"),
    );
    expect(m.html).toContain("<p>Hi Sam,</p>");
    expect(m.html).toContain("<p>Quote attached.<br>Thanks</p>");
  });

  it("escapes every character of the message in the HTML", () => {
    const m = composeQuoteEmail(facts, '<script>alert("x")</script> & <a href="http://evil">x</a>');
    expect(m.html).not.toContain("<script>");
    expect(m.html).not.toContain("<a href");
    expect(m.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp;");
  });

  it("keeps the subject on one line whatever the shop name holds", () => {
    const m = composeQuoteEmail({ ...facts, shopName: "Acme\r\nBcc: x@evil.example" }, "");
    expect(m.subject).toBe("Quote Q-1001 Rev 2 from Acme Bcc: x@evil.example");
    expect(m.text.startsWith("--\n")).toBe(true);
  });

  it("leaves out the revision and validity lines when they do not apply", () => {
    const m = composeQuoteEmail({ ...facts, replacesLabel: null, validUntil: null }, "x");
    expect(m.text).not.toContain("replaces");
    expect(m.text).not.toContain("valid until");
  });
});

describe("defaults", () => {
  it("starts from the cover note, else a short note signed by the estimator", () => {
    expect(defaultQuoteEmailMessage("  Dear Sam  ", "Sam", "Q-1001", "Dana")).toBe("Dear Sam");
    expect(defaultQuoteEmailMessage(null, "Sam", "Q-1001", "Dana")).toBe(
      "Hello Sam,\n\nThank you for the RFQ. Our quote Q-1001 is attached.\n\nBest regards,\nDana",
    );
    expect(defaultQuoteEmailMessage("", null, "Q-1001")).toBe(
      "Hello,\n\nThank you for the RFQ. Our quote Q-1001 is attached.\n\nBest regards,",
    );
  });

  it("emails only open, sent quotes", () => {
    expect(["draft", "sent", "won", "lost", "expired", "superseded"].filter(isEmailable)).toEqual([
      "sent",
    ]);
  });

  it("flattens control characters", () => {
    expect(oneLine("a\r\n\tb c")).toBe("a b c");
  });
});

describe("shop signature", () => {
  const sig = "Acme Machine LLC\r\n12 Mill Rd, Dayton OH  \n\n\nAS9100D | ITAR registered\n";

  it("cleans line endings, trailing spaces and blank lines; blank is none", () => {
    expect(cleanSignature(sig)).toBe(
      "Acme Machine LLC\n12 Mill Rd, Dayton OH\nAS9100D | ITAR registered",
    );
    expect(cleanSignature("  \n \n")).toBeNull();
    expect(cleanSignature(null)).toBeNull();
    expect(cleanSignature("x".repeat(5000))?.length).toBe(1000);
  });

  it("sits between the message and the footer, escaped in the HTML", () => {
    const m = composeQuoteEmail({ ...facts, signature: `${sig}<script>` }, "Hi Bob,\n\nAttached.");
    expect(m.text).toBe(
      "Hi Bob,\n\nAttached.\n\nAcme Machine LLC\n12 Mill Rd, Dayton OH\nAS9100D | ITAR registered\n<script>\n\n--\n" +
        "Attached: Q-1001-R2.pdf, quote Q-1001 Rev 2 from Acme Machine.\nThis revision replaces Q-1001.\n" +
        "Prices are valid until 2026-12-24.\nReply to this email to reach Dana Estimator (dana@acme.example).\n",
    );
    expect(m.html).toContain(
      "Acme Machine LLC<br>12 Mill Rd, Dayton OH<br>AS9100D | ITAR registered<br>&lt;script&gt;",
    );
    expect(m.html).not.toContain("<script>");
    expect(m.html.indexOf("Attached.")).toBeLessThan(m.html.indexOf("Acme Machine LLC"));
  });

  it("leaves the email as before when there is none", () => {
    expect(composeQuoteEmail({ ...facts, signature: " " }, "Hi")).toEqual(
      composeQuoteEmail(facts, "Hi"),
    );
  });
});

describe("changes from the replaced revision", () => {
  const changes = {
    fromLabel: "Q-1001",
    items: [
      "BRK-1001 Rev B, qty 10: $12.00 to $11.50 each",
      "BRK-1001 Rev B, qty 50: no longer quoted",
    ],
  };

  it("lists the PDF's lines under the message, above the signature and footer", () => {
    const m = composeQuoteEmail({ ...facts, changes, signature: "Acme Machine" }, "Hi Sam");
    expect(m.text).toBe(
      [
        "Hi Sam",
        "",
        "Changes from Q-1001:",
        "- BRK-1001 Rev B, qty 10: $12.00 to $11.50 each",
        "- BRK-1001 Rev B, qty 50: no longer quoted",
        "",
        "Acme Machine",
        "",
        "--",
        "Attached: Q-1001-R2.pdf, quote Q-1001 Rev 2 from Acme Machine.",
        "This revision replaces Q-1001.",
        "Prices are valid until 2026-12-24.",
        "Reply to this email to reach Dana Estimator (dana@acme.example).",
        "",
      ].join("\n"),
    );
    expect(m.html).toContain("<strong>Changes from Q-1001:</strong>");
    expect(m.html).toContain("<li>BRK-1001 Rev B, qty 50: no longer quoted</li>");
    expect(m.html.indexOf("Hi Sam")).toBeLessThan(m.html.indexOf("Changes from"));
    expect(m.html.indexOf("Changes from")).toBeLessThan(m.html.indexOf("Acme Machine<"));
  });

  it("prints nothing when the PDF carries no section", () => {
    const plain = composeQuoteEmail(facts, "Hi");
    expect(composeQuoteEmail({ ...facts, changes: null }, "Hi")).toEqual(plain);
    expect(
      composeQuoteEmail({ ...facts, changes: { fromLabel: "Q-1001", items: [] } }, "Hi"),
    ).toEqual(plain);
  });

  it("escapes item text in HTML and keeps each item on one line", () => {
    const m = composeQuoteEmail(
      { ...facts, changes: { fromLabel: "Q-1\r\n001", items: ["<b>x</b>\r\nBcc: y"] } },
      "Hi",
    );
    expect(m.html).toContain("<li>&lt;b&gt;x&lt;/b&gt; Bcc: y</li>");
    expect(m.text).toContain("Changes from Q-1 001:\n- <b>x</b> Bcc: y\n");
  });

  it("caps the list and points to the PDF for the rest", () => {
    const items = Array.from({ length: MAX_EMAIL_CHANGE_LINES + 3 }, (_, i) => `P-${i}: added`);
    const lines = quoteEmailChangeLines({ fromLabel: "Q-1001", items });
    expect(lines).toHaveLength(MAX_EMAIL_CHANGE_LINES + 2);
    expect(lines.at(-1)).toBe("- and 3 more, listed in the attached PDF");
  });
});

describe("composeSenderCopy", () => {
  it("says who the original went to, in the subject, text and HTML, with $ kept literally", () => {
    const m = composeQuoteEmail(facts, "Hi Bob");
    const c = composeSenderCopy(m, ["buyer@x.example", "a$&b@x.example"]);
    expect(c.subject).toBe("Copy: Quote Q-1001 Rev 2 from Acme Machine");
    expect(
      c.text.startsWith(
        "Your copy: this quote email was sent to buyer@x.example, a$&b@x.example.\n\nHi Bob",
      ),
    ).toBe(true);
    expect(c.html).toContain("sent to buyer@x.example, a$&amp;b@x.example.</p>");
    expect(c.html.indexOf("Your copy")).toBeLessThan(c.html.indexOf("Hi Bob"));
  });
});

describe("threading a quote into its RFQ email", () => {
  const rfq = {
    source: "email" as const,
    messageId: "<CAB1x2y3@mail.example-robotics.test>",
    threadReferences: null,
    subject: "RFQ - brackets and spacers",
    fromAddress: "Dana.Ortiz@example-robotics.test",
  };

  it("replies to the RFQ email when it goes back to the address that sent it", () => {
    expect(quoteEmailThread(rfq, ["buyer@x.test", "dana.ortiz@example-robotics.test"])).toEqual({
      inReplyTo: "<CAB1x2y3@mail.example-robotics.test>",
      references: "<CAB1x2y3@mail.example-robotics.test>",
      subject: "Re: RFQ - brackets and spacers",
    });
  });

  it("does not thread a pasted RFQ, a forwarded one, or one without a usable Message-ID", () => {
    expect(quoteEmailThread(null, ["dana.ortiz@example-robotics.test"])).toBeNull();
    expect(
      quoteEmailThread({ ...rfq, source: "manual" }, ["dana.ortiz@example-robotics.test"]),
    ).toBeNull();
    // Forwarded in by the estimator: the customer never saw that message.
    expect(quoteEmailThread(rfq, ["buyer@x.test"])).toBeNull();
    expect(quoteEmailThread({ ...rfq, fromAddress: null }, ["buyer@x.test"])).toBeNull();
    for (const messageId of [
      null,
      "",
      "CAB1@x.test",
      "<no-at-sign>",
      "<a@b>\r\nBcc: x@y.test",
      "<a b@c.test>",
      '<a"b@c.test>',
      "<a@b.test><c@d.test>",
      `<${"a".repeat(250)}@b.test>`,
      "<caf\u00e9@b.test>",
    ]) {
      expect(isSafeMessageId(messageId)).toBe(false);
      expect(
        quoteEmailThread({ ...rfq, messageId }, ["dana.ortiz@example-robotics.test"]),
      ).toBeNull();
    }
  });

  it("keeps the quote's own subject when the RFQ email had none", () => {
    for (const subject of [null, "", " \r\n "]) {
      expect(
        quoteEmailThread({ ...rfq, subject }, ["dana.ortiz@example-robotics.test"])?.subject,
      ).toBeNull();
    }
  });

  it("adds Re: once and flattens the subject to one line", () => {
    expect(replySubject("RE: brackets")).toBe("RE: brackets");
    expect(replySubject("re : brackets")).toBe("re : brackets");
    expect(replySubject("Brackets\r\nBcc: x@y.test")).toBe("Re: Brackets Bcc: x@y.test");
    expect(replySubject("Fwd: brackets")).toBe("Re: Fwd: brackets");
  });
});

describe("keeping the RFQ email's own thread (RFC 5322 § 3.6.4)", () => {
  const rfq = {
    source: "email" as const,
    messageId: "<rfq3@mail.example-robotics.test>",
    threadReferences: "<root@shop.test> <rfq2@mail.example-robotics.test>",
    subject: "Re: brackets, revised",
    fromAddress: "dana.ortiz@example-robotics.test",
  };

  it("sends the RFQ's References followed by its Message-ID", () => {
    expect(quoteEmailThread(rfq, ["dana.ortiz@example-robotics.test"])).toEqual({
      inReplyTo: "<rfq3@mail.example-robotics.test>",
      references:
        "<root@shop.test> <rfq2@mail.example-robotics.test> <rfq3@mail.example-robotics.test>",
      subject: "Re: brackets, revised",
    });
  });

  it("drops unsafe ids from a stored chain and never repeats the Message-ID", () => {
    const thread = quoteEmailThread(
      {
        ...rfq,
        threadReferences:
          '<a@b.test>\r\nBcc: x@evil.test <a"b@c.test> <rfq3@mail.example-robotics.test>',
      },
      ["dana.ortiz@example-robotics.test"],
    );
    expect(thread?.references).toBe("<a@b.test> <rfq3@mail.example-robotics.test>");
  });

  it("builds the chain from References, else from a lone In-Reply-To", () => {
    expect(threadChain("<a@x.test>\r\n <b@x.test> (comment) <a@x.test>", "<b@x.test>")).toBe(
      "<a@x.test> <b@x.test>",
    );
    expect(threadChain(null, "<p@x.test>")).toBe("<p@x.test>");
    expect(threadChain("", "<p@x.test> (Dana's message)")).toBe("<p@x.test>");
    // Two parents in In-Reply-To: no single parent to follow.
    expect(threadChain(null, "<p@x.test> <q@x.test>")).toBeNull();
    expect(threadChain(null, null)).toBeNull();
    expect(threadChain("not an id", "also not")).toBeNull();
    expect(messageIdsIn("<ok@x.test><no-at> <caf\u00e9@x.test>")).toEqual(["<ok@x.test>"]);
  });

  it("keeps the root and the newest ids when the chain is too long", () => {
    const ids = Array.from({ length: 40 }, (_, i) => `<m${i}@x.test>`);
    const cut = limitReferences(ids);
    expect(cut).toHaveLength(MAX_REFERENCES);
    expect(cut[0]).toBe("<m0@x.test>");
    expect(cut.at(-1)).toBe("<m39@x.test>");
    expect(cut[1]).toBe(`<m${40 - MAX_REFERENCES + 1}@x.test>`);

    const long = Array.from({ length: 8 }, (_, i) => `<${String(i).repeat(200)}@x.test>`);
    const byChars = limitReferences(long);
    expect(byChars.join(" ").length).toBeLessThanOrEqual(MAX_REFERENCES_CHARS);
    expect(byChars[0]).toBe(long[0]);
    expect(byChars.at(-1)).toBe(long.at(-1));
    expect(limitReferences([])).toEqual([]);
    expect(limitReferences(ids.slice(0, 3))).toEqual(ids.slice(0, 3));
  });
});
