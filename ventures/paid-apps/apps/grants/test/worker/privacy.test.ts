import { env } from "cloudflare:workers";
import type { MemberRole } from "@shared/enums";
import { createAppContext, testFakes } from "@worker/context";
import {
  applications,
  applicationVersions,
  auditLog,
  consentRecords,
  dataExports,
  documentChunks,
  documents,
  facts,
  interviews,
  interviewTurns,
  member,
  opportunities,
  opportunityMatches,
  organization,
  orgSettings,
  projects,
  purgedFiles,
  submissions,
} from "@worker/db/schema";
import type { Env } from "@worker/env";
import { newId } from "@worker/lib/ids";
import { runRetentionSweep } from "@worker/services/privacy/retention";
import { eq, inArray } from "drizzle-orm";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { api, createTestUser, setupTenant, testDb } from "./helpers";

const db = testDb();
const FILES = (env as unknown as Env).FILES;

async function addMember(orgId: string, role: MemberRole) {
  const u = await createTestUser();
  await db.insert(member).values({
    id: newId("org").replace("org_", "mem_"),
    organizationId: orgId,
    userId: u.id,
    role,
  });
  return u.id;
}

/** Seeds a representative slice of tenant data (rows, R2 files, vectors) for one org. */
async function seedOrgData(orgId: string, userId: string) {
  const docId = newId("doc");
  const r2Key = `orgs/${orgId}/documents/${docId}/original`;
  const textR2Key = `orgs/${orgId}/documents/${docId}/text.md`;
  await FILES.put(r2Key, "ORIGINAL BYTES of the annual report");
  await FILES.put(textR2Key, "# Annual report\nWe trained 42 apprentices.");
  await db.insert(documents).values({
    id: docId,
    orgId,
    uploadedBy: userId,
    title: "Annual report",
    kind: "annual_report",
    mimeType: "text/plain",
    sizeBytes: 35,
    sha256: "abc",
    r2Key,
    textR2Key,
    status: "ready",
    processedAt: new Date(),
  });
  const chunkId = newId("chk");
  await db.insert(documentChunks).values({
    id: chunkId,
    orgId,
    documentId: docId,
    ordinal: 0,
    text: "We trained 42 apprentices.",
    tokenEstimate: 6,
    charStart: 0,
    charEnd: 26,
  });
  await testFakes.vectors.upsert(orgId, [
    { id: chunkId, values: [1, 0, 0], metadata: { documentId: docId, kind: "annual_report" } },
  ]);
  const projectId = newId("prj");
  await db.insert(projects).values({ id: projectId, orgId, title: "Trades academy" });
  await db.insert(facts).values({
    id: newId("fct"),
    orgId,
    category: "outcome",
    statement: "Trained 42 apprentices in 2025",
    sourceType: "document",
    sourceDocumentId: docId,
    sourceChunkId: chunkId,
    sourceQuote: "We trained 42 apprentices.",
    projectId,
  });
  const interviewId = newId("int");
  await db
    .insert(interviews)
    .values({ id: interviewId, orgId, kind: "onboarding", title: "Intro" });
  const audioKey = `orgs/${orgId}/interviews/${interviewId}/turn0.webm`;
  await FILES.put(audioKey, "AUDIO");
  await db.insert(interviewTurns).values({
    id: newId("trn"),
    orgId,
    interviewId,
    ordinal: 0,
    role: "respondent",
    content: "We run a trades program.",
    inputMode: "voice",
    audioR2Key: audioKey,
  });
  const oppId = newId("opp");
  await db.insert(opportunities).values({
    id: oppId,
    source: "url_import",
    sourceId: oppId,
    privateToOrgId: orgId,
    funderName: "Local Foundation",
    title: "Private RFP",
  });
  await db.insert(opportunityMatches).values({ id: newId("mat"), orgId, opportunityId: oppId });
  const appId = newId("app");
  await db.insert(applications).values({ id: appId, orgId, opportunityId: oppId, title: "App" });
  const verId = newId("ver");
  await db.insert(applicationVersions).values({
    id: verId,
    orgId,
    applicationId: appId,
    versionNumber: 1,
    content: { sections: [], gaps: [] } as never,
    authorType: "system",
  });
  const pkgKey = `orgs/${orgId}/submissions/${appId}/package.json`;
  await FILES.put(pkgKey, "{}");
  await db.insert(submissions).values({
    id: newId("sub"),
    orgId,
    applicationId: appId,
    versionId: verId,
    channel: "manual",
    packageR2Key: pkgKey,
    packageSha256: "def",
    submittedByType: "user",
  });
  return { docId, r2Key, textR2Key, chunkId, audioKey, oppId };
}

const json = async <T>(res: Response) => (await res.json()) as T;
const settingsOf = (orgId: string) =>
  db.select().from(orgSettings).where(eq(orgSettings.orgId, orgId)).get();

describe("privacy: consents", () => {
  it("records consent with hashed IP and toggles org settings", async () => {
    const { orgId, userId } = await setupTenant("admin");
    const post = (scope: string, granted: boolean) =>
      api(`/api/orgs/${orgId}/privacy/consents`, {
        method: "POST",
        as: userId,
        json: { scope, granted },
        headers: { "CF-Connecting-IP": "203.0.113.7", "User-Agent": "vitest-agent" },
      });

    const res = await post("website_crawl", true);
    expect(res.status).toBe(201);
    const rec = await json<{ ipHash: string; userAgent: string; policyVersion: string }>(res);
    expect(rec.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.ipHash).not.toContain("203.0.113.7");
    expect(rec.userAgent).toBe("vitest-agent");
    expect((await settingsOf(orgId))?.allowWebsiteCrawl).toBe(true);

    expect((await post("voice_recording", true)).status).toBe(201);
    expect((await settingsOf(orgId))?.storeVoiceRecordings).toBe(true);

    expect((await post("website_crawl", false)).status).toBe(201);
    expect((await post("voice_recording", false)).status).toBe(201);
    const s = await settingsOf(orgId);
    expect(s?.allowWebsiteCrawl).toBe(false);
    expect(s?.storeVoiceRecordings).toBe(false);

    await db
      .update(orgSettings)
      .set({ autopilotEnabled: true })
      .where(eq(orgSettings.orgId, orgId));
    expect((await post("autopilot_submission", false)).status).toBe(201);
    expect((await settingsOf(orgId))?.autopilotEnabled).toBe(false);

    const list = await json<{
      items: { scope: string; granted: boolean }[];
      current: Record<string, { granted: boolean }>;
    }>(await api(`/api/orgs/${orgId}/privacy/consents`, { as: userId }));
    expect(list.items).toHaveLength(5);
    expect(list.current.website_crawl?.granted).toBe(false);
    expect(list.current.voice_recording?.granted).toBe(false);
  });

  it("requires admin for org-level scopes but lets any member record personal ones", async () => {
    const { orgId } = await setupTenant("owner");
    const editor = await addMember(orgId, "editor");
    const crawl = await api(`/api/orgs/${orgId}/privacy/consents`, {
      method: "POST",
      as: editor,
      json: { scope: "website_crawl", granted: true },
    });
    expect(crawl.status).toBe(403);
    expect((await settingsOf(orgId))?.allowWebsiteCrawl).toBe(false);
    const tos = await api(`/api/orgs/${orgId}/privacy/consents`, {
      method: "POST",
      as: editor,
      json: { scope: "terms_of_service", granted: true },
    });
    expect(tos.status).toBe(201);
    const bad = await api(`/api/orgs/${orgId}/privacy/consents`, {
      method: "POST",
      as: editor,
      json: { scope: "everything", granted: true },
    });
    expect(bad.status).toBe(400);
  });
});

describe("privacy: audit log", () => {
  it("is newest-first with cursor pagination, admin only", async () => {
    const { orgId, userId } = await setupTenant("owner");
    const base = Date.now() - 60_000;
    for (let i = 0; i < 5; i++) {
      await db.insert(auditLog).values({
        id: newId("aud"),
        orgId,
        actorType: "user",
        actorId: userId,
        action: `test.event_${i}`,
        createdAt: new Date(base + i * 1000),
      });
    }
    const seen: string[] = [];
    let cursor: string | null | undefined;
    for (let page = 0; page < 5; page++) {
      const qs = `?limit=2${cursor ? `&cursor=${cursor}` : ""}`;
      const res = await api(`/api/orgs/${orgId}/privacy/audit-log${qs}`, { as: userId });
      expect(res.status).toBe(200);
      const body = await json<{ items: { action: string }[]; nextCursor: string | null }>(res);
      seen.push(...body.items.map((i) => i.action));
      cursor = body.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toEqual([4, 3, 2, 1, 0].map((i) => `test.event_${i}`));

    const editor = await addMember(orgId, "editor");
    const res = await api(`/api/orgs/${orgId}/privacy/audit-log`, { as: editor });
    expect(res.status).toBe(403);
    const badCursor = await api(`/api/orgs/${orgId}/privacy/audit-log?cursor=!!!`, { as: userId });
    expect(badCursor.status).toBe(400);
  });
});

describe("privacy: exports", () => {
  it("builds a zip with every tenant table and the org's files", async () => {
    const a = await setupTenant("admin");
    const b = await setupTenant("owner");
    const seeded = await seedOrgData(a.orgId, a.userId);
    await seedOrgData(b.orgId, b.userId);

    const res = await api(`/api/orgs/${a.orgId}/privacy/exports`, { method: "POST", as: a.userId });
    expect(res.status).toBe(201);
    const exp = await json<{ id: string; status: string; expiresAt: string; r2Key: string }>(res);
    expect(exp.status).toBe("ready");
    expect(exp.r2Key).toBe(`orgs/${a.orgId}/exports/${exp.id}.zip`);
    const ttl = new Date(exp.expiresAt).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(6.9 * 86_400_000);
    expect(ttl).toBeLessThanOrEqual(7 * 86_400_000);

    const dl = await api(`/api/orgs/${a.orgId}/privacy/exports/${exp.id}/download`, {
      as: a.userId,
    });
    expect(dl.status).toBe(200);
    expect(dl.headers.get("Content-Type")).toBe("application/zip");
    const files = unzipSync(new Uint8Array(await dl.arrayBuffer()));
    const names = Object.keys(files);
    for (const n of [
      "manifest.json",
      "README.txt",
      "data/organization.json",
      "data/documents.json",
      "data/document_chunks.json",
      "data/facts.json",
      "data/interviews.json",
      "data/interview_turns.json",
      "data/applications.json",
      "data/submissions.json",
      "data/member.json",
      "data/org_settings.json",
      "data/consent_records.json",
      "data/users.json",
      `files/documents/${seeded.docId}/original`,
      `files/documents/${seeded.docId}/text.md`,
    ]) {
      expect(names, n).toContain(n);
    }
    expect(names.some((n) => n.startsWith("files/exports/"))).toBe(false);
    const original = files[`files/documents/${seeded.docId}/original`];
    expect(original && strFromU8(original)).toBe("ORIGINAL BYTES of the annual report");
    const docs = JSON.parse(strFromU8(files["data/documents.json"] as Uint8Array)) as {
      id: string;
      orgId: string;
    }[];
    expect(docs.map((d) => d.id)).toEqual([seeded.docId]);
    const opps = JSON.parse(strFromU8(files["data/opportunities.json"] as Uint8Array)) as {
      privateToOrgId: string;
    }[];
    expect(opps).toHaveLength(1);
    expect(opps[0]?.privateToOrgId).toBe(a.orgId);
    // Nothing from org B leaks into A's export.
    const all = names.map((n) => strFromU8(files[n] as Uint8Array)).join("\n");
    expect(all).not.toContain(b.orgId);

    // Cross-tenant and role checks.
    const other = await api(`/api/orgs/${a.orgId}/privacy/exports/${exp.id}/download`, {
      as: b.userId,
    });
    expect(other.status).toBe(404);
    const viaOwnOrg = await api(`/api/orgs/${b.orgId}/privacy/exports/${exp.id}/download`, {
      as: b.userId,
    });
    expect(viaOwnOrg.status).toBe(404);
    const editor = await addMember(a.orgId, "editor");
    expect(
      (await api(`/api/orgs/${a.orgId}/privacy/exports`, { method: "POST", as: editor })).status,
    ).toBe(403);
    expect(
      (await api(`/api/orgs/${a.orgId}/privacy/exports/${exp.id}/download`, { as: editor })).status,
    ).toBe(403);
  });
});

describe("privacy: delete organization", () => {
  it("requires the owner and the exact name", async () => {
    const { orgId, userId } = await setupTenant("owner");
    const admin = await addMember(orgId, "admin");
    const url = `/api/orgs/${orgId}/privacy/org`;
    expect(
      (await api(url, { method: "DELETE", as: admin, json: { confirmName: "Test Org" } })).status,
    ).toBe(403);
    expect(
      (await api(url, { method: "DELETE", as: userId, json: { confirmName: "Wrong" } })).status,
    ).toBe(400);
    expect(
      await db.select().from(organization).where(eq(organization.id, orgId)).get(),
    ).toBeTruthy();
  });

  it("removes R2 objects, vectors and all rows, leaving other orgs untouched", async () => {
    const a = await setupTenant("owner");
    const b = await setupTenant("owner");
    const sa = await seedOrgData(a.orgId, a.userId);
    const sb = await seedOrgData(b.orgId, b.userId);
    await api(`/api/orgs/${a.orgId}/privacy/consents`, {
      method: "POST",
      as: a.userId,
      json: { scope: "data_processing", granted: true },
    });
    const exp = await api(`/api/orgs/${a.orgId}/privacy/exports`, { method: "POST", as: a.userId });
    expect(exp.status).toBe(201);

    const res = await api(`/api/orgs/${a.orgId}/privacy/org`, {
      method: "DELETE",
      as: a.userId,
      json: { confirmName: "Test Org" },
    });
    expect(res.status).toBe(202);

    // R2: nothing left under A's prefix; B's files intact.
    expect((await FILES.list({ prefix: `orgs/${a.orgId}/` })).objects).toHaveLength(0);
    expect(await FILES.get(sb.r2Key)).not.toBeNull();
    expect(await FILES.head(sb.audioKey)).not.toBeNull();

    // Vectors: A's chunk gone, B's chunk still searchable.
    expect(await testFakes.vectors.query(a.orgId, [1, 0, 0], { topK: 5 })).toHaveLength(0);
    const bHits = await testFakes.vectors.query(b.orgId, [1, 0, 0], { topK: 5 });
    expect(bHits.map((h) => h.id)).toContain(sb.chunkId);

    // Rows: gone for A across many tables, present for B.
    const count = async (t: "a" | "b") => {
      const orgId = t === "a" ? a.orgId : b.orgId;
      return {
        organization: (await db.select().from(organization).where(eq(organization.id, orgId)))
          .length,
        member: (await db.select().from(member).where(eq(member.organizationId, orgId))).length,
        settings: (await db.select().from(orgSettings).where(eq(orgSettings.orgId, orgId))).length,
        documents: (await db.select().from(documents).where(eq(documents.orgId, orgId))).length,
        chunks: (await db.select().from(documentChunks).where(eq(documentChunks.orgId, orgId)))
          .length,
        facts: (await db.select().from(facts).where(eq(facts.orgId, orgId))).length,
        turns: (await db.select().from(interviewTurns).where(eq(interviewTurns.orgId, orgId)))
          .length,
        apps: (await db.select().from(applications).where(eq(applications.orgId, orgId))).length,
        subs: (await db.select().from(submissions).where(eq(submissions.orgId, orgId))).length,
        consents: (await db.select().from(consentRecords).where(eq(consentRecords.orgId, orgId)))
          .length,
        exports: (await db.select().from(dataExports).where(eq(dataExports.orgId, orgId))).length,
        audit: (await db.select().from(auditLog).where(eq(auditLog.orgId, orgId))).length,
      };
    };
    const left = await count("a");
    expect(
      Object.values(left).every((n) => n === 0),
      JSON.stringify(left),
    ).toBe(true);
    const kept = await count("b");
    expect(kept.organization).toBe(1);
    expect(kept.documents).toBe(1);
    expect(kept.facts).toBe(1);
    expect(kept.subs).toBe(1);
    expect(
      await db
        .select()
        .from(opportunities)
        .where(inArray(opportunities.id, [sa.oppId, sb.oppId])),
    ).toHaveLength(1);

    // Non-PII receipt survives (org_id null).
    const receipt = await db.select().from(auditLog).where(eq(auditLog.targetId, a.orgId)).all();
    expect(receipt.map((r) => r.action)).toContain("organization.deleted");
    expect(JSON.stringify(receipt)).not.toContain("annual report");

    // The deleted org is gone for its former owner.
    expect((await api(`/api/orgs/${a.orgId}/privacy/consents`, { as: a.userId })).status).toBe(404);
  });
});

describe("privacy: tenant isolation", () => {
  it("404s every privacy route for non-members", async () => {
    const a = await setupTenant("owner");
    const b = await setupTenant("owner");
    const paths: [string, string, unknown?][] = [
      ["GET", "consents"],
      ["POST", "consents", { scope: "website_crawl", granted: true }],
      ["GET", "audit-log"],
      ["GET", "exports"],
      ["POST", "exports"],
      ["DELETE", "org", { confirmName: "Test Org" }],
    ];
    for (const [method, p, body] of paths) {
      const res = await api(`/api/orgs/${a.orgId}/privacy/${p}`, {
        method,
        as: b.userId,
        json: body,
      });
      expect(res.status, `${method} ${p}`).toBe(404);
    }
    expect((await settingsOf(a.orgId))?.allowWebsiteCrawl).toBe(false);
    expect(
      await db.select().from(organization).where(eq(organization.id, a.orgId)).get(),
    ).toBeTruthy();
  });
});

describe("privacy: retention sweep", () => {
  it("purges old originals (keeping text), old audio, and expired exports", async () => {
    const { orgId, userId } = await setupTenant("owner");
    const s = await seedOrgData(orgId, userId);
    const old = new Date(Date.now() - 40 * 86_400_000);
    await db.update(documents).set({ processedAt: old }).where(eq(documents.id, s.docId));
    await db.update(interviewTurns).set({ createdAt: old }).where(eq(interviewTurns.orgId, orgId));
    await db
      .update(orgSettings)
      .set({ rawFileRetentionDays: 30 })
      .where(eq(orgSettings.orgId, orgId));
    const expKey = `orgs/${orgId}/exports/old.zip`;
    await FILES.put(expKey, "zip");
    const expId = newId("exp");
    await db.insert(dataExports).values({
      id: expId,
      orgId,
      status: "ready",
      r2Key: expKey,
      expiresAt: new Date(Date.now() - 1000),
    });

    const ctx = createAppContext(env as unknown as Env);
    const r1 = await runRetentionSweep(ctx);
    expect(r1.originalsPurged).toBeGreaterThanOrEqual(1);
    expect(r1.audioPurged).toBeGreaterThanOrEqual(1);
    expect(r1.exportsExpired).toBeGreaterThanOrEqual(1);
    expect(await FILES.head(s.r2Key)).toBeNull();
    expect(await FILES.head(s.textR2Key)).not.toBeNull();
    expect(await FILES.head(s.audioKey)).toBeNull();
    expect(await FILES.head(expKey)).toBeNull();
    const turn = await db
      .select()
      .from(interviewTurns)
      .where(eq(interviewTurns.orgId, orgId))
      .get();
    expect(turn?.audioR2Key).toBeNull();
    expect(turn?.content).toBe("We run a trades program.");
    const purged = await db.select().from(purgedFiles).where(eq(purgedFiles.orgId, orgId)).all();
    expect(purged.map((p) => p.targetId)).toContain(s.docId);
    const e = await db.select().from(dataExports).where(eq(dataExports.id, expId)).get();
    expect(e?.status).toBe("expired");

    const r2 = await runRetentionSweep(ctx);
    const mine = await db.select().from(purgedFiles).where(eq(purgedFiles.orgId, orgId)).all();
    expect(mine).toHaveLength(purged.length);
    expect(r2.exportsExpired).toBe(0);
  });
});
