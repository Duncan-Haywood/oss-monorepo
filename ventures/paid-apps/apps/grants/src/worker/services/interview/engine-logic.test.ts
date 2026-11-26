import { describe, expect, it } from "vitest";
import {
  deterministicNextQuestion,
  deterministicProjectFields,
  deterministicSummary,
  isVagueAnswer,
} from "./deterministic";
import { fakeHandlers } from "./fake-llm";
import { numbersIn, parseMoneyToCents, validateProjectFields } from "./project-fields";
import {
  buildNextQuestionPrompt,
  buildProjectFieldsPrompt,
  buildSummaryPrompt,
  NextQuestionSchema,
  type NextQuestionState,
  ProjectFieldsSchema,
  SummarySchema,
} from "./prompts";
import { gapItems, orgTopicItem, projectTopicItem } from "./topics";

const baseState = (over: Partial<NextQuestionState> = {}): NextQuestionState => ({
  kind: "onboarding",
  orgName: "SWIF",
  projectTitle: null,
  agenda: [orgTopicItem("mission"), orgTopicItem("programs"), orgTopicItem("outcomes")],
  coveredTopics: [],
  questionsAsked: 0,
  maxQuestions: 12,
  currentTopic: null,
  followUpsOnCurrentTopic: 0,
  lastAnswer: null,
  ...over,
});

describe("deterministic interviewer", () => {
  it("opens with a greeting and the first agenda question", () => {
    const q = deterministicNextQuestion(baseState());
    expect(q.done).toBe(false);
    expect(q.topicKey).toBe("mission");
    expect(q.question).toMatch(/I don't know/);
    expect(q.question).toContain("mission");
  });

  it("moves on after a substantive answer and records coverage", () => {
    const q = deterministicNextQuestion(
      baseState({
        questionsAsked: 1,
        currentTopic: "mission",
        lastAnswer: "We help Navajo families build self-sufficiency through housing and jobs.",
      }),
    );
    expect(q.topicKey).toBe("programs");
    expect(q.coveredTopics).toEqual(["mission"]);
  });

  it("asks one follow-up for a vague answer, then moves on", () => {
    const vague = baseState({
      questionsAsked: 1,
      currentTopic: "mission",
      lastAnswer: "We help people.",
    });
    const f = deterministicNextQuestion(vague);
    expect(f.topicKey).toBe("mission");
    expect(f.question).toMatch(/concrete/);
    expect(f.coveredTopics).toEqual([]);
    const after = deterministicNextQuestion({
      ...vague,
      questionsAsked: 2,
      followUpsOnCurrentTopic: 1,
    });
    expect(after.topicKey).toBe("programs");
  });

  it("accepts 'I don't know' without a follow-up", () => {
    expect(isVagueAnswer("I don't know")).toBe(false);
    const q = deterministicNextQuestion(
      baseState({ questionsAsked: 1, currentTopic: "mission", lastAnswer: "I don't know" }),
    );
    expect(q.topicKey).toBe("programs");
    expect(q.question).toMatch(/^No problem/);
  });

  it("finishes when the agenda is covered or the question cap is hit", () => {
    const covered = deterministicNextQuestion(
      baseState({
        coveredTopics: ["mission", "programs"],
        questionsAsked: 3,
        currentTopic: "outcomes",
        lastAnswer: "42 trainees completed the program in 2025.",
      }),
    );
    expect(covered.done).toBe(true);
    expect(covered.coveredTopics).toEqual(["mission", "programs", "outcomes"]);
    expect(deterministicNextQuestion(baseState({ questionsAsked: 12 })).done).toBe(true);
  });

  it("fake handler reads the prompt state and returns schema-valid output", async () => {
    const prompt = buildNextQuestionPrompt(baseState(), []);
    const out = await fakeHandlers["interview.next_question"]?.({
      purpose: "interview.next_question",
      system: "",
      prompt,
    });
    expect(NextQuestionSchema.parse(out).topicKey).toBe("mission");
  });
});

describe("summary + project fields fakes", () => {
  const statements = [
    { turnId: "t1", topicKey: "problem", text: "Young adults in Gallup can't find trades jobs." },
    {
      turnId: "t2",
      topicKey: "budget",
      text: "We think it costs about $250,000 for the first year. Mostly tools.",
    },
    {
      turnId: "t3",
      topicKey: "timeline",
      text: "We'd start in March 2027 and be fully running by December 2027.",
    },
    { turnId: "t4", topicKey: "location", text: "I don't know yet." },
  ];

  it("summary only repeats respondent text", async () => {
    const s = deterministicSummary(statements);
    expect(s).toContain("- Young adults in Gallup can't find trades jobs.");
    expect(s).not.toContain("I don't know");
    const out = await fakeHandlers["interview.summary"]?.({
      purpose: "interview.summary",
      system: "",
      prompt: buildSummaryPrompt(statements),
    });
    expect(SummarySchema.parse(out).summary).toBe(s);
  });

  it("project fields are taken verbatim and pass validation", async () => {
    const empty = ["problem", "location", "budgetNeeded", "timelineStart", "timelineEnd"] as const;
    const out = ProjectFieldsSchema.parse(
      await fakeHandlers["interview.project_fields"]?.({
        purpose: "interview.project_fields",
        system: "",
        prompt: buildProjectFieldsPrompt("Trades Academy", [...empty], statements),
      }),
    );
    expect(out).toEqual(deterministicProjectFields([...empty], statements));
    const { updates, accepted } = validateProjectFields(out, [...empty], statements);
    expect(updates).toEqual({
      problem: "Young adults in Gallup can't find trades jobs.",
      budgetNeededCents: 25_000_000,
      timelineStart: "March 2027",
      timelineEnd: "December 2027",
    });
    expect(accepted.find((a) => a.field === "budgetNeeded")?.turnId).toBe("t2");
  });

  it("rejects fabricated quotes, new numbers and non-empty fields", () => {
    const { updates } = validateProjectFields(
      {
        fields: [
          { field: "problem", value: "Unemployment is 40%.", quote: "Unemployment is 40%." },
          {
            field: "approach",
            value: "Train 50 people",
            quote: "We think it costs about $250,000",
          },
          { field: "budgetNeeded", value: "$300,000", quote: "costs about $250,000" },
          { field: "location", value: "Gallup", quote: "Young adults in Gallup" },
        ],
      },
      ["problem", "budgetNeeded"],
      statements,
    );
    expect(updates).toEqual({});
  });

  it("rejects a budget whose magnitude is not in the quote ($250 -> $250 million)", () => {
    const said = [{ turnId: "t9", topicKey: null, text: "The kit costs $250 per student." }];
    const out = (value: string, quote: string) =>
      validateProjectFields(
        { fields: [{ field: "budgetNeeded", value, quote }] },
        ["budgetNeeded"],
        said,
      ).updates;
    expect(out("$250 million", "costs $250")).toEqual({});
    expect(out("$250k", "costs $250")).toEqual({});
    expect(out("$250", "costs $250")).toEqual({ budgetNeededCents: 25_000 });
  });

  it("parses money and numbers", () => {
    expect(parseMoneyToCents("$1.2 million")).toBe(120_000_000);
    expect(parseMoneyToCents("$250k")).toBe(25_000_000);
    expect(parseMoneyToCents("about $45,500.50")).toBe(4_550_050);
    expect(parseMoneyToCents("none")).toBeNull();
    expect(numbersIn("$1,250 in 2025.")).toEqual(["1250", "2025"]);
  });
});

describe("topics", () => {
  it("maps knowledge checklist keys to canned questions and handles unknown keys", () => {
    expect(orgTopicItem("financials").label).toBe("Budget and funding");
    expect(orgTopicItem("volunteer_program").question).toMatch(/volunteer program/);
    expect(projectTopicItem("budget", "Trades Academy").question).toContain('"Trades Academy"');
  });

  it("dedupes gap questions and keeps flag ids", () => {
    const items = gapItems([
      { question: "How many trainees?", flagId: "flg_1" },
      { question: " how many  trainees? " },
      { question: "" },
      { question: "What year?" },
    ]);
    expect(items).toEqual([
      { key: "gap_1", label: "Open question 1", question: "How many trainees?", flagId: "flg_1" },
      { key: "gap_2", label: "Open question 2", question: "What year?" },
    ]);
  });
});
