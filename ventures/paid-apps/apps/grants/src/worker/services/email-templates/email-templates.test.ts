import { describe, expect, it } from "vitest";
import { cleanSubject, escapeHtml, formatDate, formatMoney, safeHref } from "./format";
import {
  EMAIL_TEMPLATE_NAMES,
  type EmailTemplateData,
  type EmailTemplateName,
  OPERATOR_NAME,
  PRODUCT_NAME,
  renderEmail,
} from "./index";

const APP = "https://app.example.test";
const XSS = `<script>alert("x")</script> & <img src=x onerror=alert(1)>`;
const DEADLINE = new Date("2026-12-15T00:00:00Z");

/** Every field filled in. */
const FULL: { [K in EmailTemplateName]: EmailTemplateData[K] } = {
  invitation: {
    orgName: "Riverside Youth Alliance",
    inviterName: "Pat Doe",
    role: "editor",
    email: "sam@example.org",
    invitationId: "inv_123",
    expiresInDays: 7,
  },
  verifyEmail: { name: "Sam", email: "sam@example.org", token: "tok/+=1", expiresInHours: 24 },
  passwordReset: { name: "Sam", email: "sam@example.org", token: "rst_1", expiresInMinutes: 60 },
  existingAccount: { name: "Sam", email: "sam@example.org" },
  exportReady: {
    orgId: "org_1",
    orgName: "Riverside Youth Alliance",
    requestedByName: "Pat Doe",
    expiresAt: DEADLINE,
  },
  orgDeletionScheduled: {
    orgId: "org_1",
    orgName: "Riverside Youth Alliance",
    deletionAt: DEADLINE,
    requestedByName: "Pat Doe",
    canCancel: true,
  },
  paymentFailed: {
    orgId: "org_1",
    orgName: "Riverside Youth Alliance",
    planName: "Team",
    amountCents: 4900,
    nextRetryAt: "2026-11-22T00:00:00Z",
    accessEndsAt: DEADLINE,
  },
  subscriptionChanged: {
    orgId: "org_1",
    orgName: "Riverside Youth Alliance",
    change: "upgraded",
    previousPlan: "Starter",
    newPlan: "Team",
    effectiveAt: DEADLINE,
  },
  applicationReadyForReview: {
    orgId: "org_1",
    orgName: "Riverside Youth Alliance",
    applicationId: "app_1",
    applicationTitle: "Trades Academy Expansion",
    funderName: "Example Foundation",
    tier: "full_review",
    blockers: 2,
    warnings: 1,
    deadline: DEADLINE,
  },
  needsInfo: {
    orgId: "org_1",
    orgName: "Riverside Youth Alliance",
    applicationId: "app_1",
    applicationTitle: "Trades Academy Expansion",
    questions: ["How many students graduated in 2025?", "What is the program budget?"],
    interviewId: "int_1",
  },
  submissionSent: {
    orgId: "org_1",
    orgName: "Riverside Youth Alliance",
    applicationId: "app_1",
    applicationTitle: "Trades Academy Expansion",
    funderName: "Example Foundation",
    channel: "email",
    recipient: "grants@example.org",
    externalRef: "GRANT12345678",
    packageSha256: "a".repeat(64),
    statusCheckInDays: 30,
  },
  funderSubmission: {
    funderName: "Example Foundation",
    opportunityTitle: "Workforce Pathways",
    opportunityNumber: "EF-2026-01",
    applicant: {
      legalName: "Riverside Youth Alliance, Inc.",
      dba: "RYA",
      ein: "85-0000000",
      uei: "UEI123",
      address: "1 Main St, Springfield, IL 62701, US",
      websiteUrl: "https://rya.example.org",
      contact: { name: "Pat Doe", email: "pat@rya.example.org", phone: "555-0100" },
    },
    requestedAmountCents: 2_500_000,
    executiveSummary: "We train young adults for skilled trades.\nSecond line.",
    attachments: [
      { filename: "rya-application-sub_1.md", description: "The complete application." },
    ],
    reference: { submissionId: "sub_1", packageSha256: "b".repeat(64) },
  },
  manualSubmissionInstructions: {
    orgId: "org_1",
    orgName: "Riverside Youth Alliance",
    applicationId: "app_1",
    applicationTitle: "Trades Academy Expansion",
    funderName: "Example Foundation",
    guide: {
      title: "Submit on Example Foundation's portal",
      url: "https://portal.example.org/apply",
      steps: ["Open the portal.", "Paste each section.", "Submit."],
      notes: ["At least one section is over the funder's length limit."],
    },
    deadline: DEADLINE,
  },
  followupDue: {
    orgId: "org_1",
    orgName: "Riverside Youth Alliance",
    title: "Check status with Example Foundation",
    applicationTitle: "Trades Academy Expansion",
    dueAt: DEADLINE,
    notes: "Call the program officer.",
  },
  deadlineReminder: {
    orgId: "org_1",
    orgName: "Riverside Youth Alliance",
    applicationId: "app_1",
    applicationTitle: "Trades Academy Expansion",
    funderName: "Example Foundation",
    deadline: DEADLINE,
    daysLeft: 3,
  },
  weeklyDigest: {
    orgId: "org_1",
    orgName: "Riverside Youth Alliance",
    weekOf: "2026-11-16T00:00:00Z",
    newMatches: Array.from({ length: 7 }, (_, i) => ({
      opportunityId: `opp_${i}`,
      title: `Opportunity ${i}`,
      funderName: "Example Foundation",
      deadline: DEADLINE,
    })),
    closingSoon: [
      { title: "Trades Academy Expansion", deadline: DEADLINE, applicationId: "app_1" },
    ],
    pendingReviews: [{ applicationId: "app_2", title: "Literacy", tier: "one_click", blockers: 1 }],
    needsInfo: [{ title: "Food bank", interviewId: "int_2", questions: 3 }],
    awarded: [
      { applicationId: "app_3", title: "STEM", funderName: "Acme", amountCents: 1_000_000 },
    ],
  },
};

/** Only required fields; optional ones omitted. */
const MINIMAL: { [K in EmailTemplateName]: EmailTemplateData[K] } = {
  invitation: { orgName: "Org", role: "viewer", email: "a@example.org", invitationId: "inv_1" },
  verifyEmail: { email: "a@example.org", token: "t" },
  passwordReset: { email: "a@example.org", token: "t" },
  existingAccount: { email: "a@example.org" },
  exportReady: { orgId: "org_1", orgName: "Org" },
  orgDeletionScheduled: { orgId: "org_1", orgName: "Org", deletionAt: DEADLINE },
  paymentFailed: { orgId: "org_1", orgName: "Org" },
  subscriptionChanged: { orgId: "org_1", orgName: "Org", change: "canceled" },
  applicationReadyForReview: {
    orgId: "org_1",
    applicationId: "app_1",
    applicationTitle: "App",
    tier: "one_click",
    blockers: 0,
    warnings: 0,
  },
  needsInfo: { orgId: "org_1", questions: [] },
  submissionSent: {
    orgId: "org_1",
    applicationId: "app_1",
    applicationTitle: "App",
    funderName: "Funder",
    channel: "manual",
    packageSha256: "c".repeat(64),
  },
  funderSubmission: {
    funderName: "Funder",
    opportunityTitle: "Opp",
    applicant: { legalName: "Org", contact: {} },
    attachments: [],
    reference: { submissionId: "sub_1", packageSha256: "d".repeat(64) },
  },
  manualSubmissionInstructions: {
    orgId: "org_1",
    applicationId: "app_1",
    applicationTitle: "App",
    funderName: "Funder",
    guide: { title: "", steps: [] },
  },
  followupDue: { orgId: "org_1", title: "Follow up", dueAt: DEADLINE },
  deadlineReminder: {
    orgId: "org_1",
    applicationId: "app_1",
    applicationTitle: "App",
    deadline: DEADLINE,
    daysLeft: 0,
  },
  weeklyDigest: {
    orgId: "org_1",
    orgName: "Org",
    newMatches: [],
    closingSoon: [],
    pendingReviews: [],
    needsInfo: [],
    awarded: [],
  },
};

const render = <K extends EmailTemplateName>(name: K, data: EmailTemplateData[K]) =>
  renderEmail(name, data, { appUrl: `${APP}/` });

const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1] ?? "");

describe("format helpers", () => {
  it("escapes HTML special characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
    );
  });

  it("strips CR/LF and control characters from subjects", () => {
    expect(cleanSubject("Hello\r\nBcc: evil@example.test\n\tworld")).toBe(
      "Hello Bcc: evil@example.test world",
    );
    expect(cleanSubject("x".repeat(500)).length).toBeLessThanOrEqual(200);
  });

  it("only links http(s)/mailto URLs", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,hi")).toBeNull();
    expect(safeHref("not a url")).toBeNull();
    expect(safeHref("https://example.org/a b")).toBe("https://example.org/a%20b");
  });

  it("formats dates and money, null for missing values", () => {
    expect(formatDate(DEADLINE)).toBe("December 15, 2026");
    expect(formatDate("nope")).toBeNull();
    expect(formatDate(null)).toBeNull();
    expect(formatMoney(2_500_000)).toBe("$25,000");
    expect(formatMoney(1050)).toBe("$10.50");
    expect(formatMoney(null)).toBeNull();
  });
});

describe("renderEmail: every template", () => {
  for (const name of EMAIL_TEMPLATE_NAMES) {
    for (const [variant, data] of [
      ["full", FULL[name]],
      ["minimal", MINIMAL[name]],
    ] as const) {
      it(`${name} (${variant}) renders subject, text and html with the standard footer`, () => {
        const msg = renderEmail(name, data as never, { appUrl: `${APP}/` });
        expect(msg.subject.trim().length).toBeGreaterThan(0);
        expect(msg.subject).not.toMatch(/[\r\n]/);
        expect(msg.text.trim().length).toBeGreaterThan(0);
        expect(msg.html).toContain("<!DOCTYPE html>");
        expect(msg.html).toContain('lang="en"');
        expect(msg.html).toContain("max-width:600px");

        // Footer: product, operator, privacy link built from appUrl, a reason.
        for (const part of [msg.text, msg.html]) {
          expect(part).toContain(PRODUCT_NAME);
          expect(part).toContain(OPERATOR_NAME);
          expect(part).toContain(`${APP}/legal/privacy`);
          expect(part).toMatch(/You received this email because/);
        }

        // No leaked placeholders.
        for (const part of [msg.subject, msg.text, msg.html]) {
          expect(part).not.toMatch(/\bundefined\b|\bnull\b|\bNaN\b|\[object Object\]/);
        }

        // Every link points at the app (no double slash after the origin), except external funder links.
        for (const h of hrefs(msg.html)) {
          expect(h.startsWith(APP) || h.startsWith("https://portal.example.org")).toBe(true);
          expect(h.slice(APP.length)).not.toMatch(/^\/\//);
        }

        // No tracking pixels, external images, scripts or remote CSS.
        expect(msg.html).not.toMatch(/<img|<script|<link|<iframe|url\(/i);
      });
    }
  }

  it("team notifications carry a manage-notifications link; account emails do not", () => {
    const team = render("followupDue", FULL.followupDue);
    expect(team.text).toContain(`Manage notifications: ${APP}/orgs/org_1/settings/autopilot`);
    expect(hrefs(team.html)).toContain(`${APP}/orgs/org_1/settings/autopilot`);
    const reset = render("passwordReset", FULL.passwordReset);
    expect(reset.text).not.toContain("Manage notifications");
  });
});

describe("escaping", () => {
  it("escapes an XSS org name everywhere in the HTML part", () => {
    const msg = render("invitation", { ...FULL.invitation, orgName: XSS, inviterName: XSS });
    expect(msg.html).not.toContain("<script>");
    expect(msg.html).not.toContain("<img");
    expect(msg.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    // The plain-text part keeps the literal characters (it is never parsed as HTML).
    expect(msg.text).toContain('<script>alert("x")</script>');
  });

  it("escapes values in every template", () => {
    for (const name of EMAIL_TEMPLATE_NAMES) {
      const data = JSON.parse(
        JSON.stringify(FULL[name]).replace(
          /"(orgName|applicationTitle|title|funderName|legalName|opportunityTitle)":"[^"]*"/g,
          (_m, k: string) => `"${k}":${JSON.stringify(XSS)}`,
        ),
      );
      const { html } = renderEmail(name, data as never, { appUrl: APP });
      expect(html, name).not.toMatch(/<script|<img/i);
    }
  });

  it("strips CR/LF injected through a subject value", () => {
    const msg = render("submissionSent", {
      ...FULL.submissionSent,
      applicationTitle: "Trades\r\nBcc: attacker@example.test",
    });
    expect(msg.subject).toBe(
      'Submitted: "Trades Bcc: attacker@example.test" to Example Foundation',
    );
    expect(msg.subject).not.toMatch(/[\r\n]/);
    const funder = render("funderSubmission", {
      ...FULL.funderSubmission,
      opportunityTitle: "Pathways\nX-Injected: 1",
    });
    expect(funder.subject).not.toMatch(/[\r\n]/);
  });

  it("never turns a javascript: funder URL into a link", () => {
    const msg = render("manualSubmissionInstructions", {
      ...FULL.manualSubmissionInstructions,
      guide: { ...FULL.manualSubmissionInstructions.guide, url: "javascript:alert(1)" },
    });
    expect(hrefs(msg.html).some((h) => h.startsWith("javascript"))).toBe(false);
  });
});

describe("links use appUrl", () => {
  it("builds account links from appUrl (trailing slash normalized)", () => {
    expect(render("invitation", FULL.invitation).text).toContain(`${APP}/invite/inv_123`);
    expect(render("verifyEmail", FULL.verifyEmail).text).toContain(
      `${APP}/verify-email?token=tok%2F%2B%3D1`,
    );
    expect(render("passwordReset", FULL.passwordReset).text).toContain(
      `${APP}/reset-password?token=rst_1`,
    );
    expect(render("exportReady", FULL.exportReady).text).toContain(
      `${APP}/orgs/org_1/settings/privacy`,
    );
    expect(render("paymentFailed", FULL.paymentFailed).text).toContain(
      `${APP}/orgs/org_1/settings/billing`,
    );
  });

  it("builds application, review and interview links", () => {
    const review = render("applicationReadyForReview", FULL.applicationReadyForReview);
    expect(hrefs(review.html)).toContain(`${APP}/orgs/org_1/applications/app_1`);
    expect(review.subject).toBe('Ready for review: "Trades Academy Expansion" (2 blockers)');
    expect(review.text).toContain("Blocking issues: 2");
    expect(review.text).toContain("Warnings: 1");
    expect(review.text).toContain("December 15, 2026");
    const info = render("needsInfo", FULL.needsInfo);
    expect(hrefs(info.html)).toContain(`${APP}/orgs/org_1/interviews/int_1`);
    expect(info.text).toContain("1. How many students graduated in 2025?");
  });

  it("weekly digest links every item and caps long sections", () => {
    const msg = render("weeklyDigest", FULL.weeklyDigest);
    const links = hrefs(msg.html);
    expect(links).toContain(`${APP}/orgs/org_1/opportunities/opp_0`);
    expect(links).toContain(`${APP}/orgs/org_1/applications/app_1`);
    expect(links).toContain(`${APP}/orgs/org_1/interviews/int_2`);
    expect(links).toContain(`${APP}/orgs/org_1/applications/app_3`);
    expect(links).not.toContain(`${APP}/orgs/org_1/opportunities/opp_6`);
    expect(msg.text).toContain("and 2 more");
    expect(msg.subject).toBe(
      "Weekly digest for Riverside Youth Alliance: 7 new matches, 1 closing soon",
    );
    const empty = render("weeklyDigest", MINIMAL.weeklyDigest);
    expect(empty.text).toContain("No new matches this week.");
  });
});

describe("funder submission", () => {
  it("is a formal cover note with identity, request and attachments only", () => {
    const msg = render("funderSubmission", FULL.funderSubmission);
    expect(msg.subject).toBe(
      "Grant application: Workforce Pathways (EF-2026-01) — Riverside Youth Alliance, Inc.",
    );
    for (const s of [
      "Dear Example Foundation grants team,",
      "EIN: 85-0000000",
      "UEI: UEI123",
      "Contact: Pat Doe",
      "Email: pat@rya.example.org",
      "Requested amount: $25,000.",
      "rya-application-sub_1.md",
      "(opportunity EF-2026-01)",
      "b".repeat(64),
    ]) {
      expect(msg.text).toContain(s);
    }
    expect(msg.text).toContain("Sincerely,\nPat Doe\nRiverside Youth Alliance, Inc.");
    expect(msg.text).toContain("Sent on behalf of Riverside Youth Alliance, Inc.");
    expect(msg.text.replaceAll(PRODUCT_NAME, "")).not.toMatch(
      /grounding|autopilot|blocker|review tier|Manage notifications/i,
    );
  });
});
