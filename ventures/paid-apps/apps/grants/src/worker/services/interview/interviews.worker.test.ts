// Integration tests for /interviews and /transcribe (workerd, local D1/R2, fake LLM + transcriber).
import { env } from "cloudflare:workers";
import { createAppContext } from "@worker/context";
import {
  applicationFlags,
  applications,
  applicationVersions,
  consentRecords,
  documents,
  interviews,
  interviewTurns,
  opportunities,
  orgSettings,
  projects,
} from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import type { JobMessage } from "@worker/queues/messages";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  api,
  createTestOrg,
  createTestUser,
  setupTenant,
  testDb,
} from "../../../../test/worker/helpers";
import { createGapFillInterview } from "./index";

const enqueued = vi.hoisted(() => [] as JobMessage[]);
vi.mock("@worker/queues/enqueue", () => ({
  enqueue: async (_ctx: unknown, job: JobMessage) => {
    enqueued.push(job);
  },
}));

beforeEach(() => {
  enqueued.length = 0;
});

type Turn = { id: string; role: string; content: string; topicKey: string | null; ordinal: number };
type Interview = {
  id: string;
  orgId: string;
  kind: string;
  mode: string;
  status: string;
  agenda: string[];
  coveredTopics: string[];
  summary: string | null;
  transcriptDocumentId: string | null;
  turns: Turn[];
};

async function start(orgId: string, as: string, body: Record<string, unknown>) {
  const res = await api(`/api/orgs/${orgId}/interviews`, { method: "POST", as, json: body });
  return { res, body: (await res.json()) as Interview };
}

async function answer(orgId: string, as: string, id: string, content: string) {
  const res = await api(`/api/orgs/${orgId}/interviews/${id}/answer`, {
    method: "POST",
    as,
    json: { content, inputMode: "text" },
  });
  expect(res.status).toBe(200);
  return (await res.json()) as { turns: [Turn, Turn | null]; done: boolean };
}

async function seedApplicationWithFlags(orgId: string) {
  const db = testDb();
  const opportunityId = newId("opp");
  await db.insert(opportunities).values({
    id: opportunityId,
    source: "manual",
    sourceId: opportunityId,
    funderName: "Test Foundation",
    title: "Workforce Grant",
    privateToOrgId: orgId,
  });
  const applicationId = newId("app");
  await db
    .insert(applications)
    .values({ id: applicationId, orgId, opportunityId, title: "Workforce Grant 2027" });
  const versionId = newId("ver");
  await db.insert(applicationVersions).values({
    id: versionId,
    orgId,
    applicationId,
    versionNumber: 1,
    content: { sections: [] },
    authorType: "system",
  });
  const flag = (over: Partial<typeof applicationFlags.$inferInsert>) => ({
    id: newId("flg"),
    orgId,
    applicationId,
    versionId,
    severity: "blocker" as const,
    kind: "missing_info" as const,
    message: "Missing info",
    ...over,
  });
  await db.insert(applicationFlags).values([
    flag({ suggestedQuestion: "How many trainees completed the program in 2025?" }),
    flag({
      kind: "unsupported_claim",
      suggestedQuestion: "Which employers hired your graduates?",
    }),
    flag({ suggestedQuestion: "Resolved already?", status: "resolved" }),
    flag({ kind: "length_limit", suggestedQuestion: "Ignore me" }),
  ]);
  return { applicationId };
}

describe("AI interviews", () => {
  it("start → answer ×3 → complete stores turns, summary and enqueues fact extraction", async () => {
    const { orgId, userId } = await setupTenant("editor");
    const { res, body: iv } = await start(orgId, userId, { kind: "onboarding" });
    expect(res.status).toBe(201);
    expect(iv.status).toBe("active");
    expect(iv.mode).toBe("ai_chat");
    expect(iv.agenda.length).toBeGreaterThan(3);
    expect(iv.turns).toHaveLength(1);
    expect(iv.turns[0]?.role).toBe("interviewer");
    expect(iv.turns[0]?.topicKey).toBe(iv.agenda[0]);

    const answers = [
      "Our mission is to help Navajo families become self-sufficient, since 1968.",
      "We started in Gallup in 1968 and opened the trades training center in 2019.",
      "We run a 16-week carpentry and construction program with 3 instructors.",
    ];
    let last: { turns: [Turn, Turn | null]; done: boolean } | null = null;
    for (const a of answers) {
      last = await answer(orgId, userId, iv.id, a);
      expect(last.turns[0].role).toBe("respondent");
      expect(last.turns[0].content).toBe(a);
      expect(last.done).toBe(false);
      expect(last.turns[1]?.role).toBe("interviewer");
    }
    expect(last?.turns[1]?.topicKey).toBe(iv.agenda[3]);

    const done = await api(`/api/orgs/${orgId}/interviews/${iv.id}/complete`, {
      method: "POST",
      as: userId,
    });
    expect(done.status).toBe(200);
    const completed = (await done.json()) as Interview;
    expect(completed.status).toBe("completed");
    expect(completed.turns).toHaveLength(7);
    expect(completed.coveredTopics).toEqual(iv.agenda.slice(0, 3));
    for (const a of answers) expect(completed.summary).toContain(a);
    expect(enqueued).toEqual([{ type: "facts.extract_interview", orgId, interviewId: iv.id }]);

    // completing again is idempotent and does not re-enqueue
    await api(`/api/orgs/${orgId}/interviews/${iv.id}/complete`, { method: "POST", as: userId });
    expect(enqueued).toHaveLength(1);
    // answering a completed interview is a conflict
    const late = await api(`/api/orgs/${orgId}/interviews/${iv.id}/answer`, {
      method: "POST",
      as: userId,
      json: { content: "more", inputMode: "text" },
    });
    expect(late.status).toBe(409);

    const list = await api(`/api/orgs/${orgId}/interviews`, { as: userId });
    const items = ((await list.json()) as { items: Interview[] }).items;
    expect(items.map((i) => i.id)).toEqual([iv.id]);
  });

  it("asks a follow-up when an answer is vague", async () => {
    const { orgId, userId } = await setupTenant();
    const { body: iv } = await start(orgId, userId, { kind: "follow_up" });
    const first = iv.turns[0];
    const r = await answer(orgId, userId, iv.id, "We help people.");
    expect(r.turns[1]?.topicKey).toBe(first?.topicKey);
    expect(r.turns[1]?.content).toMatch(/concrete/);
  });

  it("project interview fills only empty project fields from respondent quotes", async () => {
    const { orgId, userId } = await setupTenant();
    const projectId = newId("prj");
    await testDb()
      .insert(projects)
      .values({ id: projectId, orgId, title: "Trades Academy", location: "Gallup, NM" });
    const { res, body: iv } = await start(orgId, userId, {
      kind: "project",
      focusProjectId: projectId,
    });
    expect(res.status).toBe(201);
    expect(iv.agenda.slice(0, 3)).toEqual(["problem", "approach", "population"]);
    expect(iv.turns[0]?.content).toContain('"Trades Academy"');

    const script = [
      "Young adults on the reservation have no way to get trades certifications close to home.",
      "Students would train four days a week in our shop and one day on real job sites.",
      "About 24 young adults per year, ages 18 to 24.",
      "Everything happens at our Gallup campus and job sites in McKinley County.",
      "We estimate $250,000 for the first year, mostly instructor salaries and tools.",
      "We'd start in March 2027 and be fully running by December 2027.",
    ];
    for (const a of script) await answer(orgId, userId, iv.id, a);
    await api(`/api/orgs/${orgId}/interviews/${iv.id}/complete`, { method: "POST", as: userId });

    const p = await testDb().select().from(projects).where(eq(projects.id, projectId)).get();
    expect(p?.problem).toBe(script[0]);
    expect(p?.approach).toBe(script[1]);
    expect(p?.populationServed).toBe(script[2]);
    expect(p?.location).toBe("Gallup, NM"); // already set: untouched
    expect(p?.budgetNeededCents).toBe(25_000_000);
    expect(p?.timelineStart).toBe("March 2027");
    expect(p?.timelineEnd).toBe("December 2027");
    expect(p?.summary).toBe("");
  });

  it("gap-fill interviews ask the application's open flag questions", async () => {
    const { orgId, userId } = await setupTenant();
    const { applicationId } = await seedApplicationWithFlags(orgId);
    const { res, body: iv } = await start(orgId, userId, {
      kind: "gap_fill",
      focusApplicationId: applicationId,
    });
    expect(res.status).toBe(201);
    expect(iv.agenda).toEqual(["gap_1", "gap_2"]);
    expect(iv.turns[0]?.content).toContain("How many trainees completed the program in 2025?");
    const r = await answer(orgId, userId, iv.id, "42 trainees completed the program in 2025.");
    expect(r.turns[1]?.content).toContain("Which employers hired your graduates?");
    const r2 = await answer(
      orgId,
      userId,
      iv.id,
      "Mostly Begay Construction and the Gallup Housing Authority.",
    );
    expect(r2.done).toBe(true);
    expect(r2.turns[1]).toBeNull();
  });

  it("createGapFillInterview opens (and then extends) a gap-fill interview without the LLM", async () => {
    const { orgId } = await setupTenant();
    const { applicationId } = await seedApplicationWithFlags(orgId);
    const ctx = createAppContext(env);
    const { interviewId } = await createGapFillInterview(ctx, {
      orgId,
      applicationId,
      questions: ["What was your 2025 operating budget?", "What was your 2025 operating budget?"],
    });
    const iv = await testDb().select().from(interviews).where(eq(interviews.id, interviewId)).get();
    expect(iv?.kind).toBe("gap_fill");
    expect(iv?.focusApplicationId).toBe(applicationId);
    expect(iv?.agenda).toEqual(["gap_1"]);
    const turns = await testDb()
      .select()
      .from(interviewTurns)
      .where(eq(interviewTurns.interviewId, interviewId))
      .all();
    expect(turns).toHaveLength(1);
    expect(turns[0]?.content).toContain("What was your 2025 operating budget?");

    const again = await createGapFillInterview(ctx, {
      orgId,
      applicationId,
      questions: ["What was your 2025 operating budget?", "Who is your board chair?"],
    });
    expect(again.interviewId).toBe(interviewId);
    const iv2 = await testDb()
      .select()
      .from(interviews)
      .where(eq(interviews.id, interviewId))
      .get();
    expect(iv2?.agenda).toEqual(["gap_1", "gap_2"]);

    // other orgs cannot target this application
    const other = await setupTenant();
    await expect(
      createGapFillInterview(ctx, { orgId: other.orgId, applicationId, questions: ["x?"] }),
    ).rejects.toThrow(/not found/);
  });

  it("validates kind and focus ids", async () => {
    const { orgId, userId } = await setupTenant();
    expect((await start(orgId, userId, { kind: "transcript_upload" })).res.status).toBe(400);
    expect((await start(orgId, userId, { kind: "gap_fill" })).res.status).toBe(400);
    expect(
      (await start(orgId, userId, { kind: "project", focusProjectId: "prj_nope" })).res.status,
    ).toBe(404);
  });
});

describe("ai_interview consent", () => {
  const setConsent = (orgId: string, as: string, granted: boolean) =>
    api(`/api/orgs/${orgId}/privacy/consents`, {
      method: "POST",
      as,
      json: { scope: "ai_interview", granted },
    });

  it("refuses to start an AI interview after the member revoked ai_interview (403)", async () => {
    const t = await setupTenant();
    // No ai_interview record: the onboarding consents cover it.
    expect((await start(t.orgId, t.userId, { kind: "onboarding" })).res.status).toBe(201);

    expect((await setConsent(t.orgId, t.userId, false)).status).toBeLessThan(300);
    const blocked = await api(`/api/orgs/${t.orgId}/interviews`, {
      method: "POST",
      as: t.userId,
      json: { kind: "follow_up" },
    });
    expect(blocked.status).toBe(403);
    expect(((await blocked.json()) as { error: { code: string } }).error.code).toBe(
      "consent_required",
    );
    const rows = await testDb()
      .select()
      .from(interviews)
      .where(and(eq(interviews.orgId, t.orgId), eq(interviews.kind, "follow_up")))
      .all();
    expect(rows).toHaveLength(0);

    // Another member's choice is their own (personal scope).
    const editor = await createTestUser();
    const { member } = await import("@worker/db/schema");
    await testDb()
      .insert(member)
      .values({
        id: newId("org").replace("org_", "mem_"),
        organizationId: t.orgId,
        userId: editor.id,
        role: "editor",
      });
    expect((await start(t.orgId, editor.id, { kind: "follow_up" })).res.status).toBe(201);

    // Granting it again restores access.
    expect((await setConsent(t.orgId, t.userId, true)).status).toBeLessThan(300);
    expect((await start(t.orgId, t.userId, { kind: "follow_up" })).res.status).toBe(201);
  });
});

describe("transcript upload", () => {
  it("splits a JSON transcript into turns, stores the document and enqueues extraction", async () => {
    const { orgId, userId } = await setupTenant();
    const res = await api(`/api/orgs/${orgId}/interviews/transcript`, {
      method: "POST",
      as: userId,
      json: {
        title: "Call with program director",
        text: "Sarah: How many trainees finished last year?\nJoe: 42 finished in 2025.\nSarah: Where are they working?\nJoe: 30 work for local contractors.",
      },
    });
    expect(res.status).toBe(201);
    const iv = (await res.json()) as Interview;
    expect(iv.kind).toBe("transcript_upload");
    expect(iv.mode).toBe("human_transcript");
    expect(iv.status).toBe("completed");
    expect(iv.turns.map((t) => t.role)).toEqual([
      "interviewer",
      "respondent",
      "interviewer",
      "respondent",
    ]);
    expect(iv.summary).toContain("42 finished in 2025.");
    const doc = await testDb()
      .select()
      .from(documents)
      .where(and(eq(documents.id, iv.transcriptDocumentId ?? ""), eq(documents.orgId, orgId)))
      .get();
    expect(doc?.kind).toBe("interview_transcript");
    expect(enqueued).toContainEqual({ type: "facts.extract_interview", orgId, interviewId: iv.id });

    // transcript interviews are read-only
    const ans = await api(`/api/orgs/${orgId}/interviews/${iv.id}/answer`, {
      method: "POST",
      as: userId,
      json: { content: "hi", inputMode: "text" },
    });
    expect(ans.status).toBe(409);
  });

  it("accepts a multipart .vtt file", async () => {
    const { orgId, userId } = await setupTenant();
    const vtt =
      "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n<v Interviewer>How many homes did you repair?</v>\n\n00:00:03.000 --> 00:00:06.000\n<v Lena>We repaired 18 homes in 2025.</v>\n";
    const form = new FormData();
    form.append("file", new File([vtt], "lena.vtt", { type: "text/vtt" }));
    const res = await api(`/api/orgs/${orgId}/interviews/transcript`, {
      method: "POST",
      as: userId,
      body: form,
    });
    expect(res.status).toBe(201);
    const iv = (await res.json()) as Interview & { title: string };
    expect(iv.title).toBe("lena");
    expect(iv.turns.map((t) => [t.role, t.content])).toEqual([
      ["interviewer", "How many homes did you repair?"],
      ["respondent", "We repaired 18 homes in 2025."],
    ]);

    const bad = new FormData();
    bad.append("file", new File(["x"], "notes.pdf", { type: "application/pdf" }));
    const r2 = await api(`/api/orgs/${orgId}/interviews/transcript`, {
      method: "POST",
      as: userId,
      body: bad,
    });
    expect(r2.status).toBe(400);
  });
});

describe("dictation (/transcribe)", () => {
  const audioForm = (type = "audio/webm", bytes = 1234) => {
    const form = new FormData();
    form.append("audio", new File([new Uint8Array(bytes)], "clip.webm", { type }));
    return form;
  };

  it("transcribes audio with the fake transcriber and does not store audio by default", async () => {
    const { orgId, userId } = await setupTenant("editor");
    const res = await api(`/api/orgs/${orgId}/transcribe`, {
      method: "POST",
      as: userId,
      body: audioForm(),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "[fake transcript of 1234 bytes of audio]" });
    const listed = await env.FILES.list({ prefix: `orgs/${orgId}/audio/` });
    expect(listed.objects).toHaveLength(0);
  });

  it("rejects non-audio and missing files", async () => {
    const { orgId, userId } = await setupTenant();
    const r1 = await api(`/api/orgs/${orgId}/transcribe`, {
      method: "POST",
      as: userId,
      body: audioForm("text/plain"),
    });
    expect(r1.status).toBe(415);
    const r2 = await api(`/api/orgs/${orgId}/transcribe`, {
      method: "POST",
      as: userId,
      body: new FormData(),
    });
    expect(r2.status).toBe(400);
  });

  it("stores audio only with the org setting AND voice_recording consent", async () => {
    const { orgId, userId } = await setupTenant();
    await testDb()
      .update(orgSettings)
      .set({ storeVoiceRecordings: true })
      .where(eq(orgSettings.orgId, orgId));
    const noConsent = await api(`/api/orgs/${orgId}/transcribe`, {
      method: "POST",
      as: userId,
      body: audioForm(),
    });
    expect(((await noConsent.json()) as { audioKey?: string }).audioKey).toBeUndefined();

    await testDb()
      .insert(consentRecords)
      .values({
        id: newId("cns"),
        orgId,
        userId,
        scope: "voice_recording",
        policyVersion: "test",
        granted: true,
      });
    const res = await api(`/api/orgs/${orgId}/transcribe`, {
      method: "POST",
      as: userId,
      body: audioForm(),
    });
    const body = (await res.json()) as { text: string; audioKey?: string };
    expect(body.audioKey?.startsWith(`orgs/${orgId}/audio/`)).toBe(true);
    expect(await env.FILES.head(body.audioKey ?? "")).not.toBeNull();

    // the key can be attached to a voice answer; foreign keys are rejected
    const { body: iv } = await start(orgId, userId, { kind: "onboarding" });
    const ok = await api(`/api/orgs/${orgId}/interviews/${iv.id}/answer`, {
      method: "POST",
      as: userId,
      json: { content: body.text, inputMode: "voice", audioKey: body.audioKey },
    });
    expect(ok.status).toBe(200);
    const okBody = (await ok.json()) as {
      turns: [Turn & { inputMode: string; audioR2Key: string }];
    };
    expect(okBody.turns[0].inputMode).toBe("voice");
    expect(okBody.turns[0].audioR2Key).toBe(body.audioKey);
    const bad = await api(`/api/orgs/${orgId}/interviews/${iv.id}/answer`, {
      method: "POST",
      as: userId,
      json: { content: "x", inputMode: "voice", audioKey: "orgs/org_other/audio/x.webm" },
    });
    expect(bad.status).toBe(400);
  });
});

describe("roles and tenant isolation", () => {
  it("viewers can read but not start, answer, upload or dictate", async () => {
    const owner = await setupTenant();
    const viewer = await createTestUser();
    await createTestOrg(viewer.id, { role: "viewer" }); // unrelated org for the viewer
    const { body: iv } = await start(owner.orgId, owner.userId, { kind: "onboarding" });
    // add viewer to owner's org
    const { member } = await import("@worker/db/schema");
    await testDb()
      .insert(member)
      .values({
        id: newId("org").replace("org_", "mem_"),
        organizationId: owner.orgId,
        userId: viewer.id,
        role: "viewer",
      });
    const base = `/api/orgs/${owner.orgId}`;
    expect((await api(`${base}/interviews`, { as: viewer.id })).status).toBe(200);
    expect((await api(`${base}/interviews/${iv.id}`, { as: viewer.id })).status).toBe(200);
    expect((await start(owner.orgId, viewer.id, { kind: "onboarding" })).res.status).toBe(403);
    const ans = await api(`${base}/interviews/${iv.id}/answer`, {
      method: "POST",
      as: viewer.id,
      json: { content: "hi", inputMode: "text" },
    });
    expect(ans.status).toBe(403);
    const comp = await api(`${base}/interviews/${iv.id}/complete`, {
      method: "POST",
      as: viewer.id,
    });
    expect(comp.status).toBe(403);
    const tr = await api(`${base}/interviews/transcript`, {
      method: "POST",
      as: viewer.id,
      json: { title: "t", text: "hello" },
    });
    expect(tr.status).toBe(403);
    const form = new FormData();
    form.append("audio", new File([new Uint8Array(10)], "a.webm", { type: "audio/webm" }));
    expect(
      (await api(`${base}/transcribe`, { method: "POST", as: viewer.id, body: form })).status,
    ).toBe(403);
  });

  it("returns 404 for other tenants' interviews", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const { body: iv } = await start(a.orgId, a.userId, { kind: "onboarding" });
    // b is not a member of a's org
    expect((await api(`/api/orgs/${a.orgId}/interviews/${iv.id}`, { as: b.userId })).status).toBe(
      404,
    );
    // b using its own org with a's interview id
    expect((await api(`/api/orgs/${b.orgId}/interviews/${iv.id}`, { as: b.userId })).status).toBe(
      404,
    );
    const ans = await api(`/api/orgs/${b.orgId}/interviews/${iv.id}/answer`, {
      method: "POST",
      as: b.userId,
      json: { content: "hi", inputMode: "text" },
    });
    expect(ans.status).toBe(404);
    const comp = await api(`/api/orgs/${b.orgId}/interviews/${iv.id}/complete`, {
      method: "POST",
      as: b.userId,
    });
    expect(comp.status).toBe(404);
    const list = await api(`/api/orgs/${b.orgId}/interviews`, { as: b.userId });
    expect(((await list.json()) as { items: unknown[] }).items).toEqual([]);
    // b cannot point an interview at a's project
    const projectId = newId("prj");
    await testDb().insert(projects).values({ id: projectId, orgId: a.orgId, title: "A's project" });
    expect(
      (await start(b.orgId, b.userId, { kind: "project", focusProjectId: projectId })).res.status,
    ).toBe(404);
    const { applicationId } = await seedApplicationWithFlags(a.orgId);
    expect(
      (await start(b.orgId, b.userId, { kind: "gap_fill", focusApplicationId: applicationId })).res
        .status,
    ).toBe(404);
  });
});
