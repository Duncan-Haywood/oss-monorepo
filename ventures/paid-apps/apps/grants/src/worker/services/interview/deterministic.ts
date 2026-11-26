// Deterministic interviewer logic. Powers the FakeLlm handlers (tests + offline demo) and is the
// fallback when the real model fails. Everything here only reuses the respondent's own words.
import type {
  NextQuestion,
  NextQuestionState,
  ProjectFieldKey,
  ProjectFieldsOutput,
  RespondentStatement,
} from "./prompts";

const SKIP_RE =
  /\b(i\s*(?:do\s*n[o']?t|dont)\s*know|not\s+sure|no\s+idea|skip|pass|n\/a|rather\s+not|prefer\s+not|no\s+(?:real\s+)?changes?|nothing\s+(?:new|(?:has\s+)?changed)|same\s+as\s+(?:before|last))\b/i;

/** Vague = short and without any number; such answers get one follow-up. */
export function isVagueAnswer(answer: string): boolean {
  const words = answer.trim().split(/\s+/).filter(Boolean);
  if (SKIP_RE.test(answer)) return false;
  return words.length < 8 && !/\d/.test(answer);
}

export function isSkipAnswer(answer: string): boolean {
  return SKIP_RE.test(answer);
}

const OPENERS: Record<string, string> = {
  onboarding:
    "Thanks for taking the time — I'll ask one question at a time, and you can type or speak your answers. \"I don't know\" is always fine.",
  project:
    'Thanks for walking me through this project — one question at a time, typed or spoken, and "I don\'t know" is fine.',
  gap_fill:
    "A grant draft needs a few details only you can confirm. I'll ask one question at a time — \"I don't know\" is a fine answer.",
  follow_up:
    'Thanks for coming back — I have a few follow-up questions, one at a time. "I don\'t know" is always fine.',
  update:
    'Thanks for checking in — a few quick questions about what\'s changed, typed or spoken. "No change" is a perfectly good answer.',
};

export function deterministicNextQuestion(state: NextQuestionState): NextQuestion {
  const covered = new Set(state.coveredTopics);
  const agendaKeys = new Set(state.agenda.map((a) => a.key));
  let followUp = false;

  if (state.currentTopic && state.lastAnswer !== null) {
    const vague = isVagueAnswer(state.lastAnswer);
    if (vague && state.followUpsOnCurrentTopic < 1) followUp = true;
    else if (agendaKeys.has(state.currentTopic)) covered.add(state.currentTopic);
  }
  const coveredTopics = state.agenda.map((a) => a.key).filter((k) => covered.has(k));

  if (state.questionsAsked >= state.maxQuestions) {
    return { question: "", topicKey: state.currentTopic ?? "", coveredTopics, done: true };
  }
  if (followUp && state.currentTopic) {
    return {
      question:
        "Thank you. Could you make that a bit more concrete — for example a number, a date, a name, or one specific example?",
      topicKey: state.currentTopic,
      coveredTopics,
      done: false,
    };
  }
  const next = state.agenda.find((a) => !covered.has(a.key));
  if (!next) return { question: "", topicKey: "", coveredTopics, done: true };

  let question = next.question;
  if (state.questionsAsked === 0) {
    question = `${OPENERS[state.kind] ?? OPENERS.onboarding} ${question}`;
  } else if (state.lastAnswer && isSkipAnswer(state.lastAnswer)) {
    question = `No problem, let's move on. ${question}`;
  } else {
    question = `Thank you. ${question}`;
  }
  return { question, topicKey: next.key, coveredTopics, done: false };
}

/** Bullet list of respondent statements, verbatim (truncated per statement). */
export function deterministicSummary(statements: RespondentStatement[]): string {
  return statements
    .map((s) => s.text.trim())
    .filter((t) => t && !isSkipAnswer(t))
    .slice(0, 8)
    .map((t) => `- ${firstSentences(t, 240)}`)
    .join("\n");
}

const FIELD_TOPICS: Record<ProjectFieldKey, string[]> = {
  summary: [],
  problem: ["problem"],
  approach: ["approach"],
  populationServed: ["population"],
  location: ["location"],
  budgetNeeded: ["budget"],
  timelineStart: ["timeline"],
  timelineEnd: ["timeline"],
};

const MONEY_RE =
  /\$\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|m|thousand|million)\b)?|\b\d[\d,]*(?:\.\d+)?\s?(?:thousand|million)\s+dollars\b/gi;
const DATEISH_RE =
  /\b(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(?:\d{1,2},\s*)?\d{4}|(?:spring|summer|fall|autumn|winter)\s+(?:of\s+)?\d{4}|q[1-4]\s+\d{4}|\d{4}-\d{2}(?:-\d{2})?|(?:19|20)\d{2})\b/gi;

export function deterministicProjectFields(
  emptyFields: ProjectFieldKey[],
  statements: RespondentStatement[],
): ProjectFieldsOutput {
  const fields: ProjectFieldsOutput["fields"] = [];
  const byTopic = (topics: string[]) =>
    statements.filter((s) => s.topicKey && topics.includes(s.topicKey) && !isSkipAnswer(s.text));

  for (const field of emptyFields) {
    const candidates = byTopic(FIELD_TOPICS[field]);
    if (field === "budgetNeeded") {
      for (const s of candidates) {
        const m = s.text.match(MONEY_RE)?.[0];
        if (m) {
          fields.push({ field, value: m, quote: sentenceContaining(s.text, m) });
          break;
        }
      }
    } else if (field === "timelineStart" || field === "timelineEnd") {
      for (const s of candidates) {
        const dates = s.text.match(DATEISH_RE) ?? [];
        const d = field === "timelineStart" ? dates[0] : dates.length > 1 ? dates[1] : undefined;
        if (d) {
          fields.push({ field, value: d, quote: sentenceContaining(s.text, d) });
          break;
        }
      }
    } else {
      const s = candidates[0];
      if (s) {
        const value = firstSentences(s.text.trim(), 600);
        fields.push({ field, value, quote: value });
      }
    }
  }
  return { fields };
}

function firstSentences(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return end > 40 ? cut.slice(0, end + 1) : cut;
}

function sentenceContaining(text: string, needle: string): string {
  const idx = text.indexOf(needle);
  if (idx < 0) return needle;
  const before = text.slice(0, idx);
  const boundary = Math.max(
    before.lastIndexOf(". "),
    before.lastIndexOf("? "),
    before.lastIndexOf("! "),
  );
  const start = boundary < 0 ? 0 : boundary + 2;
  const afterIdx = text.slice(idx).search(/[.?!](\s|$)/);
  const end = afterIdx < 0 ? text.length : idx + afterIdx + 1;
  return text.slice(start, end).trim();
}
