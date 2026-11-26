import { env } from "cloudflare:workers";
import type { ChunkDto, DocumentDto, FactDto } from "@shared/api/types";
import { POLICY_VERSION } from "@shared/legal";
import { createAppContext, testFakes } from "@worker/context";
import {
  auditLog,
  consentRecords,
  documentChunks,
  documents,
  orgSettings,
} from "@worker/db/schema";
import type { DocumentConverter } from "@worker/ports/document-converter";
import { createDocumentFromText, getDocumentText } from "@worker/services/ingestion";
import { processDocument } from "@worker/services/ingestion/jobs";
import { runRetentionSweep } from "@worker/services/privacy/retention";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { api, setupTenant, testDb } from "./helpers";

type Detail = DocumentDto & { chunks: ChunkDto[]; facts: FactDto[] };

const MISSION_MD = `# Southwest Indian Foundation

## Mission

Southwest Indian Foundation serves Native American families in the Gallup area of New Mexico.

## Workforce Development

${Array.from(
  { length: 60 },
  (_, i) =>
    `Trainee cohort ${i} learned carpentry, plumbing and electrical skills while building homes for families.`,
).join(" ")}
`;

function form(
  file: File,
  fields: Record<string, string> = {},
  opts: { consent?: string | null } = {},
) {
  const fd = new FormData();
  fd.set("file", file);
  fd.set("kind", fields.kind ?? "program_description");
  for (const [k, v] of Object.entries(fields)) if (k !== "kind") fd.set(k, v);
  if (opts.consent !== null) fd.set("consent", opts.consent ?? "true");
  return fd;
}

async function upload(
  orgId: string,
  userId: string,
  file: File,
  fields: Record<string, string> = {},
  opts: { consent?: string | null } = {},
) {
  return api(`/api/orgs/${orgId}/documents`, {
    method: "POST",
    as: userId,
    body: form(file, fields, opts),
  });
}

const unique = (s: string) => `${s}\n\nRef ${crypto.randomUUID()}`;

async function vectorIds(orgId: string, documentId: string) {
  const dims = 256; // FakeEmbedder
  const matches = await testFakes.vectors.query(orgId, new Array(dims).fill(0), {
    topK: 10_000,
    filter: { documentId },
  });
  return matches.map((m) => m.id).sort();
}

describe("POST /documents (upload)", () => {
  it("ingests a .txt file: R2 original + text, chunks, vectors, consent, audit", async () => {
    const { orgId, userId } = await setupTenant("editor");
    const text = unique("We train Navajo youth in the building trades.\n\nOur shop is in Gallup.");
    const res = await upload(
      orgId,
      userId,
      new File([text], "about-us.txt", { type: "text/plain" }),
    );
    expect(res.status).toBe(201);
    const doc = (await res.json()) as DocumentDto;
    expect(doc.id).toMatch(/^doc_/);
    expect(doc.orgId).toBe(orgId);
    expect(doc.title).toBe("about-us");
    expect(doc.kind).toBe("program_description");
    expect(doc.mimeType).toBe("text/plain");
    expect(doc.status).toBe("ready");
    expect(doc.chunkCount).toBeGreaterThan(0);
    expect(doc.r2Key).toBe(`orgs/${orgId}/documents/${doc.id}/original`);
    expect(doc.textR2Key).toBe(`orgs/${orgId}/documents/${doc.id}/text.md`);
    expect(doc.processedAt).toBeTruthy();

    const original = await env.FILES.get(doc.r2Key);
    expect(await original?.text()).toBe(text);
    expect(original?.customMetadata).toMatchObject({ orgId, mime: "text/plain" });
    expect(await (await env.FILES.get(doc.textR2Key ?? ""))?.text()).toBe(text.trim());

    const db = testDb();
    const consent = await db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.id, doc.consentRecordId ?? ""))
      .get();
    expect(consent).toMatchObject({
      orgId,
      userId,
      scope: "document_upload",
      policyVersion: POLICY_VERSION,
      granted: true,
    });
    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.orgId, orgId), eq(auditLog.targetId, doc.id)));
    expect(audits.map((a) => a.action)).toContain("document.uploaded");

    const detail = (await (
      await api(`/api/orgs/${orgId}/documents/${doc.id}`, { as: userId })
    ).json()) as Detail;
    expect(detail.chunks).toHaveLength(doc.chunkCount);
    expect(detail.chunks[0]?.text).toContain("building trades");
    expect(detail.chunks.every((c) => c.embeddedAt)).toBe(true);
    expect(Array.isArray(detail.facts)).toBe(true);
    expect(await vectorIds(orgId, doc.id)).toEqual(detail.chunks.map((c) => c.id).sort());
  });

  it("chunks markdown by heading and stores past-application metadata", async () => {
    const { orgId, userId } = await setupTenant();
    const res = await upload(
      orgId,
      userId,
      new File([unique(MISSION_MD)], "2024 HUD application.md", { type: "" }),
      {
        kind: "past_application",
        title: "HUD 2024",
        pastOutcome: "awarded",
        pastFunder: "HUD",
        pastAmountCents: "2500000",
        pastYear: "2024",
      },
    );
    expect(res.status).toBe(201);
    const doc = (await res.json()) as DocumentDto;
    expect(doc).toMatchObject({
      title: "HUD 2024",
      mimeType: "text/markdown",
      status: "ready",
      pastOutcome: "awarded",
      pastFunder: "HUD",
      pastAmountCents: 2500000,
      pastYear: 2024,
    });
    expect(doc.chunkCount).toBeGreaterThan(1);
    const detail = (await (
      await api(`/api/orgs/${orgId}/documents/${doc.id}`, { as: userId })
    ).json()) as Detail;
    expect(detail.chunks.map((c) => c.ordinal)).toEqual(detail.chunks.map((_, i) => i));
    expect(detail.chunks.some((c) => c.heading?.endsWith("Workforce Development"))).toBe(true);
    expect(detail.facts.every((f) => f.sourceDocumentId === doc.id && f.orgId === orgId)).toBe(
      true,
    );
  });

  it("ignores past-application fields for other kinds", async () => {
    const { orgId, userId } = await setupTenant();
    const res = await upload(orgId, userId, new File([unique("Budget")], "b.txt"), {
      kind: "budget",
      pastFunder: "HUD",
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as DocumentDto).pastFunder).toBeNull();
  });

  it("rejects a duplicate file in the same org with 409 and the existing id", async () => {
    const { orgId, userId } = await setupTenant();
    const text = unique("Same content twice");
    const first = (await (
      await upload(orgId, userId, new File([text], "a.txt", { type: "text/plain" }))
    ).json()) as DocumentDto;
    const res = await upload(orgId, userId, new File([text], "b.txt", { type: "text/plain" }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string; details: { documentId: string } } };
    expect(body.error.code).toBe("duplicate_document");
    expect(body.error.details.documentId).toBe(first.id);

    // Same bytes in another org are fine.
    const other = await setupTenant();
    const ok = await upload(other.orgId, other.userId, new File([text], "a.txt"));
    expect(ok.status).toBe(201);
  });

  it("requires consent=true", async () => {
    const { orgId, userId } = await setupTenant();
    const file = () => new File([unique("x")], "a.txt", { type: "text/plain" });
    for (const consent of [null, "false"]) {
      const res = await upload(orgId, userId, file(), {}, { consent });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
        "consent_required",
      );
    }
  });

  it("validates kind, MIME type and empty files", async () => {
    const { orgId, userId } = await setupTenant();
    const bad = await upload(orgId, userId, new File([unique("x")], "a.txt"), { kind: "nope" });
    expect(bad.status).toBe(400);
    const exe = await upload(
      orgId,
      userId,
      new File([unique("MZ")], "setup.exe", { type: "application/x-msdownload" }),
    );
    expect(exe.status).toBe(415);
    const empty = await upload(orgId, userId, new File([], "empty.txt", { type: "text/plain" }));
    expect(empty.status).toBe(400);
  });

  it("forbids viewers from uploading", async () => {
    const { orgId, userId } = await setupTenant("viewer");
    const res = await upload(orgId, userId, new File([unique("x")], "a.txt"));
    expect(res.status).toBe(403);
    const list = await api(`/api/orgs/${orgId}/documents`, { as: userId });
    expect(list.status).toBe(200);
  });
});

describe("POST /documents/text (paste)", () => {
  it("creates a ready markdown document; identical text is a 409", async () => {
    const { orgId, userId } = await setupTenant();
    const text = unique(MISSION_MD);
    const post = (title: string) =>
      api(`/api/orgs/${orgId}/documents/text`, {
        method: "POST",
        as: userId,
        json: { title, kind: "mission_statement", text },
      });
    const res = await post("Our history");
    expect(res.status).toBe(201);
    const doc = (await res.json()) as DocumentDto;
    expect(doc).toMatchObject({
      title: "Our history",
      kind: "mission_statement",
      mimeType: "text/markdown",
      status: "ready",
    });
    expect(doc.chunkCount).toBeGreaterThan(0);
    expect(await getDocumentText(createAppContext(env), orgId, doc.id)).toBe(text.trim());
    const again = await post("Again");
    expect(again.status).toBe(409);
  });

  it("validates the body", async () => {
    const { orgId, userId } = await setupTenant();
    const res = await api(`/api/orgs/${orgId}/documents/text`, {
      method: "POST",
      as: userId,
      json: { title: "", kind: "other", text: "" },
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("validation_error");
  });
});

describe("GET /documents", () => {
  it("lists newest first and filters by kind", async () => {
    const { orgId, userId } = await setupTenant();
    const a = (await (
      await upload(orgId, userId, new File([unique("A")], "a.txt"), { kind: "budget" })
    ).json()) as DocumentDto;
    await new Promise((r) => setTimeout(r, 5));
    const b = (await (
      await upload(orgId, userId, new File([unique("B")], "b.txt"), { kind: "policy" })
    ).json()) as DocumentDto;
    const all = (await (await api(`/api/orgs/${orgId}/documents`, { as: userId })).json()) as {
      items: DocumentDto[];
    };
    expect(all.items.map((d) => d.id)).toEqual([b.id, a.id]);
    const budgets = (await (
      await api(`/api/orgs/${orgId}/documents?kind=budget`, { as: userId })
    ).json()) as { items: DocumentDto[] };
    expect(budgets.items.map((d) => d.id)).toEqual([a.id]);
    const bad = await api(`/api/orgs/${orgId}/documents?kind=bogus`, { as: userId });
    expect(bad.status).toBe(400);
  });

  it("downloads the original as an attachment", async () => {
    const { orgId, userId } = await setupTenant();
    const text = unique("Download me");
    const doc = (await (
      await upload(orgId, userId, new File([text], 'we"ird/../name.txt', { type: "text/plain" }))
    ).json()) as DocumentDto;
    const res = await api(`/api/orgs/${orgId}/documents/${doc.id}/download`, { as: userId });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const cd = res.headers.get("content-disposition") ?? "";
    expect(cd).toMatch(/^attachment; filename="[^"/\\]+\.txt"/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(await res.text()).toBe(text);
  });

  it("serves uploaded HTML only as a sandboxed attachment", async () => {
    const { orgId, userId } = await setupTenant();
    const html = unique("<html><body><script>alert(1)</script>Annual report</body></html>");
    const doc = (await (
      await upload(orgId, userId, new File([html], "report.html", { type: "text/html" }))
    ).json()) as DocumentDto;
    const res = await api(`/api/orgs/${orgId}/documents/${doc.id}/download`, { as: userId });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
  });
});

describe("POST /documents content sniffing", () => {
  it("rejects files whose bytes do not match the declared type / extension", async () => {
    const { orgId, userId } = await setupTenant();
    const html = unique("<html><script>alert(document.cookie)</script></html>");
    for (const file of [
      new File([html], "report.pdf", { type: "application/pdf" }),
      new File([html], "photo.png", { type: "image/png" }),
      new File([html], "letter.docx", { type: "" }),
    ]) {
      const res = await upload(orgId, userId, file);
      expect(res.status, file.name).toBe(415);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
        "file_content_mismatch",
      );
    }
    const ok = await upload(
      orgId,
      userId,
      new File([`%PDF-1.4\n${crypto.randomUUID()}`], "real.pdf", { type: "application/pdf" }),
    );
    expect(ok.status).toBe(201);
  });
});

describe("DELETE /documents/:id", () => {
  it("removes R2 objects, vectors and rows", async () => {
    const { orgId, userId } = await setupTenant();
    const doc = (await (
      await upload(orgId, userId, new File([unique(MISSION_MD)], "m.md"))
    ).json()) as DocumentDto;
    expect((await vectorIds(orgId, doc.id)).length).toBe(doc.chunkCount);

    const res = await api(`/api/orgs/${orgId}/documents/${doc.id}`, {
      method: "DELETE",
      as: userId,
    });
    expect(res.status).toBe(204);
    expect(await env.FILES.get(doc.r2Key)).toBeNull();
    expect(await env.FILES.get(doc.textR2Key ?? "")).toBeNull();
    expect(await vectorIds(orgId, doc.id)).toEqual([]);
    const chunks = await testDb()
      .select()
      .from(documentChunks)
      .where(eq(documentChunks.documentId, doc.id));
    expect(chunks).toEqual([]);
    expect((await api(`/api/orgs/${orgId}/documents/${doc.id}`, { as: userId })).status).toBe(404);
    const audits = await testDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.orgId, orgId), eq(auditLog.targetId, doc.id)));
    expect(audits.map((a) => a.action)).toContain("document.deleted");
  });

  it("forbids viewers from deleting", async () => {
    const owner = await setupTenant();
    const doc = (await (
      await upload(owner.orgId, owner.userId, new File([unique("x")], "x.txt"))
    ).json()) as DocumentDto;
    const { createTestUser } = await import("./helpers");
    const viewer = await createTestUser();
    const { member } = await import("@worker/db/schema");
    await testDb()
      .insert(member)
      .values({
        id: `mem_${crypto.randomUUID()}`,
        organizationId: owner.orgId,
        userId: viewer.id,
        role: "viewer",
      });
    const res = await api(`/api/orgs/${owner.orgId}/documents/${doc.id}`, {
      method: "DELETE",
      as: viewer.id,
    });
    expect(res.status).toBe(403);
  });
});

describe("reprocess + job behaviour", () => {
  it("reprocess replaces chunks and vectors", async () => {
    const { orgId, userId } = await setupTenant();
    const doc = (await (
      await upload(orgId, userId, new File([unique(MISSION_MD)], "m.md"))
    ).json()) as DocumentDto;
    const before = await vectorIds(orgId, doc.id);
    const res = await api(`/api/orgs/${orgId}/documents/${doc.id}/reprocess`, {
      method: "POST",
      as: userId,
    });
    expect(res.status).toBe(200);
    const after = (await res.json()) as DocumentDto;
    expect(after.status).toBe("ready");
    expect(after.chunkCount).toBe(doc.chunkCount);
    const afterIds = await vectorIds(orgId, doc.id);
    expect(afterIds).toHaveLength(before.length);
    expect(afterIds.some((id) => before.includes(id))).toBe(false);
  });

  it("returns 410 for download/reprocess of an original purged by the retention sweep", async () => {
    const { orgId, userId } = await setupTenant();
    const doc = (await (
      await upload(orgId, userId, new File([unique(MISSION_MD)], "m.md"))
    ).json()) as DocumentDto;
    expect(doc.status).toBe("ready");
    const db = testDb();
    await db
      .update(documents)
      .set({ processedAt: new Date(Date.now() - 2 * 86_400_000) })
      .where(eq(documents.id, doc.id));
    await db
      .update(orgSettings)
      .set({ rawFileRetentionDays: 1 })
      .where(eq(orgSettings.orgId, orgId));
    const ctx = createAppContext(env);
    expect((await runRetentionSweep(ctx)).originalsPurged).toBeGreaterThanOrEqual(1);

    const dl = await api(`/api/orgs/${orgId}/documents/${doc.id}/download`, { as: userId });
    expect(dl.status).toBe(410);
    const body = (await dl.json()) as { error: { code: string; details: { reason: string } } };
    expect(body.error).toMatchObject({
      code: "original_unavailable",
      details: { reason: "retention_purged" },
    });

    const re = await api(`/api/orgs/${orgId}/documents/${doc.id}/reprocess`, {
      method: "POST",
      as: userId,
    });
    expect(re.status).toBe(410);
    // A queued process job for it is skipped: the document stays ready with its chunks.
    await processDocument(ctx, { type: "document.process", orgId, documentId: doc.id });
    const detail = (await (
      await api(`/api/orgs/${orgId}/documents/${doc.id}`, { as: userId })
    ).json()) as Detail;
    expect(detail.status).toBe("ready");
    expect(detail.chunks).toHaveLength(doc.chunkCount);
    expect(await getDocumentText(ctx, orgId, doc.id)).toContain("Southwest Indian Foundation");
  });

  it("returns 410 when the original is missing from R2", async () => {
    const { orgId, userId } = await setupTenant();
    const doc = (await (
      await upload(orgId, userId, new File([unique("Lost original")], "lost.txt"))
    ).json()) as DocumentDto;
    const row = await testDb().select().from(documents).where(eq(documents.id, doc.id)).get();
    await env.FILES.delete(row?.r2Key ?? "");
    const dl = await api(`/api/orgs/${orgId}/documents/${doc.id}/download`, { as: userId });
    expect(dl.status).toBe(410);
    expect(((await dl.json()) as { error: { details: unknown } }).error.details).toEqual({
      reason: "missing",
    });
    const re = await api(`/api/orgs/${orgId}/documents/${doc.id}/reprocess`, {
      method: "POST",
      as: userId,
    });
    expect(re.status).toBe(410);
    const after = await testDb().select().from(documents).where(eq(documents.id, doc.id)).get();
    expect(after?.status).toBe("ready");
  });

  it("marks the document failed (with a message) when conversion fails", async () => {
    const { orgId, userId } = await setupTenant();
    const doc = (await (
      await upload(orgId, userId, new File([unique("x")], "x.txt"))
    ).json()) as DocumentDto;
    const failing: DocumentConverter = {
      toMarkdown: async () => {
        throw new Error("Could not extract text from this file: corrupt PDF");
      },
    };
    await processDocument(createAppContext(env, { converter: failing }), {
      type: "document.process",
      orgId,
      documentId: doc.id,
    });
    const got = (await (
      await api(`/api/orgs/${orgId}/documents/${doc.id}`, { as: userId })
    ).json()) as Detail;
    expect(got.status).toBe("failed");
    expect(got.error).toContain("corrupt PDF");

    const empty: DocumentConverter = { toMarkdown: async () => ({ markdown: "  \n " }) };
    await processDocument(createAppContext(env, { converter: empty }), {
      type: "document.process",
      orgId,
      documentId: doc.id,
    });
    const got2 = (await (
      await api(`/api/orgs/${orgId}/documents/${doc.id}`, { as: userId })
    ).json()) as Detail;
    expect(got2.status).toBe("failed");
    expect(got2.error).toMatch(/No readable text/);
  });

  it("createDocumentFromText reuses identical text and getDocumentText returns it", async () => {
    const { orgId } = await setupTenant();
    const ctx = createAppContext(env);
    const text = unique("# About\n\nA page from our website.");
    const a = await createDocumentFromText(ctx, orgId, {
      title: "About",
      kind: "website_page",
      text,
      sourceUrl: "https://example.org/about",
    });
    const b = await createDocumentFromText(ctx, orgId, {
      title: "About again",
      kind: "website_page",
      text,
    });
    expect(b.documentId).toBe(a.documentId);
    expect(b.duplicate).toBe(true);
    expect(await getDocumentText(ctx, orgId, a.documentId)).toBe(text.trim());
    const other = await setupTenant();
    expect(await getDocumentText(ctx, other.orgId, a.documentId)).toBeNull();
  });
});

describe("tenant isolation", () => {
  it("returns 404 for another org's documents", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const doc = (await (
      await upload(a.orgId, a.userId, new File([unique("secret")], "s.txt"))
    ).json()) as DocumentDto;
    const base = `/api/orgs/${b.orgId}/documents/${doc.id}`;
    expect((await api(base, { as: b.userId })).status).toBe(404);
    expect((await api(`${base}/download`, { as: b.userId })).status).toBe(404);
    expect((await api(base, { method: "DELETE", as: b.userId })).status).toBe(404);
    expect((await api(`${base}/reprocess`, { method: "POST", as: b.userId })).status).toBe(404);
    const list = (await (await api(`/api/orgs/${b.orgId}/documents`, { as: b.userId })).json()) as {
      items: DocumentDto[];
    };
    expect(list.items).toEqual([]);
    // And B cannot reach A's org at all.
    expect((await api(`/api/orgs/${a.orgId}/documents/${doc.id}`, { as: b.userId })).status).toBe(
      404,
    );
    // The document is untouched.
    expect(await env.FILES.get(doc.r2Key)).not.toBeNull();
  });
});
