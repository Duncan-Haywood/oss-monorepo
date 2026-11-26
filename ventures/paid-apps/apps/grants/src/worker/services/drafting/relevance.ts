// Cheap, deterministic keyword relevance between a requirement section and facts. Used to decide
// whether non-narrative sections (budget / form fields) have any supporting facts, to point the
// model at project-tagged facts, and by the FakeLlm handlers.
import type { FactCategory } from "@shared/enums";

const STOPWORDS = new Set(
  (
    "a an and are as at be been but by can could did do does for from had has have how i if in into is it its " +
    "me my no not of on or our ours so than that the their them then there these they this those to too us " +
    "was we were what when where which who whom why will with would you your yours about after all also am " +
    "any because before being both each few more most other over own same should some such through under " +
    "until up very via just only per tell describe please provide include including section applicant " +
    "organization organizations proposed proposal application words word limit maximum page pages"
  ).split(" "),
);

/** Words that make a fact of a given category relevant even without literal overlap. */
const CATEGORY_TERMS: Record<FactCategory, string> = {
  identity: "organization identity background founded legal",
  mission: "mission vision values purpose background",
  history: "history background founded track record experience",
  program: "program programs services activities approach design implementation",
  population_served: "population served need community participants beneficiaries target",
  geography: "geography community region location service area need",
  outcome: "outcomes results impact evaluation success",
  metric: "metrics data results evaluation measure impact need",
  financial: "budget cost costs financial funds funding revenue sustainability match",
  staff: "staff personnel team management leadership capacity qualifications",
  governance: "governance board leadership oversight capacity",
  partner: "partners partnerships collaboration collaborators community",
  capacity: "capacity qualifications experience infrastructure management",
  project: "project approach activities plan timeline objectives goals",
  other: "",
};

/** Light stemmer: first 6 chars of a lowercased word (training/trainees/trained -> "traine"/"train"). */
const stem = (w: string) => (w.length > 6 ? w.slice(0, 6) : w).replace(/s$/, "");

export function terms(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (raw.length < 3 || STOPWORDS.has(raw)) continue;
    out.add(stem(raw));
  }
  return out;
}

export interface RelevanceFact {
  id: string;
  statement: string;
  category?: string | null;
  projectId?: string | null;
}

/** Overlap score: 1 per shared statement term, 0.5 per shared category hint term. */
export function relevanceScore(sectionTerms: ReadonlySet<string>, fact: RelevanceFact): number {
  let score = 0;
  const factTerms = terms(fact.statement);
  for (const t of factTerms) if (sectionTerms.has(t)) score += 1;
  const cat = (fact.category ?? "other") as FactCategory;
  for (const t of terms(CATEGORY_TERMS[cat] ?? "")) {
    if (sectionTerms.has(t) && !factTerms.has(t)) score += 0.5;
  }
  return score;
}

/** Facts with any relevance to the section text, best first (stable for ties). */
export function rankRelevantFacts<F extends RelevanceFact>(
  sectionText: string,
  facts: readonly F[],
  opts: { projectId?: string | null; minScore?: number } = {},
): { fact: F; score: number }[] {
  const st = terms(sectionText);
  const min = opts.minScore ?? 1;
  return facts
    .map((fact, i) => {
      let score = relevanceScore(st, fact);
      if (score > 0 && opts.projectId && fact.projectId === opts.projectId) score += 0.5;
      return { fact, score, i };
    })
    .filter((x) => x.score >= min)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(({ fact, score }) => ({ fact, score }));
}
