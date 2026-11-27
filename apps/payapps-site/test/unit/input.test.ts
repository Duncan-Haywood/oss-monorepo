import { CONSENT_VERSION } from "@site/pages";
import { isEmailAddress, parseFrom } from "@worker/email";
import { parseSignup } from "@worker/input";
import { canResend, RESEND_MIN_INTERVAL_MS } from "@worker/signups";
import { hashToken, isTokenShape, newId, randomToken } from "@worker/tokens";
import { describe, expect, it } from "vitest";

const base = { email: "a@b.example", consent: "yes", consentVersion: CONSENT_VERSION };

describe("parseSignup", () => {
  it("normalizes and keeps only known choices", () => {
    const r = parseSignup({
      ...base,
      email: "  A@B.Example ",
      company: " Acme\r\nDrywall ",
      role: "owner",
      jobs: "999",
      tool: "spreadsheet",
      message: "line 1\nline 2\u0007",
    });
    expect(r).toMatchObject({
      ok: true,
      honeypot: false,
      value: {
        email: "a@b.example",
        company: "Acme Drywall",
        role: "owner",
        jobs: null,
        tool: "spreadsheet",
        message: "line 1\nline 2",
        source: "/early-access",
      },
    });
  });

  it("refuses a bad email, missing consent or a stale form", () => {
    expect(parseSignup({ ...base, email: "x@y" })).toMatchObject({ ok: false, field: "email" });
    expect(parseSignup({ ...base, email: "a@b.example\r\nBcc: c@d.example" })).toMatchObject({
      ok: false,
    });
    expect(parseSignup({ ...base, consent: undefined })).toMatchObject({ field: "consent" });
    expect(parseSignup({ ...base, consentVersion: "old" })).toMatchObject({
      field: "consentVersion",
    });
  });

  it("flags the honeypot and caps lengths", () => {
    const r = parseSignup({ ...base, website: "x", company: "c".repeat(500) });
    expect(r.ok && r.honeypot).toBe(true);
    expect(r.ok && r.value.company?.length).toBe(120);
  });
});

describe("email helpers", () => {
  it("parses EMAIL_FROM", () => {
    expect(parseFrom("PayPencil <no-reply@example.org>")).toEqual({
      email: "no-reply@example.org",
      name: "PayPencil",
    });
    expect(parseFrom("no-reply@example.org")).toBe("no-reply@example.org");
    expect(() => parseFrom("nope")).toThrow();
    expect(isEmailAddress("a@b.co")).toBe(true);
  });
});

describe("tokens and throttling", () => {
  it("makes well-formed tokens and purpose-bound hashes", async () => {
    const t = randomToken();
    expect(isTokenShape(t)).toBe(true);
    expect(await hashToken("confirm", t)).not.toBe(await hashToken("remove", t));
    expect(newId("eas")).toMatch(/^eas_[0-9a-z]{20}$/);
  });

  it("allows a resend after 10 minutes, at most 5 a day", () => {
    const now = 1_000_000_000;
    expect(canResend({ confirm_sent_at: null, confirm_send_count: 0 }, now).allowed).toBe(true);
    expect(canResend({ confirm_sent_at: now - 60_000, confirm_send_count: 1 }, now).allowed).toBe(
      false,
    );
    const later = now - RESEND_MIN_INTERVAL_MS;
    expect(canResend({ confirm_sent_at: later, confirm_send_count: 4 }, now).allowed).toBe(true);
    expect(canResend({ confirm_sent_at: later, confirm_send_count: 5 }, now).allowed).toBe(false);
    expect(canResend({ confirm_sent_at: now - 86_400_000, confirm_send_count: 5 }, now)).toEqual({
      allowed: true,
      countInWindow: 0,
    });
  });
});
