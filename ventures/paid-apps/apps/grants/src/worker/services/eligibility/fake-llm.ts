// Deterministic FakeLlm handlers for "eligibility.*" (tests and the offline demo).
//
// eligibility.extract_criteria: sentence-level heuristics over the <opportunity> block; every
//   sourceQuote is a verbatim span of the prompt, so it survives quote verification.
// eligibility.assess: cites the provided fact with the most keyword overlap (>= 3 content words)
//   as "met"; everything else is "unknown" with an interview question. Never invents ids.
import type { CheckStatus, CriterionKind } from "@shared/eligibility";
import type { FakeHandler } from "../../ports/fake-llm";
import type { LlmRequestBase } from "../../ports/llm";
import { ASSESS_PURPOSE, type AssessOutput } from "./assess";
import { APPLICANTS_LABEL, EXTRACT_PURPOSE, type ExtractOutput } from "./criteria";

const block = (text: string, tag: string) =>
  text.match(new RegExp(`<${tag}>\\n?([\\s\\S]*?)\\n?</${tag}>`))?.[1] ?? "";

function sentences(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?])(?<!\bU\.S\.)(?<!\be\.g\.)(?<!\bi\.e\.)\s+(?=["(\p{Lu}\d])/u)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);
}

const KIND_RULES: [CriterionKind, RegExp][] = [
  ["registration", /\bSAM\b|sam\.gov|\bUEI\b|grants\.gov|unique entity/i],
  ["cost_share", /cost[- ]shar|\bmatch(ing)?\b/i],
  [
    "years_operating",
    /\byears?\b[^.]*\b(operat|history|exist|establish)|(operat|history|establish)\w*[^.]*\byears?\b/i,
  ],
  ["budget_size", /\b(annual )?(operating )?(budget|revenue)s?\b/i],
  [
    "prior_funding_restriction",
    /\b(previously|prior|current(ly)?) (funded|grantees?|awards?)|past award/i,
  ],
  [
    "geography",
    /\b(located|location|reside|residents of|count(y|ies)|state of|region)\b|\b(New Mexico|Arizona|Utah|Colorado|Texas|Nevada)\b/i,
  ],
];
const APPLICANT_WORDS =
  /\b(eligible applicants|applicants must be|non-?profits?|tribal (governments?|organizations?)|units? of (local )?government|institutions? of higher education|organizations|entities)\b/i;
const TAX_WORDS = /501\s*\(?c\)?\s*\(?3\)?|tax[- ]exempt|\bEIN\b/i;
const POPULATION_WORDS =
  /\b(serv(e|es|ing)|youth|adults|veterans|low-income|families|participants)\b/i;
const REQUIREMENT_WORDS = /\b(must|required|requires|eligible|only|limited to)\b/i;

function classify(sentence: string): CriterionKind | null {
  for (const [kind, re] of KIND_RULES) if (re.test(sentence)) return kind;
  if (APPLICANT_WORDS.test(sentence)) return "applicant_type";
  if (TAX_WORDS.test(sentence)) return "tax_status";
  if (POPULATION_WORDS.test(sentence) && REQUIREMENT_WORDS.test(sentence)) return "population";
  return REQUIREMENT_WORDS.test(sentence) ? "other" : null;
}

export function fakeExtractCriteria(req: LlmRequestBase): ExtractOutput {
  const text = block(req.prompt, "opportunity") || req.prompt;
  const out: ExtractOutput["criteria"] = [];
  // Sections are separated by blank lines: "Eligibility:\n...", "Summary:\n..." etc.
  for (const section of text.split(/\n\s*\n/)) {
    const [head = "", ...rest] = section.split("\n");
    if (head.startsWith(APPLICANTS_LABEL)) {
      out.push({
        kind: "applicant_type",
        text: "The applicant must be one of the listed applicant types.",
        sourceQuote: head.slice(APPLICANTS_LABEL.length),
      });
      continue;
    }
    const strict = head === "Summary:" || head === "Description:";
    if (head !== "Eligibility:" && head !== "Eligibility criteria:" && !strict) continue;
    for (const line of rest) {
      for (const s of sentences(line.replace(/^- /, ""))) {
        if (strict && !/\b(must|required|eligible)\b/i.test(s)) continue;
        const kind = classify(s);
        if (kind) out.push({ kind, text: s, sourceQuote: s });
      }
    }
  }
  return { criteria: out.slice(0, 12) };
}

const STOP = new Set(
  "that this with from have will their which about into they them were been more than also must applicants applicant eligible organization organizations program programs funder requirement requirements".split(
    " ",
  ),
);

function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().match(/[a-z0-9][a-z0-9()-]{3,}/g) ?? []) {
    if (!STOP.has(w)) out.add(w.replace(/(ing|s)$/, ""));
  }
  return out;
}

export function fakeAssess(req: LlmRequestBase): AssessOutput {
  const facts = block(req.context ?? "", "facts")
    .split("\n")
    .flatMap((line) => {
      const m = line.match(/^\[(fct_[0-9a-z]+)\]\s*\([^)]*\)\s*(.*?)(?: — source:.*)?$/);
      return m?.[1] ? [{ id: m[1], words: tokens(m[2] ?? "") }] : [];
    });
  const assessments: AssessOutput["assessments"] = [];
  for (const line of block(req.prompt, "criteria").split("\n")) {
    const m = line.match(/^\[(c\d+)\]\s*\((\w+)\)\s*(.*)$/);
    if (!m?.[1]) continue;
    const want = tokens(m[3] ?? "");
    let best: { id: string; hits: number } | null = null;
    for (const f of facts) {
      const hits = [...want].filter((w) => f.words.has(w)).length;
      if (hits >= 3 && (!best || hits > best.hits)) best = { id: f.id, hits };
    }
    const status: CheckStatus = best ? "met" : "unknown";
    assessments.push({
      criterionId: m[1],
      status,
      reason: best
        ? "A fact in the fact base addresses this requirement."
        : "Nothing in the profile or fact base settles this requirement.",
      evidence: best ? [best.id] : [],
      question: null,
    });
  }
  return { assessments };
}

export const fakeHandlers: Record<string, FakeHandler> = {
  [EXTRACT_PURPOSE]: fakeExtractCriteria,
  [ASSESS_PURPOSE]: fakeAssess,
};
