// Fault-injection helpers for the resilience suite. Failures are injected only through
// AppContext overrides (llm, vectors, email, embedder, db) or a wrapped env (FILES), never by
// mocking service modules, so the real service code paths run.
import { env } from "cloudflare:workers";
import type { OpportunityRequirements } from "@shared/content";
import { type AppContext, type ContextOverrides, createAppContext } from "@worker/context";
import {
  applications,
  applicationVersions,
  documentChunks,
  documents,
  facts,
  opportunities,
  orgProfiles,
  orgSettings,
  subscriptions,
} from "@worker/db/schema";
import type { Env } from "@worker/env";
import { newId } from "@worker/lib/ids";
import type { EmailMessage, EmailSender } from "@worker/ports/email";
import { type FakeHandler, FakeLlm } from "@worker/ports/fake-llm";
import { allFakeHandlers } from "@worker/ports/fake-llm-handlers";
import { LlmOutputError, LlmRefusalError } from "@worker/ports/llm";
import type { VectorStore } from "@worker/ports/vector-store";
import { eq } from "drizzle-orm";
import { testDb } from "../helpers";

export const DAY = 86_400_000;
export const db = () => testDb();
export const uniqEmail = (p: string) => `${p}-${newId("job").slice(4)}@example.test`;

// ------------------------------------------------------------------------------- LLM failures

export type FailureKind = "refusal" | "malformed" | "transient";

/** Throws the error the real AnthropicLlm adapter would throw for this failure mode. */
export function llmError(kind: FailureKind, purpose: string): Error {
  if (kind === "refusal") return new LlmRefusalError(purpose, "cyber");
  if (kind === "malformed") return new LlmOutputError(purpose, "structured output failed to parse");
  return new Error("529 overloaded_error: Overloaded (upstream timeout)");
}

export const throwing =
  (kind: FailureKind): FakeHandler =>
  (req) => {
    throw llmError(kind, req.purpose);
  };

/** A FakeLlm with every default handler, plus `purpose` failing with `kind`. */
export function failingLlm(purpose: string, kind: FailureKind): FakeLlm {
  return new FakeLlm(allFakeHandlers).on(purpose, throwing(kind));
}

/** Fails the first `n` calls of `purpose` with `kind`, then defers to the default handler. */
export function failFirst(purpose: string, kind: FailureKind, n = 1): FakeLlm {
  let calls = 0;
  const real = allFakeHandlers[purpose];
  return new FakeLlm(allFakeHandlers).on(purpose, (req) => {
    calls++;
    if (calls <= n) throw llmError(kind, req.purpose);
    if (!real) throw new Error(`no default handler for ${purpose}`);
    return real(req);
  });
}

export const callsTo = (llm: FakeLlm, purpose: string) =>
  llm.calls.filter((c) => c.purpose === purpose);

// ------------------------------------------------------------------------- port failures

export class DownVectorStore implements VectorStore {
  calls = 0;
  async upsert(): Promise<void> {
    this.calls++;
    throw new Error("Vectorize 503: service unavailable");
  }
  async query(): Promise<never> {
    this.calls++;
    throw new Error("Vectorize 503: service unavailable");
  }
  async deleteByIds(): Promise<void> {
    this.calls++;
    throw new Error("Vectorize 503: service unavailable");
  }
}

export class RecordingEmail implements EmailSender {
  readonly sent: EmailMessage[] = [];
  /** Recipient addresses whose send fails (the whole send throws when any `to` matches). */
  failFor = new Set<string>();
  failAll = false;
  async send(msg: EmailMessage) {
    if (this.failAll || msg.to.some((t) => this.failFor.has(t))) {
      throw new Error("Resend 502: bad gateway");
    }
    this.sent.push(msg);
    return { id: `rec-${this.sent.length}` };
  }
  to(addr: string) {
    return this.sent.filter((m) => m.to.includes(addr));
  }
}

/** env with FILES.put failing (optionally only for keys matching `match`). */
export function envWithFailingPut(match: RegExp = /.*/): Env {
  const real = env.FILES;
  const bucket = {
    head: real.head.bind(real),
    get: real.get.bind(real),
    list: real.list.bind(real),
    delete: real.delete.bind(real),
    createMultipartUpload: real.createMultipartUpload.bind(real),
    resumeMultipartUpload: real.resumeMultipartUpload.bind(real),
    put: (key: string, ...rest: unknown[]) => {
      if (match.test(key)) return Promise.reject(new Error("R2 500: internal error on put"));
      return (real.put as (k: string, ...r: unknown[]) => Promise<R2Object | null>)(key, ...rest);
    },
  } as unknown as R2Bucket;
  return { ...(env as Env), FILES: bucket };
}

/**
 * A db whose `insert(table)` / `update(table)` throws for the given table, the first `times` times
 * (simulates a D1 write failure at one specific point of a multi-step operation). Everything else
 * hits the real local D1.
 */
export function dbFailing(
  method: "insert" | "update",
  table: unknown,
  times = Number.POSITIVE_INFINITY,
): AppContext["db"] {
  const real = testDb();
  let failures = 0;
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === method) {
        return (t: unknown) => {
          if (t === table && failures < times) {
            failures++;
            throw new Error("D1_ERROR: database is locked");
          }
          const fn = Reflect.get(target, prop, receiver) as (x: unknown) => unknown;
          return fn.call(target, t);
        };
      }
      const v = Reflect.get(target, prop, receiver);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

export const ctxWith = (overrides: ContextOverrides = {}, e: Env = env as Env) =>
  createAppContext(e, overrides);

// ---------------------------------------------------------------------------------- seeders

export async function giveCompPlan(orgId: string) {
  await db()
    .insert(subscriptions)
    .values({ orgId, planKey: "comp", status: "comp" })
    .onConflictDoNothing();
}

export async function setContacts(orgId: string, contactEmail: string | null, notify: string[]) {
  await db()
    .update(orgProfiles)
    .set({ contactEmail, contactName: "Pat Doe", ein: "85-0000000" })
    .where(eq(orgProfiles.orgId, orgId));
  await db().update(orgSettings).set({ notifyEmails: notify }).where(eq(orgSettings.orgId, orgId));
}

export const FACT_STATEMENTS = [
  "Southwest Indian Foundation runs a construction trades training program in Gallup, New Mexico.",
  "The trades program trained 42 adults in 2025.",
  "Southwest Indian Foundation serves Navajo and Zuni families in McKinley County.",
];

export async function seedConfirmedFacts(orgId: string, statements = FACT_STATEMENTS) {
  const ids: string[] = [];
  for (const statement of statements) {
    const id = newId("fct");
    ids.push(id);
    await db().insert(facts).values({
      id,
      orgId,
      category: "program",
      statement,
      sourceQuote: statement,
      status: "confirmed",
      sourceType: "user_entered",
    });
  }
  return ids;
}

export const oneSectionRequirements = (n = 1): OpportunityRequirements => ({
  sections: Array.from({ length: n }, (_, i) => ({
    key: `section_${i + 1}`,
    title: `Section ${i + 1}: Statement of need`,
    prompt: "Describe the need your construction trades training program addresses in Gallup.",
    kind: "narrative" as const,
    required: true,
    wordLimit: 300,
    charLimit: null,
    guidance: "",
  })),
  attachments: [],
  eligibilityCriteria: [],
  submissionInstructions: "",
  complete: true,
});

export async function seedOpportunity(
  v: Partial<typeof opportunities.$inferInsert> = {},
): Promise<string> {
  const id = newId("opp");
  await db()
    .insert(opportunities)
    .values({
      id,
      source: "manual",
      sourceId: id,
      funderName: "Gallup Community Foundation",
      title: "Construction Trades Workforce Training Grant",
      summary: "Supports construction trades job training for adults in McKinley County.",
      awardFloorCents: 1_000_000,
      awardCeilingCents: 2_500_000,
      status: "posted",
      closeDate: new Date(Date.now() + 60 * DAY),
      submissionMethod: "portal",
      submissionUrl: "https://funder.example.org/apply",
      ...v,
    });
  return id;
}

/** An application in `status` with one drafted version (one supported factual claim). */
export async function seedApplicationWithVersion(
  orgId: string,
  opts: {
    status?: (typeof applications.$inferInsert)["status"];
    submissionEmail?: string | null;
    factId?: string;
  } = {},
) {
  const oppId = await seedOpportunity({
    submissionMethod: opts.submissionEmail ? "email" : "portal",
    submissionEmail: opts.submissionEmail ?? null,
    requirements: oneSectionRequirements(1),
  });
  const appId = newId("app");
  const verId = newId("ver");
  await db()
    .insert(applications)
    .values({
      id: appId,
      orgId,
      opportunityId: oppId,
      title: "Trades Academy Expansion",
      status: opts.status ?? "in_review",
      reviewTier: "one_click",
      requestedAmountCents: 2_500_000,
    });
  await db()
    .insert(applicationVersions)
    .values({
      id: verId,
      orgId,
      applicationId: appId,
      versionNumber: 1,
      authorType: "system",
      executiveSummary: "SWIF trains adults in construction trades.",
      content: {
        sections: [
          {
            key: "section_1",
            title: "Section 1: Statement of need",
            gaps: [],
            paragraphs: [
              {
                id: "p1",
                claims: [
                  {
                    id: "c1",
                    kind: "factual",
                    text: "The trades program trained 42 adults in 2025.",
                    factIds: [opts.factId ?? "fct_missing"],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
  await db()
    .update(applications)
    .set({ currentVersionId: verId })
    .where(eq(applications.id, appId));
  return { oppId, appId, verId };
}

/** A ready document with `n` chunks (8 chunks per extraction batch => ceil(n/8) LLM calls). */
export async function seedChunkedDocument(orgId: string, n: number) {
  const documentId = newId("doc");
  await db()
    .insert(documents)
    .values({
      id: documentId,
      orgId,
      title: "Annual report 2025",
      kind: "annual_report",
      mimeType: "text/markdown",
      sizeBytes: 100,
      sha256: documentId,
      r2Key: `orgs/${orgId}/documents/${documentId}/original`,
      status: "ready",
    });
  let pos = 0;
  for (let i = 0; i < n; i++) {
    const text = `## Program ${i + 1}\nOur trades program ${i + 1} trained ${100 + i} students in 2024 in Gallup, New Mexico.`;
    await db()
      .insert(documentChunks)
      .values({
        id: newId("chk"),
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
  return documentId;
}
