// Pure newsletter logic: sequence scheduling, tokens, List-Unsubscribe headers, config gating,
// confirmation resend limits and email rendering.
import { needStatement } from "@client/content/resources/need-statement";
import { NEWSLETTER_UNSUBSCRIBE_PREFIX } from "@shared/newsletter";
import { describe, expect, it } from "vitest";
import {
  notificationUnsubscribeToken,
  verifyNotificationUnsubscribeToken,
} from "../digest/unsubscribe";
import { marketingConfig } from "./config";
import {
  confirmPageUrl,
  listUnsubscribeHeaders,
  newsletterOneClickUrl,
  unsubscribePageUrl,
} from "./headers";
import { renderConfirmEmail, renderSequenceEmail } from "./render";
import {
  dueSequenceStep,
  NURTURE_SEQUENCE,
  NURTURE_STEP_KEYS,
  nextSequenceDue,
  SEQUENCE_MIN_GAP_DAYS,
} from "./sequence";
import {
  CONFIRM_MAX_SENDS_PER_DAY,
  CONFIRM_RESEND_MIN_INTERVAL_MS,
  canResendConfirmation,
} from "./subscribers";
import {
  generateConfirmToken,
  hashConfirmToken,
  isConfirmTokenShape,
  newsletterUnsubscribeToken,
  verifyNewsletterUnsubscribeToken,
} from "./tokens";

const DAY = 86_400_000;
const T0 = new Date("2026-11-24T10:00:00Z");
const at = (days: number) => new Date(T0.getTime() + days * DAY);
const SECRET = "unit-test-secret-unit-test-secret-0123456789";

describe("nurture sequence scheduling", () => {
  const none = new Set<string>();

  it("sends the welcome right after confirming, then each step on its delay", () => {
    expect(dueSequenceStep({ confirmedAt: T0, lastSentAt: null, sentKeys: none }, T0)?.key).toBe(
      "welcome",
    );
    const afterWelcome = { confirmedAt: T0, lastSentAt: T0, sentKeys: new Set(["welcome"]) };
    expect(dueSequenceStep(afterWelcome, at(2.9))).toBeNull();
    expect(dueSequenceStep(afterWelcome, at(3))?.key).toBe("getting-ready");
    expect(nextSequenceDue(afterWelcome)?.dueAt).toEqual(at(3));
  });

  it("goes in order and finishes after the last step", () => {
    const all = new Set<string>(NURTURE_STEP_KEYS);
    expect(nextSequenceDue({ confirmedAt: T0, lastSentAt: at(14), sentKeys: all })).toBeNull();
    // A later step already sent does not skip an earlier unsent one.
    const gap = { confirmedAt: T0, lastSentAt: at(1), sentKeys: new Set(["writing"]) };
    expect(dueSequenceStep(gap, at(30))?.key).toBe("welcome");
  });

  it("spaces out a backlog by the minimum gap (sending switched on late)", () => {
    // Confirmed 60 days ago: every delay has passed, but steps still go out one per gap.
    const old = at(-60);
    let state = { confirmedAt: old, lastSentAt: null as Date | null, sentKeys: new Set<string>() };
    const sentAt: Date[] = [];
    let now = T0;
    for (let i = 0; i < 20 && sentAt.length < NURTURE_SEQUENCE.length; i++) {
      const step = dueSequenceStep(state, now);
      if (step) {
        sentAt.push(now);
        state = { ...state, lastSentAt: now, sentKeys: new Set([...state.sentKeys, step.key]) };
      }
      now = new Date(now.getTime() + DAY / 2);
    }
    expect(sentAt).toHaveLength(NURTURE_SEQUENCE.length);
    for (let i = 1; i < sentAt.length; i++) {
      const gap = (sentAt[i]?.getTime() ?? 0) - (sentAt[i - 1]?.getTime() ?? 0);
      expect(gap).toBeGreaterThanOrEqual(SEQUENCE_MIN_GAP_DAYS * DAY);
    }
  });

  it("has unique keys with increasing delays", () => {
    const keys = NURTURE_SEQUENCE.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    const delays = NURTURE_SEQUENCE.map((s) => s.delayDays);
    expect([...delays].sort((a, b) => a - b)).toEqual(delays);
  });
});

describe("tokens", () => {
  it("confirmation tokens are random, url-safe, and stored only as a hash", async () => {
    const a = generateConfirmToken();
    const b = generateConfirmToken();
    expect(a).not.toBe(b);
    expect(isConfirmTokenShape(a)).toBe(true);
    expect(isConfirmTokenShape(`${a}x`)).toBe(false);
    const h = await hashConfirmToken(a);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(await hashConfirmToken(a));
    expect(h).not.toContain(a);
  });

  it("newsletter unsubscribe tokens verify and reject tampering", async () => {
    const id = "nls_0123456789abcdefghjk";
    const t = await newsletterUnsubscribeToken(SECRET, id);
    expect(t.startsWith(NEWSLETTER_UNSUBSCRIBE_PREFIX)).toBe(true);
    expect(await verifyNewsletterUnsubscribeToken(SECRET, t)).toBe(id);
    expect(await verifyNewsletterUnsubscribeToken(`${SECRET}x`, t)).toBeNull();
    const other = t.replace(id, "nls_0123456789abcdefghjm");
    expect(await verifyNewsletterUnsubscribeToken(SECRET, other)).toBeNull();
    expect(await verifyNewsletterUnsubscribeToken(SECRET, `${t}.extra`)).toBeNull();
    expect(await verifyNewsletterUnsubscribeToken(SECRET, "garbage")).toBeNull();
  });

  it("notification unsubscribe tokens bind org, kind and address without exposing it", async () => {
    const orgId = "org_0123456789abcdefghjk";
    const email = "Team@Example.org";
    const t = await notificationUnsubscribeToken(SECRET, { orgId, kind: "weeklyDigest", email });
    expect(t.toLowerCase()).not.toContain("example");
    const claim = await verifyNotificationUnsubscribeToken(SECRET, t);
    expect(claim).toMatchObject({ orgId, kind: "weeklyDigest" });
    const same = await notificationUnsubscribeToken(SECRET, {
      orgId,
      kind: "weeklyDigest",
      email: " team@example.org ",
    });
    expect(same).toBe(t); // normalized address
    const otherOrg = t.replace(orgId, "org_0123456789abcdefghjm");
    expect(await verifyNotificationUnsubscribeToken(SECRET, otherOrg)).toBeNull();
    const otherKind = t.replace(".w.", ".d.");
    expect(await verifyNotificationUnsubscribeToken(SECRET, otherKind)).toBeNull();
  });
});

describe("List-Unsubscribe headers", () => {
  it("builds RFC 2369 + RFC 8058 headers", () => {
    const url = newsletterOneClickUrl("https://grants.example.org/", "u1.a.b");
    expect(url).toBe("https://grants.example.org/api/newsletter/unsubscribe?token=u1.a.b");
    expect(listUnsubscribeHeaders(url)).toEqual({
      "List-Unsubscribe": "<https://grants.example.org/api/newsletter/unsubscribe?token=u1.a.b>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("refuses non-http(s) or broken URLs", () => {
    expect(listUnsubscribeHeaders("javascript:alert(1)")).toBeNull();
    expect(listUnsubscribeHeaders("/relative")).toBeNull();
  });

  it("page links encode the token", () => {
    expect(unsubscribePageUrl("https://x.test", "a b")).toBe(
      "https://x.test/unsubscribe?token=a%20b",
    );
    expect(confirmPageUrl("https://x.test/", "t")).toBe(
      "https://x.test/newsletter/confirm?token=t",
    );
  });
});

describe("marketingConfig", () => {
  const ok = {
    MARKETING_EMAIL_ENABLED: "true",
    MARKETING_POSTAL_ADDRESS: "PO Box 1, Town, ST 00000",
    AUTH_SECRET: SECRET,
  };
  it("is off by default and lists every blocker", () => {
    expect(marketingConfig({})).toMatchObject({
      sendingEnabled: false,
      blockers: ["disabled", "no_postal_address", "no_token_secret"],
    });
    expect(marketingConfig({ ...ok, MARKETING_EMAIL_ENABLED: "TRUE" }).sendingEnabled).toBe(false);
    expect(marketingConfig({ ...ok, MARKETING_POSTAL_ADDRESS: "   " }).blockers).toEqual([
      "no_postal_address",
    ]);
  });
  it("is on only with the flag, a postal address and a secret", () => {
    expect(marketingConfig(ok)).toMatchObject({ sendingEnabled: true, blockers: [] });
  });
});

describe("confirmation resend limits", () => {
  it("allows the first send, then one per interval, up to the daily cap", () => {
    const now = at(0);
    expect(canResendConfirmation({ confirmSentAt: null, confirmSendCount: 0 }, now).allowed).toBe(
      true,
    );
    const recent = new Date(now.getTime() - CONFIRM_RESEND_MIN_INTERVAL_MS + 1000);
    expect(canResendConfirmation({ confirmSentAt: recent, confirmSendCount: 1 }, now).allowed).toBe(
      false,
    );
    const older = new Date(now.getTime() - CONFIRM_RESEND_MIN_INTERVAL_MS);
    expect(canResendConfirmation({ confirmSentAt: older, confirmSendCount: 1 }, now)).toEqual({
      allowed: true,
      countInWindow: 1,
    });
    expect(
      canResendConfirmation(
        { confirmSentAt: older, confirmSendCount: CONFIRM_MAX_SENDS_PER_DAY },
        now,
      ).allowed,
    ).toBe(false);
    // The window restarts a day after the last send.
    expect(
      canResendConfirmation(
        { confirmSentAt: at(-1), confirmSendCount: CONFIRM_MAX_SENDS_PER_DAY },
        now,
      ),
    ).toEqual({ allowed: true, countInWindow: 0 });
  });
});

describe("rendering", () => {
  const links = {
    unsubscribeUrl: "https://grants.example.org/unsubscribe?token=u1.x.y",
    postalAddress: "Example Co <PO Box 1>, Town",
  };

  it("every sequence email has the unsubscribe link and the postal address (escaped)", () => {
    for (const key of NURTURE_STEP_KEYS) {
      const m = renderSequenceEmail(key, "https://grants.example.org", links);
      expect(m.subject.length).toBeGreaterThan(5);
      expect(m.text).toContain(`Unsubscribe: ${links.unsubscribeUrl}`);
      expect(m.text).toContain(links.postalAddress);
      expect(m.html).toContain("Example Co &lt;PO Box 1&gt;, Town");
      expect(m.html).toContain(">Unsubscribe</a>");
      expect(`${m.text}${m.html}`).not.toMatch(/undefined|null|NaN/);
    }
  });

  it("links guides by their real slug and title", () => {
    const m = renderSequenceEmail("getting-ready", "https://grants.example.org", links);
    expect(m.text).toContain(needStatement.title);
    expect(m.text).toContain(`https://grants.example.org/resources/${needStatement.slug}`);
    const last = renderSequenceEmail("how-it-works", "https://grants.example.org", links);
    for (const p of ["/how-it-works", "/demo", "/trust"]) {
      expect(last.text).toContain(`https://grants.example.org${p}`);
    }
  });

  it("the confirmation email carries the confirm link and no unsubscribe/marketing content", () => {
    const url = confirmPageUrl("https://grants.example.org", "tok");
    const m = renderConfirmEmail("https://grants.example.org", url);
    expect(m.text).toContain(url);
    expect(m.text).toContain("expires in 7 days");
    expect(m.text).not.toContain("Unsubscribe:");
  });
});
