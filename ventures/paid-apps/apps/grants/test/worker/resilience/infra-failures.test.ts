// Resilience: vector store / embedder down, R2 put failures, email send failures, and a D1 write
// failure right after the funder email went out. Injected via AppContext overrides or a wrapped env.

import { testFakes } from "@worker/context";
import {
  applications,
  consentRecords,
  documentChunks,
  documents,
  followups,
  opportunities,
  submissions,
} from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import type { Embedder } from "@worker/ports/embedder";
import { FakeEmbedder, InMemoryVectorStore } from "@worker/ports/fakes";
import { importOpportunityFromUrl } from "@worker/services/imports";
import {
  createDocument,
  createDocumentFromText,
  reprocessDocument,
} from "@worker/services/ingestion";
import { submitReviewDecision } from "@worker/services/pipeline";
import { retrieveChunks } from "@worker/services/retrieval";
import { submitApplication } from "@worker/services/submission";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { setupTenant } from "../helpers";
import {
  ctxWith,
  DownVectorStore,
  db,
  dbFailing,
  envWithFailingPut,
  RecordingEmail,
  seedApplicationWithVersion,
  seedChunkedDocument,
  setContacts,
  uniqEmail,
} from "./helpers";

const DOC_TEXT = Array.from(
  { length: 6 },
  (_, i) =>
    `## Section ${i + 1}\n\nSouthwest Indian Foundation runs a construction trades training program in Gallup, New Mexico. In cohort ${i + 1} the program trained ${20 + i} adults from McKinley County.`,
).join("\n\n");

const docRow = (id: string) => db().select().from(documents).where(eq(documents.id, id)).get();
const chunksOf = (documentId: string) =>
  db().select().from(documentChunks).where(eq(documentChunks.documentId, documentId)).all();

class DownEmbedder implements Embedder {
  readonly dimensions = 256;
  async embed(): Promise<number[][]> {
    throw new Error("Workers AI 503: capacity exceeded");
  }
}

// ---------------------------------------------------------------------- vector store down

describe("resilience: vector store / embedder down", () => {
  it("retrieval falls back to keyword search when Vectorize throws", async () => {
    const { orgId } = await setupTenant();
    await seedChunkedDocument(orgId, 4);
    const store = new DownVectorStore();
    const res = await retrieveChunks(ctxWith({ vectors: store }), orgId, "trades program Gallup");
    expect(store.calls).toBeGreaterThan(0);
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((r) => r.text.includes("trades program"))).toBe(true);
  });

  it("retrieval falls back to keyword search when the embedder throws", async () => {
    const { orgId } = await setupTenant();
    await seedChunkedDocument(orgId, 2);
    const res = await retrieveChunks(ctxWith({ embedder: new DownEmbedder() }), orgId, "students");
    expect(res.length).toBeGreaterThan(0);
  });

  it("ingestion: vector upsert failure marks the doc failed, keeps chunks, and reprocess recovers", async () => {
    const { orgId, userId } = await setupTenant();
    const down = ctxWith({ vectors: new DownVectorStore() });
    const { documentId } = await createDocumentFromText(down, orgId, {
      title: "Program overview",
      kind: "annual_report",
      text: DOC_TEXT,
      uploadedBy: userId,
    });
    const failed = await docRow(documentId);
    expect(failed?.status).toBe("failed");
    expect(failed?.error).toBeTruthy();
    const kept = await chunksOf(documentId);
    expect(kept.length).toBeGreaterThan(0); // chunk rows are not lost
    expect(kept.every((c) => c.embeddedAt === null)).toBe(true);

    // Vector store back: reprocessing embeds everything, no duplicate chunks.
    const store = new InMemoryVectorStore();
    const up = ctxWith({ vectors: store });
    await reprocessDocument(up, orgId, documentId, { userId });
    const ready = await docRow(documentId);
    expect(ready?.status).toBe("ready");
    const chunks = await chunksOf(documentId);
    expect(chunks).toHaveLength(kept.length);
    expect(chunks.every((c) => c.embeddedAt instanceof Date)).toBe(true);
    const [q] = await new FakeEmbedder().embed(["trades program"]);
    const vecs = await store.query(orgId, q ?? [], { topK: 1000 });
    expect(vecs).toHaveLength(chunks.length);
  });

  it("ingestion: embedder outage marks the doc failed (not stuck in processing)", async () => {
    const { orgId, userId } = await setupTenant();
    const { documentId } = await createDocumentFromText(
      ctxWith({ embedder: new DownEmbedder() }),
      orgId,
      { title: "Embedder down", kind: "annual_report", text: DOC_TEXT, uploadedBy: userId },
    );
    expect((await docRow(documentId))?.status).toBe("failed");
  });

  // FIXED (was a low bug): src/worker/services/ingestion/jobs.ts:59 + :201 — userMessage() shows ANY error's
  // raw message to the user (e.g. "Vectorize 503: service unavailable", SDK/binding details), not
  // only IngestionError messages, which the class comment says are the safe ones. Expected a
  // generic "temporary problem, try again" for infra errors.
  it("ingestion: infra error text is not shown verbatim to the user", async () => {
    const { orgId, userId } = await setupTenant();
    const { documentId } = await createDocumentFromText(
      ctxWith({ vectors: new DownVectorStore() }),
      orgId,
      {
        title: "Leaky error",
        kind: "annual_report",
        text: `${DOC_TEXT}\n\nv2`,
        uploadedBy: userId,
      },
    );
    expect((await docRow(documentId))?.error ?? "").not.toMatch(/Vectorize|503/);
  });
});

// ------------------------------------------------------------------------- R2 put failures

describe("resilience: R2 put failure", () => {
  it("document upload: put fails -> error, no orphan documents row stuck in 'uploaded'", async () => {
    const { orgId, userId } = await setupTenant();
    const ctx = ctxWith({}, envWithFailingPut());
    await expect(
      createDocument(ctx, orgId, {
        title: "Board minutes",
        kind: "other",
        mimeType: "text/markdown",
        bytes: new TextEncoder().encode(`# Minutes ${newId("job")}\n\nThe board met.`).buffer,
        filename: "minutes.md",
        uploadedBy: userId,
        consent: { userId },
      }),
    ).rejects.toThrow(/R2/);
    const rows = await db().select().from(documents).where(eq(documents.orgId, orgId)).all();
    expect(rows).toHaveLength(0);
    const consents = await db()
      .select()
      .from(consentRecords)
      .where(and(eq(consentRecords.orgId, orgId), eq(consentRecords.scope, "document_upload")))
      .all();
    expect(consents).toHaveLength(0);
  });

  it("document processing: text.md put fails -> doc failed (original kept, reprocess possible)", async () => {
    const { orgId, userId } = await setupTenant();
    const ctx = ctxWith({}, envWithFailingPut(/\/text\.md$|\/text$/));
    const { documentId } = await createDocumentFromText(ctx, orgId, {
      title: "Text put fails",
      kind: "annual_report",
      text: `${DOC_TEXT}\n\nv3`,
      uploadedBy: userId,
    });
    const row = await docRow(documentId);
    expect(row?.status).toBe("failed");
  });

  it("opportunity import: raw put fails -> no opportunity row", async () => {
    const { orgId, userId } = await setupTenant();
    const url = `https://grants.mesa.example.org/r2-${newId("job").slice(4)}`;
    testFakes.web.set(url, {
      url,
      status: 200,
      contentType: "text/html",
      body: "<html><head><title>Rural Trades Grant</title></head><body><h1>Rural Trades Grant</h1><p>Funder: Mesa Community Foundation. The foundation invites proposals for construction trades training programs in rural New Mexico. Awards up to $50,000. Applications due March 15, 2027.</p></body></html>",
    });
    await expect(
      importOpportunityFromUrl(ctxWith({}, envWithFailingPut()), { orgId, url, userId }),
    ).rejects.toThrow();
    const rows = await db()
      .select()
      .from(opportunities)
      .where(eq(opportunities.privateToOrgId, orgId))
      .all();
    expect(rows).toHaveLength(0);
  });

  it("submission package: put fails on approve -> no submission row, no funder email, app approved + lastError", async () => {
    const { orgId, userId } = await setupTenant();
    const contact = uniqEmail("contact");
    await setContacts(orgId, contact, []);
    const funder = uniqEmail("funder");
    const { appId } = await seedApplicationWithVersion(orgId, { submissionEmail: funder });
    const email = new RecordingEmail();
    const ctx = ctxWith({ email }, envWithFailingPut(/\/submissions\//));
    const after = await submitReviewDecision(ctx, {
      orgId,
      applicationId: appId,
      reviewerId: userId,
      decision: "approved",
    });
    expect(after.status).toBe("approved");
    expect(after.lastError).toMatch(/Submission failed/);
    const subs = await db()
      .select()
      .from(submissions)
      .where(eq(submissions.applicationId, appId))
      .all();
    expect(subs).toHaveLength(0);
    expect(email.to(funder)).toHaveLength(0);
  });
});

// ------------------------------------------------------------------------ email failures

const subsOf = (appId: string) =>
  db().select().from(submissions).where(eq(submissions.applicationId, appId)).all();
const appRow = (appId: string) =>
  db().select().from(applications).where(eq(applications.id, appId)).get();

describe("resilience: email send failure during submission", () => {
  it("funder email fails -> submission failed (never 'sent'), app not submitted, retry sends once", async () => {
    const { orgId, userId } = await setupTenant();
    await setContacts(orgId, uniqEmail("contact"), []);
    const funder = uniqEmail("funder");
    const { appId, verId } = await seedApplicationWithVersion(orgId, {
      status: "approved",
      submissionEmail: funder,
    });
    const email = new RecordingEmail();
    email.failFor.add(funder);
    const input = {
      orgId,
      applicationId: appId,
      versionId: verId,
      submittedByType: "user" as const,
      submittedBy: userId,
      approvedBy: userId,
    };
    const sub = await submitApplication(ctxWith({ email }), input);
    expect(sub.status).toBe("failed");
    expect(sub.error).toMatch(/Email submission failed/);
    const app = await appRow(appId);
    expect(app?.status).not.toBe("submitted");
    expect(app?.lastError).toMatch(/Email submission failed/);
    const fups = await db()
      .select()
      .from(followups)
      .where(eq(followups.applicationId, appId))
      .all();
    expect(fups.filter((f) => f.kind === "status_check")).toHaveLength(0);

    // Provider recovers: retrying the same approval sends exactly once.
    email.failFor.clear();
    const retry = await submitApplication(ctxWith({ email }), input);
    expect(retry.status).toBe("sent");
    expect(email.to(funder)).toHaveLength(1);
    expect((await subsOf(appId)).map((s) => s.status).sort()).toEqual(["failed", "sent"]);
    expect((await appRow(appId))?.status).toBe("submitted");
  });

  it("approve with the email provider down: decision recorded, app stays approved (retryable), never submitted", async () => {
    const { orgId, userId } = await setupTenant();
    await setContacts(orgId, uniqEmail("contact"), []);
    const funder = uniqEmail("funder");
    const { appId } = await seedApplicationWithVersion(orgId, { submissionEmail: funder });
    const email = new RecordingEmail();
    email.failAll = true;
    const after = await submitReviewDecision(ctxWith({ email }), {
      orgId,
      applicationId: appId,
      reviewerId: userId,
      decision: "approved",
    });
    expect(after.status).toBe("approved");
    expect(after.lastError).toMatch(/Email submission failed/);
    expect((await subsOf(appId)).map((s) => s.status)).toEqual(["failed"]);
  });

  // FIXED (regression test; was): src/worker/services/submission/index.ts:258-314 — the try/catch around the funder email
  // also wraps the D1 writes that record it (update submissions -> sent, markApplicationSubmitted).
  // If any of those writes fails AFTER ctx.email.send succeeded, the catch marks the submission
  // "failed" and leaves the app "approved", so the next approve / workflow iteration emails the
  // funder a second time. Expected: once the email is sent the submission is never "failed", and a
  // retry never re-sends (move the send out of the try, or record "sent" in its own retried step).
  it("D1 write fails right after the funder email is sent -> retry must not email the funder again", async () => {
    const { orgId, userId } = await setupTenant();
    await setContacts(orgId, uniqEmail("contact"), []);
    const funder = uniqEmail("funder");
    const { appId, verId } = await seedApplicationWithVersion(orgId, {
      status: "approved",
      submissionEmail: funder,
    });
    const email = new RecordingEmail();
    const input = {
      orgId,
      applicationId: appId,
      versionId: verId,
      submittedByType: "user" as const,
      submittedBy: userId,
      approvedBy: userId,
    };
    // The first update of `submissions` (status -> sent) fails once.
    const first = await submitApplication(
      ctxWith({ email, db: dbFailing("update", submissions, 1) }),
      input,
    ).catch((e: unknown) => e);
    expect(email.to(funder)).toHaveLength(1);
    await submitApplication(ctxWith({ email }), input).catch(() => undefined);
    expect(email.to(funder)).toHaveLength(1);
    expect((first as { status?: string }).status).not.toBe("failed");
  });
});
