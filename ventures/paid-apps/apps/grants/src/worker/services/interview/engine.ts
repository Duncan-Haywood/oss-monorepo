// AI interviewer engine: agenda building, next-question generation, answers, completion
// (summary + project fields + fact extraction) and transcript import.
import type { InputMode, InterviewKind, InterviewMode, InterviewStatus } from "@shared/enums";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  applicationFlags,
  applications,
  consentRecords,
  type InterviewAgendaItem,
  interviews,
  interviewTurns,
  organization,
  projects,
} from "../../db/schema";
import { AppError, badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { enqueue } from "../../queues/enqueue";
import { audit } from "../privacy/audit";
import {
  loadCoverage,
  loadKnownFacts,
  loadUpdateAgendaItems,
  storeTranscriptDocument,
} from "./deps";
import { deterministicNextQuestion } from "./deterministic";
import { type ProjectFieldUpdates, validateProjectFields } from "./project-fields";
import {
  buildInterviewerContext,
  buildNextQuestionPrompt,
  buildProjectFieldsPrompt,
  buildSummaryPrompt,
  INTERVIEWER_SYSTEM,
  MAX_QUESTIONS,
  maxQuestionsFor,
  type NextQuestion,
  NextQuestionSchema,
  type NextQuestionState,
  PROJECT_FIELDS_SYSTEM,
  type ProjectFieldKey,
  ProjectFieldsSchema,
  type RespondentStatement,
  SUMMARY_SYSTEM,
  SummarySchema,
} from "./prompts";
import {
  DEFAULT_ONBOARDING_TOPICS,
  gapItems,
  orgTopicItem,
  PROJECT_TOPICS,
  projectTopicItem,
} from "./topics";
import { parseTranscript } from "./transcript";

export type InterviewRow = typeof interviews.$inferSelect;
export type TurnRow = typeof interviewTurns.$inferSelect;
export type InterviewWithTurns = InterviewRow & { turns: TurnRow[] };

const MAX_AGENDA = 10;
const TURN_INSERT_CHUNK = 8; // 12 columns per row; D1 allows 100 bound parameters per statement

// ------------------------------------------------------------------------------------ reads

export async function listInterviews(
  ctx: AppContext,
  orgId: string,
  filter: { status?: InterviewStatus; kind?: InterviewKind; limit?: number } = {},
): Promise<InterviewRow[]> {
  const where = [eq(interviews.orgId, orgId)];
  if (filter.status) where.push(eq(interviews.status, filter.status));
  if (filter.kind) where.push(eq(interviews.kind, filter.kind));
  return ctx.db
    .select()
    .from(interviews)
    .where(and(...where))
    .orderBy(desc(interviews.createdAt))
    .limit(Math.min(filter.limit ?? 100, 200))
    .all();
}

async function loadInterview(ctx: AppContext, orgId: string, id: string): Promise<InterviewRow> {
  const row = await ctx.db
    .select()
    .from(interviews)
    .where(and(eq(interviews.id, id), eq(interviews.orgId, orgId)))
    .get();
  if (!row) throw notFound("Interview");
  return row;
}

async function loadTurns(ctx: AppContext, orgId: string, interviewId: string): Promise<TurnRow[]> {
  return ctx.db
    .select()
    .from(interviewTurns)
    .where(and(eq(interviewTurns.interviewId, interviewId), eq(interviewTurns.orgId, orgId)))
    .orderBy(asc(interviewTurns.ordinal))
    .all();
}

export async function getInterview(
  ctx: AppContext,
  orgId: string,
  id: string,
): Promise<InterviewWithTurns> {
  const interview = await loadInterview(ctx, orgId, id);
  return { ...interview, turns: await loadTurns(ctx, orgId, id) };
}

// ------------------------------------------------------------------------------------ start

export interface StartInterviewInput {
  orgId: string;
  userId: string | null;
  kind: Exclude<InterviewKind, "transcript_upload">;
  mode?: Exclude<InterviewMode, "human_transcript">;
  focusProjectId?: string | null;
  focusApplicationId?: string | null;
}

/**
 * AI interviews need the member's `ai_interview` consent (a personal scope: each member decides).
 * No record = allowed (covered by the onboarding consents); only an explicit revocation blocks.
 */
export async function assertAiInterviewConsent(
  ctx: AppContext,
  orgId: string,
  userId: string | null,
): Promise<void> {
  const scope = and(eq(consentRecords.orgId, orgId), eq(consentRecords.scope, "ai_interview"));
  const latest = await ctx.db
    .select({ granted: consentRecords.granted })
    .from(consentRecords)
    .where(userId ? and(scope, eq(consentRecords.userId, userId)) : scope)
    .orderBy(desc(consentRecords.createdAt), desc(consentRecords.id))
    .get();
  if (latest && !latest.granted) {
    throw new AppError(
      403,
      "consent_required",
      "AI interviews are turned off because the AI interview consent was revoked. Turn it back on in Settings → Privacy to continue.",
      { scope: "ai_interview" },
    );
  }
}

export async function startInterview(
  ctx: AppContext,
  input: StartInterviewInput,
): Promise<InterviewWithTurns> {
  const { orgId, kind } = input;
  await assertAiInterviewConsent(ctx, orgId, input.userId);
  let project: { id: string; title: string } | null = null;
  if (input.focusProjectId) {
    project =
      (await ctx.db
        .select({ id: projects.id, title: projects.title })
        .from(projects)
        .where(and(eq(projects.id, input.focusProjectId), eq(projects.orgId, orgId)))
        .get()) ?? null;
    if (!project) throw notFound("Project");
  }

  let agendaItems: InterviewAgendaItem[];
  let title: string;
  let applicationId: string | null = null;
  switch (kind) {
    case "onboarding": {
      const coverage = await loadCoverage(ctx, orgId);
      agendaItems = coverageAgenda(coverage, ["missing", "thin", "good"]);
      title = "Getting to know your organization";
      break;
    }
    case "follow_up": {
      const coverage = await loadCoverage(ctx, orgId);
      agendaItems = coverageAgenda(coverage, ["thin"]);
      if (agendaItems.length === 0) agendaItems = coverageAgenda(coverage, ["missing"]);
      title = "Follow-up interview";
      break;
    }
    case "update": {
      // "What's new?" check-in: themes with outdated facts first (services/updates/agenda.ts).
      ({ agendaItems, title } = await loadUpdateAgendaItems(ctx, orgId));
      break;
    }
    case "project": {
      agendaItems = PROJECT_TOPICS.map((t) => projectTopicItem(t, project?.title ?? null));
      title = project ? `Project interview: ${project.title}` : "Project interview";
      break;
    }
    case "gap_fill": {
      if (!input.focusApplicationId)
        throw badRequest("focusApplicationId is required for gap_fill");
      const app = await loadApplication(ctx, orgId, input.focusApplicationId);
      applicationId = app.id;
      const flags = await ctx.db
        .select({
          id: applicationFlags.id,
          message: applicationFlags.message,
          suggestedQuestion: applicationFlags.suggestedQuestion,
        })
        .from(applicationFlags)
        .where(
          and(
            eq(applicationFlags.orgId, orgId),
            eq(applicationFlags.applicationId, app.id),
            eq(applicationFlags.status, "open"),
            inArray(applicationFlags.kind, ["missing_info", "unsupported_claim"]),
          ),
        )
        .orderBy(asc(applicationFlags.createdAt))
        .all();
      agendaItems = gapItems(
        flags.map((f) => ({
          question: f.suggestedQuestion?.trim() || `Could you help us with this: ${f.message}`,
          flagId: f.id,
        })),
      ).slice(0, MAX_QUESTIONS);
      if (agendaItems.length === 0) throw badRequest("This application has no open questions");
      title = `Missing details: ${app.title}`;
      break;
    }
    default:
      throw badRequest(`Unsupported interview kind: ${String(kind)}`);
  }
  if (agendaItems.length === 0) {
    agendaItems = DEFAULT_ONBOARDING_TOPICS.slice(0, MAX_AGENDA).map(orgTopicItem);
  }

  const interviewId = newId("int");
  await ctx.db.insert(interviews).values({
    id: interviewId,
    orgId,
    kind,
    mode: input.mode ?? "ai_chat",
    status: "active",
    title,
    focusProjectId: project?.id ?? null,
    focusApplicationId: applicationId,
    agenda: agendaItems.map((a) => a.key),
    agendaItems,
    coveredTopics: [],
    createdBy: input.userId,
  });
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: input.userId,
    action: "interview.started",
    targetType: "interview",
    targetId: interviewId,
    metadata: { kind },
  });

  const interview = await loadInterview(ctx, orgId, interviewId);
  await askNext(ctx, interview, [], { useLlm: true });
  return getInterview(ctx, orgId, interviewId);
}

function coverageAgenda(
  coverage: { topic: string; status: string; label?: string; question?: string }[],
  statuses: string[],
): InterviewAgendaItem[] {
  const out: InterviewAgendaItem[] = [];
  for (const status of statuses) {
    for (const c of coverage) {
      if (c.status !== status || out.some((o) => o.key === c.topic)) continue;
      const item = orgTopicItem(c.topic);
      const generic = item.question.startsWith("Could you tell me about");
      out.push({
        key: c.topic,
        label: c.label ?? item.label,
        question: generic && c.question ? c.question : item.question,
      });
    }
  }
  return out.slice(0, MAX_AGENDA);
}

async function loadApplication(ctx: AppContext, orgId: string, applicationId: string) {
  const app = await ctx.db
    .select({ id: applications.id, title: applications.title })
    .from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.orgId, orgId)))
    .get();
  if (!app) throw notFound("Application");
  return app;
}

// ------------------------------------------------------------------------------------ gap fill

/**
 * Used by the application pipeline: opens (or extends) an active gap-fill interview for an
 * application with the given questions. The first question is asked deterministically (no LLM).
 */
export async function createGapFillInterview(
  ctx: AppContext,
  input: { orgId: string; applicationId: string; questions: string[]; userId?: string | null },
): Promise<{ interviewId: string }> {
  const { orgId } = input;
  const app = await loadApplication(ctx, orgId, input.applicationId);
  const existing = await ctx.db
    .select()
    .from(interviews)
    .where(
      and(
        eq(interviews.orgId, orgId),
        eq(interviews.focusApplicationId, app.id),
        eq(interviews.kind, "gap_fill"),
        eq(interviews.status, "active"),
      ),
    )
    .orderBy(desc(interviews.createdAt))
    .get();

  if (existing) {
    const known = new Set(existing.agendaItems.map((a) => a.question.toLowerCase().trim()));
    const fresh = gapItems(input.questions.map((question) => ({ question }))).filter(
      (q) => !known.has(q.question.toLowerCase().trim()),
    );
    if (fresh.length > 0) {
      const base = existing.agendaItems.length;
      const added = fresh.map((q, i) => ({
        ...q,
        key: `gap_${base + i + 1}`,
        label: `Open question ${base + i + 1}`,
      }));
      const agendaItems = [...existing.agendaItems, ...added];
      await ctx.db
        .update(interviews)
        .set({ agendaItems, agenda: agendaItems.map((a) => a.key) })
        .where(and(eq(interviews.id, existing.id), eq(interviews.orgId, orgId)));
      // If the interviewer had finished, ask the first new question now.
      const turns = await loadTurns(ctx, orgId, existing.id);
      const last = turns[turns.length - 1];
      if (!last || last.role === "respondent") {
        const fresh2 = await loadInterview(ctx, orgId, existing.id);
        await askNext(ctx, fresh2, turns, { useLlm: false });
      }
    }
    return { interviewId: existing.id };
  }

  const agendaItems = gapItems(input.questions.map((question) => ({ question }))).slice(
    0,
    MAX_QUESTIONS,
  );
  if (agendaItems.length === 0) throw badRequest("No questions given");
  const interviewId = newId("int");
  await ctx.db.insert(interviews).values({
    id: interviewId,
    orgId,
    kind: "gap_fill",
    mode: "ai_chat",
    status: "active",
    title: `Missing details: ${app.title}`,
    focusApplicationId: app.id,
    agenda: agendaItems.map((a) => a.key),
    agendaItems,
    coveredTopics: [],
    createdBy: input.userId ?? null,
  });
  await audit(ctx, {
    orgId,
    actorType: input.userId ? "user" : "system",
    actorId: input.userId ?? null,
    action: "interview.gap_fill_created",
    targetType: "interview",
    targetId: interviewId,
    metadata: { applicationId: app.id, questions: agendaItems.length },
  });
  const interview = await loadInterview(ctx, orgId, interviewId);
  await askNext(ctx, interview, [], { useLlm: false });
  return { interviewId };
}

/**
 * Opens a follow_up / update interview with a caller-supplied agenda (e.g. a post-award report
 * check-in asking for the metrics a report is missing). The first question is asked
 * deterministically (no LLM); facts are extracted when it completes, as for any interview.
 */
export async function createAgendaInterview(
  ctx: AppContext,
  input: {
    orgId: string;
    kind: "follow_up" | "update";
    title: string;
    items: { key: string; label: string; question: string }[];
    focusProjectId?: string | null;
    focusApplicationId?: string | null;
    userId?: string | null;
  },
): Promise<{ interviewId: string }> {
  const { orgId } = input;
  await assertAiInterviewConsent(ctx, orgId, input.userId ?? null);
  const agendaItems = input.items
    .filter((i) => i.question.trim())
    .slice(0, MAX_QUESTIONS)
    .map((i) => ({ key: i.key, label: i.label, question: i.question.trim() }));
  if (agendaItems.length === 0) throw badRequest("No questions given");
  const interviewId = newId("int");
  await ctx.db.insert(interviews).values({
    id: interviewId,
    orgId,
    kind: input.kind,
    mode: "ai_chat",
    status: "active",
    title: input.title.slice(0, 200),
    focusProjectId: input.focusProjectId ?? null,
    focusApplicationId: input.focusApplicationId ?? null,
    agenda: agendaItems.map((a) => a.key),
    agendaItems,
    coveredTopics: [],
    createdBy: input.userId ?? null,
  });
  await audit(ctx, {
    orgId,
    actorType: input.userId ? "user" : "system",
    actorId: input.userId ?? null,
    action: "interview.started",
    targetType: "interview",
    targetId: interviewId,
    metadata: { kind: input.kind, questions: agendaItems.length, agenda: "custom" },
  });
  const interview = await loadInterview(ctx, orgId, interviewId);
  await askNext(ctx, interview, [], { useLlm: false });
  return { interviewId };
}

// ------------------------------------------------------------------------------------ answer

export interface AnswerInput {
  orgId: string;
  userId: string | null;
  interviewId: string;
  content: string;
  inputMode: InputMode;
  audioR2Key?: string | null;
}

export interface AnswerResult {
  turns: [TurnRow, TurnRow | null];
  done: boolean;
}

export async function answerInterview(ctx: AppContext, input: AnswerInput): Promise<AnswerResult> {
  const { orgId } = input;
  const interview = await loadInterview(ctx, orgId, input.interviewId);
  if (interview.status !== "active") throw conflict("This interview is no longer active");
  if (interview.mode === "human_transcript") throw conflict("Transcript interviews are read-only");
  const content = input.content.trim();
  if (!content) throw badRequest("Answer is empty");

  const turns = await loadTurns(ctx, orgId, interview.id);
  const lastQuestion = [...turns].reverse().find((t) => t.role === "interviewer");
  const respondentTurn: TurnRow = {
    id: newId("trn"),
    orgId,
    interviewId: interview.id,
    ordinal: nextOrdinal(turns),
    role: "respondent",
    content,
    inputMode: input.inputMode,
    audioR2Key: input.audioR2Key ?? null,
    topicKey: lastQuestion?.topicKey ?? null,
    speakerName: null,
    createdBy: input.userId,
    createdAt: ctx.now(),
  };
  await ctx.db.insert(interviewTurns).values(respondentTurn);
  turns.push(respondentTurn);

  const next = await askNext(ctx, interview, turns, { useLlm: true });
  return { turns: [respondentTurn, next], done: next === null };
}

function nextOrdinal(turns: TurnRow[]): number {
  return turns.reduce((m, t) => Math.max(m, t.ordinal), 0) + 1;
}

/** Computes and stores the next interviewer turn; returns null (and records coverage) when done. */
async function askNext(
  ctx: AppContext,
  interview: InterviewRow,
  turns: TurnRow[],
  opts: { useLlm: boolean },
): Promise<TurnRow | null> {
  const state = await buildState(ctx, interview, turns);
  let next: NextQuestion;
  if (state.questionsAsked >= state.maxQuestions) {
    next = { question: "", topicKey: "", coveredTopics: state.coveredTopics, done: true };
  } else if (!opts.useLlm) {
    next = deterministicNextQuestion(state);
  } else {
    next = await llmNextQuestion(ctx, interview, state, turns);
  }

  const agendaKeys = new Set(interview.agenda);
  const covered = new Set(interview.coveredTopics);
  for (const k of next.coveredTopics) if (agendaKeys.has(k)) covered.add(k);
  const coveredTopics = interview.agenda.filter((k) => covered.has(k));
  const question = next.question.trim().slice(0, 1200);
  const done = next.done || !question;

  await ctx.db
    .update(interviews)
    .set({ coveredTopics })
    .where(and(eq(interviews.id, interview.id), eq(interviews.orgId, interview.orgId)));
  if (done) return null;

  const turn: TurnRow = {
    id: newId("trn"),
    orgId: interview.orgId,
    interviewId: interview.id,
    ordinal: nextOrdinal(turns),
    role: "interviewer",
    content: question,
    inputMode: "text",
    audioR2Key: null,
    topicKey: next.topicKey || state.currentTopic || interview.agenda[0] || null,
    speakerName: null,
    createdBy: null,
    createdAt: ctx.now(),
  };
  await ctx.db.insert(interviewTurns).values(turn);
  return turn;
}

async function buildState(
  ctx: AppContext,
  interview: InterviewRow,
  turns: TurnRow[],
): Promise<NextQuestionState> {
  const org = await ctx.db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, interview.orgId))
    .get();
  let projectTitle: string | null = null;
  if (interview.focusProjectId) {
    const p = await ctx.db
      .select({ title: projects.title })
      .from(projects)
      .where(and(eq(projects.id, interview.focusProjectId), eq(projects.orgId, interview.orgId)))
      .get();
    projectTitle = p?.title ?? null;
  }
  const questions = turns.filter((t) => t.role === "interviewer");
  const lastQ = questions[questions.length - 1];
  const last = turns[turns.length - 1];
  let followUps = 0;
  for (let i = questions.length - 2; i >= 0 && lastQ; i--) {
    if (questions[i]?.topicKey !== lastQ.topicKey) break;
    followUps++;
  }
  const agenda =
    interview.agendaItems.length > 0
      ? interview.agendaItems
      : interview.agenda.map((k) => orgTopicItem(k));
  return {
    kind: interview.kind,
    orgName: org?.name ?? "the organization",
    projectTitle,
    agenda,
    coveredTopics: interview.coveredTopics,
    questionsAsked: questions.length,
    maxQuestions: maxQuestionsFor(interview.kind),
    currentTopic: lastQ?.topicKey ?? null,
    followUpsOnCurrentTopic: followUps,
    lastAnswer: last?.role === "respondent" ? last.content : null,
  };
}

async function llmNextQuestion(
  ctx: AppContext,
  interview: InterviewRow,
  state: NextQuestionState,
  turns: TurnRow[],
): Promise<NextQuestion> {
  try {
    const knownFacts = await loadKnownFacts(ctx, interview.orgId, interview.focusProjectId);
    const { data } = await ctx.llm.generateStructured({
      purpose: "interview.next_question",
      orgId: interview.orgId,
      applicationId: interview.focusApplicationId,
      system: INTERVIEWER_SYSTEM,
      context: buildInterviewerContext(state.orgName, knownFacts),
      prompt: buildNextQuestionPrompt(
        state,
        turns.map((t) => ({ role: t.role, content: t.content, topicKey: t.topicKey })),
      ),
      schema: NextQuestionSchema,
      effort: "low",
      maxTokens: 4_000, // adaptive thinking shares this budget with the JSON
    });
    // The opening turn must always ask something.
    if (state.questionsAsked === 0 && (data.done || !data.question.trim())) {
      return deterministicNextQuestion(state);
    }
    return data;
  } catch (e) {
    ctx.logger.warn("interview.next_question_fallback", { error: String(e) });
    return deterministicNextQuestion(state);
  }
}

// ------------------------------------------------------------------------------------ complete

export async function completeInterview(
  ctx: AppContext,
  input: { orgId: string; userId: string | null; interviewId: string },
): Promise<InterviewWithTurns> {
  const { orgId } = input;
  const interview = await loadInterview(ctx, orgId, input.interviewId);
  if (interview.status === "completed") return getInterview(ctx, orgId, interview.id);
  if (interview.status !== "active") throw conflict("This interview was abandoned");

  const turns = await loadTurns(ctx, orgId, interview.id);
  const statements = respondentStatements(turns);
  const summary = await summarize(ctx, orgId, statements);
  await ctx.db
    .update(interviews)
    .set({ status: "completed", completedAt: ctx.now(), summary })
    .where(and(eq(interviews.id, interview.id), eq(interviews.orgId, orgId)));

  let projectFields: string[] = [];
  if (interview.kind === "project" && interview.focusProjectId && statements.length > 0) {
    projectFields = await fillProjectFields(
      ctx,
      orgId,
      interview.focusProjectId,
      interview.id,
      statements,
      input.userId,
    );
  }
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: input.userId,
    action: "interview.completed",
    targetType: "interview",
    targetId: interview.id,
    metadata: { respondentTurns: statements.length, projectFields },
  });
  if (statements.length > 0) await enqueueExtraction(ctx, orgId, interview.id);
  return getInterview(ctx, orgId, interview.id);
}

function respondentStatements(turns: TurnRow[]): RespondentStatement[] {
  return turns
    .filter((t) => t.role === "respondent" && t.content.trim())
    .map((t) => ({ turnId: t.id, topicKey: t.topicKey, text: t.content }));
}

async function summarize(
  ctx: AppContext,
  orgId: string,
  statements: RespondentStatement[],
): Promise<string | null> {
  if (statements.length === 0) return null;
  try {
    const { data } = await ctx.llm.generateStructured({
      purpose: "interview.summary",
      orgId,
      system: SUMMARY_SYSTEM,
      prompt: buildSummaryPrompt(statements.slice(-200)),
      schema: SummarySchema,
      effort: "low",
      maxTokens: 4_000, // adaptive thinking shares this budget
    });
    return data.summary.trim() || null;
  } catch (e) {
    ctx.logger.warn("interview.summary_failed", { error: String(e) });
    return null;
  }
}

async function fillProjectFields(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  interviewId: string,
  statements: RespondentStatement[],
  userId: string | null,
): Promise<string[]> {
  const project = await ctx.db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)))
    .get();
  if (!project) return [];
  const blank = (v: string | null) => !v?.trim();
  const emptyFields: ProjectFieldKey[] = [];
  if (blank(project.summary)) emptyFields.push("summary");
  if (blank(project.problem)) emptyFields.push("problem");
  if (blank(project.approach)) emptyFields.push("approach");
  if (blank(project.populationServed)) emptyFields.push("populationServed");
  if (blank(project.location)) emptyFields.push("location");
  if (project.budgetNeededCents === null) emptyFields.push("budgetNeeded");
  if (blank(project.timelineStart)) emptyFields.push("timelineStart");
  if (blank(project.timelineEnd)) emptyFields.push("timelineEnd");
  if (emptyFields.length === 0) return [];

  let updates: ProjectFieldUpdates = {};
  try {
    const { data } = await ctx.llm.generateStructured({
      purpose: "interview.project_fields",
      orgId,
      system: PROJECT_FIELDS_SYSTEM,
      prompt: buildProjectFieldsPrompt(project.title, emptyFields, statements.slice(-200)),
      schema: ProjectFieldsSchema,
      effort: "medium",
      maxTokens: 4_000, // adaptive thinking shares this budget
    });
    updates = validateProjectFields(data, emptyFields, statements).updates;
  } catch (e) {
    ctx.logger.warn("interview.project_fields_failed", { error: String(e) });
    return [];
  }
  const fields = Object.keys(updates);
  if (fields.length === 0) return [];
  await ctx.db
    .update(projects)
    .set(updates)
    .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)));
  await audit(ctx, {
    orgId,
    actorType: userId ? "user" : "system",
    actorId: userId,
    action: "project.fields_from_interview",
    targetType: "project",
    targetId: projectId,
    metadata: { interviewId, fields },
  });
  return fields;
}

async function enqueueExtraction(ctx: AppContext, orgId: string, interviewId: string) {
  try {
    await enqueue(ctx, { type: "facts.extract_interview", orgId, interviewId });
  } catch (e) {
    // Interview data is saved; extraction can be retried by re-completing / reprocessing.
    ctx.logger.error("interview.extraction_enqueue_failed", { interviewId, error: String(e) });
  }
}

// ------------------------------------------------------------------------------------ transcripts

export const MAX_TRANSCRIPT_CHARS = 500_000;
const MAX_TRANSCRIPT_TURNS = 1_000;

export interface ImportTranscriptInput {
  orgId: string;
  userId: string;
  title: string;
  text: string;
  filename?: string;
  interviewerNames?: string[];
}

export async function importTranscript(
  ctx: AppContext,
  input: ImportTranscriptInput,
): Promise<InterviewWithTurns> {
  const { orgId } = input;
  if (input.text.length > MAX_TRANSCRIPT_CHARS) {
    throw new AppError(413, "too_large", "Transcript is too long (max 500,000 characters)");
  }
  const parsed = parseTranscript(input.text, {
    ...(input.filename ? { filename: input.filename } : {}),
    ...(input.interviewerNames ? { interviewerNames: input.interviewerNames } : {}),
  });
  if (parsed.turns.length === 0) throw badRequest("Transcript is empty");
  const title = input.title.trim().slice(0, 200) || "Interview transcript";

  const doc = await storeTranscriptDocument(ctx, {
    orgId,
    userId: input.userId,
    title,
    text: parsed.normalizedText,
  });
  if (doc.duplicate) {
    // Same transcript uploaded again: return the existing interview instead of duplicating facts.
    const existing = await ctx.db
      .select({ id: interviews.id })
      .from(interviews)
      .where(and(eq(interviews.orgId, orgId), eq(interviews.transcriptDocumentId, doc.id)))
      .get();
    if (existing) return getInterview(ctx, orgId, existing.id);
  }

  const interviewId = newId("int");
  await ctx.db.insert(interviews).values({
    id: interviewId,
    orgId,
    kind: "transcript_upload",
    mode: "human_transcript",
    status: "completed",
    title,
    transcriptDocumentId: doc.id,
    agenda: [],
    agendaItems: [],
    coveredTopics: [],
    createdBy: input.userId,
    completedAt: ctx.now(),
  });

  const rows: TurnRow[] = parsed.turns.slice(0, MAX_TRANSCRIPT_TURNS).map((t, i) => ({
    id: newId("trn"),
    orgId,
    interviewId,
    ordinal: i + 1,
    role: t.role,
    content: t.content,
    inputMode: "text",
    audioR2Key: null,
    topicKey: null,
    speakerName: t.speaker,
    createdBy: input.userId,
    createdAt: ctx.now(),
  }));
  for (let i = 0; i < rows.length; i += TURN_INSERT_CHUNK) {
    await ctx.db.insert(interviewTurns).values(rows.slice(i, i + TURN_INSERT_CHUNK));
  }

  const statements = respondentStatements(rows);
  const summary = await summarize(ctx, orgId, statements);
  if (summary) {
    await ctx.db
      .update(interviews)
      .set({ summary })
      .where(and(eq(interviews.id, interviewId), eq(interviews.orgId, orgId)));
  }
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: input.userId,
    action: "interview.transcript_uploaded",
    targetType: "interview",
    targetId: interviewId,
    metadata: { documentId: doc.id, format: parsed.format, turns: rows.length },
  });
  if (statements.length > 0) await enqueueExtraction(ctx, orgId, interviewId);
  return getInterview(ctx, orgId, interviewId);
}
