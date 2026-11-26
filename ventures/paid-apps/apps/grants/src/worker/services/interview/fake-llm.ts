// Deterministic FakeLlm handlers for the interview module's LLM purposes ("interview.*").
// Must return data that satisfies the zod schema the real call uses.
import type { FakeHandler } from "../../ports/fake-llm";
import {
  deterministicNextQuestion,
  deterministicProjectFields,
  deterministicSummary,
} from "./deterministic";
import {
  type NextQuestionState,
  type ProjectFieldKey,
  type RespondentStatement,
  readTaggedJson,
} from "./prompts";

type Statement = Pick<RespondentStatement, "topicKey" | "text">;

const statementsFrom = (prompt: string): RespondentStatement[] =>
  (readTaggedJson<Statement[]>(prompt, "respondent_statements") ?? []).map((s, i) => ({
    turnId: `stmt_${i}`,
    topicKey: s.topicKey ?? null,
    text: s.text ?? "",
  }));

export const fakeHandlers: Record<string, FakeHandler> = {
  "interview.next_question": (req) => {
    const state = readTaggedJson<NextQuestionState>(req.prompt, "interview_state");
    if (!state) return { question: "", topicKey: "", coveredTopics: [], done: true };
    return deterministicNextQuestion(state);
  },
  "interview.summary": (req) => ({ summary: deterministicSummary(statementsFrom(req.prompt)) }),
  "interview.project_fields": (req) =>
    deterministicProjectFields(
      readTaggedJson<ProjectFieldKey[]>(req.prompt, "empty_fields") ?? [],
      statementsFrom(req.prompt),
    ),
};
