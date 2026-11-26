// Deterministic FakeLlm handlers for the matching module's LLM purposes ("matching.*").
// Must return data that satisfies the zod schema the real call uses.
//
// "matching.score": keyword overlap between the <opportunity> block of the prompt and each fact
// line of the <facts> block of the context. Reasons cite only fact ids that appear in the context.
import type { FakeHandler } from "../../ports/fake-llm";
import type { LlmRequestBase } from "../../ports/llm";
import { MATCH_SCORE_PURPOSE, type MatchScoreOutput } from "./scoring";

const STOPWORDS = new Set(
  (
    "that this with from have will their which about into they them were been more than also " +
    "other such each some most only over under within when where what while there these those " +
    "your yours ours year years program programs organization organizations grant grants " +
    "funding fund funds support project projects provide provides including include confirmed " +
    "proposed source entered staff quote unknown days away description summary eligibility " +
    "title funder status deadline applicant types scope text applicants eligible must"
  ).split(" "),
);

export function keywordTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? []) {
    const word = w.replace(/-+$/, "");
    if (word.length < 4 || STOPWORDS.has(word)) continue;
    // crude stemming so "trades"/"trade" and "training"/"train" overlap
    out.add(word.replace(/ing$|s$/, ""));
  }
  return out;
}

const section = (text: string, tag: string) =>
  text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? "";

interface IdLine {
  id: string;
  text: string;
}

function idLines(block: string, prefix: "fct" | "prj"): IdLine[] {
  const re = new RegExp(`\\b(${prefix}_[0-9a-z]+)\\b`);
  const out: IdLine[] = [];
  for (const line of block.split("\n")) {
    const m = line.match(re);
    if (m?.[1]) out.push({ id: m[1], text: line.replace(m[1], " ") });
  }
  return out;
}

function overlap(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((t) => b.has(t));
}

export function fakeMatchScore(req: LlmRequestBase): MatchScoreOutput {
  const context = req.context ?? "";
  const opp = section(req.prompt, "opportunity") || req.prompt;
  const oppTokens = keywordTokens(opp);
  const title = opp.match(/^title: (.*)$/m)?.[1]?.trim() ?? "this opportunity";
  const ceiling = Number(opp.match(/^award_ceiling_cents: (\d+)$/m)?.[1] ?? Number.NaN);
  const pre = opp.match(/^prefilter_eligibility: (\w+)/m)?.[1];
  const eligibility: MatchScoreOutput["eligibility"] =
    pre === "eligible" || pre === "likely_eligible" || pre === "ineligible" ? pre : "unknown";

  const scoredFacts = idLines(section(context, "facts"), "fct")
    .map((f) => ({ ...f, hits: overlap(keywordTokens(f.text), oppTokens) }))
    .filter((f) => f.hits.length > 0)
    .sort((a, b) => b.hits.length - a.hits.length || a.id.localeCompare(b.id));
  const strong = scoredFacts.filter((f) => f.hits.length >= 2);
  const cited = (strong.length > 0 ? strong : scoredFacts).slice(0, 3);

  const totalHits = scoredFacts.reduce((s, f) => s + f.hits.length, 0);
  const fitScore = Math.min(95, 30 + strong.length * 15 + Math.min(totalHits, 15) * 3);
  const likelihood = Math.round((fitScore / 100) * 0.3 * 100) / 100;

  const reasons: MatchScoreOutput["reasons"] = cited.map((f) => ({
    text: `Opportunity priorities (${f.hits.slice(0, 3).join(", ")}) align with the organization's stated work.`,
    polarity: "positive",
    factIds: [f.id],
  }));
  if (cited.length === 0) {
    reasons.push({
      text: `Little overlap between "${title}" and the organization's documented programs.`,
      polarity: "negative",
      factIds: [],
    });
  }
  reasons.push({
    text: "Competitive program: assume base-rate odds until the full RFP is reviewed.",
    polarity: "neutral",
    factIds: [],
  });

  const project = idLines(section(context, "projects"), "prj")
    .map((p) => ({ id: p.id, hits: overlap(keywordTokens(p.text), oppTokens).length }))
    .filter((p) => p.hits >= 2)
    .sort((a, b) => b.hits - a.hits)[0];

  return {
    eligibility,
    eligibilityNotes:
      eligibility === "unknown"
        ? "Applicant eligibility is not stated clearly; verify in the full announcement."
        : "Listed applicant types appear to include this organization; confirm in the full announcement.",
    fitScore,
    likelihood,
    suggestedAskCents: Number.isFinite(ceiling) ? Math.round(ceiling * 0.8) : null,
    effortHours: 16,
    reasons,
    projectId: project?.id ?? null,
  };
}

export const fakeHandlers: Record<string, FakeHandler> = {
  [MATCH_SCORE_PURPOSE]: fakeMatchScore,
};
