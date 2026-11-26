// Attachments checklist + letters of support, end to end in workerd: auto-matching, staff actions,
// AI suggestions limited to the org's own ids, letter tokens (hashed, expiring, single purpose),
// public upload validation and rate limit, reminders through the followups sweep, the submission
// package / funder email with attachments, the missing-required blocker at submit, and tenant
// isolation.
import { env } from "cloudflare:workers";
import type { PublicLetterInfoDto, SupportLetterDto } from "@shared/api/attachments";
import { createAppContext, testFakes } from "@worker/context";
import {
  applicationFlags,
  applications,
  applicationVersions,
  documents,
  facts,
  followups,
  member,
  notifications,
  opportunities,
  orgProfiles,
  orgSettings,
  user,
} from "@worker/db/schema";
import { applicationAttachments, supportLetterRequests } from "@worker/db/schema/attachments";
import { AppError } from "@worker/lib/errors";
import { newId } from "@worker/lib/ids";
import { contextMiddleware } from "@worker/middleware/context";
import { TEST_RATE_LIMIT_HEADER } from "@worker/middleware/rate-limit";
import { BODY_RULES, requestLimits } from "@worker/middleware/request-limits";
import { requireOrg } from "@worker/middleware/tenant";
import { FakeLlm } from "@worker/ports/fake-llm";
import { allFakeHandlers } from "@worker/ports/fake-llm-handlers";
import letterRoutes, { LETTER_UPLOAD_BODY_RULE } from "@worker/routes/letters";
import attachmentRoutes from "@worker/routes/org/attachments";
import {
  createSupportLetter,
  deriveLetterToken,
  fakeHandlers,
  hashLetterToken,
  sendDueLetterReminders,
} from "@worker/services/attachments";
import { submitApplication } from "@worker/services/submission";
import { sendDueFollowups } from "@worker/services/submission/followups";
import type { AppEnv } from "@worker/types";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";
import { setupTenant, testDb } from "./helpers";

// Until the integration pass exports db/schema/attachments.ts from db/schema/index.ts, TEST_SCHEMA_SQL
// lacks these tables. IF NOT EXISTS keeps this a no-op afterwards. DDL = drizzle-kit export.
const DDL = [
  "CREATE TABLE IF NOT EXISTS `application_attachments` ( `id` text PRIMARY KEY NOT NULL, `org_id` text NOT NULL, `application_id` text NOT NULL, `requirement_name` text NOT NULL, `requirement_key` text NOT NULL, `required` integer DEFAULT true NOT NULL, `description` text DEFAULT '' NOT NULL, `status` text DEFAULT 'missing' NOT NULL, `document_id` text, `match_source` text, `note` text, `updated_by` text, `created_at` integer NOT NULL, `updated_at` integer NOT NULL, FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE set null, FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null )",
  "CREATE UNIQUE INDEX IF NOT EXISTS `app_attachments_req_uq` ON `application_attachments` (`application_id`,`requirement_key`)",
  "CREATE INDEX IF NOT EXISTS `app_attachments_org_app_idx` ON `application_attachments` (`org_id`,`application_id`)",
  "CREATE INDEX IF NOT EXISTS `app_attachments_doc_idx` ON `application_attachments` (`document_id`)",
  "CREATE TABLE IF NOT EXISTS `support_letter_requests` ( `id` text PRIMARY KEY NOT NULL, `org_id` text NOT NULL, `application_id` text NOT NULL, `partner_name` text NOT NULL, `partner_email` text NOT NULL, `status` text DEFAULT 'draft' NOT NULL, `request_token_hash` text, `token_nonce` text, `token_expires_at` integer, `due_at` integer, `sent_at` integer, `received_at` integer, `received_document_id` text, `fact_ids` text DEFAULT '[]' NOT NULL, `email_subject` text DEFAULT '' NOT NULL, `email_intro` text DEFAULT '' NOT NULL, `outline` text DEFAULT '[]' NOT NULL, `draft_source` text NOT NULL, `note` text, `last_reminder_at` integer, `reminder_count` integer DEFAULT 0 NOT NULL, `created_by` text, `created_at` integer NOT NULL, `updated_at` integer NOT NULL, FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`received_document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE set null, FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null )",
  "CREATE UNIQUE INDEX IF NOT EXISTS `support_letters_token_uq` ON `support_letter_requests` (`request_token_hash`)",
  "CREATE INDEX IF NOT EXISTS `support_letters_org_app_idx` ON `support_letter_requests` (`org_id`,`application_id`)",
  "CREATE INDEX IF NOT EXISTS `support_letters_status_due_idx` ON `support_letter_requests` (`status`,`due_at`)",
  "CREATE INDEX IF NOT EXISTS `support_letters_doc_idx` ON `support_letter_requests` (`received_document_id`)",
];

const DAY = 86_400_000;
const BASE = "http://localhost:5173";

// Mount the routers exactly as app.ts will (see the integration diff): the org router under
// /api/orgs/:orgId/applications behind requireOrg, the public router at /api/letters, and the
// request-limits rule for the multipart letter upload.
const mini = new Hono<AppEnv>();
mini.use("*", contextMiddleware);
mini.use("/api/*", requestLimits({ rules: [LETTER_UPLOAD_BODY_RULE, ...BODY_RULES] }));
mini.use("*", async (c, next) => {
  c.set("user", null);
  const id = c.req.header("x-test-user-id");
  if (id) {
    const row = await c.var.ctx.db.select().from(user).where(eq(user.id, id)).get();
    if (row) c.set("user", { ...row });
  }
  await next();
});
mini.route("/api/letters", letterRoutes);
const org = new Hono<AppEnv>();
org.use("*", requireOrg("viewer"));
org.route("/applications", attachmentRoutes);
mini.route("/api/orgs/:orgId", org);
mini.notFound((c) => c.json({ error: { code: "not_found", message: "Not found" } }, 404));
mini.onError((err, c) =>
  err instanceof AppError
    ? c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status)
    : c.json({ error: { code: "internal_error", message: String(err) } }, 500),
);

function call(path: string, init: RequestInit & { json?: unknown; as?: string } = {}) {
  const { json, as, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (json !== undefined) headers.set("Content-Type", "application/json");
  if (as) headers.set("x-test-user-id", as);
  return mini.fetch(
    new Request(`${BASE}${path}`, {
      ...rest,
      headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    }),
    env,
  );
}

beforeAll(async () => {
  await env.DB.batch(DDL.map((s) => env.DB.prepare(s)));
  // Until ports/fake-llm-handlers.ts registers this module, give the worker's FakeLlm our handlers.
  Object.assign(allFakeHandlers, fakeHandlers);
});

const PDF = (marker: string) => new TextEncoder().encode(`%PDF-1.4\n% ${marker}\n%%EOF\n`);

async function addDoc(
  orgId: string,
  title: string,
  kind: (typeof documents.$inferInsert)["kind"],
  opts: { sizeBytes?: number; status?: "ready" | "failed" } = {},
) {
  const id = newId("doc");
  const r2Key = `orgs/${orgId}/documents/${id}/original`;
  const bytes = PDF(id);
  await env.FILES.put(r2Key, bytes, { customMetadata: { orgId, filename: `${title}.pdf` } });
  await testDb()
    .insert(documents)
    .values({
      id,
      orgId,
      title,
      kind,
      mimeType: "application/pdf",
      sizeBytes: opts.sizeBytes ?? bytes.byteLength,
      sha256: `sha-${id}`,
      r2Key,
      status: opts.status ?? "ready",
    });
  return id;
}

async function addPartnerFact(orgId: string, statement: string) {
  const id = newId("fct");
  await testDb().insert(facts).values({
    id,
    orgId,
    category: "partner",
    statement,
    status: "confirmed",
    sensitivity: "internal",
    confidence: 1,
    sourceType: "user_entered",
  });
  return id;
}

type Attachment = { name: string; required: boolean; description: string };

async function seedApp(
  orgId: string,
  attachments: Attachment[],
  opts: { method?: "email" | "portal"; deadline?: Date } = {},
) {
  const db = testDb();
  const oppId = newId("opp");
  await db.insert(opportunities).values({
    id: oppId,
    source: "manual",
    sourceId: oppId,
    funderName: "Example Foundation",
    title: "Rural Workforce Fund",
    submissionMethod: opts.method ?? "email",
    submissionEmail: "grants@funder.test",
    closeDate: opts.deadline ?? new Date(Date.now() + 40 * DAY),
    requirements: {
      sections: [],
      attachments,
      eligibilityCriteria: [],
      submissionInstructions: "",
      complete: true,
    },
  });
  const appId = newId("app");
  const verId = newId("ver");
  await db.insert(applications).values({
    id: appId,
    orgId,
    opportunityId: oppId,
    title: "Trades Academy",
    status: "approved",
    requestedAmountCents: 2_500_000,
  });
  await db.insert(applicationVersions).values({
    id: verId,
    orgId,
    applicationId: appId,
    versionNumber: 1,
    authorType: "system",
    content: { sections: [] },
  });
  await db.update(applications).set({ currentVersionId: verId }).where(eq(applications.id, appId));
  await db
    .update(orgProfiles)
    .set({ contactEmail: "director@swif.test", contactName: "Pat Doe", legalName: "SWIF" })
    .where(eq(orgProfiles.orgId, orgId));
  await db
    .update(orgSettings)
    .set({ notifyEmails: ["team@swif.test"] })
    .where(eq(orgSettings.orgId, orgId));
  return { appId, verId, oppId };
}

const IRS = { name: "IRS determination letter", required: true, description: "" };
const BUDGET = { name: "Project budget", required: true, description: "Line items" };
const BOARD = { name: "Board list", required: true, description: "" };
const LETTERS = { name: "Letters of support", required: false, description: "" };

const checklistPath = (orgId: string, appId: string) =>
  `/api/orgs/${orgId}/applications/${appId}/attachments`;
const lettersPath = (orgId: string, appId: string) =>
  `/api/orgs/${orgId}/applications/${appId}/support-letters`;

interface ChecklistBody {
  items: {
    id: string;
    requirementName: string;
    status: string;
    documentId: string | null;
    matchSource: string | null;
  }[];
  missingRequired: number;
}

const tokenFromEmail = (text: string) => /\/letters\/([A-Za-z0-9_-]{43})/.exec(text)?.[1] ?? "";
const mailsTo = (addr: string) => testFakes.email.sent.filter((m) => m.to.includes(addr));

describe("attachments checklist", () => {
  it("auto-matches requirements to org documents by kind and keywords", async () => {
    const { userId, orgId } = await setupTenant();
    const irs = await addDoc(orgId, "IRS Determination Letter (1999)", "other");
    const budget = await addDoc(orgId, "FY27 budget", "budget");
    await addDoc(orgId, "IRS interview", "interview_transcript");
    const { appId } = await seedApp(orgId, [IRS, BUDGET, BOARD]);

    const res = await call(checklistPath(orgId, appId), { as: userId });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ChecklistBody;
    expect(
      body.items.map((i) => [i.requirementName, i.status, i.documentId, i.matchSource]),
    ).toEqual([
      ["IRS determination letter", "matched", irs, "keyword"],
      ["Project budget", "matched", budget, "kind"],
      ["Board list", "missing", null, null],
    ]);
    expect(body.missingRequired).toBe(1);
    // Reading the checklist (drafting time) never raises blocker flags.
    const flags = await testDb()
      .select()
      .from(applicationFlags)
      .where(eq(applicationFlags.applicationId, appId));
    expect(flags).toHaveLength(0);
  });

  it("lets staff pick, waive (with a reason) and clear; clearing stops auto-matching", async () => {
    const { userId, orgId } = await setupTenant();
    const other = await setupTenant();
    const foreignDoc = await addDoc(other.orgId, "IRS Determination Letter", "other");
    const own = await addDoc(orgId, "Board roster 2026", "other");
    const { appId } = await seedApp(orgId, [IRS, BOARD]);
    const list = (await (
      await call(checklistPath(orgId, appId), { as: userId })
    ).json()) as ChecklistBody;
    const irsItem = list.items[0] as ChecklistBody["items"][number];
    const boardItem = list.items[1] as ChecklistBody["items"][number];
    expect(boardItem.documentId).toBe(own);

    const item = (id: string) => `${checklistPath(orgId, appId)}/${id}`;
    // Another org's document id is not found (never attachable across tenants).
    let res = await call(item(irsItem.id), {
      method: "PATCH",
      as: userId,
      json: { action: "pick", documentId: foreignDoc },
    });
    expect(res.status).toBe(404);
    res = await call(item(irsItem.id), {
      method: "PATCH",
      as: userId,
      json: { action: "waive", reason: "" },
    });
    expect(res.status).toBe(400);
    res = await call(item(irsItem.id), {
      method: "PATCH",
      as: userId,
      json: { action: "waive", reason: "Tribal government, not a 501(c)(3)" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: "waived",
      note: "Tribal government, not a 501(c)(3)",
    });

    res = await call(item(boardItem.id), {
      method: "PATCH",
      as: userId,
      json: { action: "clear" },
    });
    expect(await res.json()).toMatchObject({ status: "missing", matchSource: "cleared" });
    const again = (await (
      await call(checklistPath(orgId, appId), { as: userId })
    ).json()) as ChecklistBody;
    expect(again.items[1]).toMatchObject({ status: "missing", documentId: null });
    res = await call(item(boardItem.id), {
      method: "PATCH",
      as: userId,
      json: { action: "pick", documentId: own },
    });
    expect(await res.json()).toMatchObject({
      status: "matched",
      documentId: own,
      matchSource: "staff",
    });
  });

  it("AI suggestions may only pick the org's own document ids", async () => {
    const { userId, orgId } = await setupTenant();
    const other = await setupTenant();
    const foreign = await addDoc(other.orgId, "Service area map", "other");
    const map = await addDoc(orgId, "Map showing where we work", "other");
    const { appId } = await seedApp(orgId, [
      { name: "Service area map", required: true, description: "" },
      { name: "Organizational chart", required: false, description: "" },
    ]);
    const original = allFakeHandlers["attachments.match"];
    allFakeHandlers["attachments.match"] = () => ({
      matches: [
        { requirement: 0, documentId: map, reason: "map" },
        { requirement: 1, documentId: foreign, reason: "other org" },
      ],
    });
    try {
      const res = await call(`${checklistPath(orgId, appId)}/suggest`, {
        method: "POST",
        as: userId,
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as ChecklistBody;
      expect(body.items[0]).toMatchObject({
        status: "matched",
        documentId: map,
        matchSource: "ai",
      });
      expect(body.items[1]).toMatchObject({ status: "missing", documentId: null });
    } finally {
      if (original) allFakeHandlers["attachments.match"] = original;
    }
  });

  it("is tenant-isolated", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const { appId } = await seedApp(a.orgId, [IRS]);
    const list = (await (
      await call(checklistPath(a.orgId, appId), { as: a.userId })
    ).json()) as ChecklistBody;
    const itemId = list.items[0]?.id as string;
    // A non-member of org A: 404 on every route.
    expect((await call(checklistPath(a.orgId, appId), { as: b.userId })).status).toBe(404);
    expect((await call(lettersPath(a.orgId, appId), { as: b.userId })).status).toBe(404);
    // Org B's own path with org A's ids: not found.
    expect((await call(checklistPath(b.orgId, appId), { as: b.userId })).status).toBe(404);
    expect((await call(lettersPath(b.orgId, appId), { as: b.userId })).status).toBe(404);
    const patch = await call(`${checklistPath(b.orgId, appId)}/${itemId}`, {
      method: "PATCH",
      as: b.userId,
      json: { action: "waive", reason: "not mine" },
    });
    expect(patch.status).toBe(404);
    const row = await testDb()
      .select()
      .from(applicationAttachments)
      .where(eq(applicationAttachments.id, itemId))
      .get();
    expect(row?.status).toBe("missing");
  });

  it("requires editor for writes", async () => {
    const { orgId } = await setupTenant();
    const viewer = await setupTenant("viewer");
    const { appId } = await seedApp(orgId, [IRS]);
    // viewer is a member of their own org only; make them a viewer here too.
    await testDb()
      .insert(member)
      .values({
        id: newId("mem"),
        organizationId: orgId,
        userId: viewer.userId,
        role: "viewer",
      });
    expect((await call(checklistPath(orgId, appId), { as: viewer.userId })).status).toBe(200);
    const res = await call(lettersPath(orgId, appId), {
      method: "POST",
      as: viewer.userId,
      json: { partnerName: "Clinic", partnerEmail: "clinic@partner.test" },
    });
    expect(res.status).toBe(403);
  });
});

async function createAndSend(orgId: string, userId: string, appId: string, partnerEmail: string) {
  const created = await call(lettersPath(orgId, appId), {
    method: "POST",
    as: userId,
    json: {
      partnerName: "Gallup Food Pantry",
      partnerEmail,
      dueAt: new Date(Date.now() + 10 * DAY).toISOString(),
    },
  });
  expect(created.status).toBe(201);
  const letter = (await created.json()) as SupportLetterDto;
  const sent = await call(`${lettersPath(orgId, appId)}/${letter.id}/send`, {
    method: "POST",
    as: userId,
  });
  expect(sent.status).toBe(200);
  const mail = mailsTo(partnerEmail).at(-1);
  return {
    letter: (await sent.json()) as SupportLetterDto,
    token: tokenFromEmail(mail?.text ?? ""),
    mail,
  };
}

describe("letters of support", () => {
  it("drafts from partner facts without inventing commitments (fake AI path)", async () => {
    const { userId, orgId } = await setupTenant();
    const fact = await addPartnerFact(
      orgId,
      "Gallup Food Pantry has referred 120 trainees to our program since 2021.",
    );
    await addPartnerFact(orgId, "Navajo Tech partners with us on welding certification.");
    const { appId } = await seedApp(orgId, [LETTERS]);
    const res = await call(lettersPath(orgId, appId), {
      method: "POST",
      as: userId,
      json: { partnerName: "Gallup Food Pantry", partnerEmail: "pantry@partner.test" },
    });
    expect(res.status).toBe(201);
    const letter = (await res.json()) as SupportLetterDto;
    expect(letter.status).toBe("draft");
    expect(letter.draftSource).toBe("ai");
    expect(letter.facts.map((f) => f.id)).toEqual([fact]);
    expect(letter.emailIntro).toContain("referred 120 trainees");
    expect(letter.emailIntro).not.toContain("welding");
    expect(letter.emailIntro).toContain("We have not described any commitment");
    expect(letter.outline.every((o) => /\[[^\]]+\]/.test(o))).toBe(true);
    // Defaults to a week before the deadline.
    expect(letter.dueAt).not.toBeNull();
  });

  it("falls back to the template when the AI draft invents a commitment", async () => {
    const { userId, orgId } = await setupTenant();
    await addPartnerFact(orgId, "Gallup Food Pantry provides lunch for trainees on Fridays.");
    const { appId } = await seedApp(orgId, [LETTERS]);
    const llm = new FakeLlm({ ...allFakeHandlers }).on("attachments.letter_request", () => ({
      paragraphs: [
        {
          text: "Gallup Food Pantry will contribute $50,000 and 3 staff to the project.",
          factIds: [],
        },
      ],
      outline: ["Confirm the $50,000 pledge."],
    }));
    const ctx = createAppContext(env, { llm });
    const letter = await createSupportLetter(ctx, {
      orgId,
      applicationId: appId,
      userId,
      data: { partnerName: "Gallup Food Pantry", partnerEmail: "pantry@partner.test" },
    });
    expect(llm.calls.some((c) => c.purpose === "attachments.letter_request")).toBe(true);
    expect(letter.draftSource).toBe("template");
    expect(letter.emailIntro).not.toContain("50,000");
    expect(letter.outline.join(" ")).not.toContain("50,000");
    expect(letter.emailIntro).toContain(
      "Gallup Food Pantry provides lunch for trainees on Fridays.",
    );
  });

  it("sends a hashed, expiring, single-purpose link; wrong tokens 404", async () => {
    const { userId, orgId } = await setupTenant();
    const { appId } = await seedApp(orgId, [LETTERS]);
    const { letter, token, mail } = await createAndSend(
      orgId,
      userId,
      appId,
      "pantry1@partner.test",
    );
    expect(letter.status).toBe("sent");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(mail?.replyTo).toBe("director@swif.test");
    expect(mail?.html).toContain(`/letters/${token}`);

    const row = await testDb()
      .select()
      .from(supportLetterRequests)
      .where(eq(supportLetterRequests.id, letter.id))
      .get();
    expect(row?.requestTokenHash).toBe(await hashLetterToken(token));
    expect((row?.tokenExpiresAt?.getTime() ?? 0) - (row?.sentAt?.getTime() ?? 0)).toBe(30 * DAY);
    expect(row?.requestTokenHash).not.toContain(token);
    expect(JSON.stringify(row)).not.toContain(token);

    const info = await call(`/api/letters/${token}`);
    expect(info.status).toBe(200);
    const body = (await info.json()) as PublicLetterInfoDto;
    // Minimal info only: nothing about the org's application, facts, email or ids.
    expect(Object.keys(body).sort()).toEqual([
      "acceptedTypes",
      "dueAt",
      "grantTitle",
      "maxBytes",
      "orgName",
      "partnerName",
    ]);
    expect(body).toMatchObject({
      orgName: "SWIF",
      grantTitle: "Rural Workforce Fund",
      partnerName: "Gallup Food Pantry",
    });
    expect(JSON.stringify(body)).not.toMatch(/app_|org_|fct_|slr_|pantry1@/);

    const flipped = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
    expect((await call(`/api/letters/${flipped}`)).status).toBe(404);
    expect((await call("/api/letters/not-a-token")).status).toBe(404);
    expect((await call(`/api/letters/${await hashLetterToken(token)}`)).status).toBe(404);
    // The token only opens its own read + upload, nothing else.
    expect((await call(`/api/letters/${token}/attachments`)).status).toBe(404);
    expect(
      (
        await call(`/api/orgs/${orgId}/applications/${appId}/support-letters`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).status,
    ).toBe(401);

    // Resending rotates the link: the old one stops working.
    const resent = await call(`${lettersPath(orgId, appId)}/${letter.id}/send`, {
      method: "POST",
      as: userId,
    });
    expect(resent.status).toBe(200);
    const newToken = tokenFromEmail(mailsTo("pantry1@partner.test").at(-1)?.text ?? "");
    expect(newToken).not.toBe(token);
    expect((await call(`/api/letters/${token}`)).status).toBe(404);
    expect((await call(`/api/letters/${newToken}`)).status).toBe(200);

    // Expired after 30 days.
    await testDb()
      .update(supportLetterRequests)
      .set({ tokenExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(supportLetterRequests.id, letter.id));
    const expired = await call(`/api/letters/${newToken}`);
    expect(expired.status).toBe(410);
    expect(((await expired.json()) as { error: { code: string } }).error.code).toBe("link_expired");
  });

  it("validates uploads like the documents route and ingests the letter once", async () => {
    const { userId, orgId } = await setupTenant();
    const { appId } = await seedApp(orgId, [LETTERS]);
    const { letter, token } = await createAndSend(orgId, userId, appId, "pantry2@partner.test");
    const upload = (file: File | null, consent = "true") => {
      const form = new FormData();
      if (file) form.set("file", file);
      form.set("consent", consent);
      return call(`/api/letters/${token}/upload`, { method: "POST", body: form });
    };
    const pdf = (name: string, bytes: Uint8Array<ArrayBuffer> = PDF(name)) =>
      new File([bytes], name, { type: "application/pdf" });

    expect((await upload(pdf("letter.pdf"), "false")).status).toBe(400);
    expect((await upload(null)).status).toBe(400);
    expect((await upload(new File(["hello"], "letter.txt", { type: "text/plain" }))).status).toBe(
      415,
    );
    const fake = await upload(
      new File(["MZ not a pdf"], "letter.pdf", { type: "application/pdf" }),
    );
    expect(fake.status).toBe(415);
    expect(((await fake.json()) as { error: { code: string } }).error.code).toBe(
      "file_content_mismatch",
    );
    const big = new Uint8Array(10 * 1024 * 1024 + 10);
    big.set(new TextEncoder().encode("%PDF-1.4"));
    expect((await upload(pdf("big.pdf", big))).status).toBe(413);
    // Nothing stored so far.
    const before = await testDb()
      .select()
      .from(documents)
      .where(and(eq(documents.orgId, orgId), eq(documents.kind, "letter_of_support")));
    expect(before).toHaveLength(0);

    const ok = await upload(pdf("signed-letter.pdf"));
    expect(ok.status).toBe(201);
    const row = await testDb()
      .select()
      .from(supportLetterRequests)
      .where(eq(supportLetterRequests.id, letter.id))
      .get();
    expect(row?.status).toBe("received");
    const doc = await testDb()
      .select()
      .from(documents)
      .where(eq(documents.id, row?.receivedDocumentId ?? ""))
      .get();
    expect(doc).toMatchObject({ orgId, kind: "letter_of_support", mimeType: "application/pdf" });
    expect(doc?.r2Key.startsWith(`orgs/${orgId}/documents/`)).toBe(true);
    // Staff are notified; the checklist item is filled; reminders are skipped.
    const ntf = await testDb()
      .select()
      .from(notifications)
      .where(
        and(eq(notifications.orgId, orgId), eq(notifications.kind, "support_letter.received")),
      );
    expect(ntf.length).toBeGreaterThan(0);
    const list = (await (
      await call(checklistPath(orgId, appId), { as: userId })
    ).json()) as ChecklistBody;
    expect(list.items[0]).toMatchObject({
      status: "uploaded",
      documentId: doc?.id,
      matchSource: "partner",
    });
    const fups = await testDb().select().from(followups).where(eq(followups.applicationId, appId));
    expect(fups.length).toBe(2);
    expect(fups.every((f) => f.status === "skipped")).toBe(true);
    // Single purpose: the link is closed after one letter.
    const second = await upload(pdf("again.pdf"));
    expect(second.status).toBe(410);
    expect((await call(`/api/letters/${token}`)).status).toBe(410);
  });

  it("rate-limits the public upload per IP", async () => {
    const { userId, orgId } = await setupTenant();
    const { appId } = await seedApp(orgId, [LETTERS]);
    const { token } = await createAndSend(orgId, userId, appId, "pantry3@partner.test");
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const form = new FormData();
      form.set("consent", "false");
      const res = await call(`/api/letters/${token}/upload`, {
        method: "POST",
        body: form,
        headers: { [TEST_RATE_LIMIT_HEADER]: "enforce", "cf-connecting-ip": "203.0.113.77" },
      });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 400)).toBe(true);
    expect(statuses[5]).toBe(429);
  });

  it("reminds the partner 7 and 2 days before the due date through the followups sweep", async () => {
    const { userId, orgId } = await setupTenant();
    const { appId } = await seedApp(orgId, [LETTERS]);
    const { letter, token } = await createAndSend(orgId, userId, appId, "pantry4@partner.test");
    const due = new Date(letter.dueAt ?? "");
    const fups = await testDb().select().from(followups).where(eq(followups.applicationId, appId));
    expect(fups.map((f) => f.dedupeKey).sort()).toEqual([
      `support_letter:${letter.id}:2d`,
      `support_letter:${letter.id}:7d`,
    ]);
    const before = mailsTo("pantry4@partner.test").length;
    const teamBefore = mailsTo("team@swif.test").length;
    const at = (ms: number) => createAppContext(env, { now: () => new Date(ms) });

    // Not due yet.
    expect((await sendDueLetterReminders(at(due.getTime() - 8 * DAY))).sent).toBe(0);
    const r7 = await sendDueLetterReminders(at(due.getTime() - 7 * DAY + 60_000));
    expect(r7.sent).toBeGreaterThanOrEqual(1);
    const mail = mailsTo("pantry4@partner.test").at(-1);
    expect(mailsTo("pantry4@partner.test").length).toBe(before + 1);
    expect(mail?.subject).toContain("Reminder");
    // Same link (re-derived, never stored).
    expect(tokenFromEmail(mail?.text ?? "")).toBe(token);
    const row = await testDb()
      .select()
      .from(supportLetterRequests)
      .where(eq(supportLetterRequests.id, letter.id))
      .get();
    expect(await deriveLetterToken(env, letter.id, row?.tokenNonce ?? "")).toBe(token);
    expect(row?.reminderCount).toBe(1);
    // Idempotent, and the generic sweep doesn't email the team about these rows.
    await sendDueLetterReminders(at(due.getTime() - 7 * DAY + 120_000));
    await sendDueFollowups(at(due.getTime() - 7 * DAY + 120_000));
    expect(mailsTo("pantry4@partner.test").length).toBe(before + 1);
    expect(mailsTo("team@swif.test").filter((m) => m.subject.includes("Gallup")).length).toBe(0);
    expect(mailsTo("team@swif.test").length).toBeGreaterThanOrEqual(teamBefore);

    await sendDueLetterReminders(at(due.getTime() - 2 * DAY + 60_000));
    expect(mailsTo("pantry4@partner.test").length).toBe(before + 2);
  });
});

describe("submission with attachments", () => {
  it("includes matched attachments in the package and attaches the files to the funder email", async () => {
    const { userId, orgId } = await setupTenant();
    const irs = await addDoc(orgId, "IRS Determination Letter", "other");
    await addDoc(orgId, "Program budget", "budget");
    const { appId, verId } = await seedApp(orgId, [IRS, BUDGET, { ...BOARD, required: false }]);
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
    const pkg = JSON.parse((await (await env.FILES.get(sub.packageR2Key))?.text()) ?? "{}") as {
      attachmentsChecklist: {
        name: string;
        status?: string;
        documentId?: string;
        filename?: string;
      }[];
    };
    expect(pkg.attachmentsChecklist.map((a) => [a.name, a.status, a.filename ?? null])).toEqual([
      ["IRS determination letter", "matched", "IRS Determination Letter.pdf"],
      ["Project budget", "matched", "Program budget.pdf"],
      ["Board list", "missing", null],
    ]);
    expect(pkg.attachmentsChecklist[0]?.documentId).toBe(irs);
    const mail = mailsTo("grants@funder.test").find(
      (m) => m.idempotencyKey === `submission:${sub.id}`,
    );
    const names = (mail?.attachments ?? []).map((a) => a.filename);
    expect(names).toEqual(
      expect.arrayContaining(["IRS Determination Letter.pdf", "Program budget.pdf"]),
    );
    expect(names).toHaveLength(4); // application DOCX + TXT + two attachments
    expect(mail?.text).toContain("IRS Determination Letter.pdf");
  });

  it("lists attachments in the manual guide when they total more than 10 MB", async () => {
    const { userId, orgId } = await setupTenant();
    await addDoc(orgId, "IRS Determination Letter", "other", { sizeBytes: 11 * 1024 * 1024 });
    const { appId, verId } = await seedApp(orgId, [IRS]);
    const sub = await submitApplication(createAppContext(env), {
      orgId,
      applicationId: appId,
      versionId: verId,
      submittedByType: "user",
      submittedBy: userId,
      approvedBy: userId,
    });
    expect(sub.channel).toBe("manual");
    const meta = sub.metadata as { fallbackReason?: string; guide?: { steps: string[] } };
    expect(meta.fallbackReason).toContain("10 MB");
    expect(meta.guide?.steps.join(" ")).toContain(
      'IRS determination letter (download "IRS Determination Letter.pdf"',
    );
  });

  it("blocks submission (not drafting) on a missing required attachment until it is provided or waived", async () => {
    const { userId, orgId } = await setupTenant();
    const { appId, verId } = await seedApp(orgId, [BOARD]);
    const ctx = createAppContext(env);
    const input = {
      orgId,
      applicationId: appId,
      versionId: verId,
      submittedByType: "user" as const,
      submittedBy: userId,
      approvedBy: userId,
    };
    const err = await submitApplication(ctx, input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(409);
    expect((err as AppError).code).toBe("missing_attachments");
    const flags = await testDb()
      .select()
      .from(applicationFlags)
      .where(eq(applicationFlags.applicationId, appId));
    expect(flags.map((f) => [f.severity, f.kind, f.message, f.status])).toEqual([
      ["blocker", "other", "Missing required attachment: Board list", "open"],
    ]);
    // A retry does not duplicate the flag.
    await submitApplication(ctx, input).catch(() => undefined);
    expect(
      await testDb()
        .select()
        .from(applicationFlags)
        .where(eq(applicationFlags.applicationId, appId)),
    ).toHaveLength(1);
    expect(
      mailsTo("grants@funder.test").filter(
        (m) => m.subject.includes("Trades Academy") && m.idempotencyKey?.includes(appId),
      ),
    ).toHaveLength(0);

    const list = (await (
      await call(checklistPath(orgId, appId), { as: userId })
    ).json()) as ChecklistBody;
    const res = await call(`${checklistPath(orgId, appId)}/${list.items[0]?.id}`, {
      method: "PATCH",
      as: userId,
      json: { action: "waive", reason: "Funder confirmed by phone it is not needed" },
    });
    expect(res.status).toBe(200);
    const flag = await testDb()
      .select()
      .from(applicationFlags)
      .where(eq(applicationFlags.applicationId, appId))
      .get();
    expect(flag?.status).toBe("resolved");
    expect(flag?.resolution).toContain("Waived");
    const sub = await submitApplication(ctx, input);
    expect(sub.status).toBe("sent");
    const pkg = JSON.parse((await (await env.FILES.get(sub.packageR2Key))?.text()) ?? "{}") as {
      attachmentsChecklist: { status?: string; note?: string }[];
    };
    expect(pkg.attachmentsChecklist[0]).toMatchObject({
      status: "waived",
      note: "Funder confirmed by phone it is not needed",
    });
  });
});
