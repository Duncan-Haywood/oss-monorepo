// Stage 2 of matching: cheap embedding similarity between an opportunity and an org summary,
// used to pick which prefiltered opportunities deserve an LLM scoring call. Pure helpers.

export const MAX_EMBED_CHARS = 2_000;

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface OpportunityText {
  title: string;
  funderName: string;
  summary: string;
  description: string;
  eligibilityText: string;
  categories: string[];
  keywords: string[];
}

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s);

export function opportunityEmbeddingText(o: OpportunityText): string {
  return clip(
    [
      o.title,
      o.funderName,
      o.categories.join(", "),
      o.keywords.join(", "),
      o.summary,
      o.description,
      o.eligibilityText,
    ]
      .filter(Boolean)
      .join("\n"),
    MAX_EMBED_CHARS,
  );
}

export interface OrgSummaryInput {
  focusAreas: string[];
  serviceAreas: string[];
  projects: { title: string; summary: string }[];
  /** Statements of the org's top confirmed facts (mission, programs, population...). */
  factStatements: string[];
}

export function orgEmbeddingText(o: OrgSummaryInput): string {
  return clip(
    [
      o.focusAreas.length ? `Focus areas: ${o.focusAreas.join(", ")}` : "",
      o.serviceAreas.length ? `Service areas: ${o.serviceAreas.join(", ")}` : "",
      ...o.projects.map((p) => `${p.title}: ${p.summary}`),
      ...o.factStatements,
    ]
      .filter(Boolean)
      .join("\n"),
    MAX_EMBED_CHARS * 2,
  );
}

/** Fact categories most indicative of mission fit, in priority order for the org summary. */
export const SUMMARY_FACT_CATEGORIES = [
  "mission",
  "program",
  "population_served",
  "geography",
  "outcome",
  "project",
  "capacity",
  "history",
] as const;

export function topSummaryFacts<T extends { statement: string; category: string; status?: string }>(
  facts: T[],
  limit = 15,
): string[] {
  const rank = (c: string) => {
    const i = (SUMMARY_FACT_CATEGORIES as readonly string[]).indexOf(c);
    return i === -1 ? SUMMARY_FACT_CATEGORIES.length : i;
  };
  const confirmed = facts.filter((f) => f.status === undefined || f.status === "confirmed");
  const pool = confirmed.length > 0 ? confirmed : facts;
  return [...pool]
    .sort((a, b) => rank(a.category) - rank(b.category))
    .slice(0, limit)
    .map((f) => f.statement);
}
