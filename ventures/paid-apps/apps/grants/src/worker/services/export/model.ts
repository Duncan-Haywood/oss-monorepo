// Export view model: one cleaned, numbered, counted representation of an application version that
// the DOCX, HTML and plain-text renderers all draw from, so the three formats never disagree on
// word counts or citation numbers. Pure functions only.
//
// Anti-fabrication: exports contain only the org's human-entered identity fields, the stored
// version's claims (verbatim), the funder's published prompts and the cited facts. Nothing is
// generated here.
import type {
  ApplicationContent,
  DraftSection,
  OpportunityRequirements,
  RequirementSection,
} from "@shared/content";
import { countWords, renderSectionText } from "../submission/package";
import { buildExportBudget, type ExportBudget, type ExportBudgetInput } from "./budget";
import { cleanText } from "./text";

export interface ExportOptions {
  /** Numbered [n] markers after cited claims + an appendix of fact statements and source quotes. */
  citations?: boolean;
  /** Internal reviewer cover page (executive summary + key points). Off by default. */
  cover?: boolean;
  /**
   * "funder": the copy a funder receives (email attachments). Only org identity, the opportunity
   * header and the section answers: no citations, cover page, word counts, gaps or draft details.
   */
  audience?: "internal" | "funder";
}

/** Title-page wording. Defaults describe an application. */
export interface ExportLabels {
  /** Subtitle under the title; null = "Application to <funder>". */
  subtitle: string | null;
  opportunity: string;
  deadline: string;
  amount: string;
}

const DEFAULT_LABELS: ExportLabels = {
  subtitle: null,
  opportunity: "Opportunity",
  deadline: "Deadline",
  amount: "Requested amount",
};

export interface ExportInput {
  generatedAt: Date;
  org: { legalName: string; dba: string | null; ein: string | null; uei: string | null };
  application: {
    id: string;
    title: string;
    requestedAmountCents: number | null;
    deadline: Date | null;
  };
  opportunity: {
    title: string;
    funderName: string;
    opportunityNumber: string | null;
    closeDate: Date | null;
  };
  /** The funder's requirements (prompts and limits), matched to drafted sections by key. */
  requirements: OpportunityRequirements | null;
  /** Title-page wording for documents that aren't applications (e.g. post-award reports). */
  labels?: Partial<ExportLabels>;
  version: {
    id: string;
    versionNumber: number;
    content: ApplicationContent;
    executiveSummary: string;
    keyPoints: string[];
  };
  /** Facts cited by the version (any order; unknown ids render as "no longer available"). */
  facts: { id: string; statement: string; sourceQuote: string }[];
  /** The saved application budget (rendered as a table after the sections). */
  budget?: ExportBudgetInput | null;
}

/** One claim's text plus the citation numbers to print after it (empty when citations are off). */
export interface ExportRun {
  text: string;
  cites: number[];
}

export interface ExportSection {
  key: string;
  title: string;
  /** The funder's question ("" when unknown). */
  prompt: string;
  paragraphs: ExportRun[][];
  /** Portal-ready answer: claims joined into paragraphs, no citation markers. */
  text: string;
  wordCount: number;
  /** UTF-16 length, as a portal's `maxlength` counts it (never under-counts). */
  charCount: number;
  wordLimit: number | null;
  charLimit: number | null;
  overWordLimit: boolean;
  overCharLimit: boolean;
  /** Questions the drafter could not answer from facts (left blank on purpose). */
  gaps: string[];
}

export interface ExportCitation {
  n: number;
  factId: string;
  /** null when the fact no longer exists (e.g. deleted after drafting). */
  statement: string | null;
  sourceQuote: string;
}

export interface ExportModel {
  /** Funder-facing copy (see ExportOptions.audience). */
  funder: boolean;
  generatedAt: Date;
  title: string;
  org: { legalName: string; dba: string; ein: string; uei: string };
  funderName: string;
  opportunityTitle: string;
  opportunityNumber: string;
  deadline: Date | null;
  requestedAmountCents: number | null;
  versionNumber: number;
  labels: ExportLabels;
  /** Present only with `cover: true`. */
  cover: { executiveSummary: string; keyPoints: string[] } | null;
  sections: ExportSection[];
  /** Present only with `citations: true`. */
  citations: ExportCitation[] | null;
  /** The budget tables, or null when no budget lines are saved. */
  budget: ExportBudget | null;
  totalWords: number;
}

const one = (s: string | null | undefined) => cleanText(s).trim();

/** Fact id -> [n], numbered by first appearance in reading order (same as the review UI). */
export function numberCitations(content: ApplicationContent): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const s of content.sections)
    for (const p of s.paragraphs)
      for (const c of p.claims)
        for (const id of c.factIds) if (!numbers.has(id)) numbers.set(id, numbers.size + 1);
  return numbers;
}

/** The section with every claim's text cleaned and trimmed (empty claims dropped). */
function cleanSection(s: DraftSection): DraftSection {
  return {
    ...s,
    paragraphs: s.paragraphs.map((p) => ({
      ...p,
      claims: p.claims.map((c) => ({ ...c, text: one(c.text) })).filter((c) => c.text),
    })),
  };
}

export function buildExportModel(input: ExportInput, options: ExportOptions = {}): ExportModel {
  const { version } = input;
  const funder = options.audience === "funder";
  const withCitations = !funder && !!options.citations;
  const reqByKey = new Map<string, RequirementSection>(
    (input.requirements?.sections ?? []).map((r) => [r.key, r]),
  );
  const numbers = withCitations ? numberCitations(version.content) : new Map<string, number>();

  const sections: ExportSection[] = version.content.sections.map((raw) => {
    const s = cleanSection(raw);
    const req = reqByKey.get(s.key);
    const paragraphs = s.paragraphs
      .map((p) =>
        p.claims.map((c) => ({
          text: c.text,
          cites: [
            ...new Set(c.factIds.map((id) => numbers.get(id)).filter((n) => n !== undefined)),
          ],
        })),
      )
      .filter((runs) => runs.length > 0);
    const text = renderSectionText(s);
    const wordCount = countWords(text);
    const charCount = text.length;
    const wordLimit = req?.wordLimit ?? null;
    const charLimit = req?.charLimit ?? null;
    return {
      key: s.key,
      title: one(s.title) || one(req?.title) || s.key,
      prompt: one(req?.prompt),
      paragraphs,
      text,
      wordCount,
      charCount,
      wordLimit,
      charLimit,
      overWordLimit: wordLimit !== null && wordCount > wordLimit,
      overCharLimit: charLimit !== null && charCount > charLimit,
      gaps: (s.gaps ?? []).map((g) => one(g.question)).filter(Boolean),
    };
  });

  let citations: ExportCitation[] | null = null;
  if (withCitations) {
    const factById = new Map(input.facts.map((f) => [f.id, f]));
    citations = [...numbers].map(([factId, n]) => {
      const fact = factById.get(factId);
      return {
        n,
        factId,
        statement: fact ? one(fact.statement) : null,
        sourceQuote: fact ? one(fact.sourceQuote) : "",
      };
    });
  }

  return {
    funder,
    generatedAt: input.generatedAt,
    title: one(input.application.title) || "Grant application",
    org: {
      legalName: one(input.org.legalName),
      dba: one(input.org.dba),
      ein: one(input.org.ein),
      uei: one(input.org.uei),
    },
    funderName: one(input.opportunity.funderName),
    opportunityTitle: one(input.opportunity.title),
    opportunityNumber: one(input.opportunity.opportunityNumber),
    deadline: input.application.deadline ?? input.opportunity.closeDate,
    requestedAmountCents: input.application.requestedAmountCents,
    versionNumber: version.versionNumber,
    labels: { ...DEFAULT_LABELS, ...input.labels },
    cover:
      !funder && options.cover
        ? {
            executiveSummary: one(version.executiveSummary),
            keyPoints: version.keyPoints.map(one).filter(Boolean),
          }
        : null,
    sections,
    citations,
    budget: buildExportBudget(input.budget, funder),
    totalWords: sections.reduce((n, s) => n + s.wordCount, 0),
  };
}

/** "Word count: 412 / 500" (or "Word count: 412" without a limit). */
export function wordCountLabel(s: ExportSection): string {
  return `Word count: ${s.wordCount}${s.wordLimit !== null ? ` / ${s.wordLimit}` : ""}`;
}

/** "Characters: 2,310 / 3,000", only when the funder set a character limit. */
export function charCountLabel(s: ExportSection): string | null {
  return s.charLimit !== null
    ? `Characters: ${s.charCount.toLocaleString("en-US")} / ${s.charLimit.toLocaleString("en-US")}`
    : null;
}

/** Splits a free-text block (executive summary) into paragraphs on blank lines. */
export const paragraphsOf = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

/** Citation marker text for a run: " [1][3]" (empty without citations). */
export const markerText = (cites: number[]) => cites.map((n) => `[${n}]`).join("");
