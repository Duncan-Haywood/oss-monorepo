import { env } from "cloudflare:workers";
import type { SubmissionMethodHint } from "@shared/enums";
import { createAppContext, testFakes } from "@worker/context";
import {
  applicationFlags,
  applications,
  applicationVersions,
  auditLog,
  consentRecords,
  facts,
  followups,
  member,
  opportunities,
  orgProfiles,
  orgSettings,
  submissions,
  user,
} from "@worker/db/schema";
import { AppError } from "@worker/lib/errors";
import { sha256Hex } from "@worker/lib/hash";
import { newId } from "@worker/lib/ids";
import { contextMiddleware } from "@worker/middleware/context";
import { requireOrg } from "@worker/middleware/tenant";
import submissionRoutes from "@worker/routes/org/submissions";
import { DOCX_CONTENT_TYPE } from "@worker/services/export/docx";
import type { AppEnv } from "@worker/types";
import { and, eq } from "drizzle-orm";
import { strFromU8, unzipSync } from "fflate";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createTestUser, setupTenant, testDb } from "../../../../test/worker/helpers";
import { assertWellFormed } from "../../../../test/xml-well-formed";
import { scheduleDeadlineReminders, submitApplication } from "./index";
import { runDueFollowups } from "./jobs";

const DAY = 86_400_000;

// Mounts this router exactly as app.ts does (/api/orgs/:orgId/submissions behind requireOrg), so
// these tests don't depend on every other module's router compiling during the parallel build.
const mini = new Hono<AppEnv>();
mini.use("*", contextMiddleware);
mini.use("*", async (c, next) => {
  c.set("user", null);
  const id = c.req.header("x-test-user-id");
  if (id) {
    const row = await c.var.ctx.db.select().from(user).where(eq(user.id, id)).get();
    if (row) c.set("user", { ...row });
  }
  await next();
});
const org = new Hono<AppEnv>();
org.use("*", requireOrg("viewer"));
org.route("/submissions", submissionRoutes);
mini.route("/api/orgs/:orgId", org);
mini.onError((err, c) =>
  err instanceof AppError
    ? c.json({ error: { code: err.code, message: err.message } }, err.status)
    : c.json({ error: { code: "internal_error", message: String(err) } }, 500),
);

function api(path: string, init: RequestInit & { json?: unknown; as?: string } = {}) {
  const { json, as, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (json !== undefined) headers.set("Content-Type", "application/json");
  if (as) headers.set("x-test-user-id", as);
  return mini.fetch(
    new Request(`http://localhost:5173${path}`, {
      ...rest,
      headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    }),
    env,
  );
}

async function seedApplication(
  orgId: string,
  opts: {
    method?: SubmissionMethodHint;
    submissionEmail?: string | null;
    deadline?: Date | null;
    status?: (typeof applications.$inferInsert)["status"];
    title?: string;
  } = {},
) {
  const db = testDb();
  const oppId = newId("opp");
  await db.insert(opportunities).values({
    id: oppId,
    source: "manual",
    sourceId: oppId,
    funderName: "Example Foundation",
    title: "Workforce Pathways",
    opportunityNumber: "WP-2027",
    submissionMethod: opts.method ?? "email",
    submissionEmail:
      opts.submissionEmail === undefined ? "grants@funder.test" : opts.submissionEmail,
    closeDate: opts.deadline ?? null,
    requirements: {
      sections: [
        {
          key: "need",
          title: "Need",
          prompt: "Describe the need.",
          kind: "narrative",
          required: true,
          wordLimit: 250,
          charLimit: null,
          guidance: "",
        },
      ],
      // Optional here: these tests cover the email/manual channels and the funder package. Required
      // attachments blocking submission are covered in test/worker/attachments.test.ts.
      attachments: [{ name: "IRS determination letter", required: false, description: "" }],
      eligibilityCriteria: [],
      submissionInstructions: "Send one document.",
      complete: true,
    },
  });
  const appId = newId("app");
  const verId = newId("ver");
  await db.insert(applications).values({
    id: appId,
    orgId,
    opportunityId: oppId,
    title: opts.title ?? "Trades Academy Expansion",
    status: opts.status ?? "approved",
    requestedAmountCents: 2_500_000,
    deadline: opts.deadline ?? null,
  });
  await db.insert(applicationVersions).values({
    id: verId,
    orgId,
    applicationId: appId,
    versionNumber: 1,
    authorType: "system",
    executiveSummary: "SWIF trains young adults in construction trades.",
    content: {
      sections: [
        {
          key: "need",
          title: "Statement of Need",
          gaps: [],
          paragraphs: [
            {
              id: "p1",
              claims: [
                {
                  id: "c1",
                  kind: "factual",
                  text: "The program trained 42 students in 2025.",
                  factIds: ["fct_a"],
                },
              ],
            },
          ],
        },
      ],
    },
  });
  await db.update(applications).set({ currentVersionId: verId }).where(eq(applications.id, appId));
  return { oppId, appId, verId };
}

async function setContacts(orgId: string, contactEmail: string | null, notify: string[] = []) {
  const db = testDb();
  await db
    .update(orgProfiles)
    .set({ contactEmail, contactName: "Pat Doe", ein: "85-0000000", uei: "UEI123" })
    .where(eq(orgProfiles.orgId, orgId));
  await db.update(orgSettings).set({ notifyEmails: notify }).where(eq(orgSettings.orgId, orgId));
}

const fromBase64 = (b64: string | undefined) =>
  Uint8Array.from(atob(b64 ?? ""), (ch) => ch.charCodeAt(0));

const sentTo = (addr: string) => testFakes.email.sent.filter((m) => m.to.includes(addr));
const uniq = (p: string) => `${p}-${newId("job").slice(4)}@example.test`;

describe("submission: email channel", () => {
  it("emails the funder the application (DOCX + text) and stores the sha256", async () => {
    const { orgId, userId } = await setupTenant();
    const contact = uniq("contact");
    const team = uniq("team");
    await setContacts(orgId, contact, [team]);
    const funder = uniq("funder");
    const { appId, verId } = await seedApplication(orgId, { submissionEmail: funder });
    const ctx = createAppContext(env);

    const sub = await submitApplication(ctx, {
      orgId,
      applicationId: appId,
      versionId: verId,
      submittedByType: "user",
      submittedBy: userId,
      approvedBy: userId,
    });
    expect(sub.channel).toBe("email");
    expect(sub.status).toBe("sent");
    expect(sub.recipient).toBe(funder);
    expect(sub.packageR2Key).toBe(`orgs/${orgId}/submissions/${sub.id}/package.json`);

    const mails = sentTo(funder);
    expect(mails).toHaveLength(1);
    const mail = mails[0];
    expect(mail?.replyTo).toBe(contact);
    expect(mail?.subject).toContain("Workforce Pathways");
    expect(mail?.text).toContain(sub.packageSha256);
    const [docx, txt] = mail?.attachments ?? [];
    expect(docx?.contentType).toBe(DOCX_CONTENT_TYPE);
    expect(txt?.contentType).toBe("text/plain");
    const text = new TextDecoder().decode(fromBase64(txt?.content));
    expect(text).toContain("The program trained 42 students in 2025.");
    expect(text).toContain("Question: Describe the need.");

    // R2 content hashes to the stored sha.
    const obj = await env.FILES.get(sub.packageR2Key);
    const stored = await obj?.text();
    expect(await sha256Hex(stored ?? "")).toBe(sub.packageSha256);
    expect(JSON.parse(stored ?? "{}").citations[0]).toMatchObject({
      claimId: "c1",
      factIds: ["fct_a"],
    });

    const db = testDb();
    const app = await db.select().from(applications).where(eq(applications.id, appId)).get();
    expect(app?.status).toBe("submitted");
    expect(app?.submittedAt).toBeInstanceOf(Date);
    const fups = await db.select().from(followups).where(eq(followups.applicationId, appId)).all();
    expect(fups.map((f) => f.kind).sort()).toEqual(["status_check", "thank_you"]);
    const check = fups.find((f) => f.kind === "status_check");
    expect((check?.dueAt.getTime() ?? 0) - (sub.sentAt?.getTime() ?? 0)).toBe(30 * DAY);
    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.orgId, orgId), eq(auditLog.action, "application.submitted")))
      .all();
    expect(audits).toHaveLength(1);
    expect(audits[0]?.metadata).toMatchObject({ channel: "email", sha256: sub.packageSha256 });
    expect(sentTo(team).some((m) => m.subject.startsWith("Submitted:"))).toBe(true);

    // Retry (e.g. workflow step re-run) is idempotent: same row, no second email.
    const again = await submitApplication(ctx, {
      orgId,
      applicationId: appId,
      versionId: verId,
      submittedByType: "user",
      submittedBy: userId,
    });
    expect(again.id).toBe(sub.id);
    expect(sentTo(funder)).toHaveLength(1);
  });

  it("sends funders only the application: no grounding, fact ids or citations; a valid docx", async () => {
    const { orgId, userId } = await setupTenant();
    await setContacts(orgId, uniq("contact"));
    const funder = uniq("funder");
    const { appId, verId } = await seedApplication(orgId, { submissionEmail: funder });
    const db = testDb();
    await db
      .update(applicationVersions)
      .set({
        groundingReport: {
          totalClaims: 1,
          factualClaims: 1,
          supported: 1,
          partiallySupported: 0,
          unsupported: 0,
          numericMismatches: 0,
          unconfirmedFactCitations: 0,
          gaps: 0,
          passed: true,
          verdicts: [
            {
              claimId: "c1",
              verdict: "supported",
              reason: "",
              unmatchedNumbers: [],
              unconfirmedFactIds: [],
            },
          ],
          checkedAt: Date.now(),
          model: "fake",
        },
      })
      .where(eq(applicationVersions.id, verId));
    const sub = await submitApplication(createAppContext(env), {
      orgId,
      applicationId: appId,
      versionId: verId,
      submittedByType: "user",
      submittedBy: userId,
      approvedBy: userId,
    });
    expect(sub.status).toBe("sent");
    const mail = sentTo(funder)[0];
    const atts = mail?.attachments ?? [];
    expect(atts.map((a) => a.contentType)).toEqual([DOCX_CONTENT_TYPE, "text/plain"]);
    expect(atts[0]?.filename).toMatch(/^[a-z0-9-]+-v1\.docx$/);

    // A valid OOXML package: every part present and well-formed, the answer in document.xml.
    const docxBytes = fromBase64(atts[0]?.content);
    const parts = Object.fromEntries(
      Object.entries(unzipSync(docxBytes)).map(([k, v]) => [k, strFromU8(v)]),
    );
    for (const part of [
      "[Content_Types].xml",
      "_rels/.rels",
      "word/document.xml",
      "word/styles.xml",
      "word/_rels/document.xml.rels",
      "docProps/core.xml",
      "docProps/app.xml",
    ]) {
      expect(parts[part], part).toBeDefined();
    }
    for (const [name, xml] of Object.entries(parts)) {
      expect(() => assertWellFormed(xml), name).not.toThrow();
    }
    const documentXml = parts["word/document.xml"] ?? "";
    expect(documentXml).toContain("The program trained 42 students in 2025.");
    expect(documentXml).toContain("Describe the need.");
    const text = new TextDecoder().decode(fromBase64(atts[1]?.content));

    // Nothing internal reaches the funder: email body, every docx part, the text fallback.
    const funderSees = [mail?.subject, mail?.text, mail?.html, text, ...Object.values(parts)].join(
      "\n",
    );
    expect(funderSees).not.toMatch(/grounding/i);
    expect(funderSees).not.toContain("fct_");
    expect(funderSees).not.toMatch(/appendix|Citations|\[1\]/);
    expect(funderSees).not.toContain("Word count");
    expect(funderSees).not.toContain("package.md");

    // We know exactly what the funder received...
    const row = await db.select().from(submissions).where(eq(submissions.id, sub.id)).get();
    expect(row?.metadata).toMatchObject({
      funderAttachmentSha256: await sha256Hex(docxBytes),
      funderTextAttachmentSha256: await sha256Hex(new TextEncoder().encode(text)),
    });
    // ...and the internal audit record in R2 is unchanged (grounding + citations, sha on the JSON).
    const json = (await (await env.FILES.get(sub.packageR2Key))?.text()) ?? "";
    expect(await sha256Hex(json)).toBe(sub.packageSha256);
    const md =
      (await (await env.FILES.get(`orgs/${orgId}/submissions/${sub.id}/package.md`))?.text()) ?? "";
    expect(md).toContain("## Grounding report");
    expect(md).toContain("fct_a");
  });

  it("never emails the funder when the org has no contact email (falls back to manual)", async () => {
    const { orgId } = await setupTenant();
    await setContacts(orgId, null, []);
    const funder = uniq("funder");
    const { appId, verId } = await seedApplication(orgId, { submissionEmail: funder });
    const sub = await submitApplication(createAppContext(env), {
      orgId,
      applicationId: appId,
      versionId: verId,
      submittedByType: "autopilot",
    });
    expect(sub.channel).toBe("manual");
    expect(sub.status).toBe("pending");
    expect(sentTo(funder)).toHaveLength(0);
    expect((sub.metadata as { fallbackReason?: string }).fallbackReason).toContain("contact email");
  });

  it("autopilot re-checks its gates at send time before emailing a funder", async () => {
    const { orgId } = await setupTenant();
    await setContacts(orgId, uniq("contact"));
    const db = testDb();
    const passed = {
      totalClaims: 1,
      factualClaims: 1,
      supported: 1,
      partiallySupported: 0,
      unsupported: 0,
      numericMismatches: 0,
      unconfirmedFactCitations: 0,
      gaps: 0,
      passed: true,
      verdicts: [],
      checkedAt: 0,
      model: "fake",
    };
    const seedAuto = async () => {
      const funder = uniq("funder");
      const s = await seedApplication(orgId, { submissionEmail: funder });
      await db.update(applications).set({ reviewTier: "auto" }).where(eq(applications.id, s.appId));
      await db
        .update(applicationVersions)
        .set({ groundingReport: passed })
        .where(eq(applicationVersions.id, s.verId));
      return { ...s, funder };
    };
    const auto = (s: { appId: string; verId: string }) =>
      submitApplication(createAppContext(env), {
        orgId,
        applicationId: s.appId,
        versionId: s.verId,
        submittedByType: "autopilot",
      });

    // Autopilot was switched off after routing (e.g. while the workflow waited): no funder email.
    const off = await seedAuto();
    const subOff = await auto(off);
    expect(subOff.channel).toBe("manual");
    expect(sentTo(off.funder)).toHaveLength(0);
    expect((subOff.metadata as { fallbackReason?: string }).fallbackReason).toContain(
      "autopilot is turned off",
    );

    await db
      .update(orgSettings)
      .set({ autopilotEnabled: true })
      .where(eq(orgSettings.orgId, orgId));

    // An open blocker (e.g. raised after routing) also stops the automatic email.
    const blocked = await seedAuto();
    await db.insert(applicationFlags).values({
      id: newId("flg"),
      orgId,
      applicationId: blocked.appId,
      versionId: blocked.verId,
      severity: "blocker",
      kind: "unsupported_claim",
      message: "Unsupported claim",
    });
    const subBlocked = await auto(blocked);
    expect(subBlocked.channel).toBe("manual");
    expect(sentTo(blocked.funder)).toHaveLength(0);

    // Grounding not passed on this version.
    const ungrounded = await seedAuto();
    await db
      .update(applicationVersions)
      .set({ groundingReport: { ...passed, passed: false, unsupported: 1 } })
      .where(eq(applicationVersions.id, ungrounded.verId));
    expect((await auto(ungrounded)).channel).toBe("manual");
    expect(sentTo(ungrounded.funder)).toHaveLength(0);

    // Safety rails (review/safety-rails.ts) also hold at send time: the consent is granted, the
    // ask is within the autopilot limit and every cited fact is confirmed.
    const grantConsent = (granted: boolean) =>
      db.insert(consentRecords).values({
        id: newId("cns"),
        orgId,
        scope: "autopilot_submission",
        policyVersion: "test",
        granted,
        createdAt: new Date(Date.now() + (granted ? 0 : 1000)),
      });
    await grantConsent(true);
    await db
      .update(orgSettings)
      .set({ autoSubmitMaxCents: 5_000_000, maxAutoSubmissionsPerMonth: 50 })
      .where(eq(orgSettings.orgId, orgId));
    const confirmedFact = newId("fct");
    await db.insert(facts).values({
      id: confirmedFact,
      orgId,
      category: "program",
      statement: "The program trained 42 students in 2025.",
      status: "confirmed",
      sourceType: "user_entered",
    });
    const citeConfirmed = async (verId: string) => {
      const v = await db
        .select()
        .from(applicationVersions)
        .where(eq(applicationVersions.id, verId))
        .get();
      const content = JSON.parse(JSON.stringify(v?.content).replaceAll("fct_a", confirmedFact));
      await db
        .update(applicationVersions)
        .set({ content })
        .where(eq(applicationVersions.id, verId));
    };

    // An unconfirmed citation (fct_a does not exist in the fact base) is a rail failure.
    const unconfirmed = await seedAuto();
    const subUnconfirmed = await auto(unconfirmed);
    expect(subUnconfirmed.channel).toBe("manual");
    expect((subUnconfirmed.metadata as { fallbackReason?: string }).fallbackReason).toContain(
      "unconfirmed facts",
    );

    // Every gate holds: emailed.
    const ok = await seedAuto();
    await citeConfirmed(ok.verId);
    const subOk = await auto(ok);
    expect(subOk.channel).toBe("email");
    expect(subOk.status).toBe("sent");
    expect(sentTo(ok.funder)).toHaveLength(1);

    // Consent revoked after routing: no funder email.
    await grantConsent(false);
    const revoked = await seedAuto();
    await citeConfirmed(revoked.verId);
    const subRevoked = await auto(revoked);
    expect(subRevoked.channel).toBe("manual");
    expect(sentTo(revoked.funder)).toHaveLength(0);
    expect((subRevoked.metadata as { fallbackReason?: string }).fallbackReason).toContain(
      "autopilot submission consent",
    );
  });

  it("never emails a funder without two approvers when the two-person rule applies", async () => {
    const { orgId, userId } = await setupTenant();
    await setContacts(orgId, uniq("contact"));
    await testDb()
      .update(orgSettings)
      .set({ twoPersonRuleAboveCents: 1_000_000 })
      .where(eq(orgSettings.orgId, orgId));
    const funder = uniq("funder");
    const { appId, verId } = await seedApplication(orgId, { submissionEmail: funder });
    await expect(
      submitApplication(createAppContext(env), {
        orgId,
        applicationId: appId,
        versionId: verId,
        submittedByType: "user",
        submittedBy: userId,
        approvedBy: userId,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(sentTo(funder)).toHaveLength(0);
  });

  it("rejects cross-tenant submit by id", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const { appId, verId } = await seedApplication(a.orgId);
    await expect(
      submitApplication(createAppContext(env), {
        orgId: b.orgId,
        applicationId: appId,
        versionId: verId,
        submittedByType: "user",
        submittedBy: b.userId,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("submission: manual channel + routes", () => {
  it("grants.gov → pending with guide; confirm marks submitted; package is immutable", async () => {
    const { orgId, userId } = await setupTenant();
    await setContacts(orgId, uniq("contact"));
    const { appId, verId } = await seedApplication(orgId, {
      method: "grants_gov",
      submissionEmail: null,
    });
    const sub = await submitApplication(createAppContext(env), {
      orgId,
      applicationId: appId,
      versionId: verId,
      submittedByType: "user",
      submittedBy: userId,
    });
    expect(sub).toMatchObject({ channel: "manual", status: "pending" });
    const guide = (sub.metadata as { guide?: { title: string; steps: string[] } }).guide;
    expect(guide?.title).toContain("Grants.gov Workspace");
    const db = testDb();
    expect(
      (await db.select().from(applications).where(eq(applications.id, appId)).get())?.status,
    ).toBe("submitting");

    // List joins application title.
    const list = await api(`/api/orgs/${orgId}/submissions`, { as: userId });
    expect(list.status).toBe(200);
    const body = (await list.json()) as { items: { id: string; application: { title: string } }[] };
    expect(body.items[0]).toMatchObject({
      id: sub.id,
      application: { title: "Trades Academy Expansion" },
    });

    // Package endpoint returns exactly the hashed bytes.
    const pkgRes = await api(`/api/orgs/${orgId}/submissions/${sub.id}/package`, { as: userId });
    expect(pkgRes.status).toBe(200);
    expect(pkgRes.headers.get("X-Package-Integrity")).toBe("verified");
    expect(await sha256Hex(await pkgRes.text())).toBe(sub.packageSha256);
    const mdRes = await api(`/api/orgs/${orgId}/submissions/${sub.id}/package?format=md`, {
      as: userId,
    });
    expect(mdRes.headers.get("Content-Type")).toContain("text/markdown");
    expect(await mdRes.text()).toContain("## Statement of Need");

    // Viewer cannot confirm.
    const viewer = await createTestUser();
    await db.insert(member).values({
      id: newId("org").replace("org_", "mem_"),
      organizationId: orgId,
      userId: viewer.id,
      role: "viewer",
    });
    const denied = await api(`/api/orgs/${orgId}/submissions/${sub.id}/confirm`, {
      method: "POST",
      as: viewer.id,
      json: {},
    });
    expect(denied.status).toBe(403);

    // A reviewer (who can approve) can also record that the manual submission was sent.
    const reviewer = await createTestUser();
    await db.insert(member).values({
      id: newId("org").replace("org_", "mem_"),
      organizationId: orgId,
      userId: reviewer.id,
      role: "reviewer",
    });
    const res = await api(`/api/orgs/${orgId}/submissions/${sub.id}/confirm`, {
      method: "POST",
      as: reviewer.id,
      json: { externalRef: "GRANT12345678" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "confirmed", externalRef: "GRANT12345678" });
    const app = await db.select().from(applications).where(eq(applications.id, appId)).get();
    expect(app?.status).toBe("submitted");
    const submittedAudit = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.orgId, orgId), eq(auditLog.action, "application.submitted")))
      .all();
    expect(submittedAudit).toEqual([
      expect.objectContaining({ actorType: "user", actorId: reviewer.id, targetId: appId }),
    ]);
    const fups = await api(`/api/orgs/${orgId}/submissions/followups?status=pending`, {
      as: userId,
    });
    const fbody = (await fups.json()) as { items: { kind: string; application: { id: string } }[] };
    expect(fbody.items.map((f) => f.kind).sort()).toEqual(["status_check", "thank_you"]);
    expect(fbody.items[0]?.application.id).toBe(appId);

    // R2 package unchanged after confirm.
    const after = await env.FILES.get(sub.packageR2Key);
    expect(await sha256Hex((await after?.text()) ?? "")).toBe(sub.packageSha256);
  });

  it("returns 404 for another org's submission and followups", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    await setContacts(a.orgId, uniq("contact"));
    const { appId, verId } = await seedApplication(a.orgId, { method: "portal" });
    const sub = await submitApplication(createAppContext(env), {
      orgId: a.orgId,
      applicationId: appId,
      versionId: verId,
      submittedByType: "user",
      submittedBy: a.userId,
    });
    // b uses its own org id with a's resource ids.
    for (const path of [`/${sub.id}`, `/${sub.id}/package`]) {
      const r = await api(`/api/orgs/${b.orgId}/submissions${path}`, { as: b.userId });
      expect(r.status).toBe(404);
    }
    const c = await api(`/api/orgs/${b.orgId}/submissions/${sub.id}/confirm`, {
      method: "POST",
      as: b.userId,
      json: {},
    });
    expect(c.status).toBe(404);
    const list = await api(`/api/orgs/${b.orgId}/submissions`, { as: b.userId });
    expect(((await list.json()) as { items: unknown[] }).items).toHaveLength(0);
    // b cannot use a's org id at all.
    const r = await api(`/api/orgs/${a.orgId}/submissions`, { as: b.userId });
    expect(r.status).toBe(404);
  });
});

describe("follow-ups", () => {
  it("schedules -14d/-3d deadline reminders idempotently and skips past dates", async () => {
    const { orgId } = await setupTenant();
    const now = new Date();
    const ctx = createAppContext(env);
    const far = await seedApplication(orgId, { deadline: new Date(now.getTime() + 20 * DAY) });
    const r1 = await scheduleDeadlineReminders(ctx, { orgId, applicationId: far.appId });
    const r2 = await scheduleDeadlineReminders(ctx, { orgId, applicationId: far.appId });
    expect(r1).toHaveLength(2);
    expect(r2.map((r) => r.id)).toEqual(r1.map((r) => r.id));
    const near = await seedApplication(orgId, { deadline: new Date(now.getTime() + 10 * DAY) });
    const r3 = await scheduleDeadlineReminders(ctx, { orgId, applicationId: near.appId });
    expect(r3).toHaveLength(1);
    expect(r3[0]?.dedupeKey).toContain(":3d");
    const rows = await testDb()
      .select()
      .from(followups)
      .where(eq(followups.applicationId, far.appId))
      .all();
    expect(rows).toHaveLength(2);
  });

  it("sends due reminders exactly once; PATCH marks done (editor only)", async () => {
    const { orgId, userId } = await setupTenant();
    const team = uniq("team");
    await setContacts(orgId, null, [team]);
    const { appId } = await seedApplication(orgId);
    const db = testDb();
    const fupId = newId("fup");
    await db.insert(followups).values({
      id: fupId,
      orgId,
      applicationId: appId,
      kind: "status_check",
      title: "Check status with Example Foundation",
      dueAt: new Date(Date.now() - 60_000),
    });
    const ctx = createAppContext(env);
    await runDueFollowups(ctx, { type: "followups.run_due" });
    await runDueFollowups(ctx, { type: "followups.run_due" });
    const reminders = sentTo(team).filter((m) => m.subject.startsWith("Reminder:"));
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.text).toContain("Trades Academy Expansion");
    const row = await db.select().from(followups).where(eq(followups.id, fupId)).get();
    expect(row?.notifiedAt).toBeInstanceOf(Date);

    const viewer = await createTestUser();
    await db.insert(member).values({
      id: newId("org").replace("org_", "mem_"),
      organizationId: orgId,
      userId: viewer.id,
      role: "viewer",
    });
    const denied = await api(`/api/orgs/${orgId}/submissions/followups/${fupId}`, {
      method: "PATCH",
      as: viewer.id,
      json: { status: "done" },
    });
    expect(denied.status).toBe(403);
    const ok = await api(`/api/orgs/${orgId}/submissions/followups/${fupId}`, {
      method: "PATCH",
      as: userId,
      json: { status: "done", notes: "Program officer said decisions in March" },
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ status: "done", completedBy: userId });

    const other = await setupTenant();
    const cross = await api(`/api/orgs/${other.orgId}/submissions/followups/${fupId}`, {
      method: "PATCH",
      as: other.userId,
      json: { status: "skipped" },
    });
    expect(cross.status).toBe(404);
  });
});

describe("dashboard", () => {
  it("summarizes the org's pipeline", async () => {
    const { orgId, userId } = await setupTenant();
    await setContacts(orgId, uniq("contact"));
    const now = Date.now();
    await seedApplication(orgId, { status: "in_review", deadline: new Date(now + 5 * DAY) });
    await seedApplication(orgId, { status: "in_review", deadline: new Date(now + 60 * DAY) });
    const awarded = await seedApplication(orgId, { status: "awarded" });
    await testDb()
      .update(applications)
      .set({ awardedAmountCents: 1_500_000 })
      .where(eq(applications.id, awarded.appId));
    const toSubmit = await seedApplication(orgId, { status: "approved" });
    await submitApplication(createAppContext(env), {
      orgId,
      applicationId: toSubmit.appId,
      versionId: toSubmit.verId,
      submittedByType: "user",
      submittedBy: userId,
    });
    // Another org's data must not leak in.
    const other = await setupTenant();
    await seedApplication(other.orgId, { status: "in_review" });

    const res = await api(`/api/orgs/${orgId}/submissions/dashboard`, { as: userId });
    expect(res.status).toBe(200);
    const d = (await res.json()) as {
      counts: { byStatus: Record<string, number> };
      upcomingDeadlines: { applicationId: string; daysLeft: number }[];
      pendingReviews: number;
      awardedCents: number;
      submittedThisMonth: number;
      recentActivity: { action: string }[];
    };
    expect(d.counts.byStatus).toEqual({ in_review: 2, awarded: 1, submitted: 1 });
    expect(d.pendingReviews).toBe(2);
    expect(d.awardedCents).toBe(1_500_000);
    expect(d.submittedThisMonth).toBe(1);
    expect(d.upcomingDeadlines).toHaveLength(1);
    expect(d.upcomingDeadlines[0]?.daysLeft).toBe(5);
    expect(d.recentActivity.map((a) => a.action)).toContain("application.submitted");

    const rows = await testDb()
      .select()
      .from(submissions)
      .where(eq(submissions.orgId, orgId))
      .all();
    expect(rows).toHaveLength(1);
  });
});
