// Interviewer questions in transcripts uploaded as documents must never become facts.
import { describe, expect, it } from "vitest";
import {
  acceptExtractedFacts,
  buildDocumentPrompt,
  DOCUMENT_SYSTEM_PROMPT,
  interviewerLabelsFromTranscript,
  isQuestionOrInterviewerLine,
} from "./extract";
import { fakeExtractDocumentFacts } from "./fake-llm";
import { StatementIndex } from "./text";

const TRANSCRIPT = `# Interview Transcript — Program Director

Interviewed by Jane Doe (Grants Manager). Speakers: Maria Lopez (interviewer), Tom Begay (Program Director).

Interviewer: What do employers say about your graduates?

Program Director: Twelve local contractors hired our graduates in 2025, and most of them hire from every cohort.

Q: How many trainees finished the program last year

Jane: Tell me about the 2024 cohort and the trades program results

Maria Lopez: Describe the budget for the trades program in 2025

Tom Begay: Our trades program trained 142 students in 2024.`;

const fact = (statement: string, sourceQuote: string) => ({
  chunkRef: "C1",
  category: "outcome" as const,
  statement,
  value: null,
  asOf: null,
  sourceQuote,
  sensitivity: "internal" as const,
  confidence: 0.9,
});

describe("interviewer lines and questions are never facts", () => {
  it("reads interviewer names from the transcript header", () => {
    const labels = interviewerLabelsFromTranscript(TRANSCRIPT);
    expect(labels).toEqual(expect.arrayContaining(["jane doe", "jane", "maria lopez", "maria"]));
    expect(labels).not.toContain("tom begay");
    expect(
      interviewerLabelsFromTranscript("Interviewer: What makes your model different?"),
    ).toEqual([]);
    expect(interviewerLabelsFromTranscript("**Interviewer:** Ann Yazzie, Board Chair")).toEqual([
      "ann yazzie",
      "ann",
    ]);
  });

  it("detects questions and interviewer speaker labels", () => {
    const q = isQuestionOrInterviewerLine;
    expect(q("SWIF: What do employers say?", "What do employers say?")).toBe(true);
    expect(q("SWIF hires staff.", 'SWIF hires staff?"')).toBe(true);
    expect(q("X", "Interviewer: Tell me about the 2024 cohort")).toBe(true);
    expect(q("X", "**Q:** how many trainees finished")).toBe(true);
    expect(q("X", "Facilitator 2: describe the budget")).toBe(true);
    expect(q("X", "Maria Lopez: describe the budget", ["maria lopez"])).toBe(true);
    expect(
      q("SWIF trained 142 students.", "Tom Begay: Our trades program trained 142 students"),
    ).toBe(false);
    expect(q("SWIF trained 142 students in 2024.", "trained 142 students in 2024.")).toBe(false);
  });

  it("acceptExtractedFacts drops them and counts them", () => {
    const sources = [{ ref: "C1", id: "chk_1", text: TRANSCRIPT }];
    const labels = interviewerLabelsFromTranscript(TRANSCRIPT);
    const res = acceptExtractedFacts(
      [
        fact(
          "Interviewer: What do employers say about your graduates?",
          "Interviewer: What do employers say about your graduates?",
        ),
        fact(
          "Trainees finished the program last year.",
          "Q: How many trainees finished the program last year",
        ),
        fact(
          "The trades program had a 2024 cohort.",
          "Jane: Tell me about the 2024 cohort and the trades program results",
        ),
        fact(
          "The trades program had a 2025 budget.",
          "Maria Lopez: Describe the budget for the trades program in 2025",
        ),
        fact(
          "SWIF's trades program trained 142 students in 2024.",
          "Our trades program trained 142 students in 2024.",
        ),
      ],
      sources,
      new StatementIndex(),
      { interviewerLabels: labels },
    );
    expect(res.droppedQuestion).toBe(4);
    expect(res.accepted.map((f) => f.statement)).toEqual([
      "SWIF's trades program trained 142 students in 2024.",
    ]);
  });

  it("the prompt tells the model, and the fake handler skips those lines", () => {
    expect(DOCUMENT_SYSTEM_PROMPT).toMatch(/Never extract the interviewer's questions or prompts/);
    const prompt = buildDocumentPrompt({
      orgName: "SWIF",
      title: "Interview transcript",
      kind: "interview_transcript",
      chunks: [{ ref: "C1", id: "chk_1", text: TRANSCRIPT }],
    });
    expect(prompt).toMatch(/extract only what the organization's respondents state/);
    const out = fakeExtractDocumentFacts({
      purpose: "knowledge.extract_facts",
      system: "",
      prompt,
    });
    const quotes = out.facts.map((f) => f.sourceQuote);
    expect(quotes.length).toBeGreaterThan(0);
    for (const quote of quotes) {
      expect(quote).not.toMatch(/\?$|^(Interviewer|Q|Jane|Maria Lopez):/);
    }
    expect(quotes).toContain("Tom Begay: Our trades program trained 142 students in 2024.");
  });
});
