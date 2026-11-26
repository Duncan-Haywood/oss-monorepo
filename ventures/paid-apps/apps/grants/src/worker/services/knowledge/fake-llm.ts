// Deterministic FakeLlm handlers for the knowledge module's LLM purposes ("knowledge.*").
// Must return data that satisfies the zod schema the real call uses. The fakes are always grounded:
// every sourceQuote is an exact sentence of the chunk / respondent turn it cites.
import type { FactCategory } from "@shared/enums";
import type { FakeHandler } from "../../ports/fake-llm";
import type { LlmRequestBase } from "../../ports/llm";
import {
  type DocumentExtraction,
  type InterviewExtraction,
  interviewerLabelsFromTranscript,
  isQuestionOrInterviewerLine,
  PURPOSE_EXTRACT_DOCUMENT,
  PURPOSE_EXTRACT_INTERVIEW,
} from "./extract";
import { splitSentences } from "./text";

const KEYWORDS: [RegExp, FactCategory][] = [
  [/\bmission\b|\bvision\b|\bdedicated to\b|\bpurpose\b/i, "mission"],
  [/\bfounded\b|\bestablished\b|\bsince \d{4}\b|\bhistory\b|\bincorporated\b/i, "history"],
  [/\bbudget\b|\brevenue\b|\$\s?\d|\bfunding\b|\bexpenses?\b|\baudit/i, "financial"],
  [
    /\bgraduat|\bcompleted\b|\bplaced\b|\bemployed\b|\bcertif|\boutcomes?\b|\bpercent\b|%/i,
    "outcome",
  ],
  [/\bboard\b|\bgovern|\bbylaws\b|\btrustees?\b/i, "governance"],
  [/\bpartner|\bcollaborat|\bin partnership\b/i, "partner"],
  [/\bstaff\b|\bemployees\b|\bvolunteers?\b|\binstructors?\b|\bdirector\b/i, "staff"],
  [
    /\breservation\b|\bcounty\b|\bchapters?\b|\bregion\b|\bnew mexico\b|\barizona\b|\bgallup\b/i,
    "geography",
  ],
  [
    /\bserve[sd]?\b|\bfamilies\b|\bstudents\b|\byouth\b|\belders\b|\bparticipants\b|\bclients\b/i,
    "population_served",
  ],
  [/\bprograms?\b|\btraining\b|\bservices?\b|\bworkshops?\b|\bcourses?\b|\bapprentice/i, "program"],
  [/\bproject\b|\bwill (?:build|create|expand|launch)\b|\bplan(?:s|ned)? to\b/i, "project"],
];

const TRIGGER =
  /\d|\b(mission|serve[sd]?|program|founded|established|budget|students|graduates?|trainees?|partners?|board|staff|families|youth|elders|annual|since)\b/i;

function categorize(sentence: string): FactCategory {
  for (const [re, cat] of KEYWORDS) if (re.test(sentence)) return cat;
  return "other";
}

function orgNameOf(prompt: string): string {
  return /^Organization: (.+)$/m.exec(prompt)?.[1]?.trim() || "The organization";
}

/** Rewrite first-person openings so statements are third person and name the org. */
function toStatement(sentence: string, org: string): string {
  const s = sentence
    .replace(/^We\b/, org)
    .replace(/^Our\b/, `${org}'s`)
    .replace(/^The (organization|foundation)\b/i, org);
  return s.includes(org) ? s : `${org}: ${s}`;
}

function factValueOf(sentence: string): DocumentExtraction["facts"][number]["value"] {
  const year = /\b(19\d{2}|20\d{2})\b/.exec(sentence)?.[1];
  const withoutYears = sentence.replace(/\b(19|20)\d{2}\b/g, " ");
  const num = /(\$)?\s?(\d[\d,]*(?:\.\d+)?)\s*(%|percent)?/.exec(withoutYears);
  if (!num && !year) return null;
  const n = num?.[2] ? Number(num[2].replace(/,/g, "")) : null;
  const unit = num ? (num[1] ? "USD" : num[3] ? "percent" : null) : null;
  return {
    number: n != null && Number.isFinite(n) ? n : null,
    unit,
    year: year ? Number(year) : null,
    text: null,
  };
}

/** "No change", "nothing new": check-in answers that are never facts. */
const NO_CHANGE =
  /^(?:no\s+(?:real\s+)?changes?|nothing\s+(?:new|has\s+changed|changed)|same\s+as\s+(?:before|last))\b/i;

/** Candidate fact sentences; questions and interviewer lines are never facts. */
function pickSentences(text: string, max: number, interviewerLabels: string[] = []): string[] {
  return splitSentences(text)
    .filter((s) => s.length >= 20 && s.length <= 600 && TRIGGER.test(s) && !NO_CHANGE.test(s))
    .filter((s) => !isQuestionOrInterviewerLine(s, s, interviewerLabels))
    .slice(0, max);
}

function blocks(prompt: string, tag: "chunk" | "turn") {
  const re =
    tag === "chunk"
      ? /<chunk ref="([^"]+)"[^>]*>\n([\s\S]*?)\n<\/chunk>/g
      : /<turn ref="([^"]+)" role="([^"]+)">\n([\s\S]*?)\n<\/turn>/g;
  return [...prompt.matchAll(re)].map((m) =>
    tag === "chunk"
      ? { ref: m[1] ?? "", role: "respondent", text: m[2] ?? "" }
      : { ref: m[1] ?? "", role: m[2] ?? "", text: m[3] ?? "" },
  );
}

export const fakeExtractDocumentFacts = (req: LlmRequestBase): DocumentExtraction => {
  const org = orgNameOf(req.prompt);
  const facts: DocumentExtraction["facts"] = [];
  const chunks = blocks(req.prompt, "chunk");
  const labels = /\(kind: interview_transcript\)/.test(req.prompt)
    ? interviewerLabelsFromTranscript(chunks.map((c) => c.text).join("\n"))
    : [];
  for (const c of chunks) {
    for (const s of pickSentences(c.text, 6, labels)) {
      const value = factValueOf(s);
      facts.push({
        chunkRef: c.ref,
        category: categorize(s),
        statement: toStatement(s, org),
        value,
        asOf: value?.year != null ? String(value.year) : null,
        sourceQuote: s,
        sensitivity: "internal",
        confidence: 0.8,
      });
    }
  }
  return { facts };
};

export const fakeExtractInterviewFacts = (req: LlmRequestBase): InterviewExtraction => {
  const org = orgNameOf(req.prompt);
  const hasFocus = /^Focus project: /m.test(req.prompt);
  const facts: InterviewExtraction["facts"] = [];
  for (const t of blocks(req.prompt, "turn")) {
    if (t.role !== "respondent") continue;
    let picked = pickSentences(t.text, 4);
    if (picked.length === 0) {
      const first = splitSentences(t.text)[0];
      if (
        first &&
        first.length >= 25 &&
        !NO_CHANGE.test(first) &&
        !isQuestionOrInterviewerLine(first, first)
      )
        picked = [first];
    }
    for (const s of picked) {
      const value = factValueOf(s);
      facts.push({
        turnRef: t.ref,
        category: categorize(s),
        statement: toStatement(s, org),
        value,
        asOf: value?.year != null ? String(value.year) : null,
        sourceQuote: s,
        sensitivity: "internal",
        confidence: 0.7,
        aboutFocusProject: hasFocus,
      });
    }
  }
  return { facts };
};

export const fakeHandlers: Record<string, FakeHandler> = {
  [PURPOSE_EXTRACT_DOCUMENT]: fakeExtractDocumentFacts,
  [PURPOSE_EXTRACT_INTERVIEW]: fakeExtractInterviewFacts,
};
