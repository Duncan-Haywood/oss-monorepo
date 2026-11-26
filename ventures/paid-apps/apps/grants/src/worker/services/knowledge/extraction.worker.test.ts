import { env } from "cloudflare:workers";
import { createAppContext } from "@worker/context";
import {
  documentChunks,
  documents,
  facts,
  interviews,
  interviewTurns,
  projects,
} from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { FakeLlm } from "@worker/ports/fake-llm";
import { allFakeHandlers } from "@worker/ports/fake-llm-handlers";
import { LlmRefusalError } from "@worker/ports/llm";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { setupTenant, testDb } from "../../../../test/worker/helpers";
import { fakeHandlers } from "./fake-llm";
import {
  formatFactsForPrompt,
  getCoverage,
  getFactsByIds,
  getFactsForDrafting,
  quoteInText,
} from "./index";
import { extractDocumentFacts, extractDocumentFactsFor, extractInterviewFactsFor } from "./jobs";

const CHUNKS = [
  "## About us\nSouthwest Indian Foundation was founded in 1968 in Gallup, New Mexico. Our mission is to help Native American families on the Navajo Nation become self-sufficient.",
  "## Workforce\nOur trades program trained 142 students in 2024. Graduates earn industry certifications in welding and carpentry. Thank you for reading.",
  "The annual operating budget was $4,200,000 in fiscal year 2025.",
];

async function seedDoc(orgId: string, kind: "annual_report" | "website_page" = "annual_report") {
  const db = testDb();
  const documentId = newId("doc");
  await db.insert(documents).values({
    id: documentId,
    orgId,
    title: "Annual report 2025",
    kind,
    mimeType: "text/markdown",
    sizeBytes: 100,
    sha256: documentId,
    r2Key: `orgs/${orgId}/documents/${documentId}/original`,
    status: "ready",
  });
  let pos = 0;
  const chunkIds: string[] = [];
  for (const [i, text] of CHUNKS.entries()) {
    const id = newId("chk");
    chunkIds.push(id);
    await db.insert(documentChunks).values({
      id,
      orgId,
      documentId,
      ordinal: i,
      text,
      tokenEstimate: Math.ceil(text.length / 4),
      charStart: pos,
      charEnd: pos + text.length,
    });
    pos += text.length;
  }
  return { documentId, chunkIds };
}

const factsOf = (orgId: string) =>
  testDb().select().from(facts).where(eq(facts.orgId, orgId)).all();

describe("extractDocumentFacts", () => {
  it("creates proposed, verbatim-grounded facts with provenance and updates factCount", async () => {
    const { orgId } = await setupTenant();
    const { documentId, chunkIds } = await seedDoc(orgId);
    const llm = new FakeLlm(allFakeHandlers);
    const ctx = createAppContext(env, { llm });
    await extractDocumentFacts(ctx, { type: "facts.extract_document", orgId, documentId });

    // one call for all three small chunks, orgId attached
    const calls = llm.calls.filter((c) => c.purpose === "knowledge.extract_facts");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.orgId).toBe(orgId);

    const rows = await factsOf(orgId);
    expect(rows.length).toBeGreaterThanOrEqual(4);
    const chunkText = new Map(
      (
        await testDb()
          .select()
          .from(documentChunks)
          .where(eq(documentChunks.documentId, documentId))
          .all()
      ).map((c) => [c.id, c.text]),
    );
    for (const f of rows) {
      expect(f.status).toBe("proposed");
      expect(f.sourceType).toBe("document");
      expect(f.sourceDocumentId).toBe(documentId);
      expect(chunkIds).toContain(f.sourceChunkId);
      expect(quoteInText(f.sourceQuote, chunkText.get(f.sourceChunkId ?? "") ?? "")).toBe(true);
    }
    expect(rows.some((f) => f.statement.includes("142 students"))).toBe(true);
    const doc = await testDb().select().from(documents).where(eq(documents.id, documentId)).get();
    expect(doc?.factCount).toBe(rows.length);

    // Re-running is idempotent (dedupe against existing facts).
    await extractDocumentFacts(ctx, { type: "facts.extract_document", orgId, documentId });
    expect(await factsOf(orgId)).toHaveLength(rows.length);
  });

  it("drops facts whose quote is not verbatim in the chunk", async () => {
    const { orgId } = await setupTenant();
    const { documentId } = await seedDoc(orgId, "website_page");
    const llm = new FakeLlm(allFakeHandlers).on("knowledge.extract_facts", (req) => {
      const real = fakeHandlers["knowledge.extract_facts"]?.(req) as {
        facts: Record<string, unknown>[];
      };
      return {
        facts: [
          ...real.facts.slice(0, 1),
          {
            chunkRef: "C2",
            category: "outcome",
            statement: "Southwest Indian Foundation placed 98% of graduates in jobs.",
            value: { number: 98, unit: "percent", year: null, text: null },
            asOf: null,
            sourceQuote: "98% of our graduates were placed in jobs within six months.",
            sensitivity: "internal",
            confidence: 0.9,
          },
        ],
      };
    });
    const ctx = createAppContext(env, { llm });
    await extractDocumentFacts(ctx, { type: "facts.extract_document", orgId, documentId });
    const rows = await factsOf(orgId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sourceType).toBe("website");
    expect(rows.some((f) => f.statement.includes("98%"))).toBe(false);
  });
});

describe("extraction failures", () => {
  it("skips refused batches but throws (for queue retry) on other LLM errors", async () => {
    const { orgId } = await setupTenant();
    const { documentId } = await seedDoc(orgId);
    const refusing = new FakeLlm(allFakeHandlers).on("knowledge.extract_facts", () => {
      throw new LlmRefusalError("knowledge.extract_facts", null);
    });
    const stats = await extractDocumentFactsFor(
      createAppContext(env, { llm: refusing }),
      orgId,
      documentId,
    );
    expect(stats).toMatchObject({ calls: 1, refusedCalls: 1, inserted: 0 });
    const broken = new FakeLlm(allFakeHandlers).on("knowledge.extract_facts", () => ({
      nope: true,
    }));
    await expect(
      extractDocumentFacts(createAppContext(env, { llm: broken }), {
        type: "facts.extract_document",
        orgId,
        documentId,
      }),
    ).rejects.toThrow(/LLM call\(s\) failed/);
  });
});

describe("extractInterviewFacts", () => {
  it("extracts only from respondent turns and links focus-project facts", async () => {
    const { orgId, userId } = await setupTenant();
    const db = testDb();
    const projectId = newId("prj");
    await db.insert(projects).values({ id: projectId, orgId, title: "Welding lab" });
    const interviewId = newId("int");
    await db.insert(interviews).values({
      id: interviewId,
      orgId,
      kind: "project",
      title: "Welding lab interview",
      focusProjectId: projectId,
      createdBy: userId,
    });
    const turns = [
      ["interviewer", "How many students will the new welding lab serve each year?"],
      ["respondent", "The welding lab will serve 40 students each year starting in 2027."],
      ["interviewer", "Does the program have 500 graduates?"],
      ["respondent", "Yes."],
    ] as const;
    const turnIds: string[] = [];
    for (const [i, [role, content]] of turns.entries()) {
      const id = newId("trn");
      turnIds.push(id);
      await db.insert(interviewTurns).values({ id, orgId, interviewId, ordinal: i, role, content });
    }
    const ctx = createAppContext(env);
    const stats = await extractInterviewFactsFor(ctx, orgId, interviewId);
    expect(stats.inserted).toBe(1);
    const rows = await factsOf(orgId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "proposed",
      sourceType: "interview",
      sourceInterviewId: interviewId,
      sourceTurnId: turnIds[1],
      projectId,
    });
    const iv = await db.select().from(interviews).where(eq(interviews.id, interviewId)).get();
    expect(iv?.factCount).toBe(1);
  });
});

describe("knowledge exports for other modules", () => {
  it("getFactsForDrafting excludes rejected/superseded/restricted and proposed by default", async () => {
    const { orgId } = await setupTenant();
    const other = await setupTenant();
    const db = testDb();
    const mk = (over: Partial<typeof facts.$inferInsert>) => {
      const id = newId("fct");
      return db
        .insert(facts)
        .values({
          id,
          orgId,
          category: "program",
          statement: `Statement ${id}`,
          sourceType: "user_entered",
          status: "confirmed",
          ...over,
        })
        .then(() => id);
    };
    const confirmed = await mk({ asOf: "2025", sourceQuote: "We run a trades program." });
    const proposed = await mk({ status: "proposed" });
    await mk({ status: "rejected" });
    await mk({ status: "superseded", supersededById: confirmed });
    await mk({ sensitivity: "restricted" });
    const otherOrgFact = newId("fct");
    await db.insert(facts).values({
      id: otherOrgFact,
      orgId: other.orgId,
      category: "program",
      statement: "Other org",
      sourceType: "user_entered",
      status: "confirmed",
    });

    const ctx = createAppContext(env);
    expect((await getFactsForDrafting(ctx, orgId)).map((f) => f.id)).toEqual([confirmed]);
    expect(
      (await getFactsForDrafting(ctx, orgId, { includeProposed: true })).map((f) => f.id),
    ).toEqual([confirmed, proposed]);
    const byIds = await getFactsByIds(ctx, orgId, [proposed, otherOrgFact, confirmed]);
    expect(byIds.map((f) => f.id)).toEqual([proposed, confirmed]);
    const line = formatFactsForPrompt(await getFactsForDrafting(ctx, orgId));
    expect(line).toBe(
      `[${confirmed}] (confirmed, as of 2025) Statement ${confirmed} — source: "We run a trades program."`,
    );
    const cov = await getCoverage(ctx, orgId);
    expect(cov.find((c) => c.topic === "programs")).toMatchObject({ factCount: 3, status: "good" });
    const leaked = await db
      .select()
      .from(facts)
      .where(and(eq(facts.orgId, orgId), eq(facts.id, otherOrgFact)))
      .all();
    expect(leaked).toHaveLength(0);
  });
});
