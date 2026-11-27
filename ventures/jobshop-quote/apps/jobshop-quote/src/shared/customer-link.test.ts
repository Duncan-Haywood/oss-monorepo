import { describe, expect, it } from "vitest";
import {
  acceptLinkLine,
  customerResponseSchema,
  declinedReason,
  priceAcceptance,
} from "./customer-link";
import { composeQuoteEmail, quoteEmailFooter } from "./quote-email";

const lines = [
  {
    id: "a",
    partNumber: "BRK-1",
    breaks: [
      { quantity: 10, unitPriceCents: 5_000, totalCents: 50_000 },
      { quantity: 50, unitPriceCents: 3_000, totalCents: 150_000 },
    ],
  },
  {
    id: "b",
    partNumber: "PLT-2",
    breaks: [{ quantity: 5, unitPriceCents: 12_345, totalCents: 61_725 }],
  },
];

describe("priceAcceptance", () => {
  it("prices the chosen breaks from the quote's own numbers, in line order", () => {
    const r = priceAcceptance(lines, [
      { lineId: "b", quantity: 5 },
      { lineId: "a", quantity: 50 },
    ]);
    expect(r).toEqual({
      ok: true,
      amountCents: 211_725,
      choices: [
        {
          lineId: "a",
          partNumber: "BRK-1",
          quantity: 50,
          unitPriceCents: 3_000,
          totalCents: 150_000,
        },
        {
          lineId: "b",
          partNumber: "PLT-2",
          quantity: 5,
          unitPriceCents: 12_345,
          totalCents: 61_725,
        },
      ],
    });
  });

  it("orders some parts and not others", () => {
    const r = priceAcceptance(lines, [{ lineId: "a", quantity: 10 }]);
    expect(r.ok && r.amountCents).toBe(50_000);
    expect(r.ok && r.choices.map((c) => c.lineId)).toEqual(["a"]);
  });

  it("refuses a quantity the quote does not carry, a stranger line, a repeat and nothing", () => {
    expect(priceAcceptance(lines, [{ lineId: "a", quantity: 20 }])).toMatchObject({
      ok: false,
      error: expect.stringContaining("not quoted at a quantity of 20"),
    });
    expect(priceAcceptance(lines, [{ lineId: "zzz", quantity: 10 }]).ok).toBe(false);
    expect(
      priceAcceptance(lines, [
        { lineId: "a", quantity: 10 },
        { lineId: "a", quantity: 50 },
      ]),
    ).toMatchObject({ ok: false, error: "BRK-1 is picked twice" });
    expect(priceAcceptance(lines, []).ok).toBe(false);
  });

  it("refuses an unpriced line", () => {
    expect(
      priceAcceptance([{ id: "x", partNumber: "X", breaks: null }], [{ lineId: "x", quantity: 1 }])
        .ok,
    ).toBe(false);
  });
});

describe("customerResponseSchema", () => {
  it("trims, turns blanks into null and checks the email", () => {
    const ok = customerResponseSchema.parse({
      decision: "accept",
      name: "  Sam Buyer ",
      email: "",
      poNumber: " 4471 ",
      choices: [{ lineId: "a", quantity: 10 }],
    });
    expect(ok).toMatchObject({ name: "Sam Buyer", email: null, poNumber: "4471", note: null });
    expect(
      customerResponseSchema.safeParse({
        decision: "decline",
        name: "Sam",
        email: "not-an-address",
      }).success,
    ).toBe(false);
    expect(customerResponseSchema.safeParse({ decision: "decline", name: " " }).success).toBe(
      false,
    );
    expect(
      customerResponseSchema.safeParse({ decision: "accept", name: "Sam", choices: [] }).success,
    ).toBe(false);
  });
});

describe("declinedReason", () => {
  it("prefixes the customer's reason so the win/loss report shows where it came from", () => {
    expect(declinedReason(null)).toBe("Declined online");
    expect(declinedReason("  lead\n time too long ")).toBe("Declined online: lead time too long");
    expect(declinedReason("x".repeat(900))).toHaveLength(500);
  });
});

describe("the quote email with a customer link", () => {
  const facts = {
    shopName: "Acme Machine",
    quoteLabel: "Q-1001",
    fileName: "Q-1001.pdf",
    senderName: "Pat",
    senderEmail: "pat@acme.example",
    validUntil: "2026-12-31",
    replacesLabel: null,
  };
  const url = "https://quote.example/q/abc_DEF-123";

  it("adds the accept line to the footer, and a link in the HTML", () => {
    expect(quoteEmailFooter(facts)).not.toContain(acceptLinkLine(url));
    expect(quoteEmailFooter({ ...facts, acceptUrl: url })).toContain(acceptLinkLine(url));
    const mail = composeQuoteEmail({ ...facts, acceptUrl: url }, "Hi");
    expect(mail.text).toContain(`Accept or decline this quote online: ${url}`);
    expect(mail.html).toContain(`<a href="${url}">${url}</a>`);
  });

  it("escapes the URL in the HTML", () => {
    const odd = 'https://quote.example/q/"><script>';
    const mail = composeQuoteEmail({ ...facts, acceptUrl: odd }, "Hi");
    expect(mail.html).not.toContain("<script>");
  });
});
